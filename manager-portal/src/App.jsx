import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { LoadingState } from './components/PortalDesignSystem';
import StaffLayout from './components/StaffLayout';
import { SelectedCsaProvider } from './context/SelectedCsaContext';
import { getManagerToken, getReadyRouteStaffToken } from './services/auth';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AccessCodesPage = lazy(() => import('./pages/AccessCodesPage'));
const AdminSupportPage = lazy(() => import('./pages/AdminSupportPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const CsaPage = lazy(() => import('./pages/CsaPage'));
const DebugGoogleMapPage = lazy(() => import('./pages/DebugGoogleMapPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const DriverInvitePage = lazy(() => import('./pages/DriverInvitePage'));
const FleetMapPage = lazy(() => import('./pages/FleetMapPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const KnowledgeActivityPage = lazy(() => import('./pages/KnowledgeActivityPage'));
const ManifestPage = lazy(() => import('./pages/ManifestPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const RraTestPage = lazy(() => import('./pages/RraTestPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const RoutePage = lazy(() => import('./pages/RoutePage'));
const RoutesPage = lazy(() => import('./pages/RoutesPage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));
const StaffAcceptInvitePage = lazy(() => import('./pages/StaffAcceptInvitePage'));
const StaffCompaniesPage = lazy(() => import('./pages/StaffCompaniesPage'));
const StaffCompanySupportViewPage = lazy(() => import('./pages/StaffCompanySupportViewPage'));
const StaffLoginPage = lazy(() => import('./pages/StaffLoginPage'));
const StaffOperatingCostsPage = lazy(() => import('./pages/StaffOperatingCostsPage'));
const StaffResetPasswordPage = lazy(() => import('./pages/StaffResetPasswordPage'));
const StaffSettingsPage = lazy(() => import('./pages/StaffSettingsPage'));
const StaffUsersPage = lazy(() => import('./pages/StaffUsersPage'));
const TimeCommitsPage = lazy(() => import('./pages/TimeCommitsPage'));
const StartTrialPage = lazy(() => import('./pages/StartTrialPage'));
const TrialActivatePage = lazy(() => import('./pages/TrialActivatePage'));
const VedrPage = lazy(() => import('./pages/VedrPage'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage'));

function RouteLoadingFallback() {
  return (
    <LoadingState
      className="page-loading-card"
      title="Loading page"
      variant="card"
    />
  );
}

function RequireAuth({ children }) {
  const location = useLocation();
  const token = getManagerToken();

  if (!token) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  return children;
}

function RequireStaffAuth({ children }) {
  const location = useLocation();
  const token = getReadyRouteStaffToken();

  if (!token) {
    return <Navigate replace state={{ from: location.pathname }} to="/readyroute/login" />;
  }

  return children;
}

function ProtectedApp() {
  return (
    <ErrorBoundary>
      <SelectedCsaProvider>
        <Layout>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route element={<DashboardPage />} path="/" />
              <Route element={<CsaPage />} path="/csa" />
              <Route element={<ManifestPage />} path="/manifest" />
              <Route element={<NotificationsPage />} path="/notifications" />
              <Route element={<RecordsPage />} path="/records" />
              <Route element={<DriversPage />} path="/drivers" />
              <Route element={<KnowledgeActivityPage />} path="/knowledge-activity" />
              <Route element={<RraTestPage />} path="/rra-test" />
              <Route element={<VehiclesPage />} path="/vehicles" />
              <Route element={<AccessCodesPage />} path="/access-codes" />
              <Route element={<BillingPage />} path="/billing" />
              <Route element={<VedrPage />} path="/vedr" />
              <Route element={<SetupPage />} path="/setup" />
              <Route element={<FleetMapPage />} path="/fleet-map" />
              <Route element={<TimeCommitsPage />} path="/time-commits" />
              <Route element={<DebugGoogleMapPage />} path="/debug/google-map" />
              <Route element={<RoutesPage />} path="/routes" />
              <Route element={<RoutePage />} path="/route/:id" />
              <Route element={<RoutePage />} path="/routes/:id" />
            </Routes>
          </Suspense>
        </Layout>
      </SelectedCsaProvider>
    </ErrorBoundary>
  );
}

function ReadyRouteStaffApp() {
  return (
    <ErrorBoundary>
      <StaffLayout>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route element={<Navigate replace to="/readyroute/support" />} index />
            <Route element={<AdminSupportPage />} path="support" />
            <Route element={<StaffCompaniesPage />} path="companies" />
            <Route element={<StaffCompanySupportViewPage />} path="companies/:accountId/view" />
            <Route element={<StaffOperatingCostsPage />} path="costs" />
            <Route element={<StaffUsersPage />} path="staff" />
            <Route element={<StaffSettingsPage />} path="settings" />
          </Routes>
        </Suspense>
      </StaffLayout>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<StaffLoginPage />} path="/readyroute/login" />
          <Route element={<StaffAcceptInvitePage />} path="/readyroute/accept-invite" />
          <Route element={<StaffResetPasswordPage />} path="/readyroute/reset-password" />
          <Route element={<Navigate replace to="/readyroute/support" />} path="/admin/support" />
          <Route element={<StartTrialPage />} path="/start-trial" />
          <Route element={<TrialActivatePage />} path="/trial/activate" />
          <Route element={<ResetPasswordPage />} path="/reset-password" />
          <Route element={<DriverInvitePage />} path="/driver-invite" />
          <Route
            element={
              <RequireStaffAuth>
                <ReadyRouteStaffApp />
              </RequireStaffAuth>
            }
            path="/readyroute/*"
          />
          <Route
            element={
              <RequireAuth>
                <ProtectedApp />
              </RequireAuth>
            }
            path="/*"
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
