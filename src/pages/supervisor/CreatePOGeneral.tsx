import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { OperationType, QcTestMode } from '../../types';
import { ArrowRight, CheckSquare, Square, Plus, X, Users, Clock, ChevronDown, ChevronRight } from 'lucide-react';
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

export const CreatePOGeneral: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [stylesList, setStylesList] = useState<StyleItem[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [selectedStyleId, setSelectedStyleId] = useState('');

  const [poId, setPoId] = useState(() => `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poName, setPoName] = useState(() => 'BioTab Morning Batch');
  const [mapPo, setMapPo] = useState(() => `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`);
  const [startDate, setStartDate] = useState('2026-09-15');
  const [dueDate, setDueDate] = useState('2026-10-10');
  const [supervisor, setSupervisor] = useState('Nimal Perera');
  const [remarks, setRemarks] = useState('Export batch for Q4 delivery');

  const [selectedOps, setSelectedOps] = useState<OperationType[]>([
    'Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer',
  ]);
  const [qcTestMode, setQcTestMode] = useState<QcTestMode>('QC & Test');

  // Roster state — loaded from /api/shifts/all-members
  const [rosterRows, setRosterRows] = useState<ShiftRosterRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);

  // Selected PO allocations (operator+shift combos for THIS PO)
  const [poAllocations, setPoAllocations] = useState<PoAllocation[]>([]);

  // Expanded shifts in roster view
  const [expandedShiftGroups, setExpandedShiftGroups] = useState<Set<string>>(new Set());

  // Load styles and roster
  const loadData = useCallback(async () => {
    const [stylesResult, rosterResult] = await Promise.allSettled([
      apiFetch<StyleItem[]>('/api/styles'),
      apiFetch<ShiftRosterRow[]>('/api/shifts/all-members'),
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
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

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
      // Primary shift = first allocation's shift (for `production_orders.shift_id`)
      shiftId: poAllocations[0]?.shiftId,
      shiftName: poAllocations[0]?.shiftName,
      remarks,
      selectedOperations: selectedOps,
      qcTestMode: selectedOps.includes('QC Test') ? qcTestMode : undefined,
      // All operator+shift allocations to persist in operator_work_assignments
      allocations: poAllocations.map(a => ({
        workerId: a.operatorId,
        workerName: a.operatorName,
        shiftId: a.shiftId,
        shiftCode: a.shiftCode,
        enabledOperations: selectedOps,
      })),
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleId);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftPo));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(poAllocations));
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                  const colors = SHIFT_COLORS[alloc.shiftCode] || SHIFT_COLORS.A;
                  return (
                    <div
                      key={`${alloc.operatorId}|${alloc.shiftId}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: '8px', padding: '5px 10px' }}
                    >
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, color: '#fff' }}>
                        {alloc.operatorName.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{alloc.operatorName}</div>
                        <div style={{ fontSize: '10px', color: colors.text }}>
                          <Clock size={9} style={{ display: 'inline', marginRight: '3px' }} />
                          {alloc.shiftName} · {alloc.startTime}–{alloc.endTime}
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
                                  {member.full_name.charAt(0)}
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{member.full_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{member.employee_no} · @{member.username}</div>
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
            {(['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'] as OperationType[]).map(op => {
              const isChecked = selectedOps.includes(op);
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
                      <label style={{ ...styles.label, color: 'var(--primary-teal)', fontWeight: 800 }}>QC Test Mode</label>
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
