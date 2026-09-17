import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { ProductionOrder, SalesOrder } from '../../types';
import { CheckCircle2, Package, Search, ArrowLeftRight, X, ChevronRight, ScanLine, BoxSelect } from 'lucide-react';
import { apiFetch } from '../../services/api';
import '../../styles/tokens.css';

export const OperatorHome: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, activeJob, setActiveJob, productionOrders, packingBoxes, aqlSession } = useApp();

  const [pendingOperation, setPendingOperation] = useState<{ name: string; route: string } | null>(null);
  const [selectedPoForModal, setSelectedPoForModal] = useState<ProductionOrder | null>(null);

  // Live stats from database
  const [opStats, setOpStats] = useState({
    totalQcPassed: 0,
    packedCount: 0,
    aqlDoneCount: 0,
    qcFailCount: 0,
    aqlFailedCount: 0,
    totalFailCount: 0,
    aqlPassCount: 0,
    pendingPackCount: 0
  });

  const fetchStats = () => {
    fetch('/api/dashboard/operator', { cache: 'no-store' })
      .then(res => res.json())
      .then(res => {
        if (res) {
          setOpStats({
            totalQcPassed: Number(res.totalQcPassed ?? res.qcPassedToday ?? 0),
            packedCount: Number(res.packedCount ?? res.packedToday ?? 0),
            aqlDoneCount: Number(res.aqlDoneCount ?? 0),
            qcFailCount: Number(res.qcFailCount ?? 0),
            aqlFailedCount: Number(res.aqlFailedCount ?? 0),
            totalFailCount: Number(res.totalFailCount ?? (res.failCount ?? 0)),
            aqlPassCount: Number(res.aqlPassCount ?? 0),
            pendingPackCount: Number(res.pendingPackCount ?? res.pendingCount ?? 0)
          });
        }
      })
      .catch(err => {
        console.error('Failed to fetch operator stats:', err);
      });
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    window.addEventListener('focus', fetchStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchStats);
    };
  }, []);

  // Search / Quick Scan state
  const [showSearch, setShowSearch]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResult, setSearchResult] = useState<'box' | 'product' | 'not-found' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const po = activeJob?.productionOrder;
  const so = activeJob?.salesOrder;

  const handleOpClick = (opName: string, route: string) => {
    setSelectedPoForModal(null);
    setPendingOperation({ name: opName, route });
  };

  const handleSelectSoJob = (selectedSo: SalesOrder) => {
    if (!selectedPoForModal) return;

    const shift = selectedSo.shifts[0] || {
      id: 'shf-101',
      salesOrderId: selectedSo.id,
      workerId: currentUser.id,
      workerName: currentUser.name,
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

    // 3. Check product QR against active PO range
    const inRange = po?.boxRangeStart && po?.boxRangeEnd;
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

  const poQcPassed = productionOrders.reduce((sum, p) => 
    sum + (p.salesOrders || []).reduce((sSum, s) => sSum + (s.progress?.qcPassed || 0), 0), 0
  );
  const poPacked = productionOrders.reduce((sum, p) => 
    sum + (p.salesOrders || []).reduce((sSum, s) => sSum + (s.progress?.packed || 0), 0), 0
  );
  const poQcFailed = productionOrders.reduce((sum, p) => 
    sum + (p.salesOrders || []).reduce((sSum, s) => sSum + (s.progress?.qcFailed || 0), 0), 0
  );

  const displayTotalQcPassed = Math.max(opStats.totalQcPassed, poQcPassed);
  const displayPacked = Math.max(opStats.packedCount, poPacked);
  const displayQcFail = opStats.qcFailCount;
  const displayAqlDone = opStats.aqlDoneCount;
  const displayAqlPass = opStats.aqlPassCount;
  const displayAqlFail = opStats.aqlFailedCount;
  const displayTotalFail = opStats.totalFailCount || (displayQcFail + displayAqlFail);
  const displayPendingPack = Math.max(0, displayTotalQcPassed - displayPacked);

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
            {currentUser.avatarInitials || currentUser.name.charAt(0)}
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Good Morning,</span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentUser.name}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
              {currentUser.role.toUpperCase()} • {currentUser.lineId}
            </span>
          </div>
        </div>

        <div className="op-desktop-status-pill" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(24, 184, 121, 0.12)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(24, 184, 121, 0.3)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#18B879' }}></span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#18B879' }}>Shift A Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(34, 211, 197, 0.12)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(34, 211, 197, 0.3)' }}>
            <ScanLine size={14} color="var(--primary-teal)" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)' }}>Scanner Connected</span>
          </div>
        </div>
      </div>

      {/* 12-Column Desktop Grid Container */}
      <div className="desktop-grid-12">
        {/* Main Workspace (8 cols on desktop, 12 cols on mobile) */}
        <div className="desktop-col-8" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

          {/* Production Overview Card */}
          <div className="card" style={styles.poCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={styles.cardSubTitle}>PRODUCTION OVERVIEW</span>
              <StatusPill label="LIVE DB DATA" variant="teal" />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
              All Production Orders & Factory Live Metrics
            </h3>

            {/* Row 1 Metrics (6 items) */}
            <div style={styles.metricsRow1}>
              <div style={styles.metricBoxGreen}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{displayTotalQcPassed}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981', textAlign: 'center' }}>Total Product Count</span>
              </div>
              <div style={styles.metricBoxBlue}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#3B82F6' }}>{displayPacked}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#3B82F6', textAlign: 'center' }}>Packed</span>
              </div>
              <div style={styles.metricBoxPurple}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#8B5CF6' }}>{displayAqlDone}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#8B5CF6', textAlign: 'center' }}>AQL Done Count</span>
              </div>
              <div style={styles.metricBoxAmber}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#F59E0B' }}>{displayQcFail}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#F59E0B', textAlign: 'center' }}>QC Fail Count</span>
              </div>
              <div style={styles.metricBoxDarkRed}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626' }}>{displayAqlFail}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', textAlign: 'center' }}>AQL Failed Count</span>
              </div>
              <div style={styles.metricBoxRed}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>{displayTotalFail}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444', textAlign: 'center' }}>Total Fail Count</span>
              </div>
            </div>

            {/* Row 2 Metrics (2 items) */}
            <div style={styles.metricsRow2}>
              <div style={styles.metricBoxEmerald}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>{displayAqlPass}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textAlign: 'center' }}>AQL Pass Count</span>
              </div>
              <div style={styles.metricBoxYellow}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#D97706' }}>{displayPendingPack}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#D97706', textAlign: 'center' }}>Pending Pack Count</span>
              </div>
            </div>
          </div>

          {/* 4 Operation Action Tiles */}
          <div>
            <h4 style={styles.sectionHeader}>Operations</h4>
            <div className="op-ops-grid-2x2" style={styles.opsGrid}>
              {/* QC Test */}
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

              {/* Packing */}
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

              {/* AQL Checker */}
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
                    Perform AQL sample audits on sealed boxes
                  </span>
                </div>
              </button>

              {/* Box Transfer */}
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
            </div>
          </div>
        </div>

        {/* Right Sidebar (4 cols on desktop, hidden on mobile) */}
        <div className="desktop-col-4 op-desktop-sidebar">
          {/* Current Assignment Summary Card */}
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', letterSpacing: '0.05em' }}>
              CURRENT ASSIGNMENT
            </span>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
              {po?.id || 'PO-2026-904'}
            </h4>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {po?.customer || 'Brand Master'} • {so?.product || 'T-Shirt Classic'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #1E4650' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sales Order:</span>
                <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{so?.id || 'SO-77201'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Production Line:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Line 04</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Shift Assignment:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Shift A (06:00 - 14:00)</span>
              </div>
            </div>
          </div>

          {/* Scanner Status & Diagnostics */}
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(24, 184, 121, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={20} color="var(--color-green)" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Scanner Active</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>USB / Bluetooth Wedge</div>
              </div>
            </div>

            <button
              onClick={() => navigate('/test-scanner')}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: '#102F39',
                border: '1px solid #1E4650',
                color: 'var(--primary-teal)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ⚡ Run Diagnostic Test
            </button>
          </div>

          {/* Today's Shift Performance Summary */}
          <div className="card" style={{ backgroundColor: '#0B242D', border: '1px solid #1E4650' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              LINE 04 SHIFT METRICS
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#10B981' }}>
                  {displayTotalQcPassed ? Math.round((displayTotalQcPassed / Math.max(1, displayTotalQcPassed + displayTotalFail)) * 100) : 100}%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>First Pass Quality Yield</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                  {displayPacked}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cartons Completed</div>
              </div>
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

      {/* ── 2-Step PO → SO Selection Modal ───────────────────── */}
      {pendingOperation && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {!selectedPoForModal ? 'Step 1: Select Production Order (PO)' : 'Step 2: Select Sales Order (SO)'}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--primary-teal)', fontWeight: 600 }}>
                  For {pendingOperation.name} {!selectedPoForModal ? '' : `• PO: ${selectedPoForModal.id}`}
                </span>
              </div>
              <button style={styles.closeBtn} onClick={() => { setPendingOperation(null); setSelectedPoForModal(null); }}>
                <X size={20} color="var(--text-secondary)" />
              </button>
            </div>

            {/* Step 1: List POs */}
            {!selectedPoForModal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Assigned Production Orders ({productionOrders.length})
                </span>
                {productionOrders.map(p => {
                  const isCurrentActivePo = po?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPoForModal(p)}
                      style={{
                        backgroundColor: isCurrentActivePo ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-2)',
                        border: `1.5px solid ${isCurrentActivePo ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                        borderRadius: '12px',
                        padding: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-teal)' }}>
                            {p.id}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            • {p.customer}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Contains {p.salesOrders.length} Sales Order(s) • {p.remarks}
                        </div>
                      </div>
                      <ChevronRight size={22} color="var(--primary-teal)" />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Step 2: List SOs for selected PO */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Sales Orders in {selectedPoForModal.id} ({selectedPoForModal.salesOrders.length})
                  </span>
                  <button
                    onClick={() => setSelectedPoForModal(null)}
                    style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-teal)', textDecoration: 'underline' }}
                  >
                    ← Change PO
                  </button>
                </div>

                {selectedPoForModal.salesOrders.map(s => {
                  const isCurrentActiveSo = po?.id === selectedPoForModal.id && so?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSoJob(s)}
                      style={{
                        backgroundColor: isCurrentActiveSo ? 'rgba(22, 184, 174, 0.12)' : 'var(--bg-surface-2)',
                        border: `1.5px solid ${isCurrentActiveSo ? 'var(--primary-teal)' : 'var(--border-color)'}`,
                        borderRadius: '12px',
                        padding: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {s.product}
                          </span>
                          {isCurrentActiveSo && <StatusPill label="Active" variant="teal" />}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <span style={{ color: 'var(--primary-teal)', fontWeight: 700 }}>{s.id}</span> • {s.colour} ({s.sizeRange}) • Qty: {s.quantity}
                        </div>
                      </div>
                      <ChevronRight size={22} color="var(--primary-teal)" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
