import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { OperationType } from '../../types';
import { ArrowRight, CheckSquare, Square, Tag, Plus } from 'lucide-react';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
  notes?: string;
}

export const CreatePOGeneral: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [stylesList, setStylesList] = useState<StyleItem[]>([]);
  const [loadingStyles, setLoadingStyles] = useState<boolean>(true);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');

  const [poId, setPoId] = useState(() => `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [mapPo, setMapPo] = useState(() => `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`);

  const [boxRangeStart, setBoxRangeStart] = useState('BX-000100');
  const [boxRangeEnd, setBoxRangeEnd] = useState('BX-000500');
  const [startDate, setStartDate] = useState('2026-09-15');
  const [dueDate, setDueDate] = useState('2026-10-10');
  const [supervisor, setSupervisor] = useState('Nimal Perera');
  const [remarks, setRemarks] = useState('Export batch for Q4 delivery');

  const [selectedOps, setSelectedOps] = useState<OperationType[]>([
    'QC Test',
    'Packing',
    'AQL Checker',
    'Box Transfer'
  ]);

  useEffect(() => {
    apiFetch<StyleItem[]>('/api/styles')
      .then(res => {
        setStylesList(res);
        const savedId = sessionStorage.getItem('uniflow_draft_po_style_id');
        if (savedId && res.some(s => s.id === savedId)) {
          setSelectedStyleId(savedId);
        }
      })
      .catch(err => {
        showToast('Failed to load styles from database', 'error');
      })
      .finally(() => {
        setLoadingStyles(false);
      });
  }, []);

  const toggleOp = (op: OperationType) => {
    if (selectedOps.includes(op)) {
      setSelectedOps(selectedOps.filter(o => o !== op));
    } else {
      setSelectedOps([...selectedOps, op]);
    }
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStyleId) {
      showToast('Please select an existing style or create one first.', 'warning');
      return;
    }
    if (!poId.trim() || !mapPo.trim()) {
      showToast('Please fill required PO fields', 'warning');
      return;
    }
    if (!boxRangeStart.trim() || !boxRangeEnd.trim()) {
      showToast('Please specify box serial number / barcode range', 'warning');
      return;
    }
    if (selectedOps.length === 0) {
      showToast('Select at least one required operation', 'warning');
      return;
    }

    const selectedStyleObj = stylesList.find(s => s.id === selectedStyleId);

    // Save draft PO to session/state
    const draftPo = {
      id: poId,
      mapPo,
      customer: selectedStyleObj?.customer || 'Nike',
      styleId: selectedStyleId,
      boxRangeStart,
      boxRangeEnd,
      startDate,
      dueDate,
      supervisorId: supervisor,
      remarks,
      selectedOperations: selectedOps
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleId);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftPo));
    navigate('/supervisor/production-orders/new/sales-orders');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={styles.wizardBar}>
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>2</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Sales Orders</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>4</span>
          <span>Review</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Create Production Order</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 2 of 4: Select Garment Style, Define Production Order Header & Box Serial Range.
        </p>
      </div>

      <form onSubmit={handleNext} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="grid-2-desktop" style={{ display: 'grid', gap: '14px' }}>
          {/* Garment Style Dropdown (Required) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={styles.label}>Select Garment Style (Required)</label>
              <button
                type="button"
                onClick={() => navigate('/supervisor/production-orders/new/style')}
                style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> Create / Manage Styles
              </button>
            </div>
            <select
              className="input-field"
              value={selectedStyleId}
              onChange={e => {
                const id = e.target.value;
                setSelectedStyleId(id);
                if (id) {
                  sessionStorage.setItem('uniflow_draft_po_style_id', id);
                } else {
                  sessionStorage.removeItem('uniflow_draft_po_style_id');
                }
              }}
              required
            >
              <option value="">-- Select Style from Catalog --</option>
              {loadingStyles ? (
                <option value="" disabled>Loading styles from database...</option>
              ) : stylesList.length === 0 ? (
                <option value="" disabled>No styles available</option>
              ) : (
                stylesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))
              )}
            </select>
            {stylesList.length === 0 && !loadingStyles && (
              <p style={{ fontSize: '12px', color: 'var(--color-amber)', marginTop: '4px' }}>
                No styles found in database. Click '+ Create / Manage Styles' above to add one.
              </p>
            )}
          </div>

          {/* PO Number */}
          <div>
            <label style={styles.label}>Production Order No.</label>
            <input
              type="text"
              className="input-field"
              value={poId}
              onChange={e => setPoId(e.target.value)}
              required
            />
          </div>

          {/* Map PO */}
          <div>
            <label style={styles.label}>Map PO (Free Text Code)</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. MAP-PO-44821"
              value={mapPo}
              onChange={e => setMapPo(e.target.value)}
              required
            />
          </div>

          {/* Box Serial Range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={styles.label}>Box Serial Range Start</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. BX-000100"
                value={boxRangeStart}
                onChange={e => setBoxRangeStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={styles.label}>Box Serial Range End</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. BX-000500"
                value={boxRangeEnd}
                onChange={e => setBoxRangeEnd(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Dates Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={styles.label}>Start Date</label>
              <input
                type="date"
                className="input-field"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={styles.label}>Due Date</label>
              <input
                type="date"
                className="input-field"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Supervisor */}
          <div>
            <label style={styles.label}>Responsible Supervisor</label>
            <input
              type="text"
              className="input-field"
              value={supervisor}
              onChange={e => setSupervisor(e.target.value)}
            />
          </div>
        </div>

        {/* Operations Checkboxes */}
        <div>
          <label style={styles.label}>Required Operations for this PO</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {(['QC Test', 'Packing', 'AQL Checker', 'Box Transfer'] as OperationType[]).map(op => {
              const isChecked = selectedOps.includes(op);
              return (
                <div
                  key={op}
                  style={{
                    ...styles.opCheckRow,
                    borderColor: isChecked ? 'var(--primary-teal)' : 'var(--border-color)',
                    backgroundColor: isChecked ? 'rgba(22, 184, 174, 0.08)' : 'var(--bg-surface-1)'
                  }}
                  onClick={() => toggleOp(op)}
                >
                  {isChecked ? (
                    <CheckSquare size={20} color="var(--primary-teal)" />
                  ) : (
                    <Square size={20} color="var(--text-muted)" />
                  )}
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {op}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Remarks */}
        <div>
          <label style={styles.label}>Remarks / Instructions</label>
          <input
            type="text"
            className="input-field"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
          Next: Add Sales Orders <ArrowRight size={18} style={{ marginLeft: '6px' }} />
        </button>
      </form>
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
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)'
  },
  stepInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-muted)'
  },
  stepNumActive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumInactive: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepDivider: {
    width: '14px',
    height: '1px',
    backgroundColor: 'var(--border-color)'
  },
  label: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block'
  },
  opCheckRow: {
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer'
  }
};
