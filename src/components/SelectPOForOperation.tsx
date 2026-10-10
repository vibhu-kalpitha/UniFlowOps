import React, { useEffect, useState } from 'react';
import { ProductionOrder, OperationType } from '../types';
import { apiFetch } from '../services/api';
import { formatPoDisplayName } from '../utils/formatters';
import { Package, Layers, CheckCircle2, ChevronRight, AlertCircle, RefreshCw, X } from 'lucide-react';
import '../styles/tokens.css';

interface SelectPOForOperationProps {
  operationName: OperationType;
  onSelectPo: (po: ProductionOrder) => void;
  selectedPoId?: string;
  isModal?: boolean;
  onClose?: () => void;
}

export const SelectPOForOperation: React.FC<SelectPOForOperationProps> = ({
  operationName,
  onSelectPo,
  selectedPoId,
  isModal = false,
  onClose
}) => {
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isGenericPoSelect = !operationName || ['ALL', 'Select PO', 'Change PO', 'Production Order'].includes(operationName as string);

  const fetchAssignedPOs = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParam = isGenericPoSelect ? '' : `?operation=${encodeURIComponent(operationName)}`;
      const data = await apiFetch<ProductionOrder[]>(`/api/operators/me/assignments${queryParam}`);
      if (Array.isArray(data)) {
        setPos(data);
      } else {
        setPos([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch operator assignments:', err);
      setError(err?.message || 'Failed to load assigned Production Orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedPOs();
  }, [operationName]);

  const content = (
    <div style={{ padding: isModal ? '20px' : '24px 16px', position: 'relative' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', paddingRight: isModal ? '36px' : '0' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
          {isGenericPoSelect ? 'Select Production Order' : `Select Production Order for ${operationName}`}
        </h2>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
          {loading
            ? 'Loading your authorized Production Orders...'
            : pos.length > 0
            ? isGenericPoSelect
              ? 'Select an assigned Production Order to set as your active job.'
              : `Select an assigned Production Order to proceed with ${operationName}.`
            : isGenericPoSelect
              ? 'No active Production Orders currently allocated to you.'
              : `No active Production Orders found for ${operationName}.`}
        </p>
      </div>

      {loading && (
        <div style={{
          padding: '40px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          gap: '12px'
        }}>
          <RefreshCw className="spin" size={32} style={{ color: 'var(--primary-teal, #14b8a6)' }} />
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Loading authorized Production Orders from database...
          </p>
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: '20px',
          maxWidth: '500px',
          margin: '0 auto',
          textAlign: 'center',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '14px'
        }}>
          <AlertCircle size={36} style={{ color: '#ef4444', marginBottom: '10px' }} />
          <h4 style={{ margin: '0 0 6px 0', color: '#f87171' }}>Unable to load assignments</h4>
          <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px' }}>{error}</p>
          <button
            onClick={fetchAssignedPOs}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      )}

      {!loading && !error && pos.length === 0 && (
        <div style={{
          padding: '32px 20px',
          maxWidth: '500px',
          margin: '10px auto',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface-2, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          borderRadius: '16px'
        }}>
          <Package size={44} style={{ color: '#64748b', marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '1.1rem', fontWeight: 700 }}>
            No Authorized Production Orders
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '20px' }}>
            You currently have no active Production Orders assigned to you for <strong>{operationName}</strong>.
            <br />
            Please ask your Supervisor to allocate you to a Shift / Production Order in <strong>Shift Management</strong>.
          </p>
          <button
            onClick={fetchAssignedPOs}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-surface-1, #0f172a)',
              color: '#f8fafc',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Refresh Assignments
          </button>
        </div>
      )}

      {!loading && !error && pos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
          maxHeight: isModal ? '55vh' : 'none',
          overflowY: isModal ? 'auto' : 'visible',
          paddingRight: isModal ? '4px' : '0'
        }}>
          {pos.map(po => {
            const isSelected = selectedPoId === po.id || selectedPoId === po.dbId;
            const configsCount = po.productConfigurations?.length || 0;
            const totalQty = po.totalQuantity || po.productConfigurations?.reduce((acc, c) => acc + (c.quantity || 0), 0) || 0;

            return (
              <div
                key={po.id || po.dbId}
                onClick={() => onSelectPo(po)}
                style={{
                  backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.12)' : 'var(--bg-surface-2, #1e293b)',
                  border: isSelected ? '2px solid var(--primary-teal, #14b8a6)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                  borderRadius: '14px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 14px rgba(20, 184, 166, 0.2)' : '0 2px 6px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--primary-teal, #14b8a6)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.1))';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <span style={{
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color: isSelected ? 'var(--primary-teal, #14b8a6)' : '#f8fafc'
                    }}>
                      {formatPoDisplayName(po)}
                    </span>
                    {po.status && (
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: po.status === 'Current' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: po.status === 'Current' ? '#10b981' : '#94a3b8'
                      }}>
                        {po.status}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '10px' }}>
                    Map PO: <strong style={{ color: '#e2e8f0' }}>{po.mapPo || 'N/A'}</strong>
                    {po.customer && <span> • Customer: <strong style={{ color: '#e2e8f0' }}>{po.customer}</strong></span>}
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    fontSize: '0.82rem',
                    color: '#94a3b8',
                    padding: '8px 0',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <span>Configs: </span>
                      <strong style={{ color: '#f8fafc' }}>{configsCount}</strong>
                    </div>
                    <div>
                      <span>Total Qty: </span>
                      <strong style={{ color: '#f8fafc' }}>{totalQty}</strong>
                    </div>
                    {po.qcTestMode && (
                      <div>
                        <span>Mode: </span>
                        <strong style={{ color: 'var(--primary-teal, #14b8a6)' }}>{po.qcTestMode}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(po.selectedOperations || ['QC Test', 'Packing', 'AQL Checker']).map((op, i) => (
                      <span key={i} style={{
                        fontSize: '0.68rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: op === operationName ? 'var(--primary-teal, #14b8a6)' : 'rgba(255,255,255,0.08)',
                        color: op === operationName ? '#ffffff' : '#94a3b8',
                        fontWeight: op === operationName ? 700 : 400
                      }}>
                        {op}
                      </span>
                    ))}
                  </div>

                  <button
                    className={isSelected ? 'btn btn-success' : 'btn btn-primary'}
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? '#10b981' : 'var(--primary-teal, #14b8a6)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: '44px'
                    }}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 size={14} /> Active
                      </>
                    ) : (
                      <>
                        Select <ChevronRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!isModal) {
    return <div style={{ maxWidth: '800px', margin: '0 auto' }}>{content}</div>;
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface-1, #0f172a)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
        borderRadius: '20px',
        width: '94%',
        maxWidth: '680px',
        maxHeight: '88vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <X size={18} />
          </button>
        )}
        {content}
      </div>
    </div>
  );
};
