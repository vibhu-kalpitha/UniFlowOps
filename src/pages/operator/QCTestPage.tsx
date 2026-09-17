import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { CheckCircle2, XCircle, FileText, Check, ScanLine } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { isCodeInRange } from '../../utils/rangeValidation';
import '../../styles/tokens.css';

interface ScannedItem {
  qr: string;
  product: string;
  size: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
}

interface QcHistoryItem {
  attempt_number: number;
  qc_result: string;
  test_result: string;
  failure_reason?: string;
  scanned_at: string;
  operator_name?: string;
}

interface QcHistoryData {
  failCount: number;
  retryCount: number;
  history: QcHistoryItem[];
}

export const QCTestPage: React.FC = () => {
  const { activeJob, incrementQCPassed, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const rangeStart = po?.boxRangeStart || '';
  const rangeEnd   = po?.boxRangeEnd   || '';

  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [qcResult,   setQcResult]   = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [failureReason, setFailureReason] = useState<string>('');
  const [historyData, setHistoryData] = useState<QcHistoryData | null>(null);
  const [saved, setSaved] = useState(false);

  /* ── scan handler ──────────────────────────────────────────── */
  const handleScanCode = async (code: string) => {
    setSaved(false);
    setFailureReason('');
    setHistoryData(null);

    try {
      const hRes = await apiFetch(`/api/qc/history/${code}`);
      if (hRes) {
        setHistoryData({
          failCount: hRes.failCount || 0,
          retryCount: hRes.retryCount || 0,
          history: hRes.history || []
        });
      }
    } catch (_) {
      setHistoryData(null);
    }

    if (rangeStart && rangeEnd && !isCodeInRange(code, rangeStart, rangeEnd)) {
      setScannedItem({ qr: code, product: so?.product || '—', size: '—', status: 'INVALID' });
      setQcResult('FAIL');
      setTestResult('FAIL');

      apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify({
          itemQr:          code,
          salesOrderNumber: so?.id || 'SO-AUTO',
          qcResult:        'FAIL',
          testResult:      'FAIL',
          failureReason:   `Out of Range Barcode: ${code} (PO Range: ${rangeStart} -> ${rangeEnd})`,
        }),
      }).then(saveRes => {
        apiFetch(`/api/qc/history/${code}`).then(hRes => {
          if (hRes) {
            setHistoryData({
              failCount: hRes.failCount || saveRes?.totalFails || 1,
              retryCount: hRes.retryCount || 0,
              history: hRes.history || []
            });
          }
        }).catch(() => {});
      }).catch(() => {});

      return {
        status: 'rejected' as const,
        message: `❌ Out of Range Barcode (${code}) auto-saved as FAIL in DB!`,
        code,
      };
    }

    try {
      const res = await apiFetch('/api/qc/scan', {
        method: 'POST',
        body: JSON.stringify({ code, salesOrderId: so?.id }),
      });
      const isDup = res.status === 'DUPLICATE';
      setScannedItem({
        qr:      res.item?.qr_code || code,
        product: so?.product || 'Garment',
        size:    res.item?.size || 'L',
        status:  isDup ? 'DUPLICATE' : 'VALID',
      });
      setQcResult(isDup ? 'FAIL' : 'PASS');
      setTestResult(isDup ? 'FAIL' : 'PASS');

      if (isDup) {
        apiFetch('/api/qc/results', {
          method: 'POST',
          body: JSON.stringify({
            itemQr:          code,
            salesOrderNumber: so?.id || 'SO-AUTO',
            qcResult:        'FAIL',
            testResult:      'FAIL',
            failureReason:   `Duplicate Scan: ${code}`,
          }),
        }).catch(() => {});
      }
      return {
        status:  isDup ? ('duplicate' as const) : ('accepted' as const),
        message: isDup ? `⚠️ Duplicate scan: ${code}` : `✅ ${code} validated successfully`,
        code: res.item?.qr_code || code,
      };
    } catch {
      setScannedItem({ qr: code, product: so?.product || 'Garment', size: 'L', status: 'VALID' });
      setQcResult('PASS');
      setTestResult('PASS');
      return {
        status:  'accepted' as const,
        message: `✅ ${code} scanned (offline mode).`,
        code,
      };
    }
  };

  /* ── save handler ───────────────────────────────────────────── */
  const handleSave = async () => {
    if (!scannedItem) {
      showToast('Please scan an item first!', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save — barcode is out of range!', 'error');
      return;
    }

    let saveRes: any = null;
    try {
      saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify({
          itemQr:          scannedItem.qr,
          salesOrderNumber: so?.id || 'SO-77201',
          qcResult,
          testResult,
          failureReason: (qcResult === 'FAIL' || testResult === 'FAIL') ? failureReason : undefined,
        }),
      });
    } catch { /* ignore network errors */ }

    if (qcResult === 'PASS' && testResult === 'PASS') {
      incrementQCPassed();
      const retryText = saveRes?.retryCount > 0 ? ` (Passed on retry #${saveRes.retryCount})` : '';
      showToast(`✅ QC & Test PASSED for ${scannedItem.qr}${retryText}!`, 'success');
    } else {
      const attemptText = saveRes?.totalFails ? ` (Failed ${saveRes.totalFails} time(s))` : '';
      showToast(`❌ Failure recorded for ${scannedItem.qr}${attemptText}`, 'warning');
    }

    setSaved(true);
    setTimeout(() => {
      setScannedItem(null);
      setQcResult('PASS');
      setTestResult('PASS');
      setFailureReason('');
      setHistoryData(null);
      setSaved(false);
    }, 1500);
  };

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>
                QC Inspection • {po?.id || 'PO-2026-904'} | {so?.id || 'SO-77201'}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {so?.product || 'Garment'} — {so?.colour || '—'}
                {rangeStart && rangeEnd && (
                  <span style={{ marginLeft: '8px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                    • Valid Range: {rangeStart} → {rangeEnd}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} color="var(--color-green)" />
            <span style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 700 }}>
              Scanner Active
            </span>
          </div>
        </div>
      </div>

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Scanner & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          <ScannerInput onScan={handleScanCode} placeholder="Scan garment QR code…" />

          {!scannedItem ? (
            <div style={styles.emptyCard}>
              <ScanLine size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for scan…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a garment QR to see item details & validate quality
              </span>
            </div>
          ) : (
            <>
              <div
                className="card"
                style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  borderColor: scannedItem.status === 'INVALID'
                    ? 'rgba(239,68,68,0.5)'
                    : scannedItem.status === 'DUPLICATE'
                    ? 'rgba(245,158,11,0.5)'
                    : 'rgba(16,185,129,0.4)',
                  borderWidth: '1.5px',
                }}
              >
                <span style={styles.cardHeaderTitle}>ITEM DETAILS</span>

                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Barcode / QR</span>
                  <span style={{ ...styles.detailValue, color: 'var(--primary-teal)', fontSize: '16px' }}>
                    {scannedItem.qr}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Product</span>
                  <span style={styles.detailValue}>{scannedItem.product}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Size</span>
                  <span style={styles.detailValue}>{scannedItem.size}</span>
                </div>
                <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
                  <span style={styles.detailLabel}>Validation</span>
                  {scannedItem.status === 'VALID' && <StatusPill label="✅ Valid — In Range" variant="green" />}
                  {scannedItem.status === 'DUPLICATE' && <StatusPill label="⚠️ Duplicate" variant="amber" />}
                  {scannedItem.status === 'INVALID' && <StatusPill label="❌ Out of Range" variant="red" />}
                </div>

                {historyData && historyData.failCount > 0 && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#f87171' }}>
                      ⚠️ Previously Failed {historyData.failCount} time(s)! (Attempt #{historyData.failCount + 1})
                    </span>
                    {historyData.history.map((h, idx) => (
                      <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Attempt #{h.attempt_number}: QC {h.qc_result} / Test {h.test_result} {h.failure_reason ? `(${h.failure_reason})` : ''}</span>
                        <span style={{ fontSize: '10px', opacity: 0.8 }}>{new Date(h.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span style={styles.controlLabel}>QC Result</span>
                <div style={styles.segmentRow}>
                  <button
                    style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                    onClick={() => setQcResult('PASS')}
                  >
                    <Check size={18} /> PASS
                  </button>
                  <button
                    style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                    onClick={() => setQcResult('FAIL')}
                  >
                    <XCircle size={18} /> FAIL
                  </button>
                </div>
              </div>

              <div>
                <span style={styles.controlLabel}>Test Result</span>
                <div style={styles.segmentRow}>
                  <button
                    style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                    onClick={() => setTestResult('PASS')}
                  >
                    <Check size={18} /> PASS
                  </button>
                  <button
                    style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                    onClick={() => setTestResult('FAIL')}
                  >
                    <XCircle size={18} /> FAIL
                  </button>
                </div>
              </div>

              {(qcResult === 'FAIL' || testResult === 'FAIL') && (
                <div>
                  <span style={styles.controlLabel}>Failure Reason (Optional)</span>
                  <input
                    type="text"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="e.g. Stitching error, fabric tear, out of spec..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saved}
                style={{
                  marginTop: '8px',
                  background: saved
                    ? 'var(--color-green)'
                    : scannedItem.status === 'INVALID'
                    ? 'var(--color-red)'
                    : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                  opacity: saved ? 0.7 : 1,
                }}
              >
                {saved ? '✅ Saved!' : 'Save QC Result'}
              </button>
            </>
          )}
        </div>

        {/* Right Panel: Context Details & History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-right-panel">
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              INSPECTION SPECIFICATIONS
            </span>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Production Order:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po?.id || 'PO-2026-904'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sales Order:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{so?.id || 'SO-77201'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Product Style:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{so?.product || 'Garment'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Barcode Range:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>
                  {rangeStart && rangeEnd ? `${rangeStart} → ${rangeEnd}` : 'Any Code'}
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              QC TEST INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the garment QR tag or enter manually.</li>
              <li>Verify physical garment against specifications.</li>
              <li>Mark QC & Test results appropriately before saving.</li>
              <li>Failed items are automatically logged to the defect database.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 14px',
  },
  emptyCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '2px dashed var(--border-color)',
    borderRadius: '18px',
    padding: '32px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginBottom: '12px',
    display: 'block',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  detailLabel: { fontSize: '13px', color: 'var(--text-secondary)' },
  detailValue: { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' },
  controlLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block',
  },
  segmentRow: { display: 'flex', gap: '10px' },
  segmentBtn: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  passBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(24,184,121,0.35)',
    border: 'none',
  },
  failBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(239,92,92,0.35)',
    border: 'none',
  },
};
