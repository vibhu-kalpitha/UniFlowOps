import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ArrowLeftRight, CheckSquare, Square, Package, CheckCircle2 } from 'lucide-react';
import '../../styles/tokens.css';

export const BoxTransferPage: React.FC = () => {
  const { packingBoxes, savePackingBox, showToast } = useApp();

  const sourceBox = packingBoxes['BX-000218'] || {
    boxNumber: 'BX-000218',
    capacity: 12,
    soId: 'SO-77201',
    status: 'OPEN',
    items: [
      { qr: 'PNFLS092632670', scannedAt: '10:25' },
      { qr: 'PNFLS092632671', scannedAt: '10:25' },
      { qr: 'PNFLS092632672', scannedAt: '10:24' },
      { qr: 'PNFLS092632673', scannedAt: '10:24' }
    ]
  };

  const destBox = packingBoxes['BX-000245'] || {
    boxNumber: 'BX-000245',
    capacity: 12,
    soId: 'SO-77201',
    status: 'OPEN',
    items: [
      { qr: 'PNFLS092639901', scannedAt: '09:12' },
      { qr: 'PNFLS092639902', scannedAt: '09:14' },
      { qr: 'PNFLS092639903', scannedAt: '09:15' }
    ]
  };

  const [selectedItemQrs, setSelectedItemQrs] = useState<string[]>(['PNFLS092632670', 'PNFLS092632671']);

  const toggleSelect = (qr: string) => {
    if (selectedItemQrs.includes(qr)) {
      setSelectedItemQrs(selectedItemQrs.filter(q => q !== qr));
    } else {
      setSelectedItemQrs([...selectedItemQrs, qr]);
    }
  };

  const handleTransfer = async () => {
    if (selectedItemQrs.length === 0) {
      showToast('Select at least one item to transfer.', 'warning');
      return;
    }

    try {
      const { apiFetch } = await import('../../services/api');
      await apiFetch('/api/box-transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromBoxNumber: sourceBox.boxNumber,
          toBoxNumber: destBox.boxNumber,
          itemQrs: selectedItemQrs,
        }),
      });

      const itemsToTransfer = sourceBox.items.filter(i => selectedItemQrs.includes(i.qr));
      const remainingSourceItems = sourceBox.items.filter(i => !selectedItemQrs.includes(i.qr));
      const updatedDestItems = [...itemsToTransfer, ...destBox.items];

      const updatedSource = { ...sourceBox, items: remainingSourceItems };
      const updatedDest = { ...destBox, items: updatedDestItems };

      savePackingBox(updatedSource);
      savePackingBox(updatedDest);

      showToast(`Transferred ${selectedItemQrs.length} items from ${sourceBox.boxNumber} to ${destBox.boxNumber} in database!`, 'success');
      setSelectedItemQrs([]);
    } catch (err: any) {
      showToast(err.message || 'Box transfer failed', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ArrowLeftRight size={22} color="var(--color-orange)" />
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 800 }}>Box Transfer</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Move scanned garments between packing boxes
            </span>
          </div>
        </div>
      </div>

      {/* Source and Destination Box Cards */}
      <div style={styles.boxTransferGrid}>
        {/* Source Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
          <span style={styles.cardHeaderTitle}>FROM BOX</span>
          <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-orange)' }}>
            {sourceBox.boxNumber}
          </h4>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            {sourceBox.items.length} / {sourceBox.capacity} items
          </span>
        </div>

        {/* Transfer Arrow Icon */}
        <div style={styles.arrowWrap}>
          <ArrowLeftRight size={20} color="var(--primary-teal)" />
        </div>

        {/* Dest Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
          <span style={styles.cardHeaderTitle}>TO BOX</span>
          <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)' }}>
            {destBox.boxNumber}
          </h4>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            {destBox.items.length} / {destBox.capacity} items
          </span>
        </div>
      </div>

      {/* Items Selection List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Source Items ({sourceBox.items.length})
          </span>
          <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 700 }}>
            {selectedItemQrs.length} selected
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sourceBox.items.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
              Source box is empty.
            </p>
          ) : (
            sourceBox.items.map(item => {
              const isChecked = selectedItemQrs.includes(item.qr);
              return (
                <div
                  key={item.qr}
                  style={{
                    ...styles.itemCheckCard,
                    borderColor: isChecked ? 'var(--color-orange)' : 'var(--border-color)',
                    backgroundColor: isChecked ? 'rgba(245, 158, 66, 0.08)' : 'var(--bg-surface-1)'
                  }}
                  onClick={() => toggleSelect(item.qr)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isChecked ? (
                      <CheckSquare size={20} color="var(--color-orange)" />
                    ) : (
                      <Square size={20} color="var(--text-muted)" />
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.qr}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.scannedAt}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Transfer Action Button */}
      <button
        className="btn-primary"
        onClick={handleTransfer}
        disabled={selectedItemQrs.length === 0}
        style={{
          marginTop: 'auto',
          background: 'linear-gradient(135deg, var(--color-orange) 0%, #FBBF24 100%)',
          color: '#041820'
        }}
      >
        Transfer {selectedItemQrs.length} Items
      </button>
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
  boxTransferGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '8px'
  },
  cardHeaderTitle: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  arrowWrap: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemCheckCard: {
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer'
  }
};
