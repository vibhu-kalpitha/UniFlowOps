import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductionOrder, SalesOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ChevronRight, FileText, X, AlertCircle } from 'lucide-react';
import '../../styles/tokens.css';

export const SupervisorOrders: React.FC = () => {
  const { productionOrders, refreshProductionOrders } = useApp();
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);

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

      {/* PO Cards */}
      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {productionOrders.map(po => {
          const sos = po.salesOrders || [];
          const totalQty = sos.reduce((sum, s) => sum + (s.quantity || 0), 0);
          const packedQty = sos.reduce((sum, s) => sum + (s.progress?.packed || 0), 0);
          const isUnassigned = sos.length === 0 || !sos.some(s => s.allocations && s.allocations.length > 0);

          return (
            <div
              key={po.id}
              className="card"
              style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer', margin: 0 }}
              onClick={() => setSelectedPo(po)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{po.id}</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Map PO: {po.mapPo}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {isUnassigned && <StatusPill label="Unassigned" variant="amber" />}
                  <StatusPill label={po.status || 'Current'} variant={po.status === 'Current' ? 'teal' : 'muted'} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <span>Brand: {po.customer || 'Factory Orders'}</span>
                <span>{sos.length} Sales Orders</span>
              </div>

              <div style={{ marginTop: '10px' }}>
                {sos.length > 0 ? (
                  <ProgressBar current={packedQty} total={totalQty} />
                ) : (
                  <div style={{ padding: '6px 10px', backgroundColor: 'rgba(243, 168, 51, 0.12)', border: '1px solid rgba(243, 168, 51, 0.3)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-amber)', fontWeight: 700 }}>
                      No Sales Orders attached (Awaiting operator allocation)
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Supervisor: {po.supervisorId}</span>
                  <span>{packedQty} / {totalQty} units packed</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PO Modal */}
      {selectedPo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>PO DETAILS</span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedPo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Select Sales Order to View Progress</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {(!selectedPo.salesOrders || selectedPo.salesOrders.length === 0) ? (
                <div style={{ padding: '16px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    No Sales Orders attached yet (Awaiting operator allocation).
                  </p>
                </div>
              ) : (
                selectedPo.salesOrders.map(so => (
                  <div key={so.id} style={styles.soRow} onClick={() => setSelectedSo(so)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{so.id}</span>
                      <StatusPill label={so.lineId || 'Line 04'} variant="blue" />
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                      {so.product} ({so.colour}) • Qty: {so.quantity}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button className="btn-secondary" onClick={() => setSelectedPo(null)} style={{ marginTop: '14px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* SO Progress Breakdown Modal */}
      {selectedSo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-blue)', fontWeight: 700 }}>SO PROGRESS BREAKDOWN</span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedSo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedSo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            {/* Exact SO Progress requirements */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={styles.progressStatCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Overall Progress</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                    1,842 / 2,500 (74%)
                  </span>
                </div>
                <ProgressBar current={1842} total={2500} height={8} />
              </div>

              <div style={styles.progressStatCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>QC + Test</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-green)' }}>
                    1,920 (77%)
                  </span>
                </div>
                <ProgressBar current={1920} total={2500} height={8} color="var(--color-green)" />
              </div>

              <div style={styles.progressStatCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>Packing</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-blue)' }}>
                    1,842 (74%)
                  </span>
                </div>
                <ProgressBar current={1842} total={2500} height={8} color="var(--color-blue)" />
              </div>

              <div style={styles.progressStatCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>AQL Inspection</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-purple)' }}>
                    41 / 42 Boxes Passed (98%)
                  </span>
                </div>
                <ProgressBar current={41} total={42} height={8} color="var(--color-purple)" />
              </div>

              <div style={{ ...styles.progressStatCard, borderColor: 'rgba(239, 92, 92, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-red)' }}>
                    Log & Issue Count
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-red)' }}>
                    3 Defect Issues Logged
                  </span>
                </div>
              </div>
            </div>

            <button className="btn-secondary" onClick={() => setSelectedSo(null)} style={{ marginTop: '16px' }}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    maxWidth: '380px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    padding: '4px'
  },
  soRow: {
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '10px',
    padding: '10px 12px',
    cursor: 'pointer'
  },
  progressStatCard: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px'
  }
};
