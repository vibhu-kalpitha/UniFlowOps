import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ArrowLeftRight, CheckSquare, Square, QrCode, AlertTriangle } from 'lucide-react';
import { ScannerStatus } from '../../components/ScannerStatus';
import '../../styles/tokens.css';

interface BoxData {
  id: string;
  boxCode: string;
  boxNumber: string;
  productionOrderId: string;
  poNumber: string;
  salesOrderId: string;
  soNumber: string;
  capacity: number;
  activeCount: number;
  availableSpace: number;
  status: string;
  items: Array<{
    box_item_id: string;
    item_id: string;
    qr_code: string;
    size: string;
    status: string;
    packed_at?: string;
  }>;
}

export const BoxTransferPage: React.FC = () => {
  const { showToast } = useApp();

  const [sourceInput, setSourceInput] = useState('');
  const [destInput, setDestInput] = useState('');

  const [sourceBox, setSourceBox] = useState<BoxData | null>(null);
  const [destBox, setDestBox] = useState<BoxData | null>(null);

  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingDest, setLoadingDest] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItemQrs, setSelectedItemQrs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolveBox = async (val: string): Promise<BoxData> => {
    const { apiFetch } = await import('../../services/api');
    const res = await apiFetch<{ box: BoxData }>('/api/boxes/resolve', {
      method: 'POST',
      body: JSON.stringify({ value: val.trim() }),
    });
    return res.box;
  };

  const handleLoadSource = async () => {
    if (!sourceInput.trim() || loadingSource) return;
    setLoadingSource(true);
    setErrorMessage(null);
    try {
      const box = await resolveBox(sourceInput);
      setSourceBox(box);
      setSelectedItemQrs([]);
      showToast(`Source box ${box.boxCode || box.boxNumber} loaded`, 'success');
    } catch (err: any) {
      setSourceBox(null);
      const msg = err.message || 'Failed to resolve source box';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingSource(false);
    }
  };

  const handleLoadDest = async () => {
    if (!destInput.trim() || loadingDest) return;
    setLoadingDest(true);
    setErrorMessage(null);
    try {
      const box = await resolveBox(destInput);
      setDestBox(box);
      showToast(`Destination box ${box.boxCode || box.boxNumber} loaded`, 'success');
    } catch (err: any) {
      setDestBox(null);
      const msg = err.message || 'Failed to resolve destination box';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingDest(false);
    }
  };

  const toggleSelect = (qr: string) => {
    if (!destBox) {
      const msg = 'Please resolve a destination box first.';
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return;
    }
    if (selectedItemQrs.includes(qr)) {
      setSelectedItemQrs(selectedItemQrs.filter(q => q !== qr));
    } else {
      if (selectedItemQrs.length >= destBox.availableSpace) {
        const msg = `Destination box only has ${destBox.availableSpace} available slot(s) remaining.`;
        setErrorMessage(msg);
        showToast(msg, 'warning');
        return;
      }
      setSelectedItemQrs([...selectedItemQrs, qr]);
    }
  };

  const handleTransfer = async () => {
    if (!sourceBox || !destBox) {
      const msg = 'Both source and destination boxes must be loaded.';
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return;
    }
    if (selectedItemQrs.length === 0) {
      const msg = 'Select at least one item to transfer.';
      setErrorMessage(msg);
      showToast(msg, 'warning');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { apiFetch } = await import('../../services/api');
      const res = await apiFetch<{
        message: string;
        sourceActiveCount: number;
        destinationActiveCount: number;
      }>('/api/box-transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromBoxNumber: sourceBox.boxCode || sourceBox.boxNumber,
          toBoxNumber: destBox.boxCode || destBox.boxNumber,
          itemQrs: selectedItemQrs,
        }),
      });

      showToast(res.message || 'Transfer completed successfully!', 'success');

      // Refresh both box states seamlessly
      const updatedSource = await resolveBox(sourceBox.boxCode || sourceBox.boxNumber);
      const updatedDest = await resolveBox(destBox.boxCode || destBox.boxNumber);

      setSourceBox(updatedSource);
      setDestBox(updatedDest);
      setSelectedItemQrs([]);
    } catch (err: any) {
      const msg = err.message || 'Box transfer failed';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ArrowLeftRight size={22} color="var(--color-orange)" />
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>Box Transfer</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Scan QR code or type box number to transfer active packed garments
            </span>
          </div>
        </div>
      </div>

      {/* Error Message Display Banner */}
      {errorMessage && (
        <div style={styles.errorBanner}>
          <AlertTriangle size={18} color="#EF4444" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444' }}>
            {errorMessage}
          </span>
        </div>
      )}

      {/* Scanner Status */}
      <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />

      {/* Source and Destination Box Resolution Inputs */}
      <div style={styles.boxTransferGrid}>
        {/* Source Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '12px' }}>
          <span style={styles.cardHeaderTitle}>SOURCE BOX</span>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            Source Box QR or Box Number
          </label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              className="input"
              value={sourceInput}
              onChange={e => setSourceInput(e.target.value)}
              placeholder="Scan or type box number..."
              style={{ fontSize: '13px', padding: '6px 10px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoadSource();
                }
              }}
            />
            <button
              className="btn-secondary"
              onClick={handleLoadSource}
              disabled={loadingSource || !sourceInput.trim()}
              style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              {loadingSource ? '...' : 'Load Source Box'}
            </button>
          </div>

          {sourceBox && (
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-orange)', margin: 0 }}>
                  {sourceBox.boxCode}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Ref: {sourceBox.boxNumber}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                PO: {sourceBox.poNumber || 'N/A'} | SO: {sourceBox.soNumber || 'N/A'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                Active Items: {sourceBox.activeCount} / {sourceBox.capacity} capacity
              </span>
            </div>
          )}
        </div>

        {/* Transfer Arrow Icon */}
        <div style={styles.arrowWrap}>
          <ArrowLeftRight size={20} color="var(--primary-teal)" />
        </div>

        {/* Destination Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '12px' }}>
          <span style={styles.cardHeaderTitle}>DESTINATION BOX</span>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            Destination Box QR or Box Number
          </label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              className="input"
              value={destInput}
              onChange={e => setDestInput(e.target.value)}
              placeholder="Scan or type box number..."
              style={{ fontSize: '13px', padding: '6px 10px' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoadDest();
                }
              }}
            />
            <button
              className="btn-secondary"
              onClick={handleLoadDest}
              disabled={loadingDest || !destInput.trim()}
              style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              {loadingDest ? '...' : 'Load Dest Box'}
            </button>
          </div>

          {destBox && (
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-teal)', margin: 0 }}>
                  {destBox.boxCode}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Ref: {destBox.boxNumber}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                PO: {destBox.poNumber || 'N/A'} | SO: {destBox.soNumber || 'N/A'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                Occupied: {destBox.activeCount} / {destBox.capacity} | Available: {destBox.availableSpace} slots
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Items Selection & Preview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: destBox ? '1fr 1fr' : '1fr', gap: '12px' }}>
        {/* Active Source Items Selection List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Source Products ({sourceBox?.items.length || 0})
            </span>
            <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 700 }}>
              {selectedItemQrs.length} of {destBox?.availableSpace ?? 0} slots selected
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {!sourceBox ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                Please scan or enter a valid source box.
              </p>
            ) : sourceBox.items.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                Source box is empty. No active items available.
              </p>
            ) : (
              sourceBox.items.map(item => {
                const isChecked = selectedItemQrs.includes(item.qr_code);
                return (
                  <div
                    key={item.qr_code}
                    style={{
                      ...styles.itemCheckCard,
                      borderColor: isChecked ? 'var(--color-orange)' : 'var(--border-color)',
                      backgroundColor: isChecked ? 'rgba(245, 158, 66, 0.08)' : 'var(--bg-surface-1)'
                    }}
                    onClick={() => toggleSelect(item.qr_code)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {isChecked ? (
                        <CheckSquare size={18} color="var(--color-orange)" />
                      ) : (
                        <Square size={18} color="var(--text-muted)" />
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {item.qr_code}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                      Size {item.size}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Destination Active Items List Preview */}
        {destBox && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Destination Active Items ({destBox.items.length})
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Space: {destBox.availableSpace} left
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {destBox.items.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  Destination box currently has no items.
                </p>
              ) : (
                destBox.items.map(item => (
                  <div key={item.qr_code} style={{ ...styles.itemCheckCard, cursor: 'default', backgroundColor: 'var(--bg-surface-1)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.qr_code}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                      Size {item.size}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transfer Action Button */}
      <button
        className="btn-primary"
        onClick={handleTransfer}
        disabled={selectedItemQrs.length === 0 || isSubmitting}
        style={{
          marginTop: 'auto',
          background: 'linear-gradient(135deg, var(--color-orange) 0%, #FBBF24 100%)',
          color: '#041820',
          padding: '12px',
          fontWeight: 800,
          fontSize: '15px'
        }}
      >
        {isSubmitting ? 'Processing Transfer...' : `Transfer ${selectedItemQrs.length} Selected Item(s)`}
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
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
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
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer'
  }
};
