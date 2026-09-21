import { useState, useEffect, useRef } from 'react';
import { useScanner } from '../context/ScannerContext';

interface ScannerOptions {
  onScan: (code: string, idempotencyKey: string) => void;
  enabled?: boolean;
}

export function useKeyboardWedgeScanner({ onScan, enabled = true }: ScannerOptions) {
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [scannerStatus, setScannerStatus] = useState<'Ready' | 'Scanning' | 'Error'>('Ready');
  const bufferRef = useRef<string>('');
  const keyTimesRef = useRef<number[]>([]);
  const lastKeyTimeRef = useRef<number>(0);
  const lastScanTimeRef = useRef<number>(0);

  const { notifyKeyboardScan, notifyManualInput } = useScanner();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputElem = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If slow gap between keystrokes (> 150ms), reset buffer unless inside active scanner input
      if (timeDiff > 150 && !isInputElem) {
        bufferRef.current = '';
        keyTimesRef.current = [];
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        const raw = bufferRef.current.trim().replace(/[\r\n]+/g, '');
        if (raw.length >= 3) {
          // Calculate average inter-character delay to distinguish scanner from human typing
          const times = keyTimesRef.current;
          let avgDelay = 200;
          if (times.length > 1) {
            const sumDelays = times.slice(1).reduce((acc, t, idx) => acc + (t - times[idx]), 0);
            avgDelay = sumDelays / (times.length - 1);
          }

          // A real scanner-like input transmits characters rapidly (< 60ms average per char)
          const isRapidScannerInput = avgDelay < 60 || times.length >= 6;

          // Notify scanner context about connection/input status
          notifyKeyboardScan(raw, isRapidScannerInput);

          // Debounce duplicate physical scans within 800ms
          if (now - lastScanTimeRef.current > 800 || raw !== lastScannedCode) {
            lastScanTimeRef.current = now;
            setLastScannedCode(raw);
            setScannerStatus('Ready');
            const idempotencyKey = `scan-${Date.now()}-${Math.random().toString().slice(2, 7)}`;
            
            if (navigator.vibrate) {
              navigator.vibrate([70]);
            }
            
            onScan(raw, idempotencyKey);
          }
          bufferRef.current = '';
          keyTimesRef.current = [];
        }
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
        keyTimesRef.current.push(now);

        // If manual typing detected (slow keystroke), inform context without marking connected
        if (timeDiff > 120) {
          notifyManualInput();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onScan, lastScannedCode, notifyKeyboardScan, notifyManualInput]);

  const triggerManualScan = (code: string) => {
    const normalized = code.trim().replace(/[\r\n]+/g, '');
    if (!normalized) return;
    setLastScannedCode(normalized);
    notifyManualInput();
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
