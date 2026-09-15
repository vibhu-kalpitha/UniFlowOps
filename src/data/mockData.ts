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

export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [
  {
    id: 'PO-2026-0184',
    mapPo: 'MAP-PO-44821',
    customer: 'Nike',
    startDate: '2026-09-01',
    dueDate: '2026-09-28',
    supervisorId: 'Nimal Perera',
    remarks: 'High priority export batch',
    status: 'Current',
    selectedOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer'],
    salesOrders: [
      {
        id: 'SO-77201',
        mapSo: 'MAP-SO-90317',
        product: 'Running Tee',
        styleCode: 'ST-NK-902',
        colour: 'Black',
        sizeRange: 'S - XL',
        quantity: 2500,
        lineId: 'Line 04',
        boxCapacity: 12,
        shifts: [
          {
            id: 'shf-101',
            salesOrderId: 'SO-77201',
            workerId: 'usr-001',
            workerName: 'Chamika Silva',
            startTime: '14:00',
            endTime: '18:00',
            date: '2026-09-14',
            enabledOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
          },
          {
            id: 'shf-102',
            salesOrderId: 'SO-77201',
            workerId: 'usr-004',
            workerName: 'Kavindu Perera',
            startTime: '18:00',
            endTime: '22:00',
            date: '2026-09-14',
            enabledOperations: ['QC Test', 'Packing']
          }
        ],
        progress: {
          qcPassed: 1920,
          qcFailed: 24,
          testPassed: 1910,
          testFailed: 17,
          packed: 1842,
          aqlPassed: 41,
          aqlFailed: 1,
          issuesCount: 3,
          status: 'In Progress'
        }
      },
      {
        id: 'SO-77202',
        mapSo: 'MAP-SO-90318',
        product: 'Running Tee',
        styleCode: 'ST-NK-902',
        colour: 'White',
        sizeRange: 'M - XXL',
        quantity: 1800,
        lineId: 'Line 04',
        boxCapacity: 12,
        shifts: [
          {
            id: 'shf-103',
            salesOrderId: 'SO-77202',
            workerId: 'usr-001',
            workerName: 'Chamika Silva',
            startTime: '08:00',
            endTime: '13:00',
            date: '2026-09-14',
            enabledOperations: ['QC Test', 'Packing']
          }
        ],
        progress: {
          qcPassed: 1200,
          qcFailed: 10,
          testPassed: 1190,
          testFailed: 8,
          packed: 1150,
          aqlPassed: 25,
          aqlFailed: 0,
          issuesCount: 1,
          status: 'In Progress'
        }
      },
      {
        id: 'SO-77203',
        mapSo: 'MAP-SO-90319',
        product: 'Training Shorts',
        styleCode: 'ST-NK-711',
        colour: 'Navy',
        sizeRange: 'S - XL',
        quantity: 3000,
        lineId: 'Line 02',
        boxCapacity: 20,
        shifts: [],
        progress: {
          qcPassed: 450,
          qcFailed: 5,
          testPassed: 445,
          testFailed: 4,
          packed: 400,
          aqlPassed: 8,
          aqlFailed: 0,
          issuesCount: 0,
          status: 'In Progress'
        }
      }
    ]
  },
  {
    id: 'PO-2026-0185',
    mapPo: 'MAP-PO-88129',
    customer: 'Adidas',
    startDate: '2026-09-05',
    dueDate: '2026-09-30',
    supervisorId: 'Nimal Perera',
    remarks: 'Standard production',
    status: 'Current',
    selectedOperations: ['QC Test', 'Packing', 'AQL Checker'],
    salesOrders: [
      {
        id: 'SO-88101',
        mapSo: 'MAP-SO-11204',
        product: 'Aeroready Jersey',
        styleCode: 'ST-AD-501',
        colour: 'Red',
        sizeRange: 'S - L',
        quantity: 3500,
        lineId: 'Line 01',
        boxCapacity: 15,
        shifts: [],
        progress: {
          qcPassed: 2100,
          qcFailed: 15,
          testPassed: 2080,
          testFailed: 12,
          packed: 2050,
          aqlPassed: 40,
          aqlFailed: 1,
          issuesCount: 2,
          status: 'In Progress'
        }
      }
    ]
  },
  {
    id: 'PO-2026-0186',
    mapPo: 'MAP-PO-33410',
    customer: 'Puma',
    startDate: '2026-08-15',
    dueDate: '2026-09-10',
    supervisorId: 'Sunil Bandara',
    remarks: 'Completed order',
    status: 'Completed',
    selectedOperations: ['QC Test', 'Packing', 'AQL Checker'],
    salesOrders: [
      {
        id: 'SO-33401',
        mapSo: 'MAP-SO-55901',
        product: 'Track Pants',
        styleCode: 'ST-PM-104',
        colour: 'Black',
        sizeRange: 'M - XL',
        quantity: 2000,
        lineId: 'Line 03',
        boxCapacity: 10,
        shifts: [],
        progress: {
          qcPassed: 2000,
          qcFailed: 8,
          testPassed: 2000,
          testFailed: 5,
          packed: 2000,
          aqlPassed: 50,
          aqlFailed: 0,
          issuesCount: 0,
          status: 'Completed'
        }
      }
    ]
  }
];

export const INITIAL_PACKING_BOXES: Record<string, PackingBox> = {
  'BX-000218': {
    boxNumber: 'BX-000218',
    capacity: 12,
    soId: 'SO-77201',
    status: 'OPEN',
    items: [
      { qr: 'PNFLS092632670', scannedAt: '10:25' },
      { qr: 'PNFLS092632671', scannedAt: '10:25' },
      { qr: 'PNFLS092632672', scannedAt: '10:24' },
      { qr: 'PNFLS092632673', scannedAt: '10:24' },
      { qr: 'PNFLS092632674', scannedAt: '10:24' },
      { qr: 'PNFLS092632675', scannedAt: '10:25' },
      { qr: 'PNFLS092632676', scannedAt: '10:25' },
      { qr: 'PNFLS092632677', scannedAt: '10:26' }
    ]
  },
  'BX-000245': {
    boxNumber: 'BX-000245',
    capacity: 12,
    soId: 'SO-77201',
    status: 'OPEN',
    items: [
      { qr: 'PNFLS092639901', scannedAt: '09:12' },
      { qr: 'PNFLS092639902', scannedAt: '09:14' },
      { qr: 'PNFLS092639903', scannedAt: '09:15' }
    ]
  }
};

export const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'alt-001',
    type: 'quality',
    title: 'AQL Inspection Result Available',
    message: 'Box BX-000217 passed AQL 3-sample inspection.',
    time: '10 mins ago',
    read: false,
    iconName: 'CircleCheck'
  },
  {
    id: 'alt-002',
    type: 'work',
    title: 'Box Almost Full',
    message: 'Box BX-000218 reached 8/12 items (67%).',
    time: '15 mins ago',
    read: false,
    iconName: 'Package'
  },
  {
    id: 'alt-003',
    type: 'system',
    title: 'Scanner Re-connected',
    message: 'Bluetooth Scanner #04 re-connected successfully.',
    time: '42 mins ago',
    read: true,
    iconName: 'ScanLine'
  },
  {
    id: 'alt-004',
    type: 'quality',
    title: 'Invalid QR Scanned',
    message: 'Scanned item QR PNFLS999 does not belong to active SO-77201.',
    time: '1 hour ago',
    read: true,
    iconName: 'TriangleAlert'
  },
  {
    id: 'alt-005',
    type: 'work',
    title: 'New Work Shift Assigned',
    message: 'Shift 14:00 - 18:00 assigned to Chamika Silva on Line 04.',
    time: '2 hours ago',
    read: true,
    iconName: 'Bell'
  }
];
