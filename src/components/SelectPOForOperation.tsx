import React, { useEffect, useState } from 'react';
import { ProductionOrder, OperationType } from '../types';
import { apiFetch } from '../services/api';
import { Package, Layers, Calendar, CheckCircle2, ChevronRight, AlertCircle, RefreshCw, X } from 'lucide-react';
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

  const fetchAssignedPOs = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParam = operationName ? `?operation=${encodeURIComponent(operationName)}` : '';
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
    <div style={{ padding: isModal ? 'var(--spacing-md)' : 'var(--spacing-lg) var(--spacing-md)', position: 'relative' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--spacing-lg)', textAlign: isModal ? 'left' : 'center', paddingRight: isModal ? '32px' : '0' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Select Production Order for {operationName}
        </h2>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
          {loading
            ? 'Fetching your authorized Production Orders...'
            : pos.length > 0
            ? `You have ${pos.length} authorized Production Order${pos.length > 1 ? 's' : ''}. Select one to proceed.`
            : 'No active Production Orders found for this operation.'}
        </p>
      </div>

      {loading && (
        <div style={{
          padding: 'var(--spacing-2xl)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '220px',
          gap: 'var(--spacing-md)'
        }}>
          <RefreshCw className="spin" size={32} style={{ color: 'var(--color-primary, #3182ce)' }} />
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
            Loading authorized Production Orders...
          </p>
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: 'var(--spacing-xl)',
          maxWidth: '500px',
          margin: '0 auto',
          textAlign: 'center',
          backgroundColor: '#fff5f5',
          border: '1px solid #feb2b2',
          borderRadius: 'var(--radius-lg)'
        }}>
          <AlertCircle size={40} style={{ color: '#e53e3e', marginBottom: 'var(--spacing-md)' }} />
          <h3 style={{ margin: '0 0 var(--spacing-sm) 0', color: '#9b2c2c' }}>Unable to load assignments</h3>
          <p style={{ color: '#742a2a', fontSize: '0.9rem', marginBottom: 'var(--spacing-lg)' }}>{error}</p>
          <button
            onClick={fetchAssignedPOs}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      )}

      {!loading && !error && pos.length === 0 && (
        <div style={{
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
          maxWidth: '550px',
          margin: '1rem auto',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--color-border, #e2e8f0)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
          <Package size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' }} />
          <h3 style={{ margin: '0 0 var(--spacing-sm) 0', color: 'var(--color-text-primary)' }}>
            No Authorized Production Orders
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: 'var(--spacing-lg)' }}>
            You currently have no active Production Orders assigned to you for <strong>{operationName}</strong>.
            <br />
            Please ask your Supervisor to assign you to a Shift / Production Order in <strong>Shift Management</strong>.
          </p>
          <button
            onClick={fetchAssignedPOs}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} /> Refresh Assignments
          </button>
        </div>
      )}

      {!loading && !error && pos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--spacing-md)',
          maxHeight: isModal ? '60vh' : 'none',
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
                  backgroundColor: isSelected ? 'var(--color-primary-light, #ebf8ff)' : 'var(--color-surface, #ffffff)',
                  border: isSelected ? '2px solid var(--color-primary, #3182ce)' : '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  padding: 'var(--spacing-lg, 16px)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 4px 12px rgba(49, 130, 206, 0.15)' : '0 2px 4px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-primary, #3182ce)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border, #e2e8f0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xs)' }}>
                    <span style={{
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary, #1a202c)'
                    }}>
                      {po.styleName || po.styleCode || 'Style'} - {po.id}
                    </span>
                    {po.status && (
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: po.status === 'Current' ? '#def7ec' : '#f3f4f6',
                        color: po.status === 'Current' ? '#03543f' : '#374151'
                      }}>
                        {po.status}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #718096)', marginBottom: 'var(--spacing-sm)' }}>
                    Map PO: <strong style={{ color: 'var(--color-text-secondary, #4a5568)' }}>{po.mapPo || 'N/A'}</strong>
                    {po.customer && <span> • Customer: <strong style={{ color: 'var(--color-text-secondary, #4a5568)' }}>{po.customer}</strong></span>}
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: 'var(--spacing-md, 12px)',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-secondary, #4a5568)',
                    padding: 'var(--spacing-sm) 0',
                    borderTop: '1px solid var(--color-border-subtle, #edf2f7)',
                    borderBottom: '1px solid var(--color-border-subtle, #edf2f7)',
                    marginBottom: 'var(--spacing-md)'
                  }}>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Configs: </span>
                      <strong>{configsCount}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)' }}>Total Qty: </span>
                      <strong>{totalQty}</strong>
                    </div>
                    {po.qcTestMode && (
                      <div>
                        <span style={{ color: 'var(--color-text-muted)' }}>Mode: </span>
                        <strong>{po.qcTestMode}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(po.selectedOperations || ['QC Test', 'Packing', 'AQL Checker']).map((op, i) => (
                      <span key={i} style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: op === operationName ? 'var(--color-primary, #3182ce)' : '#edf2f7',
                        color: op === operationName ? '#ffffff' : '#4a5568',
                        fontWeight: op === operationName ? 600 : 400
                      }}>
                        {op}
                      </span>
                    ))}
                  </div>

                  <button
                    className={isSelected ? 'btn btn-success' : 'btn btn-primary'}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: 'var(--radius-md, 6px)'
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
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 'var(--spacing-md)'
    }}>
      <div style={{
        backgroundColor: 'var(--color-surface, #ffffff)',
        borderRadius: 'var(--radius-xl, 16px)',
        width: '100%',
        maxWidth: '750px',
        maxHeight: '85vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted, #a0aec0)',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f7fafc'; e.currentTarget.style.color = '#2d3748'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#a0aec0'; }}
          >
            <X size={20} />
          </button>
        )}
        {content}
      </div>
    </div>
  );
};
