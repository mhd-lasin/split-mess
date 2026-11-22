import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext.tsx';
import { DialogProvider, useDialog } from './context/DialogContext.tsx';
import { api, BillingCycle, ExpensePool, Expense, SettlementMatrix } from './lib/api.ts';
import { PinLogin } from './components/PinLogin.tsx';
import { TopBar, BottomNav, TabType } from './components/Navigation.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Expenses } from './pages/Expenses.tsx';
import { Settlement } from './pages/Settlement.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { AddExpenseModal } from './components/AddExpenseModal.tsx';
import { AppLoader } from './components/AppLoader.tsx';

const MIN_SPLASH_MS = 1000;
const SPLASH_FADE_MS = 300;

const MainApp: React.FC = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { toast } = useDialog();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [pools, setPools] = useState<ExpensePool[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlementMatrix, setSettlementMatrix] = useState<SettlementMatrix | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const [minSplashDone, setMinSplashDone] = useState<boolean>(false);
  const [initialDataDone, setInitialDataDone] = useState<boolean>(false);
  const [splashPhase, setSplashPhase] = useState<'visible' | 'exiting' | 'hidden'>('visible');

  useEffect(() => {
    const timer = window.setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [cycleRes, poolsRes, expensesRes, settlementRes] = await Promise.all([
        api.cycles.getCurrent().catch(() => null),
        api.pools.getAll().catch(() => ({ pools: [] })),
        api.expenses.getAll().catch(() => ({ expenses: [] })),
        api.settlement.getCurrent().catch(() => null),
      ]);

      if (cycleRes) setCycle(cycleRes.cycle);
      if (poolsRes) setPools(poolsRes.pools);
      if (expensesRes) setExpenses(expensesRes.expenses);
      if (settlementRes) setSettlementMatrix(settlementRes);
    } catch (err) {
      console.error('Error fetching application state:', err);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      fetchData().finally(() => setInitialDataDone(true));
    } else {
      setInitialDataDone(true);
    }
  }, [authLoading, user, fetchData]);

  useEffect(() => {
    if (splashPhase === 'visible' && minSplashDone && !authLoading && initialDataDone) {
      setSplashPhase('exiting');
    }
  }, [splashPhase, minSplashDone, authLoading, initialDataDone]);

  useEffect(() => {
    if (splashPhase !== 'exiting') return;
    const fadeTimer = window.setTimeout(() => {
      setSplashPhase('hidden');
    }, SPLASH_FADE_MS);
    return () => window.clearTimeout(fadeTimer);
  }, [splashPhase]);

  const handleDeleteExpense = async (id: string) => {
    try {
      await api.expenses.delete(id);
      await fetchData();
      toast('Expense slip deleted.', 'success');
    } catch (err: any) {
      toast(`Failed to delete expense: ${err.message}`, 'error');
    }
  };

  const splashOverlay =
    splashPhase !== 'hidden' ? (
      <AppLoader
        isExiting={splashPhase === 'exiting'}
        statusText={authLoading ? 'Checking session...' : 'Loading your ledger...'}
      />
    ) : null;

  if (authLoading) {
    return splashOverlay;
  }

  // Unauthenticated -> PIN Login
  if (!user) {
    return (
      <>
        {splashOverlay}
        <div className="min-h-screen bg-[#EEF0F4] flex justify-center text-[#0F172A]">
          <PinLogin />
        </div>
      </>
    );
  }

  const memberSummary =
    settlementMatrix?.members.find((m) => m.userId === user.id) || null;

  return (
    <>
      {splashOverlay}
      <div className="min-h-screen bg-[#EEF0F4] flex justify-center text-[#0F172A] antialiased selection:bg-[#3346D3]/15">
      <div
        id="app-container"
        className="w-full max-w-[430px] min-h-screen bg-[#F6F7F9] flex flex-col relative shadow-[0_12px_40px_-8px_rgba(15,23,42,0.12)] sm:border-x sm:border-[#E6E8EC] overflow-x-hidden"
      >
        {/* Persistent Global Top Bar */}
        <TopBar
          activeCycle={cycle}
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
          showBack={currentTab !== 'dashboard'}
          onBack={() => setCurrentTab('dashboard')}
        />

        {/* Offline Banner Pill */}
        {!isOnline && (
          <div className="fixed top-[68px] left-0 right-0 z-30 max-w-[430px] mx-auto bg-[#FEF3E2] border-b border-[#B45309]/20 px-3 py-1.5 text-center text-xs text-[#B45309] font-semibold flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D92D20] animate-pulse" />
            <span>Offline Mode · Displaying local cached ledger</span>
          </div>
        )}

        {/* View Switcher */}
        <main className="flex-1 flex flex-col">
          {currentTab === 'dashboard' && (
            <Dashboard
              cycle={cycle}
              pools={pools}
              memberSummary={memberSummary}
              recentExpenses={expenses}
              onOpenAddExpense={() => {
                setExpenseToEdit(null);
                setIsAddExpenseOpen(true);
              }}
              onNavigateToExpenses={() => setCurrentTab('expenses')}
              onNavigateToSettlement={() => setCurrentTab('settlement')}
            />
          )}

          {currentTab === 'expenses' && (
            <Expenses
              expenses={expenses}
              pools={pools}
              cycle={cycle}
              onDeleteExpense={handleDeleteExpense}
              onEditExpense={(exp) => {
                setExpenseToEdit(exp);
                setIsAddExpenseOpen(true);
              }}
            />
          )}

          {currentTab === 'settlement' && (
            <Settlement
              matrix={settlementMatrix}
              onCycleClosed={fetchData}
            />
          )}

          {currentTab === 'profile' && (
            <ProfilePage onLogout={logout} pools={pools} cycle={cycle} onDataChanged={fetchData} />
          )}
        </main>

        {/* Add/Edit Expense Bottom Sheet Modal */}
        <AddExpenseModal
          isOpen={isAddExpenseOpen}
          onClose={() => {
            setIsAddExpenseOpen(false);
            setExpenseToEdit(null);
          }}
          pools={pools}
          onExpenseAdded={fetchData}
          expenseToEdit={expenseToEdit}
        />

        {/* Fixed Bottom Navigation */}
        <BottomNav
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
          activeCycle={cycle}
        />
      </div>
    </div>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <DialogProvider>
        <MainApp />
      </DialogProvider>
    </AuthProvider>
  );
};
