import React from 'react';
import { Users, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ExpensePool } from '../lib/api.ts';

interface PoolsProps {
  pools: ExpensePool[];
}

export const Pools: React.FC<PoolsProps> = ({ pools }) => {
  const { user } = useAuth();

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Expense Pool Rosters</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Expenses belong strictly to one pool and are split only among its active participants.
        </p>
      </div>

      <div className="space-y-3">
        {pools.map((pool) => {
          const isUserEnrolled = user?.enrolledPools?.some((ep) => ep.code === pool.code);
          return (
            <div
              key={pool.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-slate-100">
                      {pool.code}
                    </span>
                    <span className="text-xs text-slate-300 font-medium">({pool.name})</span>
                  </div>
                  {pool.description && (
                    <p className="text-xs text-slate-400 mt-1">{pool.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-slate-100 tabular-nums block">
                    AED {pool.totalAed || '0.00'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold mt-1 px-2 py-0.5 rounded-full ${
                      isUserEnrolled
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isUserEnrolled ? (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        <span>YOU ENROLLED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />
                        <span>NOT ENROLLED</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Members List */}
              <div className="mt-3 pt-3 border-t border-slate-850">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-2">
                  <Users className="w-3.5 h-3.5" />
                  <span>Enrolled Members ({pool.members?.length || 0})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pool.members?.map((m) => (
                    <span
                      key={m.id}
                      className={`text-xs px-2 py-1 rounded-lg border font-mono ${
                        m.id === user?.id
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-bold'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300'
                      }`}
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
