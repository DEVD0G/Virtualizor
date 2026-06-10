import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import ActivationPage from './pages/ActivationPage';
import ApiKeysPage from './pages/ApiKeysPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import CreateVmPage from './pages/CreateVmPage';
import DashboardPage from './pages/DashboardPage';
import LicensePage from './pages/LicensePage';
import LoginPage from './pages/LoginPage';
import NodesPage from './pages/NodesPage';
import StoragePage from './pages/StoragePage';
import UsersPage from './pages/UsersPage';
import VmDetailPage from './pages/VmDetailPage';
import VmListPage from './pages/VmListPage';

type InstallPhase = 'locked' | 'activating' | 'active';

interface PhaseState {
  phase: InstallPhase | null;
  loading: boolean;
}

/**
 * Fetch the system phase once on app startup (before auth state is known).
 * This is intentionally a lightweight hook that only runs the request once.
 */
function useSystemPhase(): PhaseState {
  const [state, setState] = useState<PhaseState>({ phase: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/v1/license/system-state');
        if (!res.ok) {
          // If the endpoint fails we assume active and let normal auth flow handle things.
          if (!cancelled) setState({ phase: 'active', loading: false });
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState({ phase: (data.phase as InstallPhase) ?? 'active', loading: false });
        }
      } catch {
        // Network error or server not yet up — assume active to avoid blocking the app.
        if (!cancelled) setState({ phase: 'active', loading: false });
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { phase, loading: phaseLoading } = useSystemPhase();

  // Show a spinner until both the auth check and the phase check complete.
  if (phaseLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Lade…
      </div>
    );
  }

  // Pre-auth check: if the system is not fully activated, show the activation
  // screen regardless of auth state.
  if (phase === 'locked' || phase === 'activating') {
    return <ActivationPage />;
  }

  // Normal auth flow.
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/vms" element={<VmListPage />} />
        <Route path="/vms/new" element={<CreateVmPage />} />
        <Route path="/vms/:id" element={<VmDetailPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/license" element={<LicensePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
