export type UserRole = 'operator' | 'supervisor' | 'admin';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  lineId?: string;
  avatarInitials: string;
}

export type OperationType = 'QC Test' | 'Packing' | 'AQL Checker' | 'Box Transfer';

export interface ShiftAssignment {
  id: string;
  salesOrderId: string;
  workerId: string;
  workerName: string;
  startTime: string; // e.g. "14:00"
  endTime: string;   // e.g. "18:00"
  date: string;      // e.g. "2026-09-14"
  enabledOperations: OperationType[];
}

export interface SalesOrderProgress {
  qcPassed: number;
  qcFailed: number;
  testPassed: number;
  testFailed: number;
  packed: number;
  aqlPassed: number;
  aqlFailed: number;
  issuesCount: number;
  status: 'In Progress' | 'Completed' | 'Pending';
}

export interface SalesOrder {
  id: string;           // e.g. SO-77201
  dbId?: string;
  mapSo: string;        // Free text e.g. MAP-SO-90317
  product: string;      // e.g. Running Tee
  styleCode: string;    // e.g. ST-NK-902
  colour: string;       // e.g. Black
  sizeRange: string;    // e.g. S - XL
  quantity: number;     // e.g. 2500
  lineId: string;       // e.g. Line 04 (Note: belongs on Sales Order, not PO)
  boxCapacity: number;  // e.g. 12
  allocations?: any[];
  shifts: ShiftAssignment[];
  progress: SalesOrderProgress;
}

export interface ProductionOrder {
  id: string;                  // e.g. PO-2026-0184
  dbId?: string;
  mapPo: string;               // Free text e.g. MAP-PO-44821
  customer: string;            // e.g. Nike
  boxRangeStart?: string;      // e.g. PNFLS092632670
  boxRangeEnd?: string;        // e.g. PNFLS092632690
  startDate: string;           // e.g. 2026-09-10
  dueDate: string;             // e.g. 2026-09-25
  supervisorId: string;        // e.g. Nimal Perera
  remarks?: string;
  status: 'Current' | 'Completed' | 'Draft';
  selectedOperations: OperationType[];
  salesOrders: SalesOrder[];
}

export interface ActiveJob {
  productionOrder: ProductionOrder;
  salesOrder: SalesOrder;
  shift: ShiftAssignment;
}

export interface BoxItem {
  qr: string;
  scannedAt: string;
}

export interface PackingBox {
  boxNumber: string;
  capacity: number;
  items: BoxItem[];
  status: 'OPEN' | 'COMPLETED' | 'TRANSFERRED';
  soId: string;
}

export interface AQLSampleResult {
  sampleIndex: number;
  itemQr: string;
  size: string;
  result: 'PASS' | 'FAIL';
  defectReason?: string;
}

export interface AQLSession {
  boxNumber: string;
  totalBoxQuantity: number;
  sampleRequired: number;
  currentSampleIndex: number;
  samples: AQLSampleResult[];
  status: 'BOX_SCAN' | 'SAMPLE_SCAN' | 'RESULT';
  overallResult?: 'PASSED' | 'FAILED';
  inspectionId?: string;
  boxItems?: string[];
}

export interface AlertItem {
  id: string;
  type: 'work' | 'quality' | 'system';
  title: string;
  message: string;
  time: string;
  read: boolean;
  iconName: 'TriangleAlert' | 'Package' | 'ScanLine' | 'CircleCheck' | 'Bell';
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
}
