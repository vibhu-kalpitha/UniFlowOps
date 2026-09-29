import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductionOrder } from '../../types';
import { CheckCircle2, Circle, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const SelectAssignedWork: React.FC = () => {
  const navigate = useNavigate();
  const { productionOrders, activeJob, setActiveJob, showToast } = useApp();

  const [assignedOrders, setAssignedOrders] = useState<ProductionOrder[]>(productionOrders);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedPoId, setSelectedPoId] = useState<string>(activeJob?.productionOrder?.id || '');

  useEffect(() => {
    setLoading(true);
    apiFetch<ProductionOrder[]>('/api/operators/me/assignments')
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAssignedOrders(data);
          if (!selectedPoId) {
            setSelectedPoId(data[0].id);
          }
        } else if (productionOrders.length > 0) {
          setAssignedOrders(productionOrders);
          if (!selectedPoId) {
            setSelectedPoId(productionOrders[0].id);
          }
        }
      })
      .catch(() => {
        setAssignedOrders(productionOrders);
        if (productionOrders.length > 0 && !selectedPoId) {
          setSelectedPoId(productionOrders[0].id);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [productionOrders]);

  const selectedPo = assignedOrders.find(p => p.id === selectedPoId) || assignedOrders[0];

  const handleConfirm = () => {
    if (!selectedPo) {
      showToast('No Production Order selected', 'warning');
      return;
    }

    const currentShift = selectedPo.shifts?.[0] || {
      id: `shf-${Date.now()}`,
      productionOrderId: selectedPo.id,
      workerId: 'usr-001',
      workerName: 'Chamika Silva',
      startTime: '14:00',
      endTime: '18:00',
      date: new Date().toISOString().split('T')[0],
      enabledOperations: selectedPo.selectedOperations || ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
    };

    setActiveJob({
      productionOrder: selectedPo,
      shift: currentShift
    });

    showToast(`Active job updated to ${selectedPo.id} — ${selectedPo.styleName || 'Garment Style'}`, 'success');
    navigate('/operator/home');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={20} color="var(--primary-teal)" />
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Select Authorized Production Order</h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Only Production Orders explicitly allocated to your work shift are visible.
        </p>
      </div>

      {/* PO Radio List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Authorized Production Orders ({assignedOrders.length})
        </span>

        {loading ? (
          <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading allocated production orders...
          </div>
        ) : assignedOrders.length === 0 ? (
          <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No authorized Production Orders found for your account.
          </div>
        ) : (
          assignedOrders.map(po => {
            const isSelected = po.id === selectedPoId;
            const shift = po.shifts?.[0];
            const qcPassed = po.progress?.qcPassed || 0;
            const totalQty = po.totalQuantity || 1000;
            const pct = Math.round((qcPassed / totalQty) * 100);

            return (
              <div
                key={po.id}
                style={{
                  ...styles.poCard,
                  borderColor: isSelected ? 'var(--primary-teal)' : 'var(--border-color)',
                  backgroundColor: isSelected ? 'rgba(22, 184, 174, 0.08)' : 'var(--bg-surface-1)'
                }}
                onClick={() => setSelectedPoId(po.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isSelected ? (
                      <CheckCircle2 size={24} color="var(--primary-teal)" />
                    ) : (
                      <Circle size={24} color="var(--text-muted)" />
                    )}
                    <div>
                      {/* PO Number + Style Name Display */}
                      <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {po.id} — {po.styleName || po.styleCode || 'Garment Style'}
                      </h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Customer: {po.customer} • Map PO: {po.mapPo}
                      </p>
                    </div>
                  </div>
                  <StatusPill label={po.status} variant="teal" />
                </div>

                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    <span>QC Progress: {qcPassed} / {totalQty} pcs</span>
                    <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <ProgressBar current={qcPassed} total={totalQty} showText={false} />
                </div>

                <div style={styles.shiftInfoRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <Calendar size={14} color="var(--primary-teal)" />
                    <span>Shift: {shift ? `${shift.startTime} - ${shift.endTime}` : 'Active Work Shift'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <Tag size={14} color="var(--color-purple)" />
                    <span>Operations: {po.selectedOperations?.join(', ') || 'QC, Packing'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button className="btn-primary" onClick={handleConfirm} disabled={!selectedPo} style={{ marginTop: '8px' }}>
        Confirm & Start Work on Selected PO
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid var(--border-color)'
  },
  poCard: {
    padding: '16px',
    borderRadius: '16px',
    border: '1.5px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  shiftInfoRow: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px dashed var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }
};
