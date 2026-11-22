import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('🔄 Running Split Mess database migrations...');
  const db = await getDbClient();

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Strip line comments and split by semicolon
  const cleanSql = schemaSql.replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      console.log(`Executing: ${statement.substring(0, 50).replace(/\s+/g, ' ')}...`);
      await db.query(statement);
    } catch (err: any) {
      if (statement.includes('EXTENSION')) {
        console.warn('⚠️ Extension notice:', err.message);
        continue;
      }
      console.error('❌ Failed statement:', statement);
      throw err;
    }
  }

  // Ensure the 4 default expense pools exist on a fresh production database (idempotent)
  const basePools = [
    { code: 'MESS', name: 'Mess/Groceries', desc: 'Daily kitchen supplies, groceries, meat, and vegetables' },
    { code: 'GAS', name: 'Cooking Gas', desc: 'Cooking gas cylinder refills and maintenance' },
    { code: 'WATER', name: 'Drinking Water', desc: '5-gallon bottled drinking water coupons and dispenser' },
    { code: 'MAINTENANCE', name: 'Room Maintenance', desc: 'Flat cleaning supplies, consumables, and common repairs' },
  ];
  for (const p of basePools) {
    await db.query(
      `INSERT INTO expense_pools (code, name, description, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (code) DO NOTHING;`,
      [p.code, p.name, p.desc]
    );
  }

  // Ensure an open billing cycle exists for the current month if none is open yet
  const openCycleRes = await db.query(`SELECT id, cycle_code FROM billing_cycles WHERE status = 'open' LIMIT 1;`);
  if (openCycleRes.rowCount === 0) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const cycleCode = `${year}-${month.toString().padStart(2, '0')}`;
    const startDate = `${cycleCode}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    await db.query(
      `INSERT INTO billing_cycles (cycle_code, start_date, end_date, status, total_expense_fils)
       VALUES ($1, $2, $3, 'open', 0)
       ON CONFLICT (cycle_code) DO UPDATE SET status = 'open';`,
      [cycleCode, startDate, endDate]
    );
    console.log(`📅 Initialized open billing cycle: ${cycleCode}`);
  }

  // Verify created tables
  const res = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('✅ Migrations completed successfully.');
  console.log('📋 Existing database tables:');
  res.rows.forEach((r: any) => console.log(`   - ${r.table_name}`));

  return res.rows;
}

// Auto-run if executed directly
runMigrations()
  .then(async () => {
    const db = await getDbClient();
    await db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

