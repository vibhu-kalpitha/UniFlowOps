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

      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {productionOrders.map(po => {
          const sos = po.salesOrders || [];
          const configs = po.productConfigurations || [];
          const totalQty = configs.length > 0 
            ? configs.reduce((sum, c) => sum + (c.quantity || 0), 0)
            : sos.reduce((sum, s) => sum + s.quantity, 0);
          const packedQty = sos.reduce((sum, s) => sum + (s.progress?.packed || 0), 0);

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
                <span>Style: {po.styleName || po.customer}</span>
                <span>Supervisor: {po.supervisorId}</span>
              </div>

              <div style={{ marginTop: '10px' }}>
                <ProgressBar current={packedQty} total={totalQty} />
              </div>

              {configs.length > 0 ? (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Product Configurations ({configs.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    {configs.map(cfg => (
                      <div key={cfg.id || cfg.configCode} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{cfg.configCode} {cfg.size ? `(${cfg.size})` : cfg.productType ? `(${cfg.productType})` : ''}</span>
                        <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{cfg.quantity} pcs</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : sos.length > 0 ? (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Sales Orders ({sos.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    {sos.map(so => (
                      <div key={so.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{so.id}: {so.product} ({so.lineId})</span>
                        <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{so.progress.packed} / {so.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
