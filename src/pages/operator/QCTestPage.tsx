import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight, ShieldCheck, TestTube } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import '../../styles/tokens.css';

interface ScannedItem {
  qr: string;
  product: string;
  size: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
}

interface StageStatus {
  mode?: string;
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
  const qcMode = po?.qcTestMode || 'QC & Test';
  const stationCount = po?.qcStationCount || (po as any)?.qc_station_count || (po as any)?.stationCount || 2;

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [qcSelected, setQcSelected] = useState<boolean>(false);
  const [testSelected, setTestSelected] = useState<boolean>(false);
  const [qcFailureReason, setQcFailureReason] = useState<string>('');
  const [testFailureReason, setTestFailureReason] = useState<string>('');
  const [historyData, setHistoryData] = useState<QcHistoryData | null>(null);
  const [savingStage, setSavingStage] = useState<'QC' | 'TEST' | 'ALL' | null>(null);
  const [savedStage, setSavedStage] = useState<'QC' | 'TEST' | 'ALL' | null>(null);

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
        body: JSON.stringify({ code, productionOrderId: po?.dbId || po?.id, productionOrderNumber: po?.id }),
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

      const stStatus: StageStatus = res.stageStatus || {
        qcResult: 'PENDING',
        testResult: 'PENDING',
        qcCompleted: false,
        testCompleted: false,
        isFullyCompleted: false,
      };

      setStageStatus(stStatus);

      if (res.status === 'FULLY_COMPLETED' || stStatus.isFullyCompleted) {
        setScannedItem({
          qr: res.item?.qr_code || code,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
        });
        showToast(`⚠️ ${qcMode} already completed for item ${code}.`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY ${qcMode} Completed!`,
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
      setQcSelected(false);
      setTestSelected(false);

      if (stStatus.qcCompleted && !stStatus.testCompleted) {
        showToast(`ℹ️ QC already completed for ${code}. Test stage is pending.`, 'info');
      } else if (stStatus.testCompleted && !stStatus.qcCompleted) {
        showToast(`ℹ️ Test already completed for ${code}. QC stage is pending.`, 'info');
      } else {
        showToast(`✅ ${code} scanned successfully`, 'success');
      }

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

  /* ── save stage handler ──────────────────────────────────────────── */
  const handleSaveStage = async (stageToSave: 'QC' | 'TEST') => {
    if (!scannedItem) {
      showToast('Please scan a garment QR first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid item.', 'error');
      return;
    }
    if (stageStatus?.isFullyCompleted) {
      showToast('Item is already fully completed.', 'warning');
      return;
    }
    if (savingStage) return;

    setSavingStage(stageToSave);
    const key = `qc-${stageToSave.toLowerCase()}-${po?.id || 'po'}-${scannedItem.qr}-${Date.now()}`;
    let saveRes: any = null;

    const resultVal = stageToSave === 'QC' ? qcResult : testResult;
    const reasonVal = stageToSave === 'QC' ? qcFailureReason : testFailureReason;

    try {
      const payload: any = {
        idempotencyKey: key,
        itemQr: scannedItem.qr,
        productionOrderId: po?.dbId || po?.id,
        productionOrderNumber: po?.id || 'PO-2026-0184',
        stage: stageToSave,
        failureReason: resultVal === 'FAIL' ? reasonVal : undefined,
      };

      if (stageToSave === 'QC') {
        payload.qcResult = qcResult;
      } else {
        payload.testResult = testResult;
      }

      saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'UNAUTHORIZED_STAGE') {
        showToast(`⛔ ${errMsg}`, 'error');
      } else if (err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('does not belong')) {
        const expMsg = err?.expectedRange ? ` (Expected range: ${err.expectedRange})` : '';
        showToast(`Out of range — this QR does not belong to Production Order ${po?.id || ''}.${expMsg}`, 'error');
      } else {
        showToast(`Save failed: ${errMsg}`, 'error');
      }
      setSavingStage(null);
      return;
    }

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

    const newStageStatus: StageStatus = saveRes?.stageStatus || {
      qcCompleted: stageToSave === 'QC' ? resultVal === 'PASS' : (stageStatus?.qcCompleted || false),
      testCompleted: stageToSave === 'TEST' ? resultVal === 'PASS' : (stageStatus?.testCompleted || false),
      qcResult: stageToSave === 'QC' ? resultVal : (stageStatus?.qcResult || 'PENDING'),
      testResult: stageToSave === 'TEST' ? resultVal : (stageStatus?.testResult || 'PENDING'),
      isFullyCompleted: false,
    };

    const isFullyCompleteNow = (qcMode === 'QC Only' && newStageStatus.qcCompleted) ||
      (qcMode === 'Test Only' && newStageStatus.testCompleted) ||
      (newStageStatus.qcCompleted && newStageStatus.testCompleted);

    newStageStatus.isFullyCompleted = isFullyCompleteNow;
    setStageStatus(newStageStatus);

    if (resultVal === 'PASS') {
      showToast(`✅ ${stageToSave} stage PASSED for ${scannedItem.qr}!`, 'success');
    } else {
      showToast(`❌ ${stageToSave} stage FAILED for ${scannedItem.qr}`, 'warning');
    }

    setSavingStage(null);
    setSavedStage(stageToSave);

    if (isFullyCompleteNow) {
      incrementQCPassed();
      setSavedStage('ALL');
      showToast(`🎉 ALL STAGES (${qcMode}) COMPLETED for ${scannedItem.qr}!`, 'success');
      setTimeout(() => {
        setScannedItem(null);
        setStageStatus(null);
        setQcResult('PASS');
        setTestResult('PASS');
        setQcSelected(false);
        setTestSelected(false);
        setQcFailureReason('');
        setTestFailureReason('');
        setHistoryData(null);
        setSavedStage(null);
      }, 1500);
    }
  };

  /* ── combined 1-station save handler ────────────────────────────── */
  const handleSaveCombined = async () => {
    if (!scannedItem) {
      showToast('Please scan a garment QR first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid item.', 'error');
      return;
    }
    if (stageStatus?.isFullyCompleted) {
      showToast('Item is already fully completed.', 'warning');
      return;
    }
    if (savingStage) return;

    if (!qcSelected || !testSelected) {
      showToast('Both Endline Inspection and Functional Test results must be selected before saving.', 'error');
      return;
    }

    setSavingStage('ALL');
    const key = `qc-combined-${po?.id || 'po'}-${scannedItem.qr}-${Date.now()}`;
    let saveRes: any = null;

    const combinedFailureReason = [
      qcResult === 'FAIL' ? `Endline: ${qcFailureReason || 'Defect'}` : null,
      testResult === 'FAIL' ? `Test: ${testFailureReason || 'Defect'}` : null,
    ].filter(Boolean).join(' | ');

    try {
      const payload: any = {
        idempotencyKey: key,
        itemQr: scannedItem.qr,
        productionOrderId: po?.dbId || po?.id,
        productionOrderNumber: po?.id || 'PO-2026-0184',
        stage: 'ALL',
        qcResult,
        testResult,
        failureReason: (qcResult === 'FAIL' || testResult === 'FAIL') ? combinedFailureReason : undefined,
      };

      saveRes = await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.error === 'UNAUTHORIZED_STAGE') {
        showToast(`⛔ ${errMsg}`, 'error');
      } else if (err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('does not belong')) {
        const expMsg = err?.expectedRange ? ` (Expected range: ${err.expectedRange})` : '';
        showToast(`Out of range — this QR does not belong to Production Order ${po?.id || ''}.${expMsg}`, 'error');
      } else {
        showToast(`Save failed: ${errMsg}`, 'error');
      }
      setSavingStage(null);
      return;
    }

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

    const isFullyCompleteNow = (qcResult === 'PASS' && testResult === 'PASS');

    const newStageStatus: StageStatus = saveRes?.stageStatus || {
      qcCompleted: qcResult === 'PASS',
      testCompleted: testResult === 'PASS',
      qcResult,
      testResult,
      isFullyCompleted: isFullyCompleteNow,
    };

    newStageStatus.isFullyCompleted = isFullyCompleteNow;
    setStageStatus(newStageStatus);

    setSavingStage(null);
    setSavedStage('ALL');

    if (isFullyCompleteNow) {
      incrementQCPassed();
      showToast(`🎉 BOTH QC & TEST PASSED for ${scannedItem.qr}!`, 'success');
      setTimeout(() => {
        setScannedItem(null);
        setStageStatus(null);
        setQcResult('PASS');
        setTestResult('PASS');
        setQcSelected(false);
        setTestSelected(false);
        setQcFailureReason('');
        setTestFailureReason('');
        setHistoryData(null);
        setSavedStage(null);
      }, 1500);
    } else {
      showToast(`❌ QC Test FAILED for ${scannedItem.qr}`, 'warning');
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                QC Inspection • {formatPoDisplayName(po)}
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Configured Mode: <strong style={{ color: 'var(--primary-teal)' }}>{qcMode}</strong>
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

      {/* Split Grid for Desktop */}
      <div className="desktop-split-7-5">
        {/* Left Panel: Scanner & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-controls-panel">
          {/* PO Progress Card - Operator Work Primary */}
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '14px' }}>
            {/* PRIMARY / LARGE: Operator Work */}
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

            {/* SECONDARY / SMALL: PO Total Summary */}
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

          <ScannerStatus showConnectButton={true} style={{ marginBottom: '12px' }} />
          <ScannerInput onScan={handleScanCode} placeholder="Scan product QR barcode..." />

          {!scannedItem ? (
            <div style={styles.emptyCard}>
              <ScanLine size={36} color="var(--text-muted)" />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
                Waiting for scan…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scan a product QR code to inspect item details
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
                <span style={styles.cardHeaderTitle}>ITEM DETAILS</span>

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
                  {scannedItem.status === 'DUPLICATE' && <StatusPill label="⚠️ Fully Completed" variant="amber" />}
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
              </div>

              {/* OVERALL STAGE STATUS BANNER IF FULLY COMPLETED */}
              {stageStatus?.isFullyCompleted && (
                <div style={{ padding: '12px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10B981', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <CheckCircle2 size={18} /> Overall: {qcMode} COMPLETED
                  </span>
                </div>
              )}

              {/* 1 STATION COMBINED STAGE SECTION */}
              {stationCount === 1 && qcMode === 'QC & Test' ? (
                <div style={styles.stageCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary-teal)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={18} /> Station 1 — Endline Inspection &amp; Functional Test
                    </span>
                    {stageStatus?.isFullyCompleted && (
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={14} /> ✓ Completed
                      </span>
                    )}
                  </div>

                  {stageStatus?.isFullyCompleted ? (
                    <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '13px', color: '#10B981', fontWeight: 700 }}>
                      ✅ Both Endline Inspection and Functional Test Completed
                    </div>
                  ) : (
                    <>
                      {/* Endline Inspection Section */}
                      <div style={{ marginBottom: '14px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                        <span style={{ ...styles.controlLabel, marginBottom: '8px', display: 'block' }}>
                          <ShieldCheck size={15} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Endline Inspection
                        </span>
                        <div style={styles.segmentRow}>
                          <button
                            type="button"
                            style={qcSelected && qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                            onClick={() => { setQcResult('PASS'); setQcSelected(true); }}
                          >
                            <Check size={18} /> PASS
                          </button>
                          <button
                            type="button"
                            style={qcSelected && qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                            onClick={() => { setQcResult('FAIL'); setQcSelected(true); }}
                          >
                            <XCircle size={18} /> FAIL
                          </button>
                        </div>
                        {qcSelected && qcResult === 'FAIL' && (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              value={qcFailureReason}
                              onChange={(e) => setQcFailureReason(e.target.value)}
                              placeholder="Endline Failure Reason (e.g. Stitching error, fabric defect)..."
                              style={styles.textInput}
                            />
                          </div>
                        )}
                      </div>

                      {/* Functional Test Section */}
                      <div style={{ marginBottom: '14px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                        <span style={{ ...styles.controlLabel, marginBottom: '8px', display: 'block' }}>
                          <TestTube size={15} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Functional Test
                        </span>
                        <div style={styles.segmentRow}>
                          <button
                            type="button"
                            style={testSelected && testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                            onClick={() => { setTestResult('PASS'); setTestSelected(true); }}
                          >
                            <Check size={18} /> PASS
                          </button>
                          <button
                            type="button"
                            style={testSelected && testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                            onClick={() => { setTestResult('FAIL'); setTestSelected(true); }}
                          >
                            <XCircle size={18} /> FAIL
                          </button>
                        </div>
                        {testSelected && testResult === 'FAIL' && (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="text"
                              value={testFailureReason}
                              onChange={(e) => setTestFailureReason(e.target.value)}
                              placeholder="Functional Test Failure Reason (e.g. Wash test fail, measurement out of spec)..."
                              style={styles.textInput}
                            />
                          </div>
                        )}
                      </div>

                      {/* SINGLE ATOMIC SAVE BUTTON */}
                      <button
                        className="btn-primary"
                        onClick={handleSaveCombined}
                        disabled={savingStage !== null}
                        style={{
                          marginTop: '6px',
                          width: '100%',
                          background: savedStage === 'ALL' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                        }}
                      >
                        {savingStage !== null ? 'Saving QC & Test Result...' : savedStage === 'ALL' ? '✅ QC & Test Result Saved!' : 'SAVE QC & TEST RESULT'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* INDEPENDENT QC STAGE SECTION */}
                  {(qcMode === 'QC & Test' || qcMode === 'QC Only') && (
                    <div style={styles.stageCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={styles.controlLabel}>
                          <ShieldCheck size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> QC Result
                        </span>
                        {stageStatus?.qcCompleted && (
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> ✓ PASS Completed
                          </span>
                        )}
                      </div>

                      {stageStatus?.qcCompleted ? (
                        <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '13px', color: '#10B981', fontWeight: 700 }}>
                          QC Stage Completed {stageStatus.qcOperatorName ? `by ${stageStatus.qcOperatorName}` : ''}
                        </div>
                      ) : (
                        <>
                          <div style={styles.segmentRow}>
                            <button
                              type="button"
                              style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                              onClick={() => { setQcResult('PASS'); setQcSelected(true); }}
                            >
                              <Check size={18} /> PASS
                            </button>
                            <button
                              type="button"
                              style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                              onClick={() => { setQcResult('FAIL'); setQcSelected(true); }}
                            >
                              <XCircle size={18} /> FAIL
                            </button>
                          </div>

                          {qcResult === 'FAIL' && (
                            <div style={{ marginTop: '8px' }}>
                              <input
                                type="text"
                                value={qcFailureReason}
                                onChange={(e) => setQcFailureReason(e.target.value)}
                                placeholder="QC Failure Reason (e.g. Stitching error, fabric defect)..."
                                style={styles.textInput}
                              />
                            </div>
                          )}

                          <button
                            className="btn-primary"
                            onClick={() => handleSaveStage('QC')}
                            disabled={savingStage !== null}
                            style={{
                              marginTop: '10px',
                              width: '100%',
                              background: savedStage === 'QC' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                            }}
                          >
                            {savingStage === 'QC' ? 'Saving QC...' : savedStage === 'QC' ? '✅ QC Saved!' : 'Save QC Result'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* INDEPENDENT TEST STAGE SECTION */}
                  {(qcMode === 'QC & Test' || qcMode === 'Test Only') && (
                    <div style={styles.stageCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={styles.controlLabel}>
                          <TestTube size={16} color="var(--primary-teal)" style={{ marginRight: '6px' }} /> Test Result
                        </span>
                        {stageStatus?.testCompleted && (
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> ✓ PASS Completed
                          </span>
                        )}
                      </div>

                      {stageStatus?.testCompleted ? (
                        <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '13px', color: '#10B981', fontWeight: 700 }}>
                          Test Stage Completed {stageStatus.testOperatorName ? `by ${stageStatus.testOperatorName}` : ''}
                        </div>
                      ) : (
                        <>
                          <div style={styles.segmentRow}>
                            <button
                              type="button"
                              style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                              onClick={() => { setTestResult('PASS'); setTestSelected(true); }}
                            >
                              <Check size={18} /> PASS
                            </button>
                            <button
                              type="button"
                              style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                              onClick={() => { setTestResult('FAIL'); setTestSelected(true); }}
                            >
                              <XCircle size={18} /> FAIL
                            </button>
                          </div>

                          {testResult === 'FAIL' && (
                            <div style={{ marginTop: '8px' }}>
                              <input
                                type="text"
                                value={testFailureReason}
                                onChange={(e) => setTestFailureReason(e.target.value)}
                                placeholder="Test Failure Reason (e.g. Wash test fail, measurement out of spec)..."
                                style={styles.textInput}
                              />
                            </div>
                          )}

                          <button
                            className="btn-primary"
                            onClick={() => handleSaveStage('TEST')}
                            disabled={savingStage !== null}
                            style={{
                              marginTop: '10px',
                              width: '100%',
                              background: savedStage === 'TEST' ? 'var(--color-green)' : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-light) 100%)',
                            }}
                          >
                            {savingStage === 'TEST' ? 'Saving Test...' : savedStage === 'TEST' ? '✅ Test Saved!' : 'Save Test Result'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
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
                <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{qcMode}</span>
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
              QC & TEST INSTRUCTIONS
            </span>
            <ul style={{ margin: '10px 0 0 16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>Scan the product QR code barcode.</li>
              <li>Perform required inspection according to selected mode ({qcMode}).</li>
              <li>Save QC and/or Test results independently.</li>
              <li>Multi-stage mode allows scanning the same QR to complete pending stages.</li>
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
