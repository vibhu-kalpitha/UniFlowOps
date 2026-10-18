import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductConfiguration, ShiftAssignment, ProductConfigTypeMaster, PoBoxConfiguration } from '../../types';
import { apiFetch } from '../../services/api';
import { ManageProductConfigTypesModal } from '../../components/ManageProductConfigTypesModal';
import { Plus, Trash2, ArrowRight, ArrowLeft, CheckSquare, Square, Layers, Settings, Package } from 'lucide-react';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
}

export const CreatePOSalesOrders: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [draftPoGeneral, setDraftPoGeneral] = useState<any>(null);
  const [styleDetails, setStyleDetails] = useState<StyleItem | null>(null);

  // Dynamic Master Configuration Types from Database
  const [masterConfigTypes, setMasterConfigTypes] = useState<ProductConfigTypeMaster[]>([]);
  const [loadingMasterTypes, setLoadingMasterTypes] = useState<boolean>(true);
  const [showManageModal, setShowManageModal] = useState<boolean>(false);

  // Selected Master Type IDs & Selected Sizes per Type ID
  const [enabledTypeIds, setEnabledTypeIds] = useState<string[]>([]);
  const [selectedSizesMap, setSelectedSizesMap] = useState<Record<string, string[]>>({});

  // Dynamic Product Configurations List
  const [configs, setConfigs] = useState<ProductConfiguration[]>([]);

  // Dynamic Box Configurations List
  const [boxConfigs, setBoxConfigs] = useState<PoBoxConfiguration[]>([
    { prefix: 'BX', size: 'SS', capacity: 12 },
    { prefix: 'BX', size: 'M', capacity: 12 }
  ]);

  // Optional No-Prefix Mode Flags & Values
  const [allowNoProductPrefix, setAllowNoProductPrefix] = useState<boolean>(false);
  const [allowNoBoxPrefix, setAllowNoBoxPrefix] = useState<boolean>(false);
  const [freeSerialQuantity, setFreeSerialQuantity] = useState<number | ''>(1000);
  const [freeBoxCapacity, setFreeBoxCapacity] = useState<number | ''>(12);



  const fetchMasterConfigTypes = async () => {
    setLoadingMasterTypes(true);
    try {
      const data = await apiFetch<ProductConfigTypeMaster[]>('/api/product-config-types');
      if (Array.isArray(data)) {
        setMasterConfigTypes(data);

        // Check if existing configs exist in sessionStorage
        const existingConfigsData = sessionStorage.getItem('uniflow_draft_po_configs');
        let parsedConfigs: ProductConfiguration[] = [];
        if (existingConfigsData) {
          try {
            parsedConfigs = JSON.parse(existingConfigsData);
          } catch (e) {}
        }

        if (Array.isArray(parsedConfigs) && parsedConfigs.length > 0) {
          const matchedTypeIds: string[] = [];
          const matchedSizes: Record<string, string[]> = {};

          parsedConfigs.forEach(c => {
            const masterType = data.find(t =>
              t.name.trim().toLowerCase() === (c.productType || '').trim().toLowerCase() ||
              (t.prefix && c.configCode.toUpperCase().startsWith(t.prefix.toUpperCase()))
            );
            if (masterType) {
              if (!matchedTypeIds.includes(masterType.id)) {
                matchedTypeIds.push(masterType.id);
              }
              if (c.size) {
                if (!matchedSizes[masterType.id]) matchedSizes[masterType.id] = [];
                if (!matchedSizes[masterType.id].includes(c.size)) {
                  matchedSizes[masterType.id].push(c.size);
                }
              }
            }
          });

          if (matchedTypeIds.length > 0) {
            setEnabledTypeIds(matchedTypeIds);
            setSelectedSizesMap(matchedSizes);
          } else if (enabledTypeIds.length === 0 && data.length > 0) {
            setEnabledTypeIds(data.map(t => t.id));
          }
        } else if (enabledTypeIds.length === 0 && data.length > 0) {
          const firstIds = data.map(t => t.id);
          setEnabledTypeIds(firstIds);

          const initialSizes: Record<string, string[]> = {};
          data.forEach(t => {
            if (t.usesSizes && t.sizes.length > 0) {
              // Enable first 2 sizes by default for convenience
              initialSizes[t.id] = t.sizes.slice(0, 2).map(s => s.sizeCode);
            }
          });
          setSelectedSizesMap(initialSizes);
        }
      } else {
        setMasterConfigTypes([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch product configuration types:', err);
    } finally {
      setLoadingMasterTypes(false);
    }
  };

  // Load General Draft, Style info, and Master Types on mount
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
        }
      } catch (e) {
        // Fallback
      }
    }

    const existingBoxConfigsData = sessionStorage.getItem('uniflow_draft_po_box_configs');
    if (existingBoxConfigsData) {
      try {
        const parsedBoxConfigs = JSON.parse(existingBoxConfigsData);
        if (Array.isArray(parsedBoxConfigs) && parsedBoxConfigs.length > 0) {
          setBoxConfigs(parsedBoxConfigs);
        }
      } catch (e) {}
    }

    const savedNoProd = sessionStorage.getItem('uniflow_draft_po_allow_no_product_prefix');
    if (savedNoProd !== null) {
      setAllowNoProductPrefix(savedNoProd === 'true');
    }

    const savedNoBox = sessionStorage.getItem('uniflow_draft_po_allow_no_box_prefix');
    if (savedNoBox !== null) {
      setAllowNoBoxPrefix(savedNoBox === 'true');
    }

    const savedFreeQty = sessionStorage.getItem('uniflow_draft_po_free_serial_qty');
    if (savedFreeQty !== null && savedFreeQty !== '') {
      setFreeSerialQuantity(Number(savedFreeQty) || 1000);
    }

    const savedFreeBoxCap = sessionStorage.getItem('uniflow_draft_po_free_box_cap');
    if (savedFreeBoxCap !== null && savedFreeBoxCap !== '') {
      setFreeBoxCapacity(Number(savedFreeBoxCap) || 12);
    }

    fetchMasterConfigTypes();
  }, []);

  const styleCode = styleDetails?.code || draftPoGeneral?.styleCode || 'STYLE';

  // Synchronize PO Configs dynamically based on selected master types & sizes
  useEffect(() => {
    if (masterConfigTypes.length === 0) return;

    setConfigs(prev => {
      const updated: ProductConfiguration[] = [];

      masterConfigTypes.forEach(t => {
        const isEnabled = enabledTypeIds.includes(t.id);
        if (!isEnabled) return;

        const prefix = t.prefix ? t.prefix.trim().toUpperCase() : '';

        if (t.usesSizes) {
          const sizesForType = selectedSizesMap[t.id] || [];
          sizesForType.forEach(sz => {
            const code = prefix ? `${prefix}${sz}` : `${t.name}-${sz}`;
            const existing = prev.find(c => c.configCode === code || (c.productType === t.name && c.size === sz));
            const defaultQty = existing?.quantity && existing.quantity > 0 ? existing.quantity : 500;

            updated.push({
              id: existing?.id,
              configCode: code,
              productType: t.name,
              size: sz,
              productQrPrefix: existing?.productQrPrefix || (prefix ? `${prefix}${sz}0926` : `${t.name}${sz}0926`),
              productSerialStart: 1,
              productSerialEnd: defaultQty,
              quantity: defaultQty
            });
          });
        } else {
          // Uses Sizes = NO
          const code = prefix || t.name;
          const existing = prev.find(c => c.configCode === code || c.productType === t.name);
          const defaultQty = existing?.quantity && existing.quantity > 0 ? existing.quantity : 1000;

          updated.push({
            id: existing?.id,
            configCode: existing?.configCode || code,
            productType: t.name,
            productQrPrefix: existing?.productQrPrefix || prefix || t.name,
            productSerialStart: 1,
            productSerialEnd: defaultQty,
            quantity: defaultQty
          });
        }
      });

      // Preserve custom and copied configurations added previously
      prev.forEach(c => {
        if (!updated.some(u => u.configCode === c.configCode)) {
          updated.push(c);
        }
      });

      return updated;
    });
  }, [masterConfigTypes, enabledTypeIds, selectedSizesMap, styleCode]);

  const toggleTypeEnabled = (typeId: string) => {
    setEnabledTypeIds(prev =>
      prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
    );
  };

  const toggleSizeSelected = (typeId: string, sizeCode: string) => {
    setSelectedSizesMap(prev => {
      const currentSizes = prev[typeId] || [];
      const updated = currentSizes.includes(sizeCode)
        ? currentSizes.filter(s => s !== sizeCode)
        : [...currentSizes, sizeCode];
      return { ...prev, [typeId]: updated };
    });
  };

  const updateConfig = (index: number, field: keyof ProductConfiguration, val: any) => {
    const updated = [...configs];
    const cfg = { ...updated[index] };

    if (field === 'quantity') {
      if (val === '' || val === null || val === undefined) {
        (cfg as any).quantity = '';
        cfg.productSerialStart = 1;
        cfg.productSerialEnd = 0;
      } else {
        const cleanVal = String(val).replace(/[^0-9]/g, '');
        (cfg as any).quantity = cleanVal;
        const q = parseInt(cleanVal, 10);
        if (!isNaN(q)) {
          cfg.productSerialStart = 1;
          cfg.productSerialEnd = q;
        }
      }
    } else {
      (cfg as any)[field] = val;
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

  const totalQuantity = (configs.length > 0
    ? configs.reduce((sum, c) => {
        const q = typeof c.quantity === 'number' ? c.quantity : (parseInt(String(c.quantity), 10) || 0);
        return sum + q;
      }, 0)
    : (allowNoProductPrefix ? (Number(freeSerialQuantity) || 0) : 0)) || 0;

  const updateBoxConfig = (index: number, field: keyof PoBoxConfiguration, val: any) => {
    const updated = [...boxConfigs];
    const item = { ...updated[index] };

    if (field === 'capacity') {
      if (val === '' || val === null || val === undefined) {
        (item as any).capacity = '';
      } else {
        const cleanVal = String(val).replace(/[^0-9]/g, '');
        (item as any).capacity = cleanVal;
      }
    } else {
      (item as any)[field] = val;
    }

    updated[index] = item;
    setBoxConfigs(updated);
  };

  const addBoxConfig = () => {
    setBoxConfigs([...boxConfigs, { prefix: 'BX', size: 'L', capacity: 12 }]);
  };

  const removeBoxConfig = (index: number) => {
    setBoxConfigs(boxConfigs.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    if (configs.length === 0 && !allowNoProductPrefix) {
      showToast('Please select or create at least one product configuration or enable Free Serial Numbers.', 'warning');
      return;
    }

    let normalizedConfigs: ProductConfiguration[] = configs.map(c => {
      const qNum = typeof c.quantity === 'number' ? c.quantity : (parseInt(String(c.quantity || '0'), 10) || 0);
      return {
        ...c,
        quantity: qNum,
        productSerialStart: 1,
        productSerialEnd: qNum
      };
    });

    if (allowNoProductPrefix) {
      const freeQty = Number(freeSerialQuantity) || draftPoGeneral?.totalQuantity || draftPoGeneral?.quantity || 1000;
      if (normalizedConfigs.length === 0) {
        normalizedConfigs = [{
          configCode: 'FREE_SERIAL',
          productType: 'FREE_SERIAL',
          productQrPrefix: '',
          productSerialStart: 1,
          productSerialEnd: freeQty,
          quantity: freeQty
        }];
      } else {
        const freeIdx = normalizedConfigs.findIndex(c => c.configCode === 'FREE_SERIAL');
        if (freeIdx >= 0) {
          normalizedConfigs[freeIdx].quantity = freeQty;
          normalizedConfigs[freeIdx].productSerialEnd = freeQty;
        }
      }
    }

    for (const cfg of normalizedConfigs) {
      if (!cfg.configCode.trim()) {
        showToast('Configuration code cannot be empty.', 'warning');
        return;
      }
      if (!cfg.quantity || cfg.quantity <= 0) {
        showToast(`Valid quantity required for ${cfg.configCode}`, 'error');
        return;
      }
    }

    if (boxConfigs.length === 0 && !allowNoBoxPrefix) {
      showToast('Please add at least one box configuration or enable Free Box Identifiers.', 'warning');
      return;
    }

    let normalizedBoxConfigs: PoBoxConfiguration[] = boxConfigs.map(b => {
      const capNum = typeof b.capacity === 'number' ? b.capacity : (parseInt(String(b.capacity || '0'), 10) || 0);
      return {
        ...b,
        capacity: capNum
      };
    });

    if (allowNoBoxPrefix) {
      const boxCap = Number(freeBoxCapacity) || 12;
      if (normalizedBoxConfigs.length === 0) {
        normalizedBoxConfigs = [{
          prefix: '',
          size: 'STANDARD',
          capacity: boxCap
        }];
      } else if (normalizedBoxConfigs.length === 1 && !normalizedBoxConfigs[0].prefix) {
        normalizedBoxConfigs[0].capacity = boxCap;
      }
    }

    for (const bCfg of normalizedBoxConfigs) {
      if (!allowNoBoxPrefix && !bCfg.prefix.trim()) {
        showToast('Box prefix cannot be empty.', 'warning');
        return;
      }
      if (!bCfg.size.trim()) {
        showToast('Box size cannot be empty.', 'warning');
        return;
      }
      if (!bCfg.capacity || bCfg.capacity <= 0) {
        showToast('Box capacity must be a positive number.', 'warning');
        return;
      }
    }

    sessionStorage.setItem('uniflow_draft_po_free_serial_qty', String(freeSerialQuantity));
    sessionStorage.setItem('uniflow_draft_po_free_box_cap', String(freeBoxCapacity));
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(allowNoProductPrefix));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(allowNoBoxPrefix));
    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(normalizedConfigs));
    sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(normalizedBoxConfigs));
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Master Product Configurations</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Database-driven configuration types and size definitions.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowManageModal(true)}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Settings size={14} /> Manage Master Types & Sizes
          </button>
        </div>

        {/* Optional No-Prefix Mode for Product Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '12px',
              border: `2px solid ${allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--border-color)'}`,
              backgroundColor: allowNoProductPrefix ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => {
              const nextVal = !allowNoProductPrefix;
              setAllowNoProductPrefix(nextVal);
              sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(nextVal));
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {allowNoProductPrefix ? (
                <CheckSquare size={22} color="var(--primary-teal)" />
              ) : (
                <Square size={22} color="var(--text-muted)" />
              )}
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--text-primary)' }}>
                  No Prefix / Free Serial Numbers
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Optional: Allow product serial numbers without requiring them to match a configured product prefix or serial pattern.
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: allowNoProductPrefix ? 'var(--primary-teal)' : 'var(--bg-surface-2)',
                color: allowNoProductPrefix ? '#071B23' : 'var(--text-muted)',
                textTransform: 'uppercase'
              }}
            >
              {allowNoProductPrefix ? 'Option Enabled' : 'Disabled'}
            </span>
          </div>

          {allowNoProductPrefix && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(20, 184, 166, 0.08)',
              border: '1.5px solid rgba(20, 184, 166, 0.35)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: '1 1 240px' }}>
                <label style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                  Planned Total Order Quantity (Free Serial Numbers)
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Enter total planned pieces for this PO when serial numbers do not use fixed prefix codes.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="1"
                  className="input-field no-spinner"
                  style={{ width: '130px', fontWeight: 800, fontSize: '15px', textAlign: 'right' }}
                  value={freeSerialQuantity}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 0);
                    setFreeSerialQuantity(val);
                    sessionStorage.setItem('uniflow_draft_po_free_serial_qty', String(val));
                  }}
                  placeholder="e.g. 1000"
                />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>Pcs</span>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Types Selection */}
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Available Configuration Types ({masterConfigTypes.length})
          </span>

          {loadingMasterTypes ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Loading configuration master data...
            </div>
          ) : masterConfigTypes.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', backgroundColor: 'var(--bg-surface-1)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                No configuration types have been created in database master data yet.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowManageModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <Plus size={16} /> Add Configuration Type
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {masterConfigTypes.map(t => {
                const isEnabled = enabledTypeIds.includes(t.id);
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: `2px solid ${isEnabled ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                      backgroundColor: isEnabled ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-1)',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: '14px',
                      color: isEnabled ? 'var(--primary-teal)' : 'var(--text-primary)',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => toggleTypeEnabled(t.id)}
                  >
                    {isEnabled ? <CheckSquare size={18} color="var(--primary-teal)" /> : <Square size={18} color="var(--text-muted)" />}
                    {t.name} {t.prefix ? `(${t.prefix})` : ''}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dynamic Sizes Selector for Enabled Master Types */}
        {masterConfigTypes.filter(t => enabledTypeIds.includes(t.id) && t.usesSizes).map(t => {
          const selectedSizes = selectedSizesMap[t.id] || [];
          return (
            <div key={t.id} style={{ paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', textTransform: 'uppercase' }}>
                  {t.name} {t.prefix ? `(${t.prefix})` : ''} Sizes
                </span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--primary-teal)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setShowManageModal(true)}
                >
                  + Add Size to Master Data
                </button>
              </div>

              {t.sizes.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                  No sizes defined for {t.name} yet. Click "Manage Master Types & Sizes" to add sizes.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {t.sizes.map(s => {
                    const isSelected = selectedSizes.includes(s.sizeCode);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSizeSelected(t.id, s.sizeCode)}
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
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />} {s.sizeCode}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Configured Product Configurations List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800 }}>
            Selected PO Product Configurations ({configs.length})
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
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
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input-field no-spinner"
                  value={cfg.quantity !== undefined && cfg.quantity !== null ? cfg.quantity : ''}
                  onChange={e => updateConfig(idx, 'quantity', e.target.value)}
                  placeholder="e.g. 500, 2500, 10000"
                  style={{ fontWeight: 800, color: 'var(--primary-teal)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BOX CONFIGURATION SECTION */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-2)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={20} color="var(--primary-teal)" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>BOX CONFIGURATION</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Define PO-scoped Box Prefixes, Sizes, and Packing Capacities.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={addBoxConfig}
            style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add Box Configuration
          </button>
        </div>

        {/* Optional No-Box-Prefix Mode */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '12px',
              border: `2px solid ${allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--border-color)'}`,
              backgroundColor: allowNoBoxPrefix ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-1)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={() => {
              const nextVal = !allowNoBoxPrefix;
              setAllowNoBoxPrefix(nextVal);
              sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(nextVal));
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {allowNoBoxPrefix ? (
                <CheckSquare size={22} color="var(--primary-teal)" />
              ) : (
                <Square size={22} color="var(--text-muted)" />
              )}
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--text-primary)' }}>
                  No Box Prefix / Free Box Identifiers
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Optional: Allow box identifiers without requiring them to match a configured box prefix. Capacity limits and duplicate prevention remain enforced.
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: allowNoBoxPrefix ? 'var(--primary-teal)' : 'var(--bg-surface-2)',
                color: allowNoBoxPrefix ? '#071B23' : 'var(--text-muted)',
                textTransform: 'uppercase'
              }}
            >
              {allowNoBoxPrefix ? 'Option Enabled' : 'Disabled'}
            </span>
          </div>

          {allowNoBoxPrefix && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(20, 184, 166, 0.08)',
              border: '1.5px solid rgba(20, 184, 166, 0.35)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ flex: '1 1 240px' }}>
                <label style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                  Default Box Capacity (Free Box Identifiers)
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Specify how many garments fit into each box when using free box identifiers without fixed prefixes.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="1"
                  className="input-field no-spinner"
                  style={{ width: '130px', fontWeight: 800, fontSize: '15px', textAlign: 'right' }}
                  value={freeBoxCapacity}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 0);
                    setFreeBoxCapacity(val);
                    sessionStorage.setItem('uniflow_draft_po_free_box_cap', String(val));
                  }}
                  placeholder="e.g. 12"
                />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>Items / Box</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {boxConfigs.map((bCfg, bIdx) => (
            <div
              key={bIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '12px',
                alignItems: 'center',
                backgroundColor: 'var(--bg-surface-1)',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)'
              }}
            >
              <div>
                <label style={styles.label}>PREFIX</label>
                <input
                  type="text"
                  className="input-field"
                  value={bCfg.prefix}
                  onChange={(e) => updateBoxConfig(bIdx, 'prefix', e.target.value.toUpperCase())}
                  placeholder="e.g. BX"
                  style={{ textTransform: 'uppercase', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={styles.label}>SIZE</label>
                <input
                  type="text"
                  className="input-field"
                  value={bCfg.size}
                  onChange={(e) => updateBoxConfig(bIdx, 'size', e.target.value.toUpperCase())}
                  placeholder="e.g. SS, M, L"
                  style={{ textTransform: 'uppercase', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={styles.label}>CAPACITY (ITEMS)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input-field no-spinner"
                  value={bCfg.capacity !== undefined && bCfg.capacity !== null ? bCfg.capacity : ''}
                  onChange={(e) => updateBoxConfig(bIdx, 'capacity', e.target.value)}
                  placeholder="e.g. 12, 24, 48"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', paddingTop: '18px' }}>
                {boxConfigs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeBoxConfig(bIdx)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: '6px' }}
                    title="Remove box config"
                  >
                    <Trash2 size={18} />
                  </button>
                ) : (
                  <div style={{ width: '30px' }} />
                )}
              </div>
            </div>
          ))}
        </div>
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

      {/* Manage Master Types & Sizes Modal */}
      <ManageProductConfigTypesModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        onUpdated={fetchMasterConfigTypes}
      />
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
