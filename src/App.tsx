import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ScannerProvider } from './context/ScannerContext';
import { AppShell } from './components/AppShell';

// Eagerly loaded core routes for quick initial load
import { LoginPage } from './pages/shared/LoginPage';
import { OperatorHome } from './pages/operator/OperatorHome';
import { SupervisorHome } from './pages/supervisor/SupervisorHome';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AlertsPage } from './pages/shared/AlertsPage';
import { TestScannerPage } from './pages/shared/TestScannerPage';

// Lazy-loaded heavy role routes for optimal bundle code splitting
const SelectAssignedWork = React.lazy(() => import('./pages/operator/SelectAssignedWork').then(m => ({ default: m.SelectAssignedWork })));
const OperatorOrders = React.lazy(() => import('./pages/operator/OperatorOrders').then(m => ({ default: m.OperatorOrders })));
const ScanCenter = React.lazy(() => import('./pages/operator/ScanCenter').then(m => ({ default: m.ScanCenter })));
const QCTestPage = React.lazy(() => import('./pages/operator/QCTestPage').then(m => ({ default: m.QCTestPage })));
const PackingPage = React.lazy(() => import('./pages/operator/PackingPage').then(m => ({ default: m.PackingPage })));
const AQLBoxScanPage = React.lazy(() => import('./pages/operator/AQLBoxScanPage').then(m => ({ default: m.AQLBoxScanPage })));
const AQLSamplesPage = React.lazy(() => import('./pages/operator/AQLSamplesPage').then(m => ({ default: m.AQLSamplesPage })));
const AQLResultPage = React.lazy(() => import('./pages/operator/AQLResultPage').then(m => ({ default: m.AQLResultPage })));
const BoxTransferPage = React.lazy(() => import('./pages/operator/BoxTransferPage').then(m => ({ default: m.BoxTransferPage })));
const OperatorProfile = React.lazy(() => import('./pages/operator/OperatorProfile').then(m => ({ default: m.OperatorProfile })));

const SelectStylePage = React.lazy(() => import('./pages/supervisor/SelectStylePage').then(m => ({ default: m.SelectStylePage })));
const CreatePOGeneral = React.lazy(() => import('./pages/supervisor/CreatePOGeneral').then(m => ({ default: m.CreatePOGeneral })));
const CreatePOSalesOrders = React.lazy(() => import('./pages/supervisor/CreatePOSalesOrders').then(m => ({ default: m.CreatePOSalesOrders })));
const CreatePOReview = React.lazy(() => import('./pages/supervisor/CreatePOReview').then(m => ({ default: m.CreatePOReview })));
const ShiftManagementPage = React.lazy(() => import('./pages/supervisor/ShiftManagementPage').then(m => ({ default: m.ShiftManagementPage })));
const SupervisorOrders = React.lazy(() => import('./pages/supervisor/SupervisorOrders').then(m => ({ default: m.SupervisorOrders })));
const SupervisorProfile = React.lazy(() => import('./pages/supervisor/SupervisorProfile').then(m => ({ default: m.SupervisorProfile })));

const AdminOrders = React.lazy(() => import('./pages/admin/AdminOrders').then(m => ({ default: m.AdminOrders })));
const AdminUsers = React.lazy(() => import('./pages/admin/AdminUsers').then(m => ({ default: m.AdminUsers })));
const AdminReports = React.lazy(() => import('./pages/admin/AdminReports').then(m => ({ default: m.AdminReports })));
const AdminMore = React.lazy(() => import('./pages/admin/AdminMore').then(m => ({ default: m.AdminMore })));
const AdminSessions = React.lazy(() => import('./pages/admin/AdminSessions').then(m => ({ default: m.AdminSessions })));

const PageLoadingFallback: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#8EABB0' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '3px solid #213C44',
        borderTopColor: '#22D3C5',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 12px'
      }} />
      <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading view...</span>
    </div>
  </div>
);

// Role Guard Component
const RoleRouteGuard: React.FC<{ allowedRole: 'operator' | 'supervisor' | 'admin'; children: React.ReactNode }> = ({
  allowedRole,
  children
}) => {
  const { isAuthenticated, currentRole, authLoading } = useApp();

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#071B23', color: '#ECF7F6' }}>
        <div>Restoring session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentRole !== allowedRole) {
    if (currentRole === 'operator') return <Navigate to="/operator/home" replace />;
    if (currentRole === 'supervisor') return <Navigate to="/supervisor/home" replace />;
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
};

// Main App Routes with AppShell
const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, currentRole, authLoading } = useApp();

  const isLoginPage = location.pathname === '/login';

  const getDashboardPath = () => {
    if (currentRole === 'operator') return '/operator/home';
    if (currentRole === 'supervisor') return '/supervisor/home';
    return '/admin/dashboard';
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#071B23', color: '#ECF7F6' }}>
        <div>Restoring session...</div>
      </div>
    );
  }

  return (
    <AppShell hideNav={isLoginPage}>
      <Suspense fallback={<PageLoadingFallback />}>
        <Routes>
          {/* Auth Route */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to={getDashboardPath()} replace /> : <LoginPage />}
          />

          {/* Shared Alerts Route */}
          <Route path="/alerts" element={<AlertsPage />} />

          {/* Operator Routes */}
          <Route
            path="/operator/home"
            element={
              <RoleRouteGuard allowedRole="operator">
                <OperatorHome />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/assignments"
            element={
              <RoleRouteGuard allowedRole="operator">
                <SelectAssignedWork />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/orders"
            element={
              <RoleRouteGuard allowedRole="operator">
                <OperatorOrders />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/scan"
            element={
              <RoleRouteGuard allowedRole="operator">
                <ScanCenter />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/qc"
            element={
              <RoleRouteGuard allowedRole="operator">
                <QCTestPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/packing"
            element={
              <RoleRouteGuard allowedRole="operator">
                <PackingPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/aql/box"
            element={
              <RoleRouteGuard allowedRole="operator">
                <AQLBoxScanPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/aql/samples"
            element={
              <RoleRouteGuard allowedRole="operator">
                <AQLSamplesPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/aql/result"
            element={
              <RoleRouteGuard allowedRole="operator">
                <AQLResultPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/transfer"
            element={
              <RoleRouteGuard allowedRole="operator">
                <BoxTransferPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/alerts"
            element={
              <RoleRouteGuard allowedRole="operator">
                <AlertsPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/operator/profile"
            element={
              <RoleRouteGuard allowedRole="operator">
                <OperatorProfile />
              </RoleRouteGuard>
            }
          />

          {/* Supervisor Routes */}
          <Route
            path="/supervisor/home"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <SupervisorHome />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/production-orders/new/style"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <SelectStylePage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/production-orders/new/general"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <CreatePOGeneral />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/production-orders/new/sales-orders"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <CreatePOSalesOrders />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/production-orders/new/review"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <CreatePOReview />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/shifts"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <ShiftManagementPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/orders"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <SupervisorOrders />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/alerts"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <AlertsPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/supervisor/profile"
            element={
              <RoleRouteGuard allowedRole="supervisor">
                <SupervisorProfile />
              </RoleRouteGuard>
            }
          />

          {/* Shared Test Scanner Diagnostic Route */}
          <Route path="/test-scanner" element={<TestScannerPage />} />

          {/* Admin Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminDashboard />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminOrders />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminUsers />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminReports />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/alerts"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AlertsPage />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/sessions"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminSessions />
              </RoleRouteGuard>
            }
          />
          <Route
            path="/admin/more"
            element={
              <RoleRouteGuard allowedRole="admin">
                <AdminMore />
              </RoleRouteGuard>
            }
          />

          {/* Fallback & Default Route */}
          <Route
            path="*"
            element={
              !isAuthenticated ? (
                <Navigate to="/login" replace />
              ) : currentRole === 'operator' ? (
                <Navigate to="/operator/home" replace />
              ) : currentRole === 'supervisor' ? (
                <Navigate to="/supervisor/home" replace />
              ) : (
                <Navigate to="/admin/dashboard" replace />
              )
            }
          />
        </Routes>
      </Suspense>
    </AppShell>
  );
};

export default function App() {
  return (
    <AppProvider>
      <ScannerProvider>
        <Router>
          <AppRoutes />
        </Router>
      </ScannerProvider>
    </AppProvider>
  );
}
