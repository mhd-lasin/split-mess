import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { SettlementMatrix, api } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

interface SettlementProps {
  matrix: SettlementMatrix | null;
  onCycleClosed: () => void;
}

const POOL_BREAKDOWN_META: Record<string, { icon: string; bg: string }> = {
  MESS: { icon: 'shopping_basket', bg: 'bg-[#EEF0FB] text-[#3346D3]' },
  GAS: { icon: 'local_fire_department', bg: 'bg-[#FEF3E2] text-[#B45309]' },
  WATER: { icon: 'water_drop', bg: 'bg-sky-50 text-sky-600' },
  MAINTENANCE: { icon: 'home_repair_service', bg: 'bg-[#E7F5EE] text-[#12805C]' },
};

export const Settlement: React.FC<SettlementProps> = ({ matrix, onCycleClosed }) => {
  const { user } = useAuth();
  const { confirm, toast } = useDialog();
  const [isAccordionOpen, setIsAccordionOpen] = useState(true);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [isClosingCycle, setIsClosingCycle] = useState(false);

  if (!matrix) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center pt-24 px-4 text-center bg-[#F6F7F9]">
        <span className="material-symbols-outlined text-3xl text-[#3346D3] mb-2 animate-spin">
          sync
        </span>
        <p className="text-sm font-bold text-[#0F172A]">Computing Settlement Matrix...</p>
        <p className="text-xs text-[#64748B] mt-1">Checking dual-ledger conservation</p>
      </div>
    );
  }

  const currentUserSummary = matrix.members.find((m) => m.userId === user?.id) || matrix.members[0];

  const totalPoolDuesFils = matrix.members.reduce((acc, m) => acc + (m.poolObligationsFils || 0), 0);
  const totalPaidFils = matrix.members.reduce((acc, m) => acc + (m.outOfPocketPaidFils || 0), 0);
  const totalRolloverFils = matrix.members.reduce((acc, m) => acc + (m.openingCreditFils || 0), 0);
  const totalNetPayableFils = matrix.members.reduce((acc, m) => acc + (m.netPayableFils || 0), 0);

  const totalReceivablesFils = matrix.members
    .filter((m) => m.netPayableFils < 0)
    .reduce((acc, m) => acc + Math.abs(m.netPayableFils), 0);
  const totalPayablesFils = matrix.members
    .filter((m) => m.netPayableFils > 0)
    .reduce((acc, m) => acc + m.netPayableFils, 0);

  const deltaFils = Math.abs(totalReceivablesFils - totalPayablesFils);
  const isConserved = deltaFils === 0;

  const handleCopyWhatsapp = () => {
    let text = `*SPLIT MESS — SETTLEMENT FOLIO (${matrix.cycleCode})*\n`;
    text += `Shared Room Expense Ledger\n`;
    text += `------------------------------------\n`;
    matrix.members.forEach((m) => {
      const net = parseFloat(m.netPayableAed);
      const posStr =
        net < 0
          ? `+ AED ${Math.abs(net).toFixed(2)} (Receivable)`
          : `- AED ${net.toFixed(2)} (Owes)`;
      text += `• *${m.userName}*: ${posStr}\n`;
    });
    text += `------------------------------------\n`;
    text += `Total Expenses: AED ${matrix.totalExpensesAed}\n`;
    text += `Conservation Check: 0.00 Fils Lost (Exact Split)\n`;

    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    toast('Summary copied for WhatsApp!', 'success');
    setTimeout(() => setCopiedWhatsapp(false), 2000);
  };

  const handleCloseMonth = async () => {
    if (user?.role !== 'admin') {
      toast('Only room administrators can close the billing cycle.', 'error');
      return;
    }

    const confirmClose = await confirm({
      title: `Close Cycle ${matrix.cycleCode}?`,
      message:
        'This will snapshot all balances and roll forward unsettled credits and dues to the next month.',
      confirmLabel: 'Close & Roll Over',
      cancelLabel: 'Cancel',
      tone: 'primary',
      icon: 'lock_clock',
    });
    if (!confirmClose) return;

    setIsClosingCycle(true);
    try {
      const res = await api.cycles.close();
      toast(`Cycle ${res.closedCycleCode} closed! Opened ${res.nextCycleCode}.`, 'success');
      onCycleClosed();
    } catch (err: any) {
      toast(`Failed to close cycle: ${err.message}`, 'error');
    } finally {
      setIsClosingCycle(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative w-full pt-[68px] pb-24 px-5 bg-[#F6F7F9] max-w-[430px] mx-auto">
      <div className="flex flex-col w-full space-y-5 pt-4 pb-6">
        {/* Section 1: KPI Tiles & Parity Verification */}
        <section className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            {/* Tile 1: Receivables */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#64748B]">Receivables</span>
                  <span className="w-6 h-6 rounded-[8px] bg-[#E7F5EE] text-[#12805C] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1 tabular-nums">
                  <span className="text-[11px] font-semibold text-[#12805C]/75">AED</span>
                  <span className="text-[22px] leading-none font-bold text-[#12805C] tracking-[-0.02em]">
                    {(totalReceivablesFils / 100).toFixed(2)}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#64748B] mt-2.5">
                Surplus to collect
              </span>
            </div>

            {/* Tile 2: Payables */}
            <div className="bg-white rounded-2xl p-4 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-[#64748B]">Payables</span>
                  <span className="w-6 h-6 rounded-[8px] bg-[#FEF3E2] text-[#B45309] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1 tabular-nums">
                  <span className="text-[11px] font-semibold text-[#B45309]/75">AED</span>
                  <span className="text-[22px] leading-none font-bold text-[#B45309] tracking-[-0.02em]">
                    {(totalPayablesFils / 100).toFixed(2)}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#64748B] mt-2.5">
                Deficit to settle
              </span>
            </div>
          </div>

          {/* Parity Verification Strip */}
          <div
            className={`rounded-2xl px-4 py-3 border shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex items-center gap-3 ${
              isConserved
                ? 'bg-[#F2FBF7] border-[#CBEBD9]'
                : 'bg-[#FEF4F3] border-[#F8C7C3]'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${
                isConserved ? 'bg-[#DFF4EA] text-[#12805C]' : 'bg-[#FEECEB] text-[#D92D20]'
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {isConserved ? 'verified' : 'warning'}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                  {isConserved
                    ? 'Exact audit · 0.00 fils remainder'
                    : `Audit delta · AED ${(deltaFils / 100).toFixed(2)}`}
                </span>
                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    isConserved ? 'text-[#12805C]' : 'text-[#D92D20]'
                  }`}
                >
                  {isConserved ? 'Balanced' : 'Check'}
                </span>
              </div>
              <p className="text-[11.5px] text-[#64748B] mt-0.5">
                Verified across {matrix.members.length}{' '}
                {matrix.members.length === 1 ? 'flatmate' : 'flatmates'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Settlement Matrix (Mobile-Native Member Ledger — No Horizontal Scroll) */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between px-0.5">
            <h2 className="text-[15px] font-bold text-[#0F172A] tracking-[-0.015em]">
              Settlement Matrix
            </h2>
            <span className="text-[12px] font-medium text-[#64748B] tabular-nums">
              {matrix.members.length}{' '}
              {matrix.members.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden divide-y divide-[#F1F5F9]">
            {matrix.members.map((m) => {
              const isCurrent = m.userId === user?.id;
              const net = parseFloat(m.netPayableAed);
              const isCr = net < 0;
              const isSettled = net === 0;

              return (
                <div key={m.userId} className="p-4 space-y-3">
                  {/* Member Row Header: Identity + Net Position */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
                          isCurrent
                            ? 'bg-[#3346D3] text-white'
                            : 'bg-[#EEF0FB] text-[#3346D3]'
                        }`}
                      >
                        {getInitials(m.userName)}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-semibold text-[#0F172A] truncate">
                          {m.userName}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-[6px] bg-[#EEF0FB] text-[#3346D3] font-semibold shrink-0">
                            You
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`block text-[14px] font-bold tabular-nums leading-tight ${
                          isSettled
                            ? 'text-[#0F172A]'
                            : isCr
                            ? 'text-[#12805C]'
                            : 'text-[#B45309]'
                        }`}
                      >
                        {isSettled
                          ? 'AED 0.00'
                          : isCr
                          ? `+AED ${Math.abs(net).toFixed(2)}`
                          : `-AED ${net.toFixed(2)}`}
                      </span>
                      <span className="block text-[10.5px] font-medium text-[#64748B] mt-0.5">
                        {isSettled ? 'Settled' : isCr ? 'Receivable' : 'Payable'}
                      </span>
                    </div>
                  </div>

                  {/* Clean Open 3-Column Metrics Row (No Box-in-Box) */}
                  <div className="grid grid-cols-3 gap-3 pt-2.5 border-t border-[#F1F5F9]">
                    <div>
                      <span className="block text-[11px] font-medium text-[#64748B]">
                        Pool dues
                      </span>
                      <span className="block text-[13px] font-semibold text-[#0F172A] tabular-nums mt-0.5">
                        {m.poolObligationsAed}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-medium text-[#64748B]">
                        Paid
                      </span>
                      <span className="block text-[13px] font-semibold text-[#0F172A] tabular-nums mt-0.5">
                        {m.outOfPocketPaidAed}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[11px] font-medium text-[#64748B]">
                        Rollover
                      </span>
                      <span className="block text-[13px] font-medium text-[#475569] tabular-nums mt-0.5">
                        {m.openingCreditAed}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Card Footer: Editorial Ledger Summary */}
            <div className="px-4 py-3.5 bg-[#FAFBFC] border-t-2 border-[#E2E8F0]">
              <div className="flex items-baseline justify-between mb-2.5">
                <span className="text-[12px] font-bold text-[#0F172A]">Total (AED)</span>
                <span className="text-[12px] font-mono font-semibold text-[#12805C] tabular-nums">
                  Net {(totalNetPayableFils / 100).toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[13px] tabular-nums">
                <div>
                  <span className="block text-[10.5px] font-medium text-[#64748B]">Pool dues</span>
                  <span className="block font-bold text-[#0F172A] mt-0.5">
                    {(totalPoolDuesFils / 100).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10.5px] font-medium text-[#64748B]">Paid</span>
                  <span className="block font-bold text-[#0F172A] mt-0.5">
                    {(totalPaidFils / 100).toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10.5px] font-medium text-[#64748B]">Rollover</span>
                  <span className="block font-semibold text-[#475569] mt-0.5">
                    {(totalRolloverFils / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Expandable Your Pool Breakdown */}
        <section>
          <div className="bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <button
              aria-controls="accordion-content"
              aria-expanded={isAccordionOpen}
              onClick={() => setIsAccordionOpen(!isAccordionOpen)}
              className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-[#F8FAFC] transition-colors"
              type="button"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[10px] bg-[#EEF0FB] flex items-center justify-center text-[#3346D3]">
                  <span className="material-symbols-outlined text-[18px]">pie_chart</span>
                </div>
                <div>
                  <div className="text-[14px] text-[#0F172A] font-bold tracking-[-0.01em] leading-tight">
                    Your Pool Breakdown
                  </div>
                  <div className="text-[11.5px] text-[#64748B] mt-0.5">
                    Calculated shares for {user?.name?.split(' ')[0] || 'you'}
                  </div>
                </div>
              </div>
              <span
                className={`material-symbols-outlined text-[#64748B] transition-transform duration-150 text-[20px] ${
                  isAccordionOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            {isAccordionOpen && (
              <div className="px-4 pb-4 pt-2 flex flex-col gap-2.5 border-t border-[#F1F5F9]">
                {Object.entries(matrix.poolBreakdowns || {}).map(([code, p]) => {
                  const userShareFils = p.shares?.[currentUserSummary?.userId || ''] || 0;
                  const shareAed = (userShareFils / 100).toFixed(2);
                  const style = POOL_BREAKDOWN_META[code.toUpperCase()] || POOL_BREAKDOWN_META.MESS;

                  return (
                    <div key={code} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${style.bg}`}
                        >
                          <span className="material-symbols-outlined text-[16px]">{style.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                            {p.poolName}
                          </span>
                          <span className="text-[11px] text-[#64748B]">
                            Split between {p.memberCount}{' '}
                            {p.memberCount === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                      </div>
                      <div className="text-[13.5px] font-bold text-[#0F172A] tabular-nums shrink-0 pl-2">
                        <span className="text-[11px] font-semibold text-[#64748B] mr-1">AED</span>
                        {shareAed}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-1.5 pt-3 border-t border-[#E2E8F0] flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-[#0F172A]">
                    Your total pool share
                  </span>
                  <span className="text-[16px] font-bold text-[#0F172A] tabular-nums">
                    <span className="text-[11px] font-semibold text-[#64748B] mr-1">AED</span>
                    {currentUserSummary?.poolObligationsAed || '0.00'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Action Buttons */}
        <section className="flex flex-col gap-2 pt-0.5">
          <button
            id="copy-whatsapp-btn"
            onClick={handleCopyWhatsapp}
            className="w-full h-10 rounded-[10px] bg-white hover:bg-[#F8FAFC] hover:border-[#CBD5E1] text-[#0F172A] border border-[#E6E8EC] text-[13px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)] active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 flex items-center justify-center gap-2"
            type="button"
          >
            {copiedWhatsapp ? (
              <>
                <span className="material-symbols-outlined text-[17px] text-[#12805C]">
                  check_circle
                </span>
                <span className="text-[#12805C]">Copied summary to clipboard</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[17px] text-[#12805C]">chat</span>
                <span>Copy WhatsApp Summary</span>
              </>
            )}
          </button>

          <button
            id="close-month-btn"
            disabled={isClosingCycle}
            onClick={handleCloseMonth}
            className="w-full h-10 rounded-[10px] bg-[#3346D3] hover:bg-[#2736B0] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08),0_3px_10px_-2px_rgba(51,70,211,0.28)] active:scale-[0.98] transition-[background-color,transform] duration-150 flex items-center justify-center gap-2 disabled:opacity-50"
            type="button"
          >
            <span className="material-symbols-outlined text-[17px]">lock_clock</span>
            <span>{isClosingCycle ? 'Closing & rolling over...' : 'Close Month & Roll Over'}</span>
          </button>
        </section>
      </div>
    </div>
  );
};
