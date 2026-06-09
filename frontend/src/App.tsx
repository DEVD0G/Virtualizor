import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import AuditPage from './pages/AuditPage';
import CreateVmPage from './pages/CreateVmPage';
import DashboardPage from './pages/DashboardPage';
import LicensePage from './pages/LicensePage';
import LoginPage from './pages/LoginPage';
import NodesPage from './pages/NodesPage';
import UsersPage from './pages/UsersPage';
import VmDetailPage from './pages/VmDetailPage';
import VmListPage from './pages/VmListPage';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Lade…
      </div>
    );
  }

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
        <Route path="/users" element={<UsersPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/license" element={<LicensePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
