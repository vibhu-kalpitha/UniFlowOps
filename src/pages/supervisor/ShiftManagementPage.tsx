import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ShiftAssignment, ProductionOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { Clock, Users, Plus, Trash2, Calendar, AlertTriangle, UserCheck } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const ShiftManagementPage: React.FC = () => {
  const { productionOrders, saveProductionOrder, refreshProductionOrders, showToast } = useApp();

  const [selectedPoId, setSelectedPoId] = useState<string>(productionOrders[0]?.id || '');
  const selectedPo = productionOrders.find(p => p.id === selectedPoId) || productionOrders[0];

  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPo) {
      if (selectedPo.shifts && selectedPo.shifts.length > 0) {
        setShifts(selectedPo.shifts);
      } else {
        setShifts([
          {
            id: `shf-${Date.now()}`,
            productionOrderId: selectedPo.id,
            workerId: 'usr-001',
            workerName: 'Chamika Silva',
            shiftId: 'shift-c',
            startTime: '14:00',
            endTime: '18:00',
            date: selectedDate,
            enabledOperations: selectedPo.selectedOperations || ['QC Test', 'Packing']
          }
        ]);
      }
    }
  }, [selectedPoId, productionOrders]);

  const handleAddShift = () => {
    if (!selectedPo) return;
    const newShift: ShiftAssignment = {
      id: `shf-${Date.now()}`,
      productionOrderId: selectedPo.id,
      workerId: 'usr-004',
      workerName: 'Kavindu Perera',
      shiftId: 'shift-c',
      startTime: '18:00',
      endTime: '22:00',
      date: selectedDate,
      enabledOperations: selectedPo.selectedOperations || ['QC Test', 'Packing']
    };
    const updated = [...shifts, newShift];
    setShifts(updated);
    validateOverlaps(updated);
  };

  const handleRemoveShift = (id: string) => {
    const updated = shifts.filter(s => s.id !== id);
    setShifts(updated);
    validateOverlaps(updated);
  };

  const updateShift = (id: string, field: keyof ShiftAssignment, val: any) => {
    const updated = shifts.map(s => (s.id === id ? { ...s, [field]: val } : s));
    setShifts(updated);
    validateOverlaps(updated);
  };

  const validateOverlaps = (list: ShiftAssignment[]): boolean => {
    setOverlapError(null);
    for (let i = 0; i < list.length; i++) {
      const s1 = list[i];
      if (s1.startTime >= s1.endTime) {
        setOverlapError(`Shift ${i + 1}: End time (${s1.endTime}) must be after start time (${s1.startTime}).`);
        return false;
      }
      for (let j = i + 1; j < list.length; j++) {
        const s2 = list[j];
        if (s1.date === s2.date) {
          const overlap = s1.startTime < s2.endTime && s2.startTime < s1.endTime;
          if (overlap) {
            setOverlapError(`Shift Overlap Conflict! ${s1.workerName} (${s1.startTime}-${s1.endTime}) conflicts with ${s2.workerName} (${s2.startTime}-${s2.endTime}).`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleSavePlan = async () => {
    if (!validateOverlaps(shifts)) {
      showToast('Please resolve shift overlaps before saving.', 'error');
      return;
    }

    if (!selectedPo) return;

    try {
      const poTargetId = selectedPo.dbId || selectedPo.id;
      await apiFetch(`/api/production-orders/${encodeURIComponent(poTargetId)}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          operatorId: shifts[0]?.workerId || 'usr-001',
          shiftId: shifts[0]?.shiftId || 'shift-c'
        })
      });

      const updatedPo = { ...selectedPo, shifts };
      saveProductionOrder(updatedPo);
      await refreshProductionOrders();

      showToast(`Shift Plan saved for Production Order ${selectedPo.id}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to persist allocations to database.', 'error');
    }
  };

  const nowTime = "15:30";
  const currentActiveWorker = shifts.find(s => s.startTime <= nowTime && s.endTime >= nowTime);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>PO Work Shift Management</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Schedule worker time-windows and operations directly per Production Order.
        </p>
      </div>

      {/* Real-time Clock Active Worker Banner */}
      <div style={styles.clockBanner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserCheck size={24} color="var(--color-green)" />
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>
              CURRENT ACTIVE WORKER (TIME: {nowTime})
            </span>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentActiveWorker ? currentActiveWorker.workerName : 'No Active Shift Right Now'}
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--color-green)' }}>
              {currentActiveWorker ? `Active until ${currentActiveWorker.endTime} • Handover next` : 'Upcoming shift'}
            </span>
          </div>
        </div>
      </div>

      {/* Select PO & Date Controls */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={styles.label}>Production Order</label>
            <select
              className="input-field select-field"
              value={selectedPoId}
              onChange={e => setSelectedPoId(e.target.value)}
            >
              {productionOrders.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.styleName || p.styleCode || 'Style'} ({p.customer})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>Shift Date</label>
            <input
              type="date"
              className="input-field"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Overlap Error Warning */}
      {overlapError && (
        <div style={styles.errorBanner}>
          <AlertTriangle size={18} color="var(--color-red)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-red)' }}>
            {overlapError}
          </span>
        </div>
      )}

      {/* Shift List for PO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800 }}>
            Configured Work Shifts ({shifts.length})
          </h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleAddShift}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add Shift
          </button>
        </div>

        {shifts.map((s, idx) => (
          <div key={s.id || idx} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                Shift #{idx + 1} — {s.workerName}
              </span>
              {shifts.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveShift(s.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              <div>
                <label style={styles.label}>Worker</label>
                <select
                  className="input-field select-field"
                  value={s.workerId}
                  onChange={e => updateShift(s.id, 'workerId', e.target.value)}
                >
                  <option value="usr-001">Chamika Silva</option>
                  <option value="usr-004">Kavindu Perera</option>
                  <option value="usr-005">Sunil Bandara</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Start Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={s.startTime}
                  onChange={e => updateShift(s.id, 'startTime', e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>End Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={s.endTime}
                  onChange={e => updateShift(s.id, 'endTime', e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-primary" onClick={handleSavePlan} style={{ marginTop: '10px' }}>
        Save PO Shift Plan to Database
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  clockBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderRadius: '16px',
    padding: '14px 16px',
    border: '1px solid rgba(34, 197, 94, 0.3)'
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '12px',
    padding: '12px 14px'
  }
};
