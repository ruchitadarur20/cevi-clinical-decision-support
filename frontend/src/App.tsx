import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import type { Permission } from '@/lib/types';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui/feedback';
import LoginPage from '@/pages/LoginPage';
import OverviewPage from '@/pages/OverviewPage';
import { EmptyState } from '@/components/ui/feedback';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const PatientsPage = lazy(() => import('@/pages/PatientsPage'));
const PatientDetailPage = lazy(() => import('@/pages/PatientDetailPage'));
const RecordsPage = lazy(() => import('@/pages/RecordsPage'));
const ImagingPage = lazy(() => import('@/pages/ImagingPage'));
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission))
    return (
      <EmptyState
        title="You don't have access to this area"
        description="Your role does not include this permission. Access is enforced by the API as well as the interface."
        action={<Button asChild variant="outline" size="sm"><Link to="/">Back to overview</Link></Button>}
      />
    );
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<OverviewPage />} />
          <Route path="patients" element={<Guard permission="patients:read"><PatientsPage /></Guard>} />
          <Route path="patients/:id" element={<Guard permission="patients:read"><PatientDetailPage /></Guard>} />
          <Route path="records" element={<Guard permission="records:read"><RecordsPage /></Guard>} />
          <Route path="imaging" element={<Guard permission="images:read"><ImagingPage /></Guard>} />
          <Route path="analysis" element={<Guard permission="analyses:read"><AnalysisPage /></Guard>} />
          <Route path="history" element={<Guard permission="analyses:read"><HistoryPage /></Guard>} />
          <Route path="analytics" element={<Guard permission="analytics:read"><AnalyticsPage /></Guard>} />
          <Route path="users" element={<Guard permission="users:manage"><UsersPage /></Guard>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Button asChild variant="outline" size="sm"><Link to="/">Go to overview</Link></Button>} />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
