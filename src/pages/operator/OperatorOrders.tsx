import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductionOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ChevronRight, Calendar, UserCheck, Tag, X } from 'lucide-react';
import '../../styles/tokens.css';

export const OperatorOrders: React.FC = () => {
  const { productionOrders } = useApp();
  const [activeTab, setActiveTab] = useState<'Current' | 'Completed' | 'All'>('Current');
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);

  const filteredOrders = productionOrders.filter(po => {
    if (activeTab === 'All') return true;
    return po.status === activeTab;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Production Orders</h2>

      {/* Tabs: Current, Completed, All */}
      <div style={styles.tabBar}>
        {(['Current', 'Completed', 'All'] as const).map(tab => (
          <button
            key={tab}
            style={activeTab === tab ? styles.tabActive : styles.tabBtn}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* PO Card List */}
      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {filteredOrders.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ color: 'var(--text-secondary)' }}>No {activeTab.toLowerCase()} orders found.</p>
          </div>
        ) : (
          filteredOrders.map(po => {
            const totalQty = po.totalQuantity || (po.productConfigurations?.reduce((sum, c) => sum + c.quantity, 0)) || 1000;
            const qcPassed = po.progress?.qcPassed || 0;

            return (
              <div
                key={po.id}
                className="card"
                style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer' }}
                onClick={() => setSelectedPo(po)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {po.id} — {po.styleName || po.styleCode || 'Garment Style'}
                  </h3>
                  <StatusPill
                    label={po.status}
                    variant={po.status === 'Current' ? 'teal' : 'muted'}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  <span>Customer: {po.customer}</span>
                  <span>Map PO: {po.mapPo}</span>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <ProgressBar current={qcPassed} total={totalQty} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Due: {po.dueDate}</span>
                    <span>{qcPassed} / {totalQty} pcs passed</span>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                    View PO Details & Configurations
                  </span>
                  <ChevronRight size={16} color="var(--primary-teal)" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PO Detail Modal */}
      {selectedPo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                  PRODUCTION ORDER DETAILS
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>
                  {selectedPo.id} — {selectedPo.styleName || selectedPo.styleCode || 'Garment Style'}
                </h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <span><strong>Customer:</strong> {selectedPo.customer}</span>
              <span><strong>Map PO:</strong> {selectedPo.mapPo}</span>
              <span><strong>Supervisor:</strong> {selectedPo.supervisorId}</span>
              <span><strong>Due Date:</strong> {selectedPo.dueDate}</span>
              {selectedPo.qcTestMode && (
                <span style={{ gridColumn: '1 / -1' }}>
                  <strong>QC Test Mode:</strong> <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{selectedPo.qcTestMode}</span>
                </span>
              )}
            </div>

            {selectedPo.remarks && (
              <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>REMARKS:</span>
                <p style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>{selectedPo.remarks}</p>
              </div>
            )}

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
              Product Configurations ({selectedPo.productConfigurations?.length || 0})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto' }}>
              {selectedPo.productConfigurations?.map((cfg, idx) => (
                <div key={idx} style={styles.soItemCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary-teal)' }}>
                      {cfg.configCode}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {cfg.quantity} pcs
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    QR Prefix: {cfg.productQrPrefix} (Serial Range: {cfg.productSerialStart} → {cfg.productSerialEnd})
                  </p>
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
  tabBar: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '12px',
    padding: '4px',
    gap: '4px',
    border: '1px solid var(--border-color)',
  },
  tabBtn: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabActive: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'var(--primary-teal)',
    color: '#071B23',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  cardFooter: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px border var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyState: {
    padding: '30px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '16px',
    gridColumn: '1 / -1',
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
  soItemCard: {
    padding: '12px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
  },
};
