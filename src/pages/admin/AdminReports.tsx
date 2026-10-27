import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Download,
  FileSpreadsheet,
  Printer,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Package,
  Layers,
  ArrowLeftRight,
  FileText,
  Box,
  Trash2,
  Activity,
  Search,
  X,
  Palette,
  ShieldCheck,
  ClipboardCheck,
  Calendar
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const AdminReports: React.FC = () => {
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'Today' | 'Week' | 'Month' | 'All'>('Today');
  const [reportData, setReportData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('');
  const [selectedPoFilter, setSelectedPoFilter] = useState<string>('');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Operational inspection tabs state: styles, orders, qc, boxes, aql, preqc, scrapped
  const [activeLogTab, setActiveLogTab] = useState<'styles' | 'orders' | 'qc' | 'boxes' | 'aql' | 'preqc' | 'scrapped'>('styles');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBoxModal, setSelectedBoxModal] = useState<any>(null);
  const [boxToDelete, setBoxToDelete] = useState<any | null>(null);
  const [deletingBox, setDeletingBox] = useState<boolean>(false);

  // Generic Row Delete Confirmation Modal
  const [genericDeleteModal, setGenericDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    details?: { label: string; value: string }[];
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isDeletingGeneric, setIsDeletingGeneric] = useState<boolean>(false);

  // Pagination / Row limit state (initial 10 rows with See More)
  const [showAllOrders, setShowAllOrders] = useState<boolean>(false);
  const [showAllBoxes, setShowAllBoxes] = useState<boolean>(false);

  const confirmDeleteBox = async () => {
    if (!boxToDelete) return;
    setDeletingBox(true);
    try {
      await apiFetch(`/api/boxes/${encodeURIComponent(boxToDelete.id)}`, { method: 'DELETE' });
      setAdminData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          adminBoxes: Array.isArray(prev.adminBoxes) ? prev.adminBoxes.filter((b: any) => b.id !== boxToDelete.id) : []
        };
      });
      showToast(`Box ${boxToDelete.boxCode || boxToDelete.boxNumber} deleted successfully.`, 'success');
      setBoxToDelete(null);
      await fetchReports();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete box.', 'error');
    } finally {
      setDeletingBox(false);
    }
  };

  // Item-wise delete from Box Content Detail modal
  const handleRemoveBoxItem = async (boxId: string, qrCode: string) => {
    if (!window.confirm(`Are you sure you want to remove item '${qrCode}' from this box?`)) {
      return;
    }
    try {
      await apiFetch(`/api/boxes/${encodeURIComponent(boxId)}/items/${encodeURIComponent(qrCode)}`, { method: 'DELETE' });
      showToast(`Item '${qrCode}' removed from box.`, 'success');

      setSelectedBoxModal((prev: any) => {
        if (!prev) return prev;
        const updatedQrs = (prev.productQrs || []).filter((q: string) => q !== qrCode);
        const updatedItems = (prev.items || []).filter((i: any) => (i.qr_code || i.qr) !== qrCode);
        return {
          ...prev,
          productQrs: updatedQrs,
          items: updatedItems,
          activeFilledCount: Math.max(0, (prev.activeFilledCount || 1) - 1),
          remainingCapacity: Math.min(prev.capacity, (prev.remainingCapacity || 0) + 1)
        };
      });

      setAdminData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          adminBoxes: (prev.adminBoxes || []).map((b: any) => {
            if (b.id !== boxId) return b;
            const updatedQrs = (b.productQrs || []).filter((q: string) => q !== qrCode);
            const updatedItems = (b.items || []).filter((i: any) => (i.qr_code || i.qr) !== qrCode);
            return {
              ...b,
              productQrs: updatedQrs,
              items: updatedItems,
              activeFilledCount: Math.max(0, (b.activeFilledCount || 1) - 1),
              remainingCapacity: Math.min(b.capacity, (b.remainingCapacity || 0) + 1)
            };
          })
        };
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to remove item from box.', 'error');
    }
  };

  // Row Delete Actions for Tabs
  const handleDeleteStyle = (style: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Style?',
      description: `Are you sure you want to delete style '${style.name} (${style.code})'? Any linked production orders will be unlinked.`,
      details: [
        { label: 'Style Name', value: style.name },
        { label: 'Style Code', value: style.code || 'N/A' },
        { label: 'Linked POs', value: `${style.po_count || 0} orders` }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/styles/${encodeURIComponent(style.id)}?force=true`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            adminStyles: (prev.adminStyles || []).filter((s: any) => s.id !== style.id)
          };
        });
        showToast(`Style '${style.name}' deleted successfully.`, 'success');
        await fetchReports();
      }
    });
  };

  const handleDeleteOrder = (order: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Production Order?',
      description: `Are you sure you want to permanently delete Production Order '${order.po_number}'?`,
      details: [
        { label: 'PO Number', value: order.po_number },
        { label: 'Style', value: order.style_name || 'Standard' },
        { label: 'Target Qty', value: `${order.total_quantity || 0} pcs` }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeProductionOrders: (prev.activeProductionOrders || []).filter((o: any) => o.id !== order.id)
          };
        });
        showToast(`Production Order '${order.po_number}' deleted.`, 'success');
        await fetchReports();
      }
    });
  };

  const handleDeleteQcLog = (qc: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete QC Inspection Record?',
      description: `Are you sure you want to remove this QC record for garment '${qc.item_qr}'?`,
      details: [
        { label: 'Item Barcode', value: qc.item_qr },
        { label: 'PO Number', value: qc.po_number || 'N/A' },
        { label: 'QC Result', value: `${qc.qc_result || 'N/A'} / ${qc.test_result || 'N/A'}` }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/qc-logs/${encodeURIComponent(qc.id)}`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            qcLogs: (prev.qcLogs || []).filter((q: any) => q.id !== qc.id)
          };
        });
        showToast(`QC record for '${qc.item_qr}' deleted.`, 'success');
      }
    });
  };

  const handleDeletePreQcLog = (pq: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Pre-QC Validation Record?',
      description: `Are you sure you want to remove this Pre-QC record for garment '${pq.item_qr}'?`,
      details: [
        { label: 'Item Barcode', value: pq.item_qr },
        { label: 'PO Number', value: pq.po_number || 'N/A' },
        { label: 'Pre-QC Result', value: pq.pre_qc_result || 'PASS' }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/pre-qc-logs/${encodeURIComponent(pq.id)}`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            preQcLogs: (prev.preQcLogs || []).filter((p: any) => p.id !== pq.id)
          };
        });
        showToast(`Pre-QC record for '${pq.item_qr}' deleted.`, 'success');
      }
    });
  };

  const handleDeleteAqlLog = (aql: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete AQL Inspection Record?',
      description: `Are you sure you want to delete this AQL inspection for Box '${aql.box_code || aql.box_number || aql.id}'?`,
      details: [
        { label: 'Box Identifier', value: aql.box_code || aql.box_number || 'N/A' },
        { label: 'PO Number', value: aql.po_number || 'N/A' },
        { label: 'AQL Result', value: aql.result || 'PENDING' }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/aql-logs/${encodeURIComponent(aql.id)}`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            aqlLogs: (prev.aqlLogs || []).filter((a: any) => a.id !== aql.id)
          };
        });
        showToast('AQL inspection record deleted.', 'success');
      }
    });
  };

  const handleDeleteScrapped = (scrapped: any) => {
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Scrapped Item Record?',
      description: `Are you sure you want to remove item '${scrapped.item_qr}' from the scrap registry?`,
      details: [
        { label: 'Item Barcode', value: scrapped.item_qr },
        { label: 'Reason', value: scrapped.reason || 'Damaged' },
        { label: 'PO / Box', value: scrapped.po_number || scrapped.box_id || 'N/A' }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/scrapped/${encodeURIComponent(scrapped.id)}`, { method: 'DELETE' });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            recentScrapped: (prev.recentScrapped || []).filter((s: any) => s.id !== scrapped.id)
          };
        });
        showToast(`Scrapped item record '${scrapped.item_qr}' deleted.`, 'success');
      }
    });
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (selectedStyleFilter) qParams.set('styleName', selectedStyleFilter);
      if (selectedPoFilter) qParams.set('poId', selectedPoFilter);
      const queryStr = qParams.toString() ? `?${qParams.toString()}` : '';

      const [repRes, admRes] = await Promise.all([
        apiFetch(`/api/reports/production?range=${timeRange.toLowerCase()}`),
        apiFetch(`/api/dashboard/admin${queryStr}`)
      ]);
      setReportData(repRes);
      setAdminData(admRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [timeRange, selectedStyleFilter, selectedPoFilter]);

  const rawPoBreakdown: any[] = reportData?.poBreakdown || [];
  const availableStyles: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.styleName).filter(Boolean)));
  const availablePos: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.poNumber).filter(Boolean)));

  const filteredOrders = rawPoBreakdown.filter(p => {
    if (selectedStyleFilter && p.styleName !== selectedStyleFilter) return false;
    if (selectedPoFilter && p.poNumber !== selectedPoFilter && p.poId !== selectedPoFilter) return false;
    return true;
  });

  // Operational logs data from admin API
  const activeOrders: any[] = adminData?.activeProductionOrders || [];
  const adminBoxes: any[] = adminData?.adminBoxes || [];
  const recentAuditLogs: any[] = adminData?.recentAuditLogs || [];
  const recentScrapped: any[] = adminData?.recentScrapped || [];
  const kpis = adminData?.kpis || {
    plannedQuantity: 0,
    qcPassed: 0,
    qcFailed: 0,
    packedQuantity: 0,
    aqlPassed: 0,
    aqlFailed: 0
  };

  const totalQc = kpis.qcPassed + kpis.qcFailed;
  const qcPassRate = totalQc > 0 ? Math.round((kpis.qcPassed / totalQc) * 100) : 100;
  const totalAql = kpis.aqlPassed + kpis.aqlFailed;
  const aqlPassRate = totalAql > 0 ? Math.round((kpis.aqlPassed / totalAql) * 100) : 100;
  const qualityRates = {
    qcPassRate,
    testPassRate: 100,
    aqlPassRate,
    totalQc,
    passQc: kpis.qcPassed,
    totalAql,
    passAql: kpis.aqlPassed
  };
  const exceptions = {
    qcFailed: kpis.qcFailed,
    testFailed: 0,
    aqlFailed: kpis.aqlFailed,
    pendingPack: Math.max(0, kpis.qcPassed - kpis.packedQuantity)
  };

  const rawAdminStyles: any[] = adminData?.adminStyles || [];
  const rawQcLogs: any[] = adminData?.qcLogs || [];
  const rawAqlLogs: any[] = adminData?.aqlLogs || [];
  const rawPreQcLogs: any[] = adminData?.preQcLogs || [];
  const availableLines: string[] = adminData?.filter?.availableLines || [];

  // Inspection section multi-attribute filter helper
  const matchesInspectionFilters = (item: any) => {
    const itemStyle = (item.style_name || item.styleName || item.name || '').toLowerCase();
    const itemPo = (item.po_number || item.poNumber || item.po_name || '').toLowerCase();
    const itemLine = (item.line_name || item.lineName || item.line || item.line_number || '').toLowerCase();
    const rawDate = item.scanned_at || item.created_at || item.started_at || item.completed_at || item.removed_at || item.date || '';
    const itemDate = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : '';

    if (selectedStyleFilter && itemStyle && !itemStyle.includes(selectedStyleFilter.toLowerCase())) return false;
    if (selectedPoFilter && itemPo && !itemPo.includes(selectedPoFilter.toLowerCase())) return false;
    if (selectedLineFilter && (!itemLine || !itemLine.includes(selectedLineFilter.toLowerCase()))) return false;
    if (selectedDateFilter && itemDate && itemDate !== selectedDateFilter) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const str = JSON.stringify(item).toLowerCase();
      if (!str.includes(term)) return false;
    }

    return true;
  };

  const filteredStyles = rawAdminStyles.filter(matchesInspectionFilters);
  const filteredActiveOrders = activeOrders.filter(matchesInspectionFilters);
  const filteredQcLogs = rawQcLogs.filter(matchesInspectionFilters);
  const filteredBoxes = adminBoxes.filter(matchesInspectionFilters);
  const filteredAqlLogs = rawAqlLogs.filter(matchesInspectionFilters);
  const filteredPreQcLogs = rawPreQcLogs.filter(matchesInspectionFilters);
  const filteredScrapped = recentScrapped.filter(matchesInspectionFilters);

  // Summary Metrics Calculation
  const totalPlanned = filteredOrders.reduce((sum, p) => sum + (p.targetQuantity || 0), 0);
  const totalQcPassed = filteredOrders.reduce((sum, p) => sum + (p.qcPassed || 0), 0);
  const totalQcFailed = filteredOrders.reduce((sum, p) => sum + (p.qcFailed || 0), 0);
  const totalPacked = filteredOrders.reduce((sum, p) => sum + (p.packedCount || 0), 0);
  const totalAqlPassed = filteredOrders.reduce((sum, p) => sum + (p.aqlPassed || 0), 0);
  const totalAqlFailed = filteredOrders.reduce((sum, p) => sum + (p.aqlFailed || 0), 0);
  const totalTransfers = filteredOrders.reduce((sum, p) => sum + (p.boxTransfers || 0), 0);
  const totalScrapped = filteredOrders.reduce((sum, p) => sum + (p.scrappedCount || 0), 0);

  const overallQcTotal = totalQcPassed + totalQcFailed;
  const overallQcPassRate = overallQcTotal > 0 ? Math.round((totalQcPassed / overallQcTotal) * 100) : 100;
  const overallCompletion = totalPlanned > 0 ? Math.min(100, Math.round((totalPacked / totalPlanned) * 100)) : 0;

  /* ── Export to Excel (CSV) Handler ───────────────────────── */
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      showToast('No data available to export', 'warning');
      return;
    }

    const headers = [
      'PO Number',
      'PO Name',
      'Style Name',
      'Customer',
      'Target Planned Qty',
      'QC Passed Qty',
      'QC Failed Qty',
      'QC Pass Rate',
      'Packed Qty',
      'AQL Passed Boxes',
      'AQL Failed Boxes',
      'Box Transfers',
      'Scrapped Garments',
      'Completion %',
      'Status'
    ];

    const rows = filteredOrders.map(p => [
      `"${p.poNumber}"`,
      `"${p.poName || ''}"`,
      `"${p.styleName}"`,
      `"${p.customer || 'Standard'}"`,
      p.targetQuantity,
      p.qcPassed,
      p.qcFailed,
      `"${p.qcPassRate}"`,
      p.packedCount,
      p.aqlPassed,
      p.aqlFailed,
      p.boxTransfers,
      p.scrappedCount,
      `"${p.completionPct}"`,
      `"${p.status}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `UniFlow_Production_Report_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Exported production report (${filteredOrders.length} POs) to Excel CSV successfully`, 'success');
  };

  /* ── Export to PDF Handler ───────────────────────────────── */
  const handleExportPdf = () => {
    window.print();
    showToast('Print / Save PDF dialog opened', 'info');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Printable Header & Action Bar */}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: '1 1 auto', minWidth: '220px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Executive Operations & Production Reports 📊
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Descriptive Style & PO analysis covering Quality Inspection (QC), Carton Packing, AQL Sample Audits, and Box Transfers.
          </p>
        </div>

        <div className="admin-page-header-actions no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchReports}
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className="btn btn-primary"
            style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#059669', borderColor: '#059669', borderRadius: '10px' }}
          >
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px' }}
          >
            <Printer size={16} color="var(--primary-teal)" /> Print / PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card no-print" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '14px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', border: '1.5px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={16} color="var(--primary-teal)" />
          <span style={{ fontSize: '13px', fontWeight: 800 }}>Report Filters:</span>
        </div>

        {/* Time Range Selector */}
        <div style={styles.tabBar}>
          {(['Today', 'Week', 'Month', 'All'] as const).map(tab => (
            <button
              key={tab}
              style={timeRange === tab ? styles.tabActive : styles.tabBtn}
              onClick={() => setTimeRange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Style Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 180px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Style:</label>
          <select
            value={selectedStyleFilter}
            onChange={e => setSelectedStyleFilter(e.target.value)}
            style={{ ...styles.selectFilter, flex: 1, minWidth: '130px', width: '100%' }}
          >
            <option value="">All Styles ({availableStyles.length})</option>
            {availableStyles.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* PO Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 180px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>PO Number:</label>
          <select
            value={selectedPoFilter}
            onChange={e => setSelectedPoFilter(e.target.value)}
            style={{ ...styles.selectFilter, flex: 1, minWidth: '130px', width: '100%' }}
          >
            <option value="">All Production Orders ({availablePos.length})</option>
            {availablePos.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {(selectedStyleFilter || selectedPoFilter) && (
          <button
            onClick={() => { setSelectedStyleFilter(''); setSelectedPoFilter(''); }}
            style={{ fontSize: '12px', color: '#EF4444', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
          >
            Clear Filters
          </button>
        )}
      </div>
      {/* ── Comprehensive Production Order Breakdown Table ──────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Production Order & Operation Detailed Audit Table</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Complete breakdown per Production Order & Style covering target, QC, Packing, AQL, transfers, and scrap.
            </p>
          </div>
          <StatusPill label={`${filteredOrders.length} Orders`} variant="teal" />
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No production orders found matching the selected report filters.
          </div>
        ) : (
          <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table className="responsive-table" style={{ ...styles.table, minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={styles.th}>PO NUMBER</th>
                  <th style={styles.th}>STYLE NAME</th>
                  <th style={styles.th}>CUSTOMER</th>
                  <th style={styles.th}>PLANNED</th>
                  <th style={styles.th}>QC PASS</th>
                  <th style={styles.th}>QC FAIL</th>
                  <th style={styles.th}>PACKED</th>
                  <th style={styles.th}>AQL PASS BOXES</th>
                  <th style={styles.th}>AQL FAIL BOXES</th>
                  <th style={styles.th}>TRANSFERS</th>
                  <th style={styles.th}>SCRAP</th>
                  <th style={styles.th}>COMPLETION %</th>
                  <th style={styles.th}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {(showAllOrders ? filteredOrders : filteredOrders.slice(0, 10)).map((p: any) => (
                  <tr key={p.poId} style={styles.tr}>
                    <td data-label="PO NUMBER" style={styles.td}>
                      <strong style={{ color: 'var(--primary-teal)' }}>{p.poNumber}</strong>
                      {p.poName && p.poName !== 'N/A' && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>{p.poName}</span>
                      )}
                    </td>
                    <td data-label="STYLE NAME" style={styles.td}>{p.styleName}</td>
                    <td data-label="CUSTOMER" style={styles.td}>{p.customer}</td>
                    <td data-label="PLANNED" style={styles.td}><strong>{p.targetQuantity.toLocaleString()}</strong></td>
                    <td data-label="QC PASS" style={styles.td}><span style={{ color: '#10B981', fontWeight: 800 }}>{p.qcPassed}</span></td>
                    <td data-label="QC FAIL" style={styles.td}>
                      {p.qcFailed > 0 ? (
                        <span style={{ color: '#F59E0B', fontWeight: 800 }}>⚠️ {p.qcFailed}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="PACKED" style={styles.td}><span style={{ color: '#3B82F6', fontWeight: 800 }}>{p.packedCount}</span></td>
                    <td data-label="AQL PASS BOXES" style={styles.td}>
                      <StatusPill label={`${p.aqlPassed} Boxes`} variant={p.aqlPassed > 0 ? 'green' : 'muted'} />
                    </td>
                    <td data-label="AQL FAIL BOXES" style={styles.td}>
                      {p.aqlFailed > 0 ? (
                        <StatusPill label={`${p.aqlFailed} Fail`} variant="red" />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="TRANSFERS" style={styles.td}>
                      <span style={{ color: '#8B5CF6', fontWeight: 800 }}>{p.boxTransfers}</span>
                    </td>
                    <td data-label="SCRAP" style={styles.td}>
                      {p.scrappedCount > 0 ? (
                        <span style={{ color: '#EF4444', fontWeight: 800 }}>{p.scrappedCount}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td data-label="COMPLETION %" style={{ ...styles.td, minWidth: '110px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ProgressBar current={p.packedCount} total={p.targetQuantity || 1} height={6} color="var(--primary-teal)" />
                        <span style={{ fontSize: '11px', fontWeight: 700 }}>{p.completionPct}</span>
                      </div>
                    </td>
                    <td data-label="STATUS" style={styles.td}>
                      <StatusPill label={p.status} variant={p.status === 'COMPLETED' ? 'green' : 'teal'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredOrders.length > 10 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setShowAllOrders(!showAllOrders)}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid var(--primary-teal)',
                    color: 'var(--primary-teal)',
                    cursor: 'pointer'
                  }}
                >
                  {showAllOrders
                    ? '▲ Show Less (First 10 Orders)'
                    : `▼ See More (${filteredOrders.length - 10} more orders)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section: Factory Operational Logs & Deep Inspection (From Dashboard) ── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-teal)',
              boxShadow: '0 0 8px var(--primary-teal)',
              display: 'inline-block'
            }} />
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              FACTORY OPERATIONAL DEEP INSPECTION LOGS
            </span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            Operational Logs & Unit Records 📋
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Inspect live production orders, carton box contents & QR lists, defect rates, scrap logs, and system audit trails.
          </p>
        </div>

        {/* Multi-Attribute Filter Bar */}
        <div style={{
          backgroundColor: 'var(--bg-surface-2)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-teal)', fontSize: '12px', fontWeight: 700 }}>
            <Filter size={15} />
            <span>Filters:</span>
          </div>

          {/* Style Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Style</label>
            <select
              value={selectedStyleFilter}
              onChange={e => setSelectedStyleFilter(e.target.value)}
              style={styles.selectFilter}
            >
              <option value="">All Styles</option>
              {availableStyles.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* PO Number Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PO Number</label>
            <select
              value={selectedPoFilter}
              onChange={e => setSelectedPoFilter(e.target.value)}
              style={styles.selectFilter}
            >
              <option value="">All POs</option>
              {availablePos.map(po => (
                <option key={po} value={po}>{po}</option>
              ))}
            </select>
          </div>

          {/* Production Line Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Line</label>
            <select
              value={selectedLineFilter}
              onChange={e => setSelectedLineFilter(e.target.value)}
              style={styles.selectFilter}
            >
              <option value="">All Lines</option>
              {availableLines.map((ln: string) => (
                <option key={ln} value={ln}>{ln}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</label>
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                value={selectedDateFilter}
                onChange={e => setSelectedDateFilter(e.target.value)}
                style={{
                  ...styles.selectFilter,
                  colorScheme: 'dark',
                  paddingLeft: '28px'
                }}
              />
              <Calendar size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Search Term Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: '1', minWidth: '180px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Search</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search barcode, PO, box, style, inspector..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-surface-1)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          {/* Reset Filters Button */}
          {(selectedStyleFilter || selectedPoFilter || selectedLineFilter || selectedDateFilter || searchTerm) && (
            <button
              onClick={() => {
                setSelectedStyleFilter('');
                setSelectedPoFilter('');
                setSelectedLineFilter('');
                setSelectedDateFilter('');
                setSearchTerm('');
              }}
              style={{
                alignSelf: 'flex-end',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                height: '32px'
              }}
            >
              <X size={13} />
              Reset Filters
            </button>
          )}
        </div>

        {/* Tab Switcher - 7 Tabs in requested order */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '10px'
        }}>
          <button
            onClick={() => setActiveLogTab('styles')}
            style={styles.logTabBtn(activeLogTab === 'styles')}
          >
            <Palette size={14} /> Styles ({filteredStyles.length})
          </button>
          <button
            onClick={() => setActiveLogTab('orders')}
            style={styles.logTabBtn(activeLogTab === 'orders')}
          >
            <Package size={14} /> Production Orders ({filteredActiveOrders.length})
          </button>
          <button
            onClick={() => setActiveLogTab('qc')}
            style={styles.logTabBtn(activeLogTab === 'qc')}
          >
            <ShieldCheck size={14} /> QC Details ({filteredQcLogs.length})
          </button>
          <button
            onClick={() => setActiveLogTab('boxes')}
            style={styles.logTabBtn(activeLogTab === 'boxes')}
          >
            <Box size={14} /> Box Overview ({filteredBoxes.length})
          </button>
          <button
            onClick={() => setActiveLogTab('aql')}
            style={styles.logTabBtn(activeLogTab === 'aql')}
          >
            <ClipboardCheck size={14} /> AQL & Final AQL ({filteredAqlLogs.length})
          </button>
          <button
            onClick={() => setActiveLogTab('preqc')}
            style={styles.logTabBtn(activeLogTab === 'preqc')}
          >
            <CheckCircle2 size={14} /> Pre QC ({filteredPreQcLogs.length})
          </button>
          <button
            onClick={() => setActiveLogTab('scrapped')}
            style={styles.logTabBtn(activeLogTab === 'scrapped')}
          >
            <Trash2 size={14} /> Scrapped Items ({filteredScrapped.length})
          </button>
        </div>

        {/* TAB 1: STYLES */}
        {activeLogTab === 'styles' && (
          <div>
            {filteredStyles.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No styles found matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '750px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>STYLE NAME</th>
                      <th style={styles.th}>STYLE CODE</th>
                      <th style={styles.th}>LINKED ORDERS</th>
                      <th style={styles.th}>CREATED AT</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStyles.map((st: any) => (
                      <tr key={st.id} style={styles.tr}>
                        <td data-label="STYLE NAME" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)' }}>{st.name}</strong>
                        </td>
                        <td data-label="STYLE CODE" style={styles.td}>
                          <code style={{ backgroundColor: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                            {st.code || 'N/A'}
                          </code>
                        </td>
                        <td data-label="LINKED ORDERS" style={styles.td}>
                          <StatusPill label={`${st.po_count || 0} Orders`} variant={st.po_count > 0 ? 'green' : 'muted'} />
                        </td>
                        <td data-label="CREATED AT" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {st.created_at ? new Date(st.created_at).toLocaleDateString() : 'N/A'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeleteStyle(st)}
                            title="Delete this style"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #EF4444',
                              color: '#EF4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRODUCTION ORDERS */}
        {activeLogTab === 'orders' && (
          <div>
            {filteredActiveOrders.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active production orders found matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE NAME</th>
                      <th style={styles.th}>TARGET QTY</th>
                      <th style={styles.th}>PACKED QTY</th>
                      <th style={styles.th}>PROGRESS</th>
                      <th style={styles.th}>AQL PASSED BOXES</th>
                      <th style={styles.th}>SCRAPPED</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveOrders.map((po: any) => {
                      const packed = Number(po.packed_count || 0);
                      const target = Number(po.total_quantity || 1);
                      const percent = Math.min(100, Math.round((packed / target) * 100));

                      return (
                        <tr key={po.id} style={styles.tr}>
                          <td data-label="PO NUMBER" style={styles.td}>
                            <strong style={{ color: 'var(--primary-teal)' }}>{po.po_number}</strong>
                          </td>
                          <td data-label="STYLE" style={styles.td}>{po.style_name || 'Standard Style'}</td>
                          <td data-label="TARGET" style={styles.td}>
                            <strong>{po.total_quantity}</strong> pcs
                          </td>
                          <td data-label="PACKED" style={styles.td}>
                            <span style={{ color: 'var(--color-purple)', fontWeight: 800 }}>{packed}</span> pcs
                          </td>
                          <td data-label="PROGRESS" style={{ ...styles.td, minWidth: '130px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ProgressBar current={packed} total={target} height={6} color="var(--color-purple)" />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{percent}%</span>
                            </div>
                          </td>
                          <td data-label="AQL PASSED BOXES" style={styles.td}>
                            <StatusPill label={`${po.aql_passed_boxes || 0} Boxes`} variant={po.aql_passed_boxes > 0 ? 'green' : 'muted'} />
                          </td>
                          <td data-label="SCRAPPED" style={styles.td}>
                            {po.scrapped_count > 0 ? (
                              <span style={{ color: '#EF4444', fontWeight: 800 }}>⚠️ {po.scrapped_count}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>0</span>
                            )}
                          </td>
                          <td data-label="STATUS" style={styles.td}>
                            <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                          </td>
                          <td data-label="ACTION" style={styles.td}>
                            <button
                              onClick={() => handleDeleteOrder(po)}
                              title="Delete this production order"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid #EF4444',
                                color: '#EF4444',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QC DETAILS */}
        {activeLogTab === 'qc' && (
          <div>
            {filteredQcLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No QC inspection records found matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ITEM QR</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>QC RESULT</th>
                      <th style={styles.th}>TEST RESULT</th>
                      <th style={styles.th}>DEFECT / REASON</th>
                      <th style={styles.th}>INSPECTOR</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQcLogs.map((qc: any) => (
                      <tr key={qc.id} style={styles.tr}>
                        <td data-label="ITEM QR" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{qc.item_qr}</strong>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>{qc.po_number || 'N/A'}</td>
                        <td data-label="STYLE" style={styles.td}>{qc.style_name || 'Standard'}</td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{qc.line_name || qc.line_number || '—'}</span>
                        </td>
                        <td data-label="QC RESULT" style={styles.td}>
                          <StatusPill label={qc.qc_result || 'PASS'} variant={qc.qc_result === 'PASS' ? 'green' : 'red'} />
                        </td>
                        <td data-label="TEST RESULT" style={styles.td}>
                          <StatusPill label={qc.test_result || 'PASS'} variant={qc.test_result === 'PASS' ? 'green' : 'amber'} />
                        </td>
                        <td data-label="DEFECT / REASON" style={styles.td}>
                          <span style={{ color: qc.defect_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {qc.defect_reason || qc.reason || 'None (Passed)'}
                          </span>
                        </td>
                        <td data-label="INSPECTOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{qc.inspector_name || qc.user_id || 'QC Staff'}</span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {qc.scanned_at ? new Date(qc.scanned_at).toLocaleString() : 'N/A'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeleteQcLog(qc)}
                            title="Delete this QC record"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #EF4444',
                              color: '#EF4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: BOX OVERVIEW */}
        {activeLogTab === 'boxes' && (
          <div>
            {filteredBoxes.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No boxes registered matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '850px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>BOX NUMBER</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE NAME</th>
                      <th style={styles.th}>CAPACITY (X/Y)</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>AQL AUDIT</th>
                      <th style={styles.th}>TRANSFER STATUS</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllBoxes ? filteredBoxes : filteredBoxes.slice(0, 10)).map((bx: any) => (
                      <tr key={bx.id} style={styles.tr}>
                        <td data-label="BOX NUMBER" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>{bx.boxCode || bx.boxNumber}</strong>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>{bx.poNumber}</td>
                        <td data-label="STYLE NAME" style={styles.td}>{bx.styleName}</td>
                        <td data-label="CAPACITY (X/Y)" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)' }}>{bx.activeFilledCount}</strong> / {bx.capacity} pcs
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                            ({bx.remainingCapacity} space left)
                          </span>
                        </td>
                        <td data-label="STATUS" style={styles.td}>
                          <StatusPill label={bx.status} variant={bx.status === 'COMPLETED' ? 'green' : 'amber'} />
                        </td>
                        <td data-label="AQL AUDIT" style={styles.td}>
                          <StatusPill label={bx.aqlStatus} variant={bx.aqlStatus === 'PASS' ? 'green' : bx.aqlStatus === 'FAIL' ? 'red' : 'muted'} />
                        </td>
                        <td data-label="TRANSFER STATUS" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{bx.transferStatus || 'NONE'}</span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setSelectedBoxModal(bx)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                border: '1px solid var(--color-purple)',
                                color: 'var(--color-purple)',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              View QRs ({bx.productQrs?.length || 0})
                            </button>
                            <button
                              onClick={() => setBoxToDelete(bx)}
                              title="Delete this box"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid #EF4444',
                                color: '#EF4444',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredBoxes.length > 10 && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => setShowAllBoxes(!showAllBoxes)}
                      className="btn btn-secondary"
                      style={{
                        padding: '8px 20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '8px',
                        border: '1px solid var(--color-purple)',
                        color: 'var(--color-purple)',
                        cursor: 'pointer'
                      }}
                    >
                      {showAllBoxes
                        ? '▲ Show Less (First 10 Boxes)'
                        : `▼ See More (${filteredBoxes.length - 10} more boxes)`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AQL & FINAL AQL */}
        {activeLogTab === 'aql' && (
          <div>
            {filteredAqlLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No AQL inspection records found matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>BOX IDENTIFIER</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>STAGE</th>
                      <th style={styles.th}>SAMPLES</th>
                      <th style={styles.th}>RESULT</th>
                      <th style={styles.th}>DEFECT / REASON</th>
                      <th style={styles.th}>INSPECTOR</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAqlLogs.map((aql: any) => (
                      <tr key={aql.id} style={styles.tr}>
                        <td data-label="BOX IDENTIFIER" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>{aql.box_code || aql.box_number || aql.box_id}</strong>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>{aql.po_number || 'N/A'}</td>
                        <td data-label="STYLE" style={styles.td}>{aql.style_name || 'Standard'}</td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{aql.line_name || aql.line_number || '—'}</span>
                        </td>
                        <td data-label="STAGE" style={styles.td}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>{aql.stage || 'Final AQL'}</span>
                        </td>
                        <td data-label="SAMPLES" style={styles.td}>
                          <span>{aql.sample_size || aql.samples_checked || 5} checked</span>
                        </td>
                        <td data-label="RESULT" style={styles.td}>
                          <StatusPill label={aql.result || 'PASS'} variant={aql.result === 'PASS' ? 'green' : aql.result === 'FAIL' ? 'red' : 'amber'} />
                        </td>
                        <td data-label="DEFECT / REASON" style={styles.td}>
                          <span style={{ color: aql.defect_notes ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {aql.defect_notes || aql.reason || 'None (Approved)'}
                          </span>
                        </td>
                        <td data-label="INSPECTOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{aql.inspector_name || aql.user_id || 'AQL Auditor'}</span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {aql.created_at ? new Date(aql.created_at).toLocaleString() : 'N/A'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeleteAqlLog(aql)}
                            title="Delete this AQL inspection log"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #EF4444',
                              color: '#EF4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: PRE QC */}
        {activeLogTab === 'preqc' && (
          <div>
            {filteredPreQcLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No Pre-QC records found matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ITEM QR</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>STYLE</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>PRE-QC RESULT</th>
                      <th style={styles.th}>DEFECT / REASON</th>
                      <th style={styles.th}>OPERATOR</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreQcLogs.map((pq: any) => (
                      <tr key={pq.id} style={styles.tr}>
                        <td data-label="ITEM QR" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{pq.item_qr}</strong>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>{pq.po_number || 'N/A'}</td>
                        <td data-label="STYLE" style={styles.td}>{pq.style_name || 'Standard'}</td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pq.line_name || pq.line_number || '—'}</span>
                        </td>
                        <td data-label="PRE-QC RESULT" style={styles.td}>
                          <StatusPill label={pq.pre_qc_result || 'PASS'} variant={pq.pre_qc_result === 'PASS' ? 'green' : 'red'} />
                        </td>
                        <td data-label="DEFECT / REASON" style={styles.td}>
                          <span style={{ color: pq.defect_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {pq.defect_reason || pq.reason || 'None (Passed)'}
                          </span>
                        </td>
                        <td data-label="OPERATOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{pq.operator_name || pq.user_id || 'Line Operator'}</span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {pq.scanned_at ? new Date(pq.scanned_at).toLocaleString() : 'N/A'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeletePreQcLog(pq)}
                            title="Delete this Pre-QC record"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #EF4444',
                              color: '#EF4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: SCRAPPED ITEMS */}
        {activeLogTab === 'scrapped' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#EF4444', margin: 0 }}>Permanently Removed Garments (Scrap Archive)</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                  Audit log of damaged garments scrapped during AQL or QC inspections.
                </p>
              </div>
              <StatusPill label={`${filteredScrapped.length} Items Logged`} variant="red" />
            </div>

            {filteredScrapped.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No permanently removed garments logged matching current filters.
              </div>
            ) : (
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '850px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ITEM QR BARCODE</th>
                      <th style={styles.th}>BOX / PO</th>
                      <th style={styles.th}>ACTION TYPE</th>
                      <th style={styles.th}>REASON FOR SCRAP</th>
                      <th style={styles.th}>REMOVED BY</th>
                      <th style={styles.th}>TIMESTAMP</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScrapped.map((item: any) => (
                      <tr key={item.id} style={styles.tr}>
                        <td data-label="ITEM QR BARCODE" style={styles.td}>
                          <strong style={{ color: '#EF4444' }}>{item.item_qr}</strong>
                        </td>
                        <td data-label="BOX / PO" style={styles.td}>{item.box_id || item.po_number || 'N/A'}</td>
                        <td data-label="ACTION TYPE" style={styles.td}>
                          <StatusPill label={item.action_type || 'PERMANENTLY_REMOVE'} variant="red" />
                        </td>
                        <td data-label="REASON FOR SCRAP" style={styles.td}>{item.reason || 'Irreparable Damaged Garment'}</td>
                        <td data-label="REMOVED BY" style={styles.td}>{item.operator_name || item.removed_by || 'Operator'}</td>
                        <td data-label="TIMESTAMP" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {item.removed_at ? new Date(item.removed_at).toLocaleString() : 'Recent'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeleteScrapped(item)}
                            title="Delete this scrapped item record"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #EF4444',
                              color: '#EF4444',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delete Box Confirmation Modal ───────────────────────── */}
      {boxToDelete && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444'
              }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Delete Box?
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  This action will permanently delete this carton box.
                </span>
              </div>
            </div>

            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-surface-2)',
              fontSize: '13px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Box Identifier:</span>
                <strong style={{ color: 'var(--color-purple)' }}>{boxToDelete.boxCode || boxToDelete.boxNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Production Order:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{boxToDelete.poNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Items Inside:</span>
                <strong style={{ color: 'var(--primary-teal)' }}>{boxToDelete.activeFilledCount || 0} pcs</strong>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#f87171', margin: 0, lineHeight: 1.5 }}>
              ⚠️ Packed items in this box will be released back to inspection. Are you sure you want to delete this box?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                disabled={deletingBox}
                onClick={() => setBoxToDelete(null)}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBox}
                onClick={confirmDeleteBox}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: deletingBox ? 'not-allowed' : 'pointer',
                  opacity: deletingBox ? 0.7 : 1
                }}
              >
                {deletingBox ? 'Deleting...' : 'Yes, Delete Box'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Box Content Detail Modal ───────────────────────────── */}
      {selectedBoxModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em' }}>BOX CONTENT DETAIL</span>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Box {selectedBoxModal.boxCode || selectedBoxModal.boxNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBoxModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PO Number:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>{selectedBoxModal.poNumber}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Garment Style:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>{selectedBoxModal.styleName}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Capacity:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--color-purple)' }}>
                  {selectedBoxModal.activeFilledCount} / {selectedBoxModal.capacity} pcs
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AQL Inspection:</span>
                <StatusPill label={selectedBoxModal.aqlStatus} variant={selectedBoxModal.aqlStatus === 'PASS' ? 'green' : selectedBoxModal.aqlStatus === 'FAIL' ? 'red' : 'muted'} />
              </div>
            </div>

            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                Active Scanned Garment QRs ({selectedBoxModal.productQrs?.length || 0}):
              </h4>
              <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                backgroundColor: 'var(--bg-surface-2)',
                padding: '10px',
                borderRadius: '10px'
              }}>
                {selectedBoxModal.productQrs && selectedBoxModal.productQrs.length > 0 ? (
                  selectedBoxModal.productQrs.map((qr: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        color: 'var(--primary-teal)',
                        border: '1px solid rgba(20, 184, 166, 0.3)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>{qr}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBoxItem(selectedBoxModal.id, qr)}
                        title={`Delete ${qr} from this box`}
                        style={{
                          background: 'rgba(239, 68, 68, 0.18)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No items packed in this box yet.</span>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedBoxModal(null)}
              className="btn btn-secondary"
              style={{ marginTop: '8px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Generic Row Delete Confirmation Modal ──────────────── */}
      {genericDeleteModal?.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444'
              }}>
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {genericDeleteModal.title}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {genericDeleteModal.description}
                </span>
              </div>
            </div>

            {genericDeleteModal.details && genericDeleteModal.details.length > 0 && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-surface-2)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                {genericDeleteModal.details.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{d.label}:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{d.value}</strong>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: '12px', color: '#f87171', margin: 0, lineHeight: 1.5 }}>
              ⚠️ This action is permanent and cannot be undone. Are you sure you wish to proceed?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setGenericDeleteModal(null)}
                disabled={isDeletingGeneric}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!genericDeleteModal?.onConfirm) return;
                  setIsDeletingGeneric(true);
                  try {
                    await genericDeleteModal.onConfirm();
                    setGenericDeleteModal(null);
                  } catch (err: any) {
                    showToast(err.message || 'Deletion failed', 'error');
                  } finally {
                    setIsDeletingGeneric(false);
                  }
                }}
                disabled={isDeletingGeneric}
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: isDeletingGeneric ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}
              >
                {isDeletingGeneric ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                {isDeletingGeneric ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, any> = {
  tabBar: {
    display: 'flex',
    backgroundColor: 'var(--bg-surface-2)',
    borderRadius: '10px',
    padding: '3px',
    border: '1px solid var(--border-color)'
  },
  tabBtn: {
    padding: '4px 10px',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    background: 'none',
    border: 'none',
    cursor: 'pointer'
  },
  tabActive: {
    padding: '4px 10px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary-teal)',
    color: '#041820',
    fontSize: '11px',
    fontWeight: 800,
    border: 'none',
    cursor: 'pointer'
  },
  selectFilter: {
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    outline: 'none'
  },
  statBox: (bg: string, border: string) => ({
    backgroundColor: 'var(--bg-surface-2)',
    background: `linear-gradient(135deg, var(--bg-surface-2) 0%, ${bg} 100%)`,
    border: `1px solid ${border}`,
    borderRadius: '12px',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }),
  statVal: {
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--primary-teal)'
  },
  statLbl: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    marginTop: '2px',
    textAlign: 'center'
  },
  table: {
    width: '100%',
    minWidth: '850px',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  th: {
    padding: '10px 12px',
    borderBottom: '2px solid var(--border-color)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap'
  },
  tr: {
    borderBottom: '1px solid var(--border-color)'
  },
  td: {
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontSize: '12px',
    whiteSpace: 'nowrap'
  },
  logTabBtn: (active: boolean) => ({
    padding: '7px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: active ? 'var(--primary-teal)' : 'var(--bg-surface-2)',
    color: active ? '#041820' : 'var(--text-secondary)',
    border: active ? '1px solid var(--primary-teal)' : '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })
};
