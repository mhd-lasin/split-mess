import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  icon?: string;
}

type ToastType = 'success' | 'error' | 'info';

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, type?: ToastType) => void;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const [toastState, setToastState] = useState<{ message: string; type: ToastType } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    setConfirmState(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleCloseConfirm = (result: boolean) => {
    setConfirmState(null);
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  };

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    setToastState({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastState(null);
    }, 3200);
  }, []);

  const isDanger = confirmState?.tone === 'danger';

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}

      {/* Floating Toast Notification */}
      {toastState && (
        <div className="fixed top-[74px] left-0 right-0 z-[70] flex justify-center px-4 pointer-events-none">
          <div
            role="status"
            className={`pointer-events-auto max-w-sm w-full px-4 py-3 rounded-xl shadow-[0_12px_28px_-4px_rgba(15,23,42,0.18)] border flex items-center gap-2.5 text-xs font-semibold transition-all ${
              toastState.type === 'error'
                ? 'bg-[#FEECEB] border-[#D92D20]/20 text-[#D92D20]'
                : toastState.type === 'success'
                ? 'bg-[#0F172A] border-slate-800 text-white'
                : 'bg-white border-[#E6E8EC] text-[#0F172A]'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[18px] shrink-0 ${
                toastState.type === 'success' ? 'text-[#34D399]' : ''
              }`}
            >
              {toastState.type === 'error'
                ? 'error'
                : toastState.type === 'success'
                ? 'check_circle'
                : 'info'}
            </span>
            <span className="flex-1 leading-snug">{toastState.message}</span>
            <button
              type="button"
              onClick={() => setToastState(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[60] bg-[#0F172A]/50 backdrop-blur-[2.5px] flex items-center justify-center p-5"
          onClick={() => handleCloseConfirm(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            className="w-full max-w-xs bg-white rounded-2xl shadow-2xl border border-[#E6E8EC] p-5 flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3.5 ${
                isDanger
                  ? 'bg-[#FEECEB] text-[#D92D20]'
                  : 'bg-[#EEF0FB] text-[#3346D3]'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {confirmState.icon || (isDanger ? 'delete_forever' : 'help')}
              </span>
            </div>

            <h3
              id="confirm-dialog-title"
              className="text-base font-bold text-[#0F172A] tracking-tight"
            >
              {confirmState.title}
            </h3>
            <p
              id="confirm-dialog-message"
              className="text-xs text-[#64748B] mt-1.5 leading-relaxed whitespace-pre-line"
            >
              {confirmState.message}
            </p>

            <div className="w-full grid grid-cols-2 gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => handleCloseConfirm(false)}
                className="h-10 rounded-xl bg-[#F6F7F9] hover:bg-[#E6E8EC]/70 text-[#0F172A] border border-[#E6E8EC] text-xs font-semibold transition-colors active:scale-[0.98]"
              >
                {confirmState.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleCloseConfirm(true)}
                className={`h-10 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-[0.98] ${
                  isDanger
                    ? 'bg-[#D92D20] text-white hover:bg-[#B42318]'
                    : 'bg-[#3346D3] text-white hover:bg-[#2736B0]'
                }`}
              >
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};
