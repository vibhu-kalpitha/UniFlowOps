import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { formatPoDisplayName } from '../../utils/formatters';
import { PlusCircle, Clock, AlertTriangle, Box, Package, CheckCircle2, Search, Filter, X, ChevronRight, Eye } from 'lucide-react';
import '../../styles/tokens.css';

export const SupervisorHome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [authorizedPos, setAuthorizedPos] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [currentPoDetails, setCurrentPoDetails] = useState<any>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<any>({
    plannedQuantity: 0,
    qcCompleted: 0,
    packedQuantity: 0,
    aqlCompleted: 0,
    remainingQuantity: 0,
    completionPct: 0
  });
  const [supervisorBoxes, setSupervisorBoxes] = useState<any[]>([]);
  const [selectedBoxForModal, setSelectedBoxForModal] = useState<any>(null);

  const fetchSupervisorData = async (poIdStr = selectedPoId) => {
    setLoading(true);
    try {
      const url = poIdStr ? `/api/dashboard/supervisor?poId=${encodeURIComponent(poIdStr)}` : '/api/dashboard/supervisor';
      const data = await apiFetch(url);
      if (data) {
        setAuthorizedPos(data.authorizedPos || []);
        setCurrentPoDetails(data.currentPoDetails || null);
        setOverviewMetrics(data.overviewMetrics || {});
        setSupervisorBoxes(data.supervisorBoxes || []);
        if (!selectedPoId && data.currentPoDetails?.poId) {
          setSelectedPoId(data.currentPoDetails.poId);
        }
      }
    } catch (err) {
      console.warn('Failed to load supervisor dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupervisorData(selectedPoId);
  }, [selectedPoId]);

  const handlePoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPoId = e.target.value;
    setSelectedPoId(newPoId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Supervisor Header */}
      <div style={styles.headerRow}>
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Welcome back, Supervisor</span>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {currentUser?.name || 'Supervisor'} 👨‍💼
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
            Authorized Production Control & Live Factory Metrics
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            style={styles.actionBtnPrimary}
            onClick={() => navigate('/supervisor/production-orders/new/style')}
          >
            <PlusCircle size={18} color="#041820" />
            <span>+ Create PO</span>
          </button>
        </div>
      </div>

      {/* ── PART 2: PRODUCTION OVERVIEW FOR SUPERVISOR ───────────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              SUPERVISOR PRODUCTION OVERVIEW
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              Authorized Production Orders & Live Metrics
            </h3>
          </div>

          {/* PO Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Select PO:</span>
            <select
              value={selectedPoId}
              onChange={handlePoChange}
              style={{
                backgroundColor: 'var(--bg-surface-2)',
                border: '1.5px solid var(--primary-teal)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 700,
                outline: 'none',
                minWidth: '260px'
              }}
            >
              {authorizedPos.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {formatPoDisplayName(p)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected PO Details Card Banner */}
        {currentPoDetails && (
          <div style={{
            backgroundColor: 'var(--bg-surface-2)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '14px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatPoDisplayName(currentPoDetails)}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <StatusPill label={currentPoDetails.status || 'CURRENT'} variant="teal" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                  {currentPoDetails.completionPct || 0}% Complete
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span><strong>PO Name:</strong> {currentPoDetails.poName || 'N/A'}</span>
              <span><strong>PO Number:</strong> {currentPoDetails.poNumber}</span>
              <span><strong>Style Name:</strong> {currentPoDetails.styleName}</span>
              <span><strong>Customer:</strong> {currentPoDetails.customer}</span>
              <span><strong>Supervisor:</strong> {currentPoDetails.supervisorName}</span>
              <span><strong>Shift:</strong> {currentPoDetails.shiftName}</span>
            </div>

            <div style={{ marginTop: '6px' }}>
              <ProgressBar current={overviewMetrics.packedQuantity || 0} total={overviewMetrics.plannedQuantity || 1} height={8} />
            </div>
          </div>
        )}

        {/* Supervisor PO Overview KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
          <div style={styles.metricBox('rgba(20, 184, 166, 0.12)', 'var(--primary-teal)')}>
            <span style={styles.metricVal('#16B8AE')}>{overviewMetrics.plannedQuantity || 0}</span>
            <span style={styles.metricLbl('#16B8AE')}>Planned Quantity</span>
          </div>

          <div style={styles.metricBox('rgba(16, 185, 129, 0.12)', '#10B981')}>
            <span style={styles.metricVal('#10B981')}>{overviewMetrics.qcCompleted || 0}</span>
            <span style={styles.metricLbl('#10B981')}>Items Processed Today</span>
          </div>

          <div style={styles.metricBox('rgba(59, 130, 246, 0.12)', '#3B82F6')}>
            <span style={styles.metricVal('#3B82F6')}>{overviewMetrics.packedQuantity || 0}</span>
            <span style={styles.metricLbl('#3B82F6')}>Packed Quantity</span>
          </div>

          <div style={styles.metricBox('rgba(139, 92, 246, 0.12)', '#8B5CF6')}>
            <span style={styles.metricVal('#8B5CF6')}>{overviewMetrics.aqlCompleted || 0}</span>
            <span style={styles.metricLbl('#8B5CF6')}>AQL Completed</span>
          </div>

          <div style={styles.metricBox('rgba(245, 158, 11, 0.12)', '#F59E0B')}>
            <span style={styles.metricVal('#F59E0B')}>{overviewMetrics.remainingQuantity || 0}</span>
            <span style={styles.metricLbl('#F59E0B')}>Remaining Qty</span>
          </div>

          <div style={styles.metricBox('rgba(5, 150, 105, 0.12)', '#059669')}>
            <span style={styles.metricVal('#059669')}>{overviewMetrics.completionPct || 0}%</span>
            <span style={styles.metricLbl('#059669')}>PO Completion %</span>
          </div>
        </div>
      </div>

      {/* ── PART 3: BOX OVERVIEW FOR SUPERVISOR HOME ────────────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Box Overview ({supervisorBoxes.length} boxes)
            </h4>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Actual packing box capacity and active product fill levels for authorized POs
            </span>
          </div>
        </div>

        {supervisorBoxes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
            <Box size={36} />
            <div style={{ fontSize: '13px', marginTop: '8px' }}>No packing boxes recorded for this PO yet.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)', borderBottom: '1.5px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 12px' }}>Box Code</th>
                  <th style={{ padding: '10px 12px' }}>Production Order</th>
                  <th style={{ padding: '10px 12px' }}>Filled / Capacity</th>
                  <th style={{ padding: '10px 12px' }}>Active Products Inside</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {supervisorBoxes.map((bx: any) => (
                  <tr key={bx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td data-label="Box Code" style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {bx.boxCode}
                    </td>
                    <td data-label="Production Order" style={{ padding: '10px 12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                      {formatPoDisplayName(bx)}
                    </td>
                    <td data-label="Filled / Capacity" style={{ padding: '10px 12px' }}>
                      <span style={{ fontWeight: 800, color: bx.activeFilledCount >= bx.capacity ? '#10B981' : 'var(--text-primary)' }}>
                        {bx.activeFilledCount} / {bx.capacity}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        ({bx.remainingCapacity} space left)
                      </span>
                    </td>
                    <td data-label="Active Products Inside" style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '240px' }}>
                      {bx.productQrs && bx.productQrs.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {bx.productQrs.slice(0, 3).map((qr: string, idx: number) => (
                            <span key={idx} style={{ backgroundColor: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                              {qr}
                            </span>
                          ))}
                          {bx.productQrs.length > 3 && (
                            <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700, alignSelf: 'center' }}>
                              +{bx.productQrs.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Empty box</span>
                      )}
                    </td>
                    <td data-label="Status" style={{ padding: '10px 12px' }}>
                      <StatusPill label={bx.status} variant={bx.status === 'COMPLETED' || bx.status === 'COMPLETE' ? 'green' : 'teal'} />
                    </td>
                    <td data-label="Action" style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => setSelectedBoxForModal(bx)}
                        style={{
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--primary-teal)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={12} /> Contents
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Box Detail Modal ─────────────────────────────────────── */}
      {selectedBoxForModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Box {selectedBoxForModal.boxCode} Details
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {formatPoDisplayName(selectedBoxForModal)}
                </span>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelectedBoxForModal(null)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px', marginBottom: '14px', fontSize: '12px' }}>
              <div><strong>Capacity:</strong> {selectedBoxForModal.capacity} items</div>
              <div><strong>Active Filled:</strong> {selectedBoxForModal.activeFilledCount} items</div>
              <div><strong>Remaining Space:</strong> {selectedBoxForModal.remainingCapacity} items</div>
              <div><strong>Status:</strong> {selectedBoxForModal.status}</div>
              <div><strong>AQL Status:</strong> {selectedBoxForModal.aqlStatus || 'PENDING'}</div>
              <div><strong>Transfer Status:</strong> {selectedBoxForModal.transferStatus || 'NONE'}</div>
            </div>

            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Active Products Inside ({selectedBoxForModal.items?.length || 0}):
            </h4>

            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedBoxForModal.items && selectedBoxForModal.items.length > 0 ? (
                selectedBoxForModal.items.map((item: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-2)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Package size={14} color="var(--primary-teal)" />
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{item.qr_code}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({item.size})</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      Packed by {item.packed_by_name || 'Operator'}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No active products packed in this box.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, any> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px'
  },
  actionBtnPrimary: {
    height: '42px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
    color: '#041820',
    fontWeight: 800,
    fontSize: '13px',
    padding: '0 16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer'
  },
  metricBox: (bgColor: string, borderColor: string) => ({
    backgroundColor: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius: '12px',
    padding: '10px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }),
  metricVal: (color: string) => ({
    fontSize: '20px',
    fontWeight: 800,
    color
  }),
  metricLbl: (color: string) => ({
    fontSize: '10px',
    fontWeight: 700,
    color,
    textAlign: 'center' as const,
    marginTop: '2px'
  }),
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '20px',
    border: '1.5px solid var(--border-color)',
    padding: '24px',
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px'
  }
};

