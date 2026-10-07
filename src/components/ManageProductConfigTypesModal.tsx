import React, { useState, useEffect } from 'react';
import { ProductConfigTypeMaster, ProductConfigSizeMaster } from '../types';
import { apiFetch } from '../services/api';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, RefreshCw, X, Layers, CheckSquare, Square } from 'lucide-react';
import '../styles/tokens.css';

interface ManageProductConfigTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const ManageProductConfigTypesModal: React.FC<ManageProductConfigTypesModalProps> = ({
  isOpen,
  onClose,
  onUpdated
}) => {
  const [configTypes, setConfigTypes] = useState<ProductConfigTypeMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form State for Adding / Editing Configuration Type
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeNameInput, setTypeNameInput] = useState<string>('');
  const [typePrefixInput, setTypePrefixInput] = useState<string>('');
  const [typeUsesSizesInput, setTypeUsesSizesInput] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State for Adding Size to a Type
  const [addingSizeForTypeId, setAddingSizeForTypeId] = useState<string | null>(null);
  const [sizeInput, setSizeInput] = useState<string>('');
  const [sizeError, setSizeError] = useState<string | null>(null);

  const fetchConfigTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProductConfigTypeMaster[]>('/api/product-config-types?all=1');
      if (Array.isArray(data)) {
        setConfigTypes(data);
      } else {
        setConfigTypes([]);
      }
    } catch (err: any) {
      console.error('Failed to load product configuration types:', err);
      setError(err?.message || 'Failed to load configuration types from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfigTypes();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenAddForm = () => {
    setEditingTypeId(null);
    setTypeNameInput('');
    setTypePrefixInput('');
    setTypeUsesSizesInput(true);
    setFormError(null);
    setShowAddForm(true);
  };

  const handleOpenEditForm = (t: ProductConfigTypeMaster) => {
    setEditingTypeId(t.id);
    setTypeNameInput(t.name);
    setTypePrefixInput(t.prefix || '');
    setTypeUsesSizesInput(t.usesSizes);
    setFormError(null);
    setShowAddForm(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = typeNameInput.trim();
    if (!cleanName) {
      setFormError('Configuration Type Name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        name: cleanName,
        prefix: typePrefixInput.trim().toUpperCase() || undefined,
        usesSizes: typeUsesSizesInput
      };

      if (editingTypeId) {
        await apiFetch(`/api/product-config-types/${editingTypeId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/api/product-config-types', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      setShowAddForm(false);
      await fetchConfigTypes();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save configuration type.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTypeActive = async (t: ProductConfigTypeMaster) => {
    try {
      await apiFetch(`/api/product-config-types/${t.id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !t.active })
      });
      await fetchConfigTypes();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err?.message || 'Failed to update configuration type status.');
    }
  };

  const handleDeleteType = async (t: ProductConfigTypeMaster) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate '${t.name}'?`)) return;
    try {
      const res = await apiFetch(`/api/product-config-types/${t.id}`, {
        method: 'DELETE'
      });
      if (res.message) alert(res.message);
      await fetchConfigTypes();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete configuration type.');
    }
  };

  const handleAddSize = async (typeId: string) => {
    const cleanSize = sizeInput.trim().toUpperCase();
    if (!cleanSize) {
      setSizeError('Size code is required.');
      return;
    }

    setSizeError(null);
    try {
      await apiFetch(`/api/product-config-types/${typeId}/sizes`, {
        method: 'POST',
        body: JSON.stringify({ sizeCode: cleanSize })
      });

      setSizeInput('');
      setAddingSizeForTypeId(null);
      await fetchConfigTypes();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setSizeError(err?.message || 'Failed to add size.');
    }
  };

  const handleToggleSizeActive = async (sizeId: string, currentActive: boolean) => {
    try {
      await apiFetch(`/api/product-config-types/sizes/${sizeId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !currentActive })
      });
      await fetchConfigTypes();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(err?.message || 'Failed to update size status.');
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalContent}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={22} color="var(--primary-teal)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Product Configuration Master Data
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Manage custom configuration types, prefixes, and size definitions stored in database.
              </p>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        {/* Action Bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-2)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Configured Master Types ({configTypes.length})
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAddForm}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px' }}
          >
            <Plus size={16} /> Add Configuration Type
          </button>
        </div>

        {/* Main Body */}
        <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw className="spin" size={28} style={{ color: 'var(--primary-teal)', marginBottom: '8px' }} />
              <div>Loading configuration master data...</div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#f87171', textAlign: 'center' }}>
              <AlertCircle size={24} style={{ marginBottom: '6px' }} />
              <div>{error}</div>
            </div>
          )}

          {/* Form to Add / Edit Type */}
          {showAddForm && (
            <form onSubmit={handleSaveType} style={styles.formCard}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--primary-teal)' }}>
                {editingTypeId ? 'Edit Configuration Type' : 'Add New Configuration Type'}
              </h4>

              {formError && (
                <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.85rem' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={styles.inputLabel}>Configuration Type Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. BODY or LEG"
                    value={typeNameInput}
                    onChange={e => setTypeNameInput(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={styles.inputLabel}>Barcode Prefix (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. PNTL or leave blank"
                    value={typePrefixInput}
                    onChange={e => setTypePrefixInput(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={styles.inputLabel}>Does this configuration use sizes?</label>
                <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="usesSizes"
                      checked={typeUsesSizesInput === true}
                      onChange={() => setTypeUsesSizesInput(true)}
                    />
                    Yes (Configuration requires size selection)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="usesSizes"
                      checked={typeUsesSizesInput === false}
                      onChange={() => setTypeUsesSizesInput(false)}
                    />
                    No (No sizes required)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddForm(false)}
                  style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                >
                  {isSubmitting ? 'Saving...' : 'Save Configuration Type'}
                </button>
              </div>
            </form>
          )}

          {/* Initial State / Empty State */}
          {!loading && !error && configTypes.length === 0 && !showAddForm && (
            <div style={styles.emptyCard}>
              <Layers size={44} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                No configuration types have been created yet.
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Create your first database-driven Product Configuration Type (such as BODY, LEG, or NUMERIC).
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenAddForm}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} /> Add Configuration Type
              </button>
            </div>
          )}

          {/* List of Configuration Types */}
          {!loading && !error && configTypes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {configTypes.map(t => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: t.active ? 'var(--bg-surface-2)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1.5px solid ${t.active ? 'var(--border-color)' : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: '14px',
                    padding: '16px',
                    opacity: t.active ? 1 : 0.65
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: t.active ? 'var(--primary-teal)' : 'var(--text-muted)' }}>
                          {t.name}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: t.active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: t.active ? '#10b981' : '#94a3b8'
                        }}>
                          {t.active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '14px' }}>
                        <span>Prefix: <strong style={{ color: 'var(--text-primary)' }}>{t.prefix || 'None'}</strong></span>
                        <span>Uses Sizes: <strong style={{ color: t.usesSizes ? 'var(--primary-teal)' : 'var(--text-muted)' }}>{t.usesSizes ? 'Yes' : 'No'}</strong></span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleOpenEditForm(t)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleToggleTypeActive(t)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem', color: t.active ? '#f87171' : '#10b981' }}
                      >
                        {t.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteType(t)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        title="Delete Configuration Type"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Sizes Section if Uses Sizes = YES */}
                  {t.usesSizes ? (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          Sizes for {t.name} ({t.sizes.filter(s => s.active).length} Active)
                        </span>

                        {addingSizeForTypeId !== t.id && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setAddingSizeForTypeId(t.id);
                              setSizeInput('');
                              setSizeError(null);
                            }}
                            style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Plus size={12} /> Add Size
                          </button>
                        )}
                      </div>

                      {/* Add Size Inline Form */}
                      {addingSizeForTypeId === t.id && (
                        <div style={{ marginBottom: '10px', padding: '8px 12px', backgroundColor: 'var(--bg-surface-1)', borderRadius: '10px', border: '1px solid var(--primary-teal)' }}>
                          {sizeError && (
                            <div style={{ fontSize: '0.78rem', color: '#f87171', marginBottom: '4px' }}>{sizeError}</div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="text"
                              className="input-field"
                              placeholder="e.g. SS, SM, SXX"
                              value={sizeInput}
                              onChange={e => setSizeInput(e.target.value)}
                              style={{ height: '32px', fontSize: '0.85rem' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleAddSize(t.id)}
                              style={{ padding: '4px 12px', fontSize: '0.78rem', height: '32px' }}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setAddingSizeForTypeId(null)}
                              style={{ padding: '4px 10px', fontSize: '0.78rem', height: '32px' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Size Badges */}
                      {t.sizes.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No sizes added yet. Click "+ Add Size" to create sizes for {t.name}.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {t.sizes.map(s => (
                            <span
                              key={s.id}
                              style={{
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                padding: '4px 10px',
                                borderRadius: '8px',
                                backgroundColor: s.active ? 'rgba(22, 184, 174, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                color: s.active ? 'var(--primary-teal)' : 'var(--text-muted)',
                                border: `1px solid ${s.active ? 'rgba(22, 184, 174, 0.3)' : 'var(--border-color)'}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              {s.sizeCode}
                              <button
                                type="button"
                                onClick={() => handleToggleSizeActive(s.id, s.active)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: s.active ? '#ef4444' : '#10b981', display: 'flex' }}
                                title={s.active ? 'Deactivate Size' : 'Activate Size'}
                              >
                                {s.active ? <X size={12} /> : <Plus size={12} />}
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Uses Sizes: No (This configuration does not require size selection).
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '16px'
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    width: '94%',
    maxWidth: '680px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
    position: 'relative',
    overflow: 'hidden'
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeBtn: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
    textTransform: 'uppercase'
  },
  formCard: {
    backgroundColor: 'var(--bg-surface-2)',
    border: '1.5px solid var(--primary-teal)',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '16px'
  },
  emptyCard: {
    padding: '36px 20px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '16px',
    border: '1px dashed var(--border-color)'
  }
};
