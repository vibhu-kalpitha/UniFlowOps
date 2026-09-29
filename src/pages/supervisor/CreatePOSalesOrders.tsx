import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductConfiguration, ShiftAssignment } from '../../types';
import { apiFetch } from '../../services/api';
import { Plus, Trash2, ArrowRight, ArrowLeft, CheckSquare, Square, Layers } from 'lucide-react';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
}

const BIOTAB_LEG_SIZES = ['SS', 'SM', 'SL', 'TM', 'TL', 'TXL'];
const BIOTAB_CORE_SIZES = ['SS', 'SM', 'SL', 'TS', 'TM', 'TL'];

export const CreatePOSalesOrders: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [draftPoGeneral, setDraftPoGeneral] = useState<any>(null);
  const [styleDetails, setStyleDetails] = useState<StyleItem | null>(null);

  // BioTab 2 Selection State
  const [selectedLegSizes, setSelectedLegSizes] = useState<string[]>(['SS', 'SM', 'TM']);
  const [selectedCoreSizes, setSelectedCoreSizes] = useState<string[]>(['SS', 'TS', 'TL']);

  // Dynamic Product Configurations List
  const [configs, setConfigs] = useState<ProductConfiguration[]>([]);

  // Shift Allocation State
  const [shifts, setShifts] = useState<ShiftAssignment[]>([
    {
      id: `shf-${Date.now()}-1`,
      workerId: 'usr-001',
      workerName: 'Chamika Silva',
      startTime: '14:00',
      endTime: '18:00',
      date: new Date().toISOString().split('T')[0],
      enabledOperations: ['QC Test', 'Packing']
    }
  ]);

  // Load General Draft and Style info on mount
  useEffect(() => {
    const genData = sessionStorage.getItem('uniflow_draft_po_general');
    if (genData) {
      const parsed = JSON.parse(genData);
      setDraftPoGeneral(parsed);

      if (parsed.styleId) {
        apiFetch<StyleItem[]>('/api/styles')
          .then(styles => {
            const found = styles.find(s => s.id === parsed.styleId);
            if (found) setStyleDetails(found);
          })
          .catch(() => {});
      }
    }
  }, []);

  const isBioTab2 = styleDetails?.name?.toLowerCase().includes('biotab') || styleDetails?.code?.toLowerCase().includes('biotab');
  const isBeacon = styleDetails?.name?.toLowerCase().includes('beacon') || styleDetails?.code?.toLowerCase().includes('beacon');

  // BioTab 2 Generator
  useEffect(() => {
    if (isBioTab2) {
      const newConfigs: ProductConfiguration[] = [];

      // Generate LEG configs (PNFL)
      selectedLegSizes.forEach((sz, idx) => {
        const code = `PNFL${sz}`;
        const prefix = `PNFL${sz}0926`;
        const start = 1 + idx * 500;
        const end = start + 499;
        newConfigs.push({
          configCode: code,
          productType: 'LEG',
          size: sz,
          productQrPrefix: prefix,
          productSerialStart: start,
          productSerialEnd: end,
          quantity: end - start + 1
        });
      });

      // Generate CORE configs (PNCR)
      selectedCoreSizes.forEach((sz, idx) => {
        const code = `PNCR${sz}`;
        const prefix = `PNCR${sz}0926`;
        const start = 1 + (selectedLegSizes.length + idx) * 500;
        const end = start + 499;
        newConfigs.push({
          configCode: code,
          productType: 'CORE',
          size: sz,
          productQrPrefix: prefix,
          productSerialStart: start,
          productSerialEnd: end,
          quantity: end - start + 1
        });
      });

      setConfigs(newConfigs);
    } else if (isBeacon && configs.length === 0) {
      // Beacon default config
      setConfigs([
        {
          configCode: '009735535',
          productType: 'BEACON',
          productQrPrefix: '009735535',
          productSerialStart: 1,
          productSerialEnd: 1000,
          quantity: 1000
        }
      ]);
    } else if (configs.length === 0) {
      // General style default config
      setConfigs([
        {
          configCode: styleDetails?.code || 'PROD-CONFIG-1',
          productType: 'STANDARD',
          productQrPrefix: `${styleDetails?.code || 'PNFL'}0926`,
          productSerialStart: 1,
          productSerialEnd: 500,
          quantity: 500
        }
      ]);
    }
  }, [isBioTab2, isBeacon, selectedLegSizes, selectedCoreSizes, styleDetails]);

  const toggleLegSize = (sz: string) => {
    if (selectedLegSizes.includes(sz)) {
      setSelectedLegSizes(selectedLegSizes.filter(s => s !== sz));
    } else {
      setSelectedLegSizes([...selectedLegSizes, sz]);
    }
  };

  const toggleCoreSize = (sz: string) => {
    if (selectedCoreSizes.includes(sz)) {
      setSelectedCoreSizes(selectedCoreSizes.filter(s => s !== sz));
    } else {
      setSelectedCoreSizes([...selectedCoreSizes, sz]);
    }
  };

  const updateConfig = (index: number, field: keyof ProductConfiguration, val: any) => {
    const updated = [...configs];
    const cfg = { ...updated[index], [field]: val };

    if (field === 'productSerialStart' || field === 'productSerialEnd') {
      const s = Number(field === 'productSerialStart' ? val : cfg.productSerialStart);
      const e = Number(field === 'productSerialEnd' ? val : cfg.productSerialEnd);
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        cfg.quantity = e - s + 1;
      }
    }
    updated[index] = cfg;
    setConfigs(updated);
  };

  const addManualConfig = () => {
    const nextIdx = configs.length + 1;
    setConfigs([
      ...configs,
      {
        configCode: `CONFIG-${nextIdx}`,
        productType: 'CUSTOM',
        productQrPrefix: `PNFLSS09${nextIdx}`,
        productSerialStart: 1,
        productSerialEnd: 500,
        quantity: 500
      }
    ]);
  };

  const removeConfig = (index: number) => {
    setConfigs(configs.filter((_, i) => i !== index));
  };

  const totalQuantity = configs.reduce((sum, c) => sum + (c.quantity || 0), 0);

  const handleNext = () => {
    if (configs.length === 0) {
      showToast('Please add at least one product configuration.', 'warning');
      return;
    }

    for (const cfg of configs) {
      if (!cfg.productQrPrefix.trim()) {
        showToast(`QR Prefix required for config ${cfg.configCode}`, 'warning');
        return;
      }
      if (cfg.productSerialStart > cfg.productSerialEnd) {
        showToast(`Serial Start cannot be greater than Serial End for ${cfg.configCode}`, 'error');
        return;
      }
    }

    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(configs));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(shifts));
    navigate('/supervisor/production-orders/new/review');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={styles.wizardBar}>
        <div style={styles.stepCompleted}>
          <span style={styles.stepNumCompleted}>✓</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>3</span>
          <span>Product Configurations</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>4</span>
          <span>Review</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Product Configurations</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Step 3 of 4: Configure product & size specifications and serial QR ranges for PO {draftPoGeneral?.id || ''}.
          </p>
        </div>
        <div style={styles.totalBadge}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>TOTAL PO QTY</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)' }}>{totalQuantity}</span>
        </div>
      </div>

      {/* BioTab 2 Specific Selection UI */}
      {isBioTab2 && (
        <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--primary-teal)" />
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>BioTab 2 Style — Size Selection</h3>
          </div>

          {/* LEG (PNFL) Sizes */}
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', textTransform: 'uppercase' }}>
              LEG (Prefix: PNFL)
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {BIOTAB_LEG_SIZES.map(sz => {
                const isSelected = selectedLegSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleLegSize(sz)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: `2px solid ${isSelected ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? 'rgba(22, 184, 174, 0.15)' : 'var(--bg-surface-1)',
                      color: isSelected ? 'var(--primary-teal)' : 'var(--text-primary)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />} PNFL{sz}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CORE (PNCR) Sizes */}
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-purple)', textTransform: 'uppercase' }}>
              CORE (Prefix: PNCR)
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {BIOTAB_CORE_SIZES.map(sz => {
                const isSelected = selectedCoreSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => toggleCoreSize(sz)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: `2px solid ${isSelected ? 'var(--color-purple)' : 'var(--border-color)'}`,
                      backgroundColor: isSelected ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-surface-1)',
                      color: isSelected ? 'var(--color-purple)' : 'var(--text-primary)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />} PNCR{sz}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Product Configurations List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
            Configured Product Ranges ({configs.length})
          </h3>
          {!isBioTab2 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={addManualConfig}
              style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={14} /> Add Configuration
            </button>
          )}
        </div>

        {configs.map((cfg, idx) => (
          <div key={idx} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal)', backgroundColor: 'rgba(22, 184, 174, 0.15)', padding: '4px 10px', borderRadius: '8px' }}>
                  {cfg.configCode}
                </span>
                {cfg.productType && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Type: {cfg.productType} {cfg.size ? `• Size: ${cfg.size}` : ''}
                  </span>
                )}
              </div>
              {configs.length > 1 && !isBioTab2 && (
                <button
                  type="button"
                  onClick={() => removeConfig(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div>
                <label style={styles.label}>Product QR Prefix</label>
                <input
                  type="text"
                  className="input-field"
                  value={cfg.productQrPrefix}
                  onChange={e => updateConfig(idx, 'productQrPrefix', e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Serial Start</label>
                <input
                  type="number"
                  className="input-field"
                  value={cfg.productSerialStart}
                  onChange={e => updateConfig(idx, 'productSerialStart', parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div>
                <label style={styles.label}>Serial End</label>
                <input
                  type="number"
                  className="input-field"
                  value={cfg.productSerialEnd}
                  onChange={e => updateConfig(idx, 'productSerialEnd', parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div>
                <label style={styles.label}>Auto Quantity</label>
                <input
                  type="number"
                  className="input-field"
                  value={cfg.quantity}
                  readOnly
                  style={{ backgroundColor: 'var(--bg-surface-2)', fontWeight: 800, color: 'var(--primary-teal)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/supervisor/production-orders/new/general')}
          style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={16} /> Back to General Info
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleNext}
          style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          Next: Review PO <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wizardBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '14px',
    padding: '10px 14px',
    border: '1px solid var(--border-color)'
  },
  stepCompleted: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--color-green)'
  },
  stepNumCompleted: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green)',
    color: '#071B23',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800
  },
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)'
  },
  stepNumActive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)',
    color: '#071B23',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 800
  },
  stepInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-muted)'
  },
  stepNumInactive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700
  },
  stepDivider: {
    flex: 1,
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '0 8px'
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  totalBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    backgroundColor: 'var(--bg-surface-1)',
    padding: '8px 14px',
    borderRadius: '12px',
    border: '1px solid var(--border-color)'
  }
};
