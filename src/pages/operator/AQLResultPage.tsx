import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import '../../styles/tokens.css';

export const AQLResultPage: React.FC = () => {
  const navigate = useNavigate();
  const { aqlSession, saveAQLSession, showToast } = useApp();

  const session = aqlSession || {
    boxNumber: 'BX-000218',
    totalBoxQuantity: 12,
    sampleRequired: 3,
    currentSampleIndex: 3,
    samples: [
      { sampleIndex: 1, itemQr: 'PNFLS092632670', size: 'L', result: 'PASS' as const },
      { sampleIndex: 2, itemQr: 'PNFLS092632671', size: 'L', result: 'PASS' as const },
      { sampleIndex: 3, itemQr: 'PNFLS092632672', size: 'L', result: 'PASS' as const }
    ],
    status: 'RESULT' as const,
    overallResult: 'PASSED' as const
  };

  const hasFailedSample = session.samples.some(s => s.result === 'FAIL');
  const isPassed = session.overallResult === 'PASSED' && !hasFailedSample;

  const [defectReason, setDefectReason] = useState('Stitched Hem Defect');

  const handleFinish = () => {
    if (isPassed) {
      showToast(`AQL PASSED for Box ${session.boxNumber}. Saved!`, 'success');
    } else {
      showToast(`AQL FAILED logged for Box ${session.boxNumber} (${defectReason})`, 'error');
    }
    saveAQLSession(null);
    navigate('/operator/home');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 3 Step Indicator */}
      <div style={styles.stepBar}>
        <div style={styles.stepCompleted}>
          <span style={styles.stepNumCompleted}>✓</span>
          <span>Box Scan</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepCompleted}>
          <span style={styles.stepNumCompleted}>✓</span>
          <span>Samples (3/3)</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={isPassed ? styles.stepActiveGreen : styles.stepActiveRed}>
          <span style={isPassed ? styles.stepNumActiveGreen : styles.stepNumActiveRed}>3</span>
          <span>Result</span>
        </div>
      </div>

      {/* Result Hero Banner */}
      {isPassed ? (
        <div style={styles.heroPassed}>
          <div style={styles.iconCirclePassed}>
            <CheckCircle2 size={48} color="var(--color-green)" />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-green)', marginTop: '8px' }}>
            AQL PASSED
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Box {session.boxNumber} passed random AQL inspection.
          </p>
        </div>
      ) : (
        <div style={styles.heroFailed}>
          <div style={styles.iconCircleFailed}>
            <AlertTriangle size={48} color="var(--color-red)" />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-red)', marginTop: '8px' }}>
            AQL FAILED
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Defect found during sample inspection on Box {session.boxNumber}.
          </p>
        </div>
      )}

      {/* Summary Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
        <span style={styles.cardHeaderTitle}>INSPECTION SUMMARY</span>
        
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Box Number</span>
          <span style={styles.detailValue}>{session.boxNumber}</span>
        </div>

        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Samples Tested</span>
          <span style={styles.detailValue}>{session.samples.length} / {session.sampleRequired}</span>
        </div>

        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Overall Status</span>
          {isPassed ? (
            <StatusPill label="Passed" variant="green" />
          ) : (
            <StatusPill label="Failed" variant="red" />
          )}
        </div>
      </div>

      {/* Defect Reason Selector (if failed) */}
      {!isPassed && (
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--color-red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <ShieldAlert size={20} color="var(--color-red)" />
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-red)' }}>
              Defect Details & Reason
            </h4>
          </div>

          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
            Primary Defect Reason
          </label>
          <select
            className="input-field select-field"
            value={defectReason}
            onChange={e => setDefectReason(e.target.value)}
          >
            <option value="Stitched Hem Defect">Stitched Hem Defect</option>
            <option value="Stain / Discoloration">Stain / Discoloration</option>
            <option value="Sizing / Measurement Error">Sizing / Measurement Error</option>
            <option value="Fabric Tear / Hole">Fabric Tear / Hole</option>
            <option value="Thread Loose / Missing">Thread Loose / Missing</option>
            <option value="Wrong Label / Barcode">Wrong Label / Barcode</option>
          </select>
        </div>
      )}

      {/* 3 Sample Breakdown Rows */}
      <div>
        <span style={styles.cardHeaderTitle}>Sample Breakdown</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
          {session.samples.map((s, i) => (
            <div key={i} style={styles.sampleRow}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Sample {s.sampleIndex}: {s.itemQr}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>
                  Size {s.size || 'L'}
                </span>
              </div>
              <StatusPill
                label={s.result}
                variant={s.result === 'PASS' ? 'green' : 'red'}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Finish Action */}
      <button
        className="btn-primary"
        onClick={handleFinish}
        style={{
          marginTop: '10px',
          background: isPassed
            ? 'linear-gradient(135deg, var(--color-green) 0%, #20E094 100%)'
            : 'linear-gradient(135deg, var(--color-red) 0%, #F87171 100%)',
          color: isPassed ? '#041820' : '#fff'
        }}
      >
        {isPassed ? 'Complete Inspection & Return Home' : 'Save Failure Log & Return Home'}
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
  stepCompleted: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-green)'
  },
  stepActiveGreen: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-green)'
  },
  stepActiveRed: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-red)'
  },
  stepNumCompleted: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumActiveGreen: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumActiveRed: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepDivider: {
    width: '12px',
    height: '1px',
    backgroundColor: 'var(--border-color)'
  },
  heroPassed: {
    backgroundColor: 'rgba(24, 184, 121, 0.08)',
    border: '1px solid rgba(24, 184, 121, 0.3)',
    borderRadius: '20px',
    padding: '24px 16px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  iconCirclePassed: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroFailed: {
    backgroundColor: 'rgba(239, 92, 92, 0.08)',
    border: '1px solid rgba(239, 92, 92, 0.3)',
    borderRadius: '20px',
    padding: '24px 16px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  iconCircleFailed: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-red-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
  },
  detailLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)'
  },
  detailValue: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  sampleRow: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }
};
