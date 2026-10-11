import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductionOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ChevronRight, X } from 'lucide-react';
import '../../styles/tokens.css';

export const SupervisorOrders: React.FC = () => {
  const { productionOrders, refreshProductionOrders } = useApp();
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);

  useEffect(() => {
    refreshProductionOrders();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPoId = params.get('poId');
    if (targetPoId && productionOrders.length > 0) {
      const found = productionOrders.find(p => p.id === targetPoId || p.dbId === targetPoId);
      if (found) {
        setSelectedPo(found);
      }
    }
  }, [productionOrders]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Supervisor Order Oversight</h2>

      {/* PO Cards Grid */}
      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {productionOrders.map(po => {
          const totalQty = po.totalQuantity || (po.productConfigurations?.reduce((sum, c) => sum + c.quantity, 0)) || 1000;
          const qcPassed = po.progress?.qcPassed || 0;
          const packedQty = po.progress?.packed || 0;
          const configsCount = po.productConfigurations?.length || 0;

          return (
            <div
              key={po.id}
              className="card"
              style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer', margin: 0 }}
              onClick={() => setSelectedPo(po)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {po.id} — {po.styleName || po.styleCode || 'Garment Style'}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Map PO: {po.mapPo}</span>
                </div>
                <StatusPill label={po.status || 'Current'} variant={po.status === 'Current' ? 'teal' : 'muted'} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <span>Customer: {po.customer || 'Factory Customer'}</span>
                <span>{configsCount} Product Configurations</span>
              </div>

              <div style={{ marginTop: '10px' }}>
                <ProgressBar current={qcPassed} total={totalQty} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Supervisor: {po.supervisorId}</span>
                  <span>{qcPassed} / {totalQty} passed ({packedQty} packed)</span>
                </div>
              </div>

              <div style={styles.cardFooter}>
                <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                  View PO Configurations & Progress
                </span>
                <ChevronRight size={16} color="var(--primary-teal)" />
              </div>
            </div>
          );
        })}
      </div>

      {/* PO Detail Modal */}
      {selectedPo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>PO OVERVIEW</span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedPo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              <span><strong>Garment Style:</strong> {selectedPo.styleName || selectedPo.styleCode || 'Standard'}</span>
              <span><strong>Map PO:</strong> {selectedPo.mapPo}</span>
              <span><strong>Customer:</strong> {selectedPo.customer}</span>
              <span><strong>Due Date:</strong> {selectedPo.dueDate}</span>
              {selectedPo.qcTestMode && (
                <span style={{ gridColumn: '1 / -1' }}>
                  <strong>QC Test Mode:</strong> <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{selectedPo.qcTestMode}</span>
                </span>
              )}
            </div>

            {selectedPo.remarks && (
              <div style={{ marginBottom: '14px', padding: '10px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>REMARKS:</span>
                <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedPo.remarks}</p>
              </div>
            )}

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
              Product Configurations ({selectedPo.productConfigurations?.length || 0})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
              {selectedPo.productConfigurations?.map((cfg, idx) => (
                <div key={idx} style={styles.soRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-teal)' }}>{cfg.configCode}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>{cfg.quantity} pcs</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                    {cfg.productType ? `Type: ${cfg.productType} ` : ''}{cfg.size ? `• Size: ${cfg.size}` : ''}
                  </span>
                </div>
              ))}
            </div>

            <button className="btn-secondary" onClick={() => setSelectedPo(null)} style={{ marginTop: '16px' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  cardFooter: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '20px',
    border: '1px solid var(--border-color)',
    padding: '20px',
    width: '100%',
    maxWidth: '520px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  soRow: {
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
  }
};
