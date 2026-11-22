import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { api, User, ExpensePool, BillingCycle } from '../lib/api.ts';
import { getInitials } from '../lib/format.ts';

interface ProfilePageProps {
  onLogout: () => void;
  pools?: ExpensePool[];
  cycle?: BillingCycle | null;
  onDataChanged?: () => void;
}

const POOL_CHIP_STYLE: Record<string, { icon: string; iconColor: string }> = {
  MESS: { icon: 'shopping_basket', iconColor: 'text-[#3346D3]' },
  GAS: { icon: 'local_fire_department', iconColor: 'text-[#B45309]' },
  WATER: { icon: 'water_drop', iconColor: 'text-sky-600' },
  MAINTENANCE: { icon: 'build', iconColor: 'text-[#12805C]' },
};

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onLogout,
  pools = [],
  cycle: _cycle = null,
  onDataChanged,
}) => {
  const { user, updateUser, refreshUser } = useAuth();
  const { confirm } = useDialog();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [members, setMembers] = useState<User[]>([]);
  const [statusToast, setStatusToast] = useState<{
    message: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'admin'>('member');
  const [newMemberPoolIds, setNewMemberPoolIds] = useState<string[]>([]);
  const [isCreatingMember, setIsCreatingMember] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');

  const isAdmin = user?.role === 'admin';

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setStatusToast({ message, type });
    setTimeout(() => setStatusToast(null), 3000);
  };

  const loadMembers = useCallback(async () => {
    try {
      const res = await api.auth.getMembers();
      if (res.members) {
        setMembers(res.members);
      }
    } catch {
      // Fallback ignored
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    setPhoneInput(user?.phone || '');
  }, [user?.phone]);

  useEffect(() => {
    if (showAddMemberModal && pools.length > 0 && newMemberPoolIds.length === 0) {
      setNewMemberPoolIds(pools.map((p) => p.id));
    }
  }, [showAddMemberModal, pools, newMemberPoolIds.length]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setIsUploadingAvatar(true);
    setStatusToast({ message: 'Uploading profile picture...', type: 'info' });

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.auth.uploadAvatar(formData);
      updateUser({ ...user!, ...res.user });
      await refreshUser();
      await loadMembers();
      showToast('Profile picture updated!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to upload photo.', 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirm({
      title: 'Remove Profile Picture?',
      message: 'Your avatar will revert to your initials.',
      confirmLabel: 'Remove',
      tone: 'danger',
      icon: 'no_photography',
    });
    if (!ok) return;
    setIsUploadingAvatar(true);
    try {
      const res = await api.auth.deleteAvatar();
      updateUser({ ...user!, ...res.user });
      await refreshUser();
      await loadMembers();
      showToast('Profile picture removed.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove photo.', 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSavePhone = async () => {
    try {
      const res = await api.auth.updateProfile({ phone: phoneInput });
      updateUser({ ...user!, ...res.user });
      setIsEditingPhone(false);
      await loadMembers();
      showToast('Contact info updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update phone.', 'error');
    }
  };

  const handleChangeOwnPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      showToast('Both PINs must be 4 numeric digits.', 'error');
      return;
    }
    setIsChangingPin(true);
    try {
      await api.auth.changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      showToast('Your PIN has been updated!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update PIN.', 'error');
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      showToast('Please enter a name.', 'error');
      return;
    }
    if (!/^\d{4}$/.test(newMemberPin)) {
      showToast('PIN must be exactly 4 numeric digits.', 'error');
      return;
    }

    setIsCreatingMember(true);
    try {
      const res = await api.auth.createMember({
        name: newMemberName.trim(),
        pin: newMemberPin,
        phone: newMemberPhone.trim() || undefined,
        role: newMemberRole,
        poolIds: newMemberPoolIds,
      });

      setShowAddMemberModal(false);
      setNewMemberName('');
      setNewMemberPin('');
      setNewMemberPhone('');
      setNewMemberRole('member');
      setNewMemberPoolIds([]);
      await loadMembers();
      onDataChanged?.();
      showToast(`Roommate ${res.user.name} added!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to add roommate.', 'error');
    } finally {
      setIsCreatingMember(false);
    }
  };

  const handleTogglePool = async (member: User, poolId: string, currentlyEnrolled: boolean) => {
    try {
      await api.pools.setMemberEnrollment(poolId, member.id, !currentlyEnrolled);
      await loadMembers();
      if (member.id === user?.id) {
        await refreshUser();
      }
      onDataChanged?.();
      showToast(`Updated pool enrollment for ${member.name}.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update pool.', 'error');
    }
  };

  const handleResetMemberPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !/^\d{4}$/.test(resetPinValue)) {
      showToast('New PIN must be exactly 4 digits.', 'error');
      return;
    }
    try {
      await api.auth.resetMemberPin(resetTarget.id, resetPinValue);
      showToast(`PIN reset for ${resetTarget.name}.`, 'success');
      setResetTarget(null);
      setResetPinValue('');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset PIN.', 'error');
    }
  };

  const handleToggleMemberStatus = async (member: User) => {
    const nextActive = member.is_active === false;
    const actionLabel = nextActive ? 'Restore' : 'Remove';
    const ok = await confirm({
      title: `${actionLabel} ${member.name}?`,
      message: nextActive
        ? `${member.name} will be able to sign in and join expense splits again.`
        : `${member.name} will be signed out immediately and excluded from future pool splits.`,
      confirmLabel: actionLabel,
      tone: nextActive ? 'primary' : 'danger',
      icon: nextActive ? 'person_add' : 'person_off',
    });
    if (!ok) return;
    try {
      await api.auth.setMemberStatus(member.id, nextActive);
      await loadMembers();
      onDataChanged?.();
      showToast(`${member.name} ${nextActive ? 'reactivated' : 'deactivated'}.`, 'success');
    } catch (err: any) {
      showToast(err.message || `Failed to ${actionLabel} member.`, 'error');
    }
  };

  const myEnrolledPools = user?.enrolledPools || [];

  return (
    <div className="flex-1 flex flex-col relative w-full pt-[68px] pb-24 px-5 bg-[#F6F7F9] max-w-[430px] mx-auto">
      <div className="flex flex-col w-full space-y-4 pt-4 pb-6">
        {/* Status Toast */}
        {statusToast && (
          <div
            id="status-toast"
            className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              statusToast.type === 'error'
                ? 'bg-[#FEECEB] border-[#D92D20]/20 text-[#D92D20]'
                : statusToast.type === 'success'
                ? 'bg-[#0F172A] border-slate-800 text-white'
                : 'bg-white border-[#E6E8EC] text-[#0F172A]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {statusToast.type === 'error'
                ? 'error'
                : statusToast.type === 'success'
                ? 'check_circle'
                : 'info'}
            </span>
            <span>{statusToast.message}</span>
          </div>
        )}

        {/* 1. Profile Identity Card */}
        <div className="w-full bg-white rounded-2xl p-5 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="w-[72px] h-[72px] rounded-[20px] bg-[#F1F5F9] text-[#0F172A] ring-1 ring-[#E2E8F0] flex items-center justify-center text-[22px] font-bold tracking-tight overflow-hidden">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span>{getInitials(user?.name)}</span>
              )}
            </div>
            <input
              type="file"
              ref={avatarInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
            <button
              type="button"
              aria-label="Change profile photo"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-white text-[#0F172A] border border-[#E2E8F0] shadow-sm rounded-full flex items-center justify-center hover:bg-[#F8FAFC] active:scale-95 transition-colors"
              title="Upload / Change Profile Picture"
            >
              <span className="material-symbols-outlined text-[15px]">photo_camera</span>
            </button>
          </div>

          <h2 className="text-[18px] font-bold text-[#0F172A] tracking-[-0.02em] leading-tight">
            {user?.name}
          </h2>
          <p className="text-[12.5px] font-medium text-[#64748B] mt-0.5">
            {isAdmin ? 'Shared Room Admin' : 'Room Member'}
          </p>

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="text-[12px] font-semibold text-[#3346D3] hover:text-[#2736B0] flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">upload</span>
              <span>{user?.avatar_url ? 'Change photo' : 'Upload photo'}</span>
            </button>
            {user?.avatar_url && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="text-[12px] font-semibold text-[#D92D20] hover:opacity-80 flex items-center gap-1 transition-opacity"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Personal Details Card */}
        <div className="w-full bg-white rounded-2xl p-4 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-[#0F172A] tracking-[-0.01em]">
              Personal Details
            </h3>
            {!isEditingPhone && (
              <button
                type="button"
                onClick={() => setIsEditingPhone(true)}
                className="inline-flex items-center gap-1 text-[#3346D3] hover:text-[#2736B0] text-[12px] font-semibold transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#F1F5F9]">
            <label className="text-[11.5px] font-medium text-[#64748B] block">
              Mobile number
            </label>
            {isEditingPhone ? (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-[10px] bg-white border border-[#CBD5E1] text-[13px] font-mono text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3346D3]/15 focus:border-[#3346D3]"
                />
                <button
                  type="button"
                  onClick={handleSavePhone}
                  className="h-10 px-4 rounded-[10px] bg-[#3346D3] hover:bg-[#2736B0] text-white text-[12.5px] font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-1">
                <span className="text-[14px] font-semibold text-[#0F172A] tabular-nums">
                  {user?.phone ? `UAE · ${user.phone}` : 'Not set'}
                </span>
                {user?.phone && (
                  <span className="text-[11.5px] font-medium text-[#12805C] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    <span>Verified</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#F1F5F9] space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11.5px] font-medium text-[#64748B]">
                Active pool enrolments
              </span>
              <span className="text-[12px] font-medium text-[#64748B] tabular-nums">
                {myEnrolledPools.length} of {pools.length || 4}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {myEnrolledPools.length === 0 ? (
                <span className="col-span-2 text-xs text-[#64748B]">No active pools enrolled.</span>
              ) : (
                myEnrolledPools.map((p) => {
                  const style = POOL_CHIP_STYLE[p.code.toUpperCase()] || POOL_CHIP_STYLE.MESS;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-white border border-[#E6E8EC] text-[#0F172A]"
                    >
                      <span className={`material-symbols-outlined text-[16px] shrink-0 ${style.iconColor}`}>
                        {style.icon}
                      </span>
                      <span className="text-[12px] font-semibold truncate">{p.name}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 3. Security PIN Card */}
        <div className="w-full bg-white rounded-2xl p-4 border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-3.5">
          <div>
            <h3 className="text-[14px] font-bold text-[#0F172A] tracking-[-0.01em] leading-tight">
              Security PIN
            </h3>
            <p className="text-[11.5px] text-[#64748B] leading-tight mt-0.5">
              4-digit authentication for ledger access
            </p>
          </div>

          <form onSubmit={handleChangeOwnPin} className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-[#64748B] block">
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 rounded-[10px] bg-white border border-[#E2E8F0] text-sm font-mono tracking-widest text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3346D3]/15 focus:border-[#3346D3] transition-colors"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-[#64748B] block">
                  New 4-digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 rounded-[10px] bg-white border border-[#E2E8F0] text-sm font-mono tracking-widest text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#3346D3]/15 focus:border-[#3346D3] transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isChangingPin}
              className="w-full h-10 rounded-[10px] bg-[#3346D3] hover:bg-[#2736B0] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.08)] active:scale-[0.98] transition-[background-color,transform] duration-150"
            >
              <span className="material-symbols-outlined text-[16px]">key</span>
              <span>{isChangingPin ? 'Updating PIN...' : 'Update Security PIN'}</span>
            </button>
          </form>
        </div>

        {/* 4. Admin: Roommates & Pools Management Card */}
        {isAdmin && (
          <div className="w-full bg-white rounded-2xl border border-[#E6E8EC] shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-2 border-b border-[#F1F5F9]">
              <div>
                <h3 className="text-[14px] font-bold text-[#0F172A] tracking-[-0.01em]">
                  Roommates &amp; Pools ({members.filter((m) => m.is_active !== false).length})
                </h3>
                <p className="text-[11.5px] text-[#64748B] mt-0.5">
                  Manage members and pool allocations
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(true)}
                className="h-8 px-3 rounded-[10px] bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] text-[12px] font-semibold flex items-center gap-1 active:scale-95 transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[15px] text-[#3346D3]">person_add</span>
                <span>Add</span>
              </button>
            </div>

            <div className="divide-y divide-[#F1F5F9]">
              {members.map((member) => {
                const enrolledIds = new Set((member.enrolledPools || []).map((p) => p.id));
                const isInactive = member.is_active === false;

                return (
                  <div
                    key={member.id}
                    className={`p-4 space-y-3 ${isInactive ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-[10px] flex items-center justify-center font-semibold text-xs shrink-0 ${
                            member.id === user?.id
                              ? 'bg-[#F1F5F9] text-[#0F172A] ring-1 ring-[#E2E8F0]'
                              : isInactive
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-[#F8FAFC] text-[#475569] ring-1 ring-[#E6E8EC]'
                          }`}
                        >
                          {getInitials(member.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                              {member.name}
                            </span>
                            <span className="text-[11.5px] font-medium text-[#64748B]">
                              · {member.role === 'admin' ? 'Admin' : 'Member'}
                            </span>
                            {isInactive && (
                              <span className="text-[11px] font-medium text-[#94A3B8]">
                                · Archived
                              </span>
                            )}
                          </div>
                          {member.phone && (
                            <p className="text-[11.5px] text-[#64748B] tabular-nums mt-0.5">
                              {member.phone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isInactive && (
                          <button
                            type="button"
                            onClick={() => {
                              setResetTarget(member);
                              setResetPinValue('');
                            }}
                            className="h-7 px-2.5 rounded-[8px] bg-white border border-[#E2E8F0] text-[#0F172A] text-[11px] font-semibold hover:bg-[#F8FAFC] active:scale-95 transition-colors"
                          >
                            Reset PIN
                          </button>
                        )}
                        {member.id !== user?.id && (
                          <button
                            type="button"
                            onClick={() => handleToggleMemberStatus(member)}
                            className={`h-7 px-2.5 rounded-[8px] text-[11px] font-semibold active:scale-95 transition-colors ${
                              isInactive
                                ? 'text-[#12805C] hover:bg-[#E7F5EE]'
                                : 'text-[#D92D20] hover:bg-[#FEECEB]'
                            }`}
                          >
                            {isInactive ? 'Restore' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isInactive && pools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {pools.map((pool) => {
                          const active = enrolledIds.has(pool.id);
                          const shortLabel = pool.name.split('/')[0].split(' ')[0];
                          return (
                            <button
                              key={pool.id}
                              type="button"
                              onClick={() => handleTogglePool(member, pool.id, active)}
                              className={`inline-flex items-center px-2.5 h-6 rounded-[8px] text-[11px] font-semibold border transition-colors ${
                                active
                                  ? 'bg-[#EEF0FB] border-[#DDE2F7] text-[#3346D3]'
                                  : 'bg-white border-[#E6E8EC] text-[#94A3B8] line-through'
                              }`}
                            >
                              {shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Logout Button */}
        <div className="w-full space-y-2.5 pt-1">
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'Sign Out?',
                message: 'You will need your 4-digit PIN to sign back in.',
                confirmLabel: 'Sign Out',
                tone: 'danger',
                icon: 'logout',
              });
              if (ok) {
                onLogout();
              }
            }}
            className="w-full h-10 rounded-[10px] bg-white hover:bg-[#FEECEB] text-[#D92D20] border border-[#FECACA] text-[13px] font-semibold flex items-center justify-center gap-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] active:scale-[0.98] transition-colors"
          >
            <span className="material-symbols-outlined text-[17px]">logout</span>
            <span>Sign Out</span>
          </button>
          <p className="text-center text-[11px] font-medium text-[#94A3B8]">
            Split Mess · Shared Room Ledger
          </p>
        </div>
      </div>

      {/* Add Member Modal (Admin) */}
      {showAddMemberModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-[2.5px] flex items-center justify-center p-5"
          onClick={() => setShowAddMemberModal(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl border border-[#E6E8EC] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E6E8EC]">
              <h3 className="text-base font-bold text-[#0F172A]">Add New Roommate</h3>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="w-8 h-8 rounded-full bg-[#F6F7F9] text-[#64748B] flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Roommate full name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                  Initial 4-Digit PIN *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="4 digits"
                  value={newMemberPin}
                  onChange={(e) => setNewMemberPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm font-mono tracking-widest text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+971 50 000 0000"
                  value={newMemberPhone}
                  onChange={(e) => setNewMemberPhone(e.target.value)}
                  className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm font-mono text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
                />
              </div>

              {pools.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1.5">
                    Enrolled Expense Pools
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {pools.map((p) => {
                      const checked = newMemberPoolIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setNewMemberPoolIds((prev) =>
                              checked ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                            )
                          }
                          className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                            checked
                              ? 'bg-[#3346D3] text-white'
                              : 'bg-[#F6F7F9] border border-[#E6E8EC] text-[#64748B]'
                          }`}
                        >
                          {p.code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1.5">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMemberRole('member')}
                    className={`h-9 rounded-xl text-xs font-bold border ${
                      newMemberRole === 'member'
                        ? 'bg-[#3346D3] text-white border-[#3346D3]'
                        : 'bg-[#F6F7F9] text-[#64748B] border-[#E6E8EC]'
                    }`}
                  >
                    Member
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMemberRole('admin')}
                    className={`h-9 rounded-xl text-xs font-bold border ${
                      newMemberRole === 'admin'
                        ? 'bg-[#3346D3] text-white border-[#3346D3]'
                        : 'bg-[#F6F7F9] text-[#64748B] border-[#E6E8EC]'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingMember}
                className="w-full h-11 bg-[#3346D3] hover:bg-[#2736B0] text-white rounded-xl text-sm font-bold mt-1 shadow-sm"
              >
                {isCreatingMember ? 'Adding Roommate...' : 'Save Roommate'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reset PIN Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-[2.5px] flex items-center justify-center p-5"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="bg-white w-full max-w-xs rounded-2xl border border-[#E6E8EC] p-5 shadow-2xl space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-[#0F172A] text-center">
              Reset PIN for {resetTarget.name}
            </h3>
            <form onSubmit={handleResetMemberPin} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="New 4-digit PIN"
                value={resetPinValue}
                onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                className="w-full h-10 px-3 bg-[#F6F7F9] border border-[#E6E8EC] rounded-xl text-sm font-mono tracking-widest text-[#0F172A] text-center focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3346D3]"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="h-9 rounded-xl bg-[#F6F7F9] border border-[#E6E8EC] text-[#0F172A] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#3346D3] text-white text-xs font-bold"
                >
                  Reset PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
