import React, { useState, useEffect, useRef } from 'react';
import { QrCode, Camera, Send, CheckCircle2, AlertTriangle, XCircle, Volume2, VolumeX } from 'lucide-react';
import { CameraScannerModal } from './CameraScannerModal';
import { useKeyboardWedgeScanner } from '../hooks/useKeyboardWedgeScanner';

interface ScanFeedback {
  status: 'accepted' | 'duplicate' | 'rejected' | null;
  message: string;
  code?: string;
}

interface ScannerInputProps {
  onScan: (code: string) => Promise<ScanFeedback | void> | ScanFeedback | void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const ScannerInput: React.FC<ScannerInputProps> = ({
  onScan,
  placeholder = 'Scan or type code...',
  autoFocus = true,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem('uniflow_mute_audio') === 'true');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Play audio/haptic feedback
  const triggerBeep = (type: 'accepted' | 'duplicate' | 'rejected') => {
    if ('vibrate' in navigator) {
      if (type === 'accepted') navigator.vibrate(100);
      else if (type === 'duplicate') navigator.vibrate([100, 50, 100]);
      else navigator.vibrate([200, 100, 200]);
    }

    if (muted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'accepted') {
        osc.frequency.value = 880; // A5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'duplicate') {
        osc.frequency.value = 440; // A4
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.value = 220; // A3
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  const handleCodeSubmitted = async (rawCode: string) => {
    const code = rawCode.trim().replace(/[\r\n]/g, '');
    if (!code) return;

    setInputValue('');
    try {
      const result = await onScan(code);
      if (result) {
        setFeedback(result);
        if (result.status) triggerBeep(result.status);
      }
    } catch (err: any) {
      const failFeedback: ScanFeedback = {
        status: 'rejected',
        message: err.message || 'Scan processing failed',
        code,
      };
      setFeedback(failFeedback);
      triggerBeep('rejected');
    } finally {
      // Re-focus input for next scan
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 50);
    }
  };

  // Keyboard wedge listener hook
  const { lastScan } = useKeyboardWedgeScanner({
    onScan: (code) => {
      handleCodeSubmitted(code);
    },
    enabled: !disabled && !isCameraOpen,
  });

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const toggleMute = () => {
    const newMute = !muted;
    setMuted(newMute);
    localStorage.setItem('uniflow_mute_audio', String(newMute));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleCodeSubmitted(inputValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {/* Input Bar */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <QrCode
            size={18}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#16B8AE',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={{
              width: '100%',
              paddingLeft: '40px',
              paddingRight: '12px',
              height: '48px',
              backgroundColor: '#0D2630',
              border: '1px solid rgba(22, 184, 174, 0.4)',
              borderRadius: '10px',
              color: '#FFFFFF',
              fontSize: '16px', // 16px to prevent iOS/Android auto-zoom
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={disabled || !inputValue.trim()}
          style={{
            height: '48px',
            padding: '0 16px',
            backgroundColor: inputValue.trim() ? '#16B8AE' : '#102E38',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 600,
            cursor: inputValue.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'background-color 0.2s',
          }}
        >
          <Send size={18} />
        </button>

        {/* Camera Trigger */}
        <button
          type="button"
          onClick={() => setIsCameraOpen(true)}
          disabled={disabled}
          title="Use Phone Camera"
          style={{
            height: '48px',
            width: '48px',
            backgroundColor: '#102E38',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            color: '#16B8AE',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Camera size={20} />
        </button>

        {/* Mute Toggle */}
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? 'Unmute scanner sounds' : 'Mute scanner sounds'}
          style={{
            height: '48px',
            width: '48px',
            backgroundColor: '#102E38',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            color: muted ? '#64748B' : '#16B8AE',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </form>

      {/* Immediate Visual Feedback Banner */}
      {feedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            backgroundColor:
              feedback.status === 'accepted'
                ? 'rgba(16, 185, 129, 0.15)'
                : feedback.status === 'duplicate'
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${
              feedback.status === 'accepted'
                ? '#10B981'
                : feedback.status === 'duplicate'
                ? '#F59E0B'
                : '#EF4444'
            }`,
            color:
              feedback.status === 'accepted'
                ? '#10B981'
                : feedback.status === 'duplicate'
                ? '#F59E0B'
                : '#EF4444',
          }}
        >
          {feedback.status === 'accepted' && <CheckCircle2 size={20} style={{ flexShrink: 0 }} />}
          {feedback.status === 'duplicate' && <AlertTriangle size={20} style={{ flexShrink: 0 }} />}
          {feedback.status === 'rejected' && <XCircle size={20} style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1 }}>
            <div>{feedback.message}</div>
            {feedback.code && (
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px', fontFamily: 'monospace' }}>
                Code: {feedback.code}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748B' }}>
        <span>Status: <strong style={{ color: '#16B8AE' }}>Scanner Active (Keyboard / Camera)</strong></span>
        {lastScan && <span>Last Scanned: <code style={{ color: '#94A3B8' }}>{lastScan}</code></span>}
      </div>

      {/* Camera Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={(code) => handleCodeSubmitted(code)}
      />
    </div>
  );
};
