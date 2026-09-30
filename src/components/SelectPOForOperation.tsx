import React, { useEffect, useState } from 'react';
import { ProductionOrder, OperationType } from '../types';
import { apiFetch } from '../services/api';
import { Package, Layers, Calendar, CheckCircle2, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import '../styles/tokens.css';

interface SelectPOForOperationProps {
  operationName: OperationType;
  onSelectPo: (po: ProductionOrder) => void;
  selectedPoId?: string;
}

export const SelectPOForOperation: React.FC<SelectPOForOperationProps> = ({
  operationName,
  onSelectPo,
  selectedPoId
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
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: 'var(--spacing-xl)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        gap: 'var(--spacing-md)'
      }}>
        <RefreshCw className="spin" size={32} style={{ color: 'var(--color-primary)' }} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Loading your assigned Production Orders...
        </p>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (pos.length === 0) {
    return (
      <div style={{
        padding: 'var(--spacing-2xl) var(--spacing-xl)',
        maxWidth: '550px',
        margin: '2rem auto',
        textAlign: 'center',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        <Package size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' }} />
        <h3 style={{ margin: '0 0 var(--spacing-sm) 0', color: 'var(--color-text-primary)' }}>
          No Active Assigned Production Orders
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: 'var(--spacing-lg)' }}>
          You currently have no Production Orders assigned to you for <strong>{operationName}</strong>.
          <br />
          Please ask your Supervisor to assign you to a Shift or Production Order in <strong>Shift Management</strong>.
        </p>
        <button
          onClick={fetchAssignedPOs}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={16} /> Refresh Assignments
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--spacing-lg) var(--spacing-md)' }}>
      <div style={{ marginBottom: 'var(--spacing-lg)', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Select Production Order for {operationName}
        </h2>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          You have {pos.length} assigned Production Order{pos.length > 1 ? 's' : ''}. Select one to begin operating.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--spacing-md)' }}>
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
                border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-lg)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 12px rgba(49, 130, 206, 0.15)' : '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-primary-hover, #3182ce)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-xs)' }}>
                  <span style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary)'
                  }}>
                    {po.styleName || po.styleCode || 'Garment Style'} - {po.id}
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

                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-sm)' }}>
                  Map PO: <strong style={{ color: 'var(--color-text-secondary)' }}>{po.mapPo || 'N/A'}</strong>
                  {po.customer && <span> • Customer: <strong style={{ color: 'var(--color-text-secondary)' }}>{po.customer}</strong></span>}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.9rem',
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--spacing-md)',
                  fontWeight: 500
                }}>
                  <Layers size={16} style={{ color: 'var(--color-primary)' }} />
                  <span>{po.styleName || po.styleCode || 'Standard Style'}</span>
                  {po.customer && (
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({po.customer})</span>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
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
                    borderRadius: 'var(--radius-md)'
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
    </div>
  );
};
