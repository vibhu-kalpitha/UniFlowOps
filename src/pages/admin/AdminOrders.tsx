import React from 'react';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const AdminOrders: React.FC = () => {
  const { productionOrders } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Factory Production Orders</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {productionOrders.map(po => {
          const totalQty = po.salesOrders.reduce((sum, s) => sum + s.quantity, 0);
          const packedQty = po.salesOrders.reduce((sum, s) => sum + s.progress.packed, 0);

          return (
            <div key={po.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{po.id}</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Map PO: {po.mapPo}</span>
                </div>
                <StatusPill label={po.status} variant={po.status === 'Current' ? 'teal' : 'muted'} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <span>Brand: {po.customer}</span>
                <span>Supervisor: {po.supervisorId}</span>
              </div>

              <div style={{ marginTop: '10px' }}>
                <ProgressBar current={packedQty} total={totalQty} />
              </div>

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Sales Orders ({po.salesOrders.length})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  {po.salesOrders.map(so => (
                    <div key={so.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{so.id}: {so.product} ({so.lineId})</span>
                      <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{so.progress.packed} / {so.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
