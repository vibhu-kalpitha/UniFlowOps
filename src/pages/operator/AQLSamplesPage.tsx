import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { CheckCircle2, XCircle, ArrowRight, Check, PackageCheck } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { isCodeInRange } from '../../utils/rangeValidation';
import '../../styles/tokens.css';

export const AQLSamplesPage: React.FC = () => {
  const navigate = useNavigate();
  const { aqlSession, saveAQLSession, showToast, activeJob, incrementAQLPassed, incrementAQLFailed } = useApp();

  const session: any = aqlSession || {
    boxNumber: 'BX-000218',
    totalBoxQuantity: 12,
    sampleRequired: 12,
    currentSampleIndex: 1,
    samples: [],
    status: 'SAMPLE_SCAN',
    inspectionId: 'aql-insp-001',
    boxItems: [
      'PNFLS092632670', 'PNFLS092632671', 'PNFLS092632672', 'PNFLS092632673',
      'PNFLS092632674', 'PNFLS092632675', 'PNFLS092632676', 'PNFLS092632677'
    ]
  };

  const po = activeJob?.productionOrder;

  const [currentIdx, setCurrentIdx] = useState(session.currentSampleIndex || 1);
  const [currentQr, setCurrentQr] = useState('PNFLS092632677');
  const [sampleResult, setSampleResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [completedSamples, setCompletedSamples] = useState(session.samples || []);

  const boxItemsList: string[] = session.boxItems?.length > 0 ? session.boxItems : [
    'PNFLS092632670', 'PNFLS092632671', 'PNFLS092632672', 'PNFLS092632673',
    'PNFLS092632674', 'PNFLS092632675', 'PNFLS092632676', 'PNFLS092632677'
  ];

  const totalRequiredSamples = session.sampleRequired || boxItemsList.length || 12;

  const handleScanSample = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { status: 'rejected' as const, message: 'Please enter or scan a sample QR barcode', code };
    }

    setCurrentQr(trimmed);
    setSampleResult('PASS');

    if (session.inspectionId) {
      apiFetch(`/aql/inspections/${session.inspectionId}/samples`, {
        method: 'POST',
        body: JSON.stringify({
          sampleNumber: currentIdx,
          itemQr: trimmed,
          result: 'PASS'
        }),
      }).catch(() => {});
    }

    return {
      status: 'accepted' as const,
      message: `✅ Sample ${currentIdx} Verified (${trimmed}) -> PASS`,
      code: trimmed,
    };
  };

  const handleNextSample = async () => {
    const newSample = {
      sampleIndex: currentIdx,
      itemQr: currentQr,
      size: 'L',
      result: sampleResult
    };

    const updatedSamples = [...completedSamples, newSample];
    setCompletedSamples(updatedSamples);

    // Call REST API sample recording
    try {
      if (session.inspectionId) {
        await apiFetch(`/api/aql/inspections/${session.inspectionId}/samples`, {
          method: 'POST',
          body: JSON.stringify({
            sampleNumber: currentIdx,
            itemQr: currentQr,
            result: sampleResult,
          }),
        });
      }
    } catch {
      // Ignore network errors in offline mode
    }

    if (currentIdx < totalRequiredSamples) {
      const nextIndex = currentIdx + 1;
      setCurrentIdx(nextIndex);
      // Pre-fill next item QR if available from boxItemsList
      const nextItemQr = boxItemsList[nextIndex - 1] || `PNFLS09263267${nextIndex + 5}`;
      setCurrentQr(nextItemQr);
      setSampleResult('PASS');

      saveAQLSession({
        ...session,
        currentSampleIndex: nextIndex,
        samples: updatedSamples
      });

      showToast(`Recorded Sample ${currentIdx}/${totalRequiredSamples}. Move to Sample ${nextIndex}`, 'info');
    } else {
      // Completed all samples!
      const hasAnyFail = updatedSamples.some(s => s.result === 'FAIL');
      const finalResult: 'PASSED' | 'FAILED' = hasAnyFail ? 'FAILED' : 'PASSED';

      if (finalResult === 'PASSED') {
        incrementAQLPassed();
      } else {
        incrementAQLFailed();
      }

      try {
        const payload = { result: finalResult, boxNumber: session.boxNumber || 'BX-000218' };
        if (session.inspectionId) {
          await apiFetch(`/api/aql/inspections/${session.inspectionId}/complete`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch('/api/aql/inspections/direct-complete', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
      } catch (err) {
        console.error('Failed to post AQL complete:', err);
      }

      const finalSession = {
        ...session,
        samples: updatedSamples,
        status: 'RESULT' as const,
        overallResult: finalResult
      };

      saveAQLSession(finalSession);
      showToast(`All ${totalRequiredSamples} samples saved to database. AQL inspection complete!`, 'success');
      navigate('/operator/aql/result');
    }
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
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>2</span>
          <span>Samples ({currentIdx}/{totalRequiredSamples})</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Result</span>
        </div>
      </div>

      {/* Box Header Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>INSPECTING BOX</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-purple)' }}>
              {session.boxNumber}
            </h3>
          </div>
        </div>

        {/* Packed Items Preview & Verification List */}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Packed Products in Box ({boxItemsList.length} items):
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-purple)' }}>
              Verified {completedSamples.length}/{totalRequiredSamples}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {boxItemsList.map((qr: string, idx: number) => {
              const sampled = completedSamples.find((s: any) => s.itemQr === qr || s.sampleIndex === idx + 1);
              const isCurrent = currentIdx === idx + 1;
              let bg = 'var(--bg-surface-2)';
              let border = '1px solid var(--border-color)';
              let color = 'var(--text-primary)';
              let icon = '';

              if (sampled) {
                if (sampled.result === 'PASS') {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10B981';
                  color = '#10B981';
                  icon = ' ✓';
                } else {
                  bg = 'rgba(239, 68, 68, 0.15)';
                  border = '1px solid #EF4444';
                  color = '#EF4444';
                  icon = ' ✗';
                }
              } else if (isCurrent) {
                bg = 'rgba(139, 92, 246, 0.2)';
                border = '1.5px solid var(--color-purple)';
                color = 'var(--color-purple)';
              }

              return (
                <span
                  key={qr}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    backgroundColor: bg,
                    color,
                    border,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {qr}{icon}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress Pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
          Sample Item {currentIdx} of {totalRequiredSamples}
        </h3>
        <StatusPill label={`Sample ${currentIdx}/${totalRequiredSamples}`} variant="purple" />
      </div>

      {/* Scanner Input Component */}
      <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
      <ScannerInput onScan={handleScanSample} placeholder={`Scan or type sample item ${currentIdx} QR code...`} />

      {/* Sample Details */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
        <span style={styles.cardHeaderTitle}>SAMPLE {currentIdx} DETAILS</span>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Sample QR</span>
          <span style={styles.detailValue}>{currentQr}</span>
        </div>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Size</span>
          <span style={styles.detailValue}>L</span>
        </div>
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Item Status</span>
          <StatusPill label="Valid Item" variant="green" />
        </div>
      </div>

      {/* Inspection Result Toggle */}
      <div>
        <span style={styles.controlLabel}>Sample {currentIdx} Inspection Result</span>
        <div style={styles.segmentRow}>
          <button
            style={sampleResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
            onClick={() => setSampleResult('PASS')}
          >
            <Check size={18} /> PASS
          </button>
          <button
            style={sampleResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
            onClick={() => setSampleResult('FAIL')}
          >
            <XCircle size={18} /> FAIL
          </button>
        </div>
      </div>

      {/* Next Sample Action */}
      <button
        className="btn-primary"
        onClick={handleNextSample}
        style={{
          marginTop: 'auto',
          background: 'linear-gradient(135deg, var(--color-purple) 0%, #A78BFA 100%)'
        }}
      >
        {currentIdx < totalRequiredSamples ? (
          <>Next Sample ({currentIdx + 1}/{totalRequiredSamples}) <ArrowRight size={18} style={{ marginLeft: '6px' }} /></>
        ) : (
          <>Complete All Samples ({totalRequiredSamples}/{totalRequiredSamples}) <CheckCircle2 size={18} style={{ marginLeft: '6px' }} /></>
        )}
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
    width: '12px',
    height: '1px',
    backgroundColor: 'var(--border-color)'
  },
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '10px 14px'
  },
  scanBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    border: '2px dashed var(--color-purple)',
    borderRadius: '20px',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer'
  },
  scanIconWrap: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px'
  },
  scanText: {
    fontSize: '16px',
    fontWeight: 800,
    color: 'var(--text-primary)'
  },
  scanSubText: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '2px'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginBottom: '10px',
    display: 'block'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
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
  controlLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block'
  },
  segmentRow: {
    display: 'flex',
    gap: '10px'
  },
  segmentBtn: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14px',
    gap: '6px'
  },
  passBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontWeight: 800,
    fontSize: '14px',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(24, 184, 121, 0.3)'
  },
  failBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontWeight: 800,
    fontSize: '14px',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(239, 92, 92, 0.3)'
  }
};
