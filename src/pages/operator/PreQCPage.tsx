import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight, Layers } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import { DueDateBadge } from '../../components/DueDateBadge';
import { LineOperationHistoryView } from '../../components/LineOperationHistoryView';
import '../../styles/tokens.css';

interface ScannedItem {
  qr: string;
  product: string;
  size: string;
  status: 'VALID' | 'DUPLICATE' | 'INVALID';
  scannedAt: string;
}

export const PreQCPage: React.FC = () => {
  const { activeJob, setActiveJob, showToast } = useApp();

  const po = activeJob?.productionOrder;

  const configuredPreQcTests: string[] = React.useMemo(() => {
    if (Array.isArray(po?.preQcTests) && po.preQcTests.length > 0) return po.preQcTests;
    if (Array.isArray((po as any)?.pre_qc_tests) && (po as any).pre_qc_tests.length > 0) return (po as any).pre_qc_tests;
    return ['Pre-QC Inspection'];
  }, [po?.preQcTests, (po as any)?.pre_qc_tests]);

  const rawStationCount = po?.preQcStationCount ?? (po as any)?.pre_qc_station_count;
  const stationCount = Math.max(1, Math.min(10, Number(rawStationCount) || 1));

  const [testResults, setTestResults] = useState<Record<string, 'PASS' | 'FAIL'>>({});
  const [testFailureReasons, setTestFailureReasons] = useState<Record<string, string>>({});
  const [savedTestsMap, setSavedTestsMap] = useState<Record<string, boolean>>({});

  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [activeViewTab, setActiveViewTab] = useState<'scan' | 'history'>('scan');
  const [preQcResult, setPreQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [failureReason, setFailureReason] = useState<string>('');
  const [recentScans, setRecentScans] = useState<ScannedItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const initRes: Record<string, 'PASS' | 'FAIL'> = {};
    const initReas: Record<string, string> = {};
    const initSaved: Record<string, boolean> = {};
    configuredPreQcTests.forEach(t => {
      initRes[t] = 'PASS';
      initReas[t] = '';
      initSaved[t] = false;
    });
    setTestResults(initRes);
    setTestFailureReasons(initReas);
    setSavedTestsMap(initSaved);
  }, [configuredPreQcTests, scannedItem?.qr]);

  // Live Pre QC progress state from server
  const [poProgress, setPoProgress] = useState<{
    loading: boolean;
    myCompleted: number;
    myFailed: number;
    myTotalProcessed: number;
    totalCompleted: number;
    totalFailed: number;
    totalProcessed: number;
    operatorName: string;
  }>({
    loading: true,
    myCompleted: 0,
    myFailed: 0,
    myTotalProcessed: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalProcessed: 0,
    operatorName: 'Operator'
  });

  const updateProgressFromRes = (prog: any) => {
    if (!prog) return;
    const myComp = prog.myCompleted ?? prog.operatorStats?.myCompleted ?? prog.operatorStats?.completed ?? prog.completed ?? 0;
    const myFail = prog.myFailed ?? prog.operatorStats?.myFailed ?? prog.operatorStats?.failed ?? prog.failed ?? 0;
    const myTot = prog.myTotalProcessed ?? prog.operatorStats?.myTotalProcessed ?? (myComp + myFail);
    const totComp = prog.totalCompleted ?? prog.poStats?.totalCompleted ?? prog.completed ?? 0;
    const totFail = prog.totalFailed ?? prog.poStats?.totalFailed ?? prog.failed ?? 0;
    const totProc = prog.totalProcessed ?? prog.poTotalProcessed ?? prog.poStats?.totalProcessed ?? (totComp + totFail);

    setPoProgress({
      loading: false,
      myCompleted: myComp,
      myFailed: myFail,
      myTotalProcessed: myTot,
      totalCompleted: totComp,
      totalFailed: totFail,
      totalProcessed: totProc,
      operatorName: prog.operatorStats?.operatorName || 'Operator'
    });
  };

  const fetchProgress = async () => {
    const targetPoKey = po?.dbId || po?.id;
    if (!targetPoKey) return;
    setPoProgress(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch<any>(`/api/pre-qc/progress/${encodeURIComponent(targetPoKey)}`);
      if (res) {
        updateProgressFromRes(res);
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

  /* ── Pre QC barcode scan handler ─────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      showToast('Barcode is required', 'warning');
      return {
        status: 'rejected' as const,
        message: 'Barcode is required',
        code: ''
      };
    }
    setSaved(false);
    setFailureReason('');

    try {
      const res = await apiFetch<any>('/api/pre-qc/scan', {
        method: 'POST',
        body: JSON.stringify({ code, productionOrderId: po?.dbId || po?.id, productionOrderNumber: po?.id }),
      });

      if (res?.progress) {
        updateProgressFromRes(res.progress);
      }

      if (res?.status === 'DUPLICATE') {
        const dupItem: ScannedItem = {
          qr: res.item?.qr_code || code,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
          scannedAt: new Date().toLocaleTimeString()
        };
        setScannedItem(dupItem);
        setPreQcResult('FAIL');
        showToast(`⚠️ Item ${code} is ALREADY Pre QC Passed! (Duplicate scan)`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY Pre QC Passed! (Duplicate scan)`,
          code: res.item?.qr_code || code,
        };
      }

      const validItem: ScannedItem = {
        qr: res.item?.qr_code || code,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: res.item?.size || 'L',
        status: 'VALID',
        scannedAt: new Date().toLocaleTimeString()
      };

      setScannedItem(validItem);
      setPreQcResult('PASS');
      showToast(`✅ ${code} validated — Select PASS or FAIL result below`, 'info');

      return {
        status: 'accepted' as const,
        message: `✅ ${code} validated for ${po?.id || 'PO'}`,
        code: res.item?.qr_code || code,
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const invalidItem: ScannedItem = {
        qr: code,
        product: po?.styleName || 'Garment',
        size: '—',
        status: 'INVALID',
        scannedAt: new Date().toLocaleTimeString()
      };
      setScannedItem(invalidItem);

      if (err?.error === 'CONFIG_NOT_SELECTED' || err?.error === 'QR_OUT_OF_RANGE' || errMsg.includes('not selected') || errMsg.includes('does not belong')) {
        const redMsg = `Unselected Configuration — '${code}' does not belong to Production Order ${po?.id || ''}.`;
        showToast(redMsg, 'error');
        return {
          status: 'rejected' as const,
          message: redMsg,
          code,
        };
      }

      const defaultErr = errMsg || `Failed to process scan for ${code}`;
      showToast(defaultErr, 'error');
      return {
        status: 'rejected' as const,
        message: defaultErr,
        code,
      };
    }
  };

  /* ── Save Pre QC result to database ───────────────────────────── */
  const handleSave = async () => {
    if (!scannedItem) {
      showToast('Please scan a garment QR barcode first.', 'warning');
      return;
    }
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save result for invalid barcode configuration.', 'error');
      return;
    }
    if (scannedItem.status === 'DUPLICATE') {
      showToast('Item has already passed Pre QC (Duplicate scan).', 'warning');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const isAllPass = configuredPreQcTests.every(t => (testResults[t] || 'PASS') === 'PASS');
      const overallResult = isAllPass ? 'PASS' : 'FAIL';
      const combinedReason = configuredPreQcTests
        .filter(t => testResults[t] === 'FAIL')
        .map(t => `${t}: ${testFailureReasons[t] || 'Defect'}`)
        .join(' | ');

      const recRes = await apiFetch<any>('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({
          code: scannedItem.qr,
          productionOrderId: po?.dbId || po?.id,
          preQcResult: overallResult,
          failureReason: isAllPass ? undefined : combinedReason,
          testDetails: testResults,
          lineNumber: activeJob?.selectedLine || po?.lineNumber || (po as any)?.line_number || undefined
        }),
      });

      if (recRes?.progress) {
        updateProgressFromRes(recRes.progress);
      }

      const savedRecord: ScannedItem = {
        ...scannedItem,
        status: isAllPass ? 'VALID' : 'INVALID',
        scannedAt: new Date().toLocaleTimeString()
      };

      setRecentScans(prev => [savedRecord, ...prev.slice(0, 9)]);

      if (isAllPass) {
        showToast(`✅ Pre QC PASSED recorded for ${scannedItem.qr}!`, 'success');
      } else {
        showToast(`❌ Pre QC FAIL recorded for ${scannedItem.qr}`, 'warning');
      }

      setSaved(true);
      setIsSaving(false);

      setTimeout(() => {
        setScannedItem(null);
        setSaved(false);
      }, 1000);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      showToast(`Save failed: ${errMsg}`, 'error');
      setIsSaving(false);
    }
  };

  const handleSaveSpecificTest = async (testName: string) => {
    if (!scannedItem || isSaving) return;
    setIsSaving(true);
    const resultVal = testResults[testName] || 'PASS';
    const reasonVal = testFailureReasons[testName];

    try {
      const recRes = await apiFetch<any>('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({
          code: scannedItem.qr,
          productionOrderId: po?.dbId || po?.id,
          preQcResult: resultVal,
          failureReason: resultVal === 'FAIL' ? `${testName}: ${reasonVal || 'Defect'}` : undefined,
          testDetails: { [testName]: { result: resultVal, failureReason: reasonVal } },
          lineNumber: activeJob?.selectedLine || po?.lineNumber || (po as any)?.line_number || undefined
        }),
      });

      if (recRes?.progress) {
        updateProgressFromRes(recRes.progress);
      }

      setSavedTestsMap(prev => {
        const next = { ...prev, [testName]: true };
        const allCompleted = configuredPreQcTests.every(t => next[t]);
        if (allCompleted) {
          const hasAnyFail = configuredPreQcTests.some(t => (testResults[t] || 'PASS') === 'FAIL');
          if (hasAnyFail) {
            showToast(`⚠️ Pre-QC completed with FAIL for ${scannedItem.qr}! (Defects recorded)`, 'warning');
          } else {
            showToast(`🎉 All Pre-QC tests PASSED for ${scannedItem.qr}!`, 'success');
          }
          const savedRecord: ScannedItem = {
            ...scannedItem,
            status: hasAnyFail ? 'INVALID' : 'VALID',
            scannedAt: new Date().toLocaleTimeString()
          };
          setRecentScans(p => [savedRecord, ...p.slice(0, 9)]);
          setTimeout(() => {
            setScannedItem(null);
          }, 1000);
        } else {
          if (resultVal === 'FAIL') {
            showToast(`❌ ${testName} recorded as FAIL for ${scannedItem.qr}!`, 'warning');
          } else {
            showToast(`✅ ${testName} recorded for ${scannedItem.qr}!`, 'success');
          }
        }
        return next;
      });
    } catch (err: any) {
      showToast(`Save failed: ${err.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (showPoSelector || !po) {
    return (
      <SelectPOForOperation
        operationName="Inline"
        selectedPoId={po?.id}
        onSelectPo={(selectedPo, selectedLine) => {
          setActiveJob({
            productionOrder: selectedPo,
            shift: selectedPo.shifts?.[0],
            selectedLine
          });
          setShowPoSelector(false);
        }}
      />
    );
  }

  return (
    <div style={styles.container}>
      {/* Active PO Header Card */}
      <div className="card" style={styles.poCard}>
        <div className="op-top-banner">
          <div>
            <span style={styles.cardSubTitle}>INLINE OPERATION</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>
                {formatPoDisplayName({
                  poNumber: po.id,
                  poName: po.poName,
                  styleName: po.styleName
                })}
              </span>
              {activeJob?.selectedLine && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(20, 184, 166, 0.15)',
                  color: 'var(--primary-teal)',
                  border: '1px solid rgba(20, 184, 166, 0.3)'
                }}>
                  {activeJob.selectedLine}
                </span>
              )}
              <DueDateBadge dueDate={po?.dueDate || (po as any)?.due_date} />
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Customer: {po.customer} • Map PO: {po.mapPo}
            </p>
          </div>
          <button
            onClick={() => setShowPoSelector(true)}
            style={styles.changePoBtn}
          >
            <ArrowLeftRight size={14} /> Switch PO
          </button>
        </div>

        {/* MY OPERATOR PROGRESS */}
        <div style={{ marginTop: '14px', padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(22, 184, 174, 0.08)', border: '1px solid rgba(22, 184, 174, 0.2)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            MY OPERATOR PROGRESS
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Completed</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#10B981', marginTop: '2px', display: 'block' }}>
                {poProgress.myCompleted}
              </span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Failed</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#EF4444', marginTop: '2px', display: 'block' }}>
                {poProgress.myFailed}
              </span>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface-1)', padding: '12px 10px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>My Total Processed</span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '2px', display: 'block' }}>
                {poProgress.myTotalProcessed}
              </span>
            </div>
          </div>
        </div>

        {/* PO TOTAL — ALL OPERATORS */}
        <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PO TOTAL — ALL OPERATORS
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total Completed: </span>
              <strong style={{ color: '#10B981', fontWeight: 800 }}>{poProgress.totalCompleted}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total Failed: </span>
              <strong style={{ color: '#EF4444', fontWeight: 800 }}>{poProgress.totalFailed}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Total Processed: </span>
              <strong style={{ color: 'var(--primary-teal)', fontWeight: 800 }}>{poProgress.totalProcessed}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* View Switcher: Live Scanning vs Line History */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'var(--bg-surface-2)',
        padding: '4px',
        borderRadius: '10px',
        width: 'fit-content'
      }}>
        <button
          type="button"
          onClick={() => setActiveViewTab('scan')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeViewTab === 'scan' ? 'var(--primary-teal)' : 'transparent',
            color: activeViewTab === 'scan' ? '#041820' : 'var(--text-secondary)',
            border: 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <ScanLine size={14} /> Live Scan Station
        </button>
        <button
          type="button"
          onClick={() => setActiveViewTab('history')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeViewTab === 'history' ? 'var(--primary-teal)' : 'transparent',
            color: activeViewTab === 'history' ? '#041820' : 'var(--text-secondary)',
            border: 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={14} /> Line Records & Completed QRs
        </button>
      </div>

      {activeViewTab === 'history' ? (
        <LineOperationHistoryView
          poId={po?.dbId || po?.id || ''}
          poNumber={po?.poNumber || (po as any)?.po_number || po?.id || ''}
          selectedLine={activeJob?.selectedLine || po?.lineNumber || (po as any)?.line_number || 'Line 1'}
          operation="PRE_QC"
        />
      ) : (
        <>
          {/* Barcode Scanner Input */}
          <div style={styles.scannerBox}>
        <ScannerStatus showConnectButton={true} style={{ marginBottom: '10px' }} />
        <ScannerInput
          onScan={handleScanCode}
          placeholder="Scan barcode for Inline (e.g. PNFLSS0926001)..."
        />
      </div>

      {/* Item Inspection & Result Control Card */}
      {!scannedItem ? (
        <div style={styles.emptyCard}>
          <ScanLine size={36} color="var(--text-muted)" />
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px', fontWeight: 600 }}>
            Waiting for barcode scan…
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Scan a garment barcode to validate configuration range and record result
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Item Details Card */}
          <div
            className="card"
            style={{
              margin: 0,
              backgroundColor: 'var(--bg-surface-1)',
              borderColor:
                scannedItem.status === 'INVALID'
                  ? 'rgba(239, 68, 68, 0.5)'
                  : scannedItem.status === 'DUPLICATE'
                  ? 'rgba(245, 158, 11, 0.5)'
                  : 'rgba(16, 185, 129, 0.4)',
              borderWidth: '1.5px',
            }}
          >
            <span style={styles.cardHeaderTitle}>ITEM DETAILS</span>

            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Barcode / QR Code</span>
              <span style={{ ...styles.detailValue, color: 'var(--primary-teal)', fontSize: '16px' }}>
                {scannedItem.qr}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Garment Style</span>
              <span style={styles.detailValue}>{scannedItem.product}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Size</span>
              <span style={styles.detailValue}>{scannedItem.size}</span>
            </div>
            <div style={{ ...styles.detailRow, borderBottom: 'none' }}>
              <span style={styles.detailLabel}>Configuration Check</span>
              {scannedItem.status === 'VALID' && <StatusPill label="✅ Valid Configuration — In Range" variant="green" />}
              {scannedItem.status === 'DUPLICATE' && <StatusPill label="⚠️ Already Scanned (Duplicate)" variant="amber" />}
              {scannedItem.status === 'INVALID' && <StatusPill label="❌ Unselected Configuration" variant="red" />}
            </div>
          </div>

          {/* Result Selection Control */}
          {scannedItem.status === 'VALID' && (
            stationCount === 1 ? (
              <div className="card" style={{ margin: 0, backgroundColor: 'var(--bg-surface-1)' }}>
                <span style={{ ...styles.controlLabel, color: 'var(--primary-teal)', fontWeight: 800, marginBottom: '12px', display: 'block' }}>
                  Station 1 — {configuredPreQcTests.join(' & ')}
                </span>

                {configuredPreQcTests.map(testName => (
                  <div key={testName} style={{ marginBottom: '14px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                    <span style={{ ...styles.controlLabel, marginBottom: '8px', display: 'block' }}>
                      ✓ {testName}
                    </span>
                    <div style={styles.segmentRow}>
                      <button
                        type="button"
                        style={(testResults[testName] || 'PASS') === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                        onClick={() => setTestResults(prev => ({ ...prev, [testName]: 'PASS' }))}
                      >
                        <Check size={18} /> PASS
                      </button>
                      <button
                        type="button"
                        style={testResults[testName] === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                        onClick={() => setTestResults(prev => ({ ...prev, [testName]: 'FAIL' }))}
                      >
                        <XCircle size={18} /> FAIL
                      </button>
                    </div>

                    {testResults[testName] === 'FAIL' && (
                      <div style={{ marginTop: '10px' }}>
                        <input
                          type="text"
                          value={testFailureReasons[testName] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTestFailureReasons(prev => ({ ...prev, [testName]: val }));
                          }}
                          placeholder={`${testName} Failure Reason...`}
                          style={styles.reasonInput}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saved || isSaving}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    background: saved
                      ? 'var(--color-green)'
                      : Object.values(testResults).some(r => r === 'FAIL')
                      ? 'var(--color-red)'
                      : 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-dark) 100%)',
                    opacity: saved ? 0.7 : 1,
                  }}
                >
                  {saved ? '✅ Saved to Database!' : 'Save All Pre-QC Test Results'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {configuredPreQcTests.map((testName, idx) => {
                  const isTestSaved = savedTestsMap[testName];
                  const isTestFail = testResults[testName] === 'FAIL';
                  return (
                    <div key={testName} className="card" style={{ margin: 0, backgroundColor: 'var(--bg-surface-1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ ...styles.controlLabel, margin: 0 }}>
                          Station {Math.min(idx + 1, stationCount)} — {testName}
                        </span>
                        {isTestSaved && (
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> ✓ Completed
                          </span>
                        )}
                      </div>

                      {isTestSaved ? (
                        <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '13px', color: '#10B981', fontWeight: 700 }}>
                          {testName} Completed
                        </div>
                      ) : (
                        <>
                          <div style={styles.segmentRow}>
                            <button
                              type="button"
                              style={(testResults[testName] || 'PASS') === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
                              onClick={() => setTestResults(prev => ({ ...prev, [testName]: 'PASS' }))}
                            >
                              <Check size={18} /> PASS
                            </button>
                            <button
                              type="button"
                              style={testResults[testName] === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
                              onClick={() => setTestResults(prev => ({ ...prev, [testName]: 'FAIL' }))}
                            >
                              <XCircle size={18} /> FAIL
                            </button>
                          </div>

                          {isTestFail && (
                            <div style={{ marginTop: '10px' }}>
                              <input
                                type="text"
                                value={testFailureReasons[testName] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTestFailureReasons(prev => ({ ...prev, [testName]: val }));
                                }}
                                placeholder={`${testName} Failure Reason...`}
                                style={styles.reasonInput}
                              />
                            </div>
                          )}

                          <button
                            className="btn-primary"
                            onClick={() => handleSaveSpecificTest(testName)}
                            disabled={isSaving}
                            style={{
                              marginTop: '12px',
                              width: '100%',
                              background: 'linear-gradient(135deg, var(--primary-teal) 0%, var(--primary-teal-dark) 100%)',
                            }}
                          >
                            Save {testName} Result
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Recent Scans History Table */}
      {recentScans.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Recent Inline Scans
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentScans.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-surface-2)',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ScanLine size={16} color="var(--primary-teal)" />
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.qr}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.scannedAt}</span>
                  <StatusPill label={item.status === 'VALID' ? 'PASS' : 'FAIL'} variant={item.status === 'VALID' ? 'green' : 'red'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '20px'
  },
  poCard: {
    backgroundColor: 'var(--bg-surface-1)',
    margin: 0
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--primary-teal)',
    letterSpacing: '0.05em'
  },
  changePoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    backgroundColor: 'rgba(22, 184, 174, 0.12)',
    border: '1px solid var(--primary-teal)',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer'
  },
  scannerBox: {
    width: '100%'
  },
  emptyCard: {
    padding: '36px 20px',
    borderRadius: '16px',
    border: '2px dashed var(--border-color)',
    backgroundColor: 'var(--bg-surface-1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
    marginBottom: '10px',
    display: 'block'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-color)'
  },
  detailLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 600
  },
  detailValue: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    fontWeight: 700
  },
  controlLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block'
  },
  segmentRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '6px'
  },
  segmentBtn: {
    padding: '12px',
    borderRadius: '12px',
    border: '1.5px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-secondary)',
    fontWeight: 700,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    minHeight: '48px'
  },
  passBtnActive: {
    padding: '12px',
    borderRadius: '12px',
    border: '2px solid #10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    minHeight: '48px'
  },
  failBtnActive: {
    padding: '12px',
    borderRadius: '12px',
    border: '2px solid #EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#EF4444',
    fontWeight: 800,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    minHeight: '48px'
  },
  reasonInput: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px'
  }
};
