import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Expense, ExpensePool, api, User } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  pools: ExpensePool[];
  onExpenseAdded: () => void;
  expenseToEdit?: Expense | null;
}

const POOL_STYLE: Record<string, { icon: string; idleChip: string }> = {
  MESS: { icon: 'shopping_basket', idleChip: 'bg-[#EEF0FB] text-[#3346D3]' },
  GAS: { icon: 'local_fire_department', idleChip: 'bg-amber-100 text-amber-600' },
  WATER: { icon: 'water_drop', idleChip: 'bg-sky-100 text-sky-600' },
  MAINTENANCE: { icon: 'build', idleChip: 'bg-emerald-100 text-[#12805C]' },
};

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  pools,
  onExpenseAdded,
  expenseToEdit,
}) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const payerMenuRef = useRef<HTMLDivElement>(null);

  const [poolCode, setPoolCode] = useState<string>('MESS');
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payerId, setPayerId] = useState<string>(user?.id || '');
  const [isPayerMenuOpen, setIsPayerMenuOpen] = useState<boolean>(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!isPayerMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (payerMenuRef.current && !payerMenuRef.current.contains(event.target as Node)) {
        setIsPayerMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPayerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPayerMenuOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsPayerMenuOpen(false);
      if (expenseToEdit) {
        setPoolCode(expenseToEdit.poolCode || 'MESS');
        setAmount(expenseToEdit.amountAed || '');
        setDescription(expenseToEdit.description || '');
        setDate(
          expenseToEdit.expenseDate
            ? expenseToEdit.expenseDate.split('T')[0]
            : new Date().toISOString().split('T')[0]
        );
        setPayerId(expenseToEdit.payerId || user?.id || '');
        setReceiptFile(null);
        setError(null);
      } else {
        setPoolCode('MESS');
        setAmount('');
        setDescription('');
        setDate(new Date().toISOString().split('T')[0]);
        setPayerId(user?.id || '');
        setReceiptFile(null);
        setError(null);
      }
    }
  }, [isOpen, expenseToEdit, user]);

  useEffect(() => {
    if (isOpen && user?.role === 'admin') {
      api.auth
        .getUsers()
        .then((res) => {
          if (res.users && res.users.length > 0) {
            setAllUsers(res.users);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, user?.role]);

  if (!isOpen) return null;

  const selectedPool =
    pools.find((p) => p.code.toUpperCase() === poolCode.toUpperCase()) ||
    pools[0] || { id: '', code: 'MESS', name: 'Mess' };

  const numericAmount = parseFloat(amount) || 0;
  const enrolledMembers = selectedPool?.members || [];
  const enrolledCount = enrolledMembers.length || selectedPool?.enrolledCount || 0;
  const perPersonShare = enrolledCount > 0 ? (numericAmount / enrolledCount).toFixed(2) : '0.00';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      if (!description.trim()) {
        setDescription('Supermarket Receipt');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPool.id) {
      setError('Please select a valid expense pool.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a merchant or description.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('poolId', selectedPool.id);
      formData.append('amountAed', amount);
      formData.append('description', description.trim());
      formData.append('expenseDate', date);
      formData.append('payerId', payerId || user?.id || '');
      if (receiptFile) {
        formData.append('receipt', receiptFile);
      }

      if (expenseToEdit) {
        await api.expenses.update(expenseToEdit.id, formData);
      } else {
        await api.expenses.create(formData);
      }
      onExpenseAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save expense.');
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === 'admin';
  const activePayer = (isAdmin ? allUsers.find((u) => u.id === payerId) : user) || user;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-[2.5px] flex items-end justify-center"
      onClick={onClose}
    >
      <article
        className="relative w-full max-w-[430px] max-h-[92vh] bg-white rounded-t-[32px] shadow-[0_-10px_40px_-10px_rgba(15,23,42,0.28)] border-t border-[#E6E8EC] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-full pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* Sheet Header */}
        <header className="px-5 py-2.5 flex items-center justify-between border-b border-[#E6E8EC]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-[#0F172A] tracking-tight">
              {expenseToEdit ? 'Update Expense' : 'New Expense'}
            </h2>
            <span className="bg-[#EEF0FB] text-[#3346D3] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#DDE2F7]">
              {expenseToEdit ? `#${expenseToEdit.id.slice(0, 6)}` : 'Shared Split'}
            </span>
          </div>
          <button
            aria-label="Cancel expense"
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-slate-100 text-[#64748B] hover:text-[#0F172A] hover:bg-slate-200 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-5 pt-3 pb-28 overflow-y-auto no-scrollbar space-y-4">
            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-[#FEECEB] text-[#D92D20] text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{error}</span>
              </div>
            )}

            {/* Centered Hero AED Amount Input */}
            <section className="text-center py-2">
              <div className="inline-flex items-baseline justify-center text-[#0F172A] font-extrabold tracking-tight">
                <span className="text-xl font-bold text-[#64748B] mr-1.5">AED</span>
                <input
                  id="expense-amount"
                  aria-label="Total amount in AED"
                  inputMode="decimal"
                  type="text"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-40 text-center text-4xl font-extrabold tabular-nums text-[#0F172A] bg-transparent focus:outline-none p-0 placeholder:text-slate-300"
                />
              </div>
              <p className="text-xs font-medium text-[#64748B] mt-0.5">
                Total slip amount to divide (exact integer fils)
              </p>
            </section>

            {/* 4-Column Room Pool Selector */}
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Target Shared Pool
              </legend>
              <div className="grid grid-cols-4 gap-2 pt-0.5">
                {pools.map((pool) => {
                  const code = pool.code.toUpperCase();
                  const isSelected = poolCode.toUpperCase() === code;
                  const meta = POOL_STYLE[code] || POOL_STYLE.MESS;
                  return (
                    <button
                      key={pool.id}
                      type="button"
                      onClick={() => setPoolCode(pool.code)}
                      className={`pool-btn relative flex flex-col items-center justify-center p-2 rounded-2xl cursor-pointer transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-[#EEF0FB] border-2 border-[#3346D3] text-[#2736B0] shadow-sm'
                          : 'bg-[#F6F7F9] border border-[#E6E8EC] text-[#0F172A] hover:border-slate-300'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3346D3] text-white flex items-center justify-center shadow">
                          <span className="material-symbols-outlined text-[11px]">check</span>
                        </span>
                      )}
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${
                          isSelected ? 'bg-[#3346D3] text-white shadow-sm' : meta.idleChip
                        }`}
                      >
                        <span className="material-symbols-outlined text-[17px]">{meta.icon}</span>
                      </div>
                      <span className="text-[11px] font-bold truncate w-full text-center">
                        {pool.name.split('/')[0].split(' ')[0]}
                      </span>
                      <span
                        className={`text-[9px] font-semibold ${
                          isSelected ? 'text-[#3346D3]' : 'text-[#64748B]'
                        }`}
                      >
                        {pool.members?.length ?? pool.enrolledCount ?? 0} mates
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Form Fields */}
            <section className="space-y-3">
              <div>
                <label
                  className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1"
                  htmlFor="expense-desc"
                >
                  Merchant or Description
                </label>
                <div className="relative">
                  <input
                    id="expense-desc"
                    type="text"
                    placeholder="Enter merchant or purpose"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs font-semibold text-[#0F172A] bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl px-3.5 py-2.5 pr-9 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3] focus:border-[#3346D3] transition"
                  />
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[17px] text-[#64748B] pointer-events-none">
                    storefront
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1"
                    htmlFor="expense-date"
                  >
                    Date
                  </label>
                  <input
                    id="expense-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-11 text-xs font-semibold tabular-nums text-[#0F172A] bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl px-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]/20 focus:border-[#3346D3] transition-colors"
                  />
                </div>

                <div ref={payerMenuRef} className="relative">
                  <label
                    className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1"
                    htmlFor="expense-payer"
                  >
                    Paid By
                  </label>

                  {isAdmin ? (
                    <>
                      <button
                        id="expense-payer"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={isPayerMenuOpen}
                        onClick={() => setIsPayerMenuOpen((prev) => !prev)}
                        className={`w-full h-11 flex items-center justify-between gap-2 rounded-xl px-2.5 border text-left transition-colors focus:outline-none ${
                          isPayerMenuOpen
                            ? 'bg-white border-[#3346D3] ring-2 ring-[#3346D3]/15'
                            : 'bg-[#F6F7F9] border-[#E6E8EC] hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {activePayer?.avatar_url ? (
                            <img
                              src={activePayer.avatar_url}
                              alt={activePayer.name}
                              className="w-6 h-6 rounded-full object-cover shrink-0 border border-[#E6E8EC]"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-[#EEF0FB] border border-[#DDE2F7] text-[#3346D3] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {getInitials(activePayer?.name)}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-[#0F172A] truncate">
                            {activePayer?.name}
                          </span>
                        </div>
                        <span
                          className={`material-symbols-outlined text-[18px] text-[#64748B] shrink-0 transition-transform duration-150 ${
                            isPayerMenuOpen ? 'rotate-180 text-[#3346D3]' : ''
                          }`}
                        >
                          expand_more
                        </span>
                      </button>

                      {isPayerMenuOpen && (
                        <div
                          role="listbox"
                          aria-label="Select who paid"
                          className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[216px] w-full bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] p-1.5"
                        >
                          <div className="px-2.5 pt-1 pb-1.5 mb-1 border-b border-[#F1F5F9] flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-[#64748B]">
                              Select payer
                            </span>
                            <span className="text-[10px] font-mono text-[#94A3B8]">
                              {(allUsers.length > 0 ? allUsers : user ? [user] : []).length}
                            </span>
                          </div>
                          <div className="max-h-48 overflow-y-auto no-scrollbar space-y-0.5">
                            {(allUsers.length > 0 ? allUsers : user ? [user] : []).map((u) => {
                              const isSelected = u.id === activePayer?.id;
                              const isSelf = u.id === user?.id;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={() => {
                                    setPayerId(u.id);
                                    setIsPayerMenuOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors ${
                                    isSelected
                                      ? 'bg-[#EEF0FB] text-[#2736B0]'
                                      : 'text-[#0F172A] hover:bg-[#F6F7F9]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {u.avatar_url ? (
                                      <img
                                        src={u.avatar_url}
                                        alt={u.name}
                                        className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#E6E8EC]"
                                      />
                                    ) : (
                                      <span
                                        className={`w-7 h-7 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 ${
                                          isSelected
                                            ? 'bg-[#3346D3] text-white'
                                            : 'bg-[#F1F5F9] text-[#475569]'
                                        }`}
                                      >
                                        {getInitials(u.name)}
                                      </span>
                                    )}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs font-semibold truncate">
                                        {u.name}
                                      </span>
                                      {isSelf && (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white text-[#64748B] border border-[#E6E8EC] shrink-0">
                                          You
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <span className="material-symbols-outlined text-[16px] text-[#3346D3] shrink-0">
                                      check
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      id="expense-payer"
                      className="w-full h-11 flex items-center gap-2 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl px-2.5"
                    >
                      {activePayer?.avatar_url ? (
                        <img
                          src={activePayer.avatar_url}
                          alt={activePayer.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0 border border-[#E6E8EC]"
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-[#EEF0FB] border border-[#DDE2F7] text-[#3346D3] font-bold text-[10px] flex items-center justify-center shrink-0">
                          {getInitials(activePayer?.name)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-[#0F172A] truncate">
                        {activePayer?.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Receipt Photo Uploader */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  Receipt Attachment
                </label>
                <input
                  id="camera-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 p-2.5 border-2 border-dashed border-slate-300 hover:border-[#3346D3] hover:bg-[#EEF0FB]/40 rounded-xl text-[#64748B] transition group"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-[#EEF0FB] text-[#64748B] group-hover:text-[#3346D3] flex items-center justify-center transition">
                    <span className="material-symbols-outlined text-[18px]">
                      {receiptFile ? 'verified' : 'photo_camera'}
                    </span>
                  </div>
                  <div className="text-left min-w-0">
                    <span className="text-xs font-bold text-[#0F172A] block truncate">
                      {receiptFile ? receiptFile.name : 'Add Receipt Photo'}
                    </span>
                    <span className="text-[10px] text-[#64748B] font-medium">
                      {receiptFile ? 'Tap to replace image' : 'Optional · JPG, PNG, WebP'}
                    </span>
                  </div>
                </button>
              </div>
            </section>

            {/* Live Equal Split Breakdown Card */}
            <section className="bg-[#EEF0FB]/70 border border-[#DDE2F7] rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center text-[11px] font-bold text-[#2736B0] bg-white px-2 py-0.5 rounded-md border border-[#DDE2F7]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3346D3] mr-1.5 animate-pulse" />
                  {enrolledCount}-Way Equal Split
                </span>
                <span className="text-[11px] font-medium text-[#3346D3]">
                  {selectedPool.name}
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-0.5">
                <span className="text-xs text-[#64748B] font-medium">Share per flatmate:</span>
                <span className="text-base font-extrabold text-[#2736B0] tabular-nums">
                  AED {perPersonShare}{' '}
                  <span className="text-[10px] font-normal text-[#64748B]">/ person</span>
                </span>
              </div>

              {enrolledMembers.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-[#DDE2F7]">
                  {enrolledMembers.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-col items-center bg-white/80 p-1.5 rounded-xl border border-[#DDE2F7]/60"
                    >
                      <span
                        className={`w-7 h-7 rounded-full font-bold text-[10px] flex items-center justify-center ${
                          m.id === activePayer?.id
                            ? 'bg-[#3346D3] text-white'
                            : 'bg-[#EEF0FB] text-[#3346D3]'
                        }`}
                      >
                        {getInitials(m.name)}
                      </span>
                      <span className="text-[10px] font-bold text-[#0F172A] mt-1 truncate max-w-full">
                        {m.name.split(' ')[0]}
                      </span>
                      <span className="text-[9px] font-mono text-[#64748B]">
                        {perPersonShare}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sticky Bottom Action Footer */}
          <footer className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-md px-5 py-3.5 border-t border-[#E6E8EC] flex flex-col items-center">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[#3346D3] hover:bg-[#2736B0] active:scale-[0.99] text-white font-bold rounded-2xl shadow-[0_4px_14px_rgba(51,70,211,0.35)] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">check</span>
              <span>
                {loading
                  ? expenseToEdit
                    ? 'Updating...'
                    : 'Saving...'
                  : expenseToEdit
                  ? `Update Expense · AED ${numericAmount.toFixed(2)}`
                  : `Save Expense · AED ${numericAmount.toFixed(2)}`}
              </span>
            </button>
          </footer>
        </form>
      </article>
    </div>
  );
};
