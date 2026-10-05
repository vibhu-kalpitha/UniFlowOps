import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import '../../styles/tokens.css';

interface ScannedItem {
  qr: string;
  product: string;
  size: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
  scannedAt: string;
}

export const PreQCPage: React.FC = () => {
  const { activeJob, setActiveJob, showToast } = useApp();

  const po = activeJob?.productionOrder;

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [preQcResult, setPreQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [failureReason, setFailureReason] = useState<string>('');
  const [recentScans, setRecentScans] = useState<ScannedItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Live Pre QC progress state from server
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
    };
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
      passedCount: 0
    }
  });

  const fetchProgress = async () => {
    const targetPoKey = po?.dbId || po?.id;
    if (!targetPoKey) return;
    setPoProgress(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch<any>(`/api/pre-qc/progress/${encodeURIComponent(targetPoKey)}`);
      if (res && typeof res.passedUnique === 'number') {
        setPoProgress({
          loading: false,
          targetQuantity: res.targetQuantity || po?.totalQuantity || 10,
          inspectedUnique: res.inspectedUnique || 0,
          passedUnique: res.passedUnique || 0,
          failedUnique: res.failedUnique || 0,
          remainingToInspect: res.remainingToInspect || 0,
          remainingToPass: res.remainingToPass || 0,
          operatorStats: res.operatorStats || {
            operatorName: 'Operator',
            passedCount: 0
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
  const preQcPassedQty = poProgress.passedUnique;
  const remainingQcQty = poProgress.remainingToPass;

  /* ── Pre QC barcode scan handler ─────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    setSaved(false);
    setFailureReason('');

    try {
      const res = await apiFetch<any>('/api/pre-qc/scan', {
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
          failedUnique: res.progress.failedUnique || 0,
          remainingToInspect: res.progress.remainingToInspect,
          remainingToPass: res.progress.remainingToPass,
        }));
      }

      if (res?.status === 'DUPLICATE') {
        const dupItem: ScannedItem = {
          qr: res.item?.qr_code || code,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
          scannedAt: new Date().toLocaleTimeString()
        };
        setScannedItem(dupItem);
        setPreQcResult('FAIL');
        showToast(`⚠️ Item ${code} is ALREADY Pre QC Passed! (Duplicate scan)`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY Pre QC Passed! (Duplicate scan)`,
          code: res.item?.qr_code || code,
        };
      }

      const validItem: ScannedItem = {
        qr: res.item?.qr_code || code,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: res.item?.size || 'L',
        status: 'VALID',
        scannedAt: new Date().toLocaleTimeString()
      };

      setScannedItem(validItem);
      setPreQcResult('PASS');
      showToast(`✅ ${code} validated — Select PASS or FAIL result below`, 'info');

      return {
        status: 'accepted' as const,
        message: `✅ ${code} validated for ${po?.id || 'PO'}`,
        code: res.item?.qr_code || code,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const invalidItem: ScannedItem = {
        qr: code,
        product: po?.styleName || 'Garment',
        size: '—',
        status: 'INVALID',
        scannedAt: new Date().toLocaleTimeString()
      };
      setScannedItem(invalidItem);

      if (err?.error === 'CONFIG_NOT_SELECTED' || err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('not selected') || errMsg.includes('does not belong')) {
        const redMsg = `Unselected Configuration — '${code}' does not belong to Production Order ${po?.id || ''}.`;
        showToast(redMsg, 'error');
        return {
          status: 'rejected' as const,
          message: redMsg,
          code,
        };
      }

      const defaultErr = errMsg || `Failed to process scan for ${code}`;
      showToast(defaultErr, 'error');
      return {
        status: 'rejected' as const,
        message: defaultErr,
        code,
      };
    }
  };

  /* ── Save Pre QC result to database ───────────────────────────── */
  const handleSave = async () => {
    if (!scannedItem) {
      showToast('Please scan a garment QR barcode first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid barcode configuration.', 'error');
      return;
    }
    if (scannedItem.status === 'DUPLICATE') {
      showToast('Item has already passed Pre QC (Duplicate scan).', 'warning');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const recRes = await apiFetch<any>('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({
          code: scannedItem.qr,
          productionOrderId: po?.dbId || po?.id,
          preQcResult,
          failureReason: preQcResult === 'FAIL' ? failureReason : undefined
        }),
      });

      if (recRes?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: recRes.progress.targetQuantity,
          inspectedUnique: recRes.progress.inspectedUnique,
          passedUnique: recRes.progress.passedUnique,
          failedUnique: recRes.progress.failedUnique || 0,
          remainingToInspect: recRes.progress.remainingToInspect,
          remainingToPass: recRes.progress.remainingToPass,
        }));
      }

      const savedRecord: ScannedItem = {
        ...scannedItem,
        status: preQcResult === 'PASS' ? 'VALID' : 'INVALID',
        scannedAt: new Date().toLocaleTimeString()
      };

      setRecentScans(prev => [savedRecord, ...prev.slice(0, 9)]);

      if (preQcResult === 'PASS') {
        showToast(`✅ Pre QC PASSED recorded for ${scannedItem.qr}!`, 'success');
      } else {
        showToast(`❌ Pre QC FAIL recorded for ${scannedItem.qr}`, 'warning');
      }

      setSaved(true);
      setIsSaving(false);

      setTimeout(() => {
        setScannedItem(null);
        setPreQcResult('PASS');
        setFailureReason('');
        setSaved(false);
      }, 1000);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      showToast(`Save failed: ${errMsg}`, 'error');
      setIsSaving(false);
    }
  };

  if (showPoSelector || !po) {
    return (
      <SelectPOForOperation
        operationName="Pre QC"
        selectedPoId={po?.id}
        onSelectPo={(selectedPo) => {
          setActiveJob({
            productionOrder: selectedPo,
            shift: selectedPo.shifts?.[0]
          });
          setShowPoSelector(false);
        }}
      />
    );
  }

  return (
    <div style={styles.container}>
      {/* Active PO Header Card */}
      <div className="card" style={styles.poCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={styles.cardSubTitle}>PRE QC OPERATION</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '2px' }}>
              {formatPoDisplayName({
                poNumber: po.id,
                poName: po.poName,
                styleName: po.styleName
              })}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Customer: {po.customer} • Map PO: {po.mapPo}
            </p>
          </div>
          <button
            onClick={() => setShowPoSelector(true)}
            style={styles.changePoBtn}
          >
            <ArrowLeftRight size={14} /> Switch PO
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
            <span>Pre QC Progress: {preQcPassedQty} / {targetPoQty} pcs</span>
            <span style={{ color: 'var(--primary-teal)', fontWeight: 800 }}>
              {Math.round((preQcPassedQty / Math.max(1, targetPoQty)) * 100)}%
            </span>
          </div>
          <ProgressBar current={preQcPassedQty} total={targetPoQty} showText={false} />
        </div>

        {/* Summary Stats Row */}
        <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>PO SUMMARY</span>
          <div style={{ display: 'flex', gap: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
            <span>Target: <strong>{targetPoQty}</strong></span>
            <span>Passed: <strong style={{ color: '#10B981' }}>{preQcPassedQty}</strong></span>
            <span>Remaining: <strong style={{ color: 'var(--primary-teal)' }}>{remainingQcQty}</strong></span>
          </div>
        </div>
      </div>

      {/* Barcode Scanner Input */}
      <div style={styles.scannerBox}>
        <ScannerStatus showConnectButton={true} style={{ marginBottom: '10px' }} />
        <ScannerInput
          onScan={handleScanCode}
          placeholder="Scan barcode for Pre QC (e.g. PNFLSS0926001)..."
        />
      </div>

      {/* Item Inspection & Result Control Card */}
      {!scannedItem ? (
        <div style={styles.emptyCard}>
          <ScanLine size={36} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
            Waiting for barcode scan…
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Scan a garment barcode to validate configuration range and record result
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Item Details Card */}
          <div
            className="card"
            style={{
              margin: 0,
              backgroundColor: 'var(--bg-surface-1)',
              borderColor:
                scannedItem.status === 'INVALID'
                  ? 'rgba(239, 68, 68, 0.5)'
                  : scannedItem.status === 'DUPLICATE'
                  ? 'rgba(245, 158, 11, 0.5)'
                  : 'rgba(16, 185, 129, 0.4)',
              borderWidth: '1.5px',
            }}
          >
            <span style={styles.cardHeaderTitle}>ITEM DETAILS</span>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Barcode / QR Code</span>
              <span style={{ ...styles.detailValue, color: 'var(--primary-teal)', fontSize: '16px' }}>
                {scannedItem.qr}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Garment Style</span>
              <span style={styles.detailValue}>{scannedItem.product}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Size</span>
              <span style={styles.detailValue}>{scannedItem.size}</span>
            </div>
            <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
              <span style={styles.detailLabel}>Configuration Check</span>
              {scannedItem.status === 'VALID' && <StatusPill label="✅ Valid Configuration — In Range" variant="green" />}
              {scannedItem.status === 'DUPLICATE' && <StatusPill label="⚠️ Already Scanned (Duplicate)" variant="amber" />}
              {scannedItem.status === 'INVALID' && <StatusPill label="❌ Unselected Configuration" variant="red" />}
            </div>
          </div>

          {/* Result Selection Control */}
          {scannedItem.status === 'VALID' && (
            <div className="card" style={{ margin: 0, backgroundColor: 'var(--bg-surface-1)' }}>
              <span style={styles.controlLabel}>Select Pre QC Result</span>
              <div style={styles.segmentRow}>
                <button
                  type="button"
                  style={preQcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                  onClick={() => setPreQcResult('PASS')}
                >
                  <Check size={18} /> PASS
                </button>
                <button
                  type="button"
                  style={preQcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                  onClick={() => setPreQcResult('FAIL')}
                >
                  <XCircle size={18} /> FAIL
                </button>
              </div>

              {/* Optional Failure Reason input when FAIL selected */}
              {preQcResult === 'FAIL' && (
                <div style={{ marginTop: '12px' }}>
                  <span style={styles.controlLabel}>Failure Reason (Optional)</span>
                  <input
                    type="text"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="e.g. Label error, wrong size, fabric defect..."
                    style={styles.reasonInput}
                  />
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saved || isSaving}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  background: saved
                    ? 'var(--color-green)'
                    : preQcResult === 'FAIL'
                    ? 'var(--color-red)'
                    : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-dark) 100%)',
                  opacity: saved ? 0.7 : 1,
                }}
              >
                {saved ? '✅ Saved to Database!' : `Save Pre QC ${preQcResult} Result`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recent Scans History Table */}
      {recentScans.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Recent Pre QC Scans
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentScans.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-surface-2)',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ScanLine size={16} color="var(--primary-teal)" />
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.qr}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.scannedAt}</span>
                  <StatusPill label={item.status === 'VALID' ? 'PASS' : 'FAIL'} variant={item.status === 'VALID' ? 'green' : 'red'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '20px'
  },
  poCard: {
    backgroundColor: 'var(--bg-surface-1)',
    margin: 0
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
    letterSpacing: '0.05em'
  },
  changePoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    backgroundColor: 'rgba(22, 184, 174, 0.12)',
    border: '1px solid var(--primary-teal)',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer'
  },
  scannerBox: {
    width: '100%'
  },
  emptyCard: {
    padding: '36px 20px',
    borderRadius: '16px',
    border: '2px dashed var(--border-color)',
    backgroundColor: 'var(--bg-surface-1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
    marginBottom: '10px',
    display: 'block'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)'
  },
  detailLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 600
  },
  detailValue: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontWeight: 700
  },
  controlLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block'
  },
  segmentRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '6px'
  },
  segmentBtn: {
    padding: '12px',
    borderRadius: '12px',
    border: '1.5px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  passBtnActive: {
    padding: '12px',
    borderRadius: '12px',
    border: '2px solid #10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  failBtnActive: {
    padding: '12px',
    borderRadius: '12px',
    border: '2px solid #EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#EF4444',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  reasonInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  }
};
