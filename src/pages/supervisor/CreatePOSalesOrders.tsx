import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SalesOrder, ShiftAssignment, OperationType } from '../../types';
import { Plus, Trash2, Edit3, ArrowRight, ArrowLeft, X, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { StatusPill } from '../../components/StatusPill';
import '../../styles/tokens.css';

export const CreatePOSalesOrders: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const getSavedDraftSos = (): SalesOrder[] => {
    const data = sessionStorage.getItem('uniflow_draft_po_sos');
    if (data) {
      try { return JSON.parse(data); } catch { return []; }
    }
    return [];
  };

  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(getSavedDraftSos);
  const [showSoModal, setShowSoModal] = useState(false);
  const [editingSoId, setEditingSoId] = useState<string | null>(null);

  // Form State for Add/Edit Modal
  const [soId, setSoId] = useState('SO-77205');
  const [mapSo, setMapSo] = useState('MAP-SO-90318');
  const [product, setProduct] = useState('Windbreaker Tee');
  const [styleCode, setStyleCode] = useState('ST-NK-800');
  const [colour, setColour] = useState('Black');
  const [sizeRange, setSizeRange] = useState('S - XL');
  const [quantity, setQuantity] = useState(1200);
  const [lineId, setLineId] = useState('Line 04');
  const [boxCapacity, setBoxCapacity] = useState(12);

  // Shifts Form State
  const [shifts, setShifts] = useState<ShiftAssignment[]>([
    {
      id: 'shf-draft-1',
      salesOrderId: 'SO-77205',
      workerId: 'usr-001',
      workerName: 'Chamika Silva',
      startTime: '14:00',
      endTime: '18:00',
      date: '2026-09-15',
      enabledOperations: ['QC Test', 'Packing']
    }
  ]);

  const [overlapError, setOverlapError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingSoId(null);
    setSoId(`SO-${Math.floor(77200 + Math.random() * 900)}`);
    setMapSo(`MAP-SO-${Math.floor(90000 + Math.random() * 9000)}`);
    setShifts([
      {
        id: `shf-${Date.now()}-1`,
        salesOrderId: 'SO-NEW',
        workerId: 'usr-001',
        workerName: 'Chamika Silva',
        startTime: '14:00',
        endTime: '18:00',
        date: '2026-09-15',
        enabledOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
      },
      {
        id: `shf-${Date.now()}-2`,
        salesOrderId: 'SO-NEW',
        workerId: 'usr-004',
        workerName: 'Kavindu Perera',
        startTime: '18:00',
        endTime: '22:00',
        date: '2026-09-15',
        enabledOperations: ['QC Test', 'Packing']
      }
    ]);
    setOverlapError(null);
    setShowSoModal(true);
  };

  const handleAddShift = () => {
    const newShift: ShiftAssignment = {
      id: `shf-${Date.now()}`,
      salesOrderId: soId,
      workerId: 'usr-005',
      workerName: 'Sunil Bandara',
      startTime: '08:00',
      endTime: '14:00',
      date: '2026-09-15',
      enabledOperations: ['QC Test', 'Packing']
    };
    setShifts([...shifts, newShift]);
  };

  const handleRemoveShift = (id: string) => {
    setShifts(shifts.filter(s => s.id !== id));
  };

  const updateShiftField = (id: string, field: keyof ShiftAssignment, val: any) => {
    const updated = shifts.map(s => (s.id === id ? { ...s, [field]: val } : s));
    setShifts(updated);

    // Validate overlap
    validateShifts(updated);
  };

  const validateShifts = (shiftList: ShiftAssignment[]): boolean => {
    setOverlapError(null);

    for (let i = 0; i < shiftList.length; i++) {
      const s1 = shiftList[i];
      if (s1.startTime >= s1.endTime) {
        setOverlapError(`Shift ${i + 1}: End time must be after Start time.`);
        return false;
      }
      for (let j = i + 1; j < shiftList.length; j++) {
        const s2 = shiftList[j];
        // Check if same date and time overlap
        if (s1.date === s2.date) {
          const overlap = Math.max(s1.startTime.localeCompare(s2.startTime), 0) < Math.min(s1.endTime.localeCompare(s2.endTime), 1) &&
                          s1.startTime < s2.endTime && s2.startTime < s1.endTime;
          if (overlap) {
            setOverlapError(`Shift conflict detected! Shift for ${s1.workerName} (${s1.startTime}-${s1.endTime}) overlaps with ${s2.workerName} (${s2.startTime}-${s2.endTime}).`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleSaveSoModal = () => {
    if (!validateShifts(shifts)) {
      showToast('Please resolve shift overlaps before saving.', 'error');
      return;
    }

    const newSoItem: SalesOrder = {
      id: soId,
      mapSo,
      product,
      styleCode,
      colour,
      sizeRange,
      quantity,
      lineId,
      boxCapacity,
      shifts,
      progress: {
        qcPassed: 0,
        qcFailed: 0,
        testPassed: 0,
        testFailed: 0,
        packed: 0,
        aqlPassed: 0,
        aqlFailed: 0,
        issuesCount: 0,
        status: 'In Progress'
      }
    };

    if (editingSoId) {
      setSalesOrders(salesOrders.map(s => (s.id === editingSoId ? newSoItem : s)));
    } else {
      setSalesOrders([...salesOrders, newSoItem]);
    }

    setShowSoModal(false);
    showToast(`Sales Order ${soId} saved successfully!`, 'success');
  };

  const handleDeleteSo = (id: string) => {
    setSalesOrders(salesOrders.filter(s => s.id !== id));
    showToast(`Removed Sales Order ${id}`, 'info');
  };

  const totalQuantity = salesOrders.reduce((sum, s) => sum + s.quantity, 0);

  const handleNextReview = () => {
    sessionStorage.setItem('uniflow_draft_po_sos', JSON.stringify(salesOrders));
    if (salesOrders.length === 0) {
      showToast('Creating PO without Sales Orders (Unassigned PO)', 'info');
    }
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
          <span style={styles.stepNumActive}>2</span>
          <span>Sales Orders</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Review</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Configure Sales Orders</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Attach Sales Orders, Line IDs, and Worker Shifts to this PO.
          </p>
        </div>
        <div style={styles.totalBadge}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total Units</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-teal)' }}>{totalQuantity}</span>
        </div>
      </div>

      {/* Add Sales Order Button */}
      <button className="btn-secondary" onClick={handleOpenAdd} style={{ gap: '8px', borderStyle: 'dashed' }}>
        <Plus size={18} color="var(--primary-teal)" /> Add Sales Order
      </button>

      {/* SO Cards List */}
      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {salesOrders.map(so => (
          <div key={so.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{so.id}</h4>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Map SO: {so.mapSo}</span>
              </div>
              <StatusPill label={so.lineId} variant="blue" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              <span>{so.product} ({so.colour})</span>
              <span><strong>Qty:</strong> {so.quantity}</span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Configured Shifts ({so.shifts.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {so.shifts.map((sh, idx) => (
                  <div key={sh.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>👷 Shift {idx + 1}: {sh.workerName}</span>
                    <span style={{ color: 'var(--primary-teal)', fontWeight: 600 }}>{sh.startTime} - {sh.endTime}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button
                style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--color-red)' }}
                onClick={() => handleDeleteSo(so.id)}
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Controls */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
        <button className="btn-secondary" onClick={() => navigate('/supervisor/production-orders/new/general')} style={{ flex: 1 }}>
          <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back
        </button>
        <button className="btn-primary" onClick={handleNextReview} style={{ flex: 1 }}>
          Next: Review PO <ArrowRight size={18} style={{ marginLeft: '6px' }} />
        </button>
      </div>

      {/* Add / Edit Sales Order Modal */}
      {showSoModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Add / Edit Sales Order</h3>
              <button style={styles.closeBtn} onClick={() => setShowSoModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              <div>
                <label style={styles.label}>Sales Order Number</label>
                <input type="text" className="input-field" value={soId} onChange={e => setSoId(e.target.value)} />
              </div>

              <div>
                <label style={styles.label}>Map SO (Free Text Code)</label>
                <input type="text" className="input-field" value={mapSo} onChange={e => setMapSo(e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Product Name</label>
                  <input type="text" className="input-field" value={product} onChange={e => setProduct(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>Style Code</label>
                  <input type="text" className="input-field" value={styleCode} onChange={e => setStyleCode(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Colour</label>
                  <input type="text" className="input-field" value={colour} onChange={e => setColour(e.target.value)} />
                </div>
                <div>
                  <label style={styles.label}>Size Range</label>
                  <input type="text" className="input-field" value={sizeRange} onChange={e => setSizeRange(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label}>Order Quantity</label>
                  <input type="number" className="input-field" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={styles.label}>Line / Department</label>
                  <select className="input-field select-field" value={lineId} onChange={e => setLineId(e.target.value)}>
                    <option value="Line 01">Line 01</option>
                    <option value="Line 02">Line 02</option>
                    <option value="Line 03">Line 03</option>
                    <option value="Line 04">Line 04</option>
                  </select>
                </div>
              </div>

              {/* Work Shifts Section */}
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-teal)' }}>Work Shifts Configuration</span>
                  <button type="button" style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 700 }} onClick={handleAddShift}>
                    + Add Shift
                  </button>
                </div>

                {overlapError && (
                  <div style={styles.errorBox}>
                    <AlertTriangle size={16} color="var(--color-red)" />
                    <span style={{ fontSize: '12px', color: 'var(--color-red)', fontWeight: 600 }}>{overlapError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {shifts.map((sh, idx) => (
                    <div key={sh.id} style={styles.shiftCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Shift {idx + 1}</span>
                        {shifts.length > 1 && (
                          <button type="button" onClick={() => handleRemoveShift(sh.id)} style={{ color: 'var(--color-red)' }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Worker Name</label>
                          <select
                            className="input-field select-field"
                            style={{ height: '36px', fontSize: '12px' }}
                            value={sh.workerName}
                            onChange={e => updateShiftField(sh.id, 'workerName', e.target.value)}
                          >
                            <option value="Chamika Silva">Chamika Silva</option>
                            <option value="Kavindu Perera">Kavindu Perera</option>
                            <option value="Sunil Bandara">Sunil Bandara</option>
                            <option value="Kasun Kalhara">Kasun Kalhara</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Date</label>
                          <input
                            type="date"
                            className="input-field"
                            style={{ height: '36px', fontSize: '12px' }}
                            value={sh.date}
                            onChange={e => updateShiftField(sh.id, 'date', e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Start Time</label>
                          <input
                            type="time"
                            className="input-field"
                            style={{ height: '36px', fontSize: '12px' }}
                            value={sh.startTime}
                            onChange={e => updateShiftField(sh.id, 'startTime', e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>End Time</label>
                          <input
                            type="time"
                            className="input-field"
                            style={{ height: '36px', fontSize: '12px' }}
                            value={sh.endTime}
                            onChange={e => updateShiftField(sh.id, 'endTime', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={handleSaveSoModal} style={{ marginTop: '16px' }}>
              Save Sales Order
            </button>
          </div>
        </div>
      )}
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
  stepNumCompleted: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
  totalBadge: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '6px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    maxWidth: '400px'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    padding: '4px'
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
  },
  shiftCard: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 92, 92, 0.12)',
    border: '1px solid var(--color-red)',
    borderRadius: '8px',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px'
  }
};
