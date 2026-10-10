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

type QcStep = 'NORMAL' | 'STEP_1_ASSIGN' | 'STEP_1_SAVED' | 'STEP_2_QC';

export const QCTestPage: React.FC = () => {
  const { activeJob, setActiveJob, incrementQCPassed, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const qcMode = po?.qcTestMode || 'QC & Test';
  const rawStationCount = po?.qcStationCount ?? (po as any)?.qc_station_count ?? (po as any)?.stationCount;
  const stationCount = Number(rawStationCount) === 1 ? 1 : 2;

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus | null>(null);
  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [qcSelected, setQcSelected] = useState<boolean>(true);
  const [testSelected, setTestSelected] = useState<boolean>(true);
  const [qcFailureReason, setQcFailureReason] = useState<string>('');
  const [testFailureReason, setTestFailureReason] = useState<string>('');
  const [historyData, setHistoryData] = useState<QcHistoryData | null>(null);
  const [savingStage, setSavingStage] = useState<'QC' | 'TEST' | 'ALL' | null>(null);
  const [savedStage, setSavedStage] = useState<'QC' | 'TEST' | 'ALL' | null>(null);

  // Pre-QC Conditional Workflow State
  const [qcStep, setQcStep] = useState<QcStep>('NORMAL');
  const [scannedProductQr, setScannedProductQr] = useState<string>('');
  const [unsavedPreQcItems, setUnsavedPreQcItems] = useState<string[]>([]);
  const [savedPreQcTraceability, setSavedPreQcTraceability] = useState<string[]>([]);
  const [preQcInputCode, setPreQcInputCode] = useState<string>('');
  const [isValidatingPreQcItem, setIsValidatingPreQcItem] = useState<boolean>(false);
  const [isAssigningPreQc, setIsAssigningPreQc] = useState<boolean>(false);

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
    setQcStep('NORMAL');
    setScannedProductQr('');
    setUnsavedPreQcItems([]);
    setSavedPreQcTraceability([]);
  }, [po?.dbId, po?.id]);

  const targetPoQty = poProgress.targetQuantity || po?.totalQuantity || 10;
  const qcPassedQty = poProgress.passedUnique;
  const remainingQcQty = poProgress.remainingToPass;
  const isQCComplete = poProgress.passedUnique >= targetPoQty;

  /* ── Pre-QC Step 1 Handlers ───────────────────────────────────── */
  const handleAddPreQcItem = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    if (!scannedProductQr) {
      showToast('Please scan a PO Product QR first', 'warning');
      return;
    }

    if (unsavedPreQcItems.includes(code)) {
      showToast(`⚠️ ${code} is already added to the current assignment list.`, 'warning');
      setPreQcInputCode('');
      return;
    }

    setIsValidatingPreQcItem(true);
    try {
      const res = await apiFetch('/api/pre-qc/validate-item', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          productionOrderNumber: po?.id,
          productQr: scannedProductQr,
          preQcQr: code
        })
      });

      if (res?.valid) {
        setUnsavedPreQcItems(prev => [...prev, code]);
        setPreQcInputCode('');
        showToast(`✅ Pre-QC item ${code} added`, 'success');
      } else {
        showToast(`❌ ${res?.message || `Pre-QC QR ${code} is not valid for this PO.`}`, 'error');
      }
    } catch (err: any) {
      showToast(`❌ ${err?.message || `Pre-QC QR ${code} is not valid for this PO.`}`, 'error');
    } finally {
      setIsValidatingPreQcItem(false);
    }
  };

  const handleRemoveUnsavedPreQcItem = (itemQr: string) => {
    setUnsavedPreQcItems(prev => prev.filter(q => q !== itemQr));
    showToast(`Removed ${itemQr} from selection list`, 'info');
  };

  const handleSavePreQcAssignment = async () => {
    if (unsavedPreQcItems.length === 0 || !scannedProductQr) return;
    setIsAssigningPreQc(true);
    try {
      await apiFetch('/api/pre-qc/assign', {
        method: 'POST',
        body: JSON.stringify({
          productionOrderId: po?.dbId || po?.id,
          productionOrderNumber: po?.id,
          productQr: scannedProductQr,
          preQcQrs: unsavedPreQcItems
        })
      });
      showToast('✅ Pre-QC assignment saved.', 'success');
      setSavedPreQcTraceability([...unsavedPreQcItems]);
      setQcStep('STEP_1_SAVED');
    } catch (err: any) {
      showToast(`Failed to save Pre-QC assignment: ${err.message || err}`, 'error');
    } finally {
      setIsAssigningPreQc(false);
    }
  };

  /* ── scan handler ──────────────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    setSavedStage(null);
    setQcFailureReason('');
    setTestFailureReason('');
    setHistoryData(null);
    setStageStatus(null);

    // If currently in Step 1 Pre-QC Assignment, scanned code is a Pre-QC QR item (NOT a product QR)
    if (qcStep === 'STEP_1_ASSIGN') {
      if (code === scannedProductQr) {
        showToast(`Product QR ${code} active — scan or enter Pre-QC items below`, 'info');
        return {
          status: 'accepted' as const,
          message: `Product QR ${code}`,
          code,
        };
      }
      await handleAddPreQcItem(code);
      return {
        status: 'accepted' as const,
        message: `Pre-QC QR ${code} processed`,
        code,
      };
    }

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

      const isPreQcEnabledOnPo = !!res?.preQcEnabled;
      const assignedItems: string[] = Array.isArray(res?.assignedPreQcItems) ? res.assignedPreQcItems : [];
      const scannedQr = res.item?.qr_code || code;
      setScannedProductQr(scannedQr);

      if (isPreQcEnabledOnPo) {
        if (assignedItems.length > 0) {
          // Saved Pre-QC assignment exists for this product! Transition directly to Step 2 QC.
          setSavedPreQcTraceability(assignedItems);
          setQcStep('STEP_2_QC');
        } else if (qcStep === 'STEP_1_SAVED' && (scannedProductQr === scannedQr || !scannedProductQr)) {
          // Operator rescanned product QR after saving Step 1 -> transition to Step 2 QC
          setSavedPreQcTraceability(unsavedPreQcItems.length > 0 ? unsavedPreQcItems : assignedItems);
          setQcStep('STEP_2_QC');
        } else {
          // Pre-QC is enabled and no saved assignment exists -> Step 1 Assignment required
          setUnsavedPreQcItems([]);
          setQcStep('STEP_1_ASSIGN');
          showToast(`ℹ️ Step 1: Assign Pre-QC items for ${scannedQr}`, 'info');
        }
      } else {
        // Pre-QC NOT enabled for this PO -> Normal QC workflow
        setSavedPreQcTraceability([]);
        setUnsavedPreQcItems([]);
        setQcStep('NORMAL');
      }

      if (res.status === 'FULLY_COMPLETED' || stStatus.isFullyCompleted) {
        setScannedItem({
          qr: scannedQr,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
        });
        showToast(`⚠️ ${qcMode} already completed for item ${code}.`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY ${qcMode} Completed!`,
          code: scannedQr,
        };
      }

      setScannedItem({
        qr: scannedQr,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: res.item?.size || 'L',
        status: 'VALID',
      });

      setQcResult('PASS');
      setTestResult('PASS');
      setQcSelected(true);
      setTestSelected(true);

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
        code: scannedQr,
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
        setQcStep('NORMAL');
        setScannedProductQr('');
        setUnsavedPreQcItems([]);
        setSavedPreQcTraceability([]);
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
        setQcStep('NORMAL');
        setScannedProductQr('');
        setUnsavedPreQcItems([]);
        setSavedPreQcTraceability([]);
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
        <div className="op-top-banner">
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

          {/* Initial State — No scanned product and Normal Step */}
          {!scannedItem && qcStep === 'NORMAL' ? (
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
              {/* ITEM DETAILS CARD */}
              {scannedItem && (
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
                    margin: 0
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
              )}

              {/* STEP 1 — PRE-QC ASSIGNMENT PANEL */}
              {qcStep === 'STEP_1_ASSIGN' && (
                <div style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1.5px solid var(--primary-teal)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: 'rgba(245, 158, 11, 0.2)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.4)'
                      }}>
                        STEP 1 — PRE-QC ASSIGNMENT
                      </span>
                      <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        Assign Pre-QC Items
                      </h4>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                      Product: <strong>{scannedProductQr}</strong>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Scan / Enter Pre-QC QR for {scannedProductQr}:
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={preQcInputCode}
                        onChange={(e) => setPreQcInputCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPreQcItem(preQcInputCode);
                          }
                        }}
                        placeholder="Scan or enter Pre-QC QR (e.g. AAA/1)..."
                        style={{
                          flex: 1,
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          fontFamily: 'monospace'
                        }}
                        disabled={isValidatingPreQcItem}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPreQcItem(preQcInputCode)}
                        disabled={isValidatingPreQcItem || !preQcInputCode.trim()}
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}
                      >
                        {isValidatingPreQcItem ? 'Validating...' : 'Add Item'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      Assigned Pre-QC Items ({unsavedPreQcItems.length}):
                    </span>
                    {unsavedPreQcItems.length === 0 ? (
                      <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-surface-2)', fontSize: '12px', color: 'var(--text-muted)' }}>
                        No Pre-QC items scanned yet. Scan or enter Pre-QC QRs above.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '8px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px' }}>
                        {unsavedPreQcItems.map((itemQr, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              backgroundColor: 'var(--bg-surface-1)',
                              border: '1px solid var(--border-color)',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: 'var(--text-primary)'
                            }}
                          >
                            <Check size={14} color="var(--color-green)" />
                            <span>{itemQr}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveUnsavedPreQcItem(itemQr)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              title="Remove from current selection"
                            >
                              <XCircle size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={handleSavePreQcAssignment}
                      disabled={unsavedPreQcItems.length === 0 || isAssigningPreQc}
                      className="btn-primary"
                      style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 800 }}
                    >
                      {isAssigningPreQc ? 'Saving Assignment...' : 'SAVE ASSIGNMENT'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1 SAVED PROMPT */}
              {qcStep === 'STEP_1_SAVED' && (
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid #10B981',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontWeight: 800, fontSize: '14px' }}>
                    <CheckCircle2 size={18} />
                    <span>STEP 1 COMPLETE — Pre-QC assignment saved for {scannedProductQr}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    Assigned items: {savedPreQcTraceability.join(', ')}
                  </div>
                  <div style={{ padding: '10px 12px', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', fontSize: '12px', color: '#f59e0b', fontWeight: 700 }}>
                    <strong>STEP 2 — QC INSPECTION:</strong> Please scan PO Product QR (<strong>{scannedProductQr}</strong>) again to begin QC inspection.
                  </div>
                </div>
              )}

              {/* STEP 2 READ-ONLY PRE-QC TRACEABILITY CARD */}
              {qcStep === 'STEP_2_QC' && savedPreQcTraceability.length > 0 && (
                <div style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--primary-teal)',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={16} color="var(--primary-teal)" />
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Pre-QC Traceability (PO Product: {scannedItem?.qr || scannedProductQr})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {savedPreQcTraceability.map((qr, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10B981',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          fontWeight: 700
                        }}
                      >
                        <Check size={14} color="#10B981" />
                        {qr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* NORMAL QC INSPECTION CONTROLS (Only visible in NORMAL or STEP_2_QC when scannedItem exists) */}
              {scannedItem && (qcStep === 'NORMAL' || qcStep === 'STEP_2_QC') && (
                <>
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
            </>
          )}
        </div>

        {/* Right Panel: Recent Scans History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="workflow-history-panel">
          <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0 }}>
            <span style={styles.cardHeaderTitle}>INSPECTION HISTORY</span>
            {historyData && historyData.history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {historyData.history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Attempt #{h.attempt_number}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{new Date(h.scanned_at).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span>QC: <strong style={{ color: h.qc_result === 'PASS' ? '#10B981' : '#EF4444' }}>{h.qc_result}</strong></span>
                      <span>Test: <strong style={{ color: h.test_result === 'PASS' ? '#10B981' : '#EF4444' }}>{h.test_result}</strong></span>
                    </div>
                    {h.failure_reason && (
                      <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>
                        Reason: {h.failure_reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No prior history for current garment scan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  banner: {
    padding: '16px 20px',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    display: 'block',
    marginBottom: '12px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)',
  },
  detailLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  detailValue: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontWeight: 700,
  },
  stageCard: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px',
  },
  controlLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
  },
  segmentRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '6px',
  },
  segmentBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '13px',
    cursor: 'pointer',
    minHeight: '48px',
  },
  passBtnActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid #10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
    minHeight: '48px',
  },
  failBtnActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid #EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#EF4444',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
    minHeight: '48px',
  },
  textInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    fontSize: '12px',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: 'var(--radius-lg)',
    border: '1px dashed var(--border-color)',
  },
};
