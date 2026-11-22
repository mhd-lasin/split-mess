import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BillingCycle, ExpensePool, MemberSettlement, Expense } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

interface DashboardProps {
  cycle: BillingCycle | null;
  pools: ExpensePool[];
  memberSummary: MemberSettlement | null;
  recentExpenses: Expense[];
  onOpenAddExpense: () => void;
  onNavigateToExpenses: () => void;
  onNavigateToSettlement: () => void;
}

const POOL_META: Record<
  string,
  {
    icon: string;
    chipClass: string;
    barClass: string;
    pctText: string;
    accentGradient: string;
    calloutBg: string;
    badgeBg: string;
  }
> = {
  MESS: {
    icon: 'shopping_basket',
    chipClass: 'bg-[#3346D3]/10 text-[#3346D3]',
    barClass: 'bg-[#3346D3]',
    pctText: 'text-[#3346D3]',
    accentGradient: 'from-[#3346D3] via-indigo-500 to-blue-400',
    calloutBg: 'from-[#EEF0FB] to-indigo-50/60 border-[#DDE2F7]',
    badgeBg: 'bg-[#EEF0FB] text-[#3346D3] border-[#DDE2F7]',
  },
  GAS: {
    icon: 'local_fire_department',
    chipClass: 'bg-amber-50 text-amber-600',
    barClass: 'bg-amber-500',
    pctText: 'text-amber-600',
    accentGradient: 'from-amber-400 via-orange-500 to-amber-600',
    calloutBg: 'from-amber-50/90 to-orange-50/60 border-amber-200/70',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
  },
  WATER: {
    icon: 'water_drop',
    chipClass: 'bg-sky-50 text-sky-600',
    barClass: 'bg-sky-500',
    pctText: 'text-sky-600',
    accentGradient: 'from-sky-400 via-cyan-500 to-sky-600',
    calloutBg: 'from-sky-50/90 to-cyan-50/60 border-sky-200/70',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200/60',
  },
  MAINTENANCE: {
    icon: 'build',
    chipClass: 'bg-emerald-50 text-[#12805C]',
    barClass: 'bg-[#12805C]',
    pctText: 'text-[#12805C]',
    accentGradient: 'from-emerald-400 via-teal-500 to-emerald-600',
    calloutBg: 'from-[#E7F5EE] to-emerald-50/60 border-emerald-200/70',
    badgeBg: 'bg-[#E7F5EE] text-[#12805C] border-emerald-200/60',
  },
};

export const Dashboard: React.FC<DashboardProps> = ({
  cycle: _cycle,
  pools,
  memberSummary,
  recentExpenses,
  onOpenAddExpense,
  onNavigateToExpenses,
  onNavigateToSettlement,
}) => {
  const { user } = useAuth();
  const [selectedPoolModal, setSelectedPoolModal] = useState<ExpensePool | null>(null);

  const outOfPocketAed = memberSummary?.outOfPocketPaidAed || '0.00';
  const poolObligationsAed = memberSummary?.poolObligationsAed || '0.00';
  const rolloverCreditFils = memberSummary?.openingCreditFils || 0;
  const rolloverCreditAed = memberSummary?.openingCreditAed || '0.00';
  const netPayableAed = memberSummary?.netPayableAed || '0.00';

  const netNum = parseFloat(netPayableAed) || 0;
  const isCredit = netNum < 0;
  const isZero = netNum === 0;

  const totalSpendFils = pools.reduce((acc, p) => acc + (p.totalFils || 0), 0);
  const totalSpendAed = (totalSpendFils / 100).toFixed(2);
  const userPaidCount = recentExpenses.filter((e) => e.payerId === user?.id).length;

  const paidNum = parseFloat(outOfPocketAed) || 0;
  const shareNum = parseFloat(poolObligationsAed) || 0;
  const coveragePct =
    shareNum > 0 ? Math.round((paidNum / shareNum) * 100) : paidNum > 0 ? 100 : 0;

  const barTotal = Math.max(paidNum + shareNum, 1);
  const shareBarWidth = Math.min(100, Math.round((shareNum / barTotal) * 100));
  const paidBarWidth = Math.min(100 - shareBarWidth, Math.round((paidNum / barTotal) * 100));

  // Unique roommates across all pools (to display enrolled vs excluded in the Pool Roster Modal)
  const allRoommatesMap = new Map<string, { id: string; name: string }>();
  pools.forEach((p) => {
    p.members?.forEach((m) => allRoommatesMap.set(m.id, { id: m.id, name: m.name }));
  });
  const allRoommates = Array.from(allRoommatesMap.values());

  return (
    <div className="flex-1 flex flex-col relative w-full pt-[68px] pb-24 px-5 bg-[#F6F7F9] max-w-[430px] mx-auto">
      <div className="flex flex-col w-full space-y-4 pt-4 pb-6">
        {/* 1. Hero Balance Card */}
        <div className="bg-white rounded-2xl p-5 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[13px] font-medium text-[#64748B]">
                Net balance
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span
                  className={`text-[15px] font-semibold ${
                    isZero
                      ? 'text-[#64748B]'
                      : isCredit
                      ? 'text-[#12805C]'
                      : 'text-[#B45309]'
                  }`}
                >
                  {isZero ? 'AED' : isCredit ? '+AED' : '-AED'}
                </span>
                <span
                  className={`text-[34px] leading-none font-bold tabular-nums tracking-[-0.03em] ${
                    isZero
                      ? 'text-[#0F172A]'
                      : isCredit
                      ? 'text-[#12805C]'
                      : 'text-[#B45309]'
                  }`}
                >
                  {Math.abs(netNum).toFixed(2)}
                </span>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-semibold shrink-0 mt-0.5 ${
                isZero
                  ? 'text-[#64748B]'
                  : isCredit
                  ? 'text-[#12805C]'
                  : 'text-[#B45309]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isZero
                    ? 'bg-[#94A3B8]'
                    : isCredit
                    ? 'bg-[#12805C]'
                    : 'bg-[#B45309]'
                }`}
              />
              {isZero ? 'Settled' : isCredit ? 'Surplus credit' : 'You owe'}
            </span>
          </div>

          <p className="text-[12px] text-[#64748B] mt-2">
            {rolloverCreditFils !== 0
              ? `Includes ${
                  rolloverCreditFils > 0
                    ? `+AED ${rolloverCreditAed}`
                    : `-AED ${Math.abs(parseFloat(rolloverCreditAed)).toFixed(2)}`
                } rollover from previous cycle`
              : 'No rollover from last cycle'}
          </p>

          {/* KPIs: Paid vs Share (Open Hairline Row — No Box-in-Box) */}
          <div className="mt-4 pt-4 border-t border-[#F1F5F9] grid grid-cols-2 gap-4">
            <div>
              <span className="text-[11.5px] font-medium text-[#64748B] block">
                You paid <span className="text-[#94A3B8]">({userPaidCount})</span>
              </span>
              <span className="text-[15px] font-bold text-[#0F172A] tabular-nums mt-1 block tracking-[-0.01em]">
                <span className="text-[11px] font-semibold text-[#64748B] mr-1">AED</span>
                {outOfPocketAed}
              </span>
            </div>
            <div>
              <span className="text-[11.5px] font-medium text-[#64748B] block">
                Your pool share
              </span>
              <span className="text-[15px] font-bold text-[#0F172A] tabular-nums mt-1 block tracking-[-0.01em]">
                <span className="text-[11px] font-semibold text-[#64748B] mr-1">AED</span>
                {poolObligationsAed}
              </span>
            </div>
          </div>

          {/* Coverage Progress Bar */}
          <div className="mt-4 pt-3.5 border-t border-[#F1F5F9]">
            <div className="flex justify-between items-center text-[11px] mb-1.5">
              <span
                className={`font-semibold ${
                  isZero
                    ? 'text-[#64748B]'
                    : isCredit
                    ? 'text-[#12805C]'
                    : 'text-[#B45309]'
                }`}
              >
                {isZero ? 'Balanced' : isCredit ? 'Creditor' : 'Payable'}
              </span>
              <span className="font-medium text-[#64748B] tabular-nums">
                {coveragePct}% covered
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#ECEFF3] rounded-full overflow-hidden flex">
              {shareNum > 0 && (
                <div
                  className="bg-slate-300 h-full transition-all"
                  style={{ width: `${shareBarWidth}%` }}
                />
              )}
              {paidNum > 0 && (
                <div
                  className={`h-full transition-all ${
                    isCredit ? 'bg-[#12805C]' : 'bg-[#3346D3]'
                  }`}
                  style={{ width: `${paidBarWidth}%` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* 2. Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenAddExpense}
            className="h-9 flex items-center justify-center gap-1.5 px-3.5 rounded-[10px] bg-[#3346D3] hover:bg-[#2736B0] text-white font-semibold text-[12.5px] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_3px_10px_-2px_rgba(51,70,211,0.28)] active:scale-[0.98] transition-[background-color,transform] duration-150"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>New Expense</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToSettlement}
            className="h-9 flex items-center justify-center gap-1.5 px-3.5 rounded-[10px] bg-white text-[#0F172A] border border-[#E6E8EC] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] font-semibold text-[12.5px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:scale-[0.98] transition-[background-color,border-color,transform] duration-150"
          >
            <span className="material-symbols-outlined text-[16px] text-[#3346D3]">swap_horiz</span>
            <span>Settle Up</span>
          </button>
        </div>

        {/* 3. Room Pools 2x2 Grid */}
        <section className="pt-1">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#0F172A] tracking-[-0.015em]">
              Room Pools
            </h2>
            <span className="text-[12px] text-[#64748B] font-medium tabular-nums">
              AED {totalSpendAed} total
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {pools.map((pool) => {
              const meta = POOL_META[pool.code.toUpperCase()] || POOL_META.MESS;
              const poolFils = pool.totalFils || 0;
              const pct = totalSpendFils > 0 ? Math.round((poolFils / totalSpendFils) * 100) : 0;
              const membersCount = pool.members?.length ?? pool.enrolledCount ?? 0;

              return (
                <button
                  key={pool.id}
                  type="button"
                  onClick={() => setSelectedPoolModal(pool)}
                  className="text-left bg-white rounded-2xl p-4 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-[#CBD5E1] flex flex-col justify-between active:scale-[0.985] transition-[border-color,transform] duration-150"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.chipClass}`}>
                        <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                      </div>
                      <span className="text-[11px] font-medium text-[#64748B] tabular-nums">
                        {membersCount} {membersCount === 1 ? 'mate' : 'mates'}
                      </span>
                    </div>
                    <h3 className="text-[13px] font-semibold text-[#475569] mt-3 leading-snug truncate">
                      {pool.name}
                    </h3>
                    <p className="mt-1 flex items-baseline gap-1 tabular-nums">
                      <span className="text-[11px] font-semibold text-[#64748B]">AED</span>
                      <span className="text-[18px] font-bold text-[#0F172A] tracking-[-0.02em] leading-none">
                        {pool.totalAed || '0.00'}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3.5 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#F1F5F9] rounded-full overflow-hidden">
                      <div
                        className={`${meta.barClass} h-full rounded-full transition-all`}
                        style={{ width: `${Math.max(poolFils > 0 ? 6 : 0, pct)}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-semibold tabular-nums ${poolFils > 0 ? meta.pctText : 'text-[#94A3B8]'}`}>
                      {pct}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Recent Slips Section */}
        <section className="pt-1 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold text-[#0F172A] tracking-[-0.015em]">
              Recent Slips
            </h2>
            <button
              type="button"
              onClick={onNavigateToExpenses}
              className="text-[12px] font-semibold text-[#3346D3] hover:text-[#2736B0] flex items-center gap-0.5 transition-colors"
            >
              <span>View all ({recentExpenses.length})</span>
              <span className="material-symbols-outlined text-[15px]">chevron_right</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y divide-[#F1F5F9] overflow-hidden">
            {recentExpenses.length === 0 ? (
              <div className="py-7 px-5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-xl bg-[#F6F7F9] border border-[#E6E8EC] flex items-center justify-center text-[#64748B] mb-2.5">
                  <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                </div>
                <p className="text-[13px] font-semibold text-[#0F172A]">No expenses yet</p>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Tap New Expense to record your first slip
                </p>
              </div>
            ) : (
              recentExpenses.slice(0, 4).map((exp) => {
                const meta = POOL_META[exp.poolCode.toUpperCase()] || POOL_META.MESS;
                const matchingPool = pools.find((p) => p.id === exp.poolId);
                const poolMembers = matchingPool?.members?.length ?? matchingPool?.enrolledCount ?? 0;
                const eachShare =
                  poolMembers > 0 ? (exp.amountFils / 100 / poolMembers).toFixed(2) : null;

                return (
                  <div
                    key={exp.id}
                    onClick={onNavigateToExpenses}
                    className="px-4 py-3.5 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.chipClass}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{meta.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-[13px] font-semibold text-[#0F172A] truncate">
                            {exp.description}
                          </h4>
                          {exp.receiptUrl && (
                            <span
                              className="material-symbols-outlined text-[14px] text-[#64748B] shrink-0"
                              title="Receipt attached"
                            >
                              description
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#64748B] mt-0.5 truncate">
                          Paid by <span className="font-medium text-[#0F172A]">{exp.payerName}</span> ·{' '}
                          {exp.expenseDate}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className="text-[13px] font-bold text-[#0F172A] tabular-nums block">
                        AED {exp.amountAed}
                      </span>
                      <span className="text-[11px] text-[#64748B] tabular-nums mt-0.5 block">
                        {eachShare ? `AED ${eachShare} /ea` : exp.poolCode}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Floating Action Button (anchored inside mobile frame above nav) */}
      <div className="fixed bottom-20 left-0 right-0 z-40 max-w-[430px] mx-auto pointer-events-none flex justify-end px-5">
        <button
          id="add-ledger-btn"
          aria-label="Add Expense"
          onClick={onOpenAddExpense}
          className="pointer-events-auto w-12 h-12 bg-[#3346D3] hover:bg-[#2736B0] text-white rounded-2xl shadow-[0_6px_18px_-4px_rgba(51,70,211,0.45)] active:scale-95 transition-[background-color,transform] duration-150 flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[22px]">add</span>
        </button>
      </div>

      {/* Stitch Pool Roster Modal */}
      {selectedPoolModal && (() => {
        const meta = POOL_META[selectedPoolModal.code.toUpperCase()] || POOL_META.MESS;
        const enrolledList = selectedPoolModal.members || [];
        const enrolledIds = new Set(enrolledList.map((m) => m.id));
        const excludedList = allRoommates.filter((m) => !enrolledIds.has(m.id));
        const poolTotalFils = selectedPoolModal.totalFils || 0;
        const perMateAed =
          enrolledList.length > 0 ? (poolTotalFils / 100 / enrolledList.length).toFixed(2) : '0.00';

        return (
          <div
            className="fixed inset-0 z-50 bg-[#0F172A]/45 backdrop-blur-[4px] flex items-center justify-center p-5"
            onClick={() => setSelectedPoolModal(null)}
          >
            <div
              className="w-full max-w-[360px] bg-white rounded-[28px] shadow-2xl border border-[#E6E8EC] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Accent Bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${meta.accentGradient}`} />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0 ${meta.badgeBg}`}
                    >
                      <span className="material-symbols-outlined text-[22px]">{meta.icon}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-lg font-bold text-[#0F172A] tracking-tight leading-tight">
                          {selectedPoolModal.name}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${meta.badgeBg}`}
                        >
                          {selectedPoolModal.code}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#64748B] mt-0.5">
                        Shared Roster &amp; Allocation
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close modal"
                    onClick={() => setSelectedPoolModal(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-[#64748B] flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {/* Cycle Spend Callout Banner */}
                <div
                  className={`mt-4 p-3.5 bg-gradient-to-br rounded-2xl border flex items-center justify-between ${meta.calloutBg}`}
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#64748B] block">
                      Current Cycle Spend
                    </span>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-xs font-bold font-mono text-[#64748B]">AED</span>
                      <span className="text-xl font-extrabold font-mono text-[#0F172A] tracking-tight">
                        {selectedPoolModal.totalAed || '0.00'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white text-[#0F172A] text-[11px] font-bold shadow-xs border border-[#E6E8EC]">
                      {enrolledList.length} of {Math.max(allRoommates.length, enrolledList.length)} Mates
                    </div>
                    <span className="text-[10px] text-[#64748B] block mt-1 font-medium font-mono">
                      AED {perMateAed} / mate
                    </span>
                  </div>
                </div>

                {/* Roster List */}
                <div className="flex items-center justify-between mt-4 mb-2 px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Flatmate Roster
                  </span>
                  <span className="text-[11px] font-semibold text-[#64748B]">
                    Equal split
                  </span>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto no-scrollbar">
                  {enrolledList.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-[#F6F7F9] border border-[#E6E8EC]/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#3346D3] text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {getInitials(m.name)}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#0F172A] truncate">
                              {m.name}
                            </span>
                            {m.id === user?.id && (
                              <span className="text-[9px] font-extrabold bg-[#EEF0FB] text-[#3346D3] px-1.5 py-0.2 rounded">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-[#12805C] font-semibold mt-0.5">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            <span>Enrolled (1/{enrolledList.length} split)</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className="text-xs font-bold font-mono text-[#0F172A] block">
                          AED {perMateAed}
                        </span>
                        <span className="text-[10px] text-[#64748B]">in cycle</span>
                      </div>
                    </div>
                  ))}

                  {excludedList.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-100/70 border border-dashed border-[#E6E8EC] opacity-75"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0">
                          {getInitials(m.name)}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#64748B] truncate">
                              {m.name}
                            </span>
                            <span className="text-[9px] font-medium text-[#64748B] bg-slate-200/80 px-1.5 py-0.2 rounded">
                              Excluded
                            </span>
                          </div>
                          <span className="text-[10px] text-[#64748B] block mt-0.5">
                            Not enrolled in pool
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className="text-xs font-semibold font-mono text-slate-400 line-through block">
                          AED 0.00
                        </span>
                        <span className="text-[10px] text-slate-400">0% share</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-[#E6E8EC]">
                  <button
                    type="button"
                    onClick={() => setSelectedPoolModal(null)}
                    className="w-full py-2.5 px-4 bg-[#F6F7F9] hover:bg-[#E6E8EC]/70 text-[#0F172A] font-semibold text-xs rounded-xl border border-[#E6E8EC] transition-colors"
                  >
                    Done · Return to Ledger
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
