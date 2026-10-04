import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import { ScannerInput } from '../../components/ScannerInput';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { CheckCircle2, XCircle, FileText, Check, ScanLine, ArrowLeftRight } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
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

  const [showPoSelector, setShowPoSelector] = useState<boolean>(!po);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [recentScans, setRecentScans] = useState<ScannedItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Live Pre QC progress state from server
  const [poProgress, setPoProgress] = useState<{
    loading: boolean;
    targetQuantity: number;
    inspectedUnique: number;
    passedUnique: number;
    remainingToInspect: number;
    remainingToPass: number;
    operatorStats: {
      operatorName: string;
      passedCount: number;
    };
  }>({
    loading: true,
    targetQuantity: po?.totalQuantity || 10,
    inspectedUnique: 0,
    passedUnique: 0,
    remainingToInspect: po?.totalQuantity || 10,
    remainingToPass: po?.totalQuantity || 10,
    operatorStats: {
      operatorName: 'Operator',
      passedCount: 0
    }
  });

  const fetchProgress = async () => {
    const targetPoKey = po?.dbId || po?.id;
    if (!targetPoKey) return;
    setPoProgress(prev => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch<any>(`/api/pre-qc/progress/${encodeURIComponent(targetPoKey)}`);
      if (res && typeof res.passedUnique === 'number') {
        setPoProgress({
          loading: false,
          targetQuantity: res.targetQuantity || po?.totalQuantity || 10,
          inspectedUnique: res.inspectedUnique || 0,
          passedUnique: res.passedUnique || 0,
          remainingToInspect: res.remainingToInspect || 0,
          remainingToPass: res.remainingToPass || 0,
          operatorStats: res.operatorStats || {
            operatorName: 'Operator',
            passedCount: 0
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
  const preQcPassedQty = poProgress.passedUnique;

  /* ── Pre QC scan handler ─────────────────────────────────────── */
  const handleScanCode = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();

    try {
      setIsSaving(true);
      const res = await apiFetch<any>('/api/pre-qc/scan', {
        method: 'POST',
        body: JSON.stringify({ code, productionOrderId: po?.dbId || po?.id, productionOrderNumber: po?.id }),
      });

      if (res?.status === 'DUPLICATE') {
        const dupItem: ScannedItem = {
          qr: res.item?.qr_code || code,
          product: po?.styleName || po?.styleCode || 'Garment',
          size: res.item?.size || 'L',
          status: 'DUPLICATE',
          scannedAt: new Date().toLocaleTimeString()
        };
        setScannedItem(dupItem);
        showToast(`⚠️ Item ${code} is ALREADY Pre QC Passed!`, 'warning');
        return {
          status: 'duplicate' as const,
          message: `⚠️ Item ${code} is ALREADY Pre QC Passed! (Duplicate scan)`,
          code: res.item?.qr_code || code,
        };
      }

      // Record Pre QC PASS in database table `pre_qc_results`
      const recRes = await apiFetch<any>('/api/pre-qc/record', {
        method: 'POST',
        body: JSON.stringify({ code, productionOrderId: po?.dbId || po?.id, result: 'PASS' }),
      });

      if (recRes?.progress) {
        setPoProgress(prev => ({
          ...prev,
          loading: false,
          targetQuantity: recRes.progress.targetQuantity,
          inspectedUnique: recRes.progress.inspectedUnique,
          passedUnique: recRes.progress.passedUnique,
          remainingToInspect: recRes.progress.remainingToInspect,
          remainingToPass: recRes.progress.remainingToPass,
        }));
      }

      const validItem: ScannedItem = {
        qr: recRes.item?.qr_code || code,
        product: po?.styleName || po?.styleCode || 'Garment',
        size: recRes.item?.size || 'L',
        status: 'VALID',
        scannedAt: new Date().toLocaleTimeString()
      };

      setScannedItem(validItem);
      setRecentScans(prev => [validItem, ...prev.slice(0, 9)]);
      showToast(`✅ Pre QC passed for ${code}`, 'success');

      return {
        status: 'accepted' as const,
        message: `✅ ${code} Pre QC validated successfully for ${po?.id || 'PO'}`,
        code: recRes.item?.qr_code || code,
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
    } finally {
      setIsSaving(false);
    }
  };

  if (showPoSelector || !po) {
    return (
      <SelectPOForOperation
        operationName="Pre QC"
        selectedPoId={po?.id}
        onSelectPo={(selectedPo) => {
          setActiveJob({
            productionOrder: selectedPo,
            shift: selectedPo.shifts?.[0]
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={styles.cardSubTitle}>PRE QC OPERATION</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)', marginTop: '2px' }}>
              {formatPoDisplayName({
                poNumber: po.id,
                poName: po.poName,
                styleName: po.styleName
              })}
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

        {/* Progress Bar */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
            <span>Pre QC Progress: {preQcPassedQty} / {targetPoQty} pcs</span>
            <span style={{ color: 'var(--primary-teal)', fontWeight: 800 }}>
              {Math.round((preQcPassedQty / Math.max(1, targetPoQty)) * 100)}%
            </span>
          </div>
          <ProgressBar current={preQcPassedQty} total={targetPoQty} showText={false} />
        </div>
      </div>

      {/* Barcode Scanner Input */}
      <div style={styles.scannerBox}>
        <ScannerInput
          onScan={handleScanCode}
          placeholder="Scan barcode for Pre QC (e.g. PNFLSS0926001)..."
        />
      </div>

      {/* Scanned Item Result Feedback */}
      {scannedItem && (
        <div
          className="card"
          style={{
            margin: 0,
            borderLeft: `6px solid ${
              scannedItem.status === 'VALID'
                ? 'var(--color-green)'
                : scannedItem.status === 'DUPLICATE'
                ? 'var(--color-orange)'
                : 'var(--color-red)'
            }`,
            backgroundColor:
              scannedItem.status === 'VALID'
                ? 'rgba(16, 185, 129, 0.08)'
                : scannedItem.status === 'DUPLICATE'
                ? 'rgba(245, 158, 11, 0.08)'
                : 'rgba(239, 68, 68, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {scannedItem.status === 'VALID' ? (
                <CheckCircle2 size={32} color="var(--color-green)" />
              ) : scannedItem.status === 'DUPLICATE' ? (
                <ScanLine size={32} color="var(--color-orange)" />
              ) : (
                <XCircle size={32} color="var(--color-red)" />
              )}
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {scannedItem.qr}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Product: {scannedItem.product} • Size: {scannedItem.size}
                </div>
              </div>
            </div>

            <StatusPill
              label={
                scannedItem.status === 'VALID'
                  ? 'PRE QC PASSED'
                  : scannedItem.status === 'DUPLICATE'
                  ? 'DUPLICATE SCAN'
                  : 'INVALID CONFIG'
              }
              variant={
                scannedItem.status === 'VALID'
                  ? 'green'
                  : scannedItem.status === 'DUPLICATE'
                  ? 'amber'
                  : 'red'
              }
            />
          </div>
        </div>
      )}

      {/* Recent Scans History Table */}
      {recentScans.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
            Recent Pre QC Scans
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
                  <StatusPill label={item.status} variant={item.status === 'VALID' ? 'green' : 'red'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScannerStatus showConnectButton={true} />
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
  }
};
