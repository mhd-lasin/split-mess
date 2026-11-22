-- Split Mess PostgreSQL 16 Schema Definition
-- Strict INTEGER Fils Standard: 1 AED = 100 fils

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    pin_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. BILLING_CYCLES
CREATE TABLE IF NOT EXISTS billing_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_code VARCHAR(7) NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    total_expense_fils BIGINT NOT NULL DEFAULT 0,
    closed_at TIMESTAMPTZ,
    closed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_cycle_code_format CHECK (cycle_code ~ '^\d{4}-\d{2}$'),
    CONSTRAINT check_date_range CHECK (end_date >= start_date)
);

-- 3. EXPENSE_POOLS
CREATE TABLE IF NOT EXISTS expense_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. POOL_MEMBERS
CREATE TABLE IF NOT EXISTS pool_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES expense_pools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT unique_pool_member UNIQUE (pool_id, user_id)
);

-- 5. EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE RESTRICT,
    pool_id UUID NOT NULL REFERENCES expense_pools(id) ON DELETE RESTRICT,
    paid_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_fils INTEGER NOT NULL,
    description VARCHAR(255) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_url VARCHAR(500),
    receipt_mime_type VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_positive_amount CHECK (amount_fils > 0)
);

-- 6. MEMBER_BALANCES
CREATE TABLE IF NOT EXISTS member_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opening_balance_fils INTEGER NOT NULL DEFAULT 0,
    opening_credit_fils INTEGER NOT NULL DEFAULT 0,
    pool_share_fils INTEGER NOT NULL DEFAULT 0,
    paid_out_of_pocket_fils INTEGER NOT NULL DEFAULT 0,
    net_payable_fils INTEGER NOT NULL DEFAULT 0,
    net_balance_fils INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cycle_user UNIQUE (billing_cycle_id, user_id)
);

-- 7. SETTLEMENT_SNAPSHOTS
CREATE TABLE IF NOT EXISTS settlement_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_cycle_id UUID NOT NULL REFERENCES billing_cycles(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    net_payable_fils INTEGER NOT NULL DEFAULT 0,
    net_balance_fils INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    settlement_notes TEXT,
    settled_at TIMESTAMPTZ,
    settled_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT unique_snapshot_user_cycle UNIQUE (billing_cycle_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_cycle ON expenses(billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pool ON expenses(pool_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_member_balances_cycle ON member_balances(billing_cycle_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_user ON pool_members(user_id);
CREATE INDEX IF NOT EXISTS idx_settlement_snapshots_cycle ON settlement_snapshots(billing_cycle_id);
