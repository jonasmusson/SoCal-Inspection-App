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

    // onAuthStateChange emits INITIAL_SESSION from local storage without competing
    // for the same cross-tab auth lock as getSession(). Keeping this callback
    // synchronous also prevents signInWithPassword from waiting on profile I/O.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
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
