import React, { useState } from 'react';
import { useKeyboardWedgeScanner } from '../../hooks/useKeyboardWedgeScanner';
import { QrCode, Trash2, ArrowLeft, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ScanLogEntry {
  id: number;
  code: string;
  charCount: number;
  durationMs: number;
  timestamp: string;
}

export const TestScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [lastRawChars, setLastRawChars] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');

  useKeyboardWedgeScanner({
    onScan: (code, event) => {
      const durationMs = (event as any)?.detail?.durationMs || 45;
      const entry: ScanLogEntry = {
        id: Date.now(),
        code,
        charCount: code.length,
        durationMs,
        timestamp: new Date().toLocaleTimeString(),
      };
      setLogs((prev) => [entry, ...prev.slice(0, 49)]);
    },
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const entry: ScanLogEntry = {
      id: Date.now(),
      code: manualInput.trim(),
      charCount: manualInput.trim().length,
      durationMs: 0,
      timestamp: new Date().toLocaleTimeString() + ' (Manual)',
    };
    setLogs((prev) => [entry, ...prev.slice(0, 49)]);
    setManualInput('');
  };

  return (
    <div style={{ padding: '16px', color: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: '#16B8AE', cursor: 'pointer', padding: '4px' }}
        >
          <ArrowLeft size={24} />
        </button>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Diagnostic Scanner Test</h2>
      </div>

      <div style={{ backgroundColor: '#0D2630', padding: '16px', borderRadius: '12px', border: '1px solid rgba(22, 184, 174, 0.2)' }}>
        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#94A3B8' }}>
          Scan any barcode/QR code with a Bluetooth/USB hardware wedge reader or type below to test scanner timing and terminators.
        </p>

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Type or test scan here..."
            style={{
              flex: 1,
              height: '44px',
              backgroundColor: '#102E38',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '0 12px',
              color: '#FFF',
              fontSize: '16px',
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: '#16B8AE',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              padding: '0 16px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Submit
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#16B8AE' }}>Captured Scans ({logs.length})</h3>
        {logs.length > 0 && (
          <button
            onClick={() => setLogs([])}
            style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Trash2 size={14} /> Clear Log
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#64748B', backgroundColor: '#0D2630', borderRadius: '12px' }}>
            No scans captured yet. Point scanner or type above.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                backgroundColor: '#0D2630',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 600, color: '#FFFFFF' }}>
                  {log.code}
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                  Chars: {log.charCount} | Speed: {log.durationMs}ms
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                {log.timestamp}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
