import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowRight, BoxSelect, ScanLine, Package, Search, ArrowLeftRight } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import '../../styles/tokens.css';

interface ScannedBoxInfo {
  boxNumber: string;
  totalItems: number;
  sampleRequirement: number;
  inspectionId?: string;
  packedItemQrs: string[];
}

interface AQLBoxScanPageProps {
  isFinalAql?: boolean;
}

export const AQLBoxScanPage: React.FC<AQLBoxScanPageProps> = ({ isFinalAql = false }) => {
  const navigate = useNavigate();
  const { packingBoxes, saveAQLSession, activeJob, setActiveJob } = useApp();

  const po = activeJob?.productionOrder;
  const stageName = isFinalAql ? 'FINAL AQL' : 'AQL Checker';
  const stageTitle = isFinalAql ? 'Final AQL Inspection' : 'AQL Inspection';
  const stageCode = isFinalAql ? 'FINAL_AQL' : 'AQL';

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);

  const initialTarget = po?.totalQuantity || 500;
  const initialAqlPassed = po?.progress?.aqlPassed || 0;
  const initialAqlFailed = po?.progress?.aqlFailed || 0;

  const [aqlProgress, setAqlProgress] = useState<{
    loading: boolean;
    targetQuantity: number;
    aqlPassedCount: number;
    aqlFailedCount: number;
    operatorStats: {
      operatorName: string;
      passedCount: number;
      failedCount: number;
    };
  }>({
    loading: true,
    targetQuantity: initialTarget,
    aqlPassedCount: initialAqlPassed,
    aqlFailedCount: initialAqlFailed,
    operatorStats: {
      operatorName: 'Operator',
      passedCount: initialAqlPassed,
      failedCount: initialAqlFailed
    }
  });

  const fetchAqlProgress = async () => {
    if (!po) return;
    const targetPoKey = po.dbId || po.id;
    try {
      const res = await apiFetch(`/api/aql/progress/${targetPoKey}`);
      if (res && typeof res.aqlPassedCount === 'number') {
        setAqlProgress({
          loading: false,
          targetQuantity: res.targetQuantity || po.totalQuantity || 500,
          aqlPassedCount: res.aqlPassedCount,
          aqlFailedCount: res.aqlFailedCount,
          operatorStats: res.operatorStats || {
            operatorName: 'Operator',
            passedCount: res.aqlPassedCount,
            failedCount: res.aqlFailedCount
          }
        });
      }
    } catch {
      setAqlProgress(prev => ({ ...prev, loading: false }));
    }
  };

  React.useEffect(() => {
    setScannedBox(null);
    if (po) {
      const target = po.totalQuantity || 500;
      const passed = po.progress?.aqlPassed || 0;
      const failed = po.progress?.aqlFailed || 0;
      setAqlProgress(prev => ({
        ...prev,
        targetQuantity: target,
        aqlPassedCount: passed,
        aqlFailedCount: failed,
        operatorStats: {
          ...prev.operatorStats,
          passedCount: passed,
          failedCount: failed
        }
      }));
      fetchAqlProgress();
    }
  }, [po?.dbId, po?.id]);

  const targetSoQty = aqlProgress.targetQuantity || po?.totalQuantity || 500;
  const aqlPassedQty = aqlProgress.aqlPassedCount;

  const [scannedBox, setScannedBox] = useState<ScannedBoxInfo | null>(null);

  /* ── Scan box handler ─────────────────────────────────────── */
  const handleScanBox = async (code: string) => {
    const poDbId = po?.dbId || po?.id;
    const poDisplayNumber = po?.id || (po as any)?.poNumber;
    const currentPoId = poDbId || poDisplayNumber;

    const isMatchingPo = (b: any) => {
      if (!b) return false;
      const boxPo = b.productionOrderId || b.poId;
      if (!boxPo) return false;
      return (
        (poDbId && boxPo === poDbId) ||
        (poDisplayNumber && boxPo === poDisplayNumber)
      );
    };

    const poKey = currentPoId ? `${currentPoId}_${code}` : code;
    const rawLocalBox = packingBoxes[poKey] || Object.values(packingBoxes).find((b: any) => 
      b.boxNumber?.toUpperCase() === code && isMatchingPo(b)
    );
    const localBox = isMatchingPo(rawLocalBox) ? rawLocalBox : null;

    if (localBox && localBox.status !== 'COMPLETED' && localBox.items.length < localBox.capacity) {
      return {
        status: 'rejected' as const,
        message: `Box ${code} is not fully packed / completed (${localBox.items.length}/${localBox.capacity} items). Only completed boxes can undergo ${stageTitle}.`,
        code
      };
    }

    const localItems: string[] = localBox?.items ? localBox.items.map(i => i.qr) : [];

    let serverItems: string[] = [];
    let inspectionId: string | undefined;
    let totalItems = localItems.length || 0;
    let sampleRequirement = 12;
    let previousPassedSamples: any[] = [];
    let permanentlyRemovedQrs: string[] = [];
    let isApiSuccess = false;

    try {
      const res = await apiFetch('/api/aql/boxes/scan', {
        method: 'POST',
        body: JSON.stringify({
          boxNumber: code,
          stage: stageCode,
          productionOrderId: currentPoId
        }),
      });
      isApiSuccess = true;
      serverItems = res.box?.items?.map((i: any) => i.qr_code) || [];
      inspectionId = res.inspectionId;
      totalItems = res.box?.item_count || serverItems.length || totalItems;
      sampleRequirement = res.requiredSamples || totalItems || 12;
      previousPassedSamples = res.previousPassedSamples || [];
      permanentlyRemovedQrs = res.permanentlyRemovedQrs || [];
    } catch (err: any) {
      return {
        status: 'rejected' as const,
        message: err.message || `Box ${code} is not fully packed / completed. Only completed boxes can undergo ${stageTitle}.`,
        code
      };
    }

    const permRemovedSet = new Set(permanentlyRemovedQrs.map(q => q.toUpperCase()));

    const combinedSet = new Set<string>();
    serverItems.forEach(qr => { if (qr && !permRemovedSet.has(qr.trim().toUpperCase())) combinedSet.add(qr.trim().toUpperCase()); });
    if (!isApiSuccess && serverItems.length === 0) {
      localItems.forEach(qr => { if (qr && !permRemovedSet.has(qr.trim().toUpperCase())) combinedSet.add(qr.trim().toUpperCase()); });
    }

    const finalItems = Array.from(combinedSet);
    const reqSamples = finalItems.length > 0 ? finalItems.length : (totalItems || 12);

    if (packingBoxes[code]) {
      const updatedLocalItems = (packingBoxes[code].items || []).filter(
        (it: any) => !permRemovedSet.has(it.qr.trim().toUpperCase())
      );
      packingBoxes[code].items = updatedLocalItems;
      localStorage.setItem('uniflow_packing_boxes', JSON.stringify(packingBoxes));
    }

    const details: ScannedBoxInfo & { previousPassedSamples?: any[] } = {
      boxNumber: code,
      totalItems: finalItems.length,
      sampleRequirement: reqSamples || 0,
      inspectionId,
      packedItemQrs: finalItems,
      previousPassedSamples
    };

    setScannedBox(details as any);
    return {
      status: 'accepted' as const,
      message: `📦 Box ${code} loaded (${finalItems.length} active items) — Ready for ${stageTitle}.`,
      code,
    };
  };

  /* ── Proceed to sampling ──────────────────────────────────── */
  const handleProceed = () => {
    if (!scannedBox) return;

    saveAQLSession({
      boxNumber: scannedBox.boxNumber,
      totalBoxQuantity: scannedBox.totalItems,
      sampleRequired: scannedBox.sampleRequirement,
      currentSampleIndex: 1,
      samples: [],
      status: 'SAMPLE_SCAN',
      inspectionId: scannedBox.inspectionId,
      boxItems: scannedBox.packedItemQrs,
      previousPassedSamples: (scannedBox as any).previousPassedSamples || [],
      stage: stageCode,
      isFinalAql
    } as any);

    navigate(isFinalAql ? '/operator/final-aql/samples' : '/operator/aql/samples');
  };

  if (!po || showPoSelector) {
    return (
      <div className="workflow-container">
        <SelectPOForOperation
          operationName={stageName as any}
          isModal={true}
          selectedPoId={po?.id || po?.dbId}
          onClose={po ? () => setShowPoSelector(false) : undefined}
          onSelectPo={(selectedPo) => {
            setScannedBox(null);
            setActiveJob({ productionOrder: selectedPo });
            setShowPoSelector(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>
            {stageTitle} • {formatPoDisplayName(po)}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Scan the packing box barcode to load its contents for inspection.
          </p>
        </div>
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
      </div>

      {/* 3 Step Indicator */}
      <div style={styles.stepBar}>
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>1</span>
          <span>Box Scan</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>2</span>
          <span>Item Inspection</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Result</span>
        </div>
      </div>

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Scanner & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* PO Progress Card - Operator Work Primary */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            {/* PRIMARY / LARGE: Operator Work */}
            <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(22, 184, 174, 0.08)', border: '1px solid rgba(22, 184, 174, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                  MY {isFinalAql ? 'FINAL AQL' : 'AQL'} PROGRESS — {aqlProgress.operatorStats.operatorName}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>
                  {Math.round((aqlProgress.operatorStats.passedCount / (targetSoQty || 1)) * 100)}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Passed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{aqlProgress.operatorStats.passedCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Failed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>{aqlProgress.operatorStats.failedCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Processed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                    {aqlProgress.operatorStats.passedCount + aqlProgress.operatorStats.failedCount}
                  </span>
                </div>
              </div>
              <ProgressBar current={aqlProgress.operatorStats.passedCount} total={targetSoQty} height={8} />
            </div>

            {/* SECONDARY / SMALL: PO Total Summary */}
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>PO TOTAL</span>
              <div style={{ display: 'flex', gap: '12px', color: 'var(--text-primary)', fontWeight: 600, flexWrap: 'wrap' }}>
                <span>Target: <strong>{targetSoQty}</strong></span>
                <span>Passed: <strong style={{ color: '#10B981' }}>{aqlPassedQty}</strong></span>
                <span>Overall: <strong>{Math.round((aqlPassedQty / (targetSoQty || 1)) * 100)}%</strong></span>
              </div>
            </div>
          </div>

          <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
          <ScannerInput onScan={handleScanBox} placeholder="Scan box barcode (e.g. BX-000218)..." />

          {!scannedBox ? (
            <div style={styles.emptyCard}>
              <ScanLine size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for box barcode scan…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a sealed box barcode to retrieve box details &amp; sample requirements
              </span>
            </div>
          ) : (
            <div className="card" style={styles.scannedCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={styles.cardHeaderTitle}>SCANNED BOX DETAILS</span>
                <StatusPill label="ACTIVE BOX" variant="teal" />
              </div>

              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Box Barcode Number</span>
                <span style={{ ...styles.detailValue, color: 'var(--primary-teal)', fontSize: '16px' }}>
                  {scannedBox.boxNumber}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Total Active Garments in Box</span>
                <span style={styles.detailValue}>{scannedBox.totalItems} pcs</span>
              </div>
              <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
                <span style={styles.detailLabel}>Required Sample Size</span>
                <span style={{ ...styles.detailValue, color: '#10B981' }}>
                  {scannedBox.sampleRequirement} pcs (100% Audit)
                </span>
              </div>

              {scannedBox.packedItemQrs.length > 0 && (
                <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    PACKED GARMENTS ({scannedBox.packedItemQrs.length} ITEMS):
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                    {scannedBox.packedItemQrs.map((qr, idx) => (
                      <span key={idx} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {idx + 1}. {qr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleProceed}
                style={{
                  marginTop: '16px',
                  background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                }}
              >
                Proceed to Item Inspection <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Specifications */}
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
                <span style={{ color: 'var(--text-secondary)' }}>Inspection Stage:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{stageTitle}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Garment Style:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{po?.styleName || po?.styleCode || 'Standard'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>AQL Standard:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Level II Normal (100% Item Audit)</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              {isFinalAql ? 'FINAL AQL INSTRUCTIONS' : 'AQL INSTRUCTIONS'}
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the sealed box barcode.</li>
              <li>Inspect active garments in the box. Partial inspection is supported.</li>
              <li>Click Finish to save progress at any time and resume later.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  stepBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 20px',
  },
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
  },
  stepInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  stepNumActive: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
  },
  stepNumInactive: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },
  stepDivider: {
    flex: 1,
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '0 12px',
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
  scannedCard: {
    backgroundColor: 'var(--bg-surface-1)',
    borderColor: 'rgba(16,185,129,0.4)',
    borderWidth: '1.5px',
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
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
};
