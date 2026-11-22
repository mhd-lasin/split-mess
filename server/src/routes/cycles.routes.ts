import { Router, Request, Response } from 'express';
import { getDbClient } from '../db/client.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { calculateCycleSettlement } from '../services/settlement.service.js';
import { filsToAed } from '../utils/money.js';

export const cyclesRouter = Router();

/**
 * GET /api/cycles/current
 * Returns the active open billing cycle, total expenses, and pool breakdown.
 */
cyclesRouter.get('/current', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const cycleRes = await db.query(
      `SELECT id, cycle_code, start_date, end_date, status, total_expense_fils
       FROM billing_cycles 
       WHERE status = 'open' 
       ORDER BY created_at DESC 
       LIMIT 1;`
    );

    if (cycleRes.rowCount === 0) {
      res.status(404).json({ error: 'No active open billing cycle found.' });
      return;
    }

    const cycle = cycleRes.rows[0];

    // Compute live pool breakdown using separate subqueries to avoid JOIN Cartesian fan-out
    const poolTotalsRes = await db.query(
      `SELECT ep.id as pool_id, ep.code, ep.name,
              COALESCE(exp_agg.pool_total_fils, 0)::BIGINT as pool_total_fils,
              COALESCE(mem_agg.enrolled_count, 0)::INT as enrolled_count
       FROM expense_pools ep
       LEFT JOIN (
         SELECT pool_id, SUM(amount_fils) as pool_total_fils
         FROM expenses
         WHERE billing_cycle_id = $1
         GROUP BY pool_id
       ) exp_agg ON exp_agg.pool_id = ep.id
       LEFT JOIN (
         SELECT pm.pool_id, COUNT(DISTINCT pm.user_id) as enrolled_count
         FROM pool_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.is_active = true AND u.is_active = true
         GROUP BY pm.pool_id
       ) mem_agg ON mem_agg.pool_id = ep.id
       WHERE ep.is_active = true
       ORDER BY ep.code;`,
      [cycle.id]
    );

    const liveTotalFils = poolTotalsRes.rows.reduce((sum, p) => sum + Number(p.pool_total_fils), 0);

    res.status(200).json({
      cycle: {
        id: cycle.id,
        cycleCode: cycle.cycle_code,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        status: cycle.status,
        totalExpenseFils: liveTotalFils,
        totalExpenseAed: filsToAed(liveTotalFils),
      },
      pools: poolTotalsRes.rows.map((p) => ({
        id: p.pool_id,
        code: p.code,
        name: p.name,
        totalFils: Number(p.pool_total_fils),
        totalAed: filsToAed(Number(p.pool_total_fils)),
        enrolledCount: Number(p.enrolled_count),
      })),
    });
  } catch (err: any) {
    console.error('Error fetching current cycle:', err);
    res.status(500).json({ error: 'Failed to retrieve current cycle.' });
  }
});

/**
 * POST /api/cycles/close
 * Admin only. Atomically runs settlement engine, creates snapshots, closes cycle,
 * opens next cycle ('YYYY-MM'), and rolls over credits & unpaid debts to member_balances.
 */
cyclesRouter.post('/close', authenticateToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();

    // 1. Fetch current open cycle
    const currentRes = await db.query(
      `SELECT id, cycle_code, start_date, end_date FROM billing_cycles WHERE status = 'open' LIMIT 1;`
    );

    if (currentRes.rowCount === 0) {
      res.status(400).json({ error: 'No open cycle to close.' });
      return;
    }

    const currentCycle = currentRes.rows[0];
    const currentCycleId = currentCycle.id;

    // 2. Calculate Settlement Matrix
    const matrix = await calculateCycleSettlement(currentCycleId);

    // 3. Determine next cycle code ('YYYY-MM')
    const [yearStr, monthStr] = currentCycle.cycle_code.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const nextCycleCode = `${year}-${month.toString().padStart(2, '0')}`;
    const nextStartDate = `${nextCycleCode}-01`;
    const nextEndDate = new Date(year, month, 0).toISOString().split('T')[0];

    // 4. Execute all state mutations atomically in a transaction
    await db.transaction(async (tx) => {
      // Persist working member_balances and immutable settlement_snapshots
      for (const summary of matrix.memberSummaries) {
        await tx.query(
          `INSERT INTO member_balances (
             billing_cycle_id, user_id, 
             opening_credit_fils, pool_share_fils, 
             paid_out_of_pocket_fils, net_payable_fils, 
             net_balance_fils, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
           ON CONFLICT (billing_cycle_id, user_id) DO UPDATE SET
             pool_share_fils = EXCLUDED.pool_share_fils,
             paid_out_of_pocket_fils = EXCLUDED.paid_out_of_pocket_fils,
             net_payable_fils = EXCLUDED.net_payable_fils,
             net_balance_fils = EXCLUDED.net_balance_fils,
             updated_at = CURRENT_TIMESTAMP;`,
          [
            matrix.cycleId,
            summary.userId,
            summary.openingCreditFils,
            summary.poolObligationsFils,
            summary.outOfPocketPaidFils,
            summary.netPayableFils,
            summary.netBalanceFils,
          ]
        );

        await tx.query(
          `INSERT INTO settlement_snapshots (
             billing_cycle_id, user_id, 
             net_payable_fils, net_balance_fils, 
             status, settlement_notes, settled_at, settled_by_user_id
           )
           VALUES ($1, $2, $3, $4, 'pending', $5, CURRENT_TIMESTAMP, $6)
           ON CONFLICT (billing_cycle_id, user_id) DO UPDATE SET
             net_payable_fils = EXCLUDED.net_payable_fils,
             net_balance_fils = EXCLUDED.net_balance_fils,
             settled_at = CURRENT_TIMESTAMP,
             settled_by_user_id = EXCLUDED.settled_by_user_id;`,
          [
            matrix.cycleId,
            summary.userId,
            summary.netPayableFils,
            summary.netBalanceFils,
            `Snapshot for ${matrix.cycleCode}: Share ${filsToAed(summary.poolObligationsFils)} AED, Paid ${filsToAed(summary.outOfPocketPaidFils)} AED`,
            req.user!.id,
          ]
        );
      }

      // Close current cycle and sync total_expense_fils
      await tx.query(
        `UPDATE billing_cycles 
         SET status = 'closed', total_expense_fils = $1, closed_at = CURRENT_TIMESTAMP, closed_by_user_id = $2 
         WHERE id = $3;`,
        [matrix.totalExpensesFils, req.user!.id, currentCycleId]
      );

      // Open next cycle
      const nextCycleRes = await tx.query(
        `INSERT INTO billing_cycles (cycle_code, start_date, end_date, status, total_expense_fils)
         VALUES ($1, $2, $3, 'open', 0)
         RETURNING id, cycle_code;`,
        [nextCycleCode, nextStartDate, nextEndDate]
      );
      const nextCycleId = nextCycleRes.rows[0].id;

      // Rollover opening balances (positive = credit, negative = unpaid debt)
      for (const summary of matrix.memberSummaries) {
        await tx.query(
          `INSERT INTO member_balances (
             billing_cycle_id, user_id, 
             opening_credit_fils, opening_balance_fils,
             pool_share_fils, paid_out_of_pocket_fils, 
             net_payable_fils, net_balance_fils
           )
           VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
           ON CONFLICT (billing_cycle_id, user_id) DO UPDATE SET
             opening_credit_fils = EXCLUDED.opening_credit_fils,
             opening_balance_fils = EXCLUDED.opening_balance_fils;`,
          [
            nextCycleId,
            summary.userId,
            summary.nextCycleOpeningCreditFils,
            -summary.netPayableFils, // positive if credit, negative if unpaid debt
            summary.netPayableFils > 0 ? summary.netPayableFils : 0,
            -summary.netPayableFils,
          ]
        );
      }
    });

    res.status(200).json({
      message: `Cycle ${currentCycle.cycle_code} successfully settled and closed. Opened cycle ${nextCycleCode}.`,
      closedCycleCode: currentCycle.cycle_code,
      nextCycleCode,
      settledMembersCount: matrix.memberSummaries.length,
      totalExpensesAed: filsToAed(matrix.totalExpensesFils),
    });
  } catch (err: any) {
    console.error('Error closing cycle:', err);
    res.status(500).json({ error: 'Failed to close billing cycle.' });
  }
});
