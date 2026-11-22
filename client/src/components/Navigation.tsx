import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BillingCycle } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

export type TabType = 'dashboard' | 'expenses' | 'settlement' | 'profile';

interface NavigationProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  activeCycle?: BillingCycle | null;
}

export const TopBar: React.FC<{
  activeCycle?: BillingCycle | null;
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onBack?: () => void;
  showBack?: boolean;
}> = ({ activeCycle, currentTab, onSelectTab, onBack, showBack }) => {
  const { user } = useAuth();

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'Split Mess';
      case 'expenses':
        return 'Expenses Ledger';
      case 'settlement':
        return 'Settlement & Audit';
      case 'profile':
        return 'Profile & Room';
      default:
        return 'Split Mess';
    }
  };

  const formatCycleLabel = (cycleCode?: string) => {
    if (!cycleCode) return 'Current Cycle';
    const match = /^(\d{4})-(\d{2})$/.exec(cycleCode.trim());
    if (!match) return cycleCode;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) return cycleCode;
    return new Date(year, monthIndex, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const cycleLabel = formatCycleLabel(activeCycle?.cycleCode);
  const firstName = user?.name?.split(' ')[0] || 'Flatmate';

  return (
    <header className="fixed top-0 left-0 right-0 z-40 w-full pt-safe">
      <div className="max-w-[430px] mx-auto h-[68px] px-5 bg-white/90 backdrop-blur-md border-b border-[#E6E8EC]/80 flex items-center justify-between gap-3">
        {/* Left: Brand Mark + Title/Period on Home, or Back + Page Title on Sub-pages */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showBack ? (
            <button
              aria-label="Navigate Back"
              type="button"
              onClick={onBack}
              className="w-8 h-8 -ml-1 rounded-[10px] flex items-center justify-center text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95 transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          ) : (
            <div className="w-[34px] h-[34px] rounded-[10px] bg-[#3346D3] text-white flex items-center justify-center shadow-[0_2px_8px_rgba(51,70,211,0.25)] shrink-0">
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <h1 className="text-[15px] font-bold text-[#0F172A] tracking-[-0.02em] leading-tight truncate">
              {showBack ? getTabTitle() : 'Split Mess'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {!showBack && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#12805C] shrink-0" />
              )}
              <p className="text-[11.5px] font-medium text-[#64748B] leading-tight truncate">
                {cycleLabel}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Clean Profile Trigger (No Pill Chrome) */}
        <button
          aria-label="User Profile"
          type="button"
          onClick={() => onSelectTab('profile')}
          className="flex items-center gap-2.5 py-1 pl-2 pr-0.5 rounded-[10px] hover:bg-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 active:scale-[0.98] transition-[background-color,transform] duration-150 shrink-0"
          title={user ? `${user.name} (${user.role})` : 'Profile'}
        >
          <span className="text-[13px] font-semibold text-[#0F172A] max-w-[84px] truncate">
            {firstName}
          </span>
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-8 h-8 rounded-[10px] object-cover shrink-0 ring-1 ring-[#E2E8F0]"
            />
          ) : (
            <div className="w-8 h-8 rounded-[10px] bg-[#F1F5F9] text-[#0F172A] ring-1 ring-[#E2E8F0] font-bold text-[11px] flex items-center justify-center tracking-tight shrink-0">
              {getInitials(user?.name)}
            </div>
          )}
        </button>
      </div>
    </header>
  );
};

export const BottomNav: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'expenses', label: 'Expenses', icon: 'receipt_long' },
    { id: 'settlement', label: 'Settle', icon: 'swap_horiz' },
    { id: 'profile', label: 'Profile', icon: 'person' },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 w-full pointer-events-none"
    >
      <div className="max-w-[430px] mx-auto pointer-events-auto bg-white/95 backdrop-blur-md border-t border-[#E6E8EC] px-4 pt-2 pb-safe shadow-[0_-2px_12px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-4 items-center h-[58px]">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-path={tab.id}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center h-full transition-colors ${
                  isActive ? 'text-[#3346D3]' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <div className="relative py-0.5 flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={
                      isActive
                        ? { fontVariationSettings: "'FILL' 1, 'wght' 500" }
                        : { fontVariationSettings: "'FILL' 0, 'wght' 400" }
                    }
                  >
                    {tab.icon}
                  </span>
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#3346D3] rounded-full" />
                  )}
                </div>
                <span
                  className={`text-[11px] mt-1 tracking-tight ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
