import { ProductionOrder, User, AlertItem, PackingBox } from '../types';

export const MOCK_USERS: Record<string, User> = {
  operator: {
    id: 'usr-001',
    username: 'chamika',
    name: 'Chamika Silva',
    role: 'operator',
    lineId: 'Line 04',
    avatarInitials: 'CS'
  },
  supervisor: {
    id: 'usr-002',
    username: 'nimal',
    name: 'Nimal Perera',
    role: 'supervisor',
    lineId: 'Line 04',
    avatarInitials: 'NP'
  },
  admin: {
    id: 'usr-003',
    username: 'admin',
    name: 'Factory Admin',
    role: 'admin',
    avatarInitials: 'AD'
  }
};

export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [];

export const INITIAL_PACKING_BOXES: Record<string, PackingBox> = {};

export const INITIAL_ALERTS: AlertItem[] = [];
