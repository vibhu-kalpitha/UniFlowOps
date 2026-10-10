import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { CheckCircle2, XCircle, ArrowRight, Check, AlertTriangle, ShieldAlert, LogOut } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

interface AQLSamplesPageProps {
  isFinalAql?: boolean;
}

export const AQLSamplesPage: React.FC<AQLSamplesPageProps> = ({ isFinalAql: propIsFinalAql }) => {
  const navigate = useNavigate();
  const { aqlSession, saveAQLSession, showToast, incrementAQLPassed, incrementAQLFailed } = useApp();

  useEffect(() => {
    if (!aqlSession) {
      navigate('/operator/aql/box');
    }
  }, [aqlSession, navigate]);

  if (!aqlSession) {
    return null;
  }

  const session: any = aqlSession;
  const isFinalAql = propIsFinalAql ?? (session.isFinalAql || session.stage === 'FINAL_AQL');
  const stageTitle = isFinalAql ? 'FINAL AQL' : 'AQL';
  const stageCode = isFinalAql ? 'FINAL_AQL' : 'AQL';

  const boxItemsList: string[] = session.boxItems?.length > 0 ? session.boxItems : [];
  const totalRequiredSamples = boxItemsList.length > 0 ? boxItemsList.length : (session.sampleRequired || 12);

  // Restore previous completed samples for this session
  const dbPassedSamples = Array.isArray(session.previousPassedSamples)
    ? session.previousPassedSamples.map((ps: any, i: number) => ({
        sampleIndex: ps.sampleNumber || i + 1,
        itemQr: ps.itemQr,
        size: 'L',
        result: ps.result || 'PASS',
        actionType: ps.actionType || 'PASSED'
      }))
    : [];

  const initialCompletedSamples = session.samples?.length > 0 ? session.samples : dbPassedSamples;
  const [completedSamples, setCompletedSamples] = useState<any[]>(initialCompletedSamples);

  // Determine initial active index based on completed samples
  const getInitialIndex = () => {
    if (session.currentSampleIndex && session.currentSampleIndex > 1 && session.currentSampleIndex <= totalRequiredSamples) {
      return session.currentSampleIndex;
    }
    const completedIdxs = new Set(initialCompletedSamples.map((s: any) => s.sampleIndex));
    for (let i = 1; i <= totalRequiredSamples; i++) {
      if (!completedIdxs.has(i)) return i;
    }
    return totalRequiredSamples > 0 ? totalRequiredSamples : 1;
  };

  const [currentIdx, setCurrentIdx] = useState<number>(getInitialIndex());
  
  // State Machine for current item: 'WAITING' -> 'SCANNED_RESULT_REQUIRED'
  const [itemState, setItemState] = useState<'WAITING' | 'SCANNED_RESULT_REQUIRED'>('WAITING');
  const [scannedQr, setScannedQr] = useState<string>('');
  const [deleteSuccessBanner, setDeleteSuccessBanner] = useState<{ qr: string; boxNumber: string } | null>(null);

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

    if (itemState === 'SCANNED_RESULT_REQUIRED') {
      const msg = `Please select PASS or FAIL for current item (${scannedQr || expectedQr}) before scanning the next item.`;
      showToast(msg, 'warning');
      return { status: 'rejected' as const, message: msg, code: trimmed };
    }

    const matchIndex = boxItemsList.findIndex((qr: string) => qr.trim().toUpperCase() === trimmed);
    if (matchIndex === -1) {
      const msg = `Scanned item (${trimmed}) does not belong to the selected box.`;
      showToast(msg, 'error');
      return { status: 'rejected' as const, message: msg, code: trimmed };
    }

    const targetSampleIndex = matchIndex + 1;
    setCurrentIdx(targetSampleIndex);
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

    const updatedSamples = [...completedSamples.filter(s => (s.itemQr || '').trim().toUpperCase() !== activeQr.trim().toUpperCase()), newSample];
    setCompletedSamples(updatedSamples);

    const completedQrs = new Set(updatedSamples.map((s: any) => (s.itemQr || '').trim().toUpperCase()));
    const uninspectedItems = boxItemsList.filter((qr: string) => !completedQrs.has(qr.trim().toUpperCase()));

    if (uninspectedItems.length > 0) {
      const nextQr = uninspectedItems[0];
      const nextIdx = boxItemsList.findIndex((qr: string) => qr.trim().toUpperCase() === nextQr.trim().toUpperCase()) + 1;
      setCurrentIdx(nextIdx);
      setItemState('WAITING');
      setScannedQr('');

      saveAQLSession({
        ...session,
        currentSampleIndex: nextIdx,
        samples: updatedSamples
      });

      showToast(`✓ Sample (${activeQr}) PASSED. Moved to item ${nextQr}.`, 'success');
    } else {
      await finalizeInspection(updatedSamples, false);
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
        let res: any = null;
        try {
          res = await apiFetch('/api/aql/items/permanently-remove', {
            method: 'POST',
            body: JSON.stringify({
              itemQr: activeQr,
              boxNumber: session.boxNumber,
              inspectionId: session.inspectionId,
              reason: removeReason || 'Damaged Garment Permanently Scrapped'
            })
          });
        } catch (err: any) {
          const errMsg = err?.message || 'Permanent deletion failed. The product was not removed from the active box. Please try again.';
          showToast(errMsg, 'error');
          setIsProcessingAction(false);
          return;
        }

        if (res && res.success === false) {
          if (res.error === 'ALREADY_REMOVED') {
            showToast(`Product '${activeQr}' has already been permanently removed.`, 'warning');
          } else {
            showToast(res.message || 'Permanent deletion failed.', 'error');
          }
          setIsProcessingAction(false);
          return;
        }

        let freshActiveQrs: string[] = [];
        try {
          const refreshedBoxRes = await apiFetch('/api/aql/boxes/scan', {
            method: 'POST',
            body: JSON.stringify({ boxNumber: session.boxNumber, stage: stageCode })
          });
          if (refreshedBoxRes?.box?.items) {
            freshActiveQrs = refreshedBoxRes.box.items.map((i: any) => i.qr_code);
          }
        } catch {
          freshActiveQrs = (session.boxItems || []).filter(
            (qr: string) => qr.trim().toUpperCase() !== activeQr.toUpperCase()
          );
        }

        const newSample = {
          sampleIndex: currentIdx,
          itemQr: activeQr,
          size: 'L',
          result: 'FAIL',
          actionType: 'PERMANENTLY_REMOVE',
          failureReason: removeReason || 'Scrapped'
        };

        const updatedSamples = [...completedSamples.filter(s => (s.itemQr || '').trim().toUpperCase() !== activeQr.trim().toUpperCase()), newSample];
        setCompletedSamples(updatedSamples);

        saveAQLSession({
          ...session,
          boxItems: freshActiveQrs,
          sampleRequired: freshActiveQrs.length,
          totalBoxQuantity: freshActiveQrs.length,
          samples: updatedSamples
        });

        const targetBoxNum = res?.boxNumber || session.boxNumber || 'box';
        setDeleteSuccessBanner({
          qr: activeQr,
          boxNumber: targetBoxNum
        });

        showToast(`✓ PERMANENTLY DELETED: ${activeQr} was removed from ${targetBoxNum}.`, 'success');
        setShowFailModal(false);
        setIsProcessingAction(false);

        const completedQrs = new Set(updatedSamples.map((s: any) => (s.itemQr || '').trim().toUpperCase()));
        const uninspectedItems = freshActiveQrs.filter((qr: string) => !completedQrs.has(qr.trim().toUpperCase()));

        if (uninspectedItems.length > 0) {
          const nextQr = uninspectedItems[0];
          const nextIdx = freshActiveQrs.findIndex((qr: string) => qr.trim().toUpperCase() === nextQr.trim().toUpperCase()) + 1;
          setCurrentIdx(nextIdx);
          setItemState('WAITING');
          setScannedQr('');
        } else {
          await finalizeInspection(updatedSamples, false);
        }
      } else {
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

        const updatedSamples = [...completedSamples.filter(s => (s.itemQr || '').trim().toUpperCase() !== activeQr.trim().toUpperCase()), newSample];
        setCompletedSamples(updatedSamples);

        showToast(`Item ${activeQr} recorded as FAIL (Reusable for Rework)`, 'info');
        setShowFailModal(false);
        setIsProcessingAction(false);

        const completedQrs = new Set(updatedSamples.map((s: any) => (s.itemQr || '').trim().toUpperCase()));
        const uninspectedItems = boxItemsList.filter((qr: string) => !completedQrs.has(qr.trim().toUpperCase()));

        if (uninspectedItems.length > 0) {
          const nextQr = uninspectedItems[0];
          const nextIdx = boxItemsList.findIndex((qr: string) => qr.trim().toUpperCase() === nextQr.trim().toUpperCase()) + 1;
          setCurrentIdx(nextIdx);
          setItemState('WAITING');
          setScannedQr('');

          saveAQLSession({
            ...session,
            currentSampleIndex: nextIdx,
            samples: updatedSamples
          });
        } else {
          await finalizeInspection(updatedSamples, false);
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to process defect action', 'error');
      setIsProcessingAction(false);
    }
  };

  // ── Finalize / Save Session (Supports Full or Partial Inspection) ─────────
  const finalizeInspection = async (finalSamples: any[], isExplicitFinish: boolean = false) => {
    const hasAnyFail = finalSamples.some(s => s.result === 'FAIL');
    const isAllInspected = finalSamples.length >= totalRequiredSamples;

    let finalResult: 'PASSED' | 'FAILED' | 'IN_PROGRESS' = 'IN_PROGRESS';
    if (hasAnyFail) {
      finalResult = 'FAILED';
    } else if (isAllInspected) {
      finalResult = 'PASSED';
    } else {
      finalResult = 'IN_PROGRESS';
    }

    if (finalResult === 'PASSED') {
      incrementAQLPassed();
    } else if (finalResult === 'FAILED') {
      incrementAQLFailed();
    }

    try {
      const payload = {
        result: finalResult,
        boxNumber: session.boxNumber,
        samples: finalSamples,
        stage: stageCode
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

    const resultRoute = isFinalAql ? '/operator/final-aql/result' : '/operator/aql/result';

    const finalSession = {
      ...session,
      samples: finalSamples,
      status: 'RESULT' as const,
      overallResult: finalResult
    };

    saveAQLSession(finalSession);
    const statusMsg = finalResult === 'IN_PROGRESS'
      ? `${stageTitle} Session Saved: ${finalSamples.length}/${totalRequiredSamples} items inspected.`
      : `${stageTitle} Inspection Complete: ${finalResult}`;
    showToast(statusMsg, 'success');
    navigate(resultRoute);
  };

  const handleFinishEarly = async () => {
    if (completedSamples.length === 0) {
      showToast(`Please inspect at least 1 item before finishing the ${stageTitle} session.`, 'warning');
      return;
    }
    await finalizeInspection(completedSamples, true);
  };

  // Accurate AQL Counts
  const passCount = completedSamples.filter(s => s.result === 'PASS').length;
  const failCount = completedSamples.filter(s => s.result === 'FAIL').length;
  const inspectedCount = completedSamples.length;
  const remainingCount = Math.max(0, totalRequiredSamples - inspectedCount);

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
          <span>{stageTitle} ({inspectedCount}/{totalRequiredSamples})</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Result</span>
        </div>
      </div>

      {/* Permanent Delete Success Notification Banner */}
      {deleteSuccessBanner && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1.5px solid #10B981',
          borderRadius: '16px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '50%', backgroundColor: '#10B981', color: '#041820' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#10B981', letterSpacing: '0.08em' }}>
                ✓ PERMANENTLY DELETED
              </span>
              <h4 style={{ margin: '2px 0 0 0', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {deleteSuccessBanner.qr} has been permanently removed from {deleteSuccessBanner.boxNumber}.
              </h4>
            </div>
          </div>
          <button
            onClick={() => setDeleteSuccessBanner(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Metrics Header Bar */}
      <div className="card" style={{ padding: '14px', backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px', borderRadius: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>Total Items</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalRequiredSamples}</span>
        </div>
        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px', borderRadius: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>Inspected</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)' }}>{inspectedCount}</span>
        </div>
        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px', borderRadius: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>Pass Count</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{passCount}</span>
        </div>
        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px', borderRadius: '10px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>Fail Count</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>{failCount}</span>
        </div>
      </div>

      {/* Main Inspection Card */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em' }}>
              {stageTitle} • BOX {session.boxNumber}
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
              Please select <strong>PASS</strong> or <strong>FAIL</strong> below before scanning the next item.
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

        {/* Explicit Finish Session Control */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Inspected: <strong>{inspectedCount} / {totalRequiredSamples}</strong> ({remainingCount} remaining)
          </span>
          <button
            type="button"
            onClick={handleFinishEarly}
            disabled={inspectedCount === 0}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 800,
              backgroundColor: inspectedCount > 0 ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-2)',
              border: '1.5px solid var(--primary-teal)',
              color: 'var(--primary-teal)',
              borderRadius: '12px',
              cursor: inspectedCount > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: inspectedCount > 0 ? 1 : 0.6
            }}
          >
            <CheckCircle2 size={16} /> Finish {stageTitle}
          </button>
        </div>
      </div>

      {/* ── Defect Action Modal ──────────────────────────────────────── */}
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
                  {stageTitle} Defect Action Required
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Item <strong>{scannedQr || expectedQr}</strong> in Box <strong>{session.boxNumber}</strong> was marked as <strong>FAILED</strong>. Select how to handle this product:
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Product remains in box and database. Operators can repair the garment for re-inspection later.
                </p>
              </div>

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
                    🗑️ PERMANENTLY REMOVE (Scrap Item)
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Item is permanently removed from active box.
                </p>
              </div>
            </div>

            {failAction === 'PERMANENTLY_REMOVE' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Reason for Permanent Removal:
                </label>
                <input
                  type="text"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Unrepairable fabric tear, severe oil stain..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShowFailModal(false)}
                className="btn btn-secondary"
                disabled={isProcessingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFailAction}
                disabled={isProcessingAction}
                className="btn btn-primary"
                style={{
                  backgroundColor: failAction === 'PERMANENTLY_REMOVE' ? '#EF4444' : '#8B5CF6',
                  color: '#FFFFFF'
                }}
              >
                {isProcessingAction ? 'Processing...' : 'Confirm Defect Action'}
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
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 20px',
  },
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
  },
  stepCompleted: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#10B981',
  },
  stepInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  stepNumActive: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
  },
  stepNumCompleted: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#10B981',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
  },
  stepNumInactive: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },
  stepDivider: {
    flex: 1,
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '0 12px',
  },
};
