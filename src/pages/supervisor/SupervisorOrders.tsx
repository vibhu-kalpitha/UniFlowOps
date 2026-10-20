import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductionOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ChevronRight, X, Copy } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const SupervisorOrders: React.FC = () => {
  const navigate = useNavigate();
  const { productionOrders, refreshProductionOrders, showToast } = useApp();
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);
  const [updatingPrefix, setUpdatingPrefix] = useState<boolean>(false);

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

  const handleTogglePrefix = async (type: 'product' | 'box') => {
    if (!selectedPo) return;
    const targetId = selectedPo.dbId || selectedPo.id;
    const newProductVal = type === 'product' ? !selectedPo.allowNoProductPrefix : selectedPo.allowNoProductPrefix;
    const newBoxVal = type === 'box' ? !selectedPo.allowNoBoxPrefix : selectedPo.allowNoBoxPrefix;

    setUpdatingPrefix(true);
    try {
      const res = await apiFetch<{ ok: boolean; allowNoProductPrefix: boolean; allowNoBoxPrefix: boolean }>(
        `/api/production-orders/${targetId}/no-prefix-config`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            allowNoProductPrefix: newProductVal,
            allowNoBoxPrefix: newBoxVal
          })
        }
      );

      setSelectedPo(prev => prev ? {
        ...prev,
        allowNoProductPrefix: res.allowNoProductPrefix,
        allowNoBoxPrefix: res.allowNoBoxPrefix
      } : null);

      await refreshProductionOrders();
      showToast(
        type === 'product'
          ? `Product serial prefix validation ${res.allowNoProductPrefix ? 'disabled (Free serials allowed)' : 'enforced'}`
          : `Box identifier prefix validation ${res.allowNoBoxPrefix ? 'disabled (Free box IDs allowed)' : 'enforced'}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update prefix validation settings', 'error');
    } finally {
      setUpdatingPrefix(false);
    }
  };

  const handleCopyPoToNew = (po: ProductionOrder) => {
    const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const draftGen = {
      id: newPoId,
      poName: po.poName ? `${po.poName} (Copy)` : `${po.id} Copy`,
      mapPo: po.mapPo ? `${po.mapPo}-COPY` : `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`,
      customer: po.customer,
      styleId: po.styleId,
      styleCode: po.styleCode,
      styleName: po.styleName,
      startDate: po.startDate,
      dueDate: po.dueDate,
      supervisorId: po.supervisorId,
      plant: po.plant,
      lineNumber: po.lineNumber || po.line_number || '',
      shiftId: po.shiftId,
      shiftName: po.shiftName,
      remarks: po.remarks,
      selectedOperations: po.selectedOperations || ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'],
      qcTestMode: po.qcTestMode || 'QC & Test',
      qcStationCount: po.qcStationCount || 1,
      allocations: po.allocations || po.shifts || []
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', po.styleId || '');
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftGen));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(po.allocations || po.shifts || []));
    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(po.productConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(po.boxConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(Boolean(po.allowNoProductPrefix)));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(Boolean(po.allowNoBoxPrefix)));
    sessionStorage.setItem('uniflow_copy_source_po_id', po.id);

    showToast(`Configurations copied from ${po.id}! Customizing new PO...`, 'info');
    navigate('/supervisor/production-orders/new/general');
  };

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Map PO: {po.mapPo}</span>
                    {po.plant && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        fontWeight: 700
                      }}>
                        🏢 {po.plant}
                      </span>
                    )}
                    {(po.lineNumber || po.line_number) && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(168, 85, 247, 0.15)',
                        color: '#c084fc',
                        fontWeight: 700
                      }}>
                        🧵 {po.lineNumber || po.line_number}
                      </span>
                    )}
                  </div>
                </div>
                <StatusPill label={po.status || 'Current'} variant={po.status === 'Current' ? 'teal' : 'muted'} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <span>Customer: {po.customer || 'Factory Customer'}</span>
                <span>{configsCount} Product Configurations</span>
              </div>

              {(po.allowNoProductPrefix || po.allowNoBoxPrefix) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {po.allowNoProductPrefix && (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(22, 184, 174, 0.15)', color: 'var(--primary-teal)', fontWeight: 700 }}>
                      🔓 Free Serials
                    </span>
                  )}
                  {po.allowNoBoxPrefix && (
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(22, 184, 174, 0.15)', color: 'var(--primary-teal)', fontWeight: 700 }}>
                      📦 Free Box IDs
                    </span>
                  )}
                </div>
              )}

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyPoToNew(po);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3b82f6',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Copy this PO configurations into a new order"
                  >
                    <Copy size={12} /> Copy PO
                  </button>
                  <ChevronRight size={16} color="var(--primary-teal)" />
                </div>
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
              <span><strong>Plant:</strong> {selectedPo.plant || 'Standard'}</span>
              <span><strong>Supervisor:</strong> {selectedPo.supervisorId || 'N/A'}</span>
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

            {/* Prefix Validation Modes Controls */}
            <div style={{ marginBottom: '14px', padding: '12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Prefix Validation Modes
                </span>
                {updatingPrefix && <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 600 }}>Updating...</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Product Serials:</span>
                  <button
                    type="button"
                    onClick={() => handleTogglePrefix('product')}
                    disabled={updatingPrefix}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedPo.allowNoProductPrefix ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
                      backgroundColor: selectedPo.allowNoProductPrefix ? 'rgba(22, 184, 174, 0.2)' : 'var(--bg-surface-1)',
                      color: selectedPo.allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--text-secondary)'
                    }}
                  >
                    {selectedPo.allowNoProductPrefix ? '🔓 Free Serial Numbers (Enabled)' : '🔒 Enforce Config Prefix'}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Box Identifiers:</span>
                  <button
                    type="button"
                    onClick={() => handleTogglePrefix('box')}
                    disabled={updatingPrefix}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: selectedPo.allowNoBoxPrefix ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
                      backgroundColor: selectedPo.allowNoBoxPrefix ? 'rgba(22, 184, 174, 0.2)' : 'var(--bg-surface-1)',
                      color: selectedPo.allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--text-secondary)'
                    }}
                  >
                    {selectedPo.allowNoBoxPrefix ? '🔓 Free Box Identifiers (Enabled)' : '🔒 Enforce Box Prefix'}
                  </button>
                </div>
              </div>
            </div>

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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleCopyPoToNew(selectedPo)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
              >
                <Copy size={14} /> Copy to New PO
              </button>
              <button className="btn-secondary" onClick={() => setSelectedPo(null)}>
                Close
              </button>
            </div>
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
