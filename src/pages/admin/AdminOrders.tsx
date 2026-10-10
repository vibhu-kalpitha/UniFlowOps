import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { Edit2, RefreshCw, X, Box } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AdminOrders: React.FC = () => {
  const { showToast } = useApp();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Edit modal state
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [editTotalQty, setEditTotalQty] = useState<number>(0);
  const [editConfigs, setEditConfigs] = useState<any[]>([]);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/orders');
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openEditModal = (po: any) => {
    setSelectedOrder(po);
    setEditTotalQty(po.configuredQuantity || po.total_quantity || 500);
    setEditConfigs(
      (po.configs || []).map((c: any) => ({
        id: c.id,
        config_code: c.config_code,
        size: c.size,
        quantity: c.quantity || 0
      }))
    );
  };

  const handleSaveQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setSaving(true);
    try {
      // If order has configs, calculate sum from configs, else use editTotalQty
      const payload: any = {};
      if (editConfigs.length > 0) {
        payload.configs = editConfigs.map(c => ({
          id: c.id,
          quantity: Number(c.quantity)
        }));
        payload.totalQuantity = editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
      } else {
        payload.totalQuantity = Number(editTotalQty);
      }

      await apiFetch(`/api/admin/orders/${selectedOrder.id}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      showToast(`Updated planned quantity for PO ${selectedOrder.poNumber || selectedOrder.po_number}`, 'success');
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update PO quantity', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Factory Production Orders & Quantity Config</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Configure target quantities and size allocations with audit logging and safety validations.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="btn btn-secondary"
          style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Orders'}
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading production orders...
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No production orders registered.
        </div>
      ) : (
        <div className="grid-2-desktop" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
          {orders.map(po => {
            const packedQty = Number(po.packedCount || po.packed_count || 0);
            const targetQty = Number(po.configuredQuantity || po.total_quantity || 500);
            const configs: any[] = po.configs || [];
            const percent = targetQty > 0 ? Math.min(100, Math.round((packedQty / targetQty) * 100)) : 0;

            return (
              <div key={po.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box size={16} color="var(--color-teal)" />
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-teal)' }}>
                        {po.poNumber || po.po_number}
                      </h3>
                    </div>
                    {(po.poName || po.po_name) && (
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                        🏷️ {po.poName || po.po_name}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Style: <strong>{po.styleName || po.style_name || 'Standard Style'}</strong></span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                    <button
                      onClick={() => openEditModal(po)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        border: '1px solid var(--color-teal)',
                        color: 'var(--color-teal)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Edit2 size={12} /> Edit Quantity
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Target vs Packed:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{packedQty} / {targetQty} pcs ({percent}%)</strong>
                  </div>
                  <ProgressBar current={packedQty} total={targetQty} height={8} color="var(--color-teal)" />
                </div>

                {/* Configurations breakdown */}
                {configs.length > 0 && (
                  <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Configured Sizes & Quantities ({configs.length}):
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                      {configs.map((cfg: any) => (
                        <div key={cfg.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span>Size {cfg.size || 'STD'} ({cfg.config_code})</span>
                          <span style={{ color: 'var(--color-teal)', fontWeight: 700 }}>{cfg.quantity} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit Quantity Safety Modal ──────────────────────────────── */}
      {selectedOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-teal)' }}>ADMIN PO MANAGEMENT</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit PO Quantity: {selectedOrder.po_number}
                </h3>
              </div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.3)', padding: '10px 12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)' }}>
                🛡️ Processed Safety Limit: Minimum {selectedOrder.packed_count || 0} pcs
              </span>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                You cannot reduce target planned quantity below already packed/processed garments ({selectedOrder.packed_count || 0} pcs). Changes will be recorded in <code>audit_logs</code>.
              </p>
            </div>

            <form onSubmit={handleSaveQuantity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {editConfigs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Size Configurations Quantity:</label>
                  {editConfigs.map((cfg, index) => (
                    <div key={cfg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '120px' }}>
                        Size {cfg.size || 'STD'} ({cfg.config_code})
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={cfg.quantity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const updated = [...editConfigs];
                          updated[index].quantity = val;
                          setEditConfigs(updated);
                        }}
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontWeight: 700
                        }}
                        required
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-purple)', textAlign: 'right', marginTop: '4px' }}>
                    Total Target Planned: {editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0)} pcs
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Total Target Quantity (pcs)</label>
                  <input
                    type="number"
                    min={Number(selectedOrder.packed_count || 0)}
                    value={editTotalQty}
                    onChange={e => setEditTotalQty(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontWeight: 700
                    }}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save & Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
