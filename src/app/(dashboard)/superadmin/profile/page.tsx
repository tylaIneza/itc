'use client';
import { useState } from 'react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { UserCog, KeyRound, Save } from 'lucide-react';

export default function SuperadminProfilePage() {
  const { user, loading: authLoading } = useAuth();

  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileInit, setProfileInit] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);

  if (user && !profileInit) {
    setProfileForm({ name: user.name, email: user.email });
    setProfileInit(true);
  }

  const saveProfile = async () => {
    if (!profileForm.name || !profileForm.email) {
      toast.error('Name and email are required'); return;
    }
    setSavingProfile(true);
    try {
      await authApi.updateProfile(profileForm);
      toast.success('Profile updated');
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to update profile');
    } finally { setSavingProfile(false); }
  };

  const savePassword = async () => {
    if (!pwForm.current_password || !pwForm.new_password) {
      toast.error('Both current and new password are required'); return;
    }
    if (pwForm.new_password.length < 8) {
      toast.error('New password must be at least 8 characters'); return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('New password and confirmation do not match'); return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(pwForm);
      toast.success('Password changed');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to change password');
    } finally { setSavingPw(false); }
  };

  if (authLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <UserCog className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Superadmin Account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Update your own name, email, and password</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-gray-900 dark:text-white">Profile</h2>
        <div>
          <label className="label">Name</label>
          <input value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
            className="input" placeholder="Full name" />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
            className="input" placeholder="you@example.com" />
        </div>
        <button onClick={saveProfile} disabled={savingProfile} className="btn-primary">
          <Save className="w-4 h-4" /> {savingProfile ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400" /> Change Password
        </h2>
        <div>
          <label className="label">Current Password</label>
          <input type="password" value={pwForm.current_password}
            onChange={e => setPwForm({ ...pwForm, current_password: e.target.value })}
            className="input" placeholder="Current password" />
        </div>
        <div>
          <label className="label">New Password</label>
          <input type="password" value={pwForm.new_password}
            onChange={e => setPwForm({ ...pwForm, new_password: e.target.value })}
            className="input" placeholder="Minimum 8 characters" />
        </div>
        <div>
          <label className="label">Confirm New Password</label>
          <input type="password" value={pwForm.confirm_password}
            onChange={e => setPwForm({ ...pwForm, confirm_password: e.target.value })}
            className="input" placeholder="Re-enter new password" />
        </div>
        <button onClick={savePassword} disabled={savingPw} className="btn-primary">
          <KeyRound className="w-4 h-4" /> {savingPw ? 'Changing…' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
