import { useState, useEffect, useRef } from 'react';

interface ScannerOptions {
  onScan: (code: string, idempotencyKey: string) => void;
  enabled?: boolean;
}

export function useKeyboardWedgeScanner({ onScan, enabled = true }: ScannerOptions) {
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [scannerStatus, setScannerStatus] = useState<'Ready' | 'Scanning' | 'Error'>('Ready');
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is typing in unrelated inputs, ignore unless rapid scanner stream
      const target = e.target as HTMLElement;
      const isInputElem = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If slow interval (> 120ms), clear buffer unless it's a barcode scanner input
      if (timeDiff > 120 && !isInputElem) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        const raw = bufferRef.current.trim().replace(/[\r\n]+/g, '');
        if (raw.length >= 3) {
          // Debounce duplicate physical scans within 800ms
          if (now - lastScanTimeRef.current > 800 || raw !== lastScannedCode) {
            lastScanTimeRef.current = now;
            setLastScannedCode(raw);
            setScannerStatus('Ready');
            const idempotencyKey = `scan-${Date.now()}-${Math.random().toString().slice(2, 7)}`;
            
            // Play haptic feedback
            if (navigator.vibrate) {
              navigator.vibrate([70]);
            }
            
            onScan(raw, idempotencyKey);
          }
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onScan, lastScannedCode]);

  const triggerManualScan = (code: string) => {
    const normalized = code.trim().replace(/[\r\n]+/g, '');
    if (!normalized) return;
    setLastScannedCode(normalized);
    const idempotencyKey = `scan-${Date.now()}-${Math.random().toString().slice(2, 7)}`;
    if (navigator.vibrate) navigator.vibrate([70]);
    onScan(normalized, idempotencyKey);
  };

  return {
    lastScannedCode,
    lastScan: lastScannedCode,
    scannerStatus,
    triggerManualScan
  };
}
