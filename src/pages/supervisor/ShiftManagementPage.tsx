import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Clock, Users, Plus, Trash2, UserCheck, RefreshCw, ChevronDown, ChevronRight, AlertCircle, Building2, Calendar, Sun, Sunset, Moon, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

interface ShiftData {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  time_frame_id?: string | null;
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
  plant?: string;
}

interface Operator {
  id: string;
  full_name: string;
  username: string;
  employee_no: string;
  plant?: string;
}

export interface FactoryTimeFrame {
  id: string;
  name: string;
  label: string;
  startTime: string;
  endTime: string;
  displayTime: string;
  tag: string;
  icon: 'morning' | 'evening' | 'night';
  bg: string;
  border: string;
  text: string;
}

export const FACTORY_TIME_FRAMES: FactoryTimeFrame[] = [
  {
    id: 'TF-1',
    name: '1st Time Frame',
    label: 'Morning Frame',
    startTime: '06:00',
    endTime: '14:00',
    displayTime: '06:00 AM – 02:00 PM',
    tag: 'Morning',
    icon: 'morning',
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#10B981',
  },
  {
    id: 'TF-2',
    name: '2nd Time Frame',
    label: 'Evening Frame',
    startTime: '14:00',
    endTime: '22:00',
    displayTime: '02:00 PM – 10:00 PM',
    tag: 'Evening',
    icon: 'evening',
    bg: 'rgba(59, 130, 246, 0.08)',
    border: 'rgba(59, 130, 246, 0.35)',
    text: '#3B82F6',
  },
  {
    id: 'TF-3',
    name: '3rd Time Frame',
    label: 'Night Frame',
    startTime: '22:00',
    endTime: '06:00',
    displayTime: '10:00 PM – 06:00 AM',
    tag: 'Night',
    icon: 'night',
    bg: 'rgba(139, 92, 246, 0.08)',
    border: 'rgba(139, 92, 246, 0.35)',
    text: '#8B5CF6',
  },
];

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  A: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.35)', text: '#10B981', dot: '#10B981' },
  B: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.35)', text: '#3B82F6', dot: '#3B82F6' },
  C: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.35)', text: '#8B5CF6', dot: '#8B5CF6' },
  D: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', text: '#F59E0B', dot: '#F59E0B' },
  E: { bg: 'rgba(236,72,153,0.1)', border: 'rgba(236,72,153,0.35)', text: '#EC4899', dot: '#EC4899' },
};

function isTimeInFrame(timeStr: string, startTime: string, endTime: string): boolean {
  if (startTime < endTime) {
    return timeStr >= startTime && timeStr < endTime;
  }
  // Spans midnight (e.g. 22:00 to 06:00)
  return timeStr >= startTime || timeStr < endTime;
}

export const ShiftManagementPage: React.FC = () => {
  const { showToast } = useApp();

  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set(['shift-a', 'shift-b', 'shift-c', 'shift-d']));

  // Add-member state: which shift + which operator being added
  const [addingToShift, setAddingToShift] = useState<string | null>(null);
  const [selectedOperatorToAdd, setSelectedOperatorToAdd] = useState<string>('');
  const [savingMember, setSavingMember] = useState(false);

  // Time frame allocation state
  const [allocatingTf, setAllocatingTf] = useState<string | null>(null);

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

  // Time Frame Allocation handler
  const handleTimeFrameAllocationChange = async (timeFrameId: string, newShiftId: string) => {
    setAllocatingTf(timeFrameId);
    try {
      // Build current allocations for all 3 time frames
      const currentAllocations = FACTORY_TIME_FRAMES.map(tf => {
        if (tf.id === timeFrameId) {
          return {
            timeFrameId: tf.id,
            startTime: tf.startTime,
            endTime: tf.endTime,
            shiftId: newShiftId ? newShiftId : null
          };
        }
        // Existing shift assigned to this other time frame
        const existingShift = shifts.find(s => s.time_frame_id === tf.id || (s.start_time === tf.startTime && s.end_time === tf.endTime));
        // If the newly picked shift was previously on this other time frame, clear it
        const shiftIdForTf = (existingShift && existingShift.id === newShiftId) ? null : (existingShift?.id || null);
        return {
          timeFrameId: tf.id,
          startTime: tf.startTime,
          endTime: tf.endTime,
          shiftId: shiftIdForTf
        };
      });

      await apiFetch('/api/shifts/allocate-time-frames', {
        method: 'POST',
        body: JSON.stringify({ allocations: currentAllocations })
      });

      const assignedShift = shifts.find(s => s.id === newShiftId);
      const targetTf = FACTORY_TIME_FRAMES.find(t => t.id === timeFrameId);
      showToast(
        assignedShift
          ? `Allocated ${assignedShift.name} to ${targetTf?.name} (${targetTf?.displayTime})`
          : `Cleared allocation for ${targetTf?.name}`,
        'success'
      );
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to allocate shift to time frame', 'error');
    } finally {
      setAllocatingTf(null);
    }
  };

  // Create new Shift Group handler
  const handleOpenCreateShift = () => {
    // Auto suggest next code
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

  // Delete custom shift group handler
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

  // Get operators not yet in a given shift
  const getAvailableOperators = (shift: ShiftData): Operator[] => {
    const assignedIds = new Set(shift.members.map(m => m.operator_id));
    return operators.filter(op => !assignedIds.has(op.id));
  };

  // Compute "now" active time frame and active shift
  const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const activeTimeFrame = FACTORY_TIME_FRAMES.find(tf => isTimeInFrame(nowTime, tf.startTime, tf.endTime));
  const activeShift = activeTimeFrame
    ? shifts.find(s => s.time_frame_id === activeTimeFrame.id || (s.start_time === activeTimeFrame.startTime && s.end_time === activeTimeFrame.endTime))
    : null;

  // Helper to find which time frame a shift is assigned to
  const getShiftTimeFrame = (shift: ShiftData): FactoryTimeFrame | undefined => {
    if (shift.time_frame_id) {
      return FACTORY_TIME_FRAMES.find(tf => tf.id === shift.time_frame_id);
    }
    return FACTORY_TIME_FRAMES.find(tf => tf.startTime === shift.start_time && tf.endTime === shift.end_time);
  };

  if (loadingShifts) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '12px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading factory shifts & time frames…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Work Shift & Time Frame Management
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Operators belong to Shift Groups (Shift A, Shift B...). Allocate these Shift Groups to Factory Time Frames.
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
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}
          >
            <Plus size={15} /> Add Shift Group
          </button>
        </div>
      </div>

      {/* ── Active Time Frame & Shift Banner ─────────────────────── */}
      {activeTimeFrame && (
        <div style={{
          backgroundColor: activeTimeFrame.bg,
          border: `1.5px solid ${activeTimeFrame.border}`,
          borderRadius: '16px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-surface-1)',
              border: `1px solid ${activeTimeFrame.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: activeTimeFrame.text
            }}>
              {activeTimeFrame.icon === 'morning' && <Sun size={24} />}
              {activeTimeFrame.icon === 'evening' && <Sunset size={24} />}
              {activeTimeFrame.icon === 'night' && <Moon size={24} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: activeTimeFrame.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  CURRENT ACTIVE TIME FRAME ({activeTimeFrame.name})
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  backgroundColor: activeTimeFrame.text,
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '1px 8px'
                }}>
                  ACTIVE NOW
                </span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                {activeTimeFrame.displayTime}
                {activeShift ? (
                  <span style={{ marginLeft: '10px', color: activeTimeFrame.text }}>
                    ➔ Working Group: <strong>{activeShift.name}</strong>
                  </span>
                ) : (
                  <span style={{ marginLeft: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    (No Shift Group Allocated)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                {activeShift && activeShift.members.length > 0 ? (
                  <span>
                    👥 <strong>{activeShift.members.length} Operators on duty:</strong> {activeShift.members.map(m => m.plant ? `[${m.plant}] ${m.full_name}` : m.full_name).join(', ')}
                  </span>
                ) : activeShift ? (
                  <span>No operators currently assigned to {activeShift.name}</span>
                ) : (
                  <span>Assign a shift group below to populate operators for this active time frame.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. TIME FRAME ALLOCATION BOARD ───────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--primary-teal)" />
              Factory Time Frame Allocations
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Allocate Shift Groups (Shift A, Shift B...) to each standard 8-hour factory working time frame.
            </span>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '14px'
        }}>
          {FACTORY_TIME_FRAMES.map((tf) => {
            const isTfActiveNow = activeTimeFrame?.id === tf.id;
            const assignedShift = shifts.find(s => s.time_frame_id === tf.id || (s.start_time === tf.startTime && s.end_time === tf.endTime));
            const isAllocatingThis = allocatingTf === tf.id;

            return (
              <div
                key={tf.id}
                style={{
                  borderRadius: '16px',
                  border: `1.5px solid ${isTfActiveNow ? tf.border : 'var(--border-color)'}`,
                  backgroundColor: 'var(--bg-surface-1)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative',
                  boxShadow: isTfActiveNow ? `0 4px 20px ${tf.bg}` : 'none'
                }}
              >
                {/* Time Frame Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      backgroundColor: tf.bg,
                      border: `1px solid ${tf.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: tf.text
                    }}>
                      {tf.icon === 'morning' && <Sun size={18} />}
                      {tf.icon === 'evening' && <Sunset size={18} />}
                      {tf.icon === 'night' && <Moon size={18} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {tf.name}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: tf.text }}>
                        {tf.displayTime}
                      </div>
                    </div>
                  </div>
                  {isTfActiveNow && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      backgroundColor: tf.text,
                      color: '#fff',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Active Now
                    </span>
                  )}
                </div>

                {/* Shift Selector */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Allocated Shift Group:
                  </label>
                  <select
                    className="input-field"
                    value={assignedShift?.id || ''}
                    disabled={isAllocatingThis}
                    onChange={(e) => handleTimeFrameAllocationChange(tf.id, e.target.value)}
                    style={{
                      width: '100%',
                      margin: 0,
                      fontSize: '13px',
                      fontWeight: 700,
                      backgroundColor: assignedShift ? 'var(--bg-surface-2)' : 'var(--bg-surface-1)',
                      borderColor: assignedShift ? tf.border : 'var(--border-color)',
                      color: assignedShift ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}
                  >
                    <option value="">— Unallocated (No Shift Group) —</option>
                    {shifts.map(s => {
                      const alreadyInOtherTf = FACTORY_TIME_FRAMES.find(otherTf => otherTf.id !== tf.id && (s.time_frame_id === otherTf.id || (s.start_time === otherTf.startTime && s.end_time === otherTf.endTime)));
                      return (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.members.length} operator{s.members.length !== 1 ? 's' : ''}) {alreadyInOtherTf ? `[Currently in ${alreadyInOtherTf.name}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Assigned Shift Operators Preview */}
                <div style={{
                  backgroundColor: 'var(--bg-surface-2)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  minHeight: '60px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}>
                  {assignedShift ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: tf.text }}>
                          {assignedShift.name} Roster
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {assignedShift.members.length} operator{assignedShift.members.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {assignedShift.members.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {assignedShift.members.map(m => (
                            <span
                              key={m.member_id}
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'var(--bg-surface-1)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)'
                              }}
                            >
                              {m.full_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          No operators in this shift group yet. Add operators below.
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      Select a Shift Group above to assign operators to this time frame.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. SHIFT GROUPS (OPERATOR ROSTERS) ────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="var(--primary-teal)" />
              Shift Groups & Operators
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Add or remove operators inside each Shift Group. (Shift A, Shift B, etc.)
            </span>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
            Total Groups: {shifts.length}
          </span>
        </div>

        {/* Shift Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {shifts.map(shift => {
            const shiftCodeUpper = (shift.code || 'A').toUpperCase();
            const colors = SHIFT_COLORS[shiftCodeUpper] || SHIFT_COLORS.A;
            const isExpanded = expandedShifts.has(shift.id);
            const addingHere = addingToShift === shift.id;
            const available = getAvailableOperators(shift);
            const allocatedTf = getShiftTimeFrame(shift);
            const isAllocatedActive = allocatedTf && activeTimeFrame?.id === allocatedTf.id;

            return (
              <div
                key={shift.id}
                style={{
                  borderRadius: '16px',
                  border: `1.5px solid ${isAllocatedActive ? colors.border : 'var(--border-color)'}`,
                  backgroundColor: 'var(--bg-surface-1)',
                  overflow: 'hidden'
                }}
              >
                {/* Shift Group Header */}
                <div
                  onClick={() => toggleExpand(shift.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    cursor: 'pointer',
                    backgroundColor: isAllocatedActive ? colors.bg : 'transparent',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '16px',
                      color: colors.text
                    }}>
                      {shift.code}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {shift.name}
                        </span>
                        {allocatedTf ? (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: allocatedTf.bg,
                            border: `1px solid ${allocatedTf.border}`,
                            color: allocatedTf.text,
                            borderRadius: '12px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Clock size={11} /> {allocatedTf.name} ({allocatedTf.displayTime})
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'var(--bg-surface-2)',
                            color: 'var(--text-muted)',
                            borderRadius: '12px',
                            padding: '2px 8px'
                          }}>
                            ⚪ Not Allocated to any Time Frame
                          </span>
                        )}
                        {isAllocatedActive && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            backgroundColor: colors.text,
                            color: '#fff',
                            borderRadius: '12px',
                            padding: '1px 8px',
                            textTransform: 'uppercase'
                          }}>
                            On Duty Now
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                        👥 <strong>{shift.members.length}</strong> operator{shift.members.length !== 1 ? 's' : ''} in group
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingToShift(addingHere ? null : shift.id);
                        setSelectedOperatorToAdd('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      <Plus size={13} /> Add Operator
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
                          padding: '6px 8px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#EF4444',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {isExpanded ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Add operator inline form */}
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
                          style={{ flex: 1, minWidth: '220px', fontSize: '13px', margin: 0 }}
                        >
                          <option value="">— Select Operator to Add —</option>
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
                            padding: '8px 16px',
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
                            padding: '8px 12px',
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

                    {/* Member list */}
                    {shift.members.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={22} />
                        <span style={{ fontSize: '13px' }}>No operators assigned to {shift.name} yet.</span>
                        <span style={{ fontSize: '12px' }}>Click "Add Operator" above to assign operators to this group.</span>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {shift.members.map(member => (
                          <div
                            key={member.member_id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              backgroundColor: 'var(--bg-surface-2)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '10px',
                              padding: '10px 14px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '50%',
                                backgroundColor: colors.bg,
                                border: `1px solid ${colors.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '13px',
                                fontWeight: 800,
                                color: colors.text
                              }}>
                                {member.full_name.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  {member.plant && (
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'rgba(22, 184, 174, 0.15)',
                                      color: 'var(--primary-teal)',
                                      border: '1px solid rgba(22, 184, 174, 0.3)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}>
                                      <Building2 size={10} /> {member.plant}
                                    </span>
                                  )}
                                  <span>{member.full_name}</span>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  <span>{member.employee_no} · @{member.username}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(shift.id, member.operator_id, member.full_name)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#EF4444',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 700
                              }}
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
      </div>

      {/* ── Explanation Note ─────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: '14px',
        padding: '14px 18px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <AlertCircle size={18} color="#3B82F6" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
            How Time Frames & Shift Groups Work:
          </strong>
          1. <strong>Time Frames</strong> are the 3 fixed working windows: <strong>1st</strong> (06:00 AM – 02:00 PM), <strong>2nd</strong> (02:00 PM – 10:00 PM), and <strong>3rd</strong> (10:00 PM – 06:00 AM).
          <br />
          2. <strong>Shift Groups</strong> (Shift A, Shift B...) are groups of operators. You can add operators to any group.
          <br />
          3. When you allocate a Shift Group to a Time Frame above, all operators in that group will work those hours.
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
