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

const GLOBAL_LEG_SIZES = ['SS', 'SM', 'SL', 'TM', 'TL', 'TXL'];
const GLOBAL_CORE_SIZES = ['SS', 'SM', 'SL', 'TS', 'TM', 'TL'];

export const CreatePOSalesOrders: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [draftPoGeneral, setDraftPoGeneral] = useState<any>(null);
  const [styleDetails, setStyleDetails] = useState<StyleItem | null>(null);

  // Global Product Configuration Type Selection
  const [enableLeg, setEnableLeg] = useState<boolean>(true);
  const [enableCore, setEnableCore] = useState<boolean>(true);
  const [enableNoSize, setEnableNoSize] = useState<boolean>(false);

  // Selected Size States
  const [selectedLegSizes, setSelectedLegSizes] = useState<string[]>(['SS', 'SM']);
  const [selectedCoreSizes, setSelectedCoreSizes] = useState<string[]>(['TS', 'TL']);

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
    const existingConfigsData = sessionStorage.getItem('uniflow_draft_po_configs');

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

    if (existingConfigsData) {
      try {
        const parsedConfigs = JSON.parse(existingConfigsData);
        if (Array.isArray(parsedConfigs) && parsedConfigs.length > 0) {
          setConfigs(parsedConfigs);
          return;
        }
      } catch (e) {
        // Fallback to generator
      }
    }
  }, []);

  const styleCode = styleDetails?.code || draftPoGeneral?.styleCode || 'PNFL';

  // Synchronize Configs based on selected types & sizes
  useEffect(() => {
    // If existing configs loaded from session storage, do not wipe on mount unless toggled
    setConfigs(prev => {
      const updated: ProductConfiguration[] = [];

      // 1. LEG (PNFL)
      if (enableLeg) {
        selectedLegSizes.forEach(sz => {
          const code = `PNFL${sz}`;
          const existing = prev.find(c => c.configCode === code);
          const defaultQty = existing?.quantity && existing.quantity > 0 ? existing.quantity : 500;
          updated.push({
            id: existing?.id,
            configCode: code,
            productType: 'LEG',
            size: sz,
            productQrPrefix: existing?.productQrPrefix || `PNFL${sz}0926`,
            productSerialStart: 1,
            productSerialEnd: defaultQty,
            quantity: defaultQty
          });
        });
      }

      // 2. CORE (PNCR)
      if (enableCore) {
        selectedCoreSizes.forEach(sz => {
          const code = `PNCR${sz}`;
          const existing = prev.find(c => c.configCode === code);
          const defaultQty = existing?.quantity && existing.quantity > 0 ? existing.quantity : 500;
          updated.push({
            id: existing?.id,
            configCode: code,
            productType: 'CORE',
            size: sz,
            productQrPrefix: existing?.productQrPrefix || `PNCR${sz}0926`,
            productSerialStart: 1,
            productSerialEnd: defaultQty,
            quantity: defaultQty
          });
        });
      }

      // 3. NO SIZE / LETTERS
      if (enableNoSize) {
        const code = '009735535';
        const existing = prev.find(c => c.configCode === code || c.productType === 'NO_SIZE');
        const defaultQty = existing?.quantity && existing.quantity > 0 ? existing.quantity : 1000;
        updated.push({
          id: existing?.id,
          configCode: existing?.configCode || code,
          productType: 'NO_SIZE',
          productQrPrefix: existing?.productQrPrefix || '009735535',
          productSerialStart: 1,
          productSerialEnd: defaultQty,
          quantity: defaultQty
        });
      }

      // Preserve custom configurations
      prev.filter(c => c.productType === 'CUSTOM' || (!['LEG', 'CORE', 'NO_SIZE'].includes(c.productType || ''))).forEach(c => {
        if (!updated.some(u => u.configCode === c.configCode)) {
          updated.push(c);
        }
      });

      return updated;
    });
  }, [enableLeg, enableCore, enableNoSize, selectedLegSizes, selectedCoreSizes, styleCode]);

  const toggleLegSize = (sz: string) => {
    setSelectedLegSizes(prev =>
      prev.includes(sz) ? prev.filter(s => s !== sz) : [...prev, sz]
    );
  };

  const toggleCoreSize = (sz: string) => {
    setSelectedCoreSizes(prev =>
      prev.includes(sz) ? prev.filter(s => s !== sz) : [...prev, sz]
    );
  };

  const updateConfig = (index: number, field: keyof ProductConfiguration, val: any) => {
    const updated = [...configs];
    const cfg = { ...updated[index], [field]: val };

    if (field === 'quantity') {
      const q = Math.max(1, parseInt(val, 10) || 0);
      cfg.quantity = q;
      cfg.productSerialStart = 1;
      cfg.productSerialEnd = q;
    }

    updated[index] = cfg;
    setConfigs(updated);
  };

  const addManualConfig = () => {
    const nextIdx = configs.length + 1;
    const newConfigCode = `CONFIG-${nextIdx}`;
    setConfigs([
      ...configs,
      {
        configCode: newConfigCode,
        productType: 'CUSTOM',
        productQrPrefix: `${styleCode}092${nextIdx}`,
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
      if (!cfg.configCode.trim()) {
        showToast('Configuration code cannot be empty.', 'warning');
        return;
      }
      if (!cfg.quantity || cfg.quantity <= 0) {
        showToast(`Valid quantity required for ${cfg.configCode}`, 'error');
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
            Step 3 of 4: Select product types and size configurations for PO {draftPoGeneral?.id || ''}.
          </p>
        </div>
        <div style={styles.totalBadge}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 700 }}>TOTAL PO QTY</span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-teal)' }}>{totalQuantity}</span>
        </div>
      </div>

      {/* Global Product Configuration Selector */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={20} color="var(--primary-teal)" />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Global Product Configurations</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Choose standard product configuration types (available to all styles) and enable required sizes.
            </p>
          </div>
        </div>

        {/* Global Types Selection */}
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Configuration Types
          </span>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {/* LEG */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: `2px solid ${enableLeg ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                backgroundColor: enableLeg ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-1)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '14px',
                color: enableLeg ? 'var(--primary-teal)' : 'var(--text-primary)'
              }}
              onClick={() => setEnableLeg(!enableLeg)}
            >
              {enableLeg ? <CheckSquare size={18} color="var(--primary-teal)" /> : <Square size={18} color="var(--text-muted)" />}
              LEG (PNFL)
            </div>

            {/* CORE */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: `2px solid ${enableCore ? 'var(--color-purple)' : 'var(--border-color)'}`,
                backgroundColor: enableCore ? 'rgba(168, 85, 247, 0.12)' : 'var(--bg-surface-1)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '14px',
                color: enableCore ? 'var(--color-purple)' : 'var(--text-primary)'
              }}
              onClick={() => setEnableCore(!enableCore)}
            >
              {enableCore ? <CheckSquare size={18} color="var(--color-purple)" /> : <Square size={18} color="var(--text-muted)" />}
              CORE (PNCR)
            </div>

            {/* NO SIZE / LETTERS */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: `2px solid ${enableNoSize ? 'var(--color-amber)' : 'var(--border-color)'}`,
                backgroundColor: enableNoSize ? 'rgba(243, 168, 51, 0.12)' : 'var(--bg-surface-1)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '14px',
                color: enableNoSize ? 'var(--color-amber)' : 'var(--text-primary)'
              }}
              onClick={() => setEnableNoSize(!enableNoSize)}
            >
              {enableNoSize ? <CheckSquare size={18} color="var(--color-amber)" /> : <Square size={18} color="var(--text-muted)" />}
              NO SIZE / LETTERS (009735535)
            </div>
          </div>
        </div>

        {/* LEG Sizes Selector */}
        {enableLeg && (
          <div style={{ paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', textTransform: 'uppercase' }}>
              LEG (PNFL) Sizes
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {GLOBAL_LEG_SIZES.map(sz => {
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
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />} {sz}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CORE Sizes Selector */}
        {enableCore && (
          <div style={{ paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-purple)', textTransform: 'uppercase' }}>
              CORE (PNCR) Sizes
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {GLOBAL_CORE_SIZES.map(sz => {
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
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />} {sz}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Configured Product Configurations List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
            Selected Product Configurations ({configs.length})
          </h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={addManualConfig}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add Custom Config
          </button>
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
              {configs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeConfig(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}
                  title="Remove configuration"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={styles.label}>Configuration Code</label>
                <input
                  type="text"
                  className="input-field"
                  value={cfg.configCode}
                  onChange={e => updateConfig(idx, 'configCode', e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Quantity (Pcs)</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={cfg.quantity}
                  onChange={e => updateConfig(idx, 'quantity', e.target.value)}
                  style={{ fontWeight: 800, color: 'var(--primary-teal)' }}
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

