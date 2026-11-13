import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, CheckCircle, ArrowLeft, Car } from 'lucide-react';

interface LoginPageProps { onSuccess: () => void; onShowSignup: () => void; }
interface SignupPageProps { onSuccess: () => void; onShowLogin: () => void; }

function Brand() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-500 mb-4 shadow-elevated">
        <Car className="w-7 h-7 text-primary-900" />
      </div>
      <h1 className="font-display text-3xl tracking-wide text-primary-900">SoCAL AUTOWORKS</h1>
      <p className="text-xs text-gray-500 mt-1 uppercase tracking-[0.2em]">Inspection Management System</p>
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
      const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 12000)
      );
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSent(true);
    }
  };

  if (forgotMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full animate-slide-up">
          <Brand />
          <div className="bg-white rounded-2xl shadow-elevated p-8">
            {forgotSent ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success-100 mb-4">
                  <CheckCircle className="w-7 h-7 text-success-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Check your email</h2>
                <p className="text-gray-600 mb-6">
                  We've sent a password reset link to <strong className="text-gray-800">{email}</strong>.
                  Click the link in the email to set a new password.
                </p>
                <button onClick={() => { setForgotMode(false); setForgotSent(false); setEmail(''); }}
                  className="text-accent-600 font-medium hover:underline text-sm">
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setForgotMode(false)}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-4 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back to Sign In
                </button>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Reset Password</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition-all"
                        placeholder="your@email.com" required />
                    </div>
                  </div>
                  {forgotError && <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{forgotError}</div>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 px-4 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full animate-slide-up">
        <Brand />
        <div className="bg-white rounded-2xl shadow-elevated p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Sign In</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your credentials to access the inspection system</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition-all"
                  placeholder="your@email.com" required />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <button type="button" onClick={() => { setForgotMode(true); setError(null); }}
                  className="text-xs text-accent-600 font-medium hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition-all"
                  placeholder="Enter password" required />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm animate-fade-in">{error}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 px-4 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors active:scale-[0.98]">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-6 text-center border-t border-gray-100 pt-6">
            <p className="text-gray-600 text-sm">Don't have an account?{' '}
              <button onClick={onShowSignup} className="text-accent-600 font-semibold hover:underline">Request Access</button>
            </p>
          </div>
        </div>
      </div>
    </div>
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
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Choose at least 12 characters with an uppercase letter, lowercase letter, number, and symbol. Avoid common words or reused passwords.');
      return;
    }
    setLoading(true);
    setError(null);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName, first_name: firstName.trim(), last_name: lastName.trim() } },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (data.user) {
      if (email.trim().toLowerCase() !== OWNER_EMAIL) {
        supabase.functions.invoke('send-signup-confirmation', { body: { userId: data.user.id } });
      }
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md w-full text-center animate-slide-up">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success-100 mb-4">
            <CheckCircle className="w-7 h-7 text-success-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{email.trim().toLowerCase() === OWNER_EMAIL ? 'Owner account created' : 'Access request submitted'}</h2>
          {email.trim().toLowerCase() === OWNER_EMAIL ? (
            <p className="text-gray-500 text-sm">Your Owner account is activated automatically. You can sign in now with <strong className="text-gray-700">{email}</strong>.</p>
          ) : (
            <>
              <p className="text-gray-600 mb-2">Your account is pending approval.</p>
              <p className="text-gray-500 text-sm">A manager or owner will review your request. You'll receive a welcome email at <strong className="text-gray-700">{email}</strong> once approved.</p>
            </>
          )}
          <button onClick={onShowLogin} className="mt-8 text-accent-600 font-semibold hover:underline text-sm">{email.trim().toLowerCase() === OWNER_EMAIL ? 'Continue to Sign In' : 'Back to Sign In'}</button>
        </div>
      </div>
    );
  }

  const passwordsMatch = confirmPassword === '' || password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8">
      <div className="max-w-md w-full animate-slide-up">
        <Brand />
        <div className="bg-white rounded-2xl shadow-elevated p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Create Account</h2>
          <p className="text-sm text-gray-500 mb-6">Request access to the inspection system</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none text-sm transition-all"
                    placeholder="John" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none text-sm transition-all"
                  placeholder="Smith" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition-all"
                  placeholder="your@email.com" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none transition-all"
                  placeholder="Create a secure password" required minLength={12} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                Use 12+ characters with uppercase and lowercase letters, a number, and a symbol. Avoid common words and passwords used on other sites.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-accent-400 outline-none transition-all ${!passwordsMatch ? 'border-danger-400 bg-danger-50' : 'border-gray-300'}`}
                  placeholder="Re-enter password" required />
                <button type="button" onClick={() => setShowConfirm(p => !p)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {!passwordsMatch && (
                <p className="mt-1 text-xs text-danger-600">Passwords do not match</p>
              )}
            </div>

            <div className="p-3 bg-accent-50 rounded-xl border border-accent-100">
              <p className="text-xs text-accent-800 leading-relaxed">
                The designated Owner account is activated automatically. All other accounts require approval from an Owner or Manager.
              </p>
            </div>

            {error && <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm animate-fade-in">{error}</div>}
            <button type="submit" disabled={loading || !passwordsMatch}
              className="w-full py-3 px-4 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl disabled:opacity-50 transition-colors active:scale-[0.98]">
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
          <div className="mt-6 text-center border-t border-gray-100 pt-6">
            <p className="text-gray-600 text-sm">Already have an account?{' '}
              <button onClick={onShowLogin} className="text-accent-600 font-semibold hover:underline">Sign In</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
