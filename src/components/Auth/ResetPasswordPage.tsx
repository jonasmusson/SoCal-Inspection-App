import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AuthShell } from './AuthShell';

interface ResetPasswordPageProps { onSuccess: () => void; }

export function ResetPasswordPage({ onSuccess }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(updateError.message);
    else { setDone(true); setTimeout(() => onSuccess(), 2000); }
  };

  return (
    <AuthShell eyebrow="Account recovery" title={done ? 'Password updated' : 'Set a new password'} description={done ? 'Your password has been changed successfully.' : 'Choose a new password for your SoCal Autoworks account.'}>
      {done ? (
        <div className="text-center"><div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700"><CheckCircle className="h-6 w-6" /></div><p className="text-sm text-primary-500">Taking you back to sign in…</p></div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="new-password" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">New password</label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="new-password" type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-primary-200 bg-white px-3.5 py-3 pl-10 pr-10 text-sm text-primary-900 placeholder:text-primary-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15" placeholder="At least 6 characters" required /><button type="button" onClick={() => setShowPass((value) => !value)} aria-label={showPass ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-800">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div><label htmlFor="confirm-new-password" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">Confirm password</label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="confirm-new-password" type={showPass ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-lg border border-primary-200 bg-white px-3.5 py-3 pl-10 text-sm text-primary-900 placeholder:text-primary-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15" placeholder="Re-enter your password" required /></div></div>
          {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Updating password…' : 'Update password'}</button>
        </form>
      )}
    </AuthShell>
  );
}
