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
    if (opName === 'Box Transfer' || opName === 'BOX_TRANSFER') {
      navigate(route);
      return;
    }
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

  return (
    <div className="op-home-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Greeting Header */}
      <div style={styles.greetingRow} className="op-home-greeting-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-surface-2)',
            border: '2px solid var(--primary-teal)',
            color: 'var(--primary-teal)',
            fontWeight: 800,
            fontSize: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {currentUser?.avatarInitials || currentUser?.name?.charAt(0) || 'OP'}
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Good Morning,</span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentUser?.name || 'Operator'}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
              {(currentUser?.role || 'operator').toUpperCase()} • {currentUser?.lineId || 'Line 04'}
            </span>
          </div>
        </div>

        <div className="op-desktop-status-pill" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(24, 184, 121, 0.12)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(24, 184, 121, 0.3)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#18B879' }}></span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#18B879' }}>Shift A Active</span>
          </div>
          <ScannerStatus compact={true} />
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
            {/* CURRENT PRODUCTION ORDER Banner */}
            {(po || fetchedPoDetails) && (
              <div style={{
                backgroundColor: 'var(--bg-surface-1)',
                border: '1.5px solid var(--primary-teal)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
                    CURRENT PRODUCTION ORDER
                  </span>
                  <button
                    onClick={() => setPendingOperation({ name: 'Production Order', route: '#' })}
                    style={{
                      background: 'rgba(22, 184, 174, 0.15)',
                      border: '1px solid var(--primary-teal)',
                      borderRadius: '8px',
                      color: 'var(--primary-teal)',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '8px 14px',
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Change PO
                  </button>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {formatPoDisplayName({
                    poNumber: po?.id || po?.poNumber || fetchedPoDetails?.poNumber,
                    poName: po?.poName || fetchedPoDetails?.poName,
                    styleName: po?.styleName || fetchedPoDetails?.styleName
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={styles.cardSubTitle}>PRODUCTION OVERVIEW</span>
              <StatusPill label="LIVE DB DATA" variant="teal" />
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
              {/* Pre QC */}
              {selectedOps.includes('Pre QC') && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileTeal}
                  onClick={() => handleOpClick('Pre QC', '/operator/pre-qc')}
                >
                  <div style={styles.opIconTeal}>
                    <ScanLine size={26} color="var(--primary-teal)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>Pre QC</span>
                    <span className="op-card-desc" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Validate product barcode against PO configuration
                    </span>
                  </div>
                </button>
              )}

              {/* QC Test */}
              {selectedOps.includes('QC Test') && (
                <button
                  className="op-card-interactive"
                  style={styles.opTileGreen}
                  onClick={() => handleOpClick('QC Test', '/operator/qc')}
                >
                  <div style={styles.opIconGreen}>
                    <CheckCircle2 size={26} color="var(--color-green)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={styles.opTitle}>QC Test</span>
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
                    <Package size={26} color="var(--color-blue)" />
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
                    <Search size={26} color="var(--color-purple)" />
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
                  style={styles.opTileTeal}
                  onClick={() => handleOpClick('FINAL AQL', '/operator/final-aql/box')}
                >
                  <div style={styles.opIconTeal}>
                    <Search size={26} color="var(--primary-teal)" />
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
                    <ArrowLeftRight size={26} color="var(--color-orange)" />
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

      {/* ── Quick Search Modal ───────────────────────────────────── */}
      {showSearch && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: '480px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Quick Lookup</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Scan or type a product QR or box barcode</span>
              </div>
              <button style={styles.closeBtn} onClick={closeSearch}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            {/* Input */}
            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(searchQuery); }}
                placeholder="Type or scan QR code…"
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--primary-teal)',
                  backgroundColor: 'var(--bg-surface-2)',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  fontWeight: 700,
                  paddingLeft: '38px',
                  paddingRight: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  letterSpacing: '0.03em',
                }}
              />
            </div>

            {/* ── Result: Box Found ── */}
            {searchResult === 'box' && searchedBox && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BoxSelect size={18} color="var(--color-blue)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-blue)', textTransform: 'uppercase' }}>
                    Box Found
                  </span>
                </div>
                <div style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: '14px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{searchedBox.boxNumber}</span>
                    <StatusPill label={searchedBox.status === 'COMPLETED' ? 'Sealed' : 'Open'} variant={searchedBox.status === 'COMPLETED' ? 'green' : 'teal'} />
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    SO: {searchedBox.soId} • Capacity: {searchedBox.items.length}/{searchedBox.capacity} items
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Products inside ({searchedBox.items.length}):
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                      {searchedBox.items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-1)', borderRadius: '8px', padding: '8px 12px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={14} color="var(--primary-teal)" />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{item.qr}</span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.scannedAt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Result: Product Found in a Box ── */}
            {searchResult === 'product' && searchedProductBox && searchedProductItem && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} color="var(--color-green)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-green)', textTransform: 'uppercase' }}>Product Found</span>
                </div>
                <div style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1.5px solid rgba(16,185,129,0.3)', borderRadius: '14px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{searchedProductItem.qr}</span>
                    <StatusPill label="Packed ✅" variant="green" />
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Product</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{so?.product || 'Garment'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Packed In Box</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-blue)' }}>{searchedProductBox.boxNumber}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Scanned At</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{searchedProductItem.scannedAt}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <span>Sales Order</span>
                      <span style={{ fontWeight: 700, color: 'var(--primary-teal)' }}>{searchedProductBox.soId}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Result: In-range product but not packed yet ── */}
            {searchResult === 'product' && !searchedProductBox && (
              <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1.5px solid rgba(245,158,11,0.3)', borderRadius: '14px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Package size={16} color="#F59E0B" />
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>{searchQuery.trim()}</span>
                  <StatusPill label="Not Packed Yet" variant="amber" />
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  This barcode is in PO range but has not been packed into any box yet.
                </span>
              </div>
            )}

            {/* ── Not found ── */}
            {searchResult === 'not-found' && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                <X size={28} color="var(--color-red)" />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px' }}>Not Found</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  "{searchQuery}" is not a known box or packed product.
                </div>
              </div>
            )}

            {/* ── Empty state ── */}
            {!searchResult && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                <ScanLine size={40} />
                <div style={{ fontSize: '13px', marginTop: '10px' }}>Type a product QR or box number to look up</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Production Order Selection Modal ───────────────────── */}
      {pendingOperation && (
        <SelectPOForOperation
          operationName={pendingOperation.name as any}
          isModal={true}
          onClose={() => setPendingOperation(null)}
          onSelectPo={(selectedPo) => {
            setActiveJob({ productionOrder: selectedPo });
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
    borderColor: 'var(--border-light)'
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
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border-color)',
  },
  metricsRow2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '8px',
    marginTop: '8px',
  },
  metricBoxGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxDarkRed: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    border: '1px solid rgba(220, 38, 38, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxEmerald: {
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    border: '1px solid rgba(5, 150, 105, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBoxYellow: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    border: '1px solid rgba(217, 119, 6, 0.3)',
    borderRadius: '12px',
    padding: '10px 4px',
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
  opTileTeal: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(22, 184, 174, 0.08)',
    border: '1px solid rgba(22, 184, 174, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconTeal: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(22, 184, 174, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileGreen: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(24, 184, 121, 0.08)',
    border: '1px solid rgba(24, 184, 121, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconGreen: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(24, 184, 121, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileBlue: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(67, 133, 245, 0.08)',
    border: '1px solid rgba(67, 133, 245, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconBlue: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(67, 133, 245, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTilePurple: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    border: '1px solid rgba(139, 92, 246, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconPurple: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTileOrange: {
    height: '110px',
    borderRadius: '18px',
    backgroundColor: 'rgba(245, 158, 66, 0.08)',
    border: '1px solid rgba(245, 158, 66, 0.25)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  opIconOrange: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(245, 158, 66, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  opTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)'
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
