import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage, SignupPage } from './components/Auth/LoginPage';
import { ResetPasswordPage } from './components/Auth/ResetPasswordPage';
import { AuthShell } from './components/Auth/AuthShell';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { MyInspectionsPage } from './pages/MyInspectionsPage';
import { InspectionDetailPage } from './pages/InspectionDetailPage';
import { InspectSectionPage } from './pages/InspectSectionPage';
import { ReviewInspectionPage } from './pages/ReviewInspectionPage';
import { SettingsPage } from './pages/SettingsPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { CheckInPage } from './pages/CheckInPage';
import { PublicReportPage } from './pages/PublicReportPage';
import { supabase, supabaseConfigured } from './lib/supabase';
import { Clock, LogOut } from 'lucide-react';

// Navigates to the first incomplete section, falling back to section 1
function InspectRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (!id) return;
    supabase
      .from('inspection_sections')
      .select('section_number, completed_at')
      .eq('inspection_id', id)
      .order('section_number')
      .then(({ data }) => {
        const target = data?.find(s => !s.completed_at)?.section_number ?? data?.[0]?.section_number ?? 1;
        navigate(`/inspect/${id}/${target}`, { replace: true });
      });
  }, [id]);
  return <div className="p-4 text-center text-gray-500">Loading...</div>;
}

function ProfileErrorScreen() {
  const { retryProfile, signOut } = useAuth();
  return (
    <AuthShell eyebrow="Workspace access" title="Profile unavailable" description="We could not load your staff profile. This is usually a temporary connection or permissions issue." compact>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={retryProfile} className="flex-1 rounded-lg bg-primary-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-800">Retry</button>
        <button onClick={signOut} className="flex-1 rounded-lg border border-primary-200 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50">Sign out</button>
      </div>
    </AuthShell>
  );
}

function PendingApprovalScreen() {
  const { signOut, profile } = useAuth();
  return (
    <AuthShell eyebrow="Access request" title="Approval in progress" description={`Hi ${profile?.first_name || profile?.full_name?.split(' ')[0] || 'there'}, your account request is being reviewed.`} compact>
      <div className="text-center"><div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-warning-50 text-warning-700"><Clock className="h-6 w-6" /></div><p className="text-sm leading-6 text-primary-500">You’ll receive a welcome email at <strong className="font-semibold text-primary-800">{profile?.email}</strong> once a manager or owner approves your account.</p><button onClick={signOut} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-950"><LogOut className="h-4 w-4" /> Sign out</button></div>
    </AuthShell>
  );
}

function DeactivatedScreen() {
  const { signOut } = useAuth();
  return (
    <AuthShell eyebrow="Workspace access" title="Account deactivated" description="Your account has been deactivated by an administrator. Contact your shop manager if you believe this is an error." compact>
      <div className="text-center"><div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-700"><LogOut className="h-6 w-6" /></div><button onClick={signOut} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-950"><LogOut className="h-4 w-4" /> Sign out</button></div>
    </AuthShell>
  );
}

function AppRoutes() {
  const { user, profile, loading, profileError, isManager, isOwner, isPending, isDeactivated, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const location = useLocation();
  const [showSignup, setShowSignup] = useState(false);

  if (location.pathname.startsWith('/report/')) {
    return <Routes><Route path="/report/:token" element={<PublicReportPage />} /></Routes>;
  }

  if (loading) return <LoadingScreen />;

  if (isPasswordRecovery) {
    return <ResetPasswordPage onSuccess={() => { clearPasswordRecovery(); }} />;
  }

  if (!user) {
    return showSignup
      ? <SignupPage onSuccess={() => setShowSignup(false)} onShowLogin={() => setShowSignup(false)} />
      : <LoginPage onSuccess={() => {}} onShowSignup={() => setShowSignup(true)} />;
  }

  if (profileError || (!profile && !loading)) {
    return <ProfileErrorScreen />;
  }

  if (isDeactivated) {
    return <DeactivatedScreen />;
  }

  if (isPending) {
    return <PendingApprovalScreen />;
  }

  const defaultRoute = profile?.role === 'tech' ? '/my-inspections' : '/dashboard';

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/dashboard" element={isManager || isOwner ? <DashboardPage /> : <Navigate to="/my-inspections" replace />} />
        <Route path="/my-inspections" element={<MyInspectionsPage />} />
        <Route path="/checkin" element={isManager || isOwner ? <CheckInPage /> : <Navigate to="/my-inspections" replace />} />
        <Route path="/checkin/:draftId" element={isManager || isOwner ? <CheckInPage /> : <Navigate to="/my-inspections" replace />} />
        <Route path="/inspection/:id" element={<InspectionDetailPage />} />
        <Route path="/inspect/:id" element={<InspectRedirect />} />
        <Route path="/inspect/:id/:sectionNumber" element={<InspectSectionPage />} />
        <Route path="/review/:id" element={isManager || isOwner ? <ReviewInspectionPage /> : <Navigate to="/my-inspections" replace />} />
        <Route path="/settings" element={isManager || isOwner ? <SettingsPage /> : <Navigate to="/my-inspections" replace />} />
        <Route path="/templates" element={isOwner ? <TemplatesPage /> : <Navigate to={defaultRoute} replace />} />
        <Route path="/templates/:id" element={isOwner ? <TemplateEditorPage /> : <Navigate to={defaultRoute} replace />} />
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </Layout>
  );
}

function App() {
  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-gray-900 p-8 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">SoCal Autoworks</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Database connection required</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            This deployment is ready, but it has not been connected to the existing Supabase project.
            Add the Supabase URL and anonymous key in the Bolt project settings, then publish again.
          </p>
        </div>
      </div>
    );
  }
  return (
    <BrowserRouter>
      <AuthProvider><AppRoutes /></AuthProvider>
    </BrowserRouter>
  );
}

export default App;
