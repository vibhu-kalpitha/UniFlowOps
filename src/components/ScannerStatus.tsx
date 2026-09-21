import React, { useState } from 'react';
import { useScanner, ScannerStatusType } from '../context/ScannerContext';
import { Wifi, WifiOff, ScanLine, Camera, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Usb, Plus, X } from 'lucide-react';
import { CameraScannerModal } from './CameraScannerModal';
import '../styles/tokens.css';

interface ScannerStatusProps {
  compact?: boolean;
  showConnectButton?: boolean;
  onCodeScanned?: (code: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

export const ScannerStatus: React.FC<ScannerStatusProps> = ({
  compact = false,
  showConnectButton = true,
  onCodeScanned,
  style,
  className
}) => {
  const { scannerState, connectWebHid, connectWebSerial, setCameraActive, disconnectScanner } = useScanner();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const getStatusConfig = (status: ScannerStatusType) => {
    switch (status) {
      case 'connected':
        return {
          label: scannerState.errorMessage
            ? scannerState.errorMessage
            : `Scanner Connected (${scannerState.deviceName || 'HID Keyboard'})`,
          bgColor: 'rgba(24, 184, 121, 0.12)',
          borderColor: 'rgba(24, 184, 121, 0.3)',
          textColor: '#18B879',
          icon: Wifi,
          badgeColor: '#18B879',
        };
      case 'input_active':
        return {
          label: 'Scanner Input Active',
          subtext: 'Keyboard-wedge scan verified',
          bgColor: 'rgba(34, 211, 197, 0.12)',
          borderColor: 'rgba(34, 211, 197, 0.3)',
          textColor: 'var(--primary-teal)',
          icon: CheckCircle2,
          badgeColor: 'var(--primary-teal)',
        };
      case 'camera_active':
        return {
          label: 'Camera Scanning Active',
          bgColor: 'rgba(34, 211, 197, 0.15)',
          borderColor: 'rgba(34, 211, 197, 0.4)',
          textColor: 'var(--primary-teal)',
          icon: Camera,
          badgeColor: 'var(--primary-teal)',
        };
      case 'connecting':
        return {
          label: 'Connecting Scanner...',
          bgColor: 'rgba(67, 133, 245, 0.12)',
          borderColor: 'rgba(67, 133, 245, 0.3)',
          textColor: 'var(--color-blue)',
          icon: RefreshCw,
          badgeColor: 'var(--color-blue)',
        };
      case 'not_verified':
        return {
          label: 'Scanner Not Verified',
          subtext: 'Scan code into field to verify scanner',
          bgColor: 'rgba(245, 158, 11, 0.12)',
          borderColor: 'rgba(245, 158, 11, 0.3)',
          textColor: 'var(--color-amber)',
          icon: AlertTriangle,
          badgeColor: 'var(--color-amber)',
        };
      case 'error':
        return {
          label: scannerState.errorMessage || 'Scanner Error',
          bgColor: 'rgba(239, 68, 68, 0.12)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          textColor: '#EF4444',
          icon: XCircle,
          badgeColor: '#EF4444',
        };
      case 'disconnected':
      default:
        return {
          label: 'Scanner Disconnected',
          subtext: 'Connect scanner or use manual input',
          bgColor: 'rgba(239, 68, 68, 0.12)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          textColor: '#EF4444',
          icon: WifiOff,
          badgeColor: '#EF4444',
        };
    }
  };

  const config = getStatusConfig(scannerState.status);
  const IconComp = config.icon;

  const handleConnectHid = async () => {
    setModalError(null);
    setIsConnecting(true);
    try {
      await connectWebHid();
      setShowConnectModal(false);
    } catch (err: any) {
      setModalError(err.message || 'Failed to connect Web HID scanner');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectSerial = async () => {
    setModalError(null);
    setIsConnecting(true);
    try {
      await connectWebSerial();
      setShowConnectModal(false);
    } catch (err: any) {
      setModalError(err.message || 'Failed to connect Web Serial scanner');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOpenCamera = () => {
    setShowConnectModal(false);
    setIsCameraOpen(true);
    setCameraActive(true);
  };

  if (compact) {
    return (
      <>
        <div
          className={className}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: config.bgColor,
            border: `1px solid ${config.borderColor}`,
            padding: '6px 12px',
            borderRadius: '20px',
            cursor: showConnectButton ? 'pointer' : 'default',
            ...style
          }}
          onClick={() => {
            if (showConnectButton) setShowConnectModal(true);
          }}
          title={config.subtext || config.label}
        >
          <IconComp size={14} color={config.textColor} className={scannerState.status === 'connecting' ? 'spin' : ''} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: config.textColor }}>
            {config.label}
          </span>
          {showConnectButton && scannerState.status !== 'connected' && (
            <span style={{ fontSize: '11px', color: config.textColor, opacity: 0.8, marginLeft: '2px', textDecoration: 'underline' }}>
              • Connect
            </span>
          )}
        </div>

        {/* Connection Modal */}
        {showConnectModal && (
          <ConnectionModal
            onClose={() => setShowConnectModal(false)}
            onConnectHid={handleConnectHid}
            onConnectSerial={handleConnectSerial}
            onOpenCamera={handleOpenCamera}
            onDisconnect={disconnectScanner}
            isConnected={scannerState.status === 'connected'}
            isConnecting={isConnecting}
            error={modalError}
          />
        )}

        {/* Camera Scanner Modal */}
        <CameraScannerModal
          isOpen={isCameraOpen}
          onClose={() => {
            setIsCameraOpen(false);
            setCameraActive(false);
          }}
          onScan={(code) => {
            if (onCodeScanned) onCodeScanned(code);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: config.bgColor,
          border: `1px solid ${config.borderColor}`,
          padding: '12px 16px',
          borderRadius: '14px',
          width: '100%',
          ...style
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <IconComp size={18} color={config.textColor} className={scannerState.status === 'connecting' ? 'spin' : ''} />
          </div>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: config.textColor, display: 'block' }}>
              {config.label}
            </span>
            {config.subtext && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                {config.subtext}
              </span>
            )}
          </div>
        </div>

        {showConnectButton && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {scannerState.status === 'connected' ? (
              <button
                type="button"
                className="btn-danger"
                onClick={disconnectScanner}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px' }}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConnectModal(true)}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Usb size={14} color="var(--primary-teal)" /> Connect Scanner
              </button>
            )}
          </div>
        )}
      </div>

      {/* Connection Modal */}
      {showConnectModal && (
        <ConnectionModal
          onClose={() => setShowConnectModal(false)}
          onConnectHid={handleConnectHid}
          onConnectSerial={handleConnectSerial}
          onOpenCamera={handleOpenCamera}
          onDisconnect={disconnectScanner}
          isConnected={scannerState.status === 'connected'}
          isConnecting={isConnecting}
          error={modalError}
        />
      )}

      {/* Camera Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => {
          setIsCameraOpen(false);
          setCameraActive(false);
        }}
        onScan={(code) => {
          if (onCodeScanned) onCodeScanned(code);
        }}
      />
    </>
  );
};

interface ConnectionModalProps {
  onClose: () => void;
  onConnectHid: () => void;
  onConnectSerial: () => void;
  onOpenCamera: () => void;
  onDisconnect: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({
  onClose,
  onConnectHid,
  onConnectSerial,
  onOpenCamera,
  onDisconnect,
  isConnected,
  isConnecting,
  error
}) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface-1)',
        border: '1px solid var(--border-color)',
        borderRadius: '24px',
        padding: '20px',
        width: '100%',
        maxWidth: '420px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Hardware Scanner Connection
          </h3>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={onClose}>
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', color: '#EF4444', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Option A: Web HID USB/Bluetooth */}
          <button
            type="button"
            className="btn-secondary"
            onClick={onConnectHid}
            disabled={isConnecting}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', textAlign: 'left' }}
          >
            <Usb size={20} color="var(--primary-teal)" />
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                Connect USB / Bluetooth HID Device
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Direct WebHID permission pair (Honeywell, Zebra, Datalogic)
              </span>
            </div>
          </button>

          {/* Option B: Web Serial */}
          <button
            type="button"
            className="btn-secondary"
            onClick={onConnectSerial}
            disabled={isConnecting}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', textAlign: 'left' }}
          >
            <Usb size={20} color="var(--color-blue)" />
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                Connect Web Serial Port Device
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                COM port or Serial USB adapter pair
              </span>
            </div>
          </button>

          {/* Option C: Camera Scan */}
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenCamera}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', textAlign: 'left' }}
          >
            <Camera size={20} color="var(--primary-teal)" />
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                Use Phone / Device Camera QR Reader
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Opens live video camera viewfinder
              </span>
            </div>
          </button>
        </div>

        {/* Keyboard Wedge Note */}
        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Keyboard-Wedge Scanners:</strong> USB or Bluetooth scanners configured as keyboards require no hardware permissions. Simply click into any scan field and trigger the barcode. Once a scan is received, status updates to <em>"Scanner Input Active"</em>.
        </div>

        {isConnected && (
          <button type="button" className="btn-danger" onClick={onDisconnect}>
            Disconnect Current Hardware Device
          </button>
        )}
      </div>
    </div>
  );
};
