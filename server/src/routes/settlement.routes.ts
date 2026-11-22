import { Router, Request, Response } from 'express';
import { getDbClient } from '../db/client.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { calculateCycleSettlement } from '../services/settlement.service.js';
import { filsToAed } from '../utils/money.js';
import { isValidUuid, sanitizeText } from '../utils/sanitize.js';

export const settlementRouter = Router();

/**
 * GET /api/settlement/current
 * Computes live, dynamic settlement matrix for the current open cycle.
 */
settlementRouter.get('/current', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();
    const cycleRes = await db.query(
      `SELECT id, cycle_code FROM billing_cycles WHERE status = 'open' LIMIT 1;`
    );

    if (cycleRes.rowCount === 0) {
      res.status(404).json({ error: 'No active open billing cycle found.' });
      return;
    }

    const cycleId = cycleRes.rows[0].id;
    const matrix = await calculateCycleSettlement(cycleId);

    const formattedMembers = matrix.memberSummaries.map((m) => ({
      userId: m.userId,
      userName: m.userName,
      role: m.role,
      openingCreditFils: m.openingCreditFils,
      openingCreditAed: filsToAed(m.openingCreditFils),
      poolObligationsFils: m.poolObligationsFils,
      poolObligationsAed: filsToAed(m.poolObligationsFils),
      outOfPocketPaidFils: m.outOfPocketPaidFils,
      outOfPocketPaidAed: filsToAed(m.outOfPocketPaidFils),
      netPayableFils: m.netPayableFils,
      netPayableAed: filsToAed(m.netPayableFils),
      netBalanceFils: m.netBalanceFils,
      netBalanceAed: filsToAed(m.netBalanceFils),
      position: m.netPayableFils < 0 ? 'CREDIT' : m.netPayableFils > 0 ? 'DEBT' : 'SETTLED',
      nextCycleOpeningCreditFils: m.nextCycleOpeningCreditFils,
      nextCycleOpeningCreditAed: filsToAed(m.nextCycleOpeningCreditFils),
    }));

    res.status(200).json({
      cycleCode: matrix.cycleCode,
      cycleId: matrix.cycleId,
      totalExpensesFils: matrix.totalExpensesFils,
      totalExpensesAed: filsToAed(matrix.totalExpensesFils),
      poolBreakdowns: matrix.poolBreakdowns,
      members: formattedMembers,
      invariantCheck: matrix.invariantCheck,
    });
  } catch (err: any) {
    console.error('Error computing live settlement:', err);
    res.status(500).json({ error: 'Failed to compute settlement matrix.' });
  }
});

/**
 * GET /api/settlement/history
 * Returns past closed cycles and their settlement snapshots.
 */
settlementRouter.get('/history', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();

    const closedCyclesRes = await db.query(
      `SELECT bc.id, bc.cycle_code, bc.start_date, bc.end_date, bc.status, 
              bc.total_expense_fils, bc.closed_at, u.name as closed_by_user_name
       FROM billing_cycles bc
       LEFT JOIN users u ON u.id = bc.closed_by_user_id
       WHERE bc.status IN ('closed', 'settled')
       ORDER BY bc.cycle_code DESC;`
    );

    const historyWithSnapshots = [];

    for (const cycle of closedCyclesRes.rows) {
      const snapshotsRes = await db.query(
        `SELECT ss.id, ss.user_id, u.name as user_name, u.role,
                ss.net_payable_fils, ss.net_balance_fils, ss.status,
                ss.settlement_notes, ss.settled_at
         FROM settlement_snapshots ss
         JOIN users u ON u.id = ss.user_id
         WHERE ss.billing_cycle_id = $1
         ORDER BY u.name;`,
        [cycle.id]
      );

      historyWithSnapshots.push({
        cycle: {
          id: cycle.id,
          cycleCode: cycle.cycle_code,
          startDate: cycle.start_date,
          endDate: cycle.end_date,
          totalExpenseFils: Number(cycle.total_expense_fils),
          totalExpenseAed: filsToAed(Number(cycle.total_expense_fils)),
          closedAt: cycle.closed_at,
          closedByName: cycle.closed_by_user_name,
        },
        snapshots: snapshotsRes.rows.map((s) => ({
          ...s,
          netPayableAed: filsToAed(s.net_payable_fils),
          netBalanceAed: filsToAed(s.net_balance_fils),
        })),
      });
    }

    res.status(200).json({ history: historyWithSnapshots });
  } catch (err: any) {
    console.error('Error fetching settlement history:', err);
    res.status(500).json({ error: 'Failed to retrieve settlement history.' });
  }
});

/**
 * PATCH /api/settlement/snapshots/:id/status
 * Admin only. Marks a closed cycle's member settlement as 'settled' or 'pending'.
 */
settlementRouter.patch(
  '/snapshots/:id/status',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { status, notes } = req.body;
    const snapshotId = req.params.id;

    if (!isValidUuid(snapshotId)) {
      res.status(400).json({ error: 'Invalid snapshot ID.' });
      return;
    }

    if (status !== 'settled' && status !== 'pending') {
      res.status(400).json({ error: "Status must be either 'settled' or 'pending'." });
      return;
    }

    const cleanNotes = notes ? sanitizeText(notes, 500) : null;

    try {
      const db = await getDbClient();
      const updateRes = await db.query(
        `UPDATE settlement_snapshots
         SET status = $1,
             settlement_notes = COALESCE($2, settlement_notes),
             settled_at = CASE WHEN $1 = 'settled' THEN CURRENT_TIMESTAMP ELSE settled_at END,
             settled_by_user_id = $3
         WHERE id = $4
         RETURNING id, billing_cycle_id, user_id, status, settlement_notes, settled_at;`,
        [status, cleanNotes, req.user!.id, snapshotId]
      );

      if (updateRes.rowCount === 0) {
        res.status(404).json({ error: 'Settlement snapshot not found.' });
        return;
      }

      res.status(200).json({
        message: `Settlement marked as ${status}.`,
        snapshot: updateRes.rows[0],
      });
    } catch (err: any) {
      console.error('Error updating settlement status:', err);
      res.status(500).json({ error: 'Failed to update settlement status.' });
    }
  }
);
