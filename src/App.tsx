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
