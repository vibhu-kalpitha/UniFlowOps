import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { OperationType } from '../../types';
import { ArrowRight, CheckSquare, Square, Tag } from 'lucide-react';
import '../../styles/tokens.css';

export const CreatePOGeneral: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [selectedStyle, setSelectedStyle] = useState('Style 01 (Running Tee)');

  const [poId, setPoId] = useState(() => `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [mapPo, setMapPo] = useState(() => `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`);

  useEffect(() => {
    const savedStyle = sessionStorage.getItem('uniflow_draft_po_style');
    if (savedStyle) {
      setSelectedStyle(savedStyle);
    }
  }, []);
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

  const toggleOp = (op: OperationType) => {
    if (selectedOps.includes(op)) {
      setSelectedOps(selectedOps.filter(o => o !== op));
    } else {
      setSelectedOps([...selectedOps, op]);
    }
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
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

    // Save draft PO to session/state
    const draftPo = {
      id: poId,
      mapPo,
      customer: 'Nike',
      selectedStyle,
      boxRangeStart,
      boxRangeEnd,
      startDate,
      dueDate,
      supervisorId: supervisor,
      remarks,
      selectedOperations: selectedOps
    };

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
          Step 2 of 4: Define Production Order Header & Box Serial Number Range.
        </p>
      </div>

      {/* Selected Style Banner */}
      <div
        style={{
          backgroundColor: 'rgba(22, 184, 174, 0.12)',
          border: '1px solid var(--primary-teal)',
          borderRadius: '14px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Tag size={20} color="var(--primary-teal)" />
          <div>
            <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700, textTransform: 'uppercase' }}>
              Selected Garment Style
            </span>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {selectedStyle}
            </h4>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/supervisor/production-orders/new/style')}
          style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', textDecoration: 'underline' }}
        >
          Change Style
        </button>
      </div>

      <form onSubmit={handleNext} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="grid-2-desktop" style={{ display: 'grid', gap: '14px' }}>
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

          {/* Map PO (Free Text) */}
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

          {/* Box Serial Number / Barcode Range (Letters & Numbers) */}
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

          {/* Responsible Supervisor */}
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

        {/* Required Operations Checkboxes */}
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
