import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

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
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) console.error('fetchProfile error:', error.message, error.code, error.details);
  return data ?? null;
}

async function fetchProfileWithRetry(userId: string): Promise<UserProfile | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const data = await fetchProfile(userId);
    if (data) return data;
    if (attempt < 3) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const initialized = useRef(false);

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

    // Use getSession() to initialize — this is the Supabase v2 recommended pattern.
    // It ensures the HTTP client has the access token set before any DB queries run,
    // unlike relying on onAuthStateChange alone which can fire before the token propagates.
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        await loadProfile(initialSession.user.id);
      }

      setLoading(false);
      initialized.current = true;
    });

    // Listen for subsequent auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        // Skip INITIAL_SESSION — handled by getSession() above
        if (!initialized.current) return;

        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          setProfileError(false);
        }
      }
    );

    const timeout = setTimeout(() => {
      if (!initialized.current && mounted) {
        setLoading(false);
      }
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
