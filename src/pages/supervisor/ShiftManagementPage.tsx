import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShiftAssignment, OperationType } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { Clock, Users, Plus, Trash2, Calendar, AlertTriangle, ShieldCheck, UserCheck } from 'lucide-react';
import '../../styles/tokens.css';

export const ShiftManagementPage: React.FC = () => {
  const { productionOrders, saveProductionOrder, showToast } = useApp();

  const [selectedPoId, setSelectedPoId] = useState('PO-2026-0184');
  const selectedPo = productionOrders.find(p => p.id === selectedPoId) || productionOrders[0];

  const [selectedSoId, setSelectedSoId] = useState(selectedPo?.salesOrders[0]?.id || 'SO-77201');
  const selectedSo = selectedPo?.salesOrders.find(s => s.id === selectedSoId) || selectedPo?.salesOrders[0];

  const [shifts, setShifts] = useState<ShiftAssignment[]>(selectedSo?.shifts || []);
  const [selectedDate, setSelectedDate] = useState('2026-09-14');
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // Sync when SO changes
  const handleSelectSo = (soId: string) => {
    setSelectedSoId(soId);
    const targetSo = selectedPo?.salesOrders.find(s => s.id === soId);
    if (targetSo) {
      setShifts(targetSo.shifts);
      setOverlapError(null);
    }
  };

  const handleAddShift = () => {
    const newShift: ShiftAssignment = {
      id: `shf-${Date.now()}`,
      salesOrderId: selectedSoId,
      workerId: 'usr-004',
      workerName: 'Kavindu Perera',
      startTime: '18:00',
      endTime: '22:00',
      date: selectedDate,
      enabledOperations: ['QC Test', 'Packing']
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

    if (!selectedPo || !selectedSo) return;

    try {
      const { apiFetch } = await import('../../services/api');
      const soTargetId = selectedSo.dbId || selectedSo.id;
      await apiFetch(`/api/production/sales-orders/${encodeURIComponent(soTargetId)}/allocations/sync`, {
        method: 'POST',
        body: JSON.stringify({ shifts })
      });

      const updatedSo = { ...selectedSo, shifts };
      const updatedPo = {
        ...selectedPo,
        salesOrders: selectedPo.salesOrders.map(s => (s.id === selectedSo.id ? updatedSo : s))
      };
      saveProductionOrder(updatedPo);

      const { refreshProductionOrders } = (window as any).uniflowRefreshPOs || {};
      if (typeof refreshProductionOrders === 'function') {
        await refreshProductionOrders();
      }

      showToast(`Shift Plan & operator allocations saved for ${selectedSo.id}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to persist allocations to database.', 'error');
    }
  };

  // Real-time active worker calculation
  const nowTime = "15:30"; // Simulated current time (3:30 PM)
  const currentActiveWorker = shifts.find(s => s.startTime <= nowTime && s.endTime >= nowTime);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Shift Management</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Schedule worker time-windows and operations per Sales Order.
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
              {currentActiveWorker ? `Active until ${currentActiveWorker.endTime} • Handover next` : 'Upcoming shift at 18:00'}
            </span>
          </div>
        </div>
      </div>

      {/* Select PO & SO Filter Controls */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={styles.label}>Production Order</label>
            <select
              className="input-field select-field"
              value={selectedPoId}
              onChange={e => {
                setSelectedPoId(e.target.value);
                const po = productionOrders.find(p => p.id === e.target.value);
                if (po && po.salesOrders[0]) {
                  handleSelectSo(po.salesOrders[0].id);
                }
              }}
            >
              {productionOrders.map(p => (
                <option key={p.id} value={p.id}>{p.id} ({p.customer})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>Sales Order</label>
            <select
              className="input-field select-field"
              value={selectedSoId}
              onChange={e => handleSelectSo(e.target.value)}
            >
              {selectedPo?.salesOrders.map(s => (
                <option key={s.id} value={s.id}>{s.id} - {s.product}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
          <div>
            <label style={styles.label}>Line / Department</label>
            <input type="text" className="input-field" value={selectedSo?.lineId || 'Line 04'} disabled />
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
        <div style={styles.errorBox}>
          <AlertTriangle size={18} color="var(--color-red)" />
          <span style={{ fontSize: '13px', color: 'var(--color-red)', fontWeight: 700 }}>{overlapError}</span>
        </div>
      )}

      {/* Shift List Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 700 }}>
          Worker Shifts ({shifts.length})
        </h4>
        <button
          className="btn-secondary"
          style={{ height: '34px', padding: '0 12px', fontSize: '12px', gap: '4px' }}
          onClick={handleAddShift}
        >
          <Plus size={16} color="var(--primary-teal)" /> Add Shift Window
        </button>
      </div>

      {/* Shift Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {shifts.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No shift assignments configured for this Sales Order. Click Add Shift Window.
          </p>
        ) : (
          shifts.map((sh, idx) => (
            <div key={sh.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} color="var(--primary-teal)" />
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>Shift Window {idx + 1}</span>
                </div>
                <button
                  style={{ color: 'var(--color-red)', background: 'none', border: 'none' }}
                  onClick={() => handleRemoveShift(sh.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={styles.label}>Assigned Worker</label>
                  <select
                    className="input-field select-field"
                    value={sh.workerName}
                    onChange={e => updateShift(sh.id, 'workerName', e.target.value)}
                  >
                    <option value="Chamika Silva">Chamika Silva</option>
                    <option value="Kavindu Perera">Kavindu Perera</option>
                    <option value="Sunil Bandara">Sunil Bandara</option>
                    <option value="Kasun Kalhara">Kasun Kalhara</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={sh.date}
                    onChange={e => updateShift(sh.id, 'date', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <div>
                  <label style={styles.label}>Start Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={sh.startTime}
                    onChange={e => updateShift(sh.id, 'startTime', e.target.value)}
                  />
                </div>
                <div>
                  <label style={styles.label}>End Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={sh.endTime}
                    onChange={e => updateShift(sh.id, 'endTime', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Save Action Button */}
      <button className="btn-primary" onClick={handleSavePlan} style={{ marginTop: '10px' }}>
        Save Shift Plan
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  clockBanner: {
    backgroundColor: 'rgba(24, 184, 121, 0.08)',
    border: '1px solid rgba(24, 184, 121, 0.3)',
    borderRadius: '16px',
    padding: '14px'
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 92, 92, 0.12)',
    border: '1px solid var(--color-red)',
    borderRadius: '12px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  }
};
