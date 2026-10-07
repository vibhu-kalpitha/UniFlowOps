import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight, ShieldCheck, TestTube, Layers, QrCode, Plus, Trash2, Link2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import { formatQcTestModeDisplay } from '../../types';
import '../../styles/tokens.css';

interface ScannedItem {
  qr: string;
  product: string;
  size: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
}

interface StationStageSummary {
  qcResult: 'PASS' | 'FAIL' | 'PENDING';
  testResult: 'PASS' | 'FAIL' | 'PENDING';
  qcCompleted: boolean;
  testCompleted: boolean;
  isFullyCompleted: boolean;
}

interface StageStatus {
  mode?: string;
  station?: number;
  qcCompleted: boolean;
  testCompleted: boolean;
  qcResult: 'PASS' | 'FAIL' | 'PENDING';
  testResult: 'PASS' | 'FAIL' | 'PENDING';
  qcOperatorName?: string | null;
  qcScannedAt?: string | null;
  testOperatorName?: string | null;
  testScannedAt?: string | null;
  isFullyCompleted: boolean;
  nextPendingStage?: 'QC' | 'TEST' | 'NONE';
}

interface QcHistoryItem {
  attempt_number: number;
  qc_result: string;
  test_result: string;
  failure_reason?: string;
  scanned_at: string;
  operator_name?: string;
}

interface QcHistoryData {
  failCount: number;
  retryCount: number;
  history: QcHistoryItem[];
}

export const QCTestPage: React.FC = () => {
  const { activeJob, setActiveJob, incrementQCPassed, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const qcModeDisplay = formatQcTestModeDisplay(po?.qcTestMode);

  const [activeStation, setActiveStation] = useState<1 | 2>(1);
  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [station1Summary, setStation1Summary] = useState<StationStageSummary | null>(null);
  const [station2Summary, setStation2Summary] = useState<StationStageSummary | null>(null);

  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [qcFailureReason, setQcFailureReason] = useState<string>('');
  const [testFailureReason, setTestFailureReason] = useState<string>('');
  const [historyData, setHistoryData] = useState<QcHistoryData | null>(null);
  const [savingStage, setSavingStage] = useState<'STATION1' | 'QC' | 'TEST' | null>(null);
  const [savedStage, setSavedStage] = useState<'STATION1' | 'QC' | 'TEST' | 'ALL' | null>(null);

  // Pre-QC feature state
  const hasPreQc = Boolean(po?.selectedOperations?.includes('Pre QC'));
  const [preQcInput, setPreQcInput] = useState<string>('');
  const [collectedPreQcQrs, setCollectedPreQcQrs] = useState<string[]>([]);
  const [poProductInput, setPoProductInput] = useState<string>('');
  const [savingPreQc, setSavingPreQc] = useState<boolean>(false);
  const [assigningPreQc, setAssigningPreQc] = useState<boolean>(false);
  const [scannedPreQcItems, setScannedPreQcItems] = useState<string[]>([]);

  const handleAddPreQcQr = async (overrideQr?: string) => {
    const codeToSave = (overrideQr || preQcInput).trim().toUpperCase();
    if (!codeToSave) {
      showToast('Please enter or scan a Pre-QC QR', 'warning');
      return;
    }
    if (collectedPreQcQrs.includes(codeToSave)) {
      showToast(`Pre-QC QR ${codeToSave} is already in the list`, 'warning');
      setPreQcInput('');
      return;
    }

    setSavingPreQc(true);
    try {
      await apiFetch('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          preQcQr: codeToSave
        })
      });
      setCollectedPreQcQrs(prev => [...prev, codeToSave]);
      showToast(`✅ Saved Pre-QC QR: ${codeToSave}`, 'success');
      setPreQcInput('');
    } catch (err: any) {
      showToast(`Failed to record Pre-QC QR: ${err?.message || err}`, 'error');
    } finally {
      setSavingPreQc(false);
    }
  };

  const handleRemovePreQcQr = (index: number) => {
    setCollectedPreQcQrs(prev => prev.filter((_, i) => i !== index));
  };

  const handleAssignPreQcToPoProduct = async () => {
    const targetProductQr = poProductInput.trim().toUpperCase();
    if (collectedPreQcQrs.length === 0) {
      showToast('Please add at least one Pre-QC QR to assign', 'warning');
      return;
    }
    if (!targetProductQr) {
      showToast('Please enter or scan a PO Product QR', 'warning');
      return;
    }

    setAssigningPreQc(true);
    try {
      await apiFetch('/api/pre-qc/assign', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          poProductQr: targetProductQr,
          preQcQrs: collectedPreQcQrs
        })
      });

      showToast(`✅ Assigned ${collectedPreQcQrs.length} Pre-QC QRs to PO Product ${targetProductQr}`, 'success');
      setScannedPreQcItems([...collectedPreQcQrs]);
      setCollectedPreQcQrs([]);
      setPoProductInput('');
    } catch (err: any) {
      const msg = err?.message || err?.error || 'Failed to assign Pre-QC QRs';
      showToast(`Assign Error: ${msg}`, 'error');
    } finally {
      setAssigningPreQc(false);
    }
  };

  // Authoritative backend progress state
  const [poProgress, setPoProgress] = useState<{
    loading: boolean;
    targetQuantity: number;
    inspectedUnique: number;
    passedUnique: number;
    failedUnique: number;
    remainingToInspect: number;
    remainingToPass: number;
    operatorStats: {
      operatorName: string;
      passedCount: number;
      failedCount: number;
    };
    error?: string;
  }>({
    loading: true,
    targetQuantity: po?.totalQuantity || 10,
    inspectedUnique: 0,
    passedUnique: 0,
    failedUnique: 0,
    remainingToInspect: po?.totalQuantity || 10,
    remainingToPass: po?.totalQuantity || 10,
    operatorStats: {
      operatorName: 'Operator',
      passedCount: 0,
      failedCount: 0
    }
  });

  const fetchProgress = async () => {
    const targetPoKey = po?.dbId || po?.id || 'PO-2026-0184';
    setPoProgress(prev => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await apiFetch(`/api/qc/progress/${targetPoKey}`);
      if (res && typeof res.passedUnique === 'number') {
        setPoProgress({
          loading: false,
          targetQuantity: res.targetQuantity,
          inspectedUnique: res.inspectedUnique,
          passedUnique: res.passedUnique,
          failedUnique: res.failedUnique,
          remainingToInspect: res.remainingToInspect,
          remainingToPass: res.remainingToPass,
          operatorStats: res.operatorStats || {
            operatorName: 'Operator',
            passedCount: 0,
            failedCount: 0
          }
        });
      } else {
        setPoProgress(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setPoProgress(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchProgress();
  }, [po?.dbId, po?.id]);

  const targetPoQty = poProgress.targetQuantity || po?.totalQuantity || 10;
  const qcPassedQty = poProgress.passedUnique;
  const remainingQcQty = poProgress.remainingToPass;
  const isQCComplete = poProgress.passedUnique >= targetPoQty;

  /* ── scan handler ──────────────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    setSavedStage(null);
    setQcFailureReason('');
    setTestFailureReason('');
    setHistoryData(null);
    setStageStatus(null);
    setStation1Summary(null);
    setStation2Summary(null);

    try {
      const hRes = await apiFetch(`/api/qc/history/${code}`);
      if (hRes) {
        setHistoryData({
          failCount: hRes.failCount || 0,
          retryCount: hRes.retryCount || 0,
          history: hRes.history || []
        });
      }
    } catch {
      setHistoryData(null);
    }

    try {
      const res = await apiFetch('/api/qc/scan', {
        method: 'POST',
        body: JSON.stringify({
          code,
          productionOrderId: po?.dbId || po?.id,
          productionOrderNumber: po?.id,
          station: activeStation
        }),
      });

      if (res?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: res.progress.targetQuantity,
          inspectedUnique: res.progress.inspectedUnique,
          passedUnique: res.progress.passedUnique,
          failedUnique: res.progress.failedUnique,
          remainingToInspect: res.progress.remainingToInspect,
          remainingToPass: res.progress.remainingToPass,
        }));
      }

      if (res.station1) setStation1Summary(res.station1);
      if (res.station2) setStation2Summary(res.station2);
      if (Array.isArray(res.preQcItems)) {
        setScannedPreQcItems(res.preQcItems);
      } else {
        setScannedPreQcItems([]);
      }

      const stStatus: StageStatus = res.stageStatus || {
        qcResult: 'PENDING',
        testResult: 'PENDING',
        qcCompleted: false,
        testCompleted: false,
        isFullyCompleted: false,
        station: activeStation
      };

      setStageStatus(stStatus);

      if (res.status === 'FULLY_COMPLETED' || stStatus.isFullyCompleted) {
        setScannedItem({
          qr: res.item?.qr_code || code,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
        });
        showToast(`⚠️ Inspection already completed for item ${code} at Station ${activeStation}.`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY Completed at Station ${activeStation}!`,
          code: res.item?.qr_code || code,
        };
      }

      setScannedItem({
        qr: res.item?.qr_code || code,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: res.item?.size || 'L',
        status: 'VALID',
      });

      setQcResult('PASS');
      setTestResult('PASS');

      showToast(`✅ ${code} scanned successfully for Station ${activeStation}`, 'success');

      return {
        status: 'accepted' as const,
        message: res.message || `✅ ${code} scanned successfully`,
        code: res.item?.qr_code || code,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'CONFIG_NOT_SELECTED' || err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('not selected') || errMsg.includes('does not belong')) {
        const redMsg = `Unselected Configuration — '${code}' does not belong to Production Order ${po?.id || ''}.`;
        showToast(redMsg, 'error');
        setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
        return {
          status: 'rejected' as const,
          message: redMsg,
          code,
        };
      }

      if (err?.error === 'CONFIG_NOT_FOUND' || err?.error === 'QR_RANGE_NOT_CONFIGURED' || errMsg.includes('not configured')) {
        const notConfigMsg = `No product configurations found for Production Order ${po?.id || ''}. Please contact supervisor.`;
        showToast(notConfigMsg, 'error');
        setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
        return {
          status: 'rejected' as const,
          message: notConfigMsg,
          code,
        };
      }

      showToast(`Scan Error: ${errMsg}`, 'error');
      setScannedItem({ qr: code, product: po?.styleName || 'Garment', size: '—', status: 'INVALID' });
      return {
        status: 'rejected' as const,
        message: `Error: ${errMsg}`,
        code,
      };
    }
  };

  /* ── Station 1 Combined Save Handler ─────────────────────────── */
  const handleSaveStation1Combined = async () => {
    if (!scannedItem) {
      showToast('Please scan a garment QR first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid item.', 'error');
      return;
    }
    if (!qcResult || !testResult) {
      showToast('Please select both Endline Inspection and Functional Test results before saving.', 'warning');
      return;
    }
    if (savingStage) return;

    setSavingStage('STATION1');
    const key = `qc-st1-${po?.id || 'po'}-${scannedItem.qr}-${Date.now()}`;

    try {
      const saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: key,
          itemQr: scannedItem.qr,
          productionOrderId: po?.dbId || po?.id,
          productionOrderNumber: po?.id,
          station: 1,
          qcResult,
          testResult,
          failureReason: qcResult === 'FAIL' ? qcFailureReason : undefined,
          testFailureReason: testResult === 'FAIL' ? testFailureReason : undefined
        })
      });

      if (saveRes?.isDuplicate) {
        showToast(`⚠️ ${saveRes.message}`, 'warning');
        setSavingStage(null);
        return;
      }

      showToast('✅ Endline Inspection & Functional Test saved successfully for Station 1!', 'success');
      setSavedStage('ALL');
      incrementQCPassed();

      if (saveRes?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: saveRes.progress.targetQuantity,
          inspectedUnique: saveRes.progress.inspectedUnique,
          passedUnique: saveRes.progress.passedUnique,
          failedUnique: saveRes.progress.failedUnique,
          remainingToInspect: saveRes.progress.remainingToInspect,
          remainingToPass: saveRes.progress.remainingToPass,
        }));
      }
      await fetchProgress();

      setTimeout(() => {
        setScannedItem(null);
        setStageStatus(null);
        setQcResult('PASS');
        setTestResult('PASS');
        setQcFailureReason('');
        setTestFailureReason('');
        setHistoryData(null);
        setSavedStage(null);
        setSavingStage(null);
      }, 1200);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'UNAUTHORIZED_STAGE') {
        showToast(`⛔ ${errMsg}`, 'error');
      } else {
        showToast(`Save failed: ${errMsg}`, 'error');
      }
      setSavingStage(null);
    }
  };

  /* ── Station 2 Independent Save Handler ───────────────────────── */
  const handleSaveStation2Independent = async (targetStage: 'QC' | 'TEST') => {
    if (!scannedItem) {
      showToast('Please scan a garment QR first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid item.', 'error');
      return;
    }
    if (savingStage) return;

    setSavingStage(targetStage);
    const key = `qc-st2-${targetStage.toLowerCase()}-${po?.id || 'po'}-${scannedItem.qr}-${Date.now()}`;
    const resultVal = targetStage === 'QC' ? qcResult : testResult;
    const reasonVal = targetStage === 'QC' ? qcFailureReason : testFailureReason;

    try {
      const payload: any = {
        idempotencyKey: key,
        itemQr: scannedItem.qr,
        productionOrderId: po?.dbId || po?.id,
        productionOrderNumber: po?.id,
        station: 2,
        stage: targetStage,
        failureReason: resultVal === 'FAIL' ? reasonVal : undefined,
      };

      if (targetStage === 'QC') {
        payload.qcResult = qcResult;
      } else {
        payload.testResult = testResult;
      }

      const saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (saveRes?.isDuplicate) {
        showToast(`⚠️ ${saveRes.message}`, 'warning');
        setSavingStage(null);
        return;
      }

      const stageName = targetStage === 'QC' ? 'Endline Inspection' : 'Functional Test';
      showToast(`${stageName} result saved successfully.`, 'success');
      setSavedStage(targetStage);

      if (saveRes?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: saveRes.progress.targetQuantity,
          inspectedUnique: saveRes.progress.inspectedUnique,
          passedUnique: saveRes.progress.passedUnique,
          failedUnique: saveRes.progress.failedUnique,
          remainingToInspect: saveRes.progress.remainingToInspect,
          remainingToPass: saveRes.progress.remainingToPass,
        }));
      }
      await fetchProgress();

      setSavingStage(null);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'UNAUTHORIZED_STAGE') {
        showToast(`⛔ ${errMsg}`, 'error');
      } else {
        showToast(`Save failed: ${errMsg}`, 'error');
      }
      setSavingStage(null);
    }
  };

  if (!po || showPoSelector) {
    return (
      <div className="workflow-container">
        <SelectPOForOperation
          operationName="QC Test"
          isModal={true}
          selectedPoId={po?.id || po?.dbId}
          onClose={po ? () => setShowPoSelector(false) : undefined}
          onSelectPo={(selectedPo) => {
            setActiveJob({ productionOrder: selectedPo });
            setShowPoSelector(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="workflow-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Inspection Station • {formatPoDisplayName(po)}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Configured Mode: <strong style={{ color: 'var(--primary-teal)' }}>{qcModeDisplay}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setShowPoSelector(true)}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <ArrowLeftRight size={14} /> Switch PO
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} color="var(--color-green)" />
              <span style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 700 }}>
                Scanner Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* STATION SELECTOR (Only shown in combined mode) */}
      {qcModeDisplay === 'Endline Inspection & Functional Test' && (
        <div style={{ display: 'flex', gap: '10px', backgroundColor: 'var(--bg-surface-1)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => { setActiveStation(1); setScannedItem(null); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '10px',
              border: activeStation === 1 ? '2px solid var(--primary-teal)' : '1px solid transparent',
              backgroundColor: activeStation === 1 ? 'rgba(22, 184, 174, 0.15)' : 'transparent',
              color: activeStation === 1 ? 'var(--primary-teal)' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Layers size={16} /> Station 1 — Endline Inspection &amp; Functional Test (Combined Save)
          </button>
          <button
            type="button"
            onClick={() => { setActiveStation(2); setScannedItem(null); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '10px',
              border: activeStation === 2 ? '2px solid var(--primary-teal)' : '1px solid transparent',
              backgroundColor: activeStation === 2 ? 'rgba(22, 184, 174, 0.15)' : 'transparent',
              color: activeStation === 2 ? 'var(--primary-teal)' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Layers size={16} /> Station 2 — Endline Inspection &amp; Functional Test (Separate Saves)
          </button>
        </div>
      )}

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Scanner & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* PO Progress Card */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            <div style={{ marginBottom: '10px', padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(22, 184, 174, 0.08)', border: '1px solid rgba(22, 184, 174, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                  MY PROGRESS — {poProgress.operatorStats.operatorName}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>
                  {Math.round((poProgress.operatorStats.passedCount / (targetPoQty || 1)) * 100)}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Passed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{poProgress.operatorStats.passedCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Failed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#EF4444' }}>{poProgress.operatorStats.failedCount}</span>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '10px 8px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>My Processed</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                    {poProgress.operatorStats.passedCount + poProgress.operatorStats.failedCount}
                  </span>
                </div>
              </div>
              <ProgressBar current={poProgress.operatorStats.passedCount} total={targetPoQty} height={8} />
            </div>

            <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>PO TOTAL</span>
              <div style={{ display: 'flex', gap: '12px', color: 'var(--text-primary)', fontWeight: 600, flexWrap: 'wrap' }}>
                <span>Target: <strong>{targetPoQty}</strong></span>
                <span>Passed: <strong style={{ color: '#10B981' }}>{qcPassedQty}</strong></span>
                <span>Remaining: <strong style={{ color: 'var(--primary-teal)' }}>{remainingQcQty}</strong></span>
                <span>Overall: <strong>{Math.round((qcPassedQty / (targetPoQty || 1)) * 100)}%</strong></span>
              </div>
            </div>

            {isQCComplete && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', borderRadius: '10px', marginTop: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#10B981' }}>
                  ✅ Inspection Complete — {qcPassedQty}/{targetPoQty} passed
                </span>
              </div>
            )}
          </div>

          {/* PRE-QC SECTION (Conditional: Only when PO has Pre QC enabled) */}
          {hasPreQc && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px dashed var(--primary-teal)', margin: 0, padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <QrCode size={18} color="var(--primary-teal)" />
                <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal)', margin: 0 }}>
                  PRE QC CAPTURE &amp; LINKING
                </h4>
              </div>

              {/* 1. Scan Pre-QC QR */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Scan Pre-QC QR (e.g. OMP/34567, EVT/34545)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={preQcInput}
                    onChange={(e) => setPreQcInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreQcQr(); }}
                    placeholder="Enter/scan Pre-QC QR..."
                    style={{ ...styles.textInput, flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleAddPreQcQr()}
                    disabled={savingPreQc}
                    style={{ padding: '8px 12px', fontWeight: 700, fontSize: '12px', backgroundColor: 'var(--primary-teal)', color: '#fff' }}
                  >
                    {savingPreQc ? 'Saving...' : '[ SAVE PRE QC ]'}
                  </button>
                </div>
              </div>

              {/* Saved Pre-QC Products */}
              {collectedPreQcQrs.length > 0 && (
                <div style={{ marginBottom: '14px', backgroundColor: 'var(--bg-surface-2)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Saved Pre-QC Products ({collectedPreQcQrs.length}):
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                    {collectedPreQcQrs.map((qr, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-1)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
                        <code style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{idx + 1}. {qr}</code>
                        <button type="button" onClick={() => handleRemovePreQcQr(idx)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Assign to PO Product */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Assign to PO Product QR (e.g. PNFLSS01)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={poProductInput}
                    onChange={(e) => setPoProductInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAssignPreQcToPoProduct(); }}
                    placeholder="Scan PO Product QR..."
                    style={{ ...styles.textInput, flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAssignPreQcToPoProduct}
                    disabled={assigningPreQc || collectedPreQcQrs.length === 0}
                    style={{ padding: '8px 12px', fontWeight: 800, fontSize: '12px' }}
                  >
                    {assigningPreQc ? 'Assigning...' : '[ SAVE / ASSIGN ]'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
          <ScannerInput onScan={handleScanCode} placeholder={`Scan barcode for Station ${activeStation} inspection...`} />

          {!scannedItem ? (
            <div style={styles.emptyCard}>
              <ScanLine size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for scan at Station {activeStation}…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a garment QR code to open inspection details
              </span>
            </div>
          ) : (
            <>
              <div
                className="card"
                style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  borderColor: scannedItem.status === 'INVALID'
                    ? 'rgba(239,68,68,0.5)'
                    : scannedItem.status === 'DUPLICATE'
                    ? 'rgba(245,158,11,0.5)'
                    : 'rgba(16,185,129,0.4)',
                  borderWidth: '1.5px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={styles.cardHeaderTitle}>ITEM DETAILS • STATION {activeStation}</span>
                  {activeStation === 1 && station1Summary?.isFullyCompleted && (
                    <StatusPill label="Station 1 Done" variant="green" />
                  )}
                  {activeStation === 2 && station2Summary?.isFullyCompleted && (
                    <StatusPill label="Station 2 Done" variant="green" />
                  )}
                </div>

                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Barcode / QR</span>
                  <span style={{ ...styles.detailValue, color: 'var(--primary-teal)', fontSize: '16px' }}>
                    {scannedItem.qr}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Style</span>
                  <span style={styles.detailValue}>{scannedItem.product}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Size</span>
                  <span style={styles.detailValue}>{scannedItem.size}</span>
                </div>
                <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
                  <span style={styles.detailLabel}>Validation</span>
                  {scannedItem.status === 'VALID' && <StatusPill label="✅ Valid — In Range" variant="green" />}
                  {scannedItem.status === 'DUPLICATE' && <StatusPill label="⚠️ Station Completed" variant="amber" />}
                  {scannedItem.status === 'INVALID' && <StatusPill label="❌ Out of Range" variant="red" />}
                </div>

                {historyData && historyData.failCount > 0 && (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#f87171' }}>
                      ⚠️ Previously Failed {historyData.failCount} time(s)!
                    </span>
                  </div>
                )}

                {scannedPreQcItems.length > 0 && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(22, 184, 174, 0.08)',
                    border: '1px solid rgba(22, 184, 174, 0.3)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Link2 size={15} color="var(--primary-teal)" />
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                        Assigned Pre-QC Products ({scannedPreQcItems.length}):
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {scannedPreQcItems.map((preQr, idx) => (
                        <div key={idx} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{idx + 1}.</span>
                          <code style={{ backgroundColor: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px' }}>{preQr}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* STATION 1 WORKFLOW (COMBINED SAVE) */}
              {(qcModeDisplay === 'Endline Inspection & Functional Test' && activeStation === 1) && (
                <div style={styles.stageCard}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal)', marginBottom: '12px' }}>
                    Station 1 — Endline Inspection &amp; Functional Test
                  </h4>

                  {/* Endline Inspection Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={styles.controlLabel}>
                      <ShieldCheck size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Endline Inspection
                    </span>
                    <div style={styles.segmentRow}>
                      <button
                        type="button"
                        style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                        onClick={() => setQcResult('PASS')}
                      >
                        <Check size={18} /> PASS
                      </button>
                      <button
                        type="button"
                        style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                        onClick={() => setQcResult('FAIL')}
                      >
                        <XCircle size={18} /> FAIL
                      </button>
                    </div>
                    {qcResult === 'FAIL' && (
                      <input
                        type="text"
                        value={qcFailureReason}
                        onChange={(e) => setQcFailureReason(e.target.value)}
                        placeholder="Endline Inspection Failure Reason..."
                        style={{ ...styles.textInput, marginTop: '8px' }}
                      />
                    )}
                  </div>

                  {/* Functional Test Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={styles.controlLabel}>
                      <TestTube size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Functional Test
                    </span>
                    <div style={styles.segmentRow}>
                      <button
                        type="button"
                        style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                        onClick={() => setTestResult('PASS')}
                      >
                        <Check size={18} /> PASS
                      </button>
                      <button
                        type="button"
                        style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                        onClick={() => setTestResult('FAIL')}
                      >
                        <XCircle size={18} /> FAIL
                      </button>
                    </div>
                    {testResult === 'FAIL' && (
                      <input
                        type="text"
                        value={testFailureReason}
                        onChange={(e) => setTestFailureReason(e.target.value)}
                        placeholder="Functional Test Failure Reason..."
                        style={{ ...styles.textInput, marginTop: '8px' }}
                      />
                    )}
                  </div>

                  {/* ONE COMBINED SAVE BUTTON */}
                  <button
                    className="btn-primary"
                    onClick={handleSaveStation1Combined}
                    disabled={savingStage !== null}
                    style={{
                      width: '100%',
                      height: '46px',
                      fontSize: '14px',
                      fontWeight: 800,
                      background: savedStage === 'ALL' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                    }}
                  >
                    {savingStage === 'STATION1' ? 'Saving Station 1...' : savedStage === 'ALL' ? '✅ Station 1 Saved!' : '[ SAVE ENDLINE + FUNCTIONAL TEST ]'}
                  </button>
                </div>
              )}

              {/* STATION 2 WORKFLOW (SEPARATE SAVES) */}
              {(qcModeDisplay === 'Endline Inspection & Functional Test' && activeStation === 2) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Endline Inspection Section */}
                  <div style={styles.stageCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={styles.controlLabel}>
                        <ShieldCheck size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Endline Inspection (Station 2)
                      </span>
                    </div>

                    <div style={styles.segmentRow}>
                      <button
                        type="button"
                        style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                        onClick={() => setQcResult('PASS')}
                      >
                        <Check size={18} /> PASS
                      </button>
                      <button
                        type="button"
                        style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                        onClick={() => setQcResult('FAIL')}
                      >
                        <XCircle size={18} /> FAIL
                      </button>
                    </div>

                    {qcResult === 'FAIL' && (
                      <input
                        type="text"
                        value={qcFailureReason}
                        onChange={(e) => setQcFailureReason(e.target.value)}
                        placeholder="Endline Inspection Failure Reason..."
                        style={{ ...styles.textInput, marginTop: '8px' }}
                      />
                    )}

                    <button
                      className="btn-primary"
                      onClick={() => handleSaveStation2Independent('QC')}
                      disabled={savingStage !== null}
                      style={{
                        marginTop: '10px',
                        width: '100%',
                        background: savedStage === 'QC' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                      }}
                    >
                      {savingStage === 'QC' ? 'Saving Endline Inspection...' : savedStage === 'QC' ? '✅ Endline Inspection Saved!' : '[ SAVE ENDLINE INSPECTION ]'}
                    </button>
                  </div>

                  {/* Functional Test Section */}
                  <div style={styles.stageCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={styles.controlLabel}>
                        <TestTube size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Functional Test (Station 2)
                      </span>
                    </div>

                    <div style={styles.segmentRow}>
                      <button
                        type="button"
                        style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                        onClick={() => setTestResult('PASS')}
                      >
                        <Check size={18} /> PASS
                      </button>
                      <button
                        type="button"
                        style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                        onClick={() => setTestResult('FAIL')}
                      >
                        <XCircle size={18} /> FAIL
                      </button>
                    </div>

                    {testResult === 'FAIL' && (
                      <input
                        type="text"
                        value={testFailureReason}
                        onChange={(e) => setTestFailureReason(e.target.value)}
                        placeholder="Functional Test Failure Reason..."
                        style={{ ...styles.textInput, marginTop: '8px' }}
                      />
                    )}

                    <button
                      className="btn-primary"
                      onClick={() => handleSaveStation2Independent('TEST')}
                      disabled={savingStage !== null}
                      style={{
                        marginTop: '10px',
                        width: '100%',
                        background: savedStage === 'TEST' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                      }}
                    >
                      {savingStage === 'TEST' ? 'Saving Functional Test...' : savedStage === 'TEST' ? '✅ Functional Test Saved!' : '[ SAVE FUNCTIONAL TEST ]'}
                    </button>
                  </div>
                </div>
              )}

              {/* SINGLE MODE: ENDLINE INSPECTION ONLY */}
              {qcModeDisplay === 'Endline Inspection' && (
                <div style={styles.stageCard}>
                  <span style={styles.controlLabel}>
                    <ShieldCheck size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Endline Inspection
                  </span>
                  <div style={styles.segmentRow}>
                    <button
                      type="button"
                      style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                      onClick={() => setQcResult('PASS')}
                    >
                      <Check size={18} /> PASS
                    </button>
                    <button
                      type="button"
                      style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                      onClick={() => setQcResult('FAIL')}
                    >
                      <XCircle size={18} /> FAIL
                    </button>
                  </div>
                  {qcResult === 'FAIL' && (
                    <input
                      type="text"
                      value={qcFailureReason}
                      onChange={(e) => setQcFailureReason(e.target.value)}
                      placeholder="Endline Inspection Failure Reason..."
                      style={{ ...styles.textInput, marginTop: '8px' }}
                    />
                  )}
                  <button
                    className="btn-primary"
                    onClick={() => handleSaveStation2Independent('QC')}
                    disabled={savingStage !== null}
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      background: savedStage === 'QC' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                    }}
                  >
                    {savingStage === 'QC' ? 'Saving...' : savedStage === 'QC' ? '✅ Saved!' : '[ SAVE ENDLINE INSPECTION ]'}
                  </button>
                </div>
              )}

              {/* SINGLE MODE: FUNCTIONAL TEST ONLY */}
              {qcModeDisplay === 'Functional Test' && (
                <div style={styles.stageCard}>
                  <span style={styles.controlLabel}>
                    <TestTube size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Functional Test
                  </span>
                  <div style={styles.segmentRow}>
                    <button
                      type="button"
                      style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                      onClick={() => setTestResult('PASS')}
                    >
                      <Check size={18} /> PASS
                    </button>
                    <button
                      type="button"
                      style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                      onClick={() => setTestResult('FAIL')}
                    >
                      <XCircle size={18} /> FAIL
                    </button>
                  </div>
                  {testResult === 'FAIL' && (
                    <input
                      type="text"
                      value={testFailureReason}
                      onChange={(e) => setTestFailureReason(e.target.value)}
                      placeholder="Functional Test Failure Reason..."
                      style={{ ...styles.textInput, marginTop: '8px' }}
                    />
                  )}
                  <button
                    className="btn-primary"
                    onClick={() => handleSaveStation2Independent('TEST')}
                    disabled={savingStage !== null}
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      background: savedStage === 'TEST' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                    }}
                  >
                    {savingStage === 'TEST' ? 'Saving...' : savedStage === 'TEST' ? '✅ Saved!' : '[ SAVE FUNCTIONAL TEST ]'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel: Context Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-right-panel">
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              INSPECTION SPECIFICATIONS
            </span>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Production Order:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po?.id || 'PO-2026-0184'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Garment Style:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{po?.styleName || po?.styleCode || 'Standard'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Mode:</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{qcModeDisplay}</span>
              </div>
              {po?.productConfigurations && po.productConfigurations.length > 0 && (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>CONFIGURED RANGES:</span>
                  {po.productConfigurations.map((cfg, idx) => (
                    <div key={idx} style={{ fontSize: '11px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      • {cfg.configCode}: {cfg.productQrPrefix}{cfg.productSerialStart} → {cfg.productQrPrefix}{cfg.productSerialEnd} ({cfg.quantity} pcs)
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              STATION INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li><strong>Station 1:</strong> Perform Endline Inspection &amp; Functional Test. Select both PASS/FAIL and click [ SAVE ENDLINE + FUNCTIONAL TEST ].</li>
              <li><strong>Station 2:</strong> Independent station. Save Endline Inspection or Functional Test independently when completed.</li>
              <li>Station 1 and Station 2 results are tracked separately.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 14px',
  },
  emptyCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '2px dashed var(--border-color)',
    borderRadius: '18px',
    padding: '32px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  stageCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '14px',
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginBottom: '12px',
    display: 'block',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  detailLabel: { fontSize: '13px', color: 'var(--text-secondary)' },
  detailValue: { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' },
  controlLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
  },
  textInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  },
  segmentRow: { display: 'flex', gap: '10px' },
  segmentBtn: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  passBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(24,184,121,0.35)',
    border: 'none',
  },
  failBtnActive: {
    flex: 1,
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-red)',
    color: '#fff',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(239,92,92,0.35)',
    border: 'none',
  },
};
