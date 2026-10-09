import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { Package, CheckCircle2, Clock, FileText, BoxSelect, ScanLine, ArrowLeftRight } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { isCodeInRange } from '../../utils/rangeValidation';
import { formatPoDisplayName } from '../../utils/formatters';
import '../../styles/tokens.css';

interface BoxItem {
  qr: string;
  scannedAt: string;
}

interface ActiveBox {
  boxId?: string;
  boxNumber: string;
  capacity: number;
  soId: string;
  status: 'OPEN' | 'COMPLETED';
  items: BoxItem[];
}

export const PackingPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeJob, setActiveJob, packingBoxes, savePackingBox, incrementPacked, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);

  const initialTarget = po?.totalQuantity || 500;
  const initialPacked = po?.progress?.packed || 0;

  const [packProgress, setPackProgress] = useState<{
    loading: boolean;
    targetQuantity: number;
    packedCount: number;
    remainingToPack: number;
    totalFailCount: number;
    operatorStats: {
      operatorName: string;
      packedCount: number;
      failCount: number;
    };
  }>({
    loading: true,
    targetQuantity: initialTarget,
    packedCount: initialPacked,
    remainingToPack: Math.max(0, initialTarget - initialPacked),
    totalFailCount: po?.progress?.qcFailed || 0,
    operatorStats: {
      operatorName: 'Operator',
      packedCount: initialPacked,
      failCount: 0
    }
  });

  const fetchPackingProgress = async () => {
    if (!po) return;
    const targetPoKey = po.dbId || po.id;
    try {
      const res = await apiFetch(`/api/packing/progress/${targetPoKey}`);
      if (res && typeof res.packedCount === 'number') {
        setPackProgress({
          loading: false,
          targetQuantity: res.targetQuantity || po.totalQuantity || 500,
          packedCount: res.packedCount,
          remainingToPack: res.remainingToPack,
          totalFailCount: res.totalFailCount || 0,
          operatorStats: {
            operatorName: res.operatorStats?.operatorName || 'Operator',
            packedCount: typeof res.operatorStats?.packedCount === 'number' ? res.operatorStats.packedCount : 0,
            failCount: typeof res.operatorStats?.failCount === 'number' ? res.operatorStats.failCount : 0
          }
        });
      }
    } catch {
      setPackProgress(prev => ({ ...prev, loading: false }));
    }
  };

  React.useEffect(() => {
    setBox(null);
    if (po) {
      const target = po.totalQuantity || 500;
      const packed = po.progress?.packed || 0;
      setPackProgress(prev => ({
        ...prev,
        targetQuantity: target,
        packedCount: packed,
        remainingToPack: Math.max(0, target - packed)
      }));
      fetchPackingProgress();
    }
  }, [po?.dbId, po?.id]);

  const targetSoQty = packProgress.targetQuantity || po?.totalQuantity || 500;
  const packedQty = packProgress.packedCount;
  const remainingPackQty = packProgress.remainingToPack;

  // Phase 1: scan box QR
  const [box, setBox] = useState<ActiveBox | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);

  /* ── Phase 1: Box barcode scan ─────────────────────────────── */
  const handleScanBox = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    const currentPoId = po?.id || po?.dbId;
    const poKey = currentPoId ? `${currentPoId}_${code}` : code;
    const rawLocalBox = packingBoxes[poKey] || Object.values(packingBoxes).find((b: any) => 
      b.boxNumber?.toUpperCase() === code && 
      (!currentPoId || b.productionOrderId === currentPoId || b.poId === currentPoId)
    );
    const localBox = (rawLocalBox && (!currentPoId || (rawLocalBox as any).productionOrderId === currentPoId || (rawLocalBox as any).poId === currentPoId))
      ? rawLocalBox
      : null;

    let dbItems: BoxItem[] = [];
    let dbStatus = 'OPEN';
    let dbCapacity = so?.boxCapacity || 12;
    let apiBoxId: string | undefined = undefined;

    try {
      const targetPoKey = currentPoId || '';
      const res = await apiFetch(`/api/boxes/by-code/${encodeURIComponent(code)}?productionOrderId=${encodeURIComponent(targetPoKey)}`);
      if (res && res.box) {
        apiBoxId = res.box.id;
        dbCapacity = res.box.capacity || dbCapacity;
        dbStatus = res.box.status || 'OPEN';
        if (Array.isArray(res.box.items)) {
          dbItems = res.box.items.map((i: any) => {
            const timeStr = i.packed_at ? new Date(i.packed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '06:51';
            return {
              qr: i.qr_code || i.qr,
              scannedAt: timeStr
            };
          });
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      showToast(errMsg, 'error');
      return {
        status: 'rejected' as const,
        message: errMsg,
        code,
      };
    }

    const combinedMap = new Map<string, BoxItem>();
    if (localBox?.items) {
      localBox.items.forEach((item: BoxItem) => {
        if (item.qr) combinedMap.set(item.qr.trim().toUpperCase(), item);
      });
    }
    dbItems.forEach((item: BoxItem) => {
      if (item.qr) combinedMap.set(item.qr.trim().toUpperCase(), item);
    });

    const finalItems = Array.from(combinedMap.values());
    const isCompleted = finalItems.length >= dbCapacity || dbStatus === 'COMPLETE' || dbStatus === 'COMPLETED';

    const loadedBox: ActiveBox & { productionOrderId?: string } = {
      boxId: apiBoxId,
      boxNumber: code,
      capacity: dbCapacity,
      soId: so?.id || 'SO-77201',
      productionOrderId: currentPoId,
      status: isCompleted ? 'COMPLETED' : 'OPEN',
      items: finalItems,
    };

    setBox(loadedBox as any);
    savePackingBox(loadedBox as any);
    await fetchPackingProgress();

    const count = finalItems.length;
    return {
      status: 'accepted' as const,
      message: count > 0
        ? `📦 Box ${code} loaded with ${count} existing items.`
        : `📦 Box ${code} activated — now scan products to pack.`,
      code,
    };
  };

  /* ── Phase 2: Product barcode scan ─────────────────────────── */
  const handleScanProduct = async (code: string) => {
    if (!box) return { status: 'rejected' as const, message: 'Scan a box first!', code };

    if (box.items.length >= box.capacity) {
      return {
        status:  'rejected' as const,
        message: `Box full (${box.capacity}/${box.capacity})! Finish this box first.`,
        code,
      };
    }



    let scanRes: any = null;
    // Try API
    try {
      scanRes = await apiFetch('/api/packing/items/scan', {
        method: 'POST',
        body: JSON.stringify({
          boxId:                  box.boxId,
          boxNumber:              box.boxNumber,
          itemQr:                 code,
          productionOrderId:     po?.dbId || po?.id,
          productionOrderNumber: po?.id || 'PO-2026-0184',
        }),
      });
      if (scanRes?.isDuplicate) {
        return {
          status: 'duplicate' as const,
          message: `⚠️ ${scanRes.message}`,
          code,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err.message?.includes('already packed') || err.message?.includes('ALREADY_PACKED') || err.error === 'ALREADY_PACKED') {
        return {
          status:  'duplicate' as const,
          message: `⚠️ ${errMsg}`,
          code,
        };
      }
      showToast(errMsg, 'error');
      return {
        status: 'rejected' as const,
        message: errMsg,
        code,
      };
    }

    const currentPoId = po?.id || po?.dbId;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const updatedItems = [{ qr: code, scannedAt: timeStr }, ...box.items];
    const isFull = updatedItems.length >= box.capacity;

    const updatedBox: ActiveBox & { productionOrderId?: string } = {
      ...box,
      productionOrderId: currentPoId,
      items:  updatedItems,
      status: isFull ? 'COMPLETED' : 'OPEN',
    };

    setBox(updatedBox as any);
    savePackingBox(updatedBox as any);
    incrementPacked();

    if (scanRes?.progress) {
      setPackProgress({
        loading: false,
        targetQuantity: scanRes.progress.targetQuantity,
        packedCount: scanRes.progress.packedCount,
        remainingToPack: scanRes.progress.remainingToPack,
        totalFailCount: scanRes.progress.totalFailCount || 0,
        operatorStats: {
          operatorName: scanRes.progress.operatorStats?.operatorName || 'Operator',
          packedCount: typeof scanRes.progress.operatorStats?.packedCount === 'number' ? scanRes.progress.operatorStats.packedCount : 0,
          failCount: typeof scanRes.progress.operatorStats?.failCount === 'number' ? scanRes.progress.operatorStats.failCount : 0
        }
      });
    } else {
      await fetchPackingProgress();
    }

    return {
      status:  'accepted' as const,
      message: isFull
        ? `✅ Box ${box.boxNumber} is now FULL (${box.capacity}/${box.capacity})!`
        : `✅ Packed ${code} → ${box.boxNumber} (${updatedItems.length}/${box.capacity})`,
      code,
    };
  };

  /* ── Finish box ─────────────────────────────────────────────── */
  const handleFinishBox = async () => {
    if (!box) return;
    try {
      await apiFetch(`/api/packing/boxes/${box.boxNumber}/finish`, { method: 'POST' });
    } catch { /* offline */ }
    const completed = { ...box, status: 'COMPLETED' as const };
    savePackingBox(completed);
    await fetchPackingProgress();
    showToast(`📦 Box ${box.boxNumber} sealed & saved!`, 'success');
    setShowFinishModal(true);
  };

  /* ── Start new box ──────────────────────────────────────────── */
  const handleStartNewBox = () => {
    setBox(null);
    setShowFinishModal(false);
    showToast('Ready to scan next box barcode.', 'info');
  };

  const isFull = box ? box.items.length >= box.capacity : false;

  if (!po || showPoSelector) {
    return (
      <div className="workflow-container">
        <SelectPOForOperation
          operationName="Packing"
          isModal={true}
          selectedPoId={po?.id || po?.dbId}
          onClose={po ? () => setShowPoSelector(false) : undefined}
          onSelectPo={(selectedPo) => {
            setBox(null);
            setActiveJob({ productionOrder: selectedPo });
            setShowPoSelector(false);
          }}
        />
      </div>
    );
  }

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* PO Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>
                Packing Station • {formatPoDisplayName(po)}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Customer: {po?.customer || 'Standard'} • Map PO: {po?.mapPo || '—'}
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
                Scanner Ready
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Active Scanning & Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* PO Packing Progress & Operator Metrics - Operator Primary */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            {/* PRIMARY / LARGE: Operator Work */}
            <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#3B82F6' }}>
                  MY PACKING PROGRESS — {packProgress.operatorStats.operatorName}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#3B82F6' }}>
                  {Math.round((packProgress.operatorStats.packedCount / (targetSoQty || 1)) * 100)}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Packed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#3B82F6' }}>{packProgress.operatorStats.packedCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Failed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>{packProgress.operatorStats.failCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Processed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-blue)' }}>
                    {packProgress.operatorStats.packedCount + packProgress.operatorStats.failCount}
                  </span>
                </div>
              </div>
              <ProgressBar current={packProgress.operatorStats.packedCount} total={targetSoQty} height={8} color="var(--color-blue)" />
            </div>

            {/* SECONDARY / SMALL: PO Total Summary */}
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>PO TOTAL</span>
              <div style={{ display: 'flex', gap: '12px', color: 'var(--text-primary)', fontWeight: 600, flexWrap: 'wrap' }}>
                <span>Target: <strong>{targetSoQty}</strong></span>
                <span>Packed: <strong style={{ color: '#3B82F6' }}>{packedQty}</strong></span>
                <span>Remaining: <strong style={{ color: 'var(--primary-teal)' }}>{remainingPackQty}</strong></span>
                <span>Overall: <strong>{Math.round((packedQty / (targetSoQty || 1)) * 100)}%</strong></span>
              </div>
            </div>
          </div>

          {!box ? (
            <>
              <div style={styles.phaseBadge}>
                <BoxSelect size={16} color="var(--primary-teal)" />
                <span>Step 1 — Scan Box Barcode</span>
              </div>
              <div style={styles.emptyCard}>
                <BoxSelect size={40} color="var(--text-muted)" />
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '12px' }}>
                  Scan Box QR Code First
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Point scanner at the box barcode to activate it
                </span>
              </div>
              <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
              <ScannerInput onScan={handleScanBox} placeholder="Scan box QR / barcode…" />
            </>
          ) : (
            <>
              <div style={styles.phaseBadge}>
                <Package size={16} color="var(--color-blue)" />
                <span style={{ color: 'var(--color-blue)' }}>Step 2 — Scan Products into Box</span>
              </div>

              <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={styles.cardHeaderTitle}>ACTIVE BOX</span>
                    <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                      {box.boxNumber}
                    </h3>
                  </div>
                  {isFull
                    ? <StatusPill label="Box Full ✅" variant="green" />
                    : <StatusPill label="Packing Active" variant="teal" />}
                </div>

                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    <span>Items Packed</span>
                    <span style={{ fontWeight: 700, color: isFull ? 'var(--color-green)' : 'var(--primary-teal)' }}>
                      {box.items.length} / {box.capacity}
                    </span>
                  </div>
                  <ProgressBar current={box.items.length} total={box.capacity} color={isFull ? 'var(--color-green)' : 'var(--primary-teal)'} />
                </div>
              </div>

              <ScannerInput
                onScan={handleScanProduct}
                disabled={isFull}
                placeholder={isFull ? 'Box full — finish this box first' : 'Scan product QR code to pack…'}
              />

              {box.items.length > 0 && (
                <div>
                  <span style={styles.sectionHeaderTitle}>Recently Packed</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    {box.items.slice(0, 6).map((item, idx) => (
                      <div key={idx} style={styles.itemRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Package size={18} color="var(--primary-teal)" />
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.qr}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <Clock size={12} />
                          <span>{item.scannedAt}</span>
                        </div>
                      </div>
                    ))}
                    {box.items.length > 6 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        +{box.items.length - 6} more items
                      </span>
                    )}
                  </div>
                </div>
              )}

              {box.items.length === 0 && (
                <div style={styles.emptyCard}>
                  <ScanLine size={32} color="var(--text-muted)" />
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    No products packed yet — scan a product QR
                  </span>
                </div>
              )}

              <button
                className="btn-primary"
                style={{
                  marginTop: '8px',
                  background: isFull
                    ? 'linear-gradient(135deg, var(--color-green) 0%, #20E094 100%)'
                    : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                }}
                onClick={handleFinishBox}
              >
                {isFull ? '✅ Finish & Seal Box' : 'Finish Box Early'}
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
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po?.id || 'PO-2026-904'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sales Order:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{so?.id || 'SO-77201'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Standard Box Capacity:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{so?.boxCapacity || 24} items / carton</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Product QR Range:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>
                  {so?.productQrPrefix && so?.productSerialStart != null && so?.productSerialEnd != null
                    ? `${so.productQrPrefix}${so.productSerialStart} → ${so.productQrPrefix}${so.productSerialEnd}`
                    : 'Not configured'}
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              QC TEST INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the box barcode first to open an active packing session.</li>
              <li>Only QC-passed garments inside valid PO range are accepted.</li>
              <li>When carton capacity is reached, click Finish & Seal Box.</li>
              <li>Sealed boxes are immediately dispatched for AQL audit.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Completion Modal */}
      {showFinishModal && box && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={styles.modalIconCircle}>
                <CheckCircle2 size={36} color="var(--color-green)" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, marginTop: '8px' }}>Box Sealed & Saved!</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Box <strong>{box.boxNumber}</strong> with {box.items.length} items is complete.
              </p>
            </div>
            <div style={styles.modalBtnGroup}>
              <button className="btn-primary" onClick={handleStartNewBox}>
                📦 Scan Next Box
              </button>
              <button className="btn-secondary" onClick={() => navigate('/operator/home')}>
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
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
  phaseBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    padding: '6px 12px',
    backgroundColor: 'rgba(22,184,174,0.08)',
    border: '1px solid rgba(22,184,174,0.2)',
    borderRadius: '10px',
    width: 'fit-content',
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
  },
  sectionHeaderTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  itemRow: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '24px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center' as const,
  },
  modalHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  modalIconCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    marginTop: '20px',
  },
};
