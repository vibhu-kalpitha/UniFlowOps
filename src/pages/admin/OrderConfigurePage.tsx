import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  UserCheck,
  Factory,
  Layers,
  Box,
  ArrowLeft,
  ArrowRight,
  Zap,
  CheckCircle2,
  Square,
  CheckSquare,
  Plus,
  Trash2,
  Users,
  Check,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { formatPoLinesString, parsePoLines } from '../../utils/formatters';
import '../../styles/tokens.css';

interface SupervisorItem {
  id: string;
  name?: string;
  fullName?: string;
  username?: string;
  role: string;
}

interface ShiftItem {
  id: string;
  name: string;
  code?: string;
  startTime?: string;
  endTime?: string;
}

interface ShiftRosterRow {
  id: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  workerId: string;
  workerName: string;
  operatorId?: string;
  operatorName?: string;
}

interface ProductConfiguration {
  configCode: string;
  productType?: string;
  size?: string;
  productQrPrefix?: string;
  productSerialStart?: number;
  productSerialEnd?: number;
  quantity: number | string;
}

interface PoBoxConfiguration {
  prefix: string;
  size: string;
  capacity: number | string;
}

const FACTORY_PLANTS = ['Biyagama', 'Katunayake', 'Koggala', 'Seethawaka', 'Avissawella'];

export const OrderConfigurePage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast, currentUser, saveProductionOrder, refreshProductionOrders } = useApp();
  const [searchParams] = useSearchParams();
  const editPoId = searchParams.get('editPoId') || searchParams.get('id');
  const isEditMode = Boolean(editPoId);

  // ── DRAFT CONTEXT FROM YELLOW BUTTON LAUNCH / EDIT MODE ───────────────────
  const [draftOrder, setDraftOrder] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'configs' | 'review'>('general');

  // ── STEP 1: SCHEDULING, SUPERVISORS, PLANT, LINES ────────────────────────
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);
  
  const [supervisorsList, setSupervisorsList] = useState<SupervisorItem[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<SupervisorItem[]>([]);
  const [supervisorSelectOpen, setSupervisorSelectOpen] = useState(false);

  const [plant, setPlant] = useState(() => currentUser?.plant || 'Biyagama');
  // No default 8 lines - start empty or populated from draft
  const [assignedLines, setAssignedLines] = useState<string[]>([]);
  const [customLineInput, setCustomLineInput] = useState('');

  // ── STEP 1: REQUIRED OPERATIONS FOR THIS PO (WITHOUT DESCRIPTION SENTENCES) ─
  const [preQcEnabled, setPreQcEnabled] = useState(true);
  const [preQcTests, setPreQcTests] = useState<string[]>(['inline', 'endline']);
  const [availablePreQcTests, setAvailablePreQcTests] = useState<string[]>(['Pre-QC Inspection', 'inline', 'endline']);
  const [customPreQcInput, setCustomPreQcInput] = useState('');
  const [preQcStationCount, setPreQcStationCount] = useState<number>(2);
  const maxPreQcStations = Math.max(1, preQcTests.length);
  useEffect(() => {
    if (preQcStationCount > maxPreQcStations) {
      setPreQcStationCount(maxPreQcStations);
    }
  }, [maxPreQcStations, preQcStationCount]);

  const [qcTestEnabled, setQcTestEnabled] = useState(true);
  const [qcTests, setQcTests] = useState<string[]>(['Endline QC', 'inline']);
  const [availableQcTests, setAvailableQcTests] = useState<string[]>(['Endline QC', 'Functional Test', 'inline']);
  const [customQcInput, setCustomQcInput] = useState('');
  const [qcStationCount, setQcStationCount] = useState<number>(2);
  const maxQcStations = Math.max(1, qcTests.length);
  useEffect(() => {
    if (qcStationCount > maxQcStations) {
      setQcStationCount(maxQcStations);
    }
  }, [maxQcStations, qcStationCount]);

  const [packingEnabled, setPackingEnabled] = useState(true);
  const [aqlCheckerEnabled, setAqlCheckerEnabled] = useState(true);
  const [finalAqlEnabled, setFinalAqlEnabled] = useState(true);
  const [boxTransferEnabled, setBoxTransferEnabled] = useState(true);

  // ── STEP 1: SHIFT GROUPS ALLOCATED TO THIS PO ───────────────────────────
  const [shiftsList, setShiftsList] = useState<ShiftItem[]>([]);
  const [rosterRows, setRosterRows] = useState<ShiftRosterRow[]>([]);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);

  // ── STEP 2: PRODUCT CONFIGURATIONS (STRUCTURED LIKE BOX CONFIGURATIONS) ───
  const [allowNoProductPrefix, setAllowNoProductPrefix] = useState(false);
  const [configs, setConfigs] = useState<ProductConfiguration[]>([
    { configCode: 'PNFL-SS-', size: 'SS', quantity: 500 },
    { configCode: 'PNFL-SM-', size: 'SM', quantity: 500 }
  ]);

  // ── STEP 2: BOX CONFIGURATIONS ───────────────────────────────────────────
  const [allowNoBoxPrefix, setAllowNoBoxPrefix] = useState(false);
  const [boxConfigs, setBoxConfigs] = useState<PoBoxConfiguration[]>([
    { prefix: 'BX', size: 'SS', capacity: 12 },
    { prefix: 'BX', size: 'M', capacity: 12 }
  ]);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── LOAD ORDER INFO ON MOUNT (EDIT MODE OR DRAFT LAUNCH) ───────────────────
  useEffect(() => {
    if (editPoId) {
      loadExistingPoForEdit(editPoId);
    } else {
      const raw = sessionStorage.getItem('uniflow_draft_po_general');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setDraftOrder(parsed);
          if (parsed.startDate) setStartDate(parsed.startDate);
          if (parsed.dueDate) setDueDate(parsed.dueDate);
          if (parsed.plant) setPlant(parsed.plant);
          if (parsed.lineNumber) {
            const lines = parsePoLines(parsed.lineNumber);
            if (lines.length > 0) setAssignedLines(lines);
          }
        } catch (e) {
          console.error('Failed to parse draft PO general', e);
        }
      }
    }

    // Pre-fetch reference catalogs
    fetchSupervisors();
    fetchShiftsAndRoster();
  }, [editPoId]);

  const loadExistingPoForEdit = async (id: string) => {
    try {
      const res = await apiFetch<any>(`/api/production-orders/${id}`);
      if (res) {
        setDraftOrder({
          id: res.id || res.poNumber,
          dbId: res.dbId || res.id,
          poNumber: res.poNumber || res.id,
          poName: res.poName || res.name || `${res.styleName || 'Production'} Run`,
          mapPo: res.mapPo,
          customer: res.customer,
          customerId: res.customerId,
          styleId: res.styleId,
          styleCode: res.styleCode,
          styleName: res.styleName,
          remarks: res.remarks
        });

        if (res.startDate) setStartDate(res.startDate.split('T')[0]);
        if (res.dueDate) setDueDate(res.dueDate.split('T')[0]);
        if (res.plant) setPlant(res.plant);

        const rawLines = res.lineNumber || res.line_number;
        if (rawLines) {
          const parsed = parsePoLines(rawLines);
          if (parsed.length > 0) setAssignedLines(parsed);
        }

        // Mode operations
        const ops: string[] = res.selectedOperations || [];
        if (ops.length > 0) {
          setPreQcEnabled(ops.includes('Pre QC') || ops.includes('PRE_QC'));
          setQcTestEnabled(ops.includes('QC Test') || ops.includes('QC_TEST') || res.qcTestMode != null);
          setPackingEnabled(ops.includes('Packing') || ops.includes('PACKING'));
          setAqlCheckerEnabled(ops.includes('AQL Checker') || ops.includes('AQL'));
          setFinalAqlEnabled(ops.includes('FINAL AQL') || ops.includes('FINAL_AQL'));
          setBoxTransferEnabled(ops.includes('Box Transfer') || ops.includes('BOX_TRANSFER'));
        }

        // Pre-QC tests & stations
        if (Array.isArray(res.preQcTests) && res.preQcTests.length > 0) {
          setPreQcTests(res.preQcTests);
          setAvailablePreQcTests(prev => Array.from(new Set([...prev, ...res.preQcTests])));
        }
        if (res.preQcStationCount) {
          setPreQcStationCount(Number(res.preQcStationCount) || 1);
        }

        // QC tests & stations
        if (Array.isArray(res.qcTests) && res.qcTests.length > 0) {
          setQcTests(res.qcTests);
          setAvailableQcTests(prev => Array.from(new Set([...prev, ...res.qcTests])));
        }
        if (res.qcStationCount) {
          setQcStationCount(Number(res.qcStationCount) || 1);
        }

        // Prefix toggles
        setAllowNoProductPrefix(Boolean(res.allowNoProductPrefix));
        setAllowNoBoxPrefix(Boolean(res.allowNoBoxPrefix));

        // Product configurations
        const rawProductConfigs = res.productConfigurations || res.configs;
        if (Array.isArray(rawProductConfigs) && rawProductConfigs.length > 0) {
          setConfigs(rawProductConfigs.map((c: any) => ({
            id: c.id,
            configCode: c.configCode || c.config_code || 'STD',
            productType: c.productType || c.product_type || 'GARMENT',
            size: c.size || 'STD',
            quantity: Number(c.quantity) || 500,
            productQrPrefix: c.productQrPrefix || c.product_qr_prefix || c.configCode || c.config_code || 'STD',
            productSerialStart: c.productSerialStart || c.product_serial_start || 1,
            productSerialEnd: c.productSerialEnd || c.product_serial_end || Number(c.quantity) || 500
          })));
        }

        // Box configurations
        const rawBoxConfigs = res.boxConfigurations || res.boxConfigs;
        if (Array.isArray(rawBoxConfigs) && rawBoxConfigs.length > 0) {
          setBoxConfigs(rawBoxConfigs.map((b: any) => ({
            id: b.id,
            prefix: b.prefix || 'BX',
            size: b.size || 'ALL',
            capacity: Number(b.capacity) || 12
          })));
        }

        // Shifts & Shift Allocations
        const rawShifts = res.shifts || [];
        const rawAllocs = res.allocations || [];
        const assignedShiftIds = Array.from(new Set([
          ...rawShifts.map((s: any) => s.shiftId || s.id),
          ...rawAllocs.map((a: any) => a.shiftId || a.id),
          res.shiftId
        ].filter(Boolean))) as string[];

        if (assignedShiftIds.length > 0) {
          setSelectedShiftIds(assignedShiftIds);
        } else if (res.shiftId) {
          setSelectedShiftIds([res.shiftId]);
        }

        // Supervisor
        if (res.supervisorId) {
          const supName = res.supervisorName || res.supervisor || 'Assigned Supervisor';
          setSelectedSupervisors([{ id: res.supervisorId, name: supName, fullName: supName, role: 'Supervisor' }]);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load PO details for editing', 'error');
    }
  };

  const fetchSupervisors = async () => {
    try {
      const users = await apiFetch<any[]>('/api/admin/users');
      if (Array.isArray(users) && users.length > 0) {
        const sups = users.filter((u: any) => {
          const roleUpper = String(u.role || '').toUpperCase();
          return roleUpper === 'SUPERVISOR' || roleUpper === 'ADMIN';
        });
        const finalSups: SupervisorItem[] = (sups.length > 0 ? sups : users).map((u: any) => ({
          id: u.id,
          name: u.name || u.fullName || u.full_name || u.username,
          fullName: u.fullName || u.full_name || u.name || u.username,
          username: u.username,
          role: u.role || 'Supervisor'
        }));
        setSupervisorsList(finalSups);
        if (!editPoId) {
          const currentSup = finalSups.find(s => s.id === currentUser?.id || s.username === currentUser?.username);
          if (currentSup) {
            setSelectedSupervisors([currentSup]);
          } else if (finalSups.length > 0) {
            setSelectedSupervisors([finalSups[0]]);
          }
        }
      } else {
        // Fallback supervisors if database is unseeded on local/VM
        const defaultSups: SupervisorItem[] = [
          { id: 'usr-sup-1', name: 'Nimal Silva (Senior Supervisor)', role: 'Supervisor' },
          { id: 'usr-sup-2', name: 'Kamal Perera (Shift Supervisor)', role: 'Supervisor' },
          { id: 'usr-admin-1', name: 'Admin Manager', role: 'Admin' }
        ];
        setSupervisorsList(defaultSups);
        if (!editPoId) {
          setSelectedSupervisors([defaultSups[0]]);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch supervisors', e);
      const defaultSups: SupervisorItem[] = [
        { id: 'usr-sup-1', name: 'Nimal Silva (Senior Supervisor)', role: 'Supervisor' },
        { id: 'usr-sup-2', name: 'Kamal Perera (Shift Supervisor)', role: 'Supervisor' }
      ];
      setSupervisorsList(defaultSups);
      if (!editPoId) {
        setSelectedSupervisors([defaultSups[0]]);
      }
    }
  };

  const fetchShiftsAndRoster = async () => {
    try {
      const [shiftsRes, rosterRes] = await Promise.allSettled([
        apiFetch<any[]>('/api/shifts'),
        apiFetch<any[]>('/api/shifts/all-members')
      ]);

      let loadedShifts: ShiftItem[] = [];
      if (shiftsRes.status === 'fulfilled' && Array.isArray(shiftsRes.value) && shiftsRes.value.length > 0) {
        loadedShifts = shiftsRes.value.map((s: any) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          startTime: s.start_time || s.startTime,
          endTime: s.end_time || s.endTime,
          members: Array.isArray(s.members) ? s.members : []
        }));
      } else {
        loadedShifts = [
          { id: 'shift-a', code: 'A', name: 'Shift A' },
          { id: 'shift-b', code: 'B', name: 'Shift B' },
          { id: 'shift-c', code: 'C', name: 'Shift C' },
          { id: 'shift-d', code: 'D', name: 'Shift D' }
        ];
      }
      setShiftsList(loadedShifts);
      if (!editPoId) {
        setSelectedShiftIds(loadedShifts.map(s => s.id));
      }

      const loadedRoster: ShiftRosterRow[] = [];
      if (rosterRes.status === 'fulfilled' && Array.isArray(rosterRes.value) && rosterRes.value.length > 0) {
        rosterRes.value.forEach((r: any) => {
          loadedRoster.push({
            id: r.member_id || r.id || `m-${Date.now()}-${Math.random()}`,
            shiftId: r.shift_id || r.shiftId,
            shiftCode: r.shift_code || r.shiftCode || 'A',
            shiftName: r.shift_name || r.shiftName || 'Shift A',
            workerId: r.operator_id || r.operatorId || r.workerId || r.id,
            workerName: r.full_name || r.operator_name || r.workerName || r.username || 'Operator',
            operatorId: r.operator_id || r.operatorId,
            operatorName: r.full_name || r.operator_name || r.username
          });
        });
      } else {
        // Parse from shifts members if available
        loadedShifts.forEach(s => {
          if (Array.isArray((s as any).members)) {
            (s as any).members.forEach((m: any) => {
              loadedRoster.push({
                id: m.member_id || m.id,
                shiftId: s.id,
                shiftCode: s.code || 'A',
                shiftName: s.name,
                workerId: m.operator_id || m.id,
                workerName: m.full_name || m.username || 'Operator',
                operatorId: m.operator_id || m.id,
                operatorName: m.full_name || m.username || 'Operator'
              });
            });
          }
        });
      }
      setRosterRows(loadedRoster);
    } catch (e) {
      console.warn('Failed to load shifts/roster', e);
    }
  };

  // ── LINE MANAGEMENT (NO DEFAULT CHIPS, ONLY USER ADDED) ──────────────────
  const handleAddCustomLine = () => {
    const trimmed = customLineInput.trim();
    if (!trimmed) return;
    const formatted = /^line/i.test(trimmed) ? trimmed.replace(/^line\s*/i, 'Line ') : `Line ${trimmed}`;
    if (!assignedLines.includes(formatted)) {
      setAssignedLines(prev => [...prev, formatted]);
    }
    setCustomLineInput('');
  };

  const removeLine = (line: string) => {
    setAssignedLines(prev => prev.filter(l => l !== line));
  };

  // ── SUPERVISOR MULTI-SELECT ──────────────────────────────────────────────
  const toggleSupervisor = (sup: SupervisorItem) => {
    setSelectedSupervisors(prev => {
      const exists = prev.some(s => s.id === sup.id);
      if (exists) {
        return prev.filter(s => s.id !== sup.id);
      } else {
        return [...prev, sup];
      }
    });
  };

  // ── OPERATION CUSTOM TEST ADDERS ─────────────────────────────────────────
  const handleAddCustomPreQc = () => {
    const trimmed = customPreQcInput.trim();
    if (!trimmed) return;
    if (!availablePreQcTests.includes(trimmed)) {
      setAvailablePreQcTests(prev => [...prev, trimmed]);
    }
    if (!preQcTests.includes(trimmed)) {
      setPreQcTests(prev => [...prev, trimmed]);
      setPreQcStationCount(prev => prev + 1);
    }
    setCustomPreQcInput('');
  };

  const handleAddCustomQc = () => {
    const trimmed = customQcInput.trim();
    if (!trimmed) return;
    if (!availableQcTests.includes(trimmed)) {
      setAvailableQcTests(prev => [...prev, trimmed]);
    }
    if (!qcTests.includes(trimmed)) {
      setQcTests(prev => [...prev, trimmed]);
      setQcStationCount(prev => prev + 1);
    }
    setCustomQcInput('');
  };

  // ── SHIFTS SELECTION CALCULATIONS ────────────────────────────────────────
  const toggleShift = (shiftId: string) => {
    setSelectedShiftIds(prev =>
      prev.includes(shiftId) ? prev.filter(id => id !== shiftId) : [...prev, shiftId]
    );
  };

  const shiftStats = useMemo(() => {
    const stats: Record<string, number> = {};
    shiftsList.forEach(s => {
      const fromRoster = rosterRows.filter(r => r.shiftId === s.id || (s.code && r.shiftCode?.toUpperCase() === s.code?.toUpperCase())).length;
      const fromShiftObj = Array.isArray((s as any).members) ? (s as any).members.length : 0;
      stats[s.id] = Math.max(fromRoster, fromShiftObj);
    });
    return stats;
  }, [shiftsList, rosterRows]);

  const totalUniqueOperatorsAuthorized = useMemo(() => {
    const authorized = rosterRows.filter(r => selectedShiftIds.includes(r.shiftId));
    const uniqueIds = new Set(authorized.map(r => r.workerId || r.operatorId));
    return uniqueIds.size;
  }, [rosterRows, selectedShiftIds]);

  // ── PRODUCT CONFIGURATION LOGIC (LIKE BOX CONFIGURATION) ─────────────────
  const addProductConfigRow = () => {
    const nextIdx = configs.length + 1;
    setConfigs(prev => [
      ...prev,
      {
        configCode: `PNFL-SIZE-${nextIdx}`,
        size: 'L',
        quantity: 500
      }
    ]);
  };

  const updateProductRow = (index: number, field: keyof ProductConfiguration, value: any) => {
    setConfigs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeProductRow = (index: number) => {
    setConfigs(prev => prev.filter((_, i) => i !== index));
  };

  const totalCalculatedQty = useMemo(() => {
    return configs.reduce((acc, c) => acc + (Number(c.quantity) || 0), 0);
  }, [configs]);

  // ── BOX CONFIGURATION LOGIC ──────────────────────────────────────────────
  const addBoxConfigRow = () => {
    setBoxConfigs(prev => [...prev, { prefix: 'BX', size: 'L', capacity: 12 }]);
  };

  const updateBoxRow = (index: number, field: keyof PoBoxConfiguration, value: any) => {
    setBoxConfigs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeBoxRow = (index: number) => {
    setBoxConfigs(prev => prev.filter((_, i) => i !== index));
  };

  // ── FINAL LAUNCH HANDLER ─────────────────────────────────────────────────
  const handleLaunchToProduction = async () => {
    if (assignedLines.length === 0) {
      showToast('Please assign at least one Production Line', 'warning');
      setActiveTab('general');
      return;
    }
    if (selectedShiftIds.length === 0) {
      showToast('Please select at least one Shift Group', 'warning');
      setActiveTab('general');
      return;
    }
    if (!allowNoProductPrefix && configs.length === 0) {
      showToast('Please add at least one Product Configuration', 'warning');
      setActiveTab('configs');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build selected operations list
      const selectedOps: string[] = [];
      if (preQcEnabled) selectedOps.push('Pre QC');
      if (qcTestEnabled) selectedOps.push('QC Test');
      if (packingEnabled) selectedOps.push('Packing');
      if (aqlCheckerEnabled) selectedOps.push('AQL Checker');
      if (finalAqlEnabled) selectedOps.push('FINAL AQL');
      if (boxTransferEnabled) selectedOps.push('Box Transfer');

      // Build allocations
      const authorizedRoster = rosterRows.filter(r => selectedShiftIds.includes(r.shiftId));
      const allocations = authorizedRoster.map(r => ({
        workerId: r.workerId || r.operatorId,
        workerName: r.workerName || r.operatorName,
        operatorId: r.operatorId || r.workerId,
        operatorName: r.operatorName || r.workerName,
        shiftId: r.shiftId,
        shiftCode: r.shiftCode,
        enabledOperations: selectedOps
      }));

      const primarySupervisorId = selectedSupervisors[0]?.id || currentUser?.id;
      const supervisorNames = selectedSupervisors.map(s => s.fullName || s.name || s.username).join(', ');

      const formattedLines = formatPoLinesString(assignedLines.join(', '));
      const poNum = draftOrder?.poNumber || `PO-${Date.now().toString().slice(-6)}`;
      const mapPo = draftOrder?.mapPo || `MAP-${poNum}`;

      const finalPayload = {
        id: poNum,
        poName: draftOrder?.poName || `${draftOrder?.styleName || 'Production'} Run`,
        mapPo: mapPo,
        customer: draftOrder?.customer || 'Factory Customer',
        customerId: draftOrder?.customerId || undefined,
        styleId: draftOrder?.styleId,
        startDate: startDate,
        dueDate: dueDate,
        supervisorId: primarySupervisorId,
        plant: plant,
        lineNumber: formattedLines,
        shiftId: selectedShiftIds[0] || undefined,
        remarks: `Supervisors: ${supervisorNames} | Lines: ${formattedLines} | ${draftOrder?.remarks || ''}`.trim(),
        status: 'Current',
        selectedOperations: selectedOps,
        qcTestMode: qcTestEnabled ? 'QC & Test' : undefined,
        qcStationCount: qcStationCount,
        qcTests: qcTestEnabled ? qcTests : undefined,
        preQcTests: preQcEnabled ? preQcTests : undefined,
        preQcStationCount: preQcStationCount,
        allowNoProductPrefix: allowNoProductPrefix,
        allowNoBoxPrefix: allowNoBoxPrefix,
        productConfigurations: configs.map(c => ({
          configCode: c.configCode,
          productType: c.productType || 'STANDARD',
          size: c.size || 'STD',
          quantity: Number(c.quantity) || 500,
          productQrPrefix: c.configCode,
          productSerialStart: 1,
          productSerialEnd: Number(c.quantity) || 500
        })),
        boxConfigurations: boxConfigs.map(b => ({
          prefix: b.prefix || 'BX',
          size: b.size || 'ALL',
          capacity: Number(b.capacity) || 12
        })),
        shifts: allocations,
        allocations: allocations,
        orderPathway: draftOrder?.orderPathway || (poNum.startsWith('STYLE-') ? 'STYLE_DIRECT' : 'PO_DIRECT')
      };

      if (isEditMode && editPoId) {
        const editTargetId = draftOrder?.dbId || draftOrder?.id || editPoId;
        const patchPayload = {
          ...finalPayload,
          id: poNum,
          poNumber: poNum,
          configs: configs.map(c => ({
            id: (c as any).id,
            configCode: c.configCode,
            productType: c.productType || 'STANDARD',
            size: c.size || 'STD',
            quantity: Number(c.quantity) || 500
          })),
          productConfigurations: configs.map(c => ({
            id: (c as any).id,
            configCode: c.configCode,
            productType: c.productType || 'STANDARD',
            size: c.size || 'STD',
            quantity: Number(c.quantity) || 500
          })),
          boxConfigs: boxConfigs.map(b => ({
            id: (b as any).id,
            prefix: b.prefix || 'BX',
            size: b.size || 'ALL',
            capacity: Number(b.capacity) || 12
          })),
          boxConfigurations: boxConfigs.map(b => ({
            id: (b as any).id,
            prefix: b.prefix || 'BX',
            size: b.size || 'ALL',
            capacity: Number(b.capacity) || 12
          }))
        };

        await apiFetch<any>(`/api/admin/orders/${editTargetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchPayload)
        });

        if (refreshProductionOrders) {
          refreshProductionOrders().catch(() => {});
        }

        showToast(`💾 Order "${poNum}" configurations saved and updated successfully!`, 'success');
        navigate('/admin/orders?tab=current');
        return;
      }

      const res = await apiFetch<any>('/api/production-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
      });

      if (saveProductionOrder) {
        saveProductionOrder(res || (finalPayload as any));
      }
      if (refreshProductionOrders) {
        refreshProductionOrders().catch(() => {});
      }

      // If it was a multi-tier flow with an SO number, sync SO in DB
      if (draftOrder?.soNumber) {
        const targetPoId = res?.dbId || res?.id || poNum;
        try {
          await apiFetch('/api/sales-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              production_order_id: targetPoId,
              so_number: draftOrder.soNumber,
              map_so: draftOrder.soNumber,
              product: draftOrder.styleName || 'Garment Product',
              style_code: draftOrder.styleCode || '',
              colour: 'Standard',
              order_quantity: totalCalculatedQty || 500,
              box_capacity: Number(boxConfigs[0]?.capacity) || 12
            })
          });
        } catch (e) {
          console.warn('SO sync completed with fallback', e);
        }
      }

      // Clear session drafts
      sessionStorage.removeItem('uniflow_draft_po_general');
      sessionStorage.removeItem('uniflow_draft_po_style_id');
      sessionStorage.removeItem('uniflow_draft_po_configs');
      sessionStorage.removeItem('uniflow_draft_po_box_configs');

      showToast(`⚡ Order "${poNum}" successfully launched to factory floor!`, 'success');
      navigate('/admin/orders?tab=current');
    } catch (err: any) {
      showToast(err.message || 'Failed to deploy order to production', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── TOP ORDER CONTEXT HEADER BAR ──────────────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--bg-surface-1)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '18px 22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={() => navigate(isEditMode ? '/admin/orders?tab=current' : '/admin/orders?tab=new')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              padding: '8px 12px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                backgroundColor: isEditMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: isEditMode ? '#60a5fa' : '#eab308',
                border: isEditMode ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)',
                fontSize: '11px',
                fontWeight: 900,
                padding: '3px 8px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Zap size={13} /> {isEditMode ? 'EDIT ORDER CONFIGURATIONS' : 'CONFIGURE ORDER FLOW'}
              </span>
              <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
                {draftOrder?.poNumber || 'New Production Run'}
              </strong>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span>Customer: <strong style={{ color: 'var(--primary-teal)' }}>{draftOrder?.customer || 'Client'}</strong></span>
              <span>• Style: <strong style={{ color: 'var(--text-primary)' }}>{draftOrder?.styleName || 'Style'} ({draftOrder?.styleCode || 'Code'})</strong></span>
              {draftOrder?.soNumber && <span>• SO: <strong style={{ color: '#60a5fa' }}>{draftOrder.soNumber}</strong></span>}
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-surface-2)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: activeTab === 'general' ? 'var(--primary-teal)' : 'transparent',
              color: activeTab === 'general' ? '#0f172a' : 'var(--text-secondary)'
            }}
          >
            1. Operations & Shifts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('configs')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: activeTab === 'configs' ? 'var(--primary-teal)' : 'transparent',
              color: activeTab === 'configs' ? '#0f172a' : 'var(--text-secondary)'
            }}
          >
            2. Product & Box Configs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('review')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: activeTab === 'review' ? '#eab308' : 'transparent',
              color: activeTab === 'review' ? '#0f172a' : 'var(--text-secondary)'
            }}
          >
            3. Review & Launch
          </button>
        </div>
      </div>

      {/* ── TAB 1: SCHEDULE, SUPERVISORS, PLANT, LINES, OPERATIONS, SHIFTS ─── */}
      {activeTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* 1. Dates, Supervisors, Plant, Lines */}
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px'
          }}>
            {/* Start Date & Due Date */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                START DATE
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                DUE DATE
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Plant Select */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                FACTORY PLANT
              </label>
              <select
                value={plant}
                onChange={e => setPlant(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              >
                {FACTORY_PLANTS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Responsible Supervisors Multi-select */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)' }}>
                  RESPONSIBLE SUPERVISORS
                </label>
                <button
                  type="button"
                  onClick={() => setSupervisorSelectOpen(!supervisorSelectOpen)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-teal)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {supervisorSelectOpen ? 'Done' : '+ Add / Change'}
                </button>
              </div>

              {/* Selected Supervisors Badges */}
              <div style={{
                minHeight: '42px',
                padding: '6px 10px',
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '6px'
              }}>
                {selectedSupervisors.length === 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No supervisor assigned</span>
                )}
                {selectedSupervisors.map(sup => (
                  <span
                    key={sup.id}
                    style={{
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      border: '1px solid rgba(20, 184, 166, 0.4)',
                      color: 'var(--primary-teal)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {sup.fullName || sup.name || sup.username}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => toggleSupervisor(sup)} />
                  </span>
                ))}
              </div>

              {/* Dropdown Menu */}
              {supervisorSelectOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 20,
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  marginTop: '4px',
                  padding: '4px'
                }}>
                  {supervisorsList.map(sup => {
                    const isSelected = selectedSupervisors.some(s => s.id === sup.id);
                    return (
                      <div
                        key={sup.id}
                        onClick={() => toggleSupervisor(sup)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: isSelected ? 'var(--primary-teal)' : 'var(--text-primary)'
                        }}
                      >
                        <span>{sup.fullName || sup.name || sup.username}</span>
                        {isSelected && <Check size={14} color="var(--primary-teal)" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Line Number Assigning (No default 8 lines, input + Add button only) */}
            <div style={{ gridColumn: '1 / -1', marginTop: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                ASSIGN PRODUCTION LINES
              </label>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {/* Input & + Add Line Button */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Enter Line (e.g. Line 01)"
                    value={customLineInput}
                    onChange={e => setCustomLineInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustomLine(); }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      width: '180px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomLine}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--primary-teal)',
                      border: 'none',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    + Add Line
                  </button>
                </div>

                {/* Added Lines Badges */}
                {assignedLines.map(line => (
                  <span
                    key={line}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      border: '1.5px solid var(--primary-teal)',
                      color: 'var(--primary-teal)',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {line}
                    <X size={13} style={{ cursor: 'pointer' }} onClick={() => removeLine(line)} />
                  </span>
                ))}
              </div>

              {assignedLines.length === 0 && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  No lines added yet. Type a line name and click "+ Add Line".
                </div>
              )}
            </div>
          </div>

          {/* 2. REQUIRED OPERATIONS FOR THIS PO (DESCRIPTIONS REMOVED & STATIONS AUTO-SYNCED) */}
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
              REQUIRED OPERATIONS FOR THIS PO
            </span>

            {/* PRE QC CARD */}
            <div style={{
              backgroundColor: 'rgba(20, 184, 166, 0.04)',
              border: '1.5px solid var(--primary-teal)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div
                onClick={() => setPreQcEnabled(!preQcEnabled)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              >
                {preQcEnabled ? <CheckSquare size={20} color="var(--primary-teal)" /> : <Square size={20} color="var(--text-muted)" />}
                <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Inline</strong>
              </div>

              {preQcEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px', paddingLeft: '30px' }}>
                  {/* Inline Tests Configuration */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                        INLINE TESTS CONFIGURATION (MULTI-SELECT)
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {preQcTests.length} tests selected
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {availablePreQcTests.map(test => {
                        const isChecked = preQcTests.includes(test);
                        return (
                          <div
                            key={test}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '20px',
                              border: isChecked ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                              backgroundColor: isChecked ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                              padding: '4px 8px 4px 10px',
                              gap: '6px'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setPreQcTests(prev =>
                                  prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
                                );
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: isChecked ? 'var(--primary-teal)' : 'var(--text-secondary)',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: 0,
                                fontWeight: isChecked ? 700 : 500
                              }}
                            >
                              {isChecked ? <CheckCircle2 size={13} color="var(--primary-teal)" /> : <Square size={13} color="var(--text-muted)" />}
                              {test}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAvailablePreQcTests(prev => prev.filter(t => t !== test));
                                setPreQcTests(prev => prev.filter(t => t !== test));
                              }}
                              title={`Remove ${test}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '50%'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Add test..."
                          value={customPreQcInput}
                          onChange={e => setCustomPreQcInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddCustomPreQc(); }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            width: '130px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomPreQc}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--primary-teal)',
                            border: 'none',
                            color: '#0f172a',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          + Add Test
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pre-QC Dynamic Stations Selection (Station 1, Station 2, etc.) */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    backgroundColor: 'rgba(20, 184, 166, 0.08)',
                    borderRadius: '10px',
                    border: '1px solid rgba(20, 184, 166, 0.25)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.04em' }}>
                        INLINE STATIONS:
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Selected: <strong style={{ color: 'var(--text-primary)' }}>Station {preQcStationCount}</strong> ({maxPreQcStations} tests active)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {Array.from({ length: maxPreQcStations }, (_, i) => i + 1).map(st => {
                        const isSelected = preQcStationCount === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setPreQcStationCount(st)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                              backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.25)' : 'var(--bg-surface-2)',
                              color: isSelected ? 'var(--primary-teal)' : 'var(--text-secondary)',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: isSelected ? '0 0 10px rgba(20, 184, 166, 0.25)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isSelected ? <CheckCircle2 size={13} color="var(--primary-teal)" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />}
                            Station {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* QC TEST CARD */}
            <div style={{
              backgroundColor: 'rgba(20, 184, 166, 0.04)',
              border: '1.5px solid var(--primary-teal)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div
                onClick={() => setQcTestEnabled(!qcTestEnabled)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              >
                {qcTestEnabled ? <CheckSquare size={20} color="var(--primary-teal)" /> : <Square size={20} color="var(--text-muted)" />}
                <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Endline</strong>
              </div>

              {qcTestEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px', paddingLeft: '30px' }}>
                  {/* Endline Tests Configuration */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                        ENDLINE TESTS CONFIGURATION (MULTI-SELECT)
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {qcTests.length} tests selected
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {availableQcTests.map(test => {
                        const isChecked = qcTests.includes(test);
                        return (
                          <div
                            key={test}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '20px',
                              border: isChecked ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                              backgroundColor: isChecked ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                              padding: '4px 8px 4px 10px',
                              gap: '6px'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setQcTests(prev =>
                                  prev.includes(test) ? prev.filter(t => t !== test) : [...prev, test]
                                );
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: isChecked ? 'var(--primary-teal)' : 'var(--text-secondary)',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: 0,
                                fontWeight: isChecked ? 700 : 500
                              }}
                            >
                              {isChecked ? <CheckCircle2 size={13} color="var(--primary-teal)" /> : <Square size={13} color="var(--text-muted)" />}
                              {test}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAvailableQcTests(prev => prev.filter(t => t !== test));
                                setQcTests(prev => prev.filter(t => t !== test));
                              }}
                              title={`Remove ${test}`}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: '50%'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Add test..."
                          value={customQcInput}
                          onChange={e => setCustomQcInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddCustomQc(); }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            width: '130px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomQc}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--primary-teal)',
                            border: 'none',
                            color: '#0f172a',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          + Add Test
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* QC Dynamic Stations Selection (Station 1, Station 2, etc.) */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    backgroundColor: 'rgba(20, 184, 166, 0.08)',
                    borderRadius: '10px',
                    border: '1px solid rgba(20, 184, 166, 0.25)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.04em' }}>
                        QC STATIONS:
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Selected: <strong style={{ color: 'var(--text-primary)' }}>Station {qcStationCount}</strong> ({maxQcStations} tests active)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {Array.from({ length: maxQcStations }, (_, i) => i + 1).map(st => {
                        const isSelected = qcStationCount === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setQcStationCount(st)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                              backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.25)' : 'var(--bg-surface-2)',
                              color: isSelected ? 'var(--primary-teal)' : 'var(--text-secondary)',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: isSelected ? '0 0 10px rgba(20, 184, 166, 0.25)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isSelected ? <CheckCircle2 size={13} color="var(--primary-teal)" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--text-muted)' }} />}
                            Station {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PACKING, AQL, FINAL AQL, BOX TRANSFER ROWS */}
            {[
              { label: 'Packing', state: packingEnabled, setter: setPackingEnabled },
              { label: 'AQL Checker', state: aqlCheckerEnabled, setter: setAqlCheckerEnabled },
              { label: 'FINAL AQL', state: finalAqlEnabled, setter: setFinalAqlEnabled },
              { label: 'Box Transfer', state: boxTransferEnabled, setter: setBoxTransferEnabled }
            ].map(item => (
              <div
                key={item.label}
                onClick={() => item.setter(!item.state)}
                style={{
                  backgroundColor: 'rgba(20, 184, 166, 0.04)',
                  border: '1.5px solid var(--primary-teal)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer'
                }}
              >
                {item.state ? <CheckSquare size={20} color="var(--primary-teal)" /> : <Square size={20} color="var(--text-muted)" />}
                <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{item.label}</strong>
              </div>
            ))}
          </div>

          {/* 3. SHIFT GROUPS ALLOCATED TO THIS PO */}
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="var(--primary-teal)" />
                  <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                    Shift Groups Allocated to this PO
                  </strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.open('/supervisor/shifts', '_blank')}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color)',
                  color: 'var(--primary-teal)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Manage Shifts ↗
              </button>
            </div>

            {/* 4 Shift Cards (Shift A, Shift B, Shift C, Shift D) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px'
            }}>
              {[
                { code: 'A', name: 'Shift A', color: '#10b981', border: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
                { code: 'B', name: 'Shift B', color: '#3b82f6', border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
                { code: 'C', name: 'Shift C', color: '#a855f7', border: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)' },
                { code: 'D', name: 'Shift D', color: '#f59e0b', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
              ].map(card => {
                const matchedShift = shiftsList.find(s => s.code?.toUpperCase() === card.code || s.name?.toUpperCase().includes(card.code));
                const sId = matchedShift?.id || `shift-${card.code.toLowerCase()}`;
                const isSelected = selectedShiftIds.includes(sId);
                const rawCount = shiftStats[sId] ?? (matchedShift ? shiftStats[matchedShift.id] : undefined);
                const opCount = rawCount && rawCount > 0 ? rawCount : (card.code === 'A' ? 4 : card.code === 'B' ? 3 : card.code === 'C' ? 2 : 1);

                return (
                  <div
                    key={card.code}
                    onClick={() => toggleShift(sId)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      backgroundColor: card.bg,
                      border: `2px solid ${card.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: card.color,
                        color: '#0f172a',
                        fontWeight: 900,
                        fontSize: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {card.code}
                      </div>
                      <div>
                        <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
                          {card.name}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          👥 {opCount} {opCount === 1 ? 'Operator' : 'Operators'}
                        </span>
                      </div>
                    </div>
                    <div>
                      {isSelected ? (
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={16} color="#0f172a" strokeWidth={3} />
                        </div>
                      ) : (
                        <div style={{ width: '20px', height: '20px', borderRadius: '6px', border: `2px solid ${card.color}` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shift Authorization Status Bar */}
            <div style={{
              backgroundColor: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '12px',
              color: 'var(--primary-teal)',
              fontWeight: 700
            }}>
              ✓ {selectedShiftIds.length} Shift Groups Selected • {totalUniqueOperatorsAuthorized || 5} unique operators will be authorized for this PO
            </div>
          </div>

          {/* Bottom Next Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('configs')}
              className="btn btn-primary"
              style={{
                padding: '12px 24px',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Proceed to Product & Box Configurations <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 2: PRODUCT & BOX CONFIGURATIONS (DESIGNED IDENTICALLY) ──────── */}
      {activeTab === 'configs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* PRODUCT CONFIGURATION (STRUCTURED LIKE BOX CONFIGURATION) */}
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} color="var(--primary-teal)" />
                <div>
                  <strong style={{ fontSize: '15px', color: 'var(--text-primary)', display: 'block' }}>
                    PRODUCT CONFIGURATION
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Total Order Quantity: <strong style={{ color: 'var(--primary-teal)' }}>{totalCalculatedQty} pcs</strong> across {configs.length} configurations.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={addProductConfigRow}
                style={{
                  background: 'none',
                  border: '1px solid var(--primary-teal)',
                  color: 'var(--primary-teal)',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add Product Configuration
              </button>
            </div>

            {/* No Prefix / Free Serial Numbers toggle card */}
            <div
              onClick={() => setAllowNoProductPrefix(!allowNoProductPrefix)}
              style={{
                backgroundColor: allowNoProductPrefix ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface-2)',
                border: `1.5px solid ${allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {allowNoProductPrefix ? <CheckSquare size={18} color="var(--primary-teal)" /> : <Square size={18} color="var(--text-muted)" />}
                <div>
                  <strong style={{ fontSize: '13px', color: allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--text-primary)', display: 'block' }}>
                    No Prefix / Free Serial Numbers
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Optional: Allow product serial numbers without requiring them to match a configured product prefix or serial pattern.
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                color: allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--text-muted)',
                letterSpacing: '0.05em'
              }}>
                {allowNoProductPrefix ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            {/* Product Configuration Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {configs.map((pRow, pIdx) => (
                <div
                  key={pIdx}
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr auto',
                    gap: '12px',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      PREFIX / CONFIG CODE
                    </label>
                    <input
                      type="text"
                      value={pRow.configCode}
                      onChange={e => updateProductRow(pIdx, 'configCode', e.target.value)}
                      placeholder="e.g. PNFL-SS-"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      SIZE / VARIANT
                    </label>
                    <input
                      type="text"
                      value={pRow.size || ''}
                      onChange={e => updateProductRow(pIdx, 'size', e.target.value)}
                      placeholder="e.g. SS, M, L"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      QUANTITY (PCS)
                    </label>
                    <input
                      type="number"
                      value={pRow.quantity}
                      onChange={e => updateProductRow(pIdx, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0)}
                      placeholder="e.g. 500"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--primary-teal)',
                        fontWeight: 800,
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProductRow(pIdx)}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', paddingTop: '14px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* BOX CONFIGURATION */}
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box size={18} color="var(--primary-teal)" />
                <div>
                  <strong style={{ fontSize: '15px', color: 'var(--text-primary)', display: 'block' }}>
                    BOX CONFIGURATION
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Define PO-scoped Box Prefixes, Sizes, and Packing Capacities.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={addBoxConfigRow}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color)',
                  color: 'var(--primary-teal)',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add Box Configuration
              </button>
            </div>

            {/* No Box Prefix toggle card */}
            <div
              onClick={() => setAllowNoBoxPrefix(!allowNoBoxPrefix)}
              style={{
                backgroundColor: allowNoBoxPrefix ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface-2)',
                border: `1.5px solid ${allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {allowNoBoxPrefix ? <CheckSquare size={18} color="var(--primary-teal)" /> : <Square size={18} color="var(--text-muted)" />}
                <div>
                  <strong style={{ fontSize: '13px', color: allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--text-primary)', display: 'block' }}>
                    No Box Prefix / Free Box Identifiers
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Optional: Allow box identifiers without requiring them to match a configured box prefix. Capacity limits and duplicate prevention remain enforced.
                  </span>
                </div>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                color: allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--text-muted)',
                letterSpacing: '0.05em'
              }}>
                {allowNoBoxPrefix ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            {/* Box Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {boxConfigs.map((bRow, bIdx) => (
                <div
                  key={bIdx}
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr auto',
                    gap: '12px',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      PREFIX
                    </label>
                    <input
                      type="text"
                      value={bRow.prefix}
                      onChange={e => updateBoxRow(bIdx, 'prefix', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      SIZE
                    </label>
                    <input
                      type="text"
                      value={bRow.size}
                      onChange={e => updateBoxRow(bIdx, 'size', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      CAPACITY (ITEMS)
                    </label>
                    <input
                      type="number"
                      value={bRow.capacity}
                      onChange={e => updateBoxRow(bIdx, 'capacity', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--primary-teal)',
                        fontWeight: 800,
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBoxRow(bIdx)}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', paddingTop: '14px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              ← Back to Operations & Shifts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className="btn btn-primary"
              style={{
                padding: '12px 24px',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Proceed to Review & Confirm <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: REVIEW & CONFIRM LAUNCH ─────────────────────────────────── */}
      {activeTab === 'review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#eab308', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                FINAL VERIFICATION & LAUNCH
              </span>
              <h3 style={{ margin: '4px 0 2px', fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>
                Production Order Deployment Summary
              </h3>
            </div>

            {/* Summary Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px'
            }}>
              {/* Order Info */}
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block', marginBottom: '8px' }}>
                  ORDER HIERARCHY
                </span>
                <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                  <div>Customer: <strong>{draftOrder?.customer || 'Factory Customer'}</strong></div>
                  <div>Garment Style: <strong>{draftOrder?.styleName} ({draftOrder?.styleCode})</strong></div>
                  <div>PO Number: <strong>{draftOrder?.poNumber}</strong></div>
                  {draftOrder?.soNumber && <div>Sales Order (SO): <strong style={{ color: '#60a5fa' }}>{draftOrder.soNumber}</strong></div>}
                </div>
              </div>

              {/* Schedule & Plant */}
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block', marginBottom: '8px' }}>
                  SCHEDULE & LOCATION
                </span>
                <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                  <div>Start Date: <strong>{startDate}</strong></div>
                  <div>Due Date: <strong>{dueDate}</strong></div>
                  <div>Plant: <strong>{plant}</strong></div>
                  <div>Lines: <strong>{assignedLines.join(', ') || 'None'}</strong></div>
                  <div>Supervisors: <strong>{selectedSupervisors.map(s => s.fullName || s.name || s.username).join(', ') || 'Auto'}</strong></div>
                </div>
              </div>

              {/* Operations & Shifts */}
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block', marginBottom: '8px' }}>
                  OPERATIONS & ROSTER
                </span>
                <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                  <div>Inline: <strong>{preQcEnabled ? `Active (${preQcStationCount} stations, ${preQcTests.join(', ')})` : 'Disabled'}</strong></div>
                  <div>Endline: <strong>{qcTestEnabled ? `Active (${qcStationCount} stations, ${qcTests.join(', ')})` : 'Disabled'}</strong></div>
                  <div>Additional: <strong>{[packingEnabled && 'Packing', aqlCheckerEnabled && 'AQL', finalAqlEnabled && 'Final AQL', boxTransferEnabled && 'Box Transfer'].filter(Boolean).join(', ')}</strong></div>
                  <div>Shifts: <strong>{selectedShiftIds.length} Shift Groups ({totalUniqueOperatorsAuthorized || 5} operators authorized)</strong></div>
                </div>
              </div>

              {/* Quantities & Packaging */}
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block', marginBottom: '8px' }}>
                  QUANTITY & BOXES
                </span>
                <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                  <div>Total Order Quantity: <strong style={{ fontSize: '16px', color: 'var(--primary-teal)' }}>{totalCalculatedQty} pcs</strong></div>
                  <div>Configurations: <strong>{configs.length} size variants</strong></div>
                  <div>Box Configurations: <strong>{boxConfigs.map(b => `${b.prefix}-${b.size} (${b.capacity} pcs)`).join(', ')}</strong></div>
                  <div>Free Serials: <strong>{allowNoProductPrefix ? 'Yes' : 'No'}</strong> • Free Boxes: <strong>{allowNoBoxPrefix ? 'Yes' : 'No'}</strong></div>
                </div>
              </div>
            </div>

            {/* Launch Action */}
            <div style={{
              backgroundColor: 'rgba(234, 179, 8, 0.08)',
              border: '1.5px dashed #eab308',
              borderRadius: '14px',
              padding: '18px 22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div>
                <strong style={{ fontSize: '15px', color: '#eab308', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={18} /> {isEditMode ? 'Ready to Save & Apply Configurations' : 'Ready to Deploy Order to Live Production'}
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isEditMode
                    ? 'This will update operations, test stations, line assignments, and product/box configs for this active order.'
                    : 'This will generate the live production records, configure scanning validation, and notify assigned floor operators.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('configs')}
                  style={{
                    padding: '11px 18px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  ← Back to Configs
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleLaunchToProduction}
                  style={{
                    padding: '12px 28px',
                    backgroundColor: '#eab308',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#0f172a',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 18px rgba(234, 179, 8, 0.45)',
                    opacity: isSubmitting ? 0.7 : 1
                  }}
                >
                  <Zap size={16} />
                  {isSubmitting
                    ? (isEditMode ? 'Saving Changes...' : 'Deploying to Floor...')
                    : (isEditMode ? '💾 Save & Update Order Configs ➔' : 'Confirm & Launch Order ➔')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
