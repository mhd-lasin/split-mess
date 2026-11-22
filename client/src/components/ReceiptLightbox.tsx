import React, { useState } from 'react';
import { Expense } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { getInitials } from '../lib/format.ts';

interface ReceiptLightboxProps {
  expense: Expense | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (expense: Expense) => void;
}

export const ReceiptLightbox: React.FC<ReceiptLightboxProps> = ({
  expense,
  onClose,
  onDelete,
  onEdit,
}) => {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(true);

  if (!expense) return null;

  const canModify = user?.role === 'admin' || user?.id === expense.payerId;

  const formattedDate = (() => {
    try {
      const d = new Date(expense.expenseDate);
      if (isNaN(d.getTime())) return expense.expenseDate;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return expense.expenseDate;
    }
  })();

  const handleExport = () => {
    setIsExporting(true);
    try {
      const a = document.createElement('a');
      if (expense.receiptUrl) {
        a.href = expense.receiptUrl;
        a.download = `receipt-${expense.id.slice(0, 8)}.jpg`;
      } else {
        const slipText = [
          `SPLIT MESS — EXPENSE SLIP #${expense.id.slice(0, 8)}`,
          `Date: ${expense.expenseDate}`,
          `Pool: ${expense.poolName} (${expense.poolCode})`,
          `Paid By: ${expense.payerName}`,
          `Description: ${expense.description}`,
          `Total: AED ${expense.amountAed}`,
        ].join('\n');
        const blob = new Blob([slipText], { type: 'text/plain;charset=utf-8' });
        a.href = URL.createObjectURL(blob);
        a.download = `expense-slip-${expense.id.slice(0, 8)}.txt`;
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[430px] max-h-[90vh] bg-[#F6F7F9] rounded-t-[32px] shadow-2xl flex flex-col border-t border-white/70 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle & Sheet Header */}
        <div className="pt-3 pb-2.5 px-5 flex flex-col items-center border-b border-[#E6E8EC] bg-white rounded-t-[32px] shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full mb-2.5" />
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#0F172A] tracking-tight">Expense Slip</h2>
              <span className="text-[10px] font-semibold text-[#3346D3] bg-[#EEF0FB] border border-[#DDE2F7] px-2 py-0.5 rounded-full font-mono">
                #{expense.id.slice(0, 6).toUpperCase()}
              </span>
            </div>
            <button
              aria-label="Close modal"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-[#64748B] flex items-center justify-center transition"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Digital Receipt Body */}
        <div className="overflow-y-auto no-scrollbar px-4 pt-4 pb-24 space-y-4">
          <div className="relative bg-white rounded-2xl shadow-sm border border-[#E6E8EC] overflow-hidden">
            {/* Top Indigo Gradient Accent */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#3346D3] via-indigo-500 to-blue-400" />

            <div className="p-5 pb-4">
              {/* Category & Verified Pill */}
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-1.5 bg-[#EEF0FB] text-[#3346D3] border border-[#DDE2F7] px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide">
                  <span>{expense.poolName}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#12805C] bg-[#E7F5EE] px-2.5 py-0.5 rounded-full border border-[#12805C]/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#12805C]" />
                  Verified in Ledger
                </span>
              </div>

              {/* Merchant & Hero Amount */}
              <div className="text-center my-3">
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest">
                  {expense.description}
                </div>
                <div className="text-3xl font-extrabold text-[#0F172A] tracking-tight mt-1 flex items-baseline justify-center gap-1.5">
                  <span className="text-lg font-bold text-[#64748B]">AED</span>
                  <span className="font-mono text-3xl font-bold tabular-nums">
                    {expense.amountAed}
                  </span>
                </div>
                <div className="text-[11px] text-[#64748B] font-medium mt-1">
                  Total slip amount logged
                </div>
              </div>

              {/* Dashed Perforation Divider with Side Cutouts */}
              <div className="my-4 relative flex items-center justify-center">
                <div className="w-full border-t border-dashed border-slate-300" />
                <div className="absolute -left-7 w-4 h-4 bg-[#F6F7F9] rounded-full border border-[#E6E8EC]" />
                <div className="absolute -right-7 w-4 h-4 bg-[#F6F7F9] rounded-full border border-[#E6E8EC]" />
                <span className="absolute bg-white px-2 text-[10px] font-mono text-[#64748B] uppercase tracking-wider">
                  Slip Details
                </span>
              </div>

              {/* Metadata Grid */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B] font-medium">Transaction Date</span>
                  <span className="font-semibold text-[#0F172A] tabular-nums">{formattedDate}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B] font-medium">Paid By</span>
                  <div className="flex items-center gap-1.5 font-semibold text-[#0F172A]">
                    <span className="w-5 h-5 rounded-full bg-[#3346D3] text-white text-[9px] flex items-center justify-center font-bold">
                      {getInitials(expense.payerName)}
                    </span>
                    <span>{expense.payerName}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[#64748B] font-medium">Expense Pool</span>
                  <span className="font-semibold text-[#0F172A] font-mono">
                    {expense.poolCode}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Perforated Audit Footer */}
            <div className="h-6 bg-[#F6F7F9]/60 border-t border-dashed border-slate-200 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="text-[9px] font-mono text-[#64748B] uppercase tracking-widest px-1">
                Split Mess Audit · Exact Fils
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            </div>
          </div>

          {/* Expandable Physical Receipt Section */}
          {expense.receiptUrl && (
            <div className="bg-white rounded-2xl border border-[#E6E8EC] shadow-sm p-4">
              <button
                type="button"
                onClick={() => setShowImagePreview(!showImagePreview)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#0F172A] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#0F172A]">Physical Receipt Scan</div>
                    <div className="text-[11px] text-[#64748B]">
                      {showImagePreview ? 'Tap to collapse' : 'Tap to view scan'}
                    </div>
                  </div>
                </div>
                <span
                  className={`material-symbols-outlined text-[#3346D3] transition-transform ${
                    showImagePreview ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>

              {showImagePreview && (
                <div className="mt-3 pt-3 border-t border-slate-100 rounded-xl overflow-hidden max-h-60 flex items-center justify-center bg-[#F6F7F9]">
                  <img
                    src={expense.receiptUrl}
                    alt="Receipt Scan"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Bottom 3-Column Action Row */}
        <div className="absolute bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-[#E6E8EC] p-4 px-5 z-50">
          <div className="grid grid-cols-3 gap-2.5">
            {canModify && onEdit ? (
              <button
                type="button"
                onClick={() => {
                  onEdit(expense);
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-slate-300 text-[#0F172A] font-bold text-xs hover:bg-slate-50 active:scale-[0.98] transition"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <span>Edit</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={handleExport}
              className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-slate-300 text-[#0F172A] font-bold text-xs hover:bg-slate-50 active:scale-[0.98] transition"
            >
              <span className="material-symbols-outlined text-[16px]">
                {exported ? 'check' : 'file_download'}
              </span>
              <span>{isExporting ? '...' : exported ? 'Saved' : 'Export'}</span>
            </button>

            {canModify && onDelete ? (
              <button
                type="button"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: 'Delete Expense Slip?',
                    message: `Remove "${expense.description}" (AED ${expense.amountAed}) from this cycle? This cannot be undone.`,
                    confirmLabel: 'Delete',
                    cancelLabel: 'Keep It',
                    tone: 'danger',
                    icon: 'delete_forever',
                  });
                  if (confirmed) {
                    onDelete(expense.id);
                    onClose();
                  }
                }}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-red-200 bg-[#FEECEB] text-[#D92D20] font-bold text-xs hover:bg-red-100 active:scale-[0.98] transition"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
