import React, { useState, useMemo } from 'react';
import { BillingCycle, Expense, ExpensePool } from '../lib/api.ts';
import { ReceiptLightbox } from '../components/ReceiptLightbox.tsx';
import { getInitials } from '../lib/format.ts';

interface ExpensesProps {
  expenses: Expense[];
  pools: ExpensePool[];
  cycle?: BillingCycle | null;
  onDeleteExpense: (id: string) => Promise<void>;
  onEditExpense?: (expense: Expense) => void;
}

const POOL_ICON: Record<string, { icon: string; chipBg: string; badge: string; chipIconColor: string }> = {
  MESS: {
    icon: 'shopping_basket',
    chipBg: 'bg-[#EEF0FB] text-[#3346D3]',
    badge: 'bg-[#EEF0FB] text-[#3346D3]',
    chipIconColor: 'text-[#3346D3]',
  },
  GAS: {
    icon: 'local_fire_department',
    chipBg: 'bg-[#FEF3E2] text-[#B45309]',
    badge: 'bg-[#FEF3E2] text-[#B45309]',
    chipIconColor: 'text-[#B45309]',
  },
  WATER: {
    icon: 'water_drop',
    chipBg: 'bg-sky-50 text-sky-600',
    badge: 'bg-sky-50 text-sky-700',
    chipIconColor: 'text-sky-600',
  },
  MAINTENANCE: {
    icon: 'build',
    chipBg: 'bg-[#E7F5EE] text-[#12805C]',
    badge: 'bg-[#E7F5EE] text-[#12805C]',
    chipIconColor: 'text-[#12805C]',
  },
};

export const Expenses: React.FC<ExpensesProps> = ({
  expenses,
  pools,
  cycle: _cycle,
  onDeleteExpense,
  onEditExpense,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const getShortPoolLabel = (code: string, name: string) => {
    switch (code.toUpperCase()) {
      case 'MESS':
        return 'Mess';
      case 'GAS':
        return 'Gas';
      case 'WATER':
        return 'Water';
      case 'MAINTENANCE':
        return 'Maintenance';
      default:
        return name.split('/')[0].split(' ')[0];
    }
  };

  const categories = useMemo(() => {
    const counts: Record<string, number> = { all: expenses.length };
    expenses.forEach((e) => {
      const code = e.poolCode.toUpperCase();
      counts[code] = (counts[code] || 0) + 1;
    });
    return [
      { id: 'all', name: 'All', count: counts.all || 0, code: 'ALL' },
      ...pools.map((p) => {
        const code = p.code.toUpperCase();
        return {
          id: code,
          name: getShortPoolLabel(code, p.name),
          count: counts[code] || 0,
          code,
        };
      }),
    ];
  }, [expenses, pools]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchCat =
        activeCategory === 'all' || e.poolCode.toUpperCase() === activeCategory.toUpperCase();
      const matchSearch =
        !q ||
        e.description.toLowerCase().includes(q) ||
        e.payerName.toLowerCase().includes(q) ||
        e.poolName.toLowerCase().includes(q) ||
        e.poolCode.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [expenses, activeCategory, searchQuery]);

  const totalFils = filteredExpenses.reduce((acc, e) => acc + (e.amountFils || 0), 0);
  const totalAed = (totalFils / 100).toFixed(2);

  const uniqueMembers = useMemo(() => {
    const map = new Map<string, string>();
    pools.forEach((p) => p.members?.forEach((m) => map.set(m.id, m.name)));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [pools]);

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    filteredExpenses.forEach((exp) => {
      const d = exp.expenseDate || 'Recent';
      if (!groups[d]) groups[d] = [];
      groups[d].push(exp);
    });
    return groups;
  }, [filteredExpenses]);

  const formatDateHeader = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const today = new Date();
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
      const formatted = date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      return isToday ? `Today · ${formatted}` : formatted;
    } catch {
      return dateStr;
    }
  };

  const activePoolName =
    activeCategory === 'all'
      ? null
      : pools.find((p) => p.code.toUpperCase() === activeCategory.toUpperCase())?.name ||
        activeCategory;
  const hasActiveFilters = activeCategory !== 'all' || searchQuery.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col relative w-full pt-[68px] pb-24 px-5 bg-[#F6F7F9] max-w-[430px] mx-auto">
      <div className="flex flex-col w-full space-y-4 pt-4 pb-6">
        {/* Cycle Summary Card */}
        <section className="bg-white rounded-2xl p-5 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[13px] font-medium text-[#64748B]">
                {activePoolName ? `${activePoolName} spend` : 'Total cycle spend'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-[15px] font-semibold text-[#64748B]">AED</span>
                <span className="text-[34px] leading-none font-bold text-[#0F172A] tabular-nums tracking-[-0.03em]">
                  {totalAed}
                </span>
              </div>
            </div>

            <span className="text-[12px] font-medium text-[#64748B] tabular-nums shrink-0 mt-0.5">
              {filteredExpenses.length} {filteredExpenses.length === 1 ? 'slip' : 'slips'}
            </span>
          </div>

          {/* Active Flatmates Presence Strip */}
          {uniqueMembers.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-[#F1F5F9] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-1.5 overflow-hidden">
                  {uniqueMembers.slice(0, 4).map((m, i) => (
                    <div
                      key={m.id}
                      title={m.name}
                      className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center ring-2 ring-white ${
                        i === 0
                          ? 'bg-[#3346D3] text-white'
                          : i === 1
                          ? 'bg-[#F1F5F9] text-[#0F172A]'
                          : i === 2
                          ? 'bg-[#FEF3E2] text-[#B45309]'
                          : 'bg-[#E7F5EE] text-[#12805C]'
                      }`}
                    >
                      {getInitials(m.name)}
                    </div>
                  ))}
                  {uniqueMembers.length > 4 && (
                    <div className="w-6 h-6 rounded-full bg-[#F1F5F9] text-[#475569] text-[10px] font-semibold flex items-center justify-center ring-2 ring-white">
                      +{uniqueMembers.length - 4}
                    </div>
                  )}
                </div>
                <span className="text-[12px] font-medium text-[#64748B]">
                  {uniqueMembers.length}{' '}
                  {uniqueMembers.length === 1 ? 'flatmate active' : 'flatmates active'}
                </span>
              </div>
              <span className="text-[12px] font-medium text-[#64748B]">Equal split</span>
            </div>
          )}
        </section>

        {/* Search & Pool Filter Bar */}
        <section className="space-y-2.5">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94A3B8]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search merchant, pool, or payer"
              className="w-full h-10 pl-10 pr-9 bg-white border border-[#E6E8EC] rounded-[12px] text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3346D3]/15 focus:border-[#3346D3] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Wrapped Pool Filter Chips (No Horizontal Scroll) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              const style = POOL_ICON[cat.code];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-[10px] text-[12px] font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                    isActive
                      ? 'bg-[#3346D3] text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
                      : 'bg-white border border-[#E6E8EC] text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#CBD5E1]'
                  }`}
                >
                  {style && (
                    <span
                      className={`material-symbols-outlined text-[15px] ${
                        isActive ? 'text-white' : style.chipIconColor
                      }`}
                    >
                      {style.icon}
                    </span>
                  )}
                  <span>{cat.name}</span>
                  <span
                    className={`text-[11px] tabular-nums ${
                      isActive ? 'text-white/75' : 'text-[#94A3B8]'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Expense Cards Grouped By Day */}
        {filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-center bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="w-11 h-11 rounded-[12px] bg-[#F6F7F9] border border-[#E6E8EC] flex items-center justify-center text-[#64748B] mb-3">
              <span className="material-symbols-outlined text-[21px]">
                {hasActiveFilters ? 'search_off' : 'receipt_long'}
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-[#0F172A]">
              {hasActiveFilters ? 'No matching expenses' : 'No expenses logged yet'}
            </h3>
            <p className="text-[12px] text-[#64748B] max-w-[240px] mt-1 leading-relaxed">
              {hasActiveFilters
                ? 'Try switching pools or clearing your search filter.'
                : 'Recorded slips for this billing cycle will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('all');
                  setSearchQuery('');
                }}
                className="mt-4 h-8 px-3.5 rounded-[10px] bg-[#F6F7F9] hover:bg-[#EEF0F4] border border-[#E6E8EC] text-[12px] font-semibold text-[#0F172A] transition-colors"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedExpenses).map(([dateStr, items]) => {
              const headerLabel = formatDateHeader(dateStr);
              const dayTotalFils = items.reduce((acc, i) => acc + (i.amountFils || 0), 0);

              return (
                <section key={dateStr} className="expense-group space-y-2">
                  <div className="flex items-baseline justify-between px-0.5">
                    <span className="text-[12px] font-semibold text-[#64748B]">{headerLabel}</span>
                    <span className="text-[12px] font-bold text-[#0F172A] tabular-nums">
                      AED {(dayTotalFils / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y divide-[#F1F5F9] overflow-hidden">
                    {items.map((exp) => {
                      const style = POOL_ICON[exp.poolCode.toUpperCase()] || POOL_ICON.MESS;
                      const poolObj = pools.find((p) => p.id === exp.poolId);
                      const memberCount = poolObj?.members?.length ?? poolObj?.enrolledCount ?? 0;
                      const eachShare =
                        memberCount > 0 ? (exp.amountFils / 100 / memberCount).toFixed(2) : null;

                      return (
                        <article
                          key={exp.id}
                          onClick={() => setSelectedExpense(exp)}
                          className="expense-row px-4 py-3.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${style.chipBg}`}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {style.icon}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-[13.5px] font-semibold text-[#0F172A] truncate">
                                    {exp.description}
                                  </h3>
                                  {exp.receiptUrl && (
                                    <span
                                      className="material-symbols-outlined text-[14px] text-[#3346D3] shrink-0"
                                      title="Receipt attached"
                                    >
                                      attach_file
                                    </span>
                                  )}
                                </div>
                                <p className="text-[12px] text-[#64748B] mt-0.5 truncate">
                                  {exp.payerName} · {exp.poolName}
                                  {memberCount > 0 ? ` · ${memberCount}-way` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0 pl-2">
                              <div className="text-[13.5px] font-bold text-[#0F172A] tabular-nums">
                                AED {exp.amountAed}
                              </div>
                              {eachShare && (
                                <div className="text-[11px] text-[#64748B] tabular-nums mt-0.5">
                                  AED {eachShare} /ea
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Receipt Lightbox Bottom Sheet */}
      <ReceiptLightbox
        expense={selectedExpense}
        onClose={() => setSelectedExpense(null)}
        onDelete={onDeleteExpense}
        onEdit={onEditExpense}
      />
    </div>
  );
};
