import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../services/api';
import { StatusPill } from './StatusPill';
import { 
  Search, X, ScanLine, BoxSelect, CheckCircle2, AlertCircle, Clock, 
  Layers, Package, ShieldCheck, Check, ChevronRight, User, RefreshCw
} from 'lucide-react';
import '../styles/tokens.css';

interface CodeLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  currentPoId?: string;
  onSelectPo?: (poId: string) => void;
}

export const CodeLifecycleModal: React.FC<CodeLifecycleModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  currentPoId,
  onSelectPo
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [notFoundQuery, setNotFoundQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || '');
      setResult(null);
      setNotFoundQuery(null);
      setTimeout(() => inputRef.current?.focus(), 120);
      if (initialQuery && initialQuery.trim()) {
        performLookup(initialQuery.trim());
      }
    }
  }, [isOpen, initialQuery]);

  const performLookup = async (codeToSearch: string) => {
    const q = codeToSearch.trim();
    if (!q) {
      setResult(null);
      setNotFoundQuery(null);
      return;
    }

    setLoading(true);
    setNotFoundQuery(null);

    try {
      const poParam = currentPoId ? `?poId=${encodeURIComponent(currentPoId)}` : '';
      const data = await apiFetch<any>(`/api/lookup/lifecycle/${encodeURIComponent(q)}${poParam}`);
      if (data && (data.type === 'box' || data.type === 'product')) {
        setResult(data);
      } else {
        setResult(null);
        setNotFoundQuery(q);
      }
    } catch (err: any) {
      // Offline fallback: check localStorage for local packing boxes
      try {
        const rawLocal = localStorage.getItem('uniflow_packing_boxes');
        const packingBoxes = rawLocal ? JSON.parse(rawLocal) : {};
        const upper = q.toUpperCase();

        if (packingBoxes[upper] || packingBoxes[q]) {
          const b = packingBoxes[upper] || packingBoxes[q];
          setResult({
            type: 'box',
            boxNumber: b.boxNumber,
            boxCode: b.boxNumber,
            status: b.status || 'OPEN',
            capacity: b.capacity || 12,
            totalItems: (b.items || []).length,
            poNumber: b.soId || 'Local Box',
            style: 'Local Packing Session',
            items: (b.items || []).map((it: any) => ({
              qr: it.qr,
              size: it.size || 'L',
              status: 'PACKED',
              qcResult: 'PASSED',
              packedAt: it.scannedAt
            }))
          });
          return;
        }

        // Check if QR is inside any local box
        const foundBox = Object.values(packingBoxes).find((bx: any) =>
          (bx.items || []).some((i: any) => i.qr && i.qr.toUpperCase() === upper)
        ) as any;

        if (foundBox) {
          const item = foundBox.items.find((i: any) => i.qr.toUpperCase() === upper);
          setResult({
            type: 'product',
            qr: q,
            poNumber: foundBox.soId || 'Current Order',
            style: 'Garment Style',
            stages: {
              preQc: { status: 'PASSED' },
              qc: { status: 'PASSED' },
              packing: { status: 'PACKED', boxNumber: foundBox.boxNumber, packedAt: item?.scannedAt },
              normalAql: { status: 'REMAIN' },
              finalAql: { status: 'REMAIN' }
            }
          });
          return;
        }
      } catch (e) {
        // ignore
      }

      setResult(null);
      setNotFoundQuery(q);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performLookup(query);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface-1)',
        borderRadius: '18px',
        border: '1.5px solid var(--border-color)',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface-2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScanLine size={20} color="var(--primary-teal)" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Scan & Lifecycle Lookup
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Input Bar */}
        <div style={{ padding: '16px 20px 12px 20px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={18}
              color="var(--text-secondary)"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan or type Product QR / Box Barcode…"
              style={{
                width: '100%',
                height: '46px',
                borderRadius: '12px',
                border: '1.5px solid var(--primary-teal)',
                backgroundColor: 'var(--bg-surface-2)',
                color: 'var(--text-primary)',
                fontSize: '15px',
                fontWeight: 700,
                paddingLeft: '40px',
                paddingRight: '40px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setResult(null); setNotFoundQuery(null); inputRef.current?.focus(); }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Press <strong>Enter</strong> or scan with barcode reader
            </span>
            <button
              type="button"
              onClick={() => performLookup(query)}
              disabled={loading || !query.trim()}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: 'rgba(22, 184, 174, 0.15)',
                border: '1px solid var(--primary-teal)',
                color: 'var(--primary-teal)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {loading ? <RefreshCw size={12} className="spin" /> : <Search size={12} />} Search
            </button>
          </div>
        </div>

        {/* Modal Body / Results */}
        <div style={{ padding: '0 20px 20px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loading && (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--primary-teal)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={24} className="spin" />
              <span style={{ fontSize: '13px', fontWeight: 700 }}>Querying database lifecycle records…</span>
            </div>
          )}

          {/* ── PRODUCT RESULT ── */}
          {!loading && result && result.type === 'product' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Product Header Card */}
              <div style={{
                backgroundColor: 'rgba(22, 184, 174, 0.08)',
                border: '1.5px solid var(--primary-teal)',
                borderRadius: '14px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Package size={18} color="var(--primary-teal)" />
                      <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em' }}>
                        {result.qr}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>PO: <strong>{result.poNumber}</strong></span>
                      {result.style && <span>• Style: <strong>{result.style}</strong></span>}
                      {result.size && <span>• Size: <strong>{result.size}</strong></span>}
                    </div>
                  </div>
                  <StatusPill
                    label={result.isUnscanned ? 'Unscanned / In Range' : 'Product Tracked'}
                    variant={result.isUnscanned ? 'amber' : 'green'}
                  />
                </div>
              </div>

              {/* Stages Stepper Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Workflow Stage Lifecycle:
                </span>

                {/* 1. Pre-QC */}
                <StageCard
                  stageName="Pre-QC Inspection"
                  status={result.stages?.preQc?.status || 'REMAIN'}
                  time={result.stages?.preQc?.scannedAt}
                  detail={result.stages?.preQc?.failureReason ? `Defect: ${result.stages.preQc.failureReason}` : undefined}
                />

                {/* 2. QC Test */}
                <StageCard
                  stageName="QC Test"
                  status={result.stages?.qc?.status || 'REMAIN'}
                  time={result.stages?.qc?.scannedAt}
                  operator={result.stages?.qc?.operatorName}
                  detail={result.stages?.qc?.failureReason ? `Defect: ${result.stages.qc.failureReason}` : undefined}
                />

                {/* 3. Packing */}
                <StageCard
                  stageName="Packing"
                  status={result.stages?.packing?.status || 'REMAIN'}
                  time={result.stages?.packing?.packedAt}
                  operator={result.stages?.packing?.packedBy}
                  boxNumber={result.stages?.packing?.boxNumber}
                />

                {/* 4. Normal AQL */}
                <StageCard
                  stageName="Normal AQL"
                  status={result.stages?.normalAql?.status || 'REMAIN'}
                  time={result.stages?.normalAql?.scannedAt}
                  boxNumber={result.stages?.normalAql?.boxNumber}
                />

                {/* 5. Final AQL */}
                <StageCard
                  stageName="Final AQL"
                  status={result.stages?.finalAql?.status || 'REMAIN'}
                  time={result.stages?.finalAql?.scannedAt}
                  boxNumber={result.stages?.finalAql?.boxNumber}
                />
              </div>
            </div>
          )}

          {/* ── BOX RESULT ── */}
          {!loading && result && result.type === 'box' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Box Header Card */}
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1.5px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '14px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BoxSelect size={20} color="#3b82f6" />
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {result.boxNumber}
                    </span>
                  </div>
                  <StatusPill
                    label={result.status === 'COMPLETED' ? 'Sealed' : result.status}
                    variant={result.status === 'COMPLETED' || result.status?.includes('PASSED') ? 'green' : 'blue'}
                  />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>PO: <strong>{result.poNumber}</strong></span>
                  <span>• Style: <strong>{result.style}</strong></span>
                  <span>• Capacity: <strong>{result.totalItems} / {result.capacity}</strong></span>
                </div>
              </div>

              {/* Products inside box */}
              <div style={{
                backgroundColor: 'var(--bg-surface-2)',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Products Inside Box ({result.items?.length || 0})
                  </span>
                  {(result.items?.length || 0) > 4 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Scroll to view all</span>
                  )}
                </div>

                {(!result.items || result.items.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No products currently packed in this box.
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    paddingRight: '4px'
                  }}>
                    {result.items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          backgroundColor: 'var(--bg-surface-1)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', width: '18px' }}>
                            {idx + 1}.
                          </span>
                          <Package size={14} color="var(--primary-teal)" />
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.qr}
                          </span>
                          {item.size && (
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}>
                              {item.size}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: item.qcResult === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: item.qcResult === 'PASSED' ? '#10B981' : '#F59E0B'
                          }}>
                            QC {item.qcResult || 'PASS'}
                          </span>
                          {item.packedAt && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {item.packedAt.length > 8 ? item.packedAt.substring(11, 16) : item.packedAt}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── NOT FOUND RESULT ── */}
          {!loading && notFoundQuery && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1.5px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '14px',
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={32} color="#EF4444" />
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Code Not Found
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '340px' }}>
                "{notFoundQuery}" does not match any registered Box barcode or Product QR in the system.
              </div>
            </div>
          )}

          {/* ── IDLE STATE ── */}
          {!loading && !result && !notFoundQuery && (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
              <ScanLine size={36} color="var(--primary-teal)" style={{ opacity: 0.7, marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Scan a barcode or enter code to inspect lifecycle
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Supports Garment Product QRs and Box Transfer Barcodes
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StageCardProps {
  stageName: string;
  status: string;
  time?: string | null;
  operator?: string | null;
  boxNumber?: string | null;
  detail?: string | null;
}

const StageCard: React.FC<StageCardProps> = ({
  stageName,
  status,
  time,
  operator,
  boxNumber,
  detail
}) => {
  const normStatus = (status || '').toUpperCase();
  const isPassed = normStatus === 'PASSED' || normStatus === 'PASS' || normStatus === 'PACKED';
  const isFailed = normStatus === 'FAILED' || normStatus === 'FAIL';
  const isRemain = !isPassed && !isFailed;

  const badgeBg = isPassed ? 'rgba(16, 185, 129, 0.15)' : isFailed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.12)';
  const badgeColor = isPassed ? '#10B981' : isFailed ? '#EF4444' : '#94A3B8';
  const badgeBorder = isPassed ? '1px solid rgba(16, 185, 129, 0.3)' : isFailed ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)';
  const labelText = isPassed ? (stageName === 'Packing' ? 'Packed ✅' : 'Passed ✅') : isFailed ? 'Failed ❌' : 'Remain ⏳';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'var(--bg-surface-2)',
      borderRadius: '10px',
      padding: '10px 14px',
      border: '1px solid var(--border-color)',
      gap: '10px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: badgeColor,
          fontWeight: 800,
          fontSize: '12px'
        }}>
          {isPassed ? '✓' : isFailed ? '✕' : '•'}
        </div>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
            {stageName}
          </span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {boxNumber && (
              <span style={{ color: '#3b82f6', fontWeight: 700 }}>Box: {boxNumber}</span>
            )}
            {operator && <span>By: {operator}</span>}
            {time && <span>@ {time.length > 8 ? time.substring(11, 16) : time}</span>}
            {detail && <span style={{ color: '#EF4444' }}>{detail}</span>}
          </div>
        </div>
      </div>

      <span style={{
        fontSize: '11px',
        fontWeight: 800,
        padding: '3px 8px',
        borderRadius: '6px',
        backgroundColor: badgeBg,
        color: badgeColor,
        border: badgeBorder,
        whiteSpace: 'nowrap'
      }}>
        {labelText}
      </span>
    </div>
  );
};
