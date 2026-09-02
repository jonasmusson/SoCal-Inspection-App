import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';

interface LoginPageProps { onSuccess: () => void; onShowSignup: () => void; }
interface SignupPageProps { onSuccess: () => void; onShowLogin: () => void; }

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else onSuccess();
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <img src="/image.png" alt="SoCal Autoworks" className="h-20 mx-auto mb-4 object-contain" />
            <p className="text-gray-500 mt-2">Inspection Management System</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {forgotSent ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
                  <CheckCircle className="w-8 h-8 text-success-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Check your email</h2>
                <p className="text-gray-600 mb-6">
                  We've sent a password reset link to <strong className="text-gray-800">{email}</strong>.
                  Click the link in the email to set a new password.
                </p>
                <button onClick={() => { setForgotMode(false); setForgotSent(false); setEmail(''); }}
                  className="text-primary-600 font-medium hover:underline text-sm">
                  Back to Sign In
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setForgotMode(false)}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-4">
                  <ArrowLeft className="w-4 h-4" /> Back to Sign In
                </button>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Reset Password</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                        placeholder="your@email.com" required />
                    </div>
                  </div>
                  {forgotError && <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{forgotError}</div>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl disabled:opacity-50">
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/image.png" alt="SoCal Autoworks" className="h-20 mx-auto mb-4 object-contain" />
          <p className="text-gray-500 mt-2">Inspection Management System</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="your@email.com" required />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <button type="button" onClick={() => { setForgotMode(true); setError(null); }}
                  className="text-xs text-primary-600 font-medium hover:underline">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Enter password" required />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {error && <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl disabled:opacity-50">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-gray-600">Don't have an account?{' '}
              <button onClick={onShowSignup} className="text-primary-600 font-medium hover:underline">Request Access</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignupPage({ onShowLogin }: SignupPageProps) {
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
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError(null);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (data.user) {
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: 'tech',
        status: 'pending',
      });
      if (profileError) { setError(profileError.message); setLoading(false); return; }
      // Fire-and-forget — don't block the UI on email delivery
      supabase.functions.invoke('send-signup-confirmation', { body: { userId: data.user.id } });
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Thanks for signing up!</h2>
          <p className="text-gray-600 mb-2">Your request has been submitted and is pending approval.</p>
          <p className="text-gray-500 text-sm">A manager or owner will review your request shortly. You'll receive a welcome email at <strong className="text-gray-700">{email}</strong> once your account is approved.</p>
          <button onClick={onShowLogin} className="mt-8 text-primary-600 font-medium hover:underline text-sm">Back to Sign In</button>
        </div>
      </div>
    );
  }

  const passwordsMatch = confirmPassword === '' || password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/image.png" alt="SoCal Autoworks" className="h-20 mx-auto mb-4 object-contain" />
          <p className="text-gray-500 mt-1 text-sm">Request access to the inspection system</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Create Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                    placeholder="John" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  placeholder="Smith" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="your@email.com" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
                  placeholder="Min. 6 characters" required minLength={6} />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${!passwordsMatch ? 'border-danger-400 bg-danger-50' : 'border-gray-300'}`}
                  placeholder="Re-enter password" required />
                <button type="button" onClick={() => setShowConfirm(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {!passwordsMatch && (
                <p className="mt-1 text-xs text-danger-600">Passwords do not match</p>
              )}
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">
                Your request will be reviewed by a manager or owner. You'll receive a welcome email once your account is approved.
              </p>
            </div>

            {error && <div className="p-3 bg-danger-50 text-danger-700 rounded-lg text-sm">{error}</div>}
            <button type="submit" disabled={loading || !passwordsMatch}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl disabled:opacity-50">
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-gray-600">Already have an account?{' '}
              <button onClick={onShowLogin} className="text-primary-600 font-medium hover:underline">Sign In</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
