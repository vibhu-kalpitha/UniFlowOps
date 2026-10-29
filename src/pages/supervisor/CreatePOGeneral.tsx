import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { OperationType, QcTestMode, ProductionOrder } from '../../types';
import { ArrowRight, CheckSquare, Square, Plus, X, Users, Clock, ChevronDown, ChevronRight, Copy, Sparkles, Check, FileText, Building2 } from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { parsePoLines, formatPoLinesString } from '../../utils/formatters';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
}

export interface ShiftItem {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  members: Array<{
    member_id: string;
    operator_id: string;
    full_name: string;
    username: string;
    employee_no: string;
    plant?: string;
  }>;
}

interface ShiftRosterRow {
  member_id: string;
  shift_id: string;
  shift_code: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  operator_id: string;
  full_name: string;
  username: string;
  employee_no: string;
  plant?: string;
}

// A single allocation added to the PO
interface PoAllocation {
  operatorId: string;
  operatorName: string;
  shiftId: string;
  shiftName: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
}

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  A: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.35)', text: '#10B981' },
  B: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.35)', text: '#3B82F6' },
  C: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.35)', text: '#8B5CF6' },
  D: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', text: '#F59E0B' },
};

const CreatePOGeneralInner: React.FC = () => {
  const navigate = useNavigate();
  const { showToast, currentUser } = useApp();

  const [stylesList, setStylesList] = useState<StyleItem[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [selectedStyleId, setSelectedStyleId] = useState('');

  const [poId, setPoId] = useState(() => `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poName, setPoName] = useState(() => '');
  const [mapPo, setMapPo] = useState(() => `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`);
  const [startDate, setStartDate] = useState('2026-09-15');
  const [dueDate, setDueDate] = useState('2026-10-10');
  const [supervisor, setSupervisor] = useState('Nimal Perera');
  const [plant, setPlant] = useState(() => currentUser?.plant || 'Biyagama');
  const [lineNumber, setLineNumber] = useState('');
  const [remarks, setRemarks] = useState('Export batch for Q4 delivery');

  const [selectedOps, setSelectedOps] = useState<OperationType[]>([
    'Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer',
  ]);
  const [qcTestMode, setQcTestMode] = useState<QcTestMode>('QC & Test');
  const [qcTests, setQcTests] = useState<string[]>(['Endline QC', 'Functional Test']);
  const [availableQcTests, setAvailableQcTests] = useState<string[]>(['Endline QC', 'Functional Test']);
  const [customQcInput, setCustomQcInput] = useState('');
  const [qcStationCount, setQcStationCount] = useState<number>(1);

  const [preQcTests, setPreQcTests] = useState<string[]>(['Pre-QC Inspection']);
  const [availablePreQcTests, setAvailablePreQcTests] = useState<string[]>(['Pre-QC Inspection']);
  const [customPreQcInput, setCustomPreQcInput] = useState('');
  const [preQcStationCount, setPreQcStationCount] = useState<number>(1);

  const handleAddCustomQcTest = () => {
    const trimmed = customQcInput.trim();
    if (!trimmed) return;
    if (!availableQcTests.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setAvailableQcTests(prev => [...prev, trimmed]);
    }
    if (!qcTests.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setQcTests(prev => [...prev, trimmed]);
    }
    setCustomQcInput('');
  };

  const handleAddCustomPreQcTest = () => {
    const trimmed = customPreQcInput.trim();
    if (!trimmed) return;
    if (!availablePreQcTests.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setAvailablePreQcTests(prev => [...prev, trimmed]);
    }
    if (!preQcTests.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setPreQcTests(prev => [...prev, trimmed]);
    }
    setCustomPreQcInput('');
  };

  // Roster state — loaded from /api/shifts and /api/shifts/all-members
  const [shiftsList, setShiftsList] = useState<ShiftItem[]>([]);
  const [rosterRows, setRosterRows] = useState<ShiftRosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  // Selected PO allocations (operator+shift combos for THIS PO)
  const [poAllocations, setPoAllocations] = useState<PoAllocation[]>([]);

  // Copy Previous PO state
  const [previousOrders, setPreviousOrders] = useState<ProductionOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedCopyPoId, setSelectedCopyPoId] = useState<string>('');
  const [copiedSourcePo, setCopiedSourcePo] = useState<ProductionOrder | null>(null);

  // Load styles, roster, shifts, and previous POs
  const loadData = useCallback(async () => {
    const [stylesResult, rosterResult, posResult, shiftsResult] = await Promise.allSettled([
      apiFetch<StyleItem[]>('/api/styles'),
      apiFetch<ShiftRosterRow[]>('/api/shifts/all-members'),
      apiFetch<ProductionOrder[]>('/api/production-orders'),
      apiFetch<ShiftItem[]>('/api/shifts'),
    ]);

    if (stylesResult.status === 'fulfilled') {
      setStylesList(stylesResult.value);
      setLoadingStyles(false);
      const savedId = sessionStorage.getItem('uniflow_draft_po_style_id');
      if (savedId && stylesResult.value.some(s => s.id === savedId)) {
        setSelectedStyleId(savedId);
      }
    } else {
      setLoadingStyles(false);
      showToast('Failed to load styles from database', 'error');
    }

    if (shiftsResult.status === 'fulfilled' && Array.isArray(shiftsResult.value)) {
      setShiftsList(shiftsResult.value);
    }

    if (rosterResult.status === 'fulfilled') {
      setRosterRows(rosterResult.value);
      // If shifts API didn't return or was empty, construct shiftsList from rosterRows
      if (shiftsResult.status !== 'fulfilled' || !Array.isArray(shiftsResult.value) || shiftsResult.value.length === 0) {
        const grouped: Record<string, ShiftItem> = {};
        rosterResult.value.forEach(r => {
          if (!grouped[r.shift_id]) {
            grouped[r.shift_id] = {
              id: r.shift_id,
              code: r.shift_code,
              name: r.shift_name,
              start_time: r.start_time,
              end_time: r.end_time,
              members: []
            };
          }
          grouped[r.shift_id].members.push({
            member_id: r.member_id,
            operator_id: r.operator_id,
            full_name: r.full_name,
            username: r.username,
            employee_no: r.employee_no,
            plant: r.plant
          });
        });
        setShiftsList(Object.values(grouped));
      }
    } else {
      // Fallback mock shifts if API fails
      setShiftsList([
        {
          id: 'shift-a',
          code: 'A',
          name: 'Shift A',
          start_time: '06:00',
          end_time: '14:00',
          members: [
            { member_id: 'sm-1', operator_id: 'usr-001', full_name: 'Chamika Silva', username: 'chamika', employee_no: 'EMP-101' },
            { member_id: 'sm-3', operator_id: 'usr-004', full_name: 'Kavindu Perera', username: 'kavindu', employee_no: 'EMP-104' }
          ]
        },
        {
          id: 'shift-b',
          code: 'B',
          name: 'Shift B',
          start_time: '14:00',
          end_time: '22:00',
          members: [
            { member_id: 'sm-2', operator_id: 'usr-001', full_name: 'Chamika Silva', username: 'chamika', employee_no: 'EMP-101' }
          ]
        }
      ]);
    }
    setLoadingRoster(false);

    if (posResult.status === 'fulfilled' && Array.isArray(posResult.value)) {
      setPreviousOrders(posResult.value);
      const copySourceId = sessionStorage.getItem('uniflow_copy_source_po_id');
      if (copySourceId) {
        const found = posResult.value.find(p => p.id === copySourceId || p.dbId === copySourceId);
        if (found) {
          setCopiedSourcePo(found);
          setSelectedCopyPoId(found.id);
        }
      }
    }
    setLoadingOrders(false);
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Normalize operation names to exact UI tokens
  const normalizeOpName = (op: any): OperationType => {
    if (!op) return 'QC Test';
    const rawStr = typeof op === 'string' ? op : (op.operation || op.name || op.op || String(op));
    if (typeof rawStr !== 'string') return 'QC Test';
    const clean = rawStr.trim().toUpperCase().replace(/[-_]/g, ' ');
    if (clean.includes('PRE QC') || clean.includes('PREQC')) return 'Pre QC';
    if (clean.includes('QC') && clean.includes('TEST')) return 'QC Test';
    if (clean.includes('PACK')) return 'Packing';
    if (clean === 'FINAL AQL') return 'FINAL AQL';
    if (clean.includes('AQL')) return 'AQL Checker';
    if (clean.includes('BOX')) return 'Box Transfer';
    return (rawStr as OperationType) || 'QC Test';
  };

  // Load existing draft if returning to general page or pre-loaded
  useEffect(() => {
    const draftGen = sessionStorage.getItem('uniflow_draft_po_general');
    if (draftGen) {
      try {
        const parsed = JSON.parse(draftGen);
        if (parsed.id) setPoId(parsed.id);
        if (parsed.poName) setPoName(parsed.poName);
        if (parsed.mapPo) setMapPo(parsed.mapPo);
        if (parsed.styleId) setSelectedStyleId(parsed.styleId);
        if (parsed.startDate) setStartDate(parsed.startDate);
        if (parsed.dueDate) setDueDate(parsed.dueDate);
        if (parsed.supervisorId) setSupervisor(parsed.supervisorId);
        if (parsed.plant) setPlant(parsed.plant);
        if (parsed.lineNumber) setLineNumber(parsed.lineNumber);
        if (parsed.remarks) setRemarks(parsed.remarks);
        if (parsed.selectedOperations && Array.isArray(parsed.selectedOperations)) {
          setSelectedOps(parsed.selectedOperations.map(normalizeOpName));
        }
        if (parsed.qcTestMode) setQcTestMode(parsed.qcTestMode);
        if (parsed.qcTests && Array.isArray(parsed.qcTests) && parsed.qcTests.length > 0) {
          setQcTests(parsed.qcTests);
          setAvailableQcTests(prev => Array.from(new Set([...prev, ...parsed.qcTests])));
        } else if (parsed.qcTestMode) {
          const fallback = parsed.qcTestMode === 'QC Only' ? ['Endline QC'] : (parsed.qcTestMode === 'Test Only' || parsed.qcTestMode === 'Functional Test Only') ? ['Functional Test'] : ['Endline QC', 'Functional Test'];
          setQcTests(fallback);
          setAvailableQcTests(prev => Array.from(new Set([...prev, ...fallback])));
        }
        if (parsed.qcStationCount) setQcStationCount(Number(parsed.qcStationCount) || 1);
        if (parsed.preQcTests && Array.isArray(parsed.preQcTests) && parsed.preQcTests.length > 0) {
          setPreQcTests(parsed.preQcTests);
          setAvailablePreQcTests(prev => Array.from(new Set([...prev, ...parsed.preQcTests])));
        }
        if (parsed.preQcStationCount) setPreQcStationCount(Number(parsed.preQcStationCount) || 1);
        if (parsed.allocations && Array.isArray(parsed.allocations)) {
          setPoAllocations(parsed.allocations.map((a: any) => ({
            operatorId: a.operatorId || a.workerId || a.operator_id || a.worker_id || a.id || '',
            operatorName: a.operatorName || a.workerName || a.operator_name || a.worker_name || a.full_name || a.username || a.operatorId || a.workerId || 'Operator',
            shiftId: a.shiftId || a.shift_id || '',
            shiftName: a.shiftName || a.shift_name || a.shiftCode || a.shift_code || 'Shift',
            shiftCode: (a.shiftCode || a.shift_code || 'A').toUpperCase(),
            startTime: a.startTime || a.start_time || '06:00',
            endTime: a.endTime || a.end_time || '14:00',
          })));
        }
      } catch (e) {
        console.error('Failed to parse draft general:', e);
      }
    }
  }, []);

  // Handler to apply all configurations from a source PO
  const applyPoConfig = (sourcePo: ProductionOrder) => {
    // Generate a fresh unique PO ID
    const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setPoId(newPoId);

    // PO Name (editable by user)
    const copiedName = sourcePo.poName
      ? `${sourcePo.poName} (Copy)`
      : `${sourcePo.id} Copy`;
    setPoName(copiedName);

    // Map PO (editable by user)
    const copiedMapPo = sourcePo.mapPo
      ? `${sourcePo.mapPo}-COPY`
      : `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`;
    setMapPo(copiedMapPo);

    // Garment Style
    let matchedStyleId = '';
    if (sourcePo.styleId && stylesList.some(s => s.id === sourcePo.styleId)) {
      matchedStyleId = sourcePo.styleId;
    } else if (sourcePo.styleCode) {
      const match = stylesList.find(s =>
        s.code?.toLowerCase() === sourcePo.styleCode?.toLowerCase() ||
        s.name?.toLowerCase() === (sourcePo.styleName || '').toLowerCase()
      );
      if (match) matchedStyleId = match.id;
    }
    if (!matchedStyleId && stylesList.length > 0) {
      matchedStyleId = stylesList[0].id;
    }
    if (matchedStyleId) {
      setSelectedStyleId(matchedStyleId);
      sessionStorage.setItem('uniflow_draft_po_style_id', matchedStyleId);
    }

    // Dates, supervisor, remarks
    const nextStart = sourcePo.startDate || new Date().toISOString().split('T')[0];
    const nextDue = sourcePo.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const nextSup = sourcePo.supervisorId || supervisor;
    const nextPlant = sourcePo.plant || plant;
    const nextLineNumber = sourcePo.lineNumber || sourcePo.line_number || '';
    const nextRemarks = sourcePo.remarks || '';

    setStartDate(nextStart);
    setDueDate(nextDue);
    setSupervisor(nextSup);
    setPlant(nextPlant);
    setLineNumber(nextLineNumber);
    setRemarks(nextRemarks);

    // Selected operations & QC mode
    const opsToSet: OperationType[] = (sourcePo.selectedOperations && Array.isArray(sourcePo.selectedOperations) && sourcePo.selectedOperations.length > 0)
      ? sourcePo.selectedOperations.map(normalizeOpName)
      : selectedOps;
    setSelectedOps(opsToSet);

    const nextQcMode = sourcePo.qcTestMode || qcTestMode;
    const nextQcTests = Array.isArray(sourcePo.qcTests) && sourcePo.qcTests.length > 0
      ? sourcePo.qcTests
      : (sourcePo.qcTestMode === 'QC Only' ? ['Endline QC'] : (sourcePo.qcTestMode === 'Test Only' || sourcePo.qcTestMode === 'Functional Test Only') ? ['Functional Test'] : ['Endline QC', 'Functional Test']);
    setQcTests(nextQcTests);
    setAvailableQcTests(prev => Array.from(new Set([...prev, ...nextQcTests])));

    const nextPreQcTests = Array.isArray(sourcePo.preQcTests) && sourcePo.preQcTests.length > 0
      ? sourcePo.preQcTests
      : ['Pre-QC Inspection'];
    setPreQcTests(nextPreQcTests);
    setAvailablePreQcTests(prev => Array.from(new Set([...prev, ...nextPreQcTests])));

    const nextQcStations = Number(sourcePo.qcStationCount) || 1;
    const nextPreQcStations = Number(sourcePo.preQcStationCount) || 1;
    setQcTestMode(nextQcMode);
    setQcStationCount(Math.min(nextQcStations, nextQcTests.length || 1));
    setPreQcStationCount(Math.min(nextPreQcStations, nextPreQcTests.length || 1));

    // Operator Shift Allocations
    const rawAllocations = sourcePo.allocations || sourcePo.shifts || [];
    let mapped: PoAllocation[] = [];
    if (Array.isArray(rawAllocations) && rawAllocations.length > 0) {
      mapped = rawAllocations.map((a: any) => {
        const opId = a.operatorId || a.workerId || a.operator_id || a.worker_id || a.id || '';
        const opName = a.operatorName || a.workerName || a.operator_name || a.worker_name || a.full_name || a.username || opId || 'Operator';
        const shId = a.shiftId || a.shift_id || '';
        const shName = a.shiftName || a.shift_name || a.shiftCode || a.shift_code || 'Shift';
        const shCode = (a.shiftCode || a.shift_code || 'A').toUpperCase();
        const start = a.startTime || a.start_time || '06:00';
        const end = a.endTime || a.end_time || '14:00';
        return {
          operatorId: opId,
          operatorName: opName,
          shiftId: shId,
          shiftName: shName,
          shiftCode: shCode,
          startTime: start,
          endTime: end,
        };
      });
      setPoAllocations(mapped);
    }

    // Persist full General Draft so page reload never blanks out fields
    const draftGen = {
      id: newPoId,
      poName: copiedName,
      mapPo: copiedMapPo,
      customer: sourcePo.customer || 'Factory Customer',
      styleId: matchedStyleId || selectedStyleId,
      styleCode: sourcePo.styleCode,
      styleName: sourcePo.styleName,
      startDate: nextStart,
      dueDate: nextDue,
      supervisorId: nextSup,
      plant: nextPlant,
      lineNumber: nextLineNumber,
      shiftId: mapped[0]?.shiftId || sourcePo.shiftId || '',
      shiftName: mapped[0]?.shiftName || sourcePo.shiftName || '',
      remarks: nextRemarks,
      selectedOperations: opsToSet,
      qcTestMode: nextQcMode,
      qcStationCount: nextQcStations,
      qcTests: nextQcTests,
      preQcTests: nextPreQcTests,
      preQcStationCount: nextPreQcStations,
      allocations: mapped.map(a => ({
        workerId: a.operatorId,
        workerName: a.operatorName,
        operatorId: a.operatorId,
        operatorName: a.operatorName,
        shiftId: a.shiftId,
        shiftCode: a.shiftCode,
        enabledOperations: opsToSet,
      })),
    };
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftGen));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(draftGen.allocations));

    // Product Configurations
    if (sourcePo.productConfigurations && Array.isArray(sourcePo.productConfigurations) && sourcePo.productConfigurations.length > 0) {
      const cleaned = sourcePo.productConfigurations.map(c => ({
        configCode: c.configCode,
        productType: c.productType,
        size: c.size,
        productQrPrefix: c.productQrPrefix,
        productSerialStart: c.productSerialStart || 1,
        productSerialEnd: c.productSerialEnd || c.quantity || 500,
        quantity: c.quantity || 500,
      }));
      sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(cleaned));
    }

    // Box Configurations
    if (sourcePo.boxConfigurations && Array.isArray(sourcePo.boxConfigurations) && sourcePo.boxConfigurations.length > 0) {
      sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(sourcePo.boxConfigurations));
    }

    // No-Prefix Settings
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(Boolean(sourcePo.allowNoProductPrefix)));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(Boolean(sourcePo.allowNoBoxPrefix)));
    sessionStorage.setItem('uniflow_copy_source_po_id', sourcePo.id);

    setCopiedSourcePo(sourcePo);
    showToast(`Copied all configurations from ${sourcePo.id}! You can now customize the PO Name, Number, or any setting.`, 'success');
  };

  const isShiftSelected = (shiftId: string, shiftCode?: string) => {
    return poAllocations.some(a => a.shiftId === shiftId || (shiftCode && a.shiftCode === shiftCode));
  };

  const toggleShiftSelection = (shift: ShiftItem) => {
    const isCurrentlySelected = isShiftSelected(shift.id, shift.code);
    if (isCurrentlySelected) {
      setPoAllocations(prev => prev.filter(a => a.shiftId !== shift.id && a.shiftCode !== shift.code));
    } else {
      const members = shift.members || [];
      if (members.length === 0) {
        setPoAllocations(prev => [...prev, {
          operatorId: '',
          operatorName: '',
          shiftId: shift.id,
          shiftName: shift.name,
          shiftCode: shift.code,
          startTime: shift.start_time || '06:00',
          endTime: shift.end_time || '14:00',
        }]);
      } else {
        const newAllocs: PoAllocation[] = members.map(m => ({
          operatorId: m.operator_id,
          operatorName: m.full_name,
          shiftId: shift.id,
          shiftName: shift.name,
          shiftCode: shift.code,
          startTime: shift.start_time || '06:00',
          endTime: shift.end_time || '14:00',
        }));
        setPoAllocations(prev => {
          const existingKeys = new Set(prev.map(a => `${a.operatorId}|${a.shiftId}`));
          const toAdd = newAllocs.filter(a => !existingKeys.has(`${a.operatorId}|${a.shiftId}`));
          return [...prev, ...toAdd];
        });
      }
    }
  };

  const selectedShiftCount = useMemo(() => {
    return new Set(poAllocations.map(a => a.shiftCode || a.shiftId).filter(Boolean)).size;
  }, [poAllocations]);

  const uniqueOperatorCount = useMemo(() => {
    return new Set(poAllocations.map(a => a.operatorId).filter(Boolean)).size;
  }, [poAllocations]);

  const toggleOp = (op: OperationType) => {
    setSelectedOps(prev => prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]);
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStyleId) {
      showToast('Please select a Garment Style first', 'warning');
      return;
    }
    if (!poId.trim() || !mapPo.trim()) {
      showToast('Please fill required PO number fields', 'warning');
      return;
    }
    if (selectedOps.length === 0) {
      showToast('Select at least one required operation', 'warning');
      return;
    }
    if (poAllocations.length === 0) {
      showToast('Please select at least one Shift Group for this PO', 'warning');
      return;
    }

    const selectedStyleObj = stylesList.find(s => s.id === selectedStyleId);

    // Build the draft payload — allocations carry operator+shift pairs
    const draftPo = {
      id: poId,
      poName,
      mapPo,
      customer: selectedStyleObj?.customer || 'Factory Customer',
      styleId: selectedStyleId,
      styleCode: selectedStyleObj?.code,
      styleName: selectedStyleObj?.name,
      startDate,
      dueDate,
      supervisorId: supervisor,
      plant,
      lineNumber: formatPoLinesString(lineNumber) || lineNumber,
      // Primary shift = first allocation's shift (for `production_orders.shift_id`)
      shiftId: poAllocations[0]?.shiftId,
      shiftName: poAllocations[0]?.shiftName,
      remarks,
      selectedOperations: selectedOps,
      qcTestMode: selectedOps.includes('QC Test') ? qcTestMode : undefined,
      qcStationCount: selectedOps.includes('QC Test') ? qcStationCount : 1,
      qcTests: selectedOps.includes('QC Test') ? qcTests : undefined,
      preQcTests: selectedOps.includes('Pre QC') ? preQcTests : undefined,
      preQcStationCount: selectedOps.includes('Pre QC') ? preQcStationCount : 1,
      // All operator+shift allocations to persist in operator_work_assignments
      allocations: poAllocations.map(a => ({
        workerId: a.operatorId,
        workerName: a.operatorName,
        operatorId: a.operatorId,
        operatorName: a.operatorName,
        shiftId: a.shiftId,
        shiftCode: a.shiftCode,
        enabledOperations: selectedOps,
      })),
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleId);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftPo));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(draftPo.allocations));
    navigate('/supervisor/production-orders/new/sales-orders');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={styles.wizardBar}>
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>2</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Product Configurations</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>4</span>
          <span>Review</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Create Production Order</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 2 of 4: Select Garment Style, define PO details, and pick operator–shift allocations.
        </p>
      </div>

      {/* ── Copy Settings from Previous PO Card ────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--bg-surface-2)',
        border: '1.5px solid rgba(20, 184, 166, 0.35)',
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(20, 184, 166, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-teal)'
            }}>
              <Copy size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Copy Settings from Previous PO</span>
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(20, 184, 166, 0.15)', color: 'var(--primary-teal)', fontWeight: 700 }}>
                  Optional Fast Setup
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                Clone Style, Operations, Roster Allocations, Product & Box Configs from an existing PO. You can modify any setting or name after copying.
              </p>
            </div>
          </div>
          {copiedSourcePo && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '20px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10B981',
              fontWeight: 700,
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <Check size={13} /> Loaded from {copiedSourcePo.id}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="input-field"
            style={{ flex: '1 1 280px', minWidth: '220px', backgroundColor: 'var(--bg-surface-1)' }}
            value={selectedCopyPoId}
            onChange={e => setSelectedCopyPoId(e.target.value)}
          >
            <option value="">-- Select a previous PO to copy its settings --</option>
            {loadingOrders ? (
              <option disabled>Loading previous orders...</option>
            ) : previousOrders.length === 0 ? (
              <option disabled>No previous orders found</option>
            ) : (
              previousOrders.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.poName ? `• ${p.poName}` : ''} ({p.styleName || p.styleCode || 'Style'} — {p.customer || 'Customer'} — {p.productConfigurations?.length || 0} configs, {p.totalQuantity || 0} pcs)
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            disabled={!selectedCopyPoId}
            onClick={() => {
              const found = previousOrders.find(p => p.id === selectedCopyPoId);
              if (found) {
                applyPoConfig(found);
              }
            }}
            className="btn-primary"
            style={{
              padding: '9px 16px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '10px',
              whiteSpace: 'nowrap',
              opacity: selectedCopyPoId ? 1 : 0.6,
              cursor: selectedCopyPoId ? 'pointer' : 'not-allowed'
            }}
          >
            <Copy size={14} /> Apply All Settings
          </button>
        </div>

        {/* Selected PO Preview Card */}
        {selectedCopyPoId && (() => {
          const previewPo = previousOrders.find(p => p.id === selectedCopyPoId);
          if (!previewPo) return null;
          return (
            <div style={{
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                  Settings preview for {previewPo.id} {previewPo.poName ? `("${previewPo.poName}")` : ''}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Customer: {previewPo.customer || 'Factory'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div><strong>Garment Style:</strong> {previewPo.styleName || previewPo.styleCode || 'Standard'}</div>
                <div><strong>Operations:</strong> {Array.isArray(previewPo.selectedOperations) ? previewPo.selectedOperations.join(', ') : (typeof previewPo.selectedOperations === 'string' ? previewPo.selectedOperations : 'Standard 5')}</div>
                <div><strong>QC Mode:</strong> {previewPo.qcTestMode || 'QC & Test'} ({previewPo.qcStationCount || 1} stn)</div>
                <div><strong>Allocations:</strong> {(Array.isArray(previewPo.allocations) ? previewPo.allocations : (Array.isArray(previewPo.shifts) ? previewPo.shifts : [])).length} operators</div>
                <div><strong>Product Configs:</strong> {Array.isArray(previewPo.productConfigurations) ? previewPo.productConfigurations.length : 0} types ({previewPo.totalQuantity || 0} pcs)</div>
                <div><strong>Box Configs:</strong> {Array.isArray(previewPo.boxConfigurations) ? previewPo.boxConfigurations.map((b: any) => `${b?.prefix || 'BX'}-${b?.size || 'M'} (${b?.capacity || 12})`).join(', ') : 'BX (12)'}</div>
                <div><strong>No-Prefix Flags:</strong> {previewPo.allowNoProductPrefix ? 'Free Product SNs' : 'Prefixed'}, {previewPo.allowNoBoxPrefix ? 'Free Box IDs' : 'Prefixed'}</div>
                <div><strong>Plant:</strong> {previewPo.plant || 'Standard'}</div>
                <div><strong>Supervisor:</strong> {previewPo.supervisorId || 'N/A'}</div>
              </div>
            </div>
          );
        })()}

        {copiedSourcePo && (
          <div style={{
            fontSize: '12px',
            color: 'var(--text-primary)',
            backgroundColor: 'rgba(20, 184, 166, 0.1)',
            border: '1px dashed var(--primary-teal)',
            padding: '8px 12px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Sparkles size={15} color="var(--primary-teal)" />
            <span>
              All settings from <strong>{copiedSourcePo.id}</strong> are currently applied! You can change the <strong>PO Name</strong>, <strong>PO Number</strong>, or any values below.
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleNext} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* ── Row 1: Style + PO fields ────────────────────────── */}
        <div className="grid-2-desktop" style={{ display: 'grid', gap: '14px' }}>
          {/* Garment Style */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={styles.label}>Select Garment Style (Required)</label>
              <button
                type="button"
                onClick={() => navigate('/supervisor/production-orders/new/style')}
                style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> Create / Manage Styles
              </button>
            </div>
            <select
              className="input-field"
              value={selectedStyleId}
              onChange={e => {
                setSelectedStyleId(e.target.value);
                if (e.target.value) sessionStorage.setItem('uniflow_draft_po_style_id', e.target.value);
                else sessionStorage.removeItem('uniflow_draft_po_style_id');
              }}
              required
            >
              <option value="">-- Select Style from Catalog --</option>
              {loadingStyles ? (
                <option disabled>Loading styles…</option>
              ) : stylesList.length === 0 ? (
                <option disabled>No styles available</option>
              ) : (
                stylesList.map(s => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))
              )}
            </select>
          </div>

          {/* PO Number */}
          <div>
            <label style={styles.label}>Production Order No.</label>
            <input type="text" className="input-field" value={poId} onChange={e => setPoId(e.target.value)} required />
          </div>

          {/* PO Name */}
          <div>
            <label style={styles.label}>PO Name (Human-Readable Label)</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Export Batch 01"
              value={poName}
              onChange={e => setPoName(e.target.value)}
            />
          </div>

          {/* SO */}
          <div>
            <label style={styles.label}>SO (Sales Order / External Ref)</label>
            <input type="text" className="input-field" placeholder="e.g. SO-44821" value={mapPo} onChange={e => setMapPo(e.target.value)} required />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <div>
              <label style={styles.label}>Start Date</label>
              <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Due Date</label>
              <input type="date" className="input-field" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Supervisor */}
          <div>
            <label style={styles.label}>Responsible Supervisor</label>
            <input type="text" className="input-field" value={supervisor} onChange={e => setSupervisor(e.target.value)} />
          </div>

          {/* Plant Location */}
          <div>
            <label style={styles.label}>Plant / Garment Location (Required)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                list="po-plant-suggestions"
                className="input-field"
                placeholder="e.g. Biyagama, Katunayake"
                value={plant}
                onChange={e => setPlant(e.target.value)}
                required
              />
              <datalist id="po-plant-suggestions">
                <option value="Biyagama" />
                <option value="Katunayake" />
                <option value="Mawathagama" />
                <option value="Avissawella" />
                <option value="Koggala" />
                <option value="Wathupitiwala" />
              </datalist>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
              Supervisors assigned to this plant will monitor and manage this PO.
            </span>
          </div>
        </div>

          {/* Production Line Numbers */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={styles.label}>Production Line Numbers (Assigned Lines)</label>
              {lineNumber.trim() && (
                <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                  {parsePoLines(lineNumber).length} Line{parsePoLines(lineNumber).length > 1 ? 's' : ''} Configured
                </span>
              )}
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{
                position: 'absolute',
                left: '12px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--primary-teal)',
                fontWeight: 800,
                fontSize: '13px',
                pointerEvents: 'none'
              }}>
                Line
              </div>
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '50px' }}
                placeholder="1, 6, 8 (Enter line numbers separated by comma)"
                value={lineNumber.replace(/^Line\s*/i, '')}
                onChange={e => {
                  const val = e.target.value;
                  if (!val.trim()) {
                    setLineNumber('');
                  } else {
                    setLineNumber(val.toLowerCase().startsWith('line') ? val : `Line ${val}`);
                  }
                }}
              />
            </div>
            {lineNumber.trim() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Assigned Lines:</span>
                {parsePoLines(lineNumber).map((line, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      color: 'var(--primary-teal)',
                      border: '1px solid rgba(20, 184, 166, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ✓ {line}
                  </span>
                ))}
              </div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Enter single or multiple line numbers (e.g. 1, 6, 8). Operators will select their line when beginning work.
            </span>
          </div>

        {/* ── Shift Groups Allocation Panel ─────────────────── */}
        <div style={{ border: '1.5px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', backgroundColor: 'var(--bg-surface-1)' }}>
          {/* Panel header */}
          <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--primary-teal)" />
                Shift Groups Allocated to this PO
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Select which Shift Groups will work on this Production Order. All operators in the selected shifts will automatically receive and be authorized for this PO.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/supervisor/shifts')}
              style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', background: 'none', border: '1px solid var(--primary-teal)', padding: '5px 12px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Manage Shifts ↗
            </button>
          </div>

          {/* Shift Cards Grid */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loadingRoster && shiftsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading shift groups…
              </div>
            ) : shiftsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No shift groups found. Go to{' '}
                <button type="button" onClick={() => navigate('/supervisor/shifts')} style={{ color: 'var(--primary-teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Shift Management
                </button>{' '}
                to create shift groups.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                {shiftsList.map(shift => {
                  const shiftCodeUpper = (shift.code || 'A').toUpperCase();
                  const colors = SHIFT_COLORS[shiftCodeUpper] || SHIFT_COLORS.A;
                  const isSelected = isShiftSelected(shift.id, shift.code);
                  const memberCount = shift.members?.length || 0;

                  return (
                    <div
                      key={shift.id}
                      onClick={() => toggleShiftSelection(shift)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: `1.5px solid ${isSelected ? colors.border : 'var(--border-color)'}`,
                        backgroundColor: isSelected ? colors.bg : 'var(--bg-surface-2)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 10px rgba(0,0,0,0.08)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? colors.text : 'var(--bg-surface-1)',
                          border: `1px solid ${isSelected ? colors.border : 'var(--border-color)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '15px',
                          fontWeight: 900,
                          color: isSelected ? '#fff' : colors.text
                        }}>
                          {shift.code}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {shift.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Users size={11} color="var(--text-muted)" />
                            <span><strong>{memberCount}</strong> {memberCount === 1 ? 'Operator' : 'Operators'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '6px',
                        border: `2px solid ${isSelected ? colors.text : 'var(--border-color)'}`,
                        backgroundColor: isSelected ? colors.text : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        transition: 'all 0.15s'
                      }}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected shifts & total operator summary */}
            <div style={{
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: poAllocations.length > 0 ? 'rgba(22, 184, 174, 0.08)' : 'var(--bg-surface-2)',
              border: `1px solid ${poAllocations.length > 0 ? 'rgba(22, 184, 174, 0.25)' : 'var(--border-color)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {poAllocations.length > 0 ? (
                  <span>
                    ✓ <strong>{selectedShiftCount}</strong> Shift Group{selectedShiftCount !== 1 ? 's' : ''} Selected · <strong>{uniqueOperatorCount}</strong> unique operator{uniqueOperatorCount !== 1 ? 's' : ''} will be authorized for this PO
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    No shift groups selected yet. Click on one or more Shift Groups above to assign them to this PO.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Operations Checkboxes ─────────────────────────────── */}
        <div>
          <label style={styles.label}>Required Operations for this PO</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {(['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'FINAL AQL', 'Box Transfer'] as OperationType[]).map(op => {
              const isChecked = Array.isArray(selectedOps) && selectedOps.includes(op);
              return (
                <React.Fragment key={op}>
                  <div
                    style={{
                      ...styles.opCheckRow,
                      borderColor: isChecked ? 'var(--primary-teal)' : 'var(--border-color)',
                      backgroundColor: isChecked ? 'rgba(22,184,174,0.08)' : 'var(--bg-surface-1)',
                    }}
                    onClick={() => toggleOp(op)}
                  >
                    {isChecked
                      ? <CheckSquare size={20} color="var(--primary-teal)" />
                      : <Square size={20} color="var(--text-muted)" />}
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{op === 'Pre QC' ? 'Inline' : op === 'QC Test' ? 'Endline' : op}</span>
                  </div>

                  {op === 'Pre QC' && isChecked && (
                    <div style={{ marginLeft: '12px', padding: '14px 16px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800, margin: 0 }}>
                            Inline Tests Configuration (Multi-Select)
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {preQcTests.length} test{preQcTests.length !== 1 ? 's' : ''} selected
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Select which tests operators must perform in Pre-QC inspection or add custom tests.
                        </p>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {availablePreQcTests.map(testName => {
                            const isSelected = preQcTests.includes(testName);
                            return (
                              <button
                                key={testName}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    if (preQcTests.length === 1) {
                                      showToast('At least one Pre-QC test must remain selected', 'warning');
                                      return;
                                    }
                                    const updated = preQcTests.filter(t => t !== testName);
                                    setPreQcTests(updated);
                                    if (preQcStationCount > updated.length) setPreQcStationCount(Math.max(1, updated.length));
                                  } else {
                                    setPreQcTests([...preQcTests, testName]);
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 14px',
                                  borderRadius: '20px',
                                  border: `1.5px solid ${isSelected ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                                  backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-1)',
                                  color: isSelected ? 'var(--primary-teal)' : 'var(--text-secondary)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {isSelected ? <CheckSquare size={14} color="var(--primary-teal)" /> : <Square size={14} color="var(--text-muted)" />}
                                <span>{testName}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="input-field"
                            style={{ maxWidth: '280px', padding: '6px 12px', fontSize: '12px' }}
                            placeholder="e.g. Fabric Inspection, Trim Check..."
                            value={customPreQcInput}
                            onChange={e => setCustomPreQcInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomPreQcTest();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomPreQcTest}
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              padding: '7px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--primary-teal)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Plus size={14} /> Add Test
                          </button>
                        </div>
                      </div>

                      <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800, margin: 0 }}>
                            INLINE STATION COUNT (Max: {Math.max(1, preQcTests.length)} Station{preQcTests.length > 1 ? 's' : ''})
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Selected: {preQcStationCount} Station{preQcStationCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Select station count: <strong>1 Station</strong> (combined single Save for all selected tests) or up to <strong>{preQcTests.length} Stations</strong> (independent saves).
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {Array.from({ length: Math.max(1, preQcTests.length) }, (_, i) => i + 1).map(count => (
                            <label
                              key={count}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 16px',
                                borderRadius: '10px',
                                border: `2px solid ${preQcStationCount === count ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                                backgroundColor: preQcStationCount === count ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface-1)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: preQcStationCount === count ? 'var(--primary-teal)' : 'var(--text-primary)'
                              }}
                            >
                              <input
                                type="radio"
                                name="preQcStationCount"
                                value={count}
                                checked={preQcStationCount === count}
                                onChange={() => setPreQcStationCount(count)}
                                style={{ accentColor: 'var(--primary-teal)' }}
                              />
                              {count} {count === 1 ? 'Station' : 'Stations'}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {op === 'QC Test' && isChecked && (
                    <div style={{ marginLeft: '12px', padding: '14px 16px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800, margin: 0 }}>
                            Endline Tests Configuration (Multi-Select)
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {qcTests.length} test{qcTests.length !== 1 ? 's' : ''} selected
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Select which tests operators must perform (e.g. Endline QC, Functional Test, or add custom tests like Incline Test).
                        </p>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {availableQcTests.map(testName => {
                            const isSelected = qcTests.includes(testName);
                            return (
                              <button
                                key={testName}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    if (qcTests.length === 1) {
                                      showToast('At least one QC test must remain selected', 'warning');
                                      return;
                                    }
                                    const updated = qcTests.filter(t => t !== testName);
                                    setQcTests(updated);
                                    if (qcStationCount > updated.length) setQcStationCount(Math.max(1, updated.length));
                                  } else {
                                    setQcTests([...qcTests, testName]);
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '6px 14px',
                                  borderRadius: '20px',
                                  border: `1.5px solid ${isSelected ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                                  backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-1)',
                                  color: isSelected ? 'var(--primary-teal)' : 'var(--text-secondary)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {isSelected ? <CheckSquare size={14} color="var(--primary-teal)" /> : <Square size={14} color="var(--text-muted)" />}
                                <span>{testName}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            className="input-field"
                            style={{ maxWidth: '280px', padding: '6px 12px', fontSize: '12px' }}
                            placeholder="e.g. Incline Test, Drop Test..."
                            value={customQcInput}
                            onChange={e => setCustomQcInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomQcTest();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomQcTest}
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              padding: '7px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--primary-teal)',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Plus size={14} /> Add Test
                          </button>
                        </div>
                      </div>

                      <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800, margin: 0 }}>
                            QC STATION COUNT (Max: {Math.max(1, qcTests.length)} Station{qcTests.length > 1 ? 's' : ''})
                          </label>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Selected: {qcStationCount} Station{qcStationCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Select station count: <strong>1 Station</strong> (combined single Save for all selected tests) or up to <strong>{qcTests.length} Stations</strong> (independent saves).
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {Array.from({ length: Math.max(1, qcTests.length) }, (_, i) => i + 1).map(count => (
                            <label
                              key={count}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 16px',
                                borderRadius: '10px',
                                border: `2px solid ${qcStationCount === count ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                                backgroundColor: qcStationCount === count ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface-1)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: qcStationCount === count ? 'var(--primary-teal)' : 'var(--text-primary)'
                              }}
                            >
                              <input
                                type="radio"
                                name="qcStationCount"
                                value={count}
                                checked={qcStationCount === count}
                                onChange={() => setQcStationCount(count)}
                                style={{ accentColor: 'var(--primary-teal)' }}
                              />
                              {count} {count === 1 ? 'Station' : 'Stations'}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Remarks ──────────────────────────────────────────── */}
        <div>
          <label style={styles.label}>Remarks / Instructions</label>
          <textarea
            className="input-field"
            rows={2}
            placeholder="Enter instructions or remarks for the Production Order..."
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
          Next: Product Configurations <ArrowRight size={18} style={{ marginLeft: '6px' }} />
        </button>
      </form>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wizardBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-1)', borderRadius: '14px',
    padding: '10px 14px', border: '1px solid var(--border-color)',
  },
  stepActive: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)',
  },
  stepNumActive: {
    width: '20px', height: '20px', borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)', color: '#071B23',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 800,
  },
  stepInactive: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
  },
  stepNumInactive: {
    width: '20px', height: '20px', borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700,
  },
  stepDivider: { flex: 1, height: '1px', backgroundColor: 'var(--border-color)', margin: '0 8px' },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 700,
    color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase',
  },
  opCheckRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 14px', borderRadius: '12px',
    border: '1.5px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s ease',
  },
};

export const CreatePOGeneral: React.FC = () => (
  <ErrorBoundary fallbackTitle="Error loading Production Order Creation">
    <CreatePOGeneralInner />
  </ErrorBoundary>
);
