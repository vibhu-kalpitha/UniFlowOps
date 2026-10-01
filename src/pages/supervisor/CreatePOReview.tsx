import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ProductionOrder, ProductConfiguration, ShiftAssignment } from '../../types';
import { CheckCircle2, ArrowLeft, CheckSquare, Square, Edit3 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const CreatePOReview: React.FC = () => {
  const navigate = useNavigate();
  const { saveProductionOrder, refreshProductionOrders, setActiveJob, showToast } = useApp();

  const [draftPoGeneral, setDraftPoGeneral] = useState<any>(null);
  const [draftConfigs, setDraftConfigs] = useState<ProductConfiguration[]>([]);
  const [draftShifts, setDraftShifts] = useState<ShiftAssignment[]>([]);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [isCreated, setIsCreated] = useState(false);
  const [createdPo, setCreatedPo] = useState<ProductionOrder | null>(null);

  useEffect(() => {
    const genData = sessionStorage.getItem('uniflow_draft_po_general');
    const configsData = sessionStorage.getItem('uniflow_draft_po_configs');
    const shiftsData = sessionStorage.getItem('uniflow_draft_po_shifts');

    if (genData) setDraftPoGeneral(JSON.parse(genData));
    if (configsData) setDraftConfigs(JSON.parse(configsData));
    if (shiftsData) setDraftShifts(JSON.parse(shiftsData));
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

  const totalQuantity = draftConfigs.reduce((sum, c) => sum + (c.quantity || 0), 0);

  const handleFinalCreate = async () => {
    if (!draftPoGeneral?.styleId) {
      showToast('Please select an existing style or create one first.', 'warning');
      return;
    }

    const finalPoPayload = {
      id: draftPoGeneral.id,
      mapPo: draftPoGeneral.mapPo,
      customer: draftPoGeneral.customer || 'Factory Orders',
      styleId: draftPoGeneral.styleId,
      startDate: draftPoGeneral.startDate,
      dueDate: draftPoGeneral.dueDate,
      supervisorId: draftPoGeneral.supervisorId,
      shiftId: draftPoGeneral.shiftId,
      remarks: draftPoGeneral.remarks,
      status: makeCurrent ? 'Current' : 'Draft',
      selectedOperations: draftPoGeneral.selectedOperations,
      qcTestMode: draftPoGeneral.qcTestMode,
      productConfigurations: draftConfigs,
      shifts: draftShifts
    };

    let serverPo: ProductionOrder | null = null;
    try {
      serverPo = await apiFetch<ProductionOrder>('/api/production-orders', {
        method: 'POST',
        body: JSON.stringify(finalPoPayload)
      });
    } catch (e: any) {
      console.error('Failed to post PO to server', e);
      showToast(e.message || 'Failed to deploy PO to server database', 'error');
      return;
    }

    const savedPo = serverPo || (finalPoPayload as any);
    saveProductionOrder(savedPo);

    let refreshFailed = false;
    try {
      await refreshProductionOrders();
    } catch {
      refreshFailed = true;
    }

    if (refreshFailed) {
      showToast('PO saved, but list refresh failed. Retry.', 'warning');
    } else {
      showToast(`Production Order ${savedPo.id} created & deployed to server database!`, 'success');
    }

    if (makeCurrent) {
      const shift = draftShifts[0] || {
        id: `shf-${Date.now()}`,
        productionOrderId: savedPo.id,
        workerId: 'usr-001',
        workerName: 'Chamika Silva',
        startTime: '14:00',
        endTime: '18:00',
        date: new Date().toISOString().split('T')[0],
        enabledOperations: savedPo.selectedOperations || ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
      };
      setActiveJob({
        productionOrder: savedPo,
        shift
      });
    }

    // Clear session storage drafts ONLY after success
    sessionStorage.removeItem('uniflow_draft_po_general');
    sessionStorage.removeItem('uniflow_draft_po_configs');
    sessionStorage.removeItem('uniflow_draft_po_shifts');
    sessionStorage.removeItem('uniflow_draft_po_sos');
    sessionStorage.removeItem('uniflow_draft_po_style_id');

    setCreatedPo(savedPo);
    setIsCreated(true);
  };

  if (isCreated) {
    const poIdForNav = createdPo?.id || draftPoGeneral?.id;
    return (
      <div style={styles.successScreen}>
        <div style={styles.iconCircleSuccess}>
          <CheckCircle2 size={48} color="var(--color-green)" />
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, marginTop: '12px' }}>PO Created Successfully</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'center' }}>
          Production Order <strong>{poIdForNav}</strong> (Map PO: {draftPoGeneral.mapPo}) with {draftConfigs.length} product configurations has been saved to the database.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', marginTop: '24px' }}>
          <button className="btn-primary" onClick={() => navigate(`/supervisor/orders?poId=${encodeURIComponent(poIdForNav)}`)}>
            View Production Order
          </button>
          <button className="btn-secondary" onClick={() => navigate('/supervisor/home')}>
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
          <span>Product Configurations</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>4</span>
          <span>Review</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Review & Deploy PO</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 4 of 4: Confirm Production Order parameters, product configurations, and shift plans.
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
            <span style={styles.sumLabel}>Style Code / Name</span>
            <span style={styles.sumVal}>{draftPoGeneral.styleCode || 'ST-900'} — {draftPoGeneral.styleName || 'Standard Style'}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Customer</span>
            <span style={styles.sumVal}>{draftPoGeneral.customer}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Start Date / Due Date</span>
            <span style={styles.sumVal}>{draftPoGeneral.startDate} to {draftPoGeneral.dueDate}</span>
          </div>
          <div>
            <span style={styles.sumLabel}>Responsible Supervisor</span>
            <span style={styles.sumVal}>{draftPoGeneral.supervisorId}</span>
          </div>
          {draftPoGeneral.shiftName && (
            <div>
              <span style={styles.sumLabel}>Work Shift</span>
              <span style={{ ...styles.sumVal, color: 'var(--primary-teal)', fontWeight: 800 }}>{draftPoGeneral.shiftName}</span>
            </div>
          )}
          {draftShifts.length > 0 && (
            <div>
              <span style={styles.sumLabel}>Assigned Operators</span>
              <span style={styles.sumVal}>{draftShifts.map((s: any) => s.workerName || s.workerId).join(', ')}</span>
            </div>
          )}
          {draftPoGeneral.qcTestMode && (
            <div>
              <span style={styles.sumLabel}>QC Mode Sub-Selection</span>
              <span style={{ ...styles.sumVal, color: 'var(--primary-teal)', fontWeight: 800 }}>{draftPoGeneral.qcTestMode}</span>
            </div>
          )}
        </div>

        {draftPoGeneral.remarks && (
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
            <span style={styles.sumLabel}>Remarks / Instructions</span>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px' }}>{draftPoGeneral.remarks}</p>
          </div>
        )}
      </div>

      {/* Selected Operations Card */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <span style={styles.cardSubTitle}>REQUIRED OPERATIONS</span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          {draftPoGeneral.selectedOperations?.map((op: string) => (
            <span
              key={op}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--primary-teal)',
                backgroundColor: 'rgba(22, 184, 174, 0.15)',
                padding: '4px 10px',
                borderRadius: '8px'
              }}
            >
              ✓ {op}
            </span>
          ))}
        </div>
      </div>

      {/* Product Configurations Summary */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={styles.cardSubTitle}>PRODUCT CONFIGURATIONS ({draftConfigs.length})</span>
            <h4 style={{ fontSize: '16px', fontWeight: 800 }}>Total Quantity: {totalQuantity} pcs</h4>
          </div>
          <button
            style={styles.editLinkBtn}
            onClick={() => navigate('/supervisor/production-orders/new/sales-orders')}
          >
            <Edit3 size={14} /> Edit
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {draftConfigs.map((cfg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-surface-2)',
                border: '1px solid var(--border-color)'
              }}
            >
              <div>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal)' }}>{cfg.configCode}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  {cfg.productType ? `Type: ${cfg.productType} ` : ''}{cfg.size ? `• Size: ${cfg.size}` : ''}
                </span>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {cfg.quantity} Pcs
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Status Checkbox */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px',
          borderRadius: '14px',
          backgroundColor: 'var(--bg-surface-1)',
          border: '1px solid var(--border-color)',
          cursor: 'pointer'
        }}
        onClick={() => setMakeCurrent(!makeCurrent)}
      >
        {makeCurrent ? (
          <CheckSquare size={22} color="var(--primary-teal)" />
        ) : (
          <Square size={22} color="var(--text-muted)" />
        )}
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Mark Production Order as Current
          </h4>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Immediately deploy to factory line and authorize allocated shift operators.
          </p>
        </div>
      </div>

      {/* Navigation Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/supervisor/production-orders/new/sales-orders')}
          style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={16} /> Back to Configurations
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleFinalCreate}
          style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <CheckCircle2 size={16} /> Save & Deploy PO
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
  stepDivider: {
    flex: 1,
    height: '1px',
    backgroundColor: 'var(--border-color)',
    margin: '0 8px'
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    display: 'block'
  },
  editLinkBtn: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginTop: '12px'
  },
  sumLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    display: 'block',
    fontWeight: 600
  },
  sumVal: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  successScreen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '30px 20px',
    backgroundColor: 'var(--bg-surface-1)',
    borderRadius: '20px',
    border: '1px solid var(--border-color)'
  },
  iconCircleSuccess: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
