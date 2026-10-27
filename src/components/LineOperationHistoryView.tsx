import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { StatusPill } from './StatusPill';
import {
  Layers,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Package,
  Calendar,
  Box,
  X,
  Eye,
  ExternalLink
} from 'lucide-react';
import '../styles/tokens.css';

interface LineOperationHistoryViewProps {
  poId: string;
  poNumber: string;
  selectedLine?: string;
  operation: 'PRE_QC' | 'QC' | 'PACKING' | 'AQL';
  onClose?: () => void;
}

export const LineOperationHistoryView: React.FC<LineOperationHistoryViewProps> = ({
  poId,
  poNumber,
  selectedLine = 'Line 1',
  operation,
  onClose
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBoxModal, setSelectedBoxModal] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchHistory = async () => {
    if (!poId) return;
    try {
      setIsRefreshing(true);
      setError(null);
      const res = await apiFetch<any>(
        `/api/scans/po-line-history?poId=${encodeURIComponent(poId)}&line=${encodeURIComponent(selectedLine)}&operation=${encodeURIComponent(operation)}`
      );
      setData(res);
    } catch (err: any) {
      console.error('Failed to fetch line history:', err);
      setError(err?.message || 'Failed to load line records');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchHistory();
  }, [poId, selectedLine, operation]);

  const rawRecords: any[] = data?.records || [];
  const summary = data?.summary || {};

  const filteredRecords = rawRecords.filter((rec: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const str = JSON.stringify(rec).toLowerCase();
    return str.includes(term);
  });

  const getOpTitle = () => {
    switch (operation) {
      case 'PRE_QC': return 'Pre-QC Validation Records';
      case 'QC': return 'QC & Electrical Test Records';
      case 'PACKING': return 'Carton Box Packing Records';
      case 'AQL': return 'AQL Inspection Audit Records';
      default: return 'Operation Line Records';
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      backgroundColor: 'var(--bg-surface-1)',
      borderRadius: '16px',
      border: '1.5px solid var(--border-color)',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
    }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '12px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '14px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              borderRadius: '20px',
              backgroundColor: 'rgba(20, 184, 166, 0.15)',
              color: 'var(--primary-teal)',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              <Layers size={13} /> {selectedLine || 'Allocated Line'}
            </span>
            <span style={{
              padding: '3px 10px',
              borderRadius: '20px',
              backgroundColor: 'var(--bg-surface-2)',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 700
            }}>
              PO: <strong style={{ color: 'var(--text-primary)' }}>{poNumber || data?.poNumber || poId}</strong>
            </span>
            <StatusPill label="READ-ONLY VIEW" variant="teal" />
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px', margin: '6px 0 0 0' }}>
            {getOpTitle()} 📋
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', margin: '2px 0 0 0' }}>
            Detailed log of all units processed for this specific Production Order and Line.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={fetchHistory}
            disabled={isRefreshing}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '8px'
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Summary Badges */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '10px'
      }}>
        {operation === 'PACKING' ? (
          <>
            <div style={styles.metricCard}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL BOXES</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-purple)' }}>{summary.totalBoxes || 0}</span>
            </div>
            <div style={styles.metricCard}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>PACKED UNITS</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-blue)' }}>{summary.totalPackedUnits || 0}</span>
            </div>
            <div style={styles.metricCard}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TARGET QTY</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.targetQuantity || '—'}</span>
            </div>
          </>
        ) : (
          <>
            <div style={styles.metricCard}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL PROCESSED</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.total || 0}</span>
            </div>
            <div style={{ ...styles.metricCard, borderLeft: '3px solid #10B981' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>PASSED</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{summary.passCount || 0}</span>
            </div>
            <div style={{ ...styles.metricCard, borderLeft: '3px solid #EF4444' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#EF4444' }}>FAILED / DEFECT</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>{summary.failCount || 0}</span>
            </div>
            {summary.targetQuantity && (
              <div style={styles.metricCard}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>TARGET QTY</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary-teal)' }}>{summary.targetQuantity}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        backgroundColor: 'var(--bg-surface-2)',
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search QR barcode, box code, operator, or defect..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              borderRadius: '8px',
              fontSize: '12px',
              backgroundColor: 'var(--bg-surface-1)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)'
            }}
          />
        </div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
          Showing {filteredRecords.length} of {rawRecords.length} records
        </span>
      </div>

      {/* Main Records Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px auto', display: 'block', color: 'var(--primary-teal)' }} />
          Loading line processing records...
        </div>
      ) : error ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#EF4444' }}>
          ⚠️ {error}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ padding: '35px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No records found for {selectedLine} on this Production Order.
        </div>
      ) : (
        <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <table className="responsive-table" style={styles.table}>
            <thead>
              {operation === 'PRE_QC' && (
                <tr>
                  <th style={styles.th}>ITEM QR CODE</th>
                  <th style={styles.th}>GARMENT SIZE</th>
                  <th style={styles.th}>PRE-QC RESULT</th>
                  <th style={styles.th}>DEFECT / REASON</th>
                  <th style={styles.th}>OPERATOR</th>
                  <th style={styles.th}>SCANNED AT</th>
                </tr>
              )}
              {operation === 'QC' && (
                <tr>
                  <th style={styles.th}>ITEM QR CODE</th>
                  <th style={styles.th}>GARMENT SIZE</th>
                  <th style={styles.th}>QC RESULT</th>
                  <th style={styles.th}>TEST RESULT</th>
                  <th style={styles.th}>DEFECT / REASON</th>
                  <th style={styles.th}>INSPECTOR</th>
                  <th style={styles.th}>SCANNED AT</th>
                </tr>
              )}
              {operation === 'PACKING' && (
                <tr>
                  <th style={styles.th}>BOX IDENTIFIER</th>
                  <th style={styles.th}>CAPACITY</th>
                  <th style={styles.th}>PACKED ITEMS</th>
                  <th style={styles.th}>STATUS</th>
                  <th style={styles.th}>CREATED AT</th>
                  <th style={styles.th}>ACTION</th>
                </tr>
              )}
              {operation === 'AQL' && (
                <tr>
                  <th style={styles.th}>BOX IDENTIFIER</th>
                  <th style={styles.th}>SAMPLES CHECKED</th>
                  <th style={styles.th}>AQL RESULT</th>
                  <th style={styles.th}>DEFECT / REASON</th>
                  <th style={styles.th}>AUDITOR</th>
                  <th style={styles.th}>DATE & TIME</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredRecords.map((rec: any, idx: number) => {
                if (operation === 'PRE_QC') {
                  return (
                    <tr key={rec.id || idx} style={styles.tr}>
                      <td data-label="ITEM QR" style={styles.td}>
                        <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{rec.qr_code}</strong>
                      </td>
                      <td data-label="SIZE" style={styles.td}>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{rec.size || 'M'}</span>
                      </td>
                      <td data-label="RESULT" style={styles.td}>
                        <StatusPill label={rec.result || 'PASS'} variant={rec.result === 'PASS' ? 'green' : 'red'} />
                      </td>
                      <td data-label="DEFECT / REASON" style={styles.td}>
                        <span style={{ color: rec.failure_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                          {rec.failure_reason || 'Passed (Clean)'}
                        </span>
                      </td>
                      <td data-label="OPERATOR" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rec.operator_name || 'Operator'}</span>
                      </td>
                      <td data-label="SCANNED AT" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {rec.scanned_at ? new Date(rec.scanned_at).toLocaleString() : 'Recent'}
                        </span>
                      </td>
                    </tr>
                  );
                }

                if (operation === 'QC') {
                  return (
                    <tr key={rec.id || idx} style={styles.tr}>
                      <td data-label="ITEM QR" style={styles.td}>
                        <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{rec.qr_code}</strong>
                      </td>
                      <td data-label="SIZE" style={styles.td}>
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{rec.size || 'M'}</span>
                      </td>
                      <td data-label="QC RESULT" style={styles.td}>
                        <StatusPill label={rec.qc_result || 'PASS'} variant={rec.qc_result === 'PASS' ? 'green' : 'red'} />
                      </td>
                      <td data-label="TEST RESULT" style={styles.td}>
                        <StatusPill label={rec.test_result || 'PASS'} variant={rec.test_result === 'PASS' ? 'green' : 'amber'} />
                      </td>
                      <td data-label="DEFECT / REASON" style={styles.td}>
                        <span style={{ color: rec.failure_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                          {rec.failure_reason || 'Passed (Clean)'}
                        </span>
                      </td>
                      <td data-label="INSPECTOR" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rec.operator_name || 'QC Inspector'}</span>
                      </td>
                      <td data-label="SCANNED AT" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {rec.scanned_at ? new Date(rec.scanned_at).toLocaleString() : 'Recent'}
                        </span>
                      </td>
                    </tr>
                  );
                }

                if (operation === 'PACKING') {
                  const filledCount = rec.qrs?.length ?? Number(rec.item_count || 0);
                  return (
                    <tr key={rec.id || idx} style={styles.tr}>
                      <td data-label="BOX IDENTIFIER" style={styles.td}>
                        <strong style={{ color: 'var(--color-purple)' }}>{rec.box_code || rec.box_number}</strong>
                      </td>
                      <td data-label="CAPACITY" style={styles.td}>
                        <strong style={{ color: 'var(--primary-teal)' }}>{filledCount}</strong> / {rec.capacity} pcs
                      </td>
                      <td data-label="PACKED ITEMS" style={styles.td}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '280px' }}>
                          {rec.qrs && rec.qrs.length > 0 ? (
                            <>
                              {rec.qrs.slice(0, 3).map((qr: string, i: number) => (
                                <code key={i} style={styles.qrBadgeMini}>{qr}</code>
                              ))}
                              {rec.qrs.length > 3 && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                  +{rec.qrs.length - 3} more
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No items</span>
                          )}
                        </div>
                      </td>
                      <td data-label="STATUS" style={styles.td}>
                        <StatusPill label={rec.status || 'OPEN'} variant={rec.status === 'COMPLETED' ? 'green' : 'amber'} />
                      </td>
                      <td data-label="CREATED AT" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {rec.created_at ? new Date(rec.created_at).toLocaleString() : 'Recent'}
                        </span>
                      </td>
                      <td data-label="ACTION" style={styles.td}>
                        <button
                          onClick={() => setSelectedBoxModal(rec)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(139, 92, 246, 0.15)',
                            border: '1px solid var(--color-purple)',
                            color: 'var(--color-purple)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Eye size={12} />
                          View All QRs ({rec.qrs?.length || 0})
                        </button>
                      </td>
                    </tr>
                  );
                }

                if (operation === 'AQL') {
                  return (
                    <tr key={rec.id || idx} style={styles.tr}>
                      <td data-label="BOX IDENTIFIER" style={styles.td}>
                        <strong style={{ color: 'var(--color-purple)' }}>{rec.box_code || rec.box_number || rec.box_id}</strong>
                      </td>
                      <td data-label="SAMPLES CHECKED" style={styles.td}>
                        <span>{rec.sampled_count || rec.required_samples || 5} checked</span>
                      </td>
                      <td data-label="RESULT" style={styles.td}>
                        <StatusPill label={rec.result || 'PASS'} variant={rec.result === 'PASS' ? 'green' : rec.result === 'FAIL' ? 'red' : 'amber'} />
                      </td>
                      <td data-label="DEFECT / REASON" style={styles.td}>
                        <span style={{ color: rec.failure_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                          {rec.failure_reason || 'Approved'}
                        </span>
                      </td>
                      <td data-label="AUDITOR" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{rec.inspector_name || 'AQL Auditor'}</span>
                      </td>
                      <td data-label="DATE & TIME" style={styles.td}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {rec.completed_at ? new Date(rec.completed_at).toLocaleString() : rec.started_at ? new Date(rec.started_at).toLocaleString() : 'Recent'}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return null;
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Box Detail QRs Modal ────────────────────────────── */}
      {selectedBoxModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Box size={20} color="var(--color-purple)" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
                  Box QRs: {selectedBoxModal.box_code || selectedBoxModal.box_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBoxModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Total Items Packed: <strong style={{ color: 'var(--primary-teal)' }}>{selectedBoxModal.qrs?.length || 0}</strong> / {selectedBoxModal.capacity} pcs
            </div>

            <div style={{
              maxHeight: '250px',
              overflowY: 'auto',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              backgroundColor: 'var(--bg-surface-2)',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)'
            }}>
              {selectedBoxModal.qrs && selectedBoxModal.qrs.length > 0 ? (
                selectedBoxModal.qrs.map((qr: string, i: number) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      color: 'var(--primary-teal)',
                      border: '1px solid rgba(20, 184, 166, 0.3)',
                      padding: '4px 8px',
                      borderRadius: '6px'
                    }}
                  >
                    {qr}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items packed in this box yet.</span>
              )}
            </div>

            <button
              onClick={() => setSelectedBoxModal(null)}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '4px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, any> = {
  metricCard: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  qrBadgeMini: {
    fontSize: '10px',
    fontFamily: 'monospace',
    fontWeight: 700,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    color: 'var(--primary-teal)',
    padding: '2px 5px',
    borderRadius: '4px',
    border: '1px solid rgba(20, 184, 166, 0.25)'
  },
  table: {
    width: '100%',
    minWidth: '700px',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  th: {
    padding: '10px 12px',
    borderBottom: '2px solid var(--border-color)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap'
  },
  tr: {
    borderBottom: '1px solid var(--border-color)'
  },
  td: {
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  }
};
