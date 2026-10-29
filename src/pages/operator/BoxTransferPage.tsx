import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeftRight,
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Package,
  Search
} from 'lucide-react';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { formatPoDisplayName } from '../../utils/formatters';
import { DueDateBadge } from '../../components/DueDateBadge';
import { StatusPill } from '../../components/StatusPill';
import '../../styles/tokens.css';

interface BoxData {
  id: string;
  isNew?: boolean;
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
    config_code?: string;
    product_type?: string;
    packed_at?: string;
  }>;
}

export const BoxTransferPage: React.FC = () => {
  const { activeJob, setActiveJob, showToast } = useApp();
  const po = activeJob?.productionOrder;
  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);

  const [sourceInput, setSourceInput] = useState('');
  const [destInput, setDestInput] = useState('');

  const [sourceBox, setSourceBox] = useState<BoxData | null>(null);
  const [destBox, setDestBox] = useState<BoxData | null>(null);

  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingDest, setLoadingDest] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItemQrs, setSelectedItemQrs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemSearchFilter, setItemSearchFilter] = useState('');

  const resolveBox = async (val: string, options?: { isDestination?: boolean; sourceBoxCode?: string }): Promise<BoxData> => {
    const { apiFetch } = await import('../../services/api');
    const res = await apiFetch<{ box: BoxData }>('/api/boxes/resolve', {
      method: 'POST',
      body: JSON.stringify({
        value: val.trim(),
        isDestination: options?.isDestination,
        sourceBoxCode: options?.sourceBoxCode,
        productionOrderId: po?.dbId || po?.id
      }),
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
      const box = await resolveBox(destInput, {
        isDestination: true,
        sourceBoxCode: sourceBox?.boxCode || sourceBox?.boxNumber
      });
      setDestBox(box);
      if (box.isNew) {
        showToast(`New empty box ${box.boxCode} ready as destination`, 'info');
      } else {
        showToast(`Destination box ${box.boxCode || box.boxNumber} loaded`, 'success');
      }
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

  const filteredSourceItems = (sourceBox?.items || []).filter(item => {
    if (!itemSearchFilter.trim()) return true;
    const q = itemSearchFilter.toLowerCase();
    return (item.qr_code || '').toLowerCase().includes(q) ||
      (item.size || '').toLowerCase().includes(q) ||
      (item.config_code || '').toLowerCase().includes(q) ||
      (item.product_type || '').toLowerCase().includes(q);
  });

  const handleSelectAll = () => {
    if (!destBox) {
      showToast('Please resolve a destination box first.', 'warning');
      return;
    }
    const maxAvailable = destBox.availableSpace;
    const eligibleQrs = filteredSourceItems.map(i => i.qr_code).slice(0, maxAvailable);
    setSelectedItemQrs(eligibleQrs);
    if (filteredSourceItems.length > maxAvailable) {
      showToast(`Selected first ${maxAvailable} item(s) up to destination capacity.`, 'info');
    }
  };

  const handleDeselectAll = () => {
    setSelectedItemQrs([]);
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
      const updatedDest = await resolveBox(destBox.boxCode || destBox.boxNumber, {
        isDestination: true,
        sourceBoxCode: updatedSource?.boxCode || updatedSource?.boxNumber
      });

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

  // PO Selection Dialog
  if (!po || showPoSelector) {
    return (
      <div className="workflow-container">
        <SelectPOForOperation
          operationName="Box Transfer"
          isModal={true}
          selectedPoId={po?.id || po?.dbId}
          onClose={po ? () => setShowPoSelector(false) : undefined}
          onSelectPo={(selectedPo, selectedLine) => {
            setSourceBox(null);
            setDestBox(null);
            setSourceInput('');
            setDestInput('');
            setSelectedItemQrs([]);
            setActiveJob({ productionOrder: selectedPo, selectedLine });
            setShowPoSelector(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Active PO Banner */}
      <div style={styles.banner}>
        <div className="op-top-banner" style={{ gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span>Box Transfer Station • {formatPoDisplayName(po)}</span>
                {activeJob?.selectedLine && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(20, 184, 166, 0.15)',
                    color: 'var(--primary-teal)',
                    border: '1px solid rgba(20, 184, 166, 0.3)'
                  }}>
                    {activeJob.selectedLine}
                  </span>
                )}
                <DueDateBadge dueDate={po?.dueDate || (po as any)?.due_date} />
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Customer: {po?.customer || 'Standard'} • Map PO: {po?.mapPo || '—'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowPoSelector(true)}
              className="btn btn-secondary"
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <ArrowLeftRight size={13} /> Switch PO
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} color="var(--color-green)" />
              <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: 700 }}>
                Scanner Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert Box if any */}
      {errorMessage && (
        <div style={styles.errorBanner}>
          <AlertTriangle size={18} color="var(--color-red)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-red)' }}>{errorMessage}</span>
        </div>
      )}

      {/* Grid: Source Box & Destination Box Cards */}
      <div style={styles.boxesGrid}>
        {/* Source Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '14px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={styles.cardHeaderTitle}>SOURCE BOX</span>
            {sourceBox && (
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-orange)', backgroundColor: 'rgba(245, 158, 66, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                {sourceBox.activeCount} Items
              </span>
            )}
          </div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
            Scan or enter Source Box QR / Number
          </label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              className="input"
              value={sourceInput}
              onChange={e => setSourceInput(e.target.value)}
              placeholder="Scan source box barcode..."
              style={{ fontSize: '13px', padding: '7px 10px', flex: 1 }}
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
              style={{ padding: '7px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              {loadingSource ? 'Loading...' : 'Load Box'}
            </button>
          </div>

          {sourceBox && (
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-orange)', margin: 0 }}>
                  {sourceBox.boxCode}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Ref: {sourceBox.boxNumber}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                PO: {sourceBox.poNumber || 'N/A'} {sourceBox.soNumber ? `| SO: ${sourceBox.soNumber}` : ''}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                Capacity: {sourceBox.activeCount} / {sourceBox.capacity} items packed
              </span>
            </div>
          )}
        </div>

        {/* Transfer Arrow Icon */}
        <div style={styles.arrowWrap}>
          <ArrowLeftRight size={22} color="var(--primary-teal)" />
        </div>

        {/* Destination Box */}
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '14px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={styles.cardHeaderTitle}>DESTINATION BOX</span>
            {destBox && (
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                color: destBox.availableSpace > 0 ? '#10B981' : '#EF4444',
                backgroundColor: destBox.availableSpace > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                padding: '2px 8px',
                borderRadius: '6px'
              }}>
                {destBox.availableSpace} Slots Available
              </span>
            )}
          </div>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
            Scan or enter Destination Box QR / Number
          </label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              className="input"
              value={destInput}
              onChange={e => setDestInput(e.target.value)}
              placeholder="Scan destination box barcode..."
              style={{ fontSize: '13px', padding: '7px 10px', flex: 1 }}
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
              style={{ padding: '7px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              {loadingDest ? 'Loading...' : 'Load Box'}
            </button>
          </div>

          {destBox && (
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary-teal)', margin: 0 }}>
                  {destBox.boxCode}
                </h4>
                {destBox.isNew ? (
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#10B981', backgroundColor: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                    NEW EMPTY BOX
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Ref: {destBox.boxNumber}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                PO: {destBox.poNumber || 'N/A'} {destBox.soNumber ? `| SO: ${destBox.soNumber}` : ''}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                Current: {destBox.activeCount} / {destBox.capacity} | Remaining Space: {destBox.availableSpace} slots
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Items Tables Grid (Source Box & Destination Box) */}
      <div style={{ display: 'grid', gridTemplateColumns: destBox ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : '1fr', gap: '14px' }}>
        {/* Source Items Table */}
        <div style={{
          backgroundColor: 'var(--bg-surface-1)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Table Header Controls */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            backgroundColor: 'var(--bg-surface-2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={17} color="var(--color-orange)" />
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                Source Box Items ({sourceBox?.items.length || 0})
              </span>
              {destBox && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: selectedItemQrs.length > 0 ? 'rgba(245, 158, 66, 0.2)' : 'var(--bg-surface-3)',
                  color: selectedItemQrs.length > 0 ? 'var(--color-orange)' : 'var(--text-muted)'
                }}>
                  {selectedItemQrs.length} of {destBox.availableSpace} slots selected
                </span>
              )}
            </div>

            {sourceBox && sourceBox.items.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Filter QR or size..."
                    value={itemSearchFilter}
                    onChange={e => setItemSearchFilter(e.target.value)}
                    style={{
                      padding: '4px 8px 4px 26px',
                      fontSize: '11px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-surface-1)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      width: '130px'
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  disabled={!destBox || destBox.availableSpace <= 0}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    backgroundColor: 'rgba(20, 184, 166, 0.15)',
                    border: '1px solid var(--primary-teal)',
                    color: 'var(--primary-teal)',
                    cursor: 'pointer'
                  }}
                  title="Select all eligible items up to destination capacity"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  disabled={selectedItemQrs.length === 0}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-surface-3)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Table View */}
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {!sourceBox ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Please scan or enter a source box barcode above.
              </div>
            ) : sourceBox.items.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Source box is empty. No active packed items available for transfer.
              </div>
            ) : filteredSourceItems.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No items match "{itemSearchFilter}"
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 10px', width: '38px', textAlign: 'center' }}>SEL</th>
                    <th style={{ padding: '8px 10px', width: '32px' }}>#</th>
                    <th style={{ padding: '8px 10px' }}>Product QR / Serial</th>
                    <th style={{ padding: '8px 10px' }}>Size</th>
                    <th style={{ padding: '8px 10px' }}>Config</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Packed At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSourceItems.map((item, idx) => {
                    const isChecked = selectedItemQrs.includes(item.qr_code);
                    return (
                      <tr
                        key={item.qr_code}
                        onClick={() => toggleSelect(item.qr_code)}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          backgroundColor: isChecked ? 'rgba(245, 158, 66, 0.12)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {isChecked ? (
                            <CheckSquare size={17} color="var(--color-orange)" />
                          ) : (
                            <Square size={17} color="var(--text-muted)" />
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {item.qr_code}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(20, 184, 166, 0.15)',
                            color: 'var(--primary-teal)',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            {item.size || 'STD'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                          {item.config_code || item.product_type || 'GARMENT'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <StatusPill label={item.status || 'PACKED'} variant="green" />
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {item.packed_at ? new Date(item.packed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Destination Items Table */}
        {destBox && (
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Table Header Controls */}
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={17} color="var(--primary-teal)" />
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                  Destination Box Items ({destBox.items.length})
                </span>
              </div>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: destBox.availableSpace > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: destBox.availableSpace > 0 ? '#10B981' : '#EF4444'
              }}>
                {destBox.availableSpace} slot(s) free
              </span>
            </div>

            {/* Scrollable Table View */}
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {destBox.items.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Destination box is empty. Ready to receive items.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px', width: '32px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Product QR / Serial</th>
                      <th style={{ padding: '8px 10px' }}>Size</th>
                      <th style={{ padding: '8px 10px' }}>Config</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Packed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destBox.items.map((item, idx) => (
                      <tr
                        key={item.qr_code}
                        style={{ borderBottom: '1px solid var(--border-color)' }}
                      >
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {item.qr_code}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(20, 184, 166, 0.15)',
                            color: 'var(--primary-teal)',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            {item.size || 'STD'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                          {item.config_code || item.product_type || 'GARMENT'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <StatusPill label={item.status || 'PACKED'} variant="green" />
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {item.packed_at ? new Date(item.packed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          padding: '14px',
          fontWeight: 800,
          fontSize: '15px',
          borderRadius: '12px',
          boxShadow: '0 4px 14px rgba(245, 158, 66, 0.35)'
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
  boxesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '12px'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  arrowWrap: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1.5px solid var(--primary-teal)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 12px rgba(20, 184, 166, 0.2)'
  }
};
