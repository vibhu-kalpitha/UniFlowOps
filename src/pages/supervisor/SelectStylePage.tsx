import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../services/api';
import { CheckCircle2, Circle, ArrowRight, Tag, Plus, X } from 'lucide-react';
import '../../styles/tokens.css';

interface StyleItem {
  id: string;
  code: string;
  name: string;
  customer?: string;
  season?: string;
  notes?: string;
}

export const SelectStylePage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [styles, setStyles] = useState<StyleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');

  // Create Style Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newCustomer, setNewCustomer] = useState<string>('Nike');
  const [newSeason, setNewSeason] = useState<string>('Q4 2026');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<StyleItem[]>('/api/styles');
      setStyles(data);
      const savedId = sessionStorage.getItem('uniflow_draft_po_style_id');
      if (savedId && data.some(s => s.id === savedId)) {
        setSelectedStyleId(savedId);
      } else if (data.length > 0) {
        setSelectedStyleId(data[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load styles from database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStyles();
  }, []);

  const handleCreateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      showToast('Please enter Style Code and Name', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<StyleItem>('/api/styles', {
        method: 'POST',
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          customer: newCustomer.trim(),
          season: newSeason.trim()
        })
      });
      showToast(`Style '${created.code}' created successfully!`, 'success');
      setShowCreateModal(false);
      setNewCode('');
      setNewName('');
      await fetchStyles();
      setSelectedStyleId(created.id);
    } catch (err: any) {
      showToast(err.message || 'Failed to create style', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (!selectedStyleId) {
      showToast('Please select a style to proceed', 'warning');
      return;
    }
    const selectedObj = styles.find(s => s.id === selectedStyleId);
    if (selectedObj) {
      sessionStorage.setItem('uniflow_draft_po_style_id', selectedObj.id);
      sessionStorage.setItem('uniflow_draft_po_style', `${selectedObj.code} - ${selectedObj.name}`);
      showToast(`Selected ${selectedObj.code}. Proceeding to PO General Info`, 'success');
    }
    navigate('/supervisor/production-orders/new/general');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Wizard Step Bar */}
      <div style={wizardStyles.wizardBar}>
        <div style={wizardStyles.stepActive}>
          <span style={wizardStyles.stepNumActive}>1</span>
          <span>Select Style</span>
        </div>
        <div style={wizardStyles.stepDivider} />
        <div style={wizardStyles.stepInactive}>
          <span style={wizardStyles.stepNumInactive}>2</span>
          <span>General Info</span>
        </div>
        <div style={wizardStyles.stepDivider} />
        <div style={wizardStyles.stepInactive}>
          <span style={wizardStyles.stepNumInactive}>3</span>
          <span>Sales Orders</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Garment Style Selection</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Step 1 of 4: Choose or create Garment Style Specification from MySQL catalog.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowCreateModal(true)}
          style={{ width: 'auto', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
        >
          <Plus size={16} color="var(--primary-teal)" /> Create New Style
        </button>
      </div>

      {/* Style Selection Cards */}
      {loading ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading database styles...
        </div>
      ) : styles.length === 0 ? (
        <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px' }}>No styles available</p>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>Please create a new style specification to continue.</p>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)} style={{ width: 'auto', margin: '0 auto' }}>
            + Create Style
          </button>
        </div>
      ) : (
        <div className="grid-2-desktop" style={{ display: 'grid', gap: '12px' }}>
          {styles.map(st => {
            const isSelected = st.id === selectedStyleId;
            return (
              <div
                key={st.id}
                onClick={() => setSelectedStyleId(st.id)}
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
                      {st.code} — {st.name}
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Customer: {st.customer || 'Standard'} {st.season ? `• Season: ${st.season}` : ''}
                    </p>
                  </div>
                </div>
                <Tag size={20} color={isSelected ? 'var(--primary-teal)' : 'var(--text-muted)'} />
              </div>
            );
          })}
        </div>
      )}

      {styles.length > 0 && (
        <button className="btn-primary" onClick={handleNext} style={{ marginTop: '10px' }}>
          Next: PO General Info <ArrowRight size={18} style={{ marginLeft: '6px' }} />
        </button>
      )}

      {/* Modal to Create a New Style */}
      {showCreateModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.content}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Create Garment Style</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowCreateModal(false)}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            <form onSubmit={handleCreateStyle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={modalStyles.label}>Style Code (Required)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. ST-2026-TEE"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={modalStyles.label}>Style Name (Required)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Performance Athletic Tee"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={modalStyles.label}>Customer / Buyer</label>
                <input
                  type="text"
                  className="input-field"
                  value={newCustomer}
                  onChange={e => setNewCustomer(e.target.value)}
                />
              </div>

              <div>
                <label style={modalStyles.label}>Season</label>
                <input
                  type="text"
                  className="input-field"
                  value={newSeason}
                  onChange={e => setNewSeason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Style to Database'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const wizardStyles: Record<string, React.CSSProperties> = {
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

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
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
  content: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '24px',
    padding: '20px',
    width: '100%',
    maxWidth: '420px'
  },
  label: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    display: 'block'
  }
};
