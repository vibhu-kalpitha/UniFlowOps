import { ProductionOrder, ActiveJob, UserRole, AlertItem, PackingBox, AQLSession } from '../types';
import { INITIAL_PRODUCTION_ORDERS, MOCK_USERS, INITIAL_ALERTS, INITIAL_PACKING_BOXES } from '../data/mockData';

const KEYS = {
  CURRENT_ROLE: 'uniflow_role',
  ACTIVE_JOB: 'uniflow_active_job',
  PRODUCTION_ORDERS: 'uniflow_pos',
  PACKING_BOXES: 'uniflow_boxes',
  ALERTS: 'uniflow_alerts',
  AQL_SESSION: 'uniflow_aql_session'
};

export const repository = {
  // Role & Auth
  getCurrentRole(): UserRole {
    const role = localStorage.getItem(KEYS.CURRENT_ROLE);
    return (role as UserRole) || 'operator';
  },

  setCurrentRole(role: UserRole): void {
    localStorage.setItem(KEYS.CURRENT_ROLE, role);
  },

  getUserByRole(role: UserRole) {
    return MOCK_USERS[role] || MOCK_USERS.operator;
  },

  // Active Job
  getActiveJob(): ActiveJob | null {
    const data = localStorage.getItem(KEYS.ACTIVE_JOB);
    if (!data) {
      // Default to PO-2026-0184 & SO-77201 if available
      const pos = this.getProductionOrders();
      const defaultPo = pos.find(p => p.id === 'PO-2026-0184') || pos[0];
      if (defaultPo && defaultPo.salesOrders.length > 0) {
        const defaultSo = defaultPo.salesOrders[0];
        const defaultShift = defaultSo.shifts[0] || {
          id: 'shf-101',
          salesOrderId: defaultSo.id,
          workerId: 'usr-001',
          workerName: 'Chamika Silva',
          startTime: '14:00',
          endTime: '18:00',
          date: '2026-09-14',
          enabledOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
        };
        const job: ActiveJob = {
          productionOrder: defaultPo,
          salesOrder: defaultSo,
          shift: defaultShift
        };
        this.setActiveJob(job);
        return job;
      }
      return null;
    }
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  setActiveJob(job: ActiveJob | null): void {
    if (job) {
      localStorage.setItem(KEYS.ACTIVE_JOB, JSON.stringify(job));
    } else {
      localStorage.removeItem(KEYS.ACTIVE_JOB);
    }
  },

  // Production Orders
  getProductionOrders(): ProductionOrder[] {
    const data = localStorage.getItem(KEYS.PRODUCTION_ORDERS);
    if (!data) {
      localStorage.setItem(KEYS.PRODUCTION_ORDERS, JSON.stringify(INITIAL_PRODUCTION_ORDERS));
      return INITIAL_PRODUCTION_ORDERS;
    }
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_PRODUCTION_ORDERS;
    }
  },

  saveProductionOrders(orders: ProductionOrder[]): void {
    localStorage.setItem(KEYS.PRODUCTION_ORDERS, JSON.stringify(orders));
  },

  saveProductionOrder(order: ProductionOrder): void {
    const orders = this.getProductionOrders();
    const index = orders.findIndex(o => o.id === order.id);
    if (index >= 0) {
      orders[index] = order;
    } else {
      orders.unshift(order);
    }
    this.saveProductionOrders(orders);
  },

  // Packing Boxes
  getPackingBoxes(): Record<string, PackingBox> {
    const data = localStorage.getItem(KEYS.PACKING_BOXES);
    if (!data) {
      localStorage.setItem(KEYS.PACKING_BOXES, JSON.stringify(INITIAL_PACKING_BOXES));
      return INITIAL_PACKING_BOXES;
    }
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_PACKING_BOXES;
    }
  },

  savePackingBox(box: PackingBox): void {
    const boxes = this.getPackingBoxes();
    boxes[box.boxNumber] = box;
    localStorage.setItem(KEYS.PACKING_BOXES, JSON.stringify(boxes));
  },

  // Alerts
  getAlerts(): AlertItem[] {
    const data = localStorage.getItem(KEYS.ALERTS);
    if (!data) {
      localStorage.setItem(KEYS.ALERTS, JSON.stringify(INITIAL_ALERTS));
      return INITIAL_ALERTS;
    }
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_ALERTS;
    }
  },

  saveAlerts(alerts: AlertItem[]): void {
    localStorage.setItem(KEYS.ALERTS, JSON.stringify(alerts));
  },

  // AQL Session
  getAQLSession(): AQLSession | null {
    const data = localStorage.getItem(KEYS.AQL_SESSION);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  saveAQLSession(session: AQLSession | null): void {
    if (session) {
      localStorage.setItem(KEYS.AQL_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(KEYS.AQL_SESSION);
    }
  }
};
