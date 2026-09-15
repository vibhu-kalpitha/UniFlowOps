import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerInput } from '../../components/ScannerInput';
import { CheckCircle2, XCircle, FileText, Check } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const QCTestPage: React.FC = () => {
  const { activeJob, incrementQCPassed, showToast } = useApp();

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const [scannedItem, setScannedItem] = useState<{
    qr: string;
    product: string;
    size: string;
    status: 'VALID' | 'DUPLICATE' | 'INVALID';
  }>({
    qr: 'PNFLS092632677',
    product: so?.product || 'Running Tee',
    size: 'L',
    status: 'VALID'
  });

  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [testResult, setTestResult] = useState<'PASS' | 'FAIL'>('PASS');

  const handleScanCode = async (code: string) => {
    try {
      const res = await apiFetch('/api/qc/scan', {
        method: 'POST',
        body: JSON.stringify({ code, salesOrderId: so?.id || 'SO-77201' }),
      });
      setScannedItem({
        qr: res.item.qr_code,
        product: so?.product || 'Running Tee',
        size: res.item.size || 'L',
        status: res.status === 'DUPLICATE' ? 'DUPLICATE' : 'VALID',
      });
      return {
        status: res.status === 'DUPLICATE' ? ('duplicate' as const) : ('accepted' as const),
        message: res.message || `Item ${res.item.qr_code} scanned successfully.`,
        code: res.item.qr_code,
      };
    } catch (err: any) {
      setScannedItem({
        qr: code,
        product: 'Unknown Item',
        size: '-',
        status: 'INVALID',
      });
      return {
        status: 'rejected' as const,
        message: err.message || 'Invalid item QR code',
        code,
      };
    }
  };

  const handleSave = async () => {
    if (scannedItem.status === 'INVALID') {
      showToast('Cannot save invalid item!', 'error');
      return;
    }

    try {
      await apiFetch('/api/qc/results', {
        method: 'POST',
        body: JSON.stringify({
          qrCode: scannedItem.qr,
          salesOrderId: so?.id || 'SO-77201',
          qcResult,
          testResult,
        }),
      });

      if (qcResult === 'PASS' && testResult === 'PASS') {
        incrementQCPassed();
        showToast(`QC & Test passed for ${scannedItem.qr}. Saved to SQLite!`, 'success');
      } else {
        showToast(`QC/Test failure recorded in database for ${scannedItem.qr}`, 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving QC result', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* PO/SO Active Banner */}
      <div style={styles.banner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={20} color="var(--primary-teal)" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
              {po?.id || 'PO-2026-0184'} | {so?.id || 'SO-77201'}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {so?.product || 'Running Tee'} — {so?.colour || 'Black'}
            </span>
          </div>
        </div>
      </div>

      {/* Scanner Connected Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CheckCircle2 size={16} color="var(--color-green)" />
        <span style={{ fontSize: '12px', color: 'var(--color-green)', fontWeight: 700 }}>
          Scanner Connected
        </span>
      </div>

      {/* Scanner Input Component */}
      <ScannerInput onScan={handleScanCode} placeholder="Scan or type garment QR code..." />

      {/* Item Details Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)' }}>
        <span style={styles.cardHeaderTitle}>ITEM DETAILS</span>
        
        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Item QR</span>
          <span style={styles.detailValue}>{scannedItem.qr}</span>
        </div>

        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Product</span>
          <span style={styles.detailValue}>{scannedItem.product}</span>
        </div>

        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Size</span>
          <span style={styles.detailValue}>{scannedItem.size}</span>
        </div>

        <div style={styles.detailRow}>
          <span style={styles.detailLabel}>Status</span>
          {scannedItem.status === 'VALID' && <StatusPill label="Valid Item" variant="green" />}
          {scannedItem.status === 'DUPLICATE' && <StatusPill label="Duplicate Warning" variant="amber" />}
          {scannedItem.status === 'INVALID' && <StatusPill label="Invalid Item" variant="red" />}
        </div>
      </div>

      {/* QC Result Segmented Controls */}
      <div>
        <span style={styles.controlLabel}>QC Result</span>
        <div style={styles.segmentRow}>
          <button
            style={qcResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
            onClick={() => setQcResult('PASS')}
          >
            <Check size={18} /> PASS
          </button>
          <button
            style={qcResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
            onClick={() => setQcResult('FAIL')}
          >
            <XCircle size={18} /> FAIL
          </button>
        </div>
      </div>

      {/* Test Result Segmented Controls */}
      <div>
        <span style={styles.controlLabel}>Test Result</span>
        <div style={styles.segmentRow}>
          <button
            style={testResult === 'PASS' ? styles.passBtnActive : styles.segmentBtn}
            onClick={() => setTestResult('PASS')}
          >
            <Check size={18} /> PASS
          </button>
          <button
            style={testResult === 'FAIL' ? styles.failBtnActive : styles.segmentBtn}
            onClick={() => setTestResult('FAIL')}
          >
            <XCircle size={18} /> FAIL
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button className="btn-primary" onClick={handleSave} style={{ marginTop: '8px' }}>
        Save
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  banner: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '12px 14px'
  },
  scanBox: {
    backgroundColor: 'rgba(22, 184, 174, 0.06)',
    border: '2px dashed var(--primary-teal)',
    borderRadius: '20px',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    cursor: 'pointer'
  },
  scanIconWrap: {
    width: '60px',
    height: '60px',
    borderRadius: '18px',
    backgroundColor: 'rgba(22, 184, 174, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '10px'
  },
  scanText: {
    fontSize: '17px',
    fontWeight: 800,
    color: 'var(--text-primary)'
  },
  scanSubText: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '4px'
  },
  cardHeaderTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginBottom: '12px',
    display: 'block'
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
