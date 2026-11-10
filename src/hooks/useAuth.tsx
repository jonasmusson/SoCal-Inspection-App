import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';
import { withTimeout } from '../lib/async';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  profileError: boolean;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
  isManager: boolean;
  isTech: boolean;
  isOwner: boolean;
  isPending: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      8000,
      'Profile load timed out',
    );
    if (error) console.error('fetchProfile error:', error.message, error.code, error.details);
    return data ?? null;
  } catch {
    return null;
  }
}

async function fetchProfileWithRetry(userId: string): Promise<UserProfile | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await fetchProfile(userId);
    if (data) return data;
    if (attempt < 1) await new Promise(r => setTimeout(r, 600));
  }
  return null;
}

// With detectSessionInUrl disabled, the Supabase client does NOT parse the
// URL hash automatically. We do it ourselves so we can detect recovery links
// and establish the session at the right time (after the listener is set up).
function parseHashParams(): Record<string, string> {
  const hash = window.location.hash.replace(/^#/, '');
  const params: Record<string, string> = {};
  for (const pair of hash.split('&')) {
    const [key, value] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
  }
  return params;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const authGeneration = useRef(0);

  const loadProfile = async (userId: string) => {
    const data = await fetchProfileWithRetry(userId);
    setProfile(data);
    setProfileError(!data);
    return data;
  };

  const retryProfile = async () => {
    if (!user) return;
    setProfileError(false);
    await loadProfile(user.id);
  };

  useEffect(() => {
    let mounted = true;

    // Check if the current URL is a password-recovery link.
    const hashParams = parseHashParams();
    const isRecoveryLink = hashParams.type === 'recovery' && !!hashParams.access_token;

    if (isRecoveryLink) {
      setIsPasswordRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // During password recovery, skip profile loading — just show the
          // reset screen so the user can set a new password.
          if (event === 'PASSWORD_RECOVERY') {
            setLoading(false);
            return;
          }
          setLoading(true);
          const userId = newSession.user.id;
          const generation = ++authGeneration.current;
          window.setTimeout(async () => {
            if (!mounted) return;
            await loadProfile(userId);
            if (mounted && generation === authGeneration.current) setLoading(false);
          }, 0);
        } else {
          authGeneration.current += 1;
          setProfile(null);
          setProfileError(false);
          setLoading(false);
        }
      }
    );

    if (isRecoveryLink) {
      // With detectSessionInUrl disabled, the Supabase client won't parse
      // the URL hash on its own. We manually feed the tokens from the hash
      // into the client so it establishes a valid session — which fires the
      // PASSWORD_RECOVERY event to our listener above, and gives
      // supabase.auth.updateUser() a session to work with on submit.
      const { access_token, refresh_token } = hashParams;
      if (access_token && refresh_token) {
        supabase.auth.setSession({
          access_token,
          refresh_token,
        }).then(({ data }) => {
          if (!mounted) return;
          if (data.session) {
            setSession(data.session);
            setUser(data.session.user);
          }
          setLoading(false);
        }).catch(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
      // Clean the hash from the URL so it doesn't linger after reload
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 10000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setProfileError(false);
  };

  const isManager = profile?.role === 'manager' || profile?.role === 'owner';
  const isTech = profile?.role === 'tech';
  const isOwner = profile?.role === 'owner';
  const isPending = profile?.status === 'pending';

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, profileError, signOut, retryProfile, isManager, isTech, isOwner, isPending, isPasswordRecovery, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
