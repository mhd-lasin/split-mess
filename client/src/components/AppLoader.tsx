import React from 'react';

interface AppLoaderProps {
  isExiting?: boolean;
  statusText?: string;
}

export const AppLoader: React.FC<AppLoaderProps> = ({
  isExiting = false,
  statusText = 'Preparing your ledger...',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Split Mess"
      className={`fixed inset-0 z-50 bg-[#EEF0F4] flex justify-center transition-opacity duration-300 ease-out ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-full max-w-[430px] min-h-screen bg-[#F6F7F9] flex flex-col items-center justify-between py-12 px-6 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.12)] sm:border-x sm:border-[#E6E8EC] select-none">
        <div />

        <div className="flex flex-col items-center text-center">
          {/* Brand Mark (inline SVG so it renders crisply on frame 1 before icon fonts load) */}
          <div className="w-16 h-16 rounded-[18px] bg-[#3346D3] text-white flex items-center justify-center shadow-[0_10px_28px_-6px_rgba(51,70,211,0.45)] animate-loader-pop">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
              <path d="M8 7h8" />
              <path d="M8 11h8" />
              <path d="M8 15h5" />
            </svg>
          </div>

          <h1 className="mt-5 text-[22px] font-extrabold text-[#0F172A] tracking-[-0.03em] leading-tight">
            Split Mess
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[#64748B]">
            Room Expense Ledger
          </p>

          {/* Indeterminate progress bar */}
          <div className="mt-7 w-40 h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-[#3346D3] animate-loader-bar" />
          </div>
        </div>

        <p className="text-[11px] font-semibold tracking-wide text-[#94A3B8]">
          {statusText}
        </p>
      </div>
    </div>
  );
};
