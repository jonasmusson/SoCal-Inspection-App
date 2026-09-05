import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage, SignupPage } from './components/Auth/LoginPage';
import { ResetPasswordPage } from './components/Auth/ResetPasswordPage';
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <p className="text-gray-700 font-medium mb-2">Could not load your profile.</p>
        <p className="text-gray-500 text-sm mb-6">This is usually a network or permissions issue.</p>
        <button onClick={retryProfile}
          className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 mr-3">
          Retry
        </button>
        <button onClick={signOut}
          className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50">
          Sign Out
        </button>
      </div>
    </div>
  );
}

function PendingApprovalScreen() {
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning-100 mb-4">
            <Clock className="w-8 h-8 text-warning-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Account Pending Approval</h2>
          <p className="text-gray-500 text-sm mb-2">
            Hi {profile?.first_name || profile?.full_name?.split(' ')[0]}, your account request is being reviewed.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            You'll receive a welcome email at <strong className="text-gray-600">{profile?.email}</strong> once a manager or owner approves your account.
          </p>
          <button onClick={signOut}
            className="flex items-center gap-2 mx-auto text-gray-500 hover:text-gray-800 text-sm font-medium">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, profile, loading, profileError, isManager, isOwner, isPending, isPasswordRecovery, clearPasswordRecovery } = useAuth();
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
