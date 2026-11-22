import fs from 'fs';
import path from 'path';
import { getDbClient } from '../db/client.js';

export async function cleanDatabase() {
  console.log('🧹 Purging Split Mess database and resetting to clean state...');
  const db = await getDbClient();

  // 1. Delete transactional records and users
  await db.query(`DELETE FROM expenses;`);
  console.log('   ✅ Removed all expenses.');

  await db.query(`DELETE FROM settlement_snapshots;`);
  console.log('   ✅ Removed all settlement snapshots.');

  await db.query(`DELETE FROM member_balances;`);
  console.log('   ✅ Removed all member balances.');

  await db.query(`DELETE FROM pool_members;`);
  console.log('   ✅ Removed all pool memberships.');

  await db.query(`DELETE FROM users;`);
  console.log('   ✅ Removed all users.');

  // 2. Reset billing cycles to a single fresh open cycle for the current month
  await db.query(`DELETE FROM billing_cycles;`);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const cycleCode = `${year}-${month.toString().padStart(2, '0')}`;
  const startDate = `${cycleCode}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  await db.query(
    `INSERT INTO billing_cycles (cycle_code, start_date, end_date, status, total_expense_fils)
     VALUES ($1, $2, $3, 'open', 0);`,
    [cycleCode, startDate, endDate]
  );
  console.log(`   ✅ Initialized fresh open billing cycle: ${cycleCode} (0 fils).`);

  // 3. Ensure base pools exist
  const pools = [
    { code: 'MESS', name: 'Mess/Groceries', desc: 'Daily kitchen supplies, groceries, meat, and vegetables' },
    { code: 'GAS', name: 'Cooking Gas', desc: 'Cooking gas cylinder refills and maintenance' },
    { code: 'WATER', name: 'Drinking Water', desc: '5-gallon bottled drinking water coupons and dispenser' },
    { code: 'MAINTENANCE', name: 'Room Maintenance', desc: 'Flat cleaning supplies, consumables, and common repairs' },
  ];

  for (const p of pools) {
    await db.query(
      `INSERT INTO expense_pools (code, name, description, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO UPDATE 
       SET name = EXCLUDED.name, description = EXCLUDED.description;`,
      [p.code, p.name, p.desc]
    );
  }
  console.log('   ✅ Base pools verified (MESS, GAS, WATER, MAINTENANCE).');

  // 4. Clean up uploaded receipt files and avatars from both server/uploads and root uploads
  const uploadDirs = [
    path.resolve(process.cwd(), 'uploads', 'receipts'),
    path.resolve(process.cwd(), 'uploads', 'avatars'),
    path.resolve(process.cwd(), '..', 'uploads', 'receipts'),
    path.resolve(process.cwd(), '..', 'uploads', 'avatars'),
  ];
  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f !== '.gitkeep');
      for (const f of files) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
      if (files.length > 0) {
        console.log(`   ✅ Cleaned ${files.length} file(s) from ${dir}.`);
      }
    }
  }

  console.log('\n🎉 Database is now completely clean and ready for your fresh data!');
}

cleanDatabase()
  .then(async () => {
    const db = await getDbClient();
    await db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Purge failed:', err);
    process.exit(1);
  });
