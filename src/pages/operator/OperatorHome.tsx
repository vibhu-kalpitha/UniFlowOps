import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ScannerStatus } from '../../components/ScannerStatus';
import { SelectPOForOperation } from '../../components/SelectPOForOperation';
import { ProductionOrder, SalesOrder, OperationType } from '../../types';
import { CheckCircle2, Package, Search, ArrowLeftRight, X, ChevronRight, ScanLine, BoxSelect, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { formatPoDisplayName } from '../../utils/formatters';
import { DueDateBadge } from '../../components/DueDateBadge';
import { CodeLifecycleModal } from '../../components/CodeLifecycleModal';
import '../../styles/tokens.css';

export const OperatorHome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, activeJob, setActiveJob, productionOrders, packingBoxes, aqlSession, scannerConnected, setScannerConnected, showToast } = useApp();

  const [pendingOperation, setPendingOperation] = useState<{ name: OperationType | string; route: string } | null>(null);
  const [selectedPoForModal, setSelectedPoForModal] = useState<ProductionOrder | null>(null);

  const [fetchedPoDetails, setFetchedPoDetails] = useState<any>(null);

  // Live stats from database
  const [opStats, setOpStats] = useState({
    targetQuantity: 500,
    preQcPassedCount: 0,
    preQcFailedCount: 0,
    qcPassedCount: 0,
    qcFailedCount: 0,
    packedCount: 0,
    pendingPackCount: 0,
    aqlPassCount: 0,
    aqlFailedCount: 0,
    finalAqlPassCount: 0,
    finalAqlFailedCount: 0
  });

  const targetPoId = activeJob?.productionOrder?.id;

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!currentUser) return;
    const url = targetPoId ? `/api/dashboard/operator?poId=${encodeURIComponent(targetPoId)}` : '/api/dashboard/operator';
    try {
      const res = await apiFetch<any>(url);
      if (res) {
        setFetchError(null);
        setOpStats({
          targetQuantity: Number(res.targetQuantity ?? res.poDetails?.targetQuantity ?? 500),
          preQcPassedCount: Number(res.preQcPassedCount ?? 0),
          preQcFailedCount: Number(res.preQcFailedCount ?? 0),
          qcPassedCount: Number(res.qcPassedCount ?? res.totalQcPassed ?? 0),
          qcFailedCount: Number(res.qcFailedCount ?? res.qcFailCount ?? 0),
          packedCount: Number(res.packedCount ?? res.packedToday ?? 0),
          pendingPackCount: Number(res.pendingPackCount ?? res.pendingCount ?? 0),
          aqlPassCount: Number(res.aqlPassCount ?? 0),
          aqlFailedCount: Number(res.aqlFailedCount ?? 0),
          finalAqlPassCount: Number(res.finalAqlPassCount ?? 0),
          finalAqlFailedCount: Number(res.finalAqlFailedCount ?? 0)
        });
        if (res.poDetails) {
          setFetchedPoDetails(res.poDetails);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch operator stats via apiFetch:', err);
      setFetchError(err.message || 'Failed to load live operator metrics');
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    window.addEventListener('focus', fetchStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchStats);
    };
  }, [targetPoId, currentUser?.id]);

  // Search / Quick Scan state
  const [showSearch, setShowSearch]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResult, setSearchResult] = useState<'box' | 'product' | 'not-found' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const selectedOps = po?.selectedOperations || ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'FINAL AQL', 'Box Transfer'];

  const handleOpClick = (opName: OperationType | string, route: string) => {
    setPendingOperation({ name: opName, route });
  };

  const handleSelectSoJob = (selectedSo: SalesOrder) => {
    if (!selectedPoForModal) return;

    const shift = selectedSo.shifts[0] || {
      id: 'shf-101',
      salesOrderId: selectedSo.id,
      workerId: currentUser?.id || 'op-001',
      workerName: currentUser?.name || 'Operator',
      startTime: '14:00',
      endTime: '18:00',
      date: new Date().toISOString().split('T')[0],
      enabledOperations: ['QC Test', 'Packing', 'AQL Checker', 'Box Transfer']
    };

    setActiveJob({
      productionOrder: selectedPoForModal,
      salesOrder: selectedSo,
      shift
    });

    const route = pendingOperation?.route || '/operator/qc';
    setPendingOperation(null);
    setSelectedPoForModal(null);
    navigate(route);
  };

  /* ── Quick Search / Scan lookup ─────────────────────────────── */
  const openSearch = () => {
    setShowSearch(true);
    setSearchQuery('');
    setSearchResult(null);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResult(null);
  };

  const handleSearch = (query: string) => {
    const q = query.trim();
    if (!q) { setSearchResult(null); return; }

    // 1. Check if it's a box number
    const foundBox = packingBoxes[q];
    if (foundBox) {
      setSearchResult('box');
      return;
    }

    // 2. Check if it's a product QR inside any box
    const matchedBox = Object.values(packingBoxes).find(b =>
      b.items.some(i => i.qr.toUpperCase() === q.toUpperCase())
    );
    if (matchedBox) {
      setSearchResult('product');
      return;
    }

    // 3. Check product QR against active SO product range
    const inRange = so?.productQrPrefix && so?.productSerialStart != null && so?.productSerialEnd != null;
    if (inRange) {
      setSearchResult('product');
      return;
    }

    setSearchResult('not-found');
  };

  const searchedBox    = searchQuery ? packingBoxes[searchQuery.trim()] : null;
  const searchedProductBox = searchQuery
    ? Object.values(packingBoxes).find(b =>
        b.items.some(i => i.qr.toUpperCase() === searchQuery.trim().toUpperCase())
      )
    : null;
  const searchedProductItem = searchedProductBox
    ? searchedProductBox.items.find(i => i.qr.toUpperCase() === searchQuery.trim().toUpperCase())
    : null;

  const getDynamicGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  const activeCustomer = po?.customer || fetchedPoDetails?.customer || '';
  const activeStyle = po?.styleName || po?.styleCode || fetchedPoDetails?.styleName || 'Standard Style';
  const activePoNum = po?.id || po?.poNumber || fetchedPoDetails?.poNumber || '';
  const activePoName = po?.poName || fetchedPoDetails?.poName || '';
  const activeSo = so?.mapSo || (so as any)?.map_so || (po as any)?.mapPo || (po as any)?.map_po || fetchedPoDetails?.soName || fetchedPoDetails?.mapPo || '';

  // Parse structured username (e.g. UPLP52A -> Plant: UPLP, Line: 52, Shift: A)
  const parseUsernameDetails = (raw?: string) => {
    if (!raw) return null;
    const clean = raw.trim().toUpperCase();
    const match = clean.match(/^([A-Z]{2,})(\d+)([A-Z])$/);
    if (!match) return null;
    return {
      plant: match[1],
      line: match[2],
      shift: match[3],
    };
  };

  const parsedOperatorInfo = parseUsernameDetails(currentUser?.username || currentUser?.employeeNo);

  return (
    <div className="op-home-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Greeting Header */}
      <div style={{ ...styles.greetingRow, padding: '4px 0', border: 'none', background: 'transparent' }} className="op-home-greeting-bar">
        <div>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {getDynamicGreeting()} Operator
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0' }}>
              {currentUser?.name || 'Operator'}
            </h2>
            {parsedOperatorInfo && (
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(20, 184, 166, 0.12)',
                border: '1.5px solid rgba(20, 184, 166, 0.35)',
                borderRadius: '8px',
                padding: '2px 10px',
              }}>
                <span style={{ color: 'var(--primary-teal)' }}>Line {parsedOperatorInfo.line}</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#10B981' }}>Shift {parsedOperatorInfo.shift}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 12-Column Desktop Grid Container */}
      <div className="desktop-grid-12">
        {/* Main Workspace (Full 12 cols) */}
        <div className="desktop-col-12" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search / Quick Scan Bar */}
          <button
            onClick={openSearch}
            style={styles.searchBar}
            id="home-search-bar"
          >
            <Search size={16} color="var(--text-secondary)" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', flex: 1, textAlign: 'left' }}>
              Search product or scan box QR…
            </span>
            <ScanLine size={16} color="var(--text-secondary)" />
          </button>

          {fetchError && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '12px',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={18} />
              <span style={{ fontWeight: 700, fontSize: '13px' }}>
                Failed to update live metrics: {fetchError}
              </span>
            </div>
          )}

          {/* Production Overview Card */}
          <div className="card" style={styles.poCard}>
            {/* Active Production Order Card (Compact Size) */}
            {(po || fetchedPoDetails) && (
              <div style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--primary-teal)',
                borderRadius: '8px',
                padding: '6px 10px',
                marginBottom: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                {/* Top Row: Customer Name and Change PO Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  {activeCustomer ? (
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-teal, #14b8a6)', letterSpacing: '0.01em', lineHeight: 1.1 }}>
                      {activeCustomer}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Active Production Order
                    </div>
                  )}
                  <button
                    onClick={() => setPendingOperation({ name: 'Production Order', route: '#' })}
                    style={{
                      background: 'rgba(22, 184, 174, 0.15)',
                      border: '1px solid var(--primary-teal)',
                      borderRadius: '6px',
                      color: 'var(--primary-teal)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 8px',
                      minHeight: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}
                  >
                    Change PO
                  </button>
                </div>

                {/* Second Row: Style, PO, SO, Line & Due Date in a single compact row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px 8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 700, color: '#ffffff' }}>{activeStyle}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span>PO: <strong style={{ color: '#ffffff' }}>{activePoNum}</strong></span>
                  {activeSo && (
                    <>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span>SO: <strong style={{ color: '#ffffff' }}>{activeSo}</strong></span>
                    </>
                  )}
                  {activeJob?.selectedLine && (
                    <>
                      <span style={{ opacity: 0.5 }}>•</span>
                      <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>
                        {activeJob.selectedLine}
                      </span>
                    </>
                  )}
                  <span style={{ opacity: 0.5 }}>•</span>
                  <DueDateBadge dueDate={po?.dueDate || (po as any)?.due_date || fetchedPoDetails?.dueDate} compact={true} noBox={true} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={styles.cardSubTitle}>PRODUCTION OVERVIEW</span>
            </div>

            {!(po || fetchedPoDetails) && (
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                All Production Orders & Factory Live Metrics
              </h3>
            )}

            {/* Metrics Wrapper */}
            <div className="op-metrics-wrapper" style={{ marginTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                {/* Total QTY */}
                <div style={styles.metricBoxGreen} className="op-metric-box">
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{opStats.targetQuantity}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', textAlign: 'center' }}>Total QTY</span>
                </div>

                {/* Pre-QC */}
                <div style={{ ...styles.metricBoxGreen, backgroundColor: 'rgba(20, 184, 166, 0.12)', borderColor: 'rgba(20, 184, 166, 0.3)' }} className="op-metric-box">
                  <div style={{ display: 'flex', gap: '8px', fontSize: '15px', fontWeight: 800 }}>
                    <span style={{ color: '#10B981', whiteSpace: 'nowrap' }}>P: {opStats.preQcPassedCount}</span>
                    <span style={{ color: '#EF4444', whiteSpace: 'nowrap' }}>F: {opStats.preQcFailedCount}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#14B8A6', textAlign: 'center' }}>Pre-QC</span>
                </div>

                {/* QC Test */}
                <div style={styles.metricBoxGreen} className="op-metric-box">
                  <div style={{ display: 'flex', gap: '8px', fontSize: '15px', fontWeight: 800 }}>
                    <span style={{ color: '#10B981', whiteSpace: 'nowrap' }}>P: {opStats.qcPassedCount}</span>
                    <span style={{ color: '#EF4444', whiteSpace: 'nowrap' }}>F: {opStats.qcFailedCount}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', textAlign: 'center' }}>QC Test</span>
                </div>

                {/* Packing */}
                <div style={styles.metricBoxBlue} className="op-metric-box">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#3B82F6', whiteSpace: 'nowrap' }}>Pack: {opStats.packedCount}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#60A5FA', whiteSpace: 'nowrap' }}>Rem: {opStats.pendingPackCount}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#3B82F6', textAlign: 'center', marginTop: '2px' }}>Packing</span>
                </div>

                {/* Normal AQL */}
                <div style={styles.metricBoxPurple} className="op-metric-box">
                  <div style={{ display: 'flex', gap: '8px', fontSize: '15px', fontWeight: 800 }}>
                    <span style={{ color: '#10B981', whiteSpace: 'nowrap' }}>P: {opStats.aqlPassCount}</span>
                    <span style={{ color: '#EF4444', whiteSpace: 'nowrap' }}>F: {opStats.aqlFailedCount}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#8B5CF6', textAlign: 'center' }}>Normal AQL</span>
                </div>

                {/* Final AQL */}
                <div style={styles.metricBoxEmerald} className="op-metric-box">
                  <div style={{ display: 'flex', gap: '8px', fontSize: '15px', fontWeight: 800 }}>
                    <span style={{ color: '#10B981', whiteSpace: 'nowrap' }}>P: {opStats.finalAqlPassCount}</span>
                    <span style={{ color: '#EF4444', whiteSpace: 'nowrap' }}>F: {opStats.finalAqlFailedCount}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', textAlign: 'center' }}>Final AQL</span>
                </div>
              </div>
            </div>
          </div>

          {/* Operation Action Tiles */}
          <div>
            <h4 style={styles.sectionHeader}>Operations</h4>
            <div className="op-ops-grid-2x2" style={styles.opsGrid}>
              {/* Inline (Pre QC) */}
              {(selectedOps.includes('Pre QC') || selectedOps.includes('Inline')) && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileCyan}
                  onClick={() => handleOpClick('Inline', '/operator/pre-qc')}
                >
                  <div style={styles.opIconCyan}>
                    <ScanLine size={26} color="#06B6D4" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>Inline</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Validate product barcode against PO configuration
                    </span>
                  </div>
                </button>
              )}

              {/* Endline (QC Test) */}
              {(selectedOps.includes('QC Test') || selectedOps.includes('Endline') || selectedOps.includes('QC')) && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileIndigo}
                  onClick={() => handleOpClick('Endline', '/operator/qc')}
                >
                  <div style={styles.opIconIndigo}>
                    <CheckCircle2 size={26} color="#818CF8" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>Endline</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Inspect product quality & validate barcode ranges
                    </span>
                  </div>
                </button>
              )}

              {/* Packing */}
              {selectedOps.includes('Packing') && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileBlue}
                  onClick={() => handleOpClick('Packing', '/operator/packing')}
                >
                  <div style={styles.opIconBlue}>
                    <Package size={26} color="#3B82F6" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>Packing</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Pack passed items into box & seal shipping cartons
                    </span>
                  </div>
                </button>
              )}

              {/* AQL Checker */}
              {(selectedOps.includes('AQL Checker') || selectedOps.includes('AQL')) && (
                <button
                  className="op-card-interactive"
                  style={styles.opTilePurple}
                  onClick={() => handleOpClick('AQL Checker', '/operator/aql/box')}
                >
                  <div style={styles.opIconPurple}>
                    <Search size={26} color="#A855F7" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>AQL Checker</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Perform Normal AQL sample audits on sealed boxes
                    </span>
                  </div>
                </button>
              )}

              {/* FINAL AQL */}
              {(selectedOps.includes('FINAL AQL') || selectedOps.includes('FINAL_AQL') || selectedOps.includes('Final AQL')) && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileRose}
                  onClick={() => handleOpClick('FINAL AQL', '/operator/final-aql/box')}
                >
                  <div style={styles.opIconRose}>
                    <Search size={26} color="#FB7185" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>FINAL AQL</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Perform Final AQL inspection on packed boxes
                    </span>
                  </div>
                </button>
              )}

              {/* Box Transfer */}
              {selectedOps.includes('Box Transfer') && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileOrange}
                  onClick={() => handleOpClick('Box Transfer', '/operator/transfer')}
                >
                  <div style={styles.opIconOrange}>
                    <ArrowLeftRight size={26} color="#FB923C" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>Box Transfer</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Transfer completed boxes to warehouse shipping
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Search / Scan Lifecycle Modal ───────────────────── */}
      <CodeLifecycleModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentPoId={activeJob?.productionOrder?.id}
      />

      {/* ── Production Order Selection Modal ───────────────────── */}
      {pendingOperation && (
        <SelectPOForOperation
          operationName={pendingOperation.name as any}
          isModal={true}
          onClose={() => setPendingOperation(null)}
          onSelectPo={(selectedPo, selectedLine) => {
            setActiveJob({ productionOrder: selectedPo, selectedLine });
            const targetRoute = pendingOperation.route;
            setPendingOperation(null);
            navigate(targetRoute);
          }}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  greetingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '11px 14px',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-surface-1)',
    border: '1.5px solid var(--border-color)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'border-color 0.2s',
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid'
  },
  changeBtn: {
    padding: '4px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-primary)'
  },
  poCard: {
    backgroundColor: 'var(--bg-surface-2)',
    borderColor: 'var(--border-light)',
    padding: '8px 10px',
  },
  cardSubTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    letterSpacing: '0.05em'
  },
  poNumber: {
    fontSize: '22px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    marginTop: '2px'
  },
  metricsRow1: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))',
    gap: '6px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid var(--border-color)',
  },
  metricsRow2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '6px',
    marginTop: '6px',
  },
  metricBoxGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    border: '1.5px solid rgba(16, 185, 129, 0.45)',
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    border: '1.5px solid rgba(59, 130, 246, 0.45)',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    border: '1.5px solid rgba(139, 92, 246, 0.45)',
    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    border: '1.5px solid rgba(245, 158, 11, 0.45)',
    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxDarkRed: {
    backgroundColor: 'rgba(220, 38, 38, 0.16)',
    border: '1.5px solid rgba(220, 38, 38, 0.45)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    border: '1.5px solid rgba(239, 68, 68, 0.45)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxEmerald: {
    backgroundColor: 'rgba(5, 150, 105, 0.16)',
    border: '1.5px solid rgba(5, 150, 105, 0.45)',
    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxYellow: {
    backgroundColor: 'rgba(217, 119, 6, 0.16)',
    border: '1.5px solid rgba(217, 119, 6, 0.45)',
    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.12)',
    borderRadius: '10px',
    padding: '7px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: '15px',
    fontWeight: 700,
    marginBottom: '10px',
    color: 'var(--text-primary)'
  },
  opsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  opTileCyan: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.20) 0%, rgba(6, 182, 212, 0.05) 100%)',
    border: '1.5px solid rgba(6, 182, 212, 0.55)',
    boxShadow: '0 4px 18px rgba(6, 182, 212, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconCyan: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(6, 182, 212, 0.22)',
    border: '1px solid rgba(6, 182, 212, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileIndigo: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.20) 0%, rgba(99, 102, 241, 0.05) 100%)',
    border: '1.5px solid rgba(99, 102, 241, 0.55)',
    boxShadow: '0 4px 18px rgba(99, 102, 241, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconIndigo: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
    border: '1px solid rgba(99, 102, 241, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileBlue: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.20) 0%, rgba(59, 130, 246, 0.05) 100%)',
    border: '1.5px solid rgba(59, 130, 246, 0.55)',
    boxShadow: '0 4px 18px rgba(59, 130, 246, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconBlue: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
    border: '1px solid rgba(59, 130, 246, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTilePurple: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.20) 0%, rgba(168, 85, 247, 0.05) 100%)',
    border: '1.5px solid rgba(168, 85, 247, 0.55)',
    boxShadow: '0 4px 18px rgba(168, 85, 247, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconPurple: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    border: '1px solid rgba(168, 85, 247, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileRose: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.20) 0%, rgba(244, 63, 94, 0.05) 100%)',
    border: '1.5px solid rgba(244, 63, 94, 0.55)',
    boxShadow: '0 4px 18px rgba(244, 63, 94, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconRose: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(244, 63, 94, 0.22)',
    border: '1px solid rgba(244, 63, 94, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileOrange: {
    height: '110px',
    borderRadius: '16px',
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.20) 0%, rgba(249, 115, 22, 0.05) 100%)',
    border: '1.5px solid rgba(249, 115, 22, 0.55)',
    boxShadow: '0 4px 18px rgba(249, 115, 22, 0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  opIconOrange: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(249, 115, 22, 0.22)',
    border: '1px solid rgba(249, 115, 22, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTitle: {
    fontSize: '15px',
    fontWeight: 800,
    color: '#FFFFFF'
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '8px 0'
  },
  statCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  statDivider: {
    width: '1px',
    height: '36px',
    backgroundColor: 'var(--border-color)'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'var(--bg-surface-1)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '20px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};
