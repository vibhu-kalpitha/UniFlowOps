import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { Package, CheckCircle2, Clock, FileText, BoxSelect, ScanLine } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { isCodeInRange } from '../../utils/rangeValidation';
import '../../styles/tokens.css';

interface BoxItem {
  qr: string;
  scannedAt: string;
}

interface ActiveBox {
  boxNumber: string;
  capacity: number;
  soId: string;
  status: 'OPEN' | 'COMPLETED';
  items: BoxItem[];
}

export const PackingPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeJob, savePackingBox, incrementPacked, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const rangeStart = po?.boxRangeStart || '';
  const rangeEnd   = po?.boxRangeEnd   || '';

  // Phase 1: scan box QR
  const [box, setBox] = useState<ActiveBox | null>(null);
  const [showFinishModal, setShowFinishModal] = useState(false);

  /* ── Phase 1: Box barcode scan ─────────────────────────────── */
  const handleScanBox = async (code: string) => {
    const newBox: ActiveBox = {
      boxNumber: code,
      capacity:  so?.boxCapacity || 12,
      soId:      so?.id || 'SO-77201',
      status:    'OPEN',
      items:     [],
    };
    setBox(newBox);
    savePackingBox(newBox);
    return {
      status:  'accepted' as const,
      message: `📦 Box ${code} activated — now scan products to pack.`,
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

    // Range check
    if (rangeStart && rangeEnd && !isCodeInRange(code, rangeStart, rangeEnd)) {
      return {
        status:  'rejected' as const,
        message: `❌ Out of Range! (${code}) not in PO range: ${rangeStart} → ${rangeEnd}`,
        code,
      };
    }

    // Duplicate check inside this box
    if (box.items.some(i => i.qr === code)) {
      return {
        status:  'duplicate' as const,
        message: `⚠️ Already packed in this box: ${code}`,
        code,
      };
    }

    // Try API
    try {
      await apiFetch('/api/packing/items/scan', {
        method: 'POST',
        body: JSON.stringify({
          boxNumber:      box.boxNumber,
          itemQr:         code,
          salesOrderNumber: so?.id || 'SO-77201',
        }),
      });
    } catch { /* offline: continue */ }

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const updatedItems = [{ qr: code, scannedAt: timeStr }, ...box.items];
    const isFull = updatedItems.length >= box.capacity;

    const updatedBox: ActiveBox = {
      ...box,
      items:  updatedItems,
      status: isFull ? 'COMPLETED' : 'OPEN',
    };

    setBox(updatedBox);
    savePackingBox(updatedBox);
    incrementPacked();

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

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* PO/SO Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={20} color="var(--primary-teal)" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
              {po?.id || '—'} | {so?.id || '—'}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {so?.product || '—'} — {so?.colour || '—'}
              {rangeStart && rangeEnd && (
                <span style={{ marginLeft: '8px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                  • Range: {rangeStart} → {rangeEnd}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── PHASE 1: No box scanned yet ── */}
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
          <ScannerInput onScan={handleScanBox} placeholder="Scan box QR / barcode…" />
        </>
      ) : (
        /* ── PHASE 2: Box active — scan products ── */
        <>
          <div style={styles.phaseBadge}>
            <Package size={16} color="var(--color-blue)" />
            <span style={{ color: 'var(--color-blue)' }}>Step 2 — Scan Products into Box</span>
          </div>

          {/* Box Info */}
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

          {/* Product Scanner */}
          <ScannerInput
            onScan={handleScanProduct}
            disabled={isFull}
            placeholder={isFull ? 'Box full — finish this box first' : 'Scan product QR code to pack…'}
          />

          {/* Recently Packed */}
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

          {/* Empty state in phase 2 */}
          {box.items.length === 0 && (
            <div style={styles.emptyCard}>
              <ScanLine size={32} color="var(--text-muted)" />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                No products packed yet — scan a product QR
              </span>
            </div>
          )}

          {/* Finish Box */}
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
