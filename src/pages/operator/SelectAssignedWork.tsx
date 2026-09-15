import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SalesOrder, ProductionOrder } from '../../types';
import { CheckCircle2, Circle, ArrowLeft, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const SelectAssignedWork: React.FC = () => {
  const navigate = useNavigate();
  const { productionOrders, activeJob, setActiveJob, showToast } = useApp();

  // Find PO-2026-0184 or first PO
  const po = productionOrders.find(p => p.id === 'PO-2026-0184') || productionOrders[0];
  const [selectedSoId, setSelectedSoId] = useState<string>(activeJob?.salesOrder.id || po.salesOrders[0]?.id || '');

  const selectedSo = po?.salesOrders.find(s => s.id === selectedSoId) || po?.salesOrders[0];

  const handleConfirm = () => {
    if (!po || !selectedSo) return;

    const currentShift = selectedSo.shifts[0] || {
      id: 'shf-101',
      salesOrderId: selectedSo.id,
      workerId: 'usr-001',
      workerName: 'Chamika Silva',
      startTime: '14:00',
      endTime: '18:00',
      date: '2026-09-14',
      enabledOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
    };

    setActiveJob({
      productionOrder: po,
      salesOrder: selectedSo,
      shift: currentShift
    });

    showToast(`Assigned job updated to ${selectedSo.id} (${selectedSo.product} - ${selectedSo.colour})`, 'success');
    navigate('/operator/home');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Banner */}
      <div style={styles.banner}>
        <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Select Assigned Work</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Only work orders assigned to your shift on Line 04 are displayed.
        </p>
      </div>

      {/* PO Header Card */}
      {po && (
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              PRODUCTION ORDER
            </span>
            <StatusPill label={po.status} variant="teal" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '4px' }}>
            {po.id}
          </h3>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span><strong>Customer:</strong> {po.customer}</span>
            <span><strong>Map PO:</strong> {po.mapPo}</span>
          </div>
        </div>
      )}

      {/* SO Radio List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Available Sales Orders ({po?.salesOrders.length || 0})
        </span>

        {po?.salesOrders.map(so => {
          const isSelected = so.id === selectedSoId;
          const shift = so.shifts[0];

          return (
            <div
              key={so.id}
              style={{
                ...styles.soCard,
                borderColor: isSelected ? 'var(--primary-teal)' : 'var(--border-color)',
                backgroundColor: isSelected ? 'rgba(22, 184, 174, 0.08)' : 'var(--bg-surface-1)'
              }}
              onClick={() => setSelectedSoId(so.id)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isSelected ? (
                    <CheckCircle2 size={22} color="var(--primary-teal)" />
                  ) : (
                    <Circle size={22} color="var(--text-muted)" />
                  )}
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {so.id}
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {so.product} — {so.colour}
                    </p>
                  </div>
                </div>
                <StatusPill label={so.lineId} variant="blue" />
              </div>

              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  <span>Packed: {so.progress.packed} / {so.quantity}</span>
                  <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>
                    {Math.round((so.progress.packed / so.quantity) * 100)}%
                  </span>
                </div>
                <ProgressBar current={so.progress.packed} total={so.quantity} showText={false} />
              </div>

              <div style={styles.shiftInfoRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Calendar size={14} color="var(--primary-teal)" />
                  <span>Shift: {shift ? `${shift.startTime} - ${shift.endTime}` : '14:00 - 18:00'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Tag size={14} color="var(--color-purple)" />
                  <span>Map SO: {so.mapSo}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn-primary" onClick={handleConfirm} style={{ marginTop: '8px' }}>
        Confirm & Start Work
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
  soCard: {
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
