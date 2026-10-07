import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight, QrCode, Trash2, Link2, ArrowRight } from 'lucide-react';
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

  const [collectedPreQcQrs, setCollectedPreQcQrs] = useState<string[]>([]);
  const [poProductInput, setPoProductInput] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState<boolean>(false);

  /* ── Pre QC barcode scan handler ─────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) {
      showToast('Barcode required', 'warning');
      return { status: 'rejected' as const, message: 'Barcode required', code: '' };
    }

    if (collectedPreQcQrs.includes(code)) {
      showToast(`Pre-QC QR ${code} is already captured`, 'warning');
      return { status: 'duplicate' as const, message: `Pre-QC QR ${code} is already captured`, code };
    }

    try {
      await apiFetch('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          preQcQr: code,
          code
        })
      });

      setCollectedPreQcQrs(prev => [...prev, code]);
      showToast(`✅ Saved Pre-QC QR: ${code}`, 'success');

      return {
        status: 'accepted' as const,
        message: `✅ Saved Pre-QC QR: ${code}`,
        code
      };
    } catch (err: any) {
      const errMsg = err?.message || err?.error || String(err);
      showToast(`Scan Error: ${errMsg}`, 'error');
      return {
        status: 'rejected' as const,
        message: errMsg,
        code
      };
    }
  };

  const handleRemovePreQcQr = (index: number) => {
    setCollectedPreQcQrs(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setCollectedPreQcQrs([]);
    showToast('Cleared captured Pre-QC QRs', 'info');
  };

  const handleAssignToPoProduct = async () => {
    const targetProductQr = poProductInput.trim().toUpperCase();
    if (collectedPreQcQrs.length === 0) {
      showToast('Please capture at least one Pre-QC QR first', 'warning');
      return;
    }
    if (!targetProductQr) {
      showToast('Please enter or scan a PO Product QR', 'warning');
      return;
    }

    setIsAssigning(true);
    try {
      await apiFetch('/api/pre-qc/assign', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          poProductQr: targetProductQr,
          preQcQrs: collectedPreQcQrs
        })
      });

      showToast(`✅ Assigned ${collectedPreQcQrs.length} Pre-QC QRs to PO Product ${targetProductQr}`, 'success');
      setCollectedPreQcQrs([]);
      setPoProductInput('');
    } catch (err: any) {
      showToast(`Assign Error: ${err?.message || err?.error || err}`, 'error');
    } finally {
      setIsAssigning(false);
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
          placeholder="Scan raw Pre-QC QR (e.g. OMP/34567, EVT/34545)..."
        />
      </div>

      {/* Captured Pre-QC QRs List & Assignment Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--primary-teal)', margin: 0, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-teal)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={18} /> CAPTURED PRE-QC QRs ({collectedPreQcQrs.length})
          </h4>
          {collectedPreQcQrs.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              [ CLEAR ALL ]
            </button>
          )}
        </div>

        {collectedPreQcQrs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px', fontSize: '13px' }}>
            Scan raw component barcodes (e.g. <code>OMP/34567</code>, <code>EVT/34545</code>) above to build a list.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', maxHeight: '160px', overflowY: 'auto', backgroundColor: 'var(--bg-surface-2)', padding: '10px', borderRadius: '10px' }}>
            {collectedPreQcQrs.map((qr, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-1)', padding: '6px 10px', borderRadius: '6px', fontSize: '13px' }}>
                <code style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{idx + 1}. {qr}</code>
                <button type="button" onClick={() => handleRemovePreQcQr(idx)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Assign Captured Pre-QC QRs to PO Product QR (e.g. PNFLSS01)
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={poProductInput}
              onChange={(e) => setPoProductInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAssignToPoProduct(); }}
              placeholder="Scan/type target PO Product QR..."
              style={{ ...styles.reasonInput, flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAssignToPoProduct}
              disabled={isAssigning || collectedPreQcQrs.length === 0}
              style={{ padding: '8px 16px', fontWeight: 800, fontSize: '13px' }}
            >
              {isAssigning ? 'Assigning...' : '[ SAVE / ASSIGN ]'}
            </button>
          </div>

          <a
            href="/operator/qc"
            className="btn btn-secondary"
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
              borderRadius: '8px'
            }}
          >
            Continue to Normal QC Inspection <ArrowRight size={16} />
          </a>
        </div>
      </div>

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
