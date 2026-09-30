import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Clock, Users, Plus, Trash2, UserCheck, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

interface ShiftData {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  active: number;
  members: ShiftMember[];
}

interface ShiftMember {
  member_id: string;
  operator_id: string;
  full_name: string;
  username: string;
  employee_no: string;
  effective_from?: string;
}

interface Operator {
  id: string;
  full_name: string;
  username: string;
  employee_no: string;
}

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.35)', text: '#10B981', dot: '#10B981' },
  B: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.35)', text: '#3B82F6', dot: '#3B82F6' },
  C: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.35)', text: '#8B5CF6', dot: '#8B5CF6' },
  D: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', text: '#F59E0B', dot: '#F59E0B' },
};

export const ShiftManagementPage: React.FC = () => {
  const { showToast } = useApp();

  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set(['shift-a', 'shift-b', 'shift-c', 'shift-d']));

  // Add-member state: which shift + which operator being added
  const [addingToShift, setAddingToShift] = useState<string | null>(null);
  const [selectedOperatorToAdd, setSelectedOperatorToAdd] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const [shiftsRes, opsRes] = await Promise.all([
        apiFetch<ShiftData[]>('/api/shifts'),
        apiFetch<Operator[]>('/api/operators'),
      ]);
      setShifts(shiftsRes);
      setOperators(opsRes);
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
    setSaving(true);
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
      setSaving(false);
    }
  };

  const handleRemoveMember = async (shiftId: string, operatorId: string, operatorName: string) => {
    if (!window.confirm(`Remove ${operatorName} from this shift?`)) return;
    try {
      await apiFetch(`/api/shifts/${shiftId}/members/${operatorId}`, { method: 'DELETE' });
      showToast(`${operatorName} removed from shift`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove operator', 'error');
    }
  };

  // Get operators not yet in a given shift
  const getAvailableOperators = (shift: ShiftData): Operator[] => {
    const assignedIds = new Set(shift.members.map(m => m.operator_id));
    return operators.filter(op => !assignedIds.has(op.id));
  };

  // Compute "now" active shift
  const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const activeShift = shifts.find(s => s.start_time <= nowTime && s.end_time > nowTime);

  if (loadingShifts) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '12px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading shift roster…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Work Shift Management
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Assign operators to factory shifts. These assignments auto-populate when creating Production Orders.
          </p>
        </div>
        <button
          onClick={loadData}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Active shift banner */}
      {activeShift && (
        <div style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UserCheck size={22} color="#10B981" />
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Currently Active Shift
            </span>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '1px' }}>
              {activeShift.name} &nbsp;<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{activeShift.start_time} – {activeShift.end_time}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {activeShift.members.length > 0
                ? `${activeShift.members.map(m => m.full_name).join(', ')} on duty`
                : 'No operators assigned to this shift'}
            </div>
          </div>
        </div>
      )}

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {shifts.map(shift => {
          const colors = SHIFT_COLORS[shift.code] || SHIFT_COLORS.A;
          return (
            <div key={shift.id} style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.dot }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: colors.text }}>{shift.name}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{shift.start_time}–{shift.end_time}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                · {shift.members.length} operator{shift.members.length !== 1 ? 's' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Shift Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {shifts.map(shift => {
          const colors = SHIFT_COLORS[shift.code] || SHIFT_COLORS.A;
          const isExpanded = expandedShifts.has(shift.id);
          const isActiveNow = activeShift?.id === shift.id;
          const addingHere = addingToShift === shift.id;
          const available = getAvailableOperators(shift);

          return (
            <div key={shift.id} style={{ borderRadius: '16px', border: `1.5px solid ${isActiveNow ? colors.border : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-1)', overflow: 'hidden' }}>
              {/* Shift header row */}
              <div
                onClick={() => toggleExpand(shift.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', backgroundColor: isActiveNow ? colors.bg : 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={18} color={colors.text} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: colors.text }}>{shift.name}</span>
                      {isActiveNow && (
                        <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '20px', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Active Now
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {shift.start_time} – {shift.end_time} &nbsp;·&nbsp; {shift.members.length} operator{shift.members.length !== 1 ? 's' : ''} assigned
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddingToShift(addingHere ? null : shift.id); setSelectedOperatorToAdd(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                  >
                    <Plus size={13} /> Add Operator
                  </button>
                  {isExpanded ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Add operator inline form */}
                  {addingHere && (
                    <div style={{ backgroundColor: colors.bg, border: `1.5px solid ${colors.border}`, borderRadius: '12px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <Users size={16} color={colors.text} style={{ flexShrink: 0 }} />
                      <select
                        className="input-field"
                        value={selectedOperatorToAdd}
                        onChange={e => setSelectedOperatorToAdd(e.target.value)}
                        style={{ flex: 1, fontSize: '13px', margin: 0 }}
                      >
                        <option value="">— Select Operator —</option>
                        {available.map(op => (
                          <option key={op.id} value={op.id}>
                            {op.full_name} ({op.employee_no})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddMember(shift.id)}
                        disabled={saving || !selectedOperatorToAdd}
                        style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: colors.text, border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 700, opacity: (!selectedOperatorToAdd || saving) ? 0.6 : 1, flexShrink: 0 }}
                      >
                        {saving ? 'Saving…' : 'Assign'}
                      </button>
                      <button
                        onClick={() => { setAddingToShift(null); setSelectedOperatorToAdd(''); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}
                      >
                        Cancel
                      </button>
                      {available.length === 0 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>All operators already assigned</span>
                      )}
                    </div>
                  )}

                  {/* Member list */}
                  {shift.members.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={22} />
                      <span style={{ fontSize: '13px' }}>No operators assigned to {shift.name}</span>
                      <span style={{ fontSize: '12px' }}>Click "Add Operator" to assign someone to this shift.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {shift.members.map(member => (
                        <div
                          key={member.member_id}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: colors.bg, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: colors.text }}>
                              {member.full_name.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{member.full_name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {member.employee_no} · @{member.username}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(shift.id, member.operator_id, member.full_name)}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                          >
                            <Trash2 size={12} /> Remove
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

      {/* Info note */}
      <div style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <AlertCircle size={16} color="#3B82F6" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>How this works:</strong> Assigning an operator to a shift here creates a global roster. When a Supervisor creates a new Production Order, they can pick from these pre-assigned operator↔shift combinations. Only selected combinations will grant the operator access to that PO.
        </span>
      </div>
    </div>
  );
};
