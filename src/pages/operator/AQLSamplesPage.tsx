import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { CheckCircle2, XCircle, ArrowRight, Check, AlertTriangle, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const AQLSamplesPage: React.FC = () => {
  const navigate = useNavigate();
  const { aqlSession, saveAQLSession, showToast, incrementAQLPassed, incrementAQLFailed } = useApp();

  useEffect(() => {
    if (!aqlSession) {
      navigate('/operator/aql');
    }
  }, [aqlSession, navigate]);

  if (!aqlSession) {
    return null;
  }

  const session: any = aqlSession;
  const boxItemsList: string[] = session.boxItems?.length > 0 ? session.boxItems : [];
  const totalRequiredSamples = boxItemsList.length > 0 ? boxItemsList.length : (session.sampleRequired || 12);

  // Restore previous completed samples
  const dbPassedSamples = Array.isArray(session.previousPassedSamples)
    ? session.previousPassedSamples.map((ps: any, i: number) => ({
        sampleIndex: i + 1,
        itemQr: ps.itemQr,
        size: 'L',
        result: ps.result || 'PASS',
        actionType: ps.actionType || 'PASSED'
      }))
    : [];

  const initialCompletedSamples = session.samples?.length > 0 ? session.samples : dbPassedSamples;
  const [completedSamples, setCompletedSamples] = useState<any[]>(initialCompletedSamples);

  // Determine initial active index
  const getInitialIndex = () => {
    if (session.currentSampleIndex && session.currentSampleIndex > 1 && session.currentSampleIndex <= totalRequiredSamples) {
      return session.currentSampleIndex;
    }
    const completedIdxs = new Set(initialCompletedSamples.map((s: any) => s.sampleIndex));
    for (let i = 1; i <= totalRequiredSamples; i++) {
      if (!completedIdxs.has(i)) return i;
    }
    return 1;
  };

  const [currentIdx, setCurrentIdx] = useState<number>(getInitialIndex());
  
  // State Machine for current item: 'WAITING' -> 'SCANNED_RESULT_REQUIRED' -> 'PASS_FAIL_RECORDED'
  const [itemState, setItemState] = useState<'WAITING' | 'SCANNED_RESULT_REQUIRED'>('WAITING');
  const [scannedQr, setScannedQr] = useState<string>('');

  // Defect Modal State
  const [showFailModal, setShowFailModal] = useState(false);
  const [failAction, setFailAction] = useState<'REUSED' | 'PERMANENTLY_REMOVE'>('REUSED');
  const [removeReason, setRemoveReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const expectedQr = (boxItemsList[currentIdx - 1] || '').trim().toUpperCase();

  // ── Step 1: Scan Barcode Input Handler ──────────────────────────────────
  const handleScanSample = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      return { status: 'rejected' as const, message: 'Please enter or scan a sample QR barcode', code };
    }

    // Rule: If current item is in SCANNED_RESULT_REQUIRED, block scanning next item!
    if (itemState === 'SCANNED_RESULT_REQUIRED') {
      const msg = `Please select PASS or FAIL for current item (${scannedQr || expectedQr}) before scanning the next item.`;
      showToast(msg, 'warning');
      return { status: 'rejected' as const, message: msg, code: trimmed };
    }

    // Rule: Scanned QR must match current expected QR sequence
    if (expectedQr && trimmed !== expectedQr) {
      const msg = `Wrong product. Please scan ${expectedQr}.`;
      showToast(msg, 'error');
      return { status: 'rejected' as const, message: msg, code: trimmed };
    }

    // State transition: WAITING -> SCANNED_RESULT_REQUIRED
    setScannedQr(trimmed);
    setItemState('SCANNED_RESULT_REQUIRED');
    showToast(`✅ ${trimmed} scanned. Please select PASS or FAIL below.`, 'info');

    return {
      status: 'accepted' as const,
      message: `✅ ${trimmed} scanned — Result selection required`,
      code: trimmed
    };
  };

  // ── Step 2: Handle PASS Result ──────────────────────────────────────────
  const handleSelectPass = async () => {
    const activeQr = scannedQr || expectedQr;
    if (!activeQr) {
      showToast('No active item QR to verify', 'warning');
      return;
    }

    try {
      if (session.inspectionId) {
        await apiFetch(`/api/aql/inspections/${session.inspectionId}/samples`, {
          method: 'POST',
          body: JSON.stringify({
            sampleNumber: currentIdx,
            itemQr: activeQr,
            result: 'PASS',
            actionType: 'PASSED'
          })
        });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to save sample PASS result', 'error');
      return;
    }

    const newSample = {
      sampleIndex: currentIdx,
      itemQr: activeQr,
      size: 'L',
      result: 'PASS',
      actionType: 'PASSED'
    };

    const updatedSamples = [...completedSamples.filter(s => s.sampleIndex !== currentIdx), newSample];
    setCompletedSamples(updatedSamples);

    if (currentIdx < totalRequiredSamples) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setItemState('WAITING');
      setScannedQr('');

      saveAQLSession({
        ...session,
        currentSampleIndex: nextIdx,
        samples: updatedSamples
      });

      showToast(`✓ Sample ${currentIdx} (${activeQr}) PASSED. Moved to Sample ${nextIdx}.`, 'success');
    } else {
      // Completed all box samples!
      await finalizeInspection(updatedSamples);
    }
  };

  // ── Step 3: Handle Defect Action Modal Confirmation ──────────────────────
  const handleConfirmFailAction = async () => {
    setIsProcessingAction(true);
    const activeQr = scannedQr || expectedQr;

    if (!activeQr) {
      showToast('Item QR code is required for defect action', 'warning');
      setIsProcessingAction(false);
      return;
    }

    try {
      if (failAction === 'PERMANENTLY_REMOVE') {
        // PERMANENT DELETE: Remove from active box_items and store archive history
        await apiFetch('/api/aql/items/permanently-remove', {
          method: 'POST',
          body: JSON.stringify({
            itemQr: activeQr,
            boxNumber: session.boxNumber,
            inspectionId: session.inspectionId,
            reason: removeReason || 'Damaged Garment Permanently Scrapped'
          })
        });

        // Update active boxItemsList in session so capacity X/Y decreases
        const updatedBoxItems = (session.boxItems || []).filter(
          (qr: string) => qr.trim().toUpperCase() !== activeQr.toUpperCase()
        );

        const newSample = {
          sampleIndex: currentIdx,
          itemQr: activeQr,
          size: 'L',
          result: 'FAIL',
          actionType: 'PERMANENTLY_REMOVE',
          failureReason: removeReason || 'Scrapped'
        };

        const updatedSamples = [...completedSamples.filter(s => s.sampleIndex !== currentIdx), newSample];
        setCompletedSamples(updatedSamples);

        saveAQLSession({
          ...session,
          boxItems: updatedBoxItems,
          sampleRequired: updatedBoxItems.length,
          samples: updatedSamples
        });

        showToast(`Item ${activeQr} permanently removed from box & database.`, 'warning');
        setShowFailModal(false);
        setIsProcessingAction(false);

        if (currentIdx <= updatedBoxItems.length) {
          setItemState('WAITING');
          setScannedQr('');
        } else {
          await finalizeInspection(updatedSamples);
        }
      } else {
        // REUSE: Record AQL FAIL result, product stays in box for rework
        if (session.inspectionId) {
          await apiFetch(`/api/aql/inspections/${session.inspectionId}/samples`, {
            method: 'POST',
            body: JSON.stringify({
              sampleNumber: currentIdx,
              itemQr: activeQr,
              result: 'FAIL',
              actionType: 'REUSED',
              failureReason: 'REWORK'
            })
          });
        }

        const newSample = {
          sampleIndex: currentIdx,
          itemQr: activeQr,
          size: 'L',
          result: 'FAIL',
          actionType: 'REUSED',
          failureReason: 'REWORK'
        };

        const updatedSamples = [...completedSamples.filter(s => s.sampleIndex !== currentIdx), newSample];
        setCompletedSamples(updatedSamples);

        showToast(`Item ${activeQr} recorded as FAIL (Reusable for Rework)`, 'info');
        setShowFailModal(false);
        setIsProcessingAction(false);

        if (currentIdx < totalRequiredSamples) {
          const nextIdx = currentIdx + 1;
          setCurrentIdx(nextIdx);
          setItemState('WAITING');
          setScannedQr('');

          saveAQLSession({
            ...session,
            currentSampleIndex: nextIdx,
            samples: updatedSamples
          });
        } else {
          await finalizeInspection(updatedSamples);
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to process defect action', 'error');
      setIsProcessingAction(false);
    }
  };

  // ── Finalize Inspection when all items processed ────────────────────────
  const finalizeInspection = async (finalSamples: any[]) => {
    const hasAnyFail = finalSamples.some(s => s.result === 'FAIL');
    const finalResult: 'PASSED' | 'FAILED' = hasAnyFail ? 'FAILED' : 'PASSED';

    if (finalResult === 'PASSED') {
      incrementAQLPassed();
    } else {
      incrementAQLFailed();
    }

    try {
      const payload = {
        result: finalResult,
        boxNumber: session.boxNumber,
        samples: finalSamples
      };
      if (session.inspectionId) {
        await apiFetch(`/api/aql/inspections/${session.inspectionId}/complete`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
    } catch (err) {
      console.error('Failed to post AQL complete:', err);
    }

    const finalSession = {
      ...session,
      samples: finalSamples,
      status: 'RESULT' as const,
      overallResult: finalResult
    };

    saveAQLSession(finalSession);
    showToast(`All box items inspected! AQL Result: ${finalResult}`, 'success');
    navigate('/operator/aql/result');
  };

  // Accurate AQL Counts
  const passCount = completedSamples.filter(s => s.result === 'PASS').length;
  const failCount = completedSamples.filter(s => s.result === 'FAIL').length;
  const inspectedCount = completedSamples.length;

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
          <span>Item Inspection ({currentIdx}/{totalRequiredSamples})</span>
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
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>INSPECTING BOX CONTENTS</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-purple)' }}>
              {session.boxNumber}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '4px 10px', borderRadius: '8px' }}>
              PASS: {passCount}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '4px 10px', borderRadius: '8px' }}>
              FAIL: {failCount}
            </span>
          </div>
        </div>

        {/* Packed Items Preview & State Tracker */}
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Box Items Sequence ({inspectedCount}/{totalRequiredSamples} inspected):
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {boxItemsList.map((qr: string, idx: number) => {
              const itemNum = idx + 1;
              const sampled = completedSamples.find((s: any) => s.sampleIndex === itemNum || s.itemQr === qr);
              const isCurrent = currentIdx === itemNum;
              
              let bg = 'var(--bg-surface-2)';
              let border = '1px solid var(--border-color)';
              let color = 'var(--text-secondary)';
              let label = `${itemNum}. ${qr}`;
              let badge = 'LOCKED';

              if (sampled) {
                if (sampled.result === 'PASS') {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10B981';
                  color = '#10B981';
                  badge = '✓ PASS';
                } else {
                  bg = 'rgba(239, 68, 68, 0.15)';
                  border = '1px solid #EF4444';
                  color = '#EF4444';
                  badge = sampled.actionType === 'PERMANENTLY_REMOVE' ? '🗑️ SCRAPPED' : '✗ FAIL (REWORK)';
                }
              } else if (isCurrent) {
                if (itemState === 'SCANNED_RESULT_REQUIRED') {
                  bg = 'rgba(245, 158, 11, 0.2)';
                  border = '2px solid #F59E0B';
                  color = '#F59E0B';
                  badge = '● RESULT REQUIRED';
                } else {
                  bg = 'rgba(139, 92, 246, 0.2)';
                  border = '2px solid var(--color-purple)';
                  color = 'var(--color-purple)';
                  badge = '⏳ WAITING SCAN';
                }
              }

              return (
                <div
                  key={qr}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '6px 10px',
                    borderRadius: '8px',
                    backgroundColor: bg,
                    color,
                    border,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: '10px', opacity: 0.85 }}>[{badge}]</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress & Current Item Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-purple)', letterSpacing: '0.05em' }}>
              STEP SEQUENCE: WAITING → SCANNED → RESULT REQUIRED → PASS/FAIL
            </span>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              Active Item #{currentIdx}: {expectedQr}
            </h3>
          </div>
          <StatusPill
            label={itemState === 'SCANNED_RESULT_REQUIRED' ? 'RESULT REQUIRED' : 'WAITING SCAN'}
            variant={itemState === 'SCANNED_RESULT_REQUIRED' ? 'amber' : 'purple'}
          />
        </div>

        {/* Scanner Input Component */}
        <ScannerStatus showConnectButton={true} style={{ marginBottom: '10px' }} />

        {itemState === 'SCANNED_RESULT_REQUIRED' ? (
          <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '12px', padding: '12px', textAlign: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#F59E0B', display: 'block' }}>
              ⚠️ Barcode {scannedQr} Scanned — Mandatory Result Selection
            </span>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Please select <strong>PASS</strong> or <strong>FAIL</strong> below before scanning the next item. Scanning next product is currently blocked.
            </p>
          </div>
        ) : (
          <ScannerInput
            onScan={handleScanSample}
            placeholder={`Scan expected QR barcode (${expectedQr}) to verify...`}
          />
        )}

        {/* Mandatory Result Buttons */}
        <div style={{ marginTop: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            Select Result for Item #{currentIdx} ({scannedQr || expectedQr}):
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={handleSelectPass}
              disabled={itemState !== 'SCANNED_RESULT_REQUIRED'}
              style={{
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: itemState === 'SCANNED_RESULT_REQUIRED' ? '#10B981' : 'var(--bg-surface-2)',
                color: itemState === 'SCANNED_RESULT_REQUIRED' ? '#000000' : 'var(--text-muted)',
                border: itemState === 'SCANNED_RESULT_REQUIRED' ? 'none' : '1px solid var(--border-color)',
                fontWeight: 800,
                fontSize: '14px',
                cursor: itemState === 'SCANNED_RESULT_REQUIRED' ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <Check size={20} /> PASS (Quality Approved)
            </button>

            <button
              onClick={() => {
                if (itemState !== 'SCANNED_RESULT_REQUIRED') {
                  showToast(`Please scan barcode ${expectedQr} first before selecting result`, 'warning');
                  return;
                }
                setShowFailModal(true);
              }}
              disabled={itemState !== 'SCANNED_RESULT_REQUIRED'}
              style={{
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: itemState === 'SCANNED_RESULT_REQUIRED' ? '#EF4444' : 'var(--bg-surface-2)',
                color: itemState === 'SCANNED_RESULT_REQUIRED' ? '#FFFFFF' : 'var(--text-muted)',
                border: itemState === 'SCANNED_RESULT_REQUIRED' ? 'none' : '1px solid var(--border-color)',
                fontWeight: 800,
                fontSize: '14px',
                cursor: itemState === 'SCANNED_RESULT_REQUIRED' ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <XCircle size={20} /> FAIL (Select Action)
            </button>
          </div>
        </div>
      </div>

      {/* ── Defect Action Modal (REUSE vs PERMANENTLY DELETE) ────────── */}
      {showFailModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1.5px solid rgba(239, 68, 68, 0.4)',
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
                <ShieldAlert size={24} color="#EF4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  AQL Defect Action Required
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Item <strong>{scannedQr || expectedQr}</strong> in Box <strong>{session.boxNumber}</strong> was marked as <strong>FAILED</strong>. Select how to handle this product:
              </p>
            </div>

            {/* Action Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: REUSE */}
              <div
                onClick={() => setFailAction('REUSED')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: failAction === 'REUSED' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface-2)',
                  border: failAction === 'REUSED' ? '2px solid #8B5CF6' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: failAction === 'REUSED' ? '#A78BFA' : 'var(--text-primary)' }}>
                    🔄 REUSE (Send to Rework)
                  </span>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#A78BFA', fontWeight: 700 }}>
                    REUSED
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Product remains in box and database. Operators can repair the garment for re-inspection later. No record is removed.
                </p>
              </div>

              {/* Option 2: PERMANENTLY DELETE */}
              <div
                onClick={() => setFailAction('PERMANENTLY_REMOVE')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: failAction === 'PERMANENTLY_REMOVE' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-2)',
                  border: failAction === 'PERMANENTLY_REMOVE' ? '2px solid #EF4444' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: failAction === 'PERMANENTLY_REMOVE' ? '#F87171' : 'var(--text-primary)' }}>
                    🗑️ PERMANENTLY DELETE (Scrap Item)
                  </span>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#F87171', fontWeight: 700 }}>
                    DELETE DATA
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Product is removed from active box contents (active capacity decreases). Archived in permanently removed items table.
                </p>
              </div>
            </div>

            {/* Removal Reason if PERMANENTLY DELETE */}
            {failAction === 'PERMANENTLY_REMOVE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#F87171' }}>
                  Scrap Removal Reason:
                </label>
                <input
                  type="text"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Irreparable fabric tear..."
                  style={{
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setShowFailModal(false)}
                disabled={isProcessingAction}
                className="btn btn-secondary"
                style={{ flex: 1 }}
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
                  backgroundColor: failAction === 'PERMANENTLY_REMOVE' ? '#DC2626' : '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
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
    color: '#FFFFFF',
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
    flex: 1,
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '0 8px'
  },
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1.5px solid var(--border-color)',
    borderRadius: '16px',
    padding: '16px'
  }
};
