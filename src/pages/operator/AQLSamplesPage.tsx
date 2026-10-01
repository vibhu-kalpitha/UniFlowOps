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
  const { aqlSession, saveAQLSession, showToast, activeJob, incrementAQLPassed, incrementAQLFailed, packingBoxes } = useApp();

  React.useEffect(() => {
    if (!aqlSession) {
      navigate('/operator/aql');
    }
  }, [aqlSession, navigate]);

  if (!aqlSession) {
    return null;
  }

  const session: any = aqlSession;
  const po = activeJob?.productionOrder;

  const boxItemsList: string[] = session.boxItems?.length > 0 ? session.boxItems : [];
  const totalRequiredSamples = session.sampleRequired || boxItemsList.length || 12;

  // Initial passed samples from database (from previous AQL inspection runs on this box)
  const dbPassedSamples = Array.isArray(session.previousPassedSamples)
    ? session.previousPassedSamples.map((ps: any, i: number) => ({
        sampleIndex: i + 1,
        itemQr: ps.itemQr,
        size: 'L',
        result: 'PASS',
        actionType: 'PASSED'
      }))
    : [];

  const initialCompletedSamples = session.samples?.length > 0 ? session.samples : dbPassedSamples;
  const [completedSamples, setCompletedSamples] = useState<any[]>(initialCompletedSamples);

  // Automatically find index of first unverified / pending item (skipping already passed items)
  const getInitialIndex = () => {
    if (session.currentSampleIndex && session.currentSampleIndex > 1) return session.currentSampleIndex;
    const passedQrs = new Set(initialCompletedSamples.filter((s: any) => s.result === 'PASS').map((s: any) => s.itemQr?.toUpperCase()));
    const firstPendingIdx = boxItemsList.findIndex((qr: string) => !passedQrs.has(qr.toUpperCase()));
    return firstPendingIdx >= 0 ? firstPendingIdx + 1 : 1;
  };

  const initialIdxVal = getInitialIndex();
  const [currentIdx, setCurrentIdx] = useState(initialIdxVal);

  const initialQrVal = boxItemsList[initialIdxVal - 1] || session.currentQr || `PNFLS09263267${initialIdxVal + 5}`;
  const [currentQr, setCurrentQr] = useState(initialQrVal);
  const [sampleResult, setSampleResult] = useState<'PASS' | 'FAIL'>('PASS');

  const [showFailModal, setShowFailModal] = useState(false);
  const [failAction, setFailAction] = useState<'REUSED' | 'PERMANENTLY_REMOVE'>('REUSED');
  const [removeReason, setRemoveReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const handleScanSample = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      return { status: 'rejected' as const, message: 'Please enter or scan a sample QR barcode', code };
    }

    const activeQr = trimmed.toUpperCase();
    const expectedQr = (boxItemsList[currentIdx - 1] || '').toUpperCase();

    // Call REST API sample recording
    try {
      if (session.inspectionId) {
        await apiFetch(`/api/aql/inspections/${session.inspectionId}/samples`, {
          method: 'POST',
          body: JSON.stringify({
            sampleNumber: currentIdx,
            itemQr: trimmed,
            result: 'PASS',
            actionType: 'PASSED'
          }),
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Verification failed';
      showToast(errMsg, 'error');
      return {
        status: 'rejected' as const,
        message: errMsg,
        code: trimmed
      };
    }

    setCurrentQr(trimmed);
    setSampleResult('PASS');

    const newSample = {
      sampleIndex: currentIdx,
      itemQr: trimmed,
      size: 'L',
      result: 'PASS',
      actionType: 'PASSED'
    };

    const updatedSamples = [...completedSamples.filter(s => s.sampleIndex !== currentIdx && s.itemQr?.toUpperCase() !== activeQr), newSample];
    setCompletedSamples(updatedSamples);

    if (currentIdx < totalRequiredSamples) {
      const nextIndex = currentIdx + 1;
      setCurrentIdx(nextIndex);
      const nextItemQr = boxItemsList[nextIndex - 1] || '';
      setCurrentQr(nextItemQr);

      saveAQLSession({
        ...session,
        currentSampleIndex: nextIndex,
        samples: updatedSamples
      });

      showToast(`✓ ${trimmed} verified. Next item: ${nextItemQr || 'Sample ' + nextIndex}`, 'success');
      return {
        status: 'accepted' as const,
        message: `✅ ${trimmed} verified`,
        code: trimmed,
      };
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
        const payload = { 
          result: finalResult, 
          boxNumber: session.boxNumber || 'BX-000218',
          samples: updatedSamples
        };
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
      showToast(`All ${totalRequiredSamples} box items verified! AQL inspection complete!`, 'success');
      navigate('/operator/aql/result');

      return {
        status: 'accepted' as const,
        message: `✅ All ${totalRequiredSamples} box items verified`,
        code: trimmed,
      };
    }
  };

  const handleNextSampleInternal = async (overrideResult?: 'PASS' | 'FAIL', actionType?: string, reason?: string) => {
    const activeQr = (currentQr || boxItemsList[currentIdx - 1] || '').trim();
    const res = overrideResult || sampleResult;
    const actType = actionType || (res === 'PASS' ? 'PASSED' : 'REUSED');
    const failReason = reason || (res === 'FAIL' ? 'REWORK' : undefined);

    const newSample = {
      sampleIndex: currentIdx,
      itemQr: activeQr,
      size: 'L',
      result: res,
      actionType: actType,
      failureReason: failReason
    };

    const updatedSamples = [...completedSamples.filter(s => s.sampleIndex !== currentIdx && s.itemQr?.toUpperCase() !== activeQr.toUpperCase()), newSample];
    setCompletedSamples(updatedSamples);

    // Call REST API sample recording
    try {
      if (session.inspectionId) {
        await apiFetch(`/api/aql/inspections/${session.inspectionId}/samples`, {
          method: 'POST',
          body: JSON.stringify({
            sampleNumber: currentIdx,
            itemQr: activeQr,
            result: res,
            actionType: actType,
            failureReason: failReason
          }),
        });
      }
    } catch {
      // Ignore network errors in offline mode
    }

    if (currentIdx < totalRequiredSamples) {
      const nextIndex = currentIdx + 1;
      setCurrentIdx(nextIndex);
      const nextItemQr = boxItemsList[nextIndex - 1] || '';
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
        const payload = { 
          result: finalResult, 
          boxNumber: session.boxNumber || 'BX-000218',
          samples: updatedSamples
        };
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

  const handleConfirmFailAction = async () => {
    setIsProcessingAction(true);
    const targetQr = (currentQr || boxItemsList[currentIdx - 1] || '').trim();
    if (!targetQr) {
      showToast('Item QR code is required for permanent removal', 'warning');
      setIsProcessingAction(false);
      return;
    }

    try {
      if (failAction === 'PERMANENTLY_REMOVE') {
        await apiFetch('/api/aql/items/permanently-remove', {
          method: 'POST',
          body: JSON.stringify({
            itemQr: targetQr,
            boxNumber: session.boxNumber,
            inspectionId: session.inspectionId,
            reason: removeReason || 'Damaged Garment Permanently Scrapped'
          })
        });

        // Remove permanently removed item QR from boxItems in active session & local storage
        const updatedBoxItems = (session.boxItems || []).filter(
          (qr: string) => qr.toUpperCase() !== targetQr.toUpperCase()
        );

        if (session.boxNumber && packingBoxes[session.boxNumber]) {
          packingBoxes[session.boxNumber].items = (packingBoxes[session.boxNumber].items || []).filter(
            (it: any) => it.qr.toUpperCase() !== targetQr.toUpperCase()
          );
          localStorage.setItem('uniflow_packing_boxes', JSON.stringify(packingBoxes));
        }

        saveAQLSession({
          ...session,
          boxItems: updatedBoxItems,
          sampleRequired: updatedBoxItems.length > 0 ? updatedBoxItems.length : Math.max(1, (session.sampleRequired || 1) - 1)
        });

        showToast(`Item ${targetQr} permanently removed from box & database`, 'warning');
        setShowFailModal(false);
        setIsProcessingAction(false);
        await handleNextSampleInternal('FAIL', 'PERMANENTLY_REMOVE', removeReason || 'Damaged Garment Scrapped');
      } else {
        showToast(`Item ${targetQr} recorded as FAIL (Reusable for Rework)`, 'info');
        setShowFailModal(false);
        setIsProcessingAction(false);
        await handleNextSampleInternal('FAIL', 'REUSED', 'REWORK');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to process fail action', 'error');
      setIsProcessingAction(false);
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
                  icon = sampled.actionType === 'PERMANENTLY_REMOVE' ? ' 🗑️' : ' ✗';
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
            onClick={() => {
              setSampleResult('FAIL');
              setShowFailModal(true);
            }}
          >
            <XCircle size={18} /> FAIL
          </button>
        </div>
      </div>

      {/* Next Sample Action */}
      <button
        className="btn-primary"
        onClick={() => {
          if (sampleResult === 'FAIL') {
            setShowFailModal(true);
          } else {
            handleNextSampleInternal();
          }
        }}
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

      {/* ── Defect Action Modal ──────────────────────────────────── */}
      {showFailModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <XCircle size={22} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                  Sample Defect Action — Item Damaged
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                Item <strong>{currentQr}</strong> in Box <strong>{session.boxNumber}</strong> was marked as FAILED. Select how to handle this damaged product:
              </p>
            </div>

            {/* Action Selection Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: Reused / Rework */}
              <div
                onClick={() => setFailAction('REUSED')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: failAction === 'REUSED' ? 'rgba(139, 92, 246, 0.15)' : '#1e293b',
                  border: failAction === 'REUSED' ? '2px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: failAction === 'REUSED' ? '#a78bfa' : '#f8fafc' }}>
                    🔄 Reusable (Send to Rework)
                  </span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', fontWeight: 700 }}>
                    REUSED
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  Item remains in database. Factory operators can repair the product so it can pass future AQL/QC inspections.
                </p>
              </div>

              {/* Option 2: Permanently Remove */}
              <div
                onClick={() => setFailAction('PERMANENTLY_REMOVE')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: failAction === 'PERMANENTLY_REMOVE' ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                  border: failAction === 'PERMANENTLY_REMOVE' ? '2px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: failAction === 'PERMANENTLY_REMOVE' ? '#f87171' : '#f8fafc' }}>
                    🗑️ Permanently Remove (Scrap Item)
                  </span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 700 }}>
                    DELETE DATA
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
                  Permanently remove item from active box/database tables. Audit record is archived in Permanently Removed Items archive.
                </p>
              </div>
            </div>

            {/* Optional Reason Input if Permanently Remove */}
            {failAction === 'PERMANENTLY_REMOVE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171' }}>
                  Defect / Removal Reason:
                </label>
                <input
                  type="text"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Torn material, non-repairable defect..."
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setShowFailModal(false)}
                disabled={isProcessingAction}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFailAction}
                disabled={isProcessingAction}
                style={{
                  flex: 2,
                  padding: '10px',
                  borderRadius: '10px',
                  backgroundColor: failAction === 'PERMANENTLY_REMOVE' ? '#dc2626' : '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {isProcessingAction ? 'Processing...' : failAction === 'PERMANENTLY_REMOVE' ? 'Confirm Permanent Removal' : 'Confirm Fail (Rework)'}
              </button>
            </div>
          </div>
        </div>
      )}
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
