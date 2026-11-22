export interface User {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'external';
  phone?: string;
  avatar_url?: string | null;
  is_active?: boolean;
  enrolledPools?: Array<{ id: string; code: string; name: string }>;
}

export interface ExpensePool {
  id: string;
  code: string;
  name: string;
  description?: string;
  totalFils?: number;
  totalAed?: string;
  enrolledCount?: number;
  members?: Array<{ id: string; name: string; role: string }>;
}

export interface BillingCycle {
  id: string;
  cycleCode: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed' | 'settled';
  totalExpenseFils: number;
  totalExpenseAed: string;
}

export interface Expense {
  id: string;
  cycleId: string;
  poolId: string;
  poolCode: string;
  poolName: string;
  payerId: string;
  payerName: string;
  amountFils: number;
  amountAed: string;
  description: string;
  expenseDate: string;
  receiptUrl: string | null;
  receiptMimeType: string | null;
  createdAt: string;
}

export interface MemberSettlement {
  userId: string;
  userName: string;
  role: string;
  openingCreditFils: number;
  openingCreditAed: string;
  poolObligationsFils: number;
  poolObligationsAed: string;
  outOfPocketPaidFils: number;
  outOfPocketPaidAed: string;
  netPayableFils: number;
  netPayableAed: string;
  netBalanceFils: number;
  netBalanceAed: string;
  position: 'CREDIT' | 'DEBT' | 'SETTLED';
  nextCycleOpeningCreditFils: number;
  nextCycleOpeningCreditAed: string;
}

export interface SettlementMatrix {
  cycleCode: string;
  cycleId: string;
  totalExpensesFils: number;
  totalExpensesAed: string;
  poolBreakdowns: Record<string, {
    poolCode: string;
    poolName: string;
    totalFils: number;
    memberCount: number;
    shares: Record<string, number>;
  }>;
  members: MemberSettlement[];
  invariantCheck: {
    totalPoolExpensesFils: number;
    totalAllocatedSharesFils: number;
    deltaFils: number;
    isConserved: boolean;
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  auth: {
    login: (userId: string, pin: string) =>
      request<{ user: User }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pin }),
      }),
    register: (data: { name: string; pin: string; phone?: string; role?: string }) =>
      request<{ message: string; user: User }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      }),
    session: () => request<{ authenticated: boolean; user: User | null }>('/api/auth/session'),
    me: () => request<{ user: User }>('/api/auth/me'),
    getUsers: () => request<{ users: User[] }>('/api/auth/users'),
    getMembers: () => request<{ members: User[] }>('/api/auth/members'),
    createMember: (data: { name: string; pin: string; phone?: string; role?: string; poolIds?: string[] }) =>
      request<{ message: string; user: User }>('/api/auth/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    changePin: (currentPin: string, newPin: string) =>
      request<{ message: string }>('/api/auth/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin }),
      }),
    resetMemberPin: (userId: string, newPin: string) =>
      request<{ message: string }>(`/api/auth/members/${userId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPin }),
      }),
    setMemberStatus: (userId: string, isActive: boolean) =>
      request<{ message: string; user: User }>(`/api/auth/members/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      }),
    uploadAvatar: (formData: FormData) =>
      request<{ message: string; avatarUrl: string; user: User }>('/api/auth/avatar', {
        method: 'POST',
        body: formData,
      }),
    deleteAvatar: () =>
      request<{ message: string; user: User }>('/api/auth/avatar', {
        method: 'DELETE',
      }),
    updateProfile: (data: { name?: string; phone?: string; avatarUrl?: string }) =>
      request<{ message: string; user: User }>('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },

  cycles: {
    getCurrent: () =>
      request<{ cycle: BillingCycle; pools: ExpensePool[] }>('/api/cycles/current'),
    close: () =>
      request<{
        message: string;
        closedCycleCode: string;
        nextCycleCode: string;
        settledMembersCount: number;
        totalExpensesAed: string;
      }>('/api/cycles/close', {
        method: 'POST',
      }),
  },

  pools: {
    getAll: () => request<{ pools: ExpensePool[] }>('/api/pools'),
    setMemberEnrollment: (poolId: string, userId: string, isActive: boolean) =>
      request<{ message: string; poolId: string; userId: string; isActive: boolean }>(
        `/api/pools/${poolId}/members/${userId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        }
      ),
  },

  expenses: {
    getAll: (params?: { cycleId?: string; poolId?: string; payerId?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.cycleId) searchParams.append('cycleId', params.cycleId);
      if (params?.poolId) searchParams.append('poolId', params.poolId);
      if (params?.payerId) searchParams.append('payerId', params.payerId);
      const queryStr = searchParams.toString();
      return request<{ expenses: Expense[] }>(`/api/expenses${queryStr ? `?${queryStr}` : ''}`);
    },
    create: (formData: FormData) =>
      request<{ message: string; expense: Expense }>('/api/expenses', {
        method: 'POST',
        body: formData,
      }),
    update: (id: string, formData: FormData) =>
      request<{ message: string; expense: Expense }>(`/api/expenses/${id}`, {
        method: 'PUT',
        body: formData,
      }),
    delete: (id: string) =>
      request<{ message: string }>(`/api/expenses/${id}`, {
        method: 'DELETE',
      }),
  },

  settlement: {
    getCurrent: () => request<SettlementMatrix>('/api/settlement/current'),
    getHistory: () => request<{ history: any[] }>('/api/settlement/history'),
    updateSnapshotStatus: (snapshotId: string, status: 'settled' | 'pending', notes?: string) =>
      request<{ message: string; snapshot: any }>(`/api/settlement/snapshots/${snapshotId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      }),
  },
};
