import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowRight } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AQLBoxScanPage: React.FC = () => {
  const navigate = useNavigate();
  const { packingBoxes, saveAQLSession, showToast } = useApp();

  const [scannedBox, setScannedBox] = useState<{
    boxNumber: string;
    totalItems: number;
    sampleRequirement: number;
    inspectionId?: string;
  } | null>(null);

  const handleScanBox = async (code: string) => {
    try {
      const res = await apiFetch('/api/aql/boxes/scan', {
        method: 'POST',
        body: JSON.stringify({ boxNumber: code }),
      });

      const details = {
        boxNumber: res.box.box_number,
        totalItems: res.box.item_count || 12,
        sampleRequirement: res.requiredSamples || 3,
        inspectionId: res.inspectionId,
      };

      setScannedBox(details);
      return {
        status: 'accepted' as const,
        message: `Box ${details.boxNumber} scanned. ${details.sampleRequirement} sample items required for AQL.`,
        code,
      };
    } catch (err: any) {
      // Fallback local handling if offline
      const foundBox = packingBoxes[code] || {
        boxNumber: code || 'BX-000218',
        capacity: 12,
        items: Array(12).fill(null),
        soId: 'SO-77201',
        status: 'OPEN'
      };

      const details = {
        boxNumber: foundBox.boxNumber,
        totalItems: foundBox.items.length || 12,
        sampleRequirement: 3
      };

      setScannedBox(details);
      return {
        status: 'accepted' as const,
        message: `Box ${details.boxNumber} ready for inspection.`,
        code,
      };
    }
  };

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
    } as any);

    navigate('/operator/aql/samples');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 3 Step Indicator */}
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

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>AQL Inspection — Step 1</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Scan outer box QR code to calculate AQL sample requirements.
        </p>
      </div>

      {/* Scanner Input Component */}
      <ScannerInput onScan={handleScanBox} placeholder="Scan or type outer box QR code..." />

      {/* Scanned Box Details */}
      {scannedBox && (
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', borderColor: 'var(--color-purple)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={styles.cardSubTitle}>BOX DETECTED</span>
            <StatusPill label="Ready for Sampling" variant="purple" />
          </div>

          <h3 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
            {scannedBox.boxNumber}
          </h3>

          <div style={styles.detailsGrid}>
            <div style={styles.detailCard}>
              <span style={styles.detailCardVal}>{scannedBox.totalItems}</span>
              <span style={styles.detailCardLbl}>Items in Box</span>
            </div>
            <div style={styles.detailCard}>
              <span style={{ ...styles.detailCardVal, color: 'var(--color-purple)' }}>
                {scannedBox.sampleRequirement}
              </span>
              <span style={styles.detailCardLbl}>Required Samples</span>
            </div>
          </div>
        </div>
      )}

      {/* Next Action Button */}
      <button
        className="btn-primary"
        disabled={!scannedBox}
        onClick={handleProceed}
        style={{
          marginTop: 'auto',
          background: scannedBox
            ? 'linear-gradient(135deg, var(--color-purple) 0%, #A78BFA 100%)'
            : 'var(--bg-surface-2)',
          color: scannedBox ? '#fff' : 'var(--text-secondary)'
        }}
      >
        Proceed to Sample Scanning <ArrowRight size={18} style={{ marginLeft: '6px' }} />
      </button>
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
    border: '1px solid var(--border-color)'
  },
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-purple)'
  },
  stepInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  stepNumActive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-purple)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumInactive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepDivider: {
    width: '16px',
    height: '1px',
    backgroundColor: 'var(--border-color)'
  },
  scanBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    border: '2px dashed var(--color-purple)',
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
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
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
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '14px'
  },
  detailCard: {
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '12px',
    padding: '12px',
    textAlign: 'center'
  },
  detailCardVal: {
    fontSize: '22px',
    fontWeight: 800,
    display: 'block'
  },
  detailCardLbl: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
    display: 'block'
  }
};
