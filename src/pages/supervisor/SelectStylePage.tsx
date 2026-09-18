import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, Circle, ArrowRight, Tag } from 'lucide-react';
import '../../styles/tokens.css';

export const SelectStylePage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const defaultStyles = [
    { code: 'Style 01 (Running Tee)', name: 'Style 01 — Running Tee', desc: 'Lightweight breathable mesh athletic tee' },
    { code: 'Style 02 (Sport Polo)', name: 'Style 02 — Sport Polo', desc: 'Performance polo with moisture-wicking fabric' },
    { code: 'Style 03 (Athletic Shorts)', name: 'Style 03 — Athletic Shorts', desc: 'Ergonomic stretch shorts with liner' },
    { code: 'Style 04 (Performance Hoodie)', name: 'Style 04 — Performance Hoodie', desc: 'Warm-up fleece hooded sweatshirt' },
    { code: 'Style 05 (Compress Tight)', name: 'Style 05 — Compress Tight', desc: 'Full-length active compression leggings' },
  ];

  const [selectedStyleCode, setSelectedStyleCode] = useState(defaultStyles[0].code);

  const handleNext = () => {
    sessionStorage.setItem('uniflow_draft_po_style', selectedStyleCode);
    showToast(`Selected ${selectedStyleCode}. Proceeding to PO General Info`, 'success');
    navigate('/supervisor/production-orders/new/general');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={styles.wizardBar}>
        <div style={styles.stepActive}>
          <span style={styles.stepNumActive}>1</span>
          <span>Select Style</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>2</span>
          <span>General Info</span>
        </div>
        <div style={styles.stepDivider} />
        <div style={styles.stepInactive}>
          <span style={styles.stepNumInactive}>3</span>
          <span>Sales Orders</span>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Create Style</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Step 1: Choose Garment Style Specification for this Production Order.
        </p>
      </div>

      {/* Style Selection Cards */}
      <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
        {defaultStyles.map(st => {
          const isSelected = st.code === selectedStyleCode;
          return (
            <div
              key={st.code}
              onClick={() => setSelectedStyleCode(st.code)}
              style={{
                backgroundColor: isSelected ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-1)',
                border: `2px solid ${isSelected ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {isSelected ? (
                  <CheckCircle2 size={24} color="var(--primary-teal)" />
                ) : (
                  <Circle size={24} color="var(--text-muted)" />
                )}
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {st.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {st.desc}
                  </p>
                </div>
              </div>
              <Tag size={20} color={isSelected ? 'var(--primary-teal)' : 'var(--text-muted)'} />
            </div>
          );
        })}
      </div>

      <button className="btn-primary" onClick={handleNext} style={{ marginTop: '10px' }}>
        Next: PO General Info <ArrowRight size={18} style={{ marginLeft: '6px' }} />
      </button>
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
  }
};
