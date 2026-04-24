import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Layout from './components/Layout';
import { getManagerToken } from './services/auth';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CsaPage = lazy(() => import('./pages/CsaPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const FleetMapPage = lazy(() => import('./pages/FleetMapPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ManifestPage = lazy(() => import('./pages/ManifestPage'));
const RecordsPage = lazy(() => import('./pages/RecordsPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const RoutePage = lazy(() => import('./pages/RoutePage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));
const StartTrialPage = lazy(() => import('./pages/StartTrialPage'));
const TrialActivatePage = lazy(() => import('./pages/TrialActivatePage'));
const VedrPage = lazy(() => import('./pages/VedrPage'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage'));

function RouteLoadingFallback() {
  return (
    <div className="card page-loading-card">
      Loading...
    </div>
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

function ProtectedApp() {
  return (
    <Layout>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route element={<DashboardPage />} path="/" />
          <Route element={<CsaPage />} path="/csa" />
          <Route element={<ManifestPage />} path="/manifest" />
          <Route element={<RecordsPage />} path="/records" />
          <Route element={<DriversPage />} path="/drivers" />
          <Route element={<VehiclesPage />} path="/vehicles" />
          <Route element={<VedrPage />} path="/vedr" />
          <Route element={<SetupPage />} path="/setup" />
          <Route element={<FleetMapPage />} path="/fleet-map" />
          <Route element={<RoutePage />} path="/route/:id" />
          <Route element={<RoutePage />} path="/routes/:id" />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<StartTrialPage />} path="/start-trial" />
        <Route element={<TrialActivatePage />} path="/trial/activate" />
        <Route element={<ResetPasswordPage />} path="/reset-password" />
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
  );
}
