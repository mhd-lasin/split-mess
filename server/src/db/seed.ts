import bcrypt from 'bcryptjs';
import { getDbClient } from './client.js';

export async function seedDatabase() {
  console.log('🌱 Starting database seed for Split Mess...');
  const db = await getDbClient();

  // 1. PIN Hash for '1234' with 12 rounds
  const pinHash = bcrypt.hashSync('1234', 12);
  console.log('🔐 Generated bcrypt hash for PIN 1234.');

  // 2. Insert Active Billing Cycle '2026-11'
  const cycleResult = await db.query(
    `INSERT INTO billing_cycles (cycle_code, start_date, end_date, status, total_expense_fils)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cycle_code) DO UPDATE 
     SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = EXCLUDED.status
     RETURNING id, cycle_code;`,
    ['2026-11', '2026-11-01', '2026-11-30', 'open', 0]
  );
  const cycleId = cycleResult.rows[0].id;
  console.log(`📅 Billing Cycle seeded: 2026-11 (ID: ${cycleId})`);

  // 3. Insert Expense Pools
  const poolsData = [
    { code: 'MESS', name: 'Mess/Groceries', desc: 'Daily kitchen supplies, groceries, meat, and vegetables' },
    { code: 'GAS', name: 'Cooking Gas', desc: 'Cooking gas cylinder refills and maintenance' },
    { code: 'WATER', name: 'Drinking Water', desc: '5-gallon bottled drinking water coupons and dispenser' },
    { code: 'MAINTENANCE', name: 'Room Maintenance', desc: 'Flat cleaning supplies, consumables, and common repairs' },
  ];

  const poolMap: Record<string, string> = {};
  for (const p of poolsData) {
    const res = await db.query(
      `INSERT INTO expense_pools (code, name, description, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE 
       SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id, code;`,
      [p.code, p.name, p.desc]
    );
    poolMap[p.code] = res.rows[0].id;
    console.log(`🏷️  Pool seeded: ${p.code} (${p.name})`);
  }

  // 4. Insert 8 Users
  const usersData = [
    { name: 'Member A', phone: '+971500000001', role: 'admin' },
    { name: 'Member B', phone: '+971500000002', role: 'member' },
    { name: 'Member C', phone: '+971500000003', role: 'member' },
    { name: 'Member D', phone: '+971500000004', role: 'member' },
    { name: 'Member E', phone: '+971500000005', role: 'member' },
    { name: 'Member F', phone: '+971500000006', role: 'member' },
    { name: 'Member G', phone: '+971500000007', role: 'member' },
    { name: 'Member H', phone: '+971500000008', role: 'external' },
  ];

  const userMap: Record<string, string> = {};
  for (const u of usersData) {
    const res = await db.query(
      `INSERT INTO users (name, phone, pin_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (phone) DO UPDATE 
       SET name = EXCLUDED.name, pin_hash = EXCLUDED.pin_hash, role = EXCLUDED.role
       RETURNING id, name;`,
      [u.name, u.phone, pinHash, u.role]
    );
    userMap[u.name] = res.rows[0].id;
    console.log(`👤 User seeded: ${u.name} (Role: ${u.role})`);
  }

  // 5. Enroll Pool Members
  // - Members A, B, C, D, E enrolled in MESS, GAS, WATER, MAINTENANCE
  // - Members F, G enrolled in GAS, WATER, MAINTENANCE (Excluded from MESS)
  // - Member H enrolled ONLY in WATER
  const enrollments: Array<{ user: string; pools: string[] }> = [
    { user: 'Member A', pools: ['MESS', 'GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member B', pools: ['MESS', 'GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member C', pools: ['MESS', 'GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member D', pools: ['MESS', 'GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member E', pools: ['MESS', 'GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member F', pools: ['GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member G', pools: ['GAS', 'WATER', 'MAINTENANCE'] },
    { user: 'Member H', pools: ['WATER'] },
  ];

  for (const enr of enrollments) {
    const userId = userMap[enr.user];
    for (const poolCode of enr.pools) {
      const poolId = poolMap[poolCode];
      await db.query(
        `INSERT INTO pool_members (pool_id, user_id, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (pool_id, user_id) DO UPDATE SET is_active = true;`,
        [poolId, userId]
      );
    }
  }
  console.log('🔗 All pool memberships enrolled strictly according to specification.');

  // 6. Initialize Member Balances for Open Cycle 2026-11
  for (const userName of Object.keys(userMap)) {
    const userId = userMap[userName];
    await db.query(
      `INSERT INTO member_balances (
         billing_cycle_id, user_id, 
         opening_balance_fils, opening_credit_fils, 
         pool_share_fils, paid_out_of_pocket_fils, 
         net_payable_fils, net_balance_fils
       )
       VALUES ($1, $2, 0, 0, 0, 0, 0, 0)
       ON CONFLICT (billing_cycle_id, user_id) DO NOTHING;`,
      [cycleId, userId]
    );
  }
  console.log(' Initialized member balances with 0 fils opening balances.');

  console.log('🎉 Seed completed successfully!');
}

seedDatabase()
  .then(async () => {
    const db = await getDbClient();
    await db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });
