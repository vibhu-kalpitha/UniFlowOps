import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductionOrder, SalesOrder } from '../../types';
import { StatusPill } from '../../components/StatusPill';
import { CheckCircle2, ArrowLeft, CheckSquare, Square, Edit3 } from 'lucide-react';
import '../../styles/tokens.css';

export const CreatePOReview: React.FC = () => {
  const navigate = useNavigate();
  const { saveProductionOrder, showToast } = useApp();

  const [draftPoGeneral, setDraftPoGeneral] = useState<any>(null);
  const [draftSos, setDraftSos] = useState<SalesOrder[]>([]);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [isCreated, setIsCreated] = useState(false);

  useEffect(() => {
    const genData = sessionStorage.getItem('uniflow_draft_po_general');
    const sosData = sessionStorage.getItem('uniflow_draft_po_sos');

    if (genData) setDraftPoGeneral(JSON.parse(genData));
    if (sosData) setDraftSos(JSON.parse(sosData));
  }, []);

  if (!draftPoGeneral) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>No draft PO found. Please start from Step 1.</p>
        <button className="btn-primary" onClick={() => navigate('/supervisor/production-orders/new/general')} style={{ marginTop: '12px' }}>
          Go to Step 1
        </button>
      </div>
    );
  }

  const totalQuantity = draftSos.reduce((sum, s) => sum + s.quantity, 0);
  const totalShifts = draftSos.reduce((sum, s) => sum + s.shifts.length, 0);

  const handleFinalCreate = () => {
    const finalPo: ProductionOrder = {
      id: draftPoGeneral.id,
      mapPo: draftPoGeneral.mapPo,
      customer: draftPoGeneral.customer,
      startDate: draftPoGeneral.startDate,
      dueDate: draftPoGeneral.dueDate,
      supervisorId: draftPoGeneral.supervisorId,
      remarks: draftPoGeneral.remarks,
      status: makeCurrent ? 'Current' : 'Draft',
      selectedOperations: draftPoGeneral.selectedOperations,
      salesOrders: draftSos
    };

    saveProductionOrder(finalPo);
    sessionStorage.removeItem('uniflow_draft_po_general');
    sessionStorage.removeItem('uniflow_draft_po_sos');

    setIsCreated(true);
    showToast(`Production Order ${finalPo.id} created successfully!`, 'success');
  };

  if (isCreated) {
    return (
      <div style={styles.successScreen}>
        <div style={styles.iconCircleSuccess}>
          <CheckCircle2 size={48} color="var(--color-green)" />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, marginTop: '12px' }}>PO Created Successfully</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'center' }}>
          Production Order <strong>{draftPoGeneral.id}</strong> (Map PO: {draftPoGeneral.mapPo}) with {draftSos.length} Sales Orders has been deployed to the shop floor.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '24px' }}>
          <button className="btn-primary" onClick={() => navigate('/supervisor/home')}>
            Return to Supervisor Home
          </button>
          <button className="btn-secondary" onClick={() => navigate('/supervisor/orders')}>
            View All Production Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={styles.wizardBar}>
        <div style={styles.stepCompleted}>
          <span style={styles.stepNumCompleted}>✓</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepCompleted}>
          <span style={styles.stepNumCompleted}>✓</span>
          <span>Sales Orders</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>3</span>
          <span>Review</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Review & Deploy PO</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 3 of 3: Confirm Production Order parameters and shift plans.
        </p>
      </div>

      {/* PO Header Summary Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={styles.cardSubTitle}>PRODUCTION ORDER SUMMARY</span>
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary-teal)' }}>
              {draftPoGeneral.id}
            </h3>
          </div>
          <button
            style={styles.editLinkBtn}
            onClick={() => navigate('/supervisor/production-orders/new/general')}
          >
            <Edit3 size={14} /> Edit
          </button>
        </div>

        <div style={styles.summaryGrid}>
          <div>
            <span style={styles.sumLabel}>Map PO</span>
            <span style={styles.sumVal}>{draftPoGeneral.mapPo}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Customer</span>
            <span style={styles.sumVal}>{draftPoGeneral.customer}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Supervisor</span>
            <span style={styles.sumVal}>{draftPoGeneral.supervisorId}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Due Date</span>
            <span style={styles.sumVal}>{draftPoGeneral.dueDate}</span>
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <span style={styles.sumLabel}>Required Operations</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
            {draftPoGeneral.selectedOperations.map((op: string) => (
              <StatusPill key={op} label={op} variant="purple" />
            ))}
          </div>
        </div>
      </div>

      {/* Sales Orders & Shifts Summary Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={styles.cardSubTitle}>SALES ORDERS BREAKDOWN</span>
            <h4 style={{ fontSize: '16px', fontWeight: 700 }}>
              {draftSos.length} SOs • {totalQuantity} Total Units • {totalShifts} Shifts
            </h4>
          </div>
          <button
            style={styles.editLinkBtn}
            onClick={() => navigate('/supervisor/production-orders/new/sales-orders')}
          >
            <Edit3 size={14} /> Edit
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          {draftSos.map(so => (
            <div key={so.id} style={styles.soSummaryRow}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {so.id} ({so.product})
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>
                  Map SO: {so.mapSo} • Qty: {so.quantity}
                </span>
              </div>
              <StatusPill label={so.lineId} variant="blue" />
            </div>
          ))}
        </div>
      </div>

      {/* Make Current Checkbox */}
      <button
        type="button"
        style={styles.checkboxRow}
        onClick={() => setMakeCurrent(!makeCurrent)}
      >
        {makeCurrent ? (
          <CheckSquare size={20} color="var(--primary-teal)" />
        ) : (
          <Square size={20} color="var(--text-muted)" />
        )}
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
            Make this PO current upon creation
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block' }}>
            Operators on assigned lines will see this order immediately.
          </span>
        </div>
      </button>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
        <button className="btn-secondary" onClick={() => navigate('/supervisor/production-orders/new/sales-orders')} style={{ flex: 1 }}>
          <ArrowLeft size={18} style={{ marginRight: '6px' }} /> Back
        </button>
        <button className="btn-primary" onClick={handleFinalCreate} style={{ flex: 2 }}>
          Create Production Order
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
  stepActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)'
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
  stepDivider: {
    width: '14px',
    height: '1px',
    backgroundColor: 'var(--border-color)'
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em'
  },
  editLinkBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--primary-teal)',
    fontSize: '12px',
    fontWeight: 700
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginTop: '10px'
  },
  sumLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    display: 'block'
  },
  sumVal: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'block'
  },
  soSummaryRow: {
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '10px',
    padding: '10px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  checkboxRow: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    padding: '14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    textAlign: 'left'
  },
  successScreen: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px'
  },
  iconCircleSuccess: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-green-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
