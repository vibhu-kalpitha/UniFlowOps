import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { Package, CheckCircle2, Clock, FileText } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const PackingPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeJob, packingBoxes, savePackingBox, incrementPacked, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  // Retrieve Box BX-000218 or active box
  const initialBox = packingBoxes['BX-000218'] || {
    boxNumber: 'BX-000218',
    capacity: 12,
    soId: so?.id || 'SO-77201',
    status: 'OPEN',
    items: [
      { qr: 'PNFLS092632670', scannedAt: '10:25' },
      { qr: 'PNFLS092632671', scannedAt: '10:25' },
      { qr: 'PNFLS092632672', scannedAt: '10:24' },
      { qr: 'PNFLS092632673', scannedAt: '10:24' },
      { qr: 'PNFLS092632674', scannedAt: '10:24' },
      { qr: 'PNFLS092632675', scannedAt: '10:25' },
      { qr: 'PNFLS092632676', scannedAt: '10:25' },
      { qr: 'PNFLS092632677', scannedAt: '10:26' }
    ]
  };

  const [box, setBox] = useState(initialBox);
  const [showFinishModal, setShowFinishModal] = useState(false);

  const handleScanCode = async (code: string) => {
    if (box.items.length >= box.capacity) {
      return {
        status: 'rejected' as const,
        message: 'Box is already full (12/12 items)! Click Finish Box.',
        code,
      };
    }

    try {
      const res = await apiFetch('/api/packing/items/scan', {
        method: 'POST',
        body: JSON.stringify({
          boxNumber: box.boxNumber,
          itemQr: code,
          salesOrderId: so?.id || 'SO-77201',
        }),
      });

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const updatedItems = [{ qr: code, scannedAt: timeStr }, ...box.items];
      const isNowFull = updatedItems.length >= box.capacity;

      const updatedBox = {
        ...box,
        items: updatedItems,
        status: isNowFull ? ('COMPLETED' as const) : ('OPEN' as const)
      };

      setBox(updatedBox);
      savePackingBox(updatedBox);
      incrementPacked();

      return {
        status: 'accepted' as const,
        message: isNowFull
          ? `Box ${box.boxNumber} is now full (12/12)!`
          : `Item ${code} packed into ${box.boxNumber} (${updatedItems.length}/${box.capacity})`,
        code,
      };
    } catch (err: any) {
      return {
        status: 'rejected' as const,
        message: err.message || 'Scan error',
        code,
      };
    }
  };

  const handleFinishBox = async () => {
    try {
      await apiFetch(`/api/packing/boxes/${box.boxNumber}/finish`, {
        method: 'POST',
      });
      const completedBox = { ...box, status: 'COMPLETED' as const };
      savePackingBox(completedBox);
      showToast(`Box ${box.boxNumber} successfully sealed and completed in database!`, 'success');
      setShowFinishModal(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to complete box', 'error');
    }
  };

  const handleStartNewBox = () => {
    const newBoxNum = `BX-${Math.floor(100000 + Math.random() * 900000)}`;
    const newBox = {
      boxNumber: newBoxNum,
      capacity: 12,
      soId: so?.id || 'SO-77201',
      status: 'OPEN' as const,
      items: []
    };
    setBox(newBox);
    savePackingBox(newBox);
    setShowFinishModal(false);
    showToast(`Created new box ${newBoxNum}`, 'info');
  };

  const isFull = box.items.length >= box.capacity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={20} color="var(--primary-teal)" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
              {po?.id || 'PO-2026-0184'} | {so?.id || 'SO-77201'}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {so?.product || 'Running Tee'} — {so?.colour || 'Black'}
            </span>
          </div>
        </div>
      </div>

      {/* Box Info Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={styles.cardHeaderTitle}>BOX NUMBER</span>
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {box.boxNumber}
            </h3>
          </div>
          {isFull ? (
            <StatusPill label="Box Complete" variant="green" />
          ) : (
            <StatusPill label="Packing Active" variant="teal" />
          )}
        </div>

        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
            <span>Items in Box</span>
            <span style={{ fontWeight: 700, color: isFull ? 'var(--color-green)' : 'var(--primary-teal)' }}>
              {box.items.length} / {box.capacity}
            </span>
          </div>
          <ProgressBar current={box.items.length} total={box.capacity} color={isFull ? 'var(--color-green)' : 'var(--primary-teal)'} />
        </div>
      </div>

      {/* Scanner Input Component */}
      <ScannerInput
        onScan={handleScanCode}
        disabled={isFull}
        placeholder="Scan or type garment QR code to pack..."
      />

      {/* Recently Added List */}
      <div>
        <span style={styles.sectionHeaderTitle}>Recently Added</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          {box.items.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px' }}>
              No items scanned into box yet.
            </p>
          ) : (
            box.items.slice(0, 5).map((item, idx) => (
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
            ))
          )}
        </div>
      </div>

      {/* Finish Box Action */}
      <button
        className="btn-primary"
        style={{
          marginTop: '10px',
          background: isFull
            ? 'linear-gradient(135deg, var(--color-green) 0%, #20E094 100%)'
            : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)'
        }}
        onClick={handleFinishBox}
      >
        Finish Box
      </button>

      {/* Completion Modal */}
      {showFinishModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={styles.modalIconCircle}>
                <CheckCircle2 size={36} color="var(--color-green)" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, marginTop: '8px' }}>Box Sealed & Saved</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Box {box.boxNumber} containing {box.items.length} items is completed.
              </p>
            </div>

            <div style={styles.modalBtnGroup}>
              <button className="btn-primary" onClick={handleStartNewBox}>
                Start New Box
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
    padding: '12px 14px'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  scanBox: {
    backgroundColor: 'rgba(22, 184, 174, 0.06)',
    border: '2px dashed var(--primary-teal)',
    borderRadius: '20px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer'
  },
  scanIconWrap: {
    width: '60px',
    height: '60px',
    borderRadius: '18px',
    backgroundColor: 'rgba(22, 184, 174, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '10px'
  },
  scanText: {
    fontSize: '17px',
    fontWeight: 800,
    color: 'var(--text-primary)'
  },
  scanSubText: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '4px'
  },
  sectionHeaderTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  itemRow: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '24px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center'
  },
  modalHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  modalIconCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '20px'
  }
};
