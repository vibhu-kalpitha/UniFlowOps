import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { OperationType } from '../../types';
import { ArrowRight, CheckSquare, Square } from 'lucide-react';
import '../../styles/tokens.css';

export const CreatePOGeneral: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [poId, setPoId] = useState('PO-2026-0187');
  const [mapPo, setMapPo] = useState('MAP-PO-44821');
  const [customer, setCustomer] = useState('Nike');
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
    if (!poId.trim() || !mapPo.trim() || !customer.trim()) {
      showToast('Please fill required PO fields', 'warning');
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
      customer,
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
          <span style={styles.stepNumActive}>1</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>2</span>
          <span>Sales Orders</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Review</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Create Production Order</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 1 of 3: Define Production Order Header & Required Operations.
        </p>
      </div>

      <form onSubmit={handleNext} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

        {/* Customer */}
        <div>
          <label style={styles.label}>Customer / Brand</label>
          <select
            className="input-field select-field"
            value={customer}
            onChange={e => setCustomer(e.target.value)}
          >
            <option value="Nike">Nike</option>
            <option value="Adidas">Adidas</option>
            <option value="Puma">Puma</option>
            <option value="Levi's">Levi's</option>
            <option value="Under Armour">Under Armour</option>
          </select>
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
