import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';

export type ScannerStatusType =
  | 'disconnected'
  | 'not_verified'
  | 'connecting'
  | 'input_active'
  | 'connected'
  | 'camera_active'
  | 'error';

export type ScannerConnectionType =
  | 'none'
  | 'keyboard_wedge'
  | 'web_hid'
  | 'web_serial'
  | 'camera';

export interface ScannerState {
  status: ScannerStatusType;
  connectionType: ScannerConnectionType;
  deviceName: string | null;
  lastScannedCode: string | null;
  lastScanTime: number | null;
  errorMessage: string | null;
}

interface ScannerContextType {
  scannerState: ScannerState;
  connectWebHid: () => Promise<void>;
  connectWebSerial: () => Promise<void>;
  setCameraActive: (active: boolean, error?: string | null) => void;
  notifyKeyboardScan: (code: string, isBurstScanner: boolean) => void;
  notifyManualInput: () => void;
  disconnectScanner: () => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

const INITIAL_STATE: ScannerState = {
  status: 'disconnected',
  connectionType: 'none',
  deviceName: null,
  lastScannedCode: null,
  lastScanTime: null,
  errorMessage: null,
};

export const ScannerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [scannerState, setScannerState] = useState<ScannerState>(INITIAL_STATE);
  const activeHidDeviceRef = useRef<any>(null);
  const activeSerialPortRef = useRef<any>(null);
  const inactivityTimerRef = useRef<any>(null);

  // Set default status to 'disconnected' or 'not_verified' on fresh load
  useEffect(() => {
    setScannerState({
      status: 'disconnected',
      connectionType: 'none',
      deviceName: null,
      lastScannedCode: null,
      lastScanTime: null,
      errorMessage: null,
    });
  }, []);

  // Web HID & Web Serial Disconnect Event Listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHidDisconnect = (event: any) => {
      console.log('🔌 Web HID Scanner disconnected:', event.device?.productName);
      activeHidDeviceRef.current = null;
      setScannerState({
        status: 'disconnected',
        connectionType: 'none',
        deviceName: null,
        lastScannedCode: null,
        lastScanTime: Date.now(),
        errorMessage: 'HID Device disconnected',
      });
    };

    const handleSerialDisconnect = (event: any) => {
      console.log('🔌 Web Serial Scanner disconnected:', event);
      activeSerialPortRef.current = null;
      setScannerState({
        status: 'disconnected',
        connectionType: 'none',
        deviceName: null,
        lastScannedCode: null,
        lastScanTime: Date.now(),
        errorMessage: 'Serial Port disconnected',
      });
    };

    if ((navigator as any).hid) {
      (navigator as any).hid.addEventListener('disconnect', handleHidDisconnect);
    }
    if ((navigator as any).serial) {
      (navigator as any).serial.addEventListener('disconnect', handleSerialDisconnect);
    }

    return () => {
      if ((navigator as any).hid) {
        (navigator as any).hid.removeEventListener('disconnect', handleHidDisconnect);
      }
      if ((navigator as any).serial) {
        (navigator as any).serial.removeEventListener('disconnect', handleSerialDisconnect);
      }
    };
  }, []);

  const connectWebHid = async (): Promise<void> => {
    if (!('hid' in navigator)) {
      setScannerState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Web HID API is not supported by your browser. Use Chrome/Edge or Camera/Keyboard Wedge.',
      }));
      throw new Error('Web HID API is not supported by this browser.');
    }

    setScannerState(prev => ({ ...prev, status: 'connecting', errorMessage: null }));

    try {
      const devices = await (navigator as any).hid.requestDevice({ filters: [] });
      if (!devices || devices.length === 0) {
        setScannerState(prev => ({ ...prev, status: 'disconnected', errorMessage: 'No HID device selected.' }));
        return;
      }

      const device = devices[0];
      if (!device.opened) {
        await device.open();
      }

      activeHidDeviceRef.current = device;
      const deviceName = device.productName || 'USB HID Scanner';

      setScannerState({
        status: 'connected',
        connectionType: 'web_hid',
        deviceName,
        lastScannedCode: null,
        lastScanTime: Date.now(),
        errorMessage: null,
      });
    } catch (err: any) {
      console.error('Web HID connection error:', err);
      setScannerState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: err.message || 'Failed to open HID Scanner device.',
      }));
      throw err;
    }
  };

  const connectWebSerial = async (): Promise<void> => {
    if (!('serial' in navigator)) {
      setScannerState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Web Serial API is not supported by your browser. Use Chrome/Edge or Camera/Keyboard Wedge.',
      }));
      throw new Error('Web Serial API is not supported by this browser.');
    }

    setScannerState(prev => ({ ...prev, status: 'connecting', errorMessage: null }));

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });

      activeSerialPortRef.current = port;

      setScannerState({
        status: 'connected',
        connectionType: 'web_serial',
        deviceName: 'Serial Barcode Scanner',
        lastScannedCode: null,
        lastScanTime: Date.now(),
        errorMessage: null,
      });
    } catch (err: any) {
      console.error('Web Serial connection error:', err);
      setScannerState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: err.message || 'Failed to open Serial Scanner port.',
      }));
      throw err;
    }
  };

  const setCameraActive = (active: boolean, error?: string | null) => {
    if (active) {
      setScannerState({
        status: 'camera_active',
        connectionType: 'camera',
        deviceName: 'Device Camera',
        lastScannedCode: null,
        lastScanTime: Date.now(),
        errorMessage: null,
      });
    } else {
      setScannerState(prev => ({
        ...prev,
        status: error ? 'error' : 'disconnected',
        connectionType: 'none',
        errorMessage: error || null,
      }));
    }
  };

  const notifyKeyboardScan = (code: string, isBurstScanner: boolean) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (isBurstScanner) {
      setScannerState({
        status: 'input_active',
        connectionType: 'keyboard_wedge',
        deviceName: 'Keyboard-Wedge Scanner',
        lastScannedCode: code,
        lastScanTime: Date.now(),
        errorMessage: null,
      });

      // Revert status to 'not_verified' after 8 seconds of inactivity
      inactivityTimerRef.current = setTimeout(() => {
        setScannerState(prev => {
          if (prev.status === 'input_active') {
            return {
              ...prev,
              status: 'not_verified',
              errorMessage: null,
            };
          }
          return prev;
        });
      }, 8000);
    } else {
      // Manual typing does NOT set scanner connected/active
      setScannerState(prev => {
        if (prev.status === 'connected' || prev.status === 'camera_active') {
          return prev;
        }
        return {
          ...prev,
          status: 'not_verified',
          errorMessage: null,
        };
      });
    }
  };

  const notifyManualInput = () => {
    setScannerState(prev => {
      if (prev.status === 'connected' || prev.status === 'camera_active') {
        return prev;
      }
      return {
        ...prev,
        status: 'not_verified',
        errorMessage: null,
      };
    });
  };

  const disconnectScanner = () => {
    if (activeHidDeviceRef.current) {
      try {
        activeHidDeviceRef.current.close();
      } catch {}
      activeHidDeviceRef.current = null;
    }
    if (activeSerialPortRef.current) {
      try {
        activeSerialPortRef.current.close();
      } catch {}
      activeSerialPortRef.current = null;
    }

    setScannerState({
      status: 'disconnected',
      connectionType: 'none',
      deviceName: null,
      lastScannedCode: null,
      lastScanTime: Date.now(),
      errorMessage: null,
    });
  };

  return (
    <ScannerContext.Provider
      value={{
        scannerState,
        connectWebHid,
        connectWebSerial,
        setCameraActive,
        notifyKeyboardScan,
        notifyManualInput,
        disconnectScanner,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
};

export const useScanner = () => {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
};
