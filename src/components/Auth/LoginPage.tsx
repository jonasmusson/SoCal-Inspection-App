import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';
import { AuthShell } from './AuthShell';

interface LoginPageProps { onSuccess: () => void; onShowSignup: () => void; }
interface SignupPageProps { onSuccess: () => void; onShowLogin: () => void; }

const inputClass = 'w-full rounded-lg border border-primary-200 bg-white px-3.5 py-3 text-sm text-primary-900 placeholder:text-primary-400 transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15';
const iconInputClass = `${inputClass} pl-10`;
const buttonClass = 'w-full rounded-lg bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'font-semibold text-accent-700 transition-colors hover:text-accent-900 hover:underline';

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">{children}</label>;
}

function PasswordInput({ id, value, onChange, placeholder, show, onToggle, required = true, minLength }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className={`${iconInputClass} pr-10`} placeholder={placeholder} required={required} minLength={minLength} />
      <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 transition-colors hover:text-primary-800">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginPage({ onSuccess, onShowSignup }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const signIn = supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 12000));
      const { error } = await Promise.race([signIn, timeout]);
      if (error) setError(error.message);
      else onSuccess();
    } catch (err) {
      setError(err instanceof Error && err.message === 'AUTH_TIMEOUT'
        ? 'Sign-in timed out. Please try again. If it continues, close other open app tabs and reload.'
        : 'Sign-in could not be completed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setForgotError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (error) setForgotError(error.message);
    else setForgotSent(true);
  };

  if (forgotMode) {
    return (
      <AuthShell eyebrow="Account recovery" title={forgotSent ? 'Check your email' : 'Reset your password'} description={forgotSent ? `We sent a secure reset link to ${email}.` : 'Enter the email used for your SoCal Autoworks account and we’ll send a secure reset link.'}>
        {forgotSent ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700"><CheckCircle className="h-6 w-6" /></div>
            <p className="text-sm leading-6 text-primary-500">Open the link in your email to choose a new password.</p>
            <button onClick={() => { setForgotMode(false); setForgotSent(false); setEmail(''); }} className={`mt-6 text-sm ${secondaryButtonClass}`}>Back to sign in</button>
          </div>
        ) : (
          <>
            <button onClick={() => setForgotMode(false)} className="mb-6 flex items-center gap-2 text-sm font-medium text-primary-500 transition-colors hover:text-primary-900"><ArrowLeft className="h-4 w-4" /> Back to sign in</button>
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div><FieldLabel htmlFor="forgot-email">Email address</FieldLabel><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={iconInputClass} placeholder="name@company.com" required /></div></div>
              {forgotError && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{forgotError}</div>}
              <button type="submit" disabled={loading} className={buttonClass}>{loading ? 'Sending link…' : 'Send reset link'}</button>
            </form>
          </>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Authorized staff access" title="Sign in to your workspace" description="Manage inspections, findings, and customer reports from one precise workspace." footer={<p className="text-sm text-primary-500">Need access? <button onClick={onShowSignup} className={secondaryButtonClass}>Request access</button></p>}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div><FieldLabel htmlFor="login-email">Email address</FieldLabel><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={iconInputClass} placeholder="name@company.com" autoComplete="email" required /></div></div>
        <div><div className="mb-2 flex items-center justify-between"><FieldLabel htmlFor="login-password">Password</FieldLabel><button type="button" onClick={() => { setForgotMode(true); setError(null); }} className="text-xs font-semibold text-accent-700 hover:text-accent-900">Forgot password?</button></div><PasswordInput id="login-password" value={password} onChange={setPassword} placeholder="Enter your password" show={showPass} onToggle={() => setShowPass((value) => !value)} /></div>
        {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm leading-5 text-danger-700">{error}</div>}
        <button type="submit" disabled={loading} className={buttonClass}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthShell>
  );
}

export function SignupPage({ onShowLogin }: SignupPageProps) {
  const OWNER_EMAIL = 'jonasmusson@gmail.com';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) { setError('Choose at least 12 characters with an uppercase letter, lowercase letter, number, and symbol. Avoid common words or reused passwords.'); return; }
    setLoading(true); setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { full_name: fullName, first_name: firstName.trim(), last_name: lastName.trim() } } });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (data.user) { if (normalizedEmail !== OWNER_EMAIL) supabase.functions.invoke('send-signup-confirmation', { body: { userId: data.user.id } }); setSubmitted(true); }
  };

  const passwordsMatch = confirmPassword === '' || password === confirmPassword;
  const normalizedEmail = email.trim().toLowerCase();

  if (submitted) {
    const isOwner = normalizedEmail === OWNER_EMAIL;
    return <AuthShell eyebrow="Access request" title={isOwner ? 'Owner account created' : 'Request submitted'} description={isOwner ? 'Your owner account is ready. You can sign in with the credentials you just created.' : 'Your request is now with the SoCal Autoworks team for review.'} compact><div className="text-center"><div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700"><CheckCircle className="h-6 w-6" /></div><p className="text-sm leading-6 text-primary-500">{isOwner ? `You can sign in now with ${email}.` : `You’ll receive an email at ${email} once your access is approved.`}</p><button onClick={onShowLogin} className={`mt-6 text-sm ${secondaryButtonClass}`}>{isOwner ? 'Continue to sign in' : 'Back to sign in'}</button></div></AuthShell>;
  }

  return (
    <AuthShell eyebrow="New staff member" title="Request access" description="Create your account details. A manager or owner will review your request before you can enter the workspace." compact footer={<p className="text-sm text-primary-500">Already have access? <button onClick={onShowLogin} className={secondaryButtonClass}>Sign in</button></p>}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3"><div><FieldLabel htmlFor="first-name">First name</FieldLabel><div className="relative"><User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={iconInputClass} placeholder="First" required /></div></div><div><FieldLabel htmlFor="last-name">Last name</FieldLabel><input id="last-name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Last" required /></div></div>
        <div><FieldLabel htmlFor="signup-email">Email address</FieldLabel><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" /><input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={iconInputClass} placeholder="name@company.com" autoComplete="email" required /></div></div>
        <div><FieldLabel htmlFor="signup-password">Password</FieldLabel><PasswordInput id="signup-password" value={password} onChange={setPassword} placeholder="Create a secure password" show={showPass} onToggle={() => setShowPass((value) => !value)} minLength={12} /><p className="mt-2 text-xs leading-5 text-primary-500">Use 12+ characters with uppercase and lowercase letters, a number, and a symbol.</p></div>
        <div><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><PasswordInput id="confirm-password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" show={showConfirm} onToggle={() => setShowConfirm((value) => !value)} /><p className={`mt-2 text-xs ${!passwordsMatch ? 'text-danger-700' : 'text-primary-500'}`}>{!passwordsMatch ? 'Passwords do not match.' : 'Your request will be reviewed before access is granted.'}</p></div>
        {error && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm leading-5 text-danger-700">{error}</div>}
        <button type="submit" disabled={loading || !passwordsMatch} className={buttonClass}>{loading ? 'Submitting request…' : 'Submit access request'}</button>
      </form>
    </AuthShell>
  );
}
