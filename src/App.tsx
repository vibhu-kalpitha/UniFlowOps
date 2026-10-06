import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ScannerProvider } from './context/ScannerContext';
import { AppShell } from './components/AppShell';

// Shared Pages
import { LoginPage } from './pages/shared/LoginPage';
import { AlertsPage } from './pages/shared/AlertsPage';
import { TestScannerPage } from './pages/shared/TestScannerPage';

// Operator Pages
import { OperatorHome } from './pages/operator/OperatorHome';
import { SelectAssignedWork } from './pages/operator/SelectAssignedWork';
import { OperatorOrders } from './pages/operator/OperatorOrders';
import { ScanCenter } from './pages/operator/ScanCenter';
import { PreQCPage } from './pages/operator/PreQCPage';
import { QCTestPage } from './pages/operator/QCTestPage';
import { PackingPage } from './pages/operator/PackingPage';
import { AQLBoxScanPage } from './pages/operator/AQLBoxScanPage';
import { AQLSamplesPage } from './pages/operator/AQLSamplesPage';
import { AQLResultPage } from './pages/operator/AQLResultPage';
import { BoxTransferPage } from './pages/operator/BoxTransferPage';
import { OperatorProfile } from './pages/operator/OperatorProfile';

// Supervisor Pages
import { SupervisorHome } from './pages/supervisor/SupervisorHome';
import { SelectStylePage } from './pages/supervisor/SelectStylePage';
import { CreatePOGeneral } from './pages/supervisor/CreatePOGeneral';
import { CreatePOSalesOrders } from './pages/supervisor/CreatePOSalesOrders';
import { CreatePOReview } from './pages/supervisor/CreatePOReview';
import { ShiftManagementPage } from './pages/supervisor/ShiftManagementPage';
import { SupervisorOrders } from './pages/supervisor/SupervisorOrders';
import { SupervisorProfile } from './pages/supervisor/SupervisorProfile';

// Admin Pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminOrders } from './pages/admin/AdminOrders';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminMore } from './pages/admin/AdminMore';
import { AdminSessions } from './pages/admin/AdminSessions';

// Role Guard Component
// Role Guard Component
const RoleRouteGuard: React.FC<{ allowedRoles: ('operator' | 'supervisor' | 'admin')[] | ('operator' | 'supervisor' | 'admin'); children: React.ReactNode }> = ({
  allowedRoles,
  children
}) => {
  const { isAuthenticated, currentRole, authLoading } = useApp();

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#071B23', color: '#ECF7F6' }}>
        <div>Loading page...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const roleList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!currentRole || !roleList.includes(currentRole)) {
    const fallbackPath = currentRole === 'operator' ? '/operator/home' : currentRole === 'supervisor' ? '/supervisor/home' : '/admin/dashboard';
    return <Navigate to={fallbackPath} replace />;
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
            <RoleRouteGuard allowedRoles="operator">
              <OperatorHome />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/assignments"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <SelectAssignedWork />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/orders"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <OperatorOrders />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/scan"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <ScanCenter />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/pre-qc"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <PreQCPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/qc"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <QCTestPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/packing"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <PackingPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/aql/box"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <AQLBoxScanPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/aql/samples"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <AQLSamplesPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/aql/result"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <AQLResultPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/transfer"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <BoxTransferPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/alerts"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <AlertsPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/operator/profile"
          element={
            <RoleRouteGuard allowedRoles="operator">
              <OperatorProfile />
            </RoleRouteGuard>
          }
        />

        {/* Supervisor Routes */}
        <Route
          path="/supervisor/home"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <SupervisorHome />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/production-orders/new/style"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <SelectStylePage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/production-orders/new/general"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <CreatePOGeneral />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/production-orders/new/sales-orders"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <CreatePOSalesOrders />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/production-orders/new/review"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <CreatePOReview />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/shifts"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <ShiftManagementPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/orders"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <SupervisorOrders />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/alerts"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <AlertsPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/supervisor/profile"
          element={
            <RoleRouteGuard allowedRoles={['supervisor', 'admin']}>
              <SupervisorProfile />
            </RoleRouteGuard>
          }
        />

        {/* Shared Test Scanner Diagnostic Route */}
        <Route path="/test-scanner" element={<TestScannerPage />} />

        {/* Operational & Admin Routes */}
        <Route
          path="/admin/dashboard"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
              <AdminDashboard />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/orders"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
              <AdminOrders />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
              <AdminUsers />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
              <AdminReports />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/alerts"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
              <AlertsPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/sessions"
          element={
            <RoleRouteGuard allowedRoles="admin">
              <AdminSessions />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/admin/more"
          element={
            <RoleRouteGuard allowedRoles={['admin', 'supervisor']}>
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
