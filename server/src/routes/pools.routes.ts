import { Router, Request, Response } from 'express';
import { getDbClient } from '../db/client.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { filsToAed } from '../utils/money.js';
import { isValidUuid } from '../utils/sanitize.js';

export const poolsRouter = Router();

/**
 * GET /api/pools
 * Returns all active expense pools with their enrolled active members and current cycle totals.
 */
poolsRouter.get('/', authenticateToken, async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDbClient();

    const poolsRes = await db.query(
      `SELECT id, code, name, description FROM expense_pools WHERE is_active = true ORDER BY code;`
    );

    const membersRes = await db.query(
      `SELECT pm.pool_id, u.id as user_id, u.name as user_name, u.role
       FROM pool_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.is_active = true AND u.is_active = true
       ORDER BY u.name;`
    );

    // Fetch current open cycle totals per pool (without join fan-out)
    const totalsByPool: Record<string, number> = {};
    const openCycleRes = await db.query(
      `SELECT id FROM billing_cycles WHERE status = 'open' ORDER BY created_at DESC LIMIT 1;`
    );
    if (openCycleRes.rowCount > 0) {
      const cycleId = openCycleRes.rows[0].id;
      const totalsRes = await db.query(
        `SELECT pool_id, COALESCE(SUM(amount_fils), 0)::BIGINT as total_fils
         FROM expenses
         WHERE billing_cycle_id = $1
         GROUP BY pool_id;`,
        [cycleId]
      );
      for (const row of totalsRes.rows) {
        totalsByPool[row.pool_id] = Number(row.total_fils);
      }
    }

    const membersByPool: Record<string, any[]> = {};
    for (const row of membersRes.rows) {
      if (!membersByPool[row.pool_id]) {
        membersByPool[row.pool_id] = [];
      }
      membersByPool[row.pool_id].push({
        id: row.user_id,
        name: row.user_name,
        role: row.role,
      });
    }

    const poolsWithMembers = poolsRes.rows.map((p) => {
      const totalFils = totalsByPool[p.id] || 0;
      const members = membersByPool[p.id] || [];
      return {
        ...p,
        members,
        memberCount: members.length,
        enrolledCount: members.length,
        totalFils,
        totalAed: filsToAed(totalFils),
      };
    });

    res.status(200).json({ pools: poolsWithMembers });
  } catch (err: any) {
    console.error('Error fetching pools:', err);
    res.status(500).json({ error: 'Failed to retrieve pools.' });
  }
});

/**
 * PUT /api/pools/:poolId/members/:userId
 * Admin only. Enrolls or removes a roommate from a specific expense pool.
 * Body: { isActive: boolean }
 */
poolsRouter.put(
  '/:poolId/members/:userId',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { poolId, userId } = req.params;
    const { isActive } = req.body;

    if (!isValidUuid(poolId) || !isValidUuid(userId)) {
      res.status(400).json({ error: 'Invalid poolId or userId.' });
      return;
    }

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive boolean is required.' });
      return;
    }

    try {
      const db = await getDbClient();

      // Prevent removing the last member if the pool already has expenses in the open cycle
      if (!isActive) {
        const activeCountRes = await db.query(
          `SELECT COUNT(*)::int as cnt
           FROM pool_members pm
           JOIN users u ON u.id = pm.user_id
           WHERE pm.pool_id = $1 AND pm.is_active = true AND u.is_active = true AND pm.user_id != $2;`,
          [poolId, userId]
        );
        if ((activeCountRes.rows[0]?.cnt || 0) === 0) {
          res.status(400).json({ error: 'A pool must have at least one active member.' });
          return;
        }
      }

      await db.query(
        `INSERT INTO pool_members (pool_id, user_id, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (pool_id, user_id) DO UPDATE SET is_active = EXCLUDED.is_active;`,
        [poolId, userId, isActive]
      );

      res.status(200).json({
        message: `Pool membership ${isActive ? 'enabled' : 'disabled'}.`,
        poolId,
        userId,
        isActive,
      });
    } catch (err: any) {
      console.error('Error updating pool membership:', err);
      res.status(500).json({ error: 'Failed to update pool membership.' });
    }
  }
);
