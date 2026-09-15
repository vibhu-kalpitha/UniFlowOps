import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ProductionOrder, SalesOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ChevronRight, Calendar, UserCheck, Tag, AlertCircle, X } from 'lucide-react';
import '../../styles/tokens.css';

export const OperatorOrders: React.FC = () => {
  const { productionOrders } = useApp();
  const [activeTab, setActiveTab] = useState<'Current' | 'Completed' | 'All'>('Current');
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ color: 'var(--text-secondary)' }}>No {activeTab.toLowerCase()} orders found.</p>
          </div>
        ) : (
          filteredOrders.map(po => {
            const totalQty = po.salesOrders.reduce((sum, s) => sum + s.quantity, 0);
            const packedQty = po.salesOrders.reduce((sum, s) => sum + s.progress.packed, 0);

            return (
              <div
                key={po.id}
                className="card"
                style={{ backgroundColor: 'var(--bg-surface-1)', cursor: 'pointer' }}
                onClick={() => setSelectedPo(po)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {po.id}
                  </h3>
                  <StatusPill
                    label={po.status}
                    variant={po.status === 'Current' ? 'teal' : 'muted'}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  <span>{po.customer}</span>
                  <span>{po.salesOrders.length} Sales Orders</span>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <ProgressBar current={packedQty} total={totalQty} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Due: {po.dueDate}</span>
                    <span>{packedQty} / {totalQty} packed</span>
                  </div>
                </div>

                <div style={styles.cardFooter}>
                  <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                    View Sales Orders
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
                  PRODUCTION ORDER
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedPo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedPo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <span><strong>Customer:</strong> {selectedPo.customer}</span>
              <span><strong>Map PO:</strong> {selectedPo.mapPo}</span>
              <span><strong>Supervisor:</strong> {selectedPo.supervisorId}</span>
              <span><strong>Due Date:</strong> {selectedPo.dueDate}</span>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
              Sales Orders ({selectedPo.salesOrders.length})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
              {selectedPo.salesOrders.map(so => (
                <div
                  key={so.id}
                  style={styles.soItemCard}
                  onClick={() => setSelectedSo(so)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {so.id}
                    </span>
                    <StatusPill label={so.lineId} variant="blue" />
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {so.product} — {so.colour} ({so.sizeRange})
                  </p>
                  <div style={{ marginTop: '8px' }}>
                    <ProgressBar current={so.progress.packed} total={so.quantity} height={6} />
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-secondary" onClick={() => setSelectedPo(null)} style={{ marginTop: '16px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* SO Detail Modal */}
      {selectedSo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-blue)', fontWeight: 700 }}>
                  SALES ORDER PROGRESS
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{selectedSo.id}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedSo(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              <p><strong>Product:</strong> {selectedSo.product} ({selectedSo.colour})</p>
              <p><strong>Style Code:</strong> {selectedSo.styleCode}</p>
              <p><strong>Map SO:</strong> {selectedSo.mapSo}</p>
              <p><strong>Line:</strong> {selectedSo.lineId}</p>
              <p><strong>Order Quantity:</strong> {selectedSo.quantity} units</p>
            </div>

            {/* Progress Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={styles.statBox}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>QC Passed</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-green)' }}>
                  {selectedSo.progress.qcPassed}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Items Packed</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-blue)' }}>
                  {selectedSo.progress.packed}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>AQL Passed Boxes</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-purple)' }}>
                  {selectedSo.progress.aqlPassed}
                </span>
              </div>
              <div style={styles.statBox}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Logged Issues</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-red)' }}>
                  {selectedSo.progress.issuesCount}
                </span>
              </div>
            </div>

            <button className="btn-secondary" onClick={() => setSelectedSo(null)} style={{ marginTop: '16px' }}>
              Back to Sales Orders
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
    border: '1px solid var(--border-color)'
  },
  tabBtn: {
    flex: 1,
    height: '36px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 600
  },
  tabActive: {
    flex: 1,
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '13px',
    fontWeight: 700
  },
  cardFooter: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  emptyState: {
    padding: '40px 16px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '16px'
  },
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
  soItemCard: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px',
    cursor: 'pointer'
  },
  statBox: {
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }
};
