import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Users, Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, AlertCircle, Building2, Search, Sparkles } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

interface ShiftMember {
  member_id: string;
  operator_id: string;
  full_name: string;
  username: string;
  employee_no: string;
  effective_from?: string;
  plant?: string;
}

interface ShiftData {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  active: number;
  members: ShiftMember[];
}

interface Operator {
  id: string;
  full_name: string;
  username: string;
  employee_no: string;
  plant?: string;
}

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string; lightBg: string }> = {
  A: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#10B981', lightBg: 'rgba(16,185,129,0.06)' },
  B: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)', text: '#3B82F6', lightBg: 'rgba(59,130,246,0.06)' },
  C: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.35)', text: '#8B5CF6', lightBg: 'rgba(139,92,246,0.06)' },
  D: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#F59E0B', lightBg: 'rgba(245,158,11,0.06)' },
  E: { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.35)', text: '#EC4899', lightBg: 'rgba(236,72,153,0.06)' },
};

export const ShiftManagementPage: React.FC = () => {
  const { showToast } = useApp();

  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  // Search filter per shift (shiftId -> search text)
  const [shiftSearchQuery, setShiftSearchQuery] = useState<Record<string, string>>({});

  // Add-member state: which shift + which operator being added
  const [addingToShift, setAddingToShift] = useState<string | null>(null);
  const [selectedOperatorToAdd, setSelectedOperatorToAdd] = useState<string>('');
  const [savingMember, setSavingMember] = useState(false);

  // Create new shift group modal
  const [showCreateShiftModal, setShowCreateShiftModal] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftName, setNewShiftName] = useState('');
  const [creatingShift, setCreatingShift] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const [shiftsRes, opsRes] = await Promise.all([
        apiFetch<ShiftData[]>('/api/shifts'),
        apiFetch<Operator[]>('/api/operators'),
      ]);
      setShifts(shiftsRes);
      setOperators(opsRes);
      // Auto-expand all shifts on first load
      setExpandedShifts(new Set(shiftsRes.map(s => s.id)));
    } catch (err: any) {
      showToast('Failed to load shift data', 'error');
    } finally {
      setLoadingShifts(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (shiftId: string) => {
    setExpandedShifts(prev => {
      const next = new Set(prev);
      if (next.has(shiftId)) next.delete(shiftId);
      else next.add(shiftId);
      return next;
    });
  };

  const handleAddMember = async (shiftId: string) => {
    if (!selectedOperatorToAdd) {
      showToast('Please select an operator to add', 'warning');
      return;
    }
    setSavingMember(true);
    try {
      await apiFetch(`/api/shifts/${shiftId}/members`, {
        method: 'POST',
        body: JSON.stringify({ operatorId: selectedOperatorToAdd }),
      });
      showToast('Operator added to shift successfully', 'success');
      setAddingToShift(null);
      setSelectedOperatorToAdd('');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to add operator to shift', 'error');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (shiftId: string, operatorId: string, operatorName: string) => {
    if (!window.confirm(`Remove ${operatorName} from this shift group?`)) return;
    try {
      await apiFetch(`/api/shifts/${shiftId}/members/${operatorId}`, { method: 'DELETE' });
      showToast(`${operatorName} removed from shift group`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove operator', 'error');
    }
  };

  // Open Create Shift modal with auto-suggested next letter
  const handleOpenCreateShift = () => {
    const existingCodes = new Set(shifts.map(s => s.code.toUpperCase()));
    const alphabet = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nextCode = alphabet.find(c => !existingCodes.has(c)) || 'C';
    setNewShiftCode(nextCode);
    setNewShiftName(`Shift ${nextCode}`);
    setShowCreateShiftModal(true);
  };

  const handleCreateShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftCode.trim() || !newShiftName.trim()) {
      showToast('Please enter both shift code and name', 'warning');
      return;
    }
    setCreatingShift(true);
    try {
      await apiFetch('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({ code: newShiftCode.trim(), name: newShiftName.trim() })
      });
      showToast(`Shift group ${newShiftName.trim()} created successfully`, 'success');
      setShowCreateShiftModal(false);
      setNewShiftCode('');
      setNewShiftName('');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create shift group', 'error');
    } finally {
      setCreatingShift(false);
    }
  };

  const handleDeleteShift = async (shift: ShiftData) => {
    if (shift.code === 'A' || shift.code === 'B') {
      showToast('Default Shift A and Shift B cannot be deleted', 'warning');
      return;
    }
    if (shift.members.length > 0) {
      if (!window.confirm(`${shift.name} currently has ${shift.members.length} operators. Deleting it will remove them from this group. Continue?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Delete ${shift.name}?`)) return;
    }

    try {
      await apiFetch(`/api/shifts/${shift.id}`, { method: 'DELETE' });
      showToast(`Deleted ${shift.name}`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete shift group', 'error');
    }
  };

  // Operators available to add: exclude operators already in THIS specific shift
  // (An operator CAN be in multiple shifts)
  const getAvailableOperators = (shift: ShiftData): Operator[] => {
    const assignedIds = new Set(shift.members.map(m => m.operator_id));
    return operators.filter(op => !assignedIds.has(op.id));
  };

  // Total unique assigned operators across all shifts
  const totalUniqueAssignedCount = useMemo(() => {
    const set = new Set<string>();
    shifts.forEach(s => s.members.forEach(m => set.add(m.operator_id)));
    return set.size;
  }, [shifts]);

  if (loadingShifts) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '12px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading factory shifts…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} color="var(--primary-teal)" />
            Shift Groups &amp; Operator Management
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Create custom Shift Groups (Shift A, Shift B, etc.) and assign operators. An operator can belong to multiple shifts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={loadData}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={handleOpenCreateShift}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
          >
            <Plus size={15} /> Add Shift Group
          </button>
        </div>
      </div>

      {/* ── Quick Summary Cards ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'rgba(22, 184, 174, 0.12)', border: '1px solid rgba(22, 184, 174, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-teal)' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Shift Groups
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {shifts.length} Groups
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3B82F6' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Operators Assigned
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {totalUniqueAssignedCount} Operators
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B5CF6' }}>
            <Building2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Factory Operators
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              {operators.length} Registered
            </div>
          </div>
        </div>
      </div>

      {/* ── Shift Groups List ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {shifts.map(shift => {
          const shiftCodeUpper = (shift.code || 'A').toUpperCase();
          const colors = SHIFT_COLORS[shiftCodeUpper] || SHIFT_COLORS.A;
          const isExpanded = expandedShifts.has(shift.id);
          const addingHere = addingToShift === shift.id;
          const available = getAvailableOperators(shift);
          const query = (shiftSearchQuery[shift.id] || '').trim().toLowerCase();

          // Filter members in this shift based on local search
          const filteredMembers = query
            ? shift.members.filter(m =>
                (m.full_name || '').toLowerCase().includes(query) ||
                (m.employee_no || '').toLowerCase().includes(query) ||
                (m.username || '').toLowerCase().includes(query) ||
                (m.plant || '').toLowerCase().includes(query)
              )
            : shift.members;

          return (
            <div
              key={shift.id}
              style={{
                borderRadius: '16px',
                border: `1.5px solid ${isExpanded ? colors.border : 'var(--border-color)'}`,
                backgroundColor: 'var(--bg-surface-1)',
                overflow: 'hidden',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              {/* Shift Card Header */}
              <div
                onClick={() => toggleExpand(shift.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? colors.lightBg : 'transparent',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: colors.bg,
                    border: `1.5px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                    color: colors.text
                  }}>
                    {shift.code}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {shift.name}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '2px 9px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Users size={11} /> {shift.members.length} {shift.members.length === 1 ? 'Operator' : 'Operators'}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                      Operators in this group will be authorized when this shift is selected on a PO
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingToShift(addingHere ? null : shift.id);
                      setSelectedOperatorToAdd('');
                      if (!isExpanded) toggleExpand(shift.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    <Plus size={14} /> Add Operator
                  </button>
                  {shift.code !== 'A' && shift.code !== 'B' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteShift(shift);
                      }}
                      title="Delete custom shift group"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        color: '#EF4444',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {isExpanded ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Shift Card Body */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Inline Add Operator Form */}
                  {addingHere && (
                    <div style={{
                      backgroundColor: colors.bg,
                      border: `1.5px solid ${colors.border}`,
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                      flexWrap: 'wrap'
                    }}>
                      <Users size={16} color={colors.text} style={{ flexShrink: 0 }} />
                      <select
                        className="input-field"
                        value={selectedOperatorToAdd}
                        onChange={e => setSelectedOperatorToAdd(e.target.value)}
                        style={{ flex: 1, minWidth: '240px', fontSize: '13px', margin: 0, backgroundColor: 'var(--bg-surface-1)' }}
                      >
                        <option value="">— Select Operator to Add to {shift.name} —</option>
                        {available.map(op => (
                          <option key={op.id} value={op.id}>
                            {op.plant ? `[${op.plant}] ` : ''}{op.full_name} ({op.employee_no})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddMember(shift.id)}
                        disabled={savingMember || !selectedOperatorToAdd}
                        style={{
                          padding: '8px 18px',
                          borderRadius: '8px',
                          backgroundColor: colors.text,
                          border: 'none',
                          color: '#fff',
                          cursor: (savingMember || !selectedOperatorToAdd) ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          opacity: (!selectedOperatorToAdd || savingMember) ? 0.6 : 1,
                          flexShrink: 0
                        }}
                      >
                        {savingMember ? 'Saving…' : 'Add to Group'}
                      </button>
                      <button
                        onClick={() => { setAddingToShift(null); setSelectedOperatorToAdd(''); }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Search Bar for this shift (if more than 4 operators) */}
                  {shift.members.length > 4 && (
                    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                      <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder={`Search ${shift.members.length} operators in ${shift.name}…`}
                        value={shiftSearchQuery[shift.id] || ''}
                        onChange={e => setShiftSearchQuery({ ...shiftSearchQuery, [shift.id]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px 7px 32px',
                          fontSize: '12px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)'
                        }}
                      />
                    </div>
                  )}

                  {/* Operator Member List - Flexible scrollable container for high volume */}
                  {shift.members.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={22} />
                      <span style={{ fontSize: '13px' }}>No operators assigned to {shift.name} yet.</span>
                      <span style={{ fontSize: '12px' }}>Click "Add Operator" above to add operators to this group.</span>
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No operators matching "{query}"
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '10px',
                      maxHeight: '440px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}>
                      {filteredMembers.map(member => (
                        <div
                          key={member.member_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            padding: '9px 12px',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: colors.bg,
                              border: `1px solid ${colors.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 800,
                              color: colors.text,
                              flexShrink: 0
                            }}>
                              {(member.full_name || member.username || 'O').charAt(0).toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <div style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {member.full_name}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                <span>{member.employee_no}</span>
                                {member.plant && (
                                  <span style={{
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(22, 184, 174, 0.12)',
                                    color: 'var(--primary-teal)',
                                    border: '1px solid rgba(22, 184, 174, 0.25)'
                                  }}>
                                    {member.plant}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(shift.id, member.operator_id, member.full_name)}
                            title="Remove operator from this shift"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#EF4444',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Explanation Note ─────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'rgba(22, 184, 174, 0.06)',
        border: '1px solid rgba(22, 184, 174, 0.25)',
        borderRadius: '14px',
        padding: '14px 18px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <AlertCircle size={18} color="var(--primary-teal)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
            Production Order Integration:
          </strong>
          When creating a Production Order (PO), you simply select the Shift Group(s) (e.g. <strong>Shift A</strong>, <strong>Shift B</strong>). All operators assigned to those selected shifts will automatically be authorized and will see the PO on their operator devices. An operator can belong to multiple shift groups without restriction.
        </div>
      </div>

      {/* ── Modal: Add New Shift Group ───────────────────────────── */}
      {showCreateShiftModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Create New Shift Group
              </h3>
              <button
                onClick={() => setShowCreateShiftModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShiftSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Shift Code (e.g. C, D, E)
                </label>
                <input
                  type="text"
                  maxLength={5}
                  value={newShiftCode}
                  onChange={e => {
                    const c = e.target.value.toUpperCase();
                    setNewShiftCode(c);
                    setNewShiftName(`Shift ${c}`);
                  }}
                  className="input-field"
                  placeholder="e.g. C"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Shift Group Name
                </label>
                <input
                  type="text"
                  value={newShiftName}
                  onChange={e => setNewShiftName(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Shift C"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateShiftModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingShift}
                  className="btn-primary"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: creatingShift ? 'not-allowed' : 'pointer'
                  }}
                >
                  {creatingShift ? 'Creating…' : 'Create Shift Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
