import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, User, ActiveJob, ProductionOrder, PackingBox, AlertItem, AQLSession, ToastMessage } from '../types';
import { repository } from '../services/repository';

interface AppContextType {
  isAuthenticated: boolean;
  authLoading: boolean;
  currentRole: UserRole | null;
  currentUser: User | null;
  loginUser: (token: string, userObj: any) => void;
  logoutUser: () => Promise<void>;
  setRole: (role: UserRole | null) => void;
  activeJob: ActiveJob | null;
  setActiveJob: (job: ActiveJob | null) => void;
  productionOrders: ProductionOrder[];
  saveProductionOrder: (order: ProductionOrder) => void;
  refreshProductionOrders: () => Promise<ProductionOrder[]>;
  packingBoxes: Record<string, PackingBox>;
  savePackingBox: (box: PackingBox) => void;
  alerts: AlertItem[];
  markAlertRead: (id: string) => void;
  aqlSession: AQLSession | null;
  saveAQLSession: (session: AQLSession | null) => void;
  scannerConnected: boolean;
  setScannerConnected: (connected: boolean) => void;
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  qcPassedCountToday: number;
  packedCountToday: number;
  incrementQCPassed: () => void;
  incrementPacked: () => void;
  incrementAQLPassed: () => void;
  incrementAQLFailed: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRoleState] = useState<UserRole | null>(repository.getCurrentRole());
  const [currentUser, setCurrentUserState] = useState<User | null>(repository.getStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('uniflow_token') && repository.getCurrentRole());
  });
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('uniflow_token'));
  });

  const [activeJob, setActiveJobState] = useState<ActiveJob | null>(repository.getActiveJob());
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>(repository.getProductionOrders());
  const [packingBoxes, setPackingBoxes] = useState<Record<string, PackingBox>>(repository.getPackingBoxes());
  const [alerts, setAlerts] = useState<AlertItem[]>(repository.getAlerts());
  const [aqlSession, setAqlSessionState] = useState<AQLSession | null>(repository.getAQLSession());
  const [scannerConnected, setScannerConnected] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const sessionExpiredToastShownRef = React.useRef(false);

  // Daily counters for demo
  const [qcPassedCountToday, setQcPassedCountToday] = useState<number>(624);
  const [packedCountToday, setPackedCountToday] = useState<number>(598);

  const triggerExpiryToast = () => {
    if (!sessionExpiredToastShownRef.current) {
      sessionExpiredToastShownRef.current = true;
      showToast('Session expired, please log in again.', 'warning');
    }
  };

  const loginUser = (token: string, userObj: any) => {
    sessionExpiredToastShownRef.current = false;
    localStorage.setItem('uniflow_token', token);
    const roleStr = (userObj.role || 'operator').toLowerCase() as UserRole;
    const formattedUser: User = {
      id: userObj.id,
      employeeNo: userObj.employeeNo || userObj.employee_no || 'EMP-001',
      username: userObj.username,
      name: userObj.name || userObj.full_name || 'User',
      role: roleStr,
      avatarInitials: userObj.avatarInitials || 'US'
    };
    repository.setCurrentRole(roleStr);
    repository.setStoredUser(formattedUser);
    setCurrentRoleState(roleStr);
    setCurrentUserState(formattedUser);
    setIsAuthenticated(true);
    setAuthLoading(false);
  };

  const logoutUser = async () => {
    try {
      const { apiFetch } = await import('../services/api');
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout request failed or user session already cleared', err);
    } finally {
      localStorage.removeItem('uniflow_token');
      localStorage.removeItem('uniflow_user');
      localStorage.removeItem('uniflow_role');
      localStorage.removeItem('uniflow_active_job');
      repository.setCurrentRole(null);
      repository.setStoredUser(null);
      repository.setActiveJob(null);
      setCurrentRoleState(null);
      setCurrentUserState(null);
      setIsAuthenticated(false);
      setActiveJobState(null);
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      logoutUser();
      triggerExpiryToast();
    };
    window.addEventListener('uniflow_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('uniflow_unauthorized', handleUnauthorized);
    };
  }, []);

  // Verify stored session on mount
  useEffect(() => {
    const token = localStorage.getItem('uniflow_token');
    if (!token) {
      setIsAuthenticated(false);
      setCurrentRoleState(null);
      setCurrentUserState(null);
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    import('../services/api').then(({ apiFetch }) => {
      apiFetch('/api/auth/me')
        .then(res => {
          if (res.user) {
            sessionExpiredToastShownRef.current = false;
            const roleStr = res.user.role.toLowerCase() as UserRole;
            const formattedUser: User = {
              id: res.user.id,
              employeeNo: res.user.employeeNo || res.user.employee_no || 'EMP-001',
              username: res.user.username,
              name: res.user.name || res.user.full_name || 'User',
              role: roleStr,
              avatarInitials: res.user.avatarInitials || 'US'
            };
            repository.setCurrentRole(roleStr);
            repository.setStoredUser(formattedUser);
            setCurrentRoleState(roleStr);
            setCurrentUserState(formattedUser);
            setIsAuthenticated(true);
          } else {
            logoutUser();
            triggerExpiryToast();
          }
        })
        .catch((err: any) => {
          const msg = String(err?.message || '').toUpperCase();
          if (msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('EXPIRED')) {
            logoutUser();
            triggerExpiryToast();
          } else {
            console.warn('Network error or server error verifying session, preserving local session state:', err);
          }
        })
        .finally(() => {
          setAuthLoading(false);
        });
    });
  }, []);

  const refreshProductionOrders = async (): Promise<ProductionOrder[]> => {
    if (!isAuthenticated) return [];
    try {
      const { apiFetch } = await import('../services/api');
      const data = await apiFetch<ProductionOrder[]>('/api/production-orders');
      if (Array.isArray(data)) {
        setProductionOrders(data);
        repository.saveProductionOrders(data);
        return data;
      }
    } catch (err) {
      console.warn('Could not refresh POs from database', err);
    }
    return productionOrders;
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshProductionOrders();
    }
  }, [currentRole, isAuthenticated]);

  const setRole = (role: UserRole | null) => {
    setCurrentRoleState(role);
    repository.setCurrentRole(role);
    if (role) {
      const u = repository.getUserByRole(role);
      setCurrentUserState(u);
      if (u) repository.setStoredUser(u);
    } else {
      setCurrentUserState(null);
      repository.setStoredUser(null);
    }
  };

  const setActiveJob = (job: ActiveJob | null) => {
    setActiveJobState(job);
    repository.setActiveJob(job);
  };

  const saveProductionOrder = (order: ProductionOrder) => {
    repository.saveProductionOrder(order);
    refreshProductionOrders();
    // Also update activeJob if it belongs to this PO
    if (activeJob && activeJob.productionOrder.id === order.id) {
      const updatedSo = order.salesOrders.find(s => s.id === activeJob.salesOrder.id) || activeJob.salesOrder;
      const updatedJob: ActiveJob = {
        ...activeJob,
        productionOrder: order,
        salesOrder: updatedSo
      };
      setActiveJob(updatedJob);
    }
  };

  const savePackingBox = (box: PackingBox) => {
    repository.savePackingBox(box);
    setPackingBoxes({ ...repository.getPackingBoxes() });
  };

  const markAlertRead = (id: string) => {
    const updated = alerts.map(a => (a.id === id ? { ...a, read: true } : a));
    setAlerts(updated);
    repository.saveAlerts(updated);
  };

  const saveAQLSession = (session: AQLSession | null) => {
    setAqlSessionState(session);
    repository.saveAQLSession(session);
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newToast: ToastMessage = { id, message, type };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const incrementQCPassed = () => {
    setQcPassedCountToday(prev => prev + 1);
    if (activeJob) {
      const orders = repository.getProductionOrders();
      const po = orders.find(p => p.id === activeJob.productionOrder.id);
      if (po) {
        const so = po.salesOrders.find(s => s.id === activeJob.salesOrder.id);
        if (so) {
          so.progress.qcPassed += 1;
          saveProductionOrder(po);
        }
      }
    }
  };

  const incrementPacked = () => {
    setPackedCountToday(prev => prev + 1);
    if (activeJob) {
      const orders = repository.getProductionOrders();
      const po = orders.find(p => p.id === activeJob.productionOrder.id);
      if (po) {
        const so = po.salesOrders.find(s => s.id === activeJob.salesOrder.id);
        if (so) {
          so.progress.packed += 1;
          saveProductionOrder(po);
        }
      }
    }
  };

  const incrementAQLPassed = () => {
    if (activeJob) {
      const orders = repository.getProductionOrders();
      const po = orders.find(p => p.id === activeJob.productionOrder.id);
      if (po) {
        const so = po.salesOrders.find(s => s.id === activeJob.salesOrder.id);
        if (so) {
          so.progress.aqlPassed = (so.progress.aqlPassed || 0) + 1;
          saveProductionOrder(po);
        }
      }
    }
  };

  const incrementAQLFailed = () => {
    if (activeJob) {
      const orders = repository.getProductionOrders();
      const po = orders.find(p => p.id === activeJob.productionOrder.id);
      if (po) {
        const so = po.salesOrders.find(s => s.id === activeJob.salesOrder.id);
        if (so) {
          so.progress.aqlFailed = (so.progress.aqlFailed || 0) + 1;
          saveProductionOrder(po);
        }
      }
    }
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        authLoading,
        currentRole,
        currentUser: currentUser!,
        loginUser,
        logoutUser,
        setRole,
        activeJob,
        setActiveJob,
        productionOrders,
        saveProductionOrder,
        refreshProductionOrders,
        packingBoxes,
        savePackingBox,
        alerts,
        markAlertRead,
        aqlSession,
        saveAQLSession,
        scannerConnected,
        setScannerConnected,
        toasts,
        showToast,
        removeToast,
        qcPassedCountToday,
        packedCountToday,
        incrementQCPassed,
        incrementPacked,
        incrementAQLPassed,
        incrementAQLFailed
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
