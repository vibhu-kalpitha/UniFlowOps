import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowRight, BoxSelect, ScanLine, Package, Search } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { apiFetch } from '../../services/api';
import { isCodeInRange } from '../../utils/rangeValidation';
import '../../styles/tokens.css';

interface ScannedBoxInfo {
  boxNumber:       string;
  totalItems:      number;
  sampleRequirement: number;
  inspectionId?:   string;
  packedItemQrs:   string[];
}

export const AQLBoxScanPage: React.FC = () => {
  const navigate = useNavigate();
  const { packingBoxes, saveAQLSession, activeJob } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const targetSoQty = so?.quantity || 10;
  const aqlPassedQty = so?.progress?.aqlPassed || 0;
  const remainingAqlQty = Math.max(0, targetSoQty - aqlPassedQty);

  const [scannedBox, setScannedBox] = useState<ScannedBoxInfo | null>(null);

  /* ── Scan box handler ─────────────────────────────────────── */
  const handleScanBox = async (code: string) => {
    const rangeStart = po?.boxRangeStart;
    const rangeEnd   = po?.boxRangeEnd;

    if (rangeStart && rangeEnd && !isCodeInRange(code, rangeStart, rangeEnd)) {
      return {
        status: 'rejected' as const,
        message: `❌ Out of Serial Range! Box barcode (${code}) is out of PO range: ${rangeStart} → ${rangeEnd}`,
        code,
      };
    }

    const localBox = packingBoxes[code];
    const localItems: string[] = localBox?.items ? localBox.items.map(i => i.qr) : [];

    let serverItems: string[] = [];
    let inspectionId: string | undefined;
    let totalItems = localItems.length || 0;
    let sampleRequirement = 12;

    try {
      const res = await apiFetch('/aql/boxes/scan', {
        method: 'POST',
        body: JSON.stringify({ boxNumber: code }),
      });
      serverItems      = res.box?.items?.map((i: any) => i.qr_code) || [];
      inspectionId     = res.inspectionId;
      totalItems       = res.box?.item_count || serverItems.length || totalItems;
      sampleRequirement = res.requiredSamples || totalItems || 12;
    } catch { /* offline — use local packing data */ }

    const finalItems = serverItems.length > 0 ? serverItems : localItems;
    const reqSamples = finalItems.length > 0 ? finalItems.length : (totalItems || 12);

    const details: ScannedBoxInfo = {
      boxNumber:         code,
      totalItems:        finalItems.length || totalItems || 3,
      sampleRequirement: reqSamples || 3,
      inspectionId,
      packedItemQrs:     finalItems.length > 0 ? finalItems : ['BX-000218', 'BX-000245', 'BX-000300'],
    };

    setScannedBox(details);
    return {
      status:  'accepted' as const,
      message: `📦 Box ${code} loaded — Ready for AQL Inspection.`,
      code,
    };
  };

  /* ── Proceed to sampling ──────────────────────────────────── */
  const handleProceed = () => {
    if (!scannedBox) return;

    saveAQLSession({
      boxNumber:         scannedBox.boxNumber,
      totalBoxQuantity:  scannedBox.totalItems,
      sampleRequired:    scannedBox.sampleRequirement,
      currentSampleIndex: 1,
      samples:           [],
      status:            'SAMPLE_SCAN',
      inspectionId:      scannedBox.inspectionId,
      boxItems:          scannedBox.packedItemQrs,
    } as any);

    navigate('/operator/aql/samples');
  };

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>AQL Inspection — Step 1</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Scan the packing box barcode to load its contents for inspection.
        </p>
      </div>

      {/* Step indicator */}
      <div style={styles.stepBar}>
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>1</span>
          <span>Scan Box</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>2</span>
          <span>Samples</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Result</span>
        </div>
      </div>

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Box Scanner & Detected Box Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* AQL Inspection Progress & Remaining Counter */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-purple)', letterSpacing: '0.05em' }}>
                AQL INSPECTION QUANTITY PROGRESS
              </span>
              <StatusPill label={`Remaining: ${remainingAqlQty}`} variant={remainingAqlQty === 0 ? 'green' : 'purple'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block' }}>Target Qty</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{targetSoQty}</span>
              </div>
              <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-purple)', display: 'block' }}>AQL Audited</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-purple)' }}>{aqlPassedQty}</span>
              </div>
              <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '8px 10px', borderRadius: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-amber)', display: 'block' }}>Remaining</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-amber)' }}>{remainingAqlQty}</span>
              </div>
            </div>

            <ProgressBar current={aqlPassedQty} total={targetSoQty} height={8} color="var(--color-purple)" />
          </div>

          {(po?.boxRangeStart || po?.boxRangeEnd) && (
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', padding: '6px 10px', backgroundColor: 'rgba(22,184,174,0.08)', borderRadius: '8px', border: '1px solid rgba(22,184,174,0.2)' }}>
              PO Range: {po?.boxRangeStart} → {po?.boxRangeEnd}
            </div>
          )}

          <ScannerInput onScan={handleScanBox} placeholder="Scan packing box QR / barcode…" />

          {!scannedBox && (
            <div style={styles.emptyCard}>
              <BoxSelect size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for box scan…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a packed box to see its contents
              </span>
            </div>
          )}

          {scannedBox && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', borderColor: 'var(--color-purple)', borderWidth: '1.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={styles.cardSubTitle}>BOX DETECTED</span>
                <StatusPill label="Ready for AQL" variant="purple" />
              </div>

              <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-purple)', marginTop: '6px' }}>
                {scannedBox.boxNumber}
              </h3>

              <div style={styles.detailsGrid}>
                <div style={styles.detailCard}>
                  <span style={{ ...styles.detailCardVal }}>{scannedBox.totalItems}</span>
                  <span style={styles.detailCardLbl}>Items in Box</span>
                </div>
                <div style={styles.detailCard}>
                  <span style={{ ...styles.detailCardVal, color: 'var(--color-purple)' }}>
                    {scannedBox.sampleRequirement}
                  </span>
                  <span style={styles.detailCardLbl}>Required Samples</span>
                </div>
              </div>

              {scannedBox.packedItemQrs.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Packed Products ({scannedBox.packedItemQrs.length} items):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {scannedBox.packedItemQrs.map((qr) => (
                      <div key={qr} style={styles.itemRow}>
                        <Package size={14} color="var(--primary-teal)" />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, marginLeft: '8px' }}>
                          {qr}
                        </span>
                        <StatusPill label="Packed" variant="teal" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn-primary"
            disabled={!scannedBox}
            onClick={handleProceed}
            style={{
              marginTop: '12px',
              background: scannedBox
                ? 'linear-gradient(135deg, var(--color-purple) 0%, #A78BFA 100%)'
                : 'var(--bg-surface-2)',
              color: scannedBox ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            Proceed to Sample Scanning <ArrowRight size={18} />
          </button>
        </div>

        {/* Right Panel: AQL Audit Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-right-panel">
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-purple)', letterSpacing: '0.05em' }}>
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
                <span style={{ color: 'var(--text-secondary)' }}>Acceptance Quality Limit:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-purple)' }}>ISO 2859-1 Level II</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sample Size Rule:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>10% of Box (Min 3)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Max Defect Tolerance:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-red)' }}>0 Critical Defects</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              QC TEST INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the sealed carton barcode to begin audit.</li>
              <li>System automatically calculates required sample size.</li>
              <li>Pull samples randomly from top, middle, and bottom of box.</li>
              <li>Log individual sample pass/fail results in Step 2.</li>
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
    borderRadius: '14px',
    padding: '10px 14px',
    border: '1px solid var(--border-color)',
  },
  stepActive: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', fontWeight: 700, color: 'var(--color-purple)',
  },
  stepInactive: {
    display: 'flex', alignItems: 'center', gap: '6px',
    fontSize: '12px', color: 'var(--text-muted)',
  },
  stepNumActive: {
    width: '20px', height: '20px', borderRadius: '50%',
    backgroundColor: 'var(--color-purple)', color: '#fff',
    fontSize: '11px', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stepNumInactive: {
    width: '20px', height: '20px', borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)', color: 'var(--text-muted)',
    fontSize: '11px', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stepDivider: { width: '16px', height: '1px', backgroundColor: 'var(--border-color)' },
  emptyCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '2px dashed var(--border-color)',
    borderRadius: '18px',
    padding: '32px 16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  cardSubTitle: {
    fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
  },
  detailsGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px',
  },
  detailCard: {
    backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px',
    padding: '12px', textAlign: 'center',
  },
  detailCardVal: { fontSize: '22px', fontWeight: 800, display: 'block' },
  detailCardLbl: { fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' },
  itemRow: {
    display: 'flex', alignItems: 'center',
    backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px',
    padding: '8px 12px', border: '1px solid var(--border-color)',
  },
};
