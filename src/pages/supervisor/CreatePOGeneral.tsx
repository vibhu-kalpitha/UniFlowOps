import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { OperationType, QcTestMode, ProductionOrder } from '../../types';
import { ArrowRight, CheckSquare, Square, Plus, X, Users, Clock, ChevronDown, ChevronRight, Copy, Sparkles, Check, FileText, Building2 } from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
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
  const [poName, setPoName] = useState(() => 'BioTab Morning Batch');
  const [mapPo, setMapPo] = useState(() => `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`);
  const [startDate, setStartDate] = useState('2026-09-15');
  const [dueDate, setDueDate] = useState('2026-10-10');
  const [supervisor, setSupervisor] = useState('Nimal Perera');
  const [plant, setPlant] = useState(() => currentUser?.plant || 'Biyagama');
  const [remarks, setRemarks] = useState('Export batch for Q4 delivery');

  const [selectedOps, setSelectedOps] = useState<OperationType[]>([
    'Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer',
  ]);
  const [qcTestMode, setQcTestMode] = useState<QcTestMode>('QC & Test');
  const [qcStationCount, setQcStationCount] = useState<1 | 2>(1);

  // Roster state — loaded from /api/shifts/all-members
  const [rosterRows, setRosterRows] = useState<ShiftRosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  // Selected PO allocations (operator+shift combos for THIS PO)
  const [poAllocations, setPoAllocations] = useState<PoAllocation[]>([]);

  // Expanded shifts in roster view
  const [expandedShiftGroups, setExpandedShiftGroups] = useState<Set<string>>(new Set());

  // Copy Previous PO state
  const [previousOrders, setPreviousOrders] = useState<ProductionOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedCopyPoId, setSelectedCopyPoId] = useState<string>('');
  const [copiedSourcePo, setCopiedSourcePo] = useState<ProductionOrder | null>(null);

  // Load styles, roster, and previous POs
  const loadData = useCallback(async () => {
    const [stylesResult, rosterResult, posResult] = await Promise.allSettled([
      apiFetch<StyleItem[]>('/api/styles'),
      apiFetch<ShiftRosterRow[]>('/api/shifts/all-members'),
      apiFetch<ProductionOrder[]>('/api/production-orders'),
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

    if (rosterResult.status === 'fulfilled') {
      setRosterRows(rosterResult.value);
      // Auto-expand all shifts in roster
      const codes = new Set(rosterResult.value.map(r => r.shift_id));
      setExpandedShiftGroups(codes);
    } else {
      // Fallback mock roster if API fails
      setRosterRows([
        { member_id: 'sm-1', shift_id: 'shift-a', shift_code: 'A', shift_name: 'Shift A', start_time: '06:00', end_time: '10:00', operator_id: 'usr-001', full_name: 'Chamika Silva', username: 'chamika', employee_no: 'EMP-101' },
        { member_id: 'sm-2', shift_id: 'shift-b', shift_code: 'B', shift_name: 'Shift B', start_time: '10:00', end_time: '14:00', operator_id: 'usr-001', full_name: 'Chamika Silva', username: 'chamika', employee_no: 'EMP-101' },
        { member_id: 'sm-3', shift_id: 'shift-a', shift_code: 'A', shift_name: 'Shift A', start_time: '06:00', end_time: '10:00', operator_id: 'usr-004', full_name: 'Kavindu Perera', username: 'kavindu', employee_no: 'EMP-104' },
      ]);
      setExpandedShiftGroups(new Set(['shift-a', 'shift-b', 'shift-c', 'shift-d']));
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
        if (parsed.remarks) setRemarks(parsed.remarks);
        if (parsed.selectedOperations && Array.isArray(parsed.selectedOperations)) {
          setSelectedOps(parsed.selectedOperations.map(normalizeOpName));
        }
        if (parsed.qcTestMode) setQcTestMode(parsed.qcTestMode);
        if (parsed.qcStationCount) setQcStationCount(parsed.qcStationCount);
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
    const nextRemarks = sourcePo.remarks || '';

    setStartDate(nextStart);
    setDueDate(nextDue);
    setSupervisor(nextSup);
    setPlant(nextPlant);
    setRemarks(nextRemarks);

    // Selected operations & QC mode
    const opsToSet: OperationType[] = (sourcePo.selectedOperations && Array.isArray(sourcePo.selectedOperations) && sourcePo.selectedOperations.length > 0)
      ? sourcePo.selectedOperations.map(normalizeOpName)
      : selectedOps;
    setSelectedOps(opsToSet);

    const nextQcMode = sourcePo.qcTestMode || qcTestMode;
    const nextQcStations = (sourcePo.qcStationCount as 1 | 2) || qcStationCount;
    setQcTestMode(nextQcMode);
    setQcStationCount(nextQcStations);

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
      shiftId: mapped[0]?.shiftId || sourcePo.shiftId || '',
      shiftName: mapped[0]?.shiftName || sourcePo.shiftName || '',
      remarks: nextRemarks,
      selectedOperations: opsToSet,
      qcTestMode: nextQcMode,
      qcStationCount: nextQcStations,
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

  // Group roster rows by shift
  const rosterByShift = rosterRows.reduce<Record<string, { shift: ShiftRosterRow; members: ShiftRosterRow[] }>>((acc, row) => {
    if (!acc[row.shift_id]) {
      acc[row.shift_id] = { shift: row, members: [] };
    }
    acc[row.shift_id].members.push(row);
    return acc;
  }, {});

  const toggleRosterRowSelection = (row: ShiftRosterRow) => {
    const key = `${row.operator_id}|${row.shift_id}`;
    const already = poAllocations.some(a => a.operatorId === row.operator_id && a.shiftId === row.shift_id);
    if (already) {
      setPoAllocations(prev => prev.filter(a => !(a.operatorId === row.operator_id && a.shiftId === row.shift_id)));
    } else {
      setPoAllocations(prev => [...prev, {
        operatorId: row.operator_id,
        operatorName: row.full_name,
        shiftId: row.shift_id,
        shiftName: row.shift_name,
        shiftCode: row.shift_code,
        startTime: row.start_time,
        endTime: row.end_time,
      }]);
    }
  };

  const isRowSelected = (row: ShiftRosterRow) =>
    poAllocations.some(a => a.operatorId === row.operator_id && a.shiftId === row.shift_id);

  const removeAllocation = (operatorId: string, shiftId: string) => {
    setPoAllocations(prev => prev.filter(a => !(a.operatorId === operatorId && a.shiftId === shiftId)));
  };

  const toggleShiftGroup = (shiftId: string) => {
    setExpandedShiftGroups(prev => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  };

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
      showToast('Please add at least one operator allocation from the shift roster', 'warning');
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
      // Primary shift = first allocation's shift (for `production_orders.shift_id`)
      shiftId: poAllocations[0]?.shiftId,
      shiftName: poAllocations[0]?.shiftName,
      remarks,
      selectedOperations: selectedOps,
      qcTestMode: selectedOps.includes('QC Test') ? qcTestMode : undefined,
      qcStationCount: selectedOps.includes('QC Test') ? qcStationCount : 1,
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
              placeholder="e.g. BioTab Morning Batch"
              value={poName}
              onChange={e => setPoName(e.target.value)}
            />
          </div>

          {/* Map PO */}
          <div>
            <label style={styles.label}>Map PO (Free Text Code)</label>
            <input type="text" className="input-field" placeholder="e.g. MAP-PO-44821" value={mapPo} onChange={e => setMapPo(e.target.value)} required />
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

        {/* ── Operator–Shift Allocation Panel ─────────────────── */}
        <div style={{ border: '1.5px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden' }}>
          {/* Panel header */}
          <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="var(--primary-teal)" />
                Operator Shift Allocations for this PO
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Select which operator↔shift combinations will be authorized to work this Production Order.
                Pre-assigned roster is loaded from <strong>Shift Management</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/supervisor/shifts')}
              style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', background: 'none', border: '1px solid var(--primary-teal)', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Manage Roster ↗
            </button>
          </div>

          {/* Selected allocations summary */}
          {poAllocations.length > 0 && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(22,184,174,0.05)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Selected ({poAllocations.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {poAllocations.map(alloc => {
                  const opName = alloc.operatorName || alloc.operatorId || 'Operator';
                  const shiftLetter = ((alloc.shiftCode || 'A').toUpperCase().charAt(0)) || 'A';
                  const colors = SHIFT_COLORS[shiftLetter] || SHIFT_COLORS.A;
                  return (
                    <div
                      key={`${alloc.operatorId || ''}|${alloc.shiftId || ''}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: '8px', padding: '5px 10px' }}
                    >
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#fff' }}>
                        {opName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{opName}</div>
                        <div style={{ fontSize: '10px', color: colors.text }}>
                          <Clock size={9} style={{ display: 'inline', marginRight: '3px' }} />
                          {alloc.shiftName || 'Shift'} · {alloc.startTime || '06:00'}–{alloc.endTime || '14:00'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAllocation(alloc.operatorId, alloc.shiftId)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Roster grouped by shift */}
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingRoster ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Loading shift roster…
              </div>
            ) : Object.keys(rosterByShift).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No operators assigned to any shift yet.{' '}
                <button type="button" onClick={() => navigate('/supervisor/shifts')} style={{ color: 'var(--primary-teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                  Go to Shift Management →
                </button>
              </div>
            ) : (
              Object.values(rosterByShift).map(({ shift, members }) => {
                const colors = SHIFT_COLORS[shift.shift_code] || SHIFT_COLORS.A;
                const isOpen = expandedShiftGroups.has(shift.shift_id);
                const selectedCount = members.filter(m => isRowSelected(m)).length;

                return (
                  <div key={shift.shift_id} style={{ border: `1px solid ${isOpen ? colors.border : 'var(--border-color)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Shift group header */}
                    <div
                      onClick={() => toggleShiftGroup(shift.shift_id)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', backgroundColor: isOpen ? colors.bg : 'transparent', transition: 'background-color 0.2s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Clock size={15} color={colors.text} />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: colors.text }}>{shift.shift_name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{shift.start_time} – {shift.end_time}</span>
                        <span style={{ fontSize: '11px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1px 7px', color: 'var(--text-muted)' }}>
                          {members.length} assigned
                        </span>
                        {selectedCount > 0 && (
                          <span style={{ fontSize: '11px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '1px 7px', color: colors.text, fontWeight: 700 }}>
                            {selectedCount} selected for PO
                          </span>
                        )}
                      </div>
                      {isOpen ? <ChevronDown size={15} color="var(--text-muted)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
                    </div>

                    {/* Members in this shift */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {members.map((member, idx) => {
                          const selected = isRowSelected(member);
                          return (
                            <div
                              key={member.member_id}
                              onClick={() => toggleRosterRowSelection(member)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                backgroundColor: selected ? colors.bg : (idx % 2 === 0 ? 'var(--bg-surface-1)' : 'var(--bg-surface-2)'),
                                borderTop: idx > 0 ? '1px solid var(--border-color)' : 'none',
                                transition: 'background-color 0.15s',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {selected
                                  ? <CheckSquare size={18} color={colors.text} />
                                  : <Square size={18} color="var(--text-muted)" />
                                }
                                <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: selected ? colors.text : 'var(--bg-surface-2)', border: `1px solid ${selected ? colors.border : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: selected ? '#fff' : 'var(--text-muted)' }}>
                                  {(member.full_name || member.username || 'O').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{member.full_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                                    <span>{member.employee_no} · @{member.username}</span>
                                    {member.plant && (
                                      <span style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        backgroundColor: 'rgba(22, 184, 174, 0.15)',
                                        color: 'var(--primary-teal)'
                                      }}>
                                        {member.plant}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {selected && (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: colors.text, backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '3px 8px' }}>
                                  ✓ Added to PO
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{op}</span>
                  </div>

                  {op === 'QC Test' && isChecked && (
                    <div style={{ marginLeft: '12px', padding: '12px 14px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800 }}>Mode</label>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        Specify whether operator must perform both QC &amp; Test, QC Only, or Test Only.
                      </p>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {(['QC & Test', 'QC Only', 'Test Only'] as QcTestMode[]).map(mode => (
                          <label
                            key={mode}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px',
                              border: `2px solid ${qcTestMode === mode ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                              backgroundColor: qcTestMode === mode ? 'rgba(22,184,174,0.12)' : 'var(--bg-surface-1)',
                              cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                            }}
                          >
                            <input type="radio" name="qcTestMode" value={mode} checked={qcTestMode === mode} onChange={() => setQcTestMode(mode)} style={{ accentColor: 'var(--primary-teal)' }} />
                            {mode}
                          </label>
                        ))}
                      </div>

                      {/* QC Station Selection */}
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                        <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800 }}>QC STATION</label>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          Select <strong>1 Station</strong> (combined single Save for Endline &amp; Functional Test) or <strong>2 Stations</strong> (independent saves).
                        </p>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {([1, 2] as const).map(count => (
                            <label
                              key={count}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                                border: `2px solid ${qcStationCount === count ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                                backgroundColor: qcStationCount === count ? 'rgba(22,184,174,0.12)' : 'var(--bg-surface-1)',
                                cursor: 'pointer', fontSize: '13px', fontWeight: 700,
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
                              {count === 1 ? '1 Station' : '2 Stations'}
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
