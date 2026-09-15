import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera } from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      return;
    }

    setErrorMsg(null);
    const codeReader = new BrowserMultiFormatReader();

    codeReader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, error, controls) => {
        controlsRef.current = controls;
        if (result) {
          const scannedText = result.getText().trim();
          if (scannedText) {
            controls.stop();
            controlsRef.current = null;
            onScan(scannedText);
            onClose();
          }
        }
      })
      .catch((err) => {
        console.error('Camera QR init error:', err);
        setErrorMsg('Could not access camera. Please grant camera permission.');
      });

    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [isOpen, onScan, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#0D2630',
        borderRadius: '16px',
        border: '1px solid rgba(22, 184, 174, 0.3)',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16B8AE', fontWeight: 600 }}>
            <Camera size={20} />
            <span>Camera QR Scanner</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Video Container */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '280px',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {errorMsg ? (
            <div style={{ color: '#EF4444', textAlign: 'center', padding: '16px', fontSize: '14px' }}>
              {errorMsg}
            </div>
          ) : (
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Target Reticle Overlay */}
          {!errorMsg && (
            <div style={{
              position: 'absolute',
              width: '200px',
              height: '200px',
              border: '2px dashed #16B8AE',
              borderRadius: '12px',
              pointerEvents: 'none',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
            }} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ color: '#94A3B8', fontSize: '13px', margin: 0 }}>
            Point camera at garment or box QR code
          </p>
        </div>
      </div>
    </div>
  );
};
