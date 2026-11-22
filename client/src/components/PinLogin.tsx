import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

interface TenantProfile {
  id: string;
  name: string;
  role: string;
  avatar_url?: string | null;
}

export const PinLogin: React.FC = () => {
  const { login, register } = useAuth();
  const [members, setMembers] = useState<TenantProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<TenantProfile | null>(null);
  const [pin, setPin] = useState<string>('');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await api.auth.getUsers();
        if (res.users && res.users.length > 0) {
          setMembers(res.users);
          setSelectedUser(res.users[0]);
        }
      } catch (e) {
        console.error('Error loading tenants for login:', e);
      }
    };
    loadUsers();
  }, []);

  const handleKeyPress = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorStatus(null);
      if (nextPin.length === 4) {
        verifyAndSubmit(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
      setErrorStatus(null);
    }
  };

  const verifyAndSubmit = async (pinToTest: string) => {
    if (!selectedUser) {
      setErrorStatus('Select a roommate profile first.');
      return;
    }

    setLoading(true);
    try {
      await login(selectedUser.id, pinToTest);
      setSuccessStatus('Verified. Entering ledger...');
    } catch (err: any) {
      setIsShaking(true);
      setErrorStatus(err?.message || 'Wrong PIN. Try again');
      setTimeout(() => setIsShaking(false), 450);
      setTimeout(() => {
        setPin('');
        setErrorStatus(null);
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTenant = (member: TenantProfile) => {
    setSelectedUser(member);
    setPin('');
    setErrorStatus(null);
    setSuccessStatus(null);
  };

  const handleClearPin = () => {
    setPin('');
    setErrorStatus(null);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setRegisterError('Please enter your name.');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setRegisterError('PIN must be exactly 4 digits.');
      return;
    }

    setLoading(true);
    setRegisterError(null);
    try {
      await register({
        name: newName.trim(),
        pin: newPin,
        phone: newPhone.trim() || undefined,
        role: members.length === 0 ? 'admin' : 'member',
      });
      setShowRegisterModal(false);
      setNewName('');
      setNewPin('');
      setNewPhone('');
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showRegisterModal || members.length === 0) return;
    const handlePhysicalKey = (event: KeyboardEvent) => {
      if (isProfileMenuOpen || loading) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        handleKeyPress(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace();
      } else if (event.key === 'Escape') {
        handleClearPin();
      }
    };
    window.addEventListener('keydown', handlePhysicalKey);
    return () => window.removeEventListener('keydown', handlePhysicalKey);
  }, [showRegisterModal, members.length, isProfileMenuOpen, loading, pin, selectedUser]);

  return (
    <div className="flex-1 flex flex-col justify-between max-w-[430px] mx-auto w-full min-h-screen bg-[#F6F7F9] select-none shadow-[0_12px_40px_-8px_rgba(15,23,42,0.12)] sm:border-x sm:border-[#E6E8EC]">
      {/* Top Bar */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#3346D3] flex items-center justify-center text-white shadow-[0_2px_8px_rgba(51,70,211,0.24)]">
            <span className="material-symbols-outlined text-[17px]">receipt_long</span>
          </div>
          <span className="text-[15px] font-bold text-[#0F172A] tracking-[-0.02em]">
            Split Mess
          </span>
        </div>

        {members.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-[#0F172A] bg-white border border-[#E6E8EC] rounded-lg shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC] hover:border-slate-300 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[15px] text-[#64748B]">person_add</span>
            <span>Enroll Room</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 flex flex-col items-center justify-between pb-6">
        <div
          className={`w-full flex flex-col items-center ${
            members.length === 0 ? 'flex-1 justify-center py-4' : 'pt-4'
          }`}
        >
          {/* Zero State: No members yet */}
          {members.length === 0 ? (
            <div className="w-full space-y-5">
              {/* Welcome Header */}
              <div className="px-1">
                <h1 className="text-[22px] font-extrabold text-[#0F172A] tracking-[-0.03em] leading-tight">
                  Welcome to Split Mess
                </h1>
                <p className="mt-1.5 text-[13px] text-[#64748B] leading-relaxed">
                  Set up your Room Admin account first. You can add flatmates and assign shared pools right after.
                </p>
              </div>

              {/* Setup Form Card */}
              <div className="w-full bg-white rounded-2xl border border-[#E6E8EC] p-5 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05)]">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF0FB] text-[#3346D3] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#0F172A]">Setup First Profile</h2>
                    <p className="text-[11px] text-[#64748B]">Create the Room Admin account</p>
                  </div>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-3.5 mt-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Full name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm font-medium text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]/20 focus:border-[#3346D3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      4-digit PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      placeholder="••••"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full h-11 px-3.5 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl font-mono text-sm tracking-widest text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]/20 focus:border-[#3346D3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Phone (optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="+971 50 000 0000"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full h-11 px-3.5 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]/20 focus:border-[#3346D3]"
                    />
                  </div>
                  {registerError && (
                    <div className="text-[#D92D20] text-xs bg-[#FEECEB] px-3 py-2 rounded-xl font-medium">
                      {registerError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-[#3346D3] hover:bg-[#2736B0] text-white rounded-xl text-sm font-semibold shadow-sm transition-colors active:scale-[0.98]"
                  >
                    {loading ? 'Creating...' : 'Create Admin Profile'}
                  </button>
                </form>
              </div>

              {/* Compact Room Setup Highlights */}
              <div className="w-full bg-white/80 rounded-2xl border border-[#E6E8EC] p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF0FB] text-[#3346D3] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[17px]">workspaces</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#0F172A]">4 Shared Pools Ready</p>
                    <p className="text-[11px] text-[#64748B] leading-snug">
                      Mess, Cooking Gas, Drinking Water &amp; Maintenance pre-configured.
                    </p>
                  </div>
                </div>

                <div className="h-px bg-[#EEF0F4]" />

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#E8F5EF] text-[#12805C] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[17px]">calculate</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#0F172A]">Exact AED / Fils Settlement</p>
                    <p className="text-[11px] text-[#64748B] leading-snug">
                      Instant out-of-pocket offsets and automatic monthly cycle rollovers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Unified Profile Switcher */}
              <div ref={profileMenuRef} className="relative w-full max-w-[320px] mb-7">
                <button
                  type="button"
                  aria-label="Select Profile"
                  aria-haspopup="listbox"
                  aria-expanded={isProfileMenuOpen}
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  className={`w-full px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors focus:outline-none ${
                    isProfileMenuOpen
                      ? 'bg-white border-[#3346D3] ring-2 ring-[#3346D3]/15 shadow-sm'
                      : 'bg-white border-[#E6E8EC] shadow-[0_1px_3px_rgba(15,23,42,0.04)] hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {selectedUser?.avatar_url ? (
                      <img
                        src={selectedUser.avatar_url}
                        alt={selectedUser.name}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#E6E8EC]"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-[#3346D3] text-white font-semibold text-xs flex items-center justify-center shrink-0 tracking-tight">
                        {getInitials(selectedUser?.name)}
                      </span>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-semibold text-[#0F172A] leading-tight truncate">
                        {selectedUser?.name || 'Select roommate'}
                      </span>
                      <span className="text-[12px] font-medium text-[#64748B] leading-tight mt-0.5">
                        {selectedUser?.role === 'admin' ? 'Admin' : 'Roommate'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`material-symbols-outlined text-[20px] text-[#64748B] shrink-0 transition-transform duration-150 ${
                      isProfileMenuOpen ? 'rotate-180 text-[#3346D3]' : ''
                    }`}
                  >
                    unfold_more
                  </span>
                </button>

                {isProfileMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Select Profile"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] p-1.5"
                  >
                    <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
                      {members.map((m) => {
                        const isSelected = selectedUser?.id === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              handleSelectTenant(m);
                              setIsProfileMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors ${
                              isSelected
                                ? 'bg-[#EEF0FB] text-[#2736B0]'
                                : 'text-[#0F172A] hover:bg-[#F6F7F9]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {m.avatar_url ? (
                                <img
                                  src={m.avatar_url}
                                  alt={m.name}
                                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#E6E8EC]"
                                />
                              ) : (
                                <span
                                  className={`w-8 h-8 rounded-full font-semibold text-[11px] flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-[#3346D3] text-white'
                                      : 'bg-[#F1F5F9] text-[#475569]'
                                  }`}
                                >
                                  {getInitials(m.name)}
                                </span>
                              )}
                              <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-semibold leading-tight truncate">
                                  {m.name}
                                </span>
                                <span
                                  className={`text-[11px] font-medium leading-tight mt-0.5 ${
                                    isSelected ? 'text-[#3346D3]/80' : 'text-[#64748B]'
                                  }`}
                                >
                                  {m.role === 'admin' ? 'Admin' : 'Roommate'}
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[18px] text-[#3346D3] shrink-0">
                                check
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* PIN Heading & 4 Structured Digit Slots */}
              <div className="text-center mb-5">
                <h1 id="pin-prompt" className="text-[20px] font-bold text-[#0F172A] tracking-[-0.02em]">
                  Enter your PIN
                </h1>
                <p className="text-[12px] font-medium text-[#64748B] mt-1">
                  4-digit access code for {selectedUser?.name?.split(' ')[0] || 'your account'}
                </p>
              </div>

              <div
                id="pin-dots"
                className={`flex items-center justify-center gap-3 ${
                  isShaking ? 'animate-shake' : ''
                }`}
              >
                {[0, 1, 2, 3].map((idx) => {
                  const isFilled = idx < pin.length;
                  const isCurrent = idx === pin.length && !errorStatus && !successStatus && !loading;
                  return (
                    <div
                      key={idx}
                      data-index={idx}
                      className={`w-12 h-14 rounded-2xl flex items-center justify-center transition-colors duration-150 ${
                        errorStatus
                          ? 'bg-[#FEECEB]/60 border-2 border-[#D92D20]'
                          : successStatus
                          ? 'bg-[#E7F5EE]/70 border-2 border-[#12805C]'
                          : isCurrent
                          ? 'bg-white border-2 border-[#3346D3] shadow-[0_0_0_4px_rgba(51,70,211,0.08)]'
                          : isFilled
                          ? 'bg-white border border-[#CBD5E1] shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
                          : 'bg-white/80 border border-[#E6E8EC]'
                      }`}
                    >
                      {isFilled ? (
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            errorStatus
                              ? 'bg-[#D92D20]'
                              : successStatus
                              ? 'bg-[#12805C]'
                              : 'bg-[#0F172A]'
                          }`}
                        />
                      ) : isCurrent ? (
                        <span className="w-0.5 h-5 rounded-full bg-[#3346D3]/60" />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Status Feedback */}
              <div
                id="status-toast"
                className={`h-8 flex items-center justify-center mt-2 mb-3 transition-opacity duration-150 ${
                  errorStatus || successStatus ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {errorStatus ? (
                  <span className="text-[12px] font-semibold text-[#D92D20] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px]">error</span>
                    <span>{errorStatus}</span>
                  </span>
                ) : successStatus ? (
                  <span className="text-[12px] font-semibold text-[#12805C] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    <span>{successStatus}</span>
                  </span>
                ) : null}
              </div>

              {/* Modern 3x4 Fintech Keypad */}
              <div className="w-full max-w-[320px] grid grid-cols-3 gap-2.5 mt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    data-val={digit}
                    disabled={loading}
                    onClick={() => handleKeyPress(digit)}
                    className="key-btn h-[56px] rounded-2xl bg-white text-[#0F172A] font-semibold text-[22px] tabular-nums flex items-center justify-center border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#EEF0FB] active:border-[#3346D3]/40 active:text-[#3346D3] active:scale-[0.97] transition-[background-color,border-color,color,transform] duration-100 disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}

                <button
                  id="clear-btn"
                  type="button"
                  aria-label="Clear PIN"
                  disabled={loading || pin.length === 0}
                  onClick={handleClearPin}
                  className="key-btn h-[56px] rounded-2xl flex items-center justify-center text-[13px] font-semibold text-[#64748B] hover:text-[#0F172A] hover:bg-white/80 active:scale-[0.97] transition-[background-color,color,transform] duration-100 disabled:opacity-35"
                >
                  Clear
                </button>

                <button
                  type="button"
                  data-val="0"
                  disabled={loading}
                  onClick={() => handleKeyPress('0')}
                  className="key-btn h-[56px] rounded-2xl bg-white text-[#0F172A] font-semibold text-[22px] tabular-nums flex items-center justify-center border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#EEF0FB] active:border-[#3346D3]/40 active:text-[#3346D3] active:scale-[0.97] transition-[background-color,border-color,color,transform] duration-100 disabled:opacity-50"
                >
                  0
                </button>

                <button
                  id="backspace-btn"
                  type="button"
                  aria-label="Delete Digit"
                  disabled={loading || pin.length === 0}
                  onClick={handleBackspace}
                  className="key-btn h-[56px] rounded-2xl flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-white/80 active:scale-[0.97] transition-[background-color,color,transform] duration-100 disabled:opacity-35"
                >
                  <span className="material-symbols-outlined text-[22px]">backspace</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Quiet Footer */}
        <div className="pt-6 text-center">
          <p className="text-[11px] font-medium text-[#94A3B8]">
            Private shared flat ledger
          </p>
        </div>
      </div>

      {/* Enroll Modal */}
      {showRegisterModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-[2.5px] flex items-center justify-center p-5"
          onClick={() => setShowRegisterModal(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl border border-[#E6E8EC] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E6E8EC]">
              <h3 className="text-base font-bold text-[#0F172A]">Enroll Flatmate</h3>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="w-8 h-8 rounded-full bg-[#F6F7F9] text-[#64748B] hover:text-[#0F172A] flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  4-Digit Access PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl font-mono text-sm tracking-widest text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+971 50 123 4567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>

              {registerError && (
                <div className="text-[#D92D20] text-xs bg-[#FEECEB] px-3 py-2 rounded-xl font-medium">
                  {registerError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="h-10 rounded-xl bg-[#F6F7F9] border border-[#E6E8EC] text-[#0F172A] text-xs font-semibold hover:bg-[#E6E8EC]/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-10 rounded-xl bg-[#3346D3] hover:bg-[#2736B0] text-white text-xs font-bold shadow-sm"
                >
                  {loading ? 'Enrolling...' : 'Enroll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
