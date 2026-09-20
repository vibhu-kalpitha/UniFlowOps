import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { getPendingSyncCount, flushPendingScans } from '../services/api';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkPending = async () => {
    try {
      const count = await getPendingSyncCount();
      setPendingCount(count);
    } catch {
      // Ignore idb errors
    }
  };

  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 5000);

    const handleOnline = () => {
      setIsOffline(false);
      handleSync();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await flushPendingScans();
      await checkPending();
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div
      style={{
        backgroundColor: isOffline ? '#92400E' : '#065F46',
        color: '#FFFFFF',
        padding: '8px 16px',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        fontWeight: 500,
        zIndex: 999,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <WifiOff size={16} />
        <span>
          {isOffline ? 'Offline Mode.' : 'Back Online.'}{' '}
          {pendingCount > 0 ? `${pendingCount} scan(s) queued locally.` : ''}
        </span>
      </div>

      {pendingCount > 0 && !isOffline && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '4px',
            color: '#FFFFFF',
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      )}
    </div>
  );
};
