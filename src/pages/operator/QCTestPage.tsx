import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight } from 'lucide-react';
import { apiFetch } from '../../services/api';
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
  const { activeJob, setActiveJob, incrementQCPassed, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const qcMode = po?.qcTestMode || 'QC & Test';

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [failureReason, setFailureReason] = useState<string>('');
  const [historyData, setHistoryData] = useState<QcHistoryData | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Authoritative backend progress state
  const [poProgress, setPoProgress] = useState<{
    loading: boolean;
    targetQuantity: number;
    inspectedUnique: number;
    passedUnique: number;
    failedUnique: number;
    remainingToInspect: number;
    remainingToPass: number;
    operatorStats: {
      operatorName: string;
      passedCount: number;
      failedCount: number;
    };
    error?: string;
  }>({
    loading: true,
    targetQuantity: po?.totalQuantity || 10,
    inspectedUnique: 0,
    passedUnique: 0,
    failedUnique: 0,
    remainingToInspect: po?.totalQuantity || 10,
    remainingToPass: po?.totalQuantity || 10,
    operatorStats: {
      operatorName: 'Operator',
      passedCount: 0,
      failedCount: 0
    }
  });

  const fetchProgress = async () => {
    const targetPoKey = po?.dbId || po?.id || 'PO-2026-0184';
    setPoProgress(prev => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await apiFetch(`/api/qc/progress/${targetPoKey}`);
      if (res && typeof res.passedUnique === 'number') {
        setPoProgress({
          loading: false,
          targetQuantity: res.targetQuantity,
          inspectedUnique: res.inspectedUnique,
          passedUnique: res.passedUnique,
          failedUnique: res.failedUnique,
          remainingToInspect: res.remainingToInspect,
          remainingToPass: res.remainingToPass,
          operatorStats: res.operatorStats || {
            operatorName: 'Operator',
            passedCount: 0,
            failedCount: 0
          }
        });
      } else {
        setPoProgress(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setPoProgress(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [po?.dbId, po?.id]);

  const targetPoQty = poProgress.targetQuantity || po?.totalQuantity || 10;
  const qcPassedQty = poProgress.passedUnique;
  const remainingQcQty = poProgress.remainingToPass;
  const isQCComplete = poProgress.passedUnique >= targetPoQty;
  const isAllAdmitted = poProgress.inspectedUnique >= targetPoQty;

  /* ── scan handler ──────────────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
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
    } catch {
      setHistoryData(null);
    }

    try {
      const res = await apiFetch('/api/qc/scan', {
        method: 'POST',
        body: JSON.stringify({ code, productionOrderId: po?.dbId || po?.id, productionOrderNumber: po?.id }),
      });

      if (res?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: res.progress.targetQuantity,
          inspectedUnique: res.progress.inspectedUnique,
          passedUnique: res.progress.passedUnique,
          failedUnique: res.progress.failedUnique,
          remainingToInspect: res.progress.remainingToInspect,
          remainingToPass: res.progress.remainingToPass,
        }));
      }

      const isDup = res.status === 'DUPLICATE';

      setScannedItem({
        qr: res.item?.qr_code || code,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: res.item?.size || 'L',
        status: isDup ? 'DUPLICATE' : 'VALID',
      });
      setQcResult(isDup ? 'FAIL' : 'PASS');
      setTestResult(isDup ? 'FAIL' : 'PASS');

      if (isDup) {
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY QC PASSED! (Duplicate scan)`,
          code: res.item?.qr_code || code,
        };
      }

      return {
        status: 'accepted' as const,
        message: `✅ ${code} validated successfully for ${po?.id || 'PO'}`,
        code: res.item?.qr_code || code,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('does not belong')) {
        const expMsg = err?.expectedRange ? ` (Expected range: ${err.expectedRange})` : '';
        const redMsg = `Out of range — this QR does not belong to Production Order ${po?.id || ''}.${expMsg}`;
        showToast(redMsg, 'error');
        setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
        return {
          status: 'rejected' as const,
          message: redMsg,
          code,
        };
      }

      if (err?.error === 'QR_RANGE_NOT_CONFIGURED' || errMsg.includes('not configured')) {
        const notConfigMsg = `Product QR range not configured for Production Order ${po?.id || ''}. Please contact supervisor.`;
        showToast(notConfigMsg, 'error');
        setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
        return {
          status: 'rejected' as const,
          message: notConfigMsg,
          code,
        };
      }

      showToast(`Scan Error: ${errMsg}`, 'error');
      setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
      return {
        status: 'rejected' as const,
        message: `Error: ${errMsg}`,
        code,
      };
    }
  };

  /* ── save handler ──────────────────────────────────────────── */
  const handleSave = async () => {
    if (!scannedItem) {
      showToast('Please scan a garment QR first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid item.', 'error');
      return;
    }
    if (scannedItem.status === 'DUPLICATE') {
      showToast('Item is already QC Passed (Duplicate Scan).', 'warning');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    const key = `qc-${po?.id || 'po'}-${scannedItem.qr}-${Date.now()}`;
    let saveRes: any = null;

    try {
      const payload: any = {
        idempotencyKey: key,
        itemQr: scannedItem.qr,
        productionOrderId: po?.dbId || po?.id,
        productionOrderNumber: po?.id || 'PO-2026-0184',
        failureReason: (qcResult === 'FAIL' || testResult === 'FAIL') ? failureReason : undefined,
      };

      if (qcMode === 'QC Only') {
        payload.qcResult = qcResult;
      } else if (qcMode === 'Test Only') {
        payload.testResult = testResult;
      } else {
        payload.qcResult = qcResult;
        payload.testResult = testResult;
      }

      saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('does not belong')) {
        const expMsg = err?.expectedRange ? ` (Expected range: ${err.expectedRange})` : '';
        showToast(`Out of range — this QR does not belong to Production Order ${po?.id || ''}.${expMsg}`, 'error');
        setIsSaving(false);
        return;
      }
      showToast(`Save failed: ${errMsg}`, 'error');
      setIsSaving(false);
      return;
    }

    if (saveRes?.progress) {
      setPoProgress(prev => ({
        ...prev,
        loading: false,
        targetQuantity: saveRes.progress.targetQuantity,
        inspectedUnique: saveRes.progress.inspectedUnique,
        passedUnique: saveRes.progress.passedUnique,
        failedUnique: saveRes.progress.failedUnique,
        remainingToInspect: saveRes.progress.remainingToInspect,
        remainingToPass: saveRes.progress.remainingToPass,
      }));
    }
    await fetchProgress();

    const isPass = (qcMode === 'QC Only' ? qcResult === 'PASS' : qcMode === 'Test Only' ? testResult === 'PASS' : (qcResult === 'PASS' && testResult === 'PASS'));

    if (isPass) {
      incrementQCPassed();
      const retryText = saveRes?.retryCount > 0 ? ` (Passed on retry #${saveRes.retryCount})` : '';
      showToast(`✅ ${qcMode} PASSED for ${scannedItem.qr}${retryText}!`, 'success');
    } else {
      const attemptText = saveRes?.totalFails ? ` (Failed ${saveRes.totalFails} time(s))` : '';
      showToast(`❌ Failure recorded for ${scannedItem.qr}${attemptText}`, 'warning');
    }

    setSaved(true);
    setIsSaving(false);
    setTimeout(() => {
      setScannedItem(null);
      setQcResult('PASS');
      setTestResult('PASS');
      setFailureReason('');
      setHistoryData(null);
      setSaved(false);
    }, 1200);
  };

  if (!po || showPoSelector) {
    return (
      <div className="workflow-container">
        <SelectPOForOperation
          operationName="QC Test"
          isModal={true}
          selectedPoId={po?.id || po?.dbId}
          onClose={po ? () => setShowPoSelector(false) : undefined}
          onSelectPo={(selectedPo) => {
            setActiveJob({ productionOrder: selectedPo });
            setShowPoSelector(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                QC Inspection • {po?.id || (po as any)?.poNumber} — {po?.styleName || po?.styleCode || 'Garment Style'}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Configured QC Mode: <strong style={{ color: 'var(--primary-teal)' }}>{qcMode}</strong>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setShowPoSelector(true)}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <ArrowLeftRight size={14} /> Switch PO
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} color="var(--color-green)" />
              <span style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 700 }}>
                Scanner Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Scanner & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* PO Progress Card */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
                PRODUCTION ORDER QC PROGRESS
              </span>
              <StatusPill label={`Remaining: ${remainingQcQty}`} variant={remainingQcQty === 0 ? 'green' : 'teal'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block' }}>Target Qty</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{targetPoQty}</span>
              </div>
              <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: '#10B981', display: 'block' }}>Passed</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#10B981' }}>{qcPassedQty}</span>
              </div>
              <div style={{ backgroundColor: 'rgba(34, 211, 197, 0.1)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--primary-teal)', display: 'block' }}>Remaining</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-teal)' }}>{remainingQcQty}</span>
              </div>
            </div>

            <ProgressBar current={qcPassedQty} total={targetPoQty} height={8} />

            {/* Operator Personal Stats Banner */}
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px'
            }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                Operator: <strong style={{ color: '#f8fafc' }}>{poProgress.operatorStats.operatorName}</strong>
              </span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>Your Passed: {poProgress.operatorStats.passedCount}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>Your Failed: {poProgress.operatorStats.failedCount}</span>
              </div>
            </div>

            {isQCComplete && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', borderRadius: '10px', marginTop: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#10B981' }}>
                  ✅ QC complete — {qcPassedQty}/{targetPoQty} passed
                </span>
              </div>
            )}
          </div>

          <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
          <ScannerInput onScan={handleScanCode} placeholder="Scan product QR barcode..." />

          {!scannedItem ? (
            <div style={styles.emptyCard}>
              <ScanLine size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for scan…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a product QR code to inspect item details
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
                  <span style={styles.detailLabel}>Style</span>
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
                      ⚠️ Previously Failed {historyData.failCount} time(s)!
                    </span>
                  </div>
                )}
              </div>

              {/* Mode-specific Result Controls */}
              {(qcMode === 'QC & Test' || qcMode === 'QC Only') && (
                <div>
                  <span style={styles.controlLabel}>QC Result</span>
                  <div style={styles.segmentRow}>
                    <button
                      type="button"
                      style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                      onClick={() => setQcResult('PASS')}
                    >
                      <Check size={18} /> PASS
                    </button>
                    <button
                      type="button"
                      style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                      onClick={() => setQcResult('FAIL')}
                    >
                      <XCircle size={18} /> FAIL
                    </button>
                  </div>
                </div>
              )}

              {(qcMode === 'QC & Test' || qcMode === 'Test Only') && (
                <div>
                  <span style={styles.controlLabel}>Test Result</span>
                  <div style={styles.segmentRow}>
                    <button
                      type="button"
                      style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                      onClick={() => setTestResult('PASS')}
                    >
                      <Check size={18} /> PASS
                    </button>
                    <button
                      type="button"
                      style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                      onClick={() => setTestResult('FAIL')}
                    >
                      <XCircle size={18} /> FAIL
                    </button>
                  </div>
                </div>
              )}

              {((qcMode !== 'Test Only' && qcResult === 'FAIL') || (qcMode !== 'QC Only' && testResult === 'FAIL')) && (
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
                disabled={saved || isSaving}
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
                {saved ? '✅ Saved!' : `Save ${qcMode} Result`}
              </button>
            </>
          )}
        </div>

        {/* Right Panel: Context Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-right-panel">
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              INSPECTION SPECIFICATIONS
            </span>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Production Order:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po?.id || 'PO-2026-0184'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Garment Style:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{po?.styleName || po?.styleCode || 'Standard'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Mode:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{qcMode}</span>
              </div>
              {po?.productConfigurations && po.productConfigurations.length > 0 && (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>CONFIGURED RANGES:</span>
                  {po.productConfigurations.map((cfg, idx) => (
                    <div key={idx} style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      • {cfg.configCode}: {cfg.productQrPrefix}{cfg.productSerialStart} → {cfg.productQrPrefix}{cfg.productSerialEnd} ({cfg.quantity} pcs)
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              QC INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the product QR code barcode.</li>
              <li>Perform required inspection according to selected mode ({qcMode}).</li>
              <li>Record PASS/FAIL result and save to production database.</li>
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
