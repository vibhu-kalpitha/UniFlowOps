import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, User, ActiveJob, ProductionOrder, PackingBox, AlertItem, AQLSession, ToastMessage } from '../types';
import { repository } from '../services/repository';

interface AppContextType {
  currentRole: UserRole;
  currentUser: User;
  setRole: (role: UserRole) => void;
  activeJob: ActiveJob | null;
  setActiveJob: (job: ActiveJob | null) => void;
  productionOrders: ProductionOrder[];
  saveProductionOrder: (order: ProductionOrder) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRoleState] = useState<UserRole>(repository.getCurrentRole());
  const [currentUser, setCurrentUser] = useState<User>(repository.getUserByRole(currentRole));
  const [activeJob, setActiveJobState] = useState<ActiveJob | null>(repository.getActiveJob());
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>(repository.getProductionOrders());
  const [packingBoxes, setPackingBoxes] = useState<Record<string, PackingBox>>(repository.getPackingBoxes());
  const [alerts, setAlerts] = useState<AlertItem[]>(repository.getAlerts());
  const [aqlSession, setAqlSessionState] = useState<AQLSession | null>(repository.getAQLSession());
  const [scannerConnected, setScannerConnected] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Daily counters for demo
  const [qcPassedCountToday, setQcPassedCountToday] = useState<number>(624);
  const [packedCountToday, setPackedCountToday] = useState<number>(598);

  const setRole = (role: UserRole) => {
    setCurrentRoleState(role);
    repository.setCurrentRole(role);
    setCurrentUser(repository.getUserByRole(role));
  };

  const setActiveJob = (job: ActiveJob | null) => {
    setActiveJobState(job);
    repository.setActiveJob(job);
  };

  const saveProductionOrder = (order: ProductionOrder) => {
    repository.saveProductionOrder(order);
    setProductionOrders(repository.getProductionOrders());
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

  return (
    <AppContext.Provider
      value={{
        currentRole,
        currentUser,
        setRole,
        activeJob,
        setActiveJob,
        productionOrders,
        saveProductionOrder,
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
        incrementPacked
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
