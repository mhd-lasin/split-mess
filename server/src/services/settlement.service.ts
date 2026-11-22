import { getDbClient } from '../db/client.js';
import { filsToAed } from '../utils/money.js';

export interface PoolShareAllocation {
  userId: string;
  shareFils: number;
}

export interface UserSettlementSummary {
  userId: string;
  userName: string;
  role: string;
  openingCreditFils: number;   // Prior cycle credit carried forward
  poolObligationsFils: number; // Total shares from all enrolled pools
  outOfPocketPaidFils: number; // Total paid out of pocket in this cycle
  netPayableFils: number;      // PoolObligations - OutOfPocketPaid - OpeningCredit
  netBalanceFils: number;      // -NetPayable (positive = credit / owed to user, negative = debt / user owes)
  nextCycleOpeningCreditFils: number; // If netPayable < 0, Math.abs(netPayable); else 0
}

export interface SettlementMatrix {
  cycleCode: string;
  cycleId: string;
  totalExpensesFils: number;
  poolBreakdowns: Record<string, {
    poolCode: string;
    poolName: string;
    totalFils: number;
    memberCount: number;
    shares: Record<string, number>;
  }>;
  memberSummaries: UserSettlementSummary[];
  invariantCheck: {
    totalPoolExpensesFils: number;
    totalAllocatedSharesFils: number;
    deltaFils: number;
    isConserved: boolean;
  };
}

/**
 * Distributes a pool's total integer fils among its enrolled members.
 * Strictly uses integer division and modulo remainder distribution:
 * base = Math.floor(pool_total / member_count)
 * remainder = pool_total % member_count
 * The first `remainder` members receive (base + 1) fils; remaining receive `base` fils.
 */
export function calculatePoolSplit(totalFils: number, memberIds: string[]): Record<string, number> {
  if (memberIds.length === 0) {
    if (totalFils === 0) return {};
    throw new Error('Cannot split non-zero expenses among 0 members');
  }

  // Deterministic sorting to guarantee reproducible splits
  const sortedMembers = [...memberIds].sort();
  const memberCount = sortedMembers.length;

  const baseShare = Math.floor(totalFils / memberCount);
  const remainder = totalFils % memberCount;

  const result: Record<string, number> = {};
  for (let i = 0; i < memberCount; i++) {
    const memberId = sortedMembers[i];
    // First `remainder` members receive 1 extra fil
    const allocation = i < remainder ? baseShare + 1 : baseShare;
    result[memberId] = allocation;
  }

  return result;
}

/**
 * Calculates net liabilities for users:
 * NetPayable = PoolObligations - OutOfPocketPaid - OpeningCredit
 * If NetPayable < 0, user is in net credit: opening_credit_fils = Math.abs(NetPayable)
 */
export function calculateUserNetPayable(
  poolObligationsFils: number,
  outOfPocketPaidFils: number,
  openingCreditFils: number
): { netPayableFils: number; nextCycleOpeningCreditFils: number } {
  const netPayableFils = poolObligationsFils - outOfPocketPaidFils - openingCreditFils;
  const nextCycleOpeningCreditFils = netPayableFils < 0 ? Math.abs(netPayableFils) : 0;
  return { netPayableFils, nextCycleOpeningCreditFils };
}

/**
 * Executes a full settlement calculation for a given billing cycle from database records.
 */
export async function calculateCycleSettlement(billingCycleId: string): Promise<SettlementMatrix> {
  const db = await getDbClient();

  // 1. Fetch Cycle
  const cycleRes = await db.query(
    `SELECT id, cycle_code, status, total_expense_fils FROM billing_cycles WHERE id = $1;`,
    [billingCycleId]
  );
  if (cycleRes.rowCount === 0) {
    throw new Error(`Billing cycle not found: ${billingCycleId}`);
  }
  const cycle = cycleRes.rows[0];

  // 2. Fetch all pools
  const poolsRes = await db.query(
    `SELECT id, code, name FROM expense_pools WHERE is_active = true ORDER BY code;`
  );

  // 3. Fetch pool memberships (only active memberships for active users)
  const membershipsRes = await db.query(
    `SELECT pm.pool_id, pm.user_id
     FROM pool_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.is_active = true AND u.is_active = true
     ORDER BY pm.user_id;`
  );

  const poolMembersMap: Record<string, string[]> = {};
  for (const row of membershipsRes.rows) {
    if (!poolMembersMap[row.pool_id]) {
      poolMembersMap[row.pool_id] = [];
    }
    poolMembersMap[row.pool_id].push(row.user_id);
  }

  // 4. Fetch expenses for this cycle grouped by pool
  const expensesRes = await db.query(
    `SELECT pool_id, paid_by_user_id, amount_fils FROM expenses WHERE billing_cycle_id = $1;`,
    [billingCycleId]
  );

  const poolTotals: Record<string, number> = {};
  const userOutOfPocket: Record<string, number> = {};
  let totalExpensesFils = 0;

  for (const exp of expensesRes.rows) {
    const amount = Number(exp.amount_fils);
    totalExpensesFils += amount;
    poolTotals[exp.pool_id] = (poolTotals[exp.pool_id] || 0) + amount;
    userOutOfPocket[exp.paid_by_user_id] = (userOutOfPocket[exp.paid_by_user_id] || 0) + amount;
  }

  // 5. Calculate pool splits
  const poolBreakdowns: SettlementMatrix['poolBreakdowns'] = {};
  const userPoolObligations: Record<string, number> = {};
  let totalAllocatedSharesFils = 0;

  for (const pool of poolsRes.rows) {
    const poolId = pool.id;
    const poolTotal = poolTotals[poolId] || 0;
    const enrolledMembers = poolMembersMap[poolId] || [];

    const shares = calculatePoolSplit(poolTotal, enrolledMembers);
    for (const [userId, share] of Object.entries(shares)) {
      userPoolObligations[userId] = (userPoolObligations[userId] || 0) + share;
      totalAllocatedSharesFils += share;
    }

    poolBreakdowns[pool.code] = {
      poolCode: pool.code,
      poolName: pool.name,
      totalFils: poolTotal,
      memberCount: enrolledMembers.length,
      shares,
    };
  }

  // 6. Fetch all users and their opening balances (positive = credit, negative = carried unpaid debt)
  const usersRes = await db.query(
    `SELECT u.id, u.name, u.role, 
            COALESCE(mb.opening_balance_fils, 0) as opening_balance_fils,
            COALESCE(mb.opening_credit_fils, 0) as opening_credit_fils
     FROM users u
     LEFT JOIN member_balances mb ON mb.user_id = u.id AND mb.billing_cycle_id = $1
     WHERE u.is_active = true
     ORDER BY u.name;`,
    [billingCycleId]
  );

  const memberSummaries: UserSettlementSummary[] = [];

  for (const user of usersRes.rows) {
    const userId = user.id;
    const rawOpeningBalance = Number(user.opening_balance_fils) || 0;
    const rawOpeningCredit = Number(user.opening_credit_fils) || 0;
    // Use opening_balance_fils when set (supports both +credit and -debt); fallback to opening_credit_fils
    const openingCreditFils = rawOpeningBalance !== 0 ? rawOpeningBalance : rawOpeningCredit;
    const obligations = userPoolObligations[userId] || 0;
    const paid = userOutOfPocket[userId] || 0;

    const { netPayableFils, nextCycleOpeningCreditFils } = calculateUserNetPayable(
      obligations,
      paid,
      openingCreditFils
    );

    memberSummaries.push({
      userId,
      userName: user.name,
      role: user.role,
      openingCreditFils,
      poolObligationsFils: obligations,
      outOfPocketPaidFils: paid,
      netPayableFils,
      netBalanceFils: -netPayableFils, // positive if owed money, negative if owes
      nextCycleOpeningCreditFils,
    });
  }

  const deltaFils = totalExpensesFils - totalAllocatedSharesFils;

  return {
    cycleCode: cycle.cycle_code,
    cycleId: cycle.id,
    totalExpensesFils,
    poolBreakdowns,
    memberSummaries,
    invariantCheck: {
      totalPoolExpensesFils: totalExpensesFils,
      totalAllocatedSharesFils,
      deltaFils,
      isConserved: deltaFils === 0,
    },
  };
}

/**
 * Persists calculated settlement into member_balances and settlement_snapshots.
 */
export async function persistSettlementSnapshot(matrix: SettlementMatrix, adminUserId: string) {
  const db = await getDbClient();

  for (const summary of matrix.memberSummaries) {
    // 1. Update working member_balances
    await db.query(
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

    // 2. Insert into immutable settlement_snapshots
    await db.query(
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
        adminUserId,
      ]
    );
  }

  // Update cycle total expenses
  await db.query(
    `UPDATE billing_cycles SET total_expense_fils = $1 WHERE id = $2;`,
    [matrix.totalExpensesFils, matrix.cycleId]
  );
}
