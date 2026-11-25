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
  Edit2,
  Activity,
  Search,
  X,
  Palette,
  ShieldCheck,
  ClipboardCheck,
  Calendar,
  Link2
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { StatusPill } from '../../components/StatusPill';
import { ProgressBar } from '../../components/ProgressBar';
import '../../styles/tokens.css';

export const AdminReports: React.FC = () => {
  const { showToast, currentRole } = useApp();
  const isAdmin = currentRole === 'admin';
  const [timeRange, setTimeRange] = useState<'Today' | 'Week' | 'Month' | 'All'>('All');
  const [reportData, setReportData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('');
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('');
  const [selectedPoFilter, setSelectedPoFilter] = useState<string>('');
  const [selectedSoFilter, setSelectedSoFilter] = useState<string>('');
  const [selectedDateFrom, setSelectedDateFrom] = useState<string>('');
  const [selectedDateTo, setSelectedDateTo] = useState<string>('');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState<string>('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('');

  // Per-tab All / Pass / Fail filter state
  const [tabResultFilters, setTabResultFilters] = useState<Record<string, 'ALL' | 'PASS' | 'FAIL'>>({
    all: 'ALL',
    preqc: 'ALL',
    qc: 'ALL',
    packing: 'ALL',
    aql: 'ALL',
    final_aql: 'ALL',
    transfers: 'ALL',
    scrapped: 'ALL'
  });

  // Operational inspection tabs state: all, preqc, qc, packing, aql, final_aql, transfers, scrapped
  const [activeLogTab, setActiveLogTab] = useState<'all' | 'preqc' | 'qc' | 'packing' | 'aql' | 'final_aql' | 'transfers' | 'scrapped'>('preqc');
  const [tabTimeRange, setTabTimeRange] = useState<'All' | 'Today' | 'Weekly' | 'Monthly'>('All');
  const [tabDateFrom, setTabDateFrom] = useState<string>('');
  const [tabDateTo, setTabDateTo] = useState<string>('');
  const [opLogsData, setOpLogsData] = useState<any>(null);
  const [tabSearchTerm, setTabSearchTerm] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedBoxModal, setSelectedBoxModal] = useState<any>(null);
  const [selectedPreQcModal, setSelectedPreQcModal] = useState<{
    itemQr: string;
    poNumber?: string;
    styleName?: string;
    preQcs: string[];
  } | null>(null);

  // Pagination: first 50 per tab + unlimited "View More" (+50 each click)
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({
    preqc: 50,
    qc: 50,
    packing: 50,
    aql: 50,
    final_aql: 50,
    transfers: 50,
    scrapped: 50
  });

  // "All" Merged Preview tab state (server-paginated 50 at a time, unlimited View More)
  const [allMergedRows, setAllMergedRows] = useState<any[]>([]);
  const [allMergedTotal, setAllMergedTotal] = useState<number>(0);
  const [allMergedLoading, setAllMergedLoading] = useState<boolean>(false);
  const [allMergedLoadingMore, setAllMergedLoadingMore] = useState<boolean>(false);

  // Admin edit Product QR / Serial Number state
  const [editingItemQr, setEditingItemQr] = useState<{
    itemId: string;
    currentQr: string;
    newQr: string;
    sourceTab: string;
  } | null>(null);
  const [isSavingItemQr, setIsSavingItemQr] = useState<boolean>(false);

  // Format any timestamp strictly in Sri Lanka Time (Asia/Colombo, UTC+5:30)
  const formatSriLankaDateTime = (val?: string | Date | null): string => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return String(val);
    }
  };

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

  // Delete Carton Box with standard generic confirmation modal
  const handleDeleteBox = (bx: any) => {
    const boxCode = bx.box_code || bx.box_number || bx.boxCode || bx.boxNumber || bx.id;
    const boxId = bx.id || bx.box_id || boxCode;
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Carton Box?',
      description: `Are you sure you want to permanently delete box '${boxCode}'? Any packed items inside will be released.`,
      details: [
        { label: 'Box Code', value: boxCode },
        { label: 'PO Number', value: bx.po_number || bx.po_name || bx.poNumber || 'N/A' },
        { label: 'Style', value: bx.style_name || bx.styleName || 'Standard' },
        { label: 'Packed Items', value: `${bx.activeFilledCount || bx.current_fill || (bx.productQrs?.length || 0)} pcs` }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/boxes/${encodeURIComponent(boxId)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API box delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            packingLogs: (base.packingLogs || []).filter((b: any) => 
              b.id !== boxId && 
              b.box_id !== boxId && 
              b.box_code !== boxCode && 
              b.box_number !== boxCode &&
              b.boxCode !== boxCode
            )
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            adminBoxes: Array.isArray(prev.adminBoxes) ? prev.adminBoxes.filter((b: any) => 
              b.id !== boxId && 
              b.box_code !== boxCode && 
              b.box_number !== boxCode
            ) : []
          };
        });
        showToast(`Box ${boxCode} deleted successfully.`, 'success');
      }
    });
  };

  // Edit Carton Box Number state and handlers
  const [editingBox, setEditingBox] = useState<{
    box: any;
    currentNumber: string;
    newNumber: string;
  } | null>(null);
  const [isSavingBoxEdit, setIsSavingBoxEdit] = useState<boolean>(false);

  const handleOpenEditBox = (bx: any) => {
    const currentNum = bx.box_code || bx.box_number || bx.boxCode || bx.boxNumber || '';
    setEditingBox({
      box: bx,
      currentNumber: currentNum,
      newNumber: currentNum
    });
  };

  const updateLocalBoxNumber = (boxId: string, oldBoxCode: string, newNumber: string) => {
    setOpLogsData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        packingLogs: (prev.packingLogs || []).map((b: any) => {
          const matches = b.id === boxId || b.box_id === boxId || b.box_code === oldBoxCode || b.box_number === oldBoxCode || b.boxCode === oldBoxCode;
          if (!matches) return b;
          return {
            ...b,
            box_code: newNumber,
            box_number: newNumber,
            boxCode: newNumber,
            boxNumber: newNumber,
          };
        }),
        aqlLogs: (prev.aqlLogs || []).map((a: any) => {
          const matches = a.box_id === boxId || a.box_code === oldBoxCode || a.box_number === oldBoxCode;
          if (!matches) return a;
          return { ...a, box_code: newNumber, box_number: newNumber };
        }),
        finalAqlLogs: (prev.finalAqlLogs || []).map((a: any) => {
          const matches = a.box_id === boxId || a.box_code === oldBoxCode || a.box_number === oldBoxCode;
          if (!matches) return a;
          return { ...a, box_code: newNumber, box_number: newNumber };
        })
      };
    });
    setAdminData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        adminBoxes: Array.isArray(prev.adminBoxes) ? prev.adminBoxes.map((b: any) => {
          const matches = b.id === boxId || b.box_id === boxId || b.box_code === oldBoxCode || b.box_number === oldBoxCode || b.boxCode === oldBoxCode;
          if (!matches) return b;
          return {
            ...b,
            box_code: newNumber,
            box_number: newNumber,
            boxCode: newNumber,
            boxNumber: newNumber,
          };
        }) : []
      };
    });
    setSelectedBoxModal((prev: any) => {
      if (!prev) return prev;
      const isCurrentModal = prev.id === boxId || prev.box_id === boxId || prev.box_code === oldBoxCode || prev.boxCode === oldBoxCode || prev.box_number === oldBoxCode;
      if (!isCurrentModal) return prev;
      return {
        ...prev,
        box_code: newNumber,
        box_number: newNumber,
        boxCode: newNumber,
        boxNumber: newNumber,
      };
    });
  };

  const handleSaveBoxEdit = async () => {
    if (!editingBox) return;
    const targetBoxId = editingBox.box.id || editingBox.box.box_id || editingBox.currentNumber;
    const trimmed = editingBox.newNumber.trim();
    if (!trimmed) {
      showToast('Box number cannot be empty.', 'error');
      return;
    }
    if (trimmed === editingBox.currentNumber) {
      setEditingBox(null);
      return;
    }

    setIsSavingBoxEdit(true);
    try {
      const res = await apiFetch(`/api/boxes/${encodeURIComponent(targetBoxId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ boxNumber: trimmed, boxCode: trimmed })
      });
      updateLocalBoxNumber(targetBoxId, editingBox.currentNumber, trimmed);
      showToast(res?.message || `Box number updated to "${trimmed}" successfully.`, 'success');
      setEditingBox(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update box number.', 'error');
    } finally {
      setIsSavingBoxEdit(false);
    }
  };

  // Pagination helper: increment visible count by 50 (no cap)
  const handleViewMore = (tabKey: string) => {
    setVisibleCounts(prev => ({
      ...prev,
      [tabKey]: (prev[tabKey] || 50) + 50
    }));
  };

  const renderViewMoreFooter = (tabKey: string, totalCount: number) => {
    const shown = Math.min(visibleCounts[tabKey] || 50, totalCount);
    if (totalCount === 0) return null;
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '12px 16px',
        backgroundColor: 'var(--bg-surface-2)',
        borderTop: '1px solid var(--border-color)',
        borderBottomLeftRadius: '10px',
        borderBottomRightRadius: '10px'
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
          Showing <strong style={{ color: 'var(--text-primary)' }}>{shown}</strong> of <strong style={{ color: 'var(--primary-teal)' }}>{totalCount}</strong> records
        </span>
        {shown < totalCount && (
          <button
            type="button"
            onClick={() => handleViewMore(tabKey)}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(20, 184, 166, 0.15)',
              border: '1px solid var(--primary-teal)',
              color: 'var(--primary-teal)',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            View More (+{Math.min(50, totalCount - shown)})
          </button>
        )}
      </div>
    );
  };

  // Fetch "All" Merged Product-to-Box Preview (50 rows at a time, unlimited View More)
  const fetchAllMergedPreview = async (offset = 0, append = false) => {
    if (append) setAllMergedLoadingMore(true);
    else setAllMergedLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (tabTimeRange && tabTimeRange !== 'All') {
        qParams.set('range', tabTimeRange.toLowerCase());
      } else if (timeRange.toLowerCase() !== 'all') {
        qParams.set('range', timeRange.toLowerCase());
      } else {
        qParams.set('range', 'all');
      }

      const effectiveDateFrom = tabDateFrom || selectedDateFrom;
      const effectiveDateTo = tabDateTo || selectedDateTo;
      if (effectiveDateFrom) qParams.set('startDate', effectiveDateFrom);
      if (effectiveDateTo) qParams.set('endDate', effectiveDateTo);

      if (selectedPoFilter) qParams.set('poId', selectedPoFilter);
      if (selectedSoFilter) qParams.set('soId', selectedSoFilter);
      if (selectedStyleFilter) qParams.set('styleName', selectedStyleFilter);
      if (selectedCustomerFilter) qParams.set('customer', selectedCustomerFilter);
      if (selectedSizeFilter) qParams.set('size', selectedSizeFilter);
      if (tabResultFilters.all && tabResultFilters.all !== 'ALL') qParams.set('resultFilter', tabResultFilters.all);
      if (tabSearchTerm && tabSearchTerm.trim()) qParams.set('search', tabSearchTerm.trim());

      qParams.set('format', 'json');
      qParams.set('limit', '50');
      qParams.set('offset', String(offset));

      const res = await apiFetch<{ total: number; limit: number; offset: number; rows: any[] }>(
        `/api/reports/product-box-merged-export?${qParams.toString()}`
      );
      if (res && Array.isArray(res.rows)) {
        setAllMergedTotal(res.total || 0);
        setAllMergedRows(prev => append ? [...prev, ...res.rows] : res.rows);
      } else if (!append) {
        setAllMergedRows([]);
        setAllMergedTotal(0);
      }
    } catch (err: any) {
      console.warn('Failed to fetch merged preview:', err);
      if (!append) {
        setAllMergedRows([]);
        setAllMergedTotal(0);
      }
    } finally {
      setAllMergedLoading(false);
      setAllMergedLoadingMore(false);
    }
  };

  // Admin Edit Product QR / Serial Number (Pre QC, QC, AQL, Final AQL, All)
  const handleOpenEditItemQr = (itemId: string, currentQr: string, sourceTab: string) => {
    if (!itemId && !currentQr) {
      showToast('Item identifier not found.', 'error');
      return;
    }
    setEditingItemQr({
      itemId: itemId || currentQr,
      currentQr: currentQr || '',
      newQr: currentQr || '',
      sourceTab
    });
  };

  const handleSaveItemQr = async () => {
    if (!editingItemQr) return;
    const trimmed = editingItemQr.newQr.trim().toUpperCase();
    if (!trimmed) {
      showToast('Serial / QR code cannot be empty.', 'error');
      return;
    }
    if (trimmed === editingItemQr.currentQr.trim().toUpperCase()) {
      setEditingItemQr(null);
      return;
    }

    setIsSavingItemQr(true);
    try {
      const res = await apiFetch(`/api/items/${encodeURIComponent(editingItemQr.itemId)}/qr`, {
        method: 'PATCH',
        body: JSON.stringify({ newQr: trimmed })
      });

      const oldQr = editingItemQr.currentQr.trim().toUpperCase();
      // Update local states immediately
      setOpLogsData((prev: any) => {
        if (!prev) return prev;
        const matchId = (row: any) =>
          row.item_id === editingItemQr.itemId ||
          (row.item_qr || '').toUpperCase() === oldQr ||
          (row.qr_code || '').toUpperCase() === oldQr;

        return {
          ...prev,
          preQcLogs: (prev.preQcLogs || []).map((r: any) =>
            matchId(r) ? { ...r, item_qr: trimmed, qr_code: trimmed } : r
          ),
          qcLogs: (prev.qcLogs || []).map((r: any) =>
            matchId(r) ? { ...r, item_qr: trimmed, qr_code: trimmed } : r
          )
        };
      });

      setAllMergedRows(prev =>
        prev.map(r =>
          (r.itemId === editingItemQr.itemId || (r.qcQrBarcode || '').toUpperCase() === oldQr)
            ? { ...r, qcQrBarcode: trimmed }
            : r
        )
      );

      showToast(res?.message || `QR / Serial updated to "${trimmed}" successfully.`, 'success');
      setEditingItemQr(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update QR / Serial Number.', 'error');
    } finally {
      setIsSavingItemQr(false);
    }
  };

  // Item-wise delete from Box Content Detail modal
  const handleRemoveBoxItem = async (boxId: string, qrCode: string) => {
    const targetBoxId = boxId || selectedBoxModal?.id || selectedBoxModal?.box_id || selectedBoxModal?.box_code || selectedBoxModal?.boxCode || selectedBoxModal?.box_number;
    if (!targetBoxId) {
      showToast('Box identifier not found.', 'error');
      return;
    }

    const boxLabel = selectedBoxModal?.boxCode || selectedBoxModal?.box_code || selectedBoxModal?.box_number || selectedBoxModal?.boxNumber || targetBoxId;
    const confirmed = window.confirm(`Are you sure you want to remove item "${qrCode}" from Box "${boxLabel}"?\n\nThe item will be unlinked from this carton and reset back to QC Passed.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/api/boxes/${encodeURIComponent(targetBoxId)}/items/${encodeURIComponent(qrCode)}`, { method: 'DELETE' });
      showToast(`Item '${qrCode}' removed from Box ${boxLabel} successfully.`, 'success');

      setSelectedBoxModal((prev: any) => {
        if (!prev) return prev;
        const updatedQrs = (prev.productQrs || []).filter((q: string) => q !== qrCode);
        const updatedItems = (prev.items || []).filter((i: any) => (typeof i === 'string' ? i : (i.qr_code || i.qr)) !== qrCode);
        return {
          ...prev,
          productQrs: updatedQrs,
          items: updatedItems,
          activeFilledCount: Math.max(0, (prev.activeFilledCount || 1) - 1),
          remainingCapacity: Math.min(prev.capacity || 24, (prev.remainingCapacity || 0) + 1)
        };
      });

      setOpLogsData((prev: any) => {
        const base = prev || FALLBACK_OPERATIONAL_DATA;
        return {
          ...base,
          packingLogs: (base.packingLogs || []).map((b: any) => {
            const isMatch = b.id === targetBoxId || b.box_id === targetBoxId || b.box_code === targetBoxId || b.boxCode === targetBoxId || b.box_number === targetBoxId;
            if (!isMatch) return b;
            const updatedQrs = (b.productQrs || []).filter((q: string) => q !== qrCode);
            const updatedItems = (b.items || []).filter((i: any) => (typeof i === 'string' ? i : (i.qr_code || i.qr)) !== qrCode);
            return {
              ...b,
              productQrs: updatedQrs,
              items: updatedItems,
              activeFilledCount: Math.max(0, (b.activeFilledCount || updatedQrs.length + 1) - 1),
              current_fill: Math.max(0, (b.current_fill || updatedQrs.length + 1) - 1)
            };
          })
        };
      });

      setAdminData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          adminBoxes: (prev.adminBoxes || []).map((b: any) => {
            const isMatch = b.id === targetBoxId || b.box_id === targetBoxId || b.box_code === targetBoxId || b.boxCode === targetBoxId || b.box_number === targetBoxId;
            if (!isMatch) return b;
            const updatedQrs = (b.productQrs || []).filter((q: string) => q !== qrCode);
            const updatedItems = (b.items || []).filter((i: any) => (typeof i === 'string' ? i : (i.qr_code || i.qr)) !== qrCode);
            return {
              ...b,
              productQrs: updatedQrs,
              items: updatedItems,
              activeFilledCount: Math.max(0, (b.activeFilledCount || 1) - 1),
              remainingCapacity: Math.min(b.capacity || 24, (b.remainingCapacity || 0) + 1)
            };
          })
        };
      });

      // Synchronize backend data
      await fetchReports();
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
        await apiFetch(`/api/admin/qc-logs/${encodeURIComponent(qc.id)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API qc delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            qcLogs: (base.qcLogs || []).filter((q: any) => q.id !== qc.id && q.item_qr !== qc.item_qr)
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            qcLogs: (prev.qcLogs || []).filter((q: any) => q.id !== qc.id && q.item_qr !== qc.item_qr)
          };
        });
        showToast(`QC record for '${qc.item_qr}' deleted.`, 'success');
      }
    });
  };

  const handleUnassignPreQc = async (productQr: string, preQcQr: string) => {
    if (!window.confirm(`Are you sure you want to remove Pre-QC barcode '${preQcQr}' from garment '${productQr}'?`)) {
      return;
    }
    try {
      await apiFetch(`/api/admin/pre-qc-assignments/${encodeURIComponent(productQr)}/${encodeURIComponent(preQcQr)}`, { method: 'DELETE' }).catch(err => {
        console.warn('API unassign pre-qc warning:', err);
      });
      showToast(`Pre-QC assignment '${preQcQr}' removed successfully.`, 'success');

      setSelectedPreQcModal((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          preQcs: (prev.preQcs || []).filter((q: string) => q !== preQcQr)
        };
      });

      setOpLogsData((prev: any) => {
        const base = prev || FALLBACK_OPERATIONAL_DATA;
        const updatedQc = (base.qcLogs || []).map((q: any) => {
          if (q.item_qr === productQr || q.qr_code === productQr) {
            let curList: string[] = [];
            if (Array.isArray(q.linked_pre_qc_qrs)) curList = q.linked_pre_qc_qrs;
            else if (typeof q.linked_pre_qc_qrs === 'string') curList = q.linked_pre_qc_qrs.split(',').map((s: string) => s.trim());
            return {
              ...q,
              linked_pre_qc_qrs: curList.filter(item => item !== preQcQr)
            };
          }
          return q;
        });
        const updatedPreQc = (base.preQcLogs || []).map((p: any) => {
          if (p.item_qr === preQcQr || p.pre_qc_qr === preQcQr) {
            return { ...p, assigned_qc_qr: null };
          }
          return p;
        });
        return {
          ...base,
          qcLogs: updatedQc,
          preQcLogs: updatedPreQc
        };
      });

      setAdminData((prev: any) => {
        if (!prev) return prev;
        const updatedQc = (prev.qcLogs || []).map((q: any) => {
          if (q.item_qr === productQr || q.qr_code === productQr) {
            let curList: string[] = [];
            if (Array.isArray(q.linked_pre_qc_qrs)) curList = q.linked_pre_qc_qrs;
            else if (typeof q.linked_pre_qc_qrs === 'string') curList = q.linked_pre_qc_qrs.split(',').map((s: string) => s.trim());
            return {
              ...q,
              linked_pre_qc_qrs: curList.filter(item => item !== preQcQr)
            };
          }
          return q;
        });
        return { ...prev, qcLogs: updatedQc };
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to remove Pre-QC assignment.', 'error');
    }
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
        await apiFetch(`/api/admin/pre-qc-logs/${encodeURIComponent(pq.id)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API pre-qc delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            preQcLogs: (base.preQcLogs || []).filter((p: any) => p.id !== pq.id && p.item_qr !== pq.item_qr)
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            preQcLogs: (prev.preQcLogs || []).filter((p: any) => p.id !== pq.id && p.item_qr !== pq.item_qr)
          };
        });
        showToast(`Pre-QC record for '${pq.item_qr}' deleted.`, 'success');
      }
    });
  };

  const handleDeleteAqlLog = (aql: any) => {
    const aqlId = aql.id || aql.box_id;
    const boxCode = aql.box_code || aql.box_number || aql.boxCode;
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete AQL Inspection Record?',
      description: `Are you sure you want to delete this AQL inspection for Box '${boxCode || aqlId}'?`,
      details: [
        { label: 'Box Identifier', value: boxCode || aqlId || 'N/A' },
        { label: 'PO Number', value: aql.po_number || aql.po_name || 'N/A' },
        { label: 'AQL Result', value: aql.result || 'PENDING' }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/aql-logs/${encodeURIComponent(aql.id || aql.box_id)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API aql delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            aqlLogs: (base.aqlLogs || []).filter((a: any) => a.id !== aql.id && a.box_code !== boxCode && a.box_number !== boxCode),
            finalAqlLogs: (base.finalAqlLogs || []).filter((a: any) => a.id !== aql.id && a.box_code !== boxCode && a.box_number !== boxCode)
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            aqlLogs: (prev.aqlLogs || []).filter((a: any) => a.id !== aql.id),
            finalAqlLogs: (prev.finalAqlLogs || []).filter((a: any) => a.id !== aql.id)
          };
        });
        showToast('AQL inspection record deleted.', 'success');
      }
    });
  };

  const handleDeleteTransferLog = (tr: any) => {
    const transferId = tr.id || tr.transfer_id;
    const sourceBox = tr.source_box || tr.source_box_code || tr.from_box || 'N/A';
    setGenericDeleteModal({
      isOpen: true,
      title: 'Delete Box Transfer Record?',
      description: `Are you sure you want to delete this transfer log (${tr.transfer_number || transferId})?`,
      details: [
        { label: 'Transfer ID', value: tr.transfer_number || transferId || 'N/A' },
        { label: 'Source Box', value: sourceBox },
        { label: 'Destination Box', value: tr.destination_box || tr.dest_box_code || tr.to_box || 'N/A' },
        { label: 'Items', value: `${tr.item_count || 1} pcs` }
      ],
      onConfirm: async () => {
        await apiFetch(`/api/admin/transfer-logs/${encodeURIComponent(transferId)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API transfer delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            transferLogs: (base.transferLogs || []).filter((t: any) => 
              (t.id || t.transfer_id) !== transferId && t.transfer_id !== transferId && t.id !== transferId
            )
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            boxTransfers: (prev.boxTransfers || []).filter((t: any) => (t.id || t.transfer_id) !== transferId)
          };
        });
        showToast('Box transfer record deleted.', 'success');
      }
    });
  };

  const handleDeleteScrapped = (scrapped: any) => {
    const scrapId = scrapped.id || scrapped.item_qr;
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
        await apiFetch(`/api/admin/scrapped/${encodeURIComponent(scrapId)}`, { method: 'DELETE' }).catch(err => {
          console.warn('API scrap delete warning:', err);
        });
        setOpLogsData((prev: any) => {
          const base = prev || FALLBACK_OPERATIONAL_DATA;
          return {
            ...base,
            scrappedLogs: (base.scrappedLogs || []).filter((s: any) => s.id !== scrapped.id && s.item_qr !== scrapped.item_qr)
          };
        });
        setAdminData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            recentScrapped: (prev.recentScrapped || []).filter((s: any) => s.id !== scrapped.id && s.item_qr !== scrapped.item_qr)
          };
        });
        showToast(`Scrapped item record '${scrapped.item_qr}' deleted.`, 'success');
      }
    });
  };

  // Realistic fallback audit dataset for local preview when database is not connected
  const FALLBACK_AUDIT_DATA: any[] = [
    {
      id: 'so-101',
      poId: 'po-101',
      soId: 'so-101',
      poNumber: 'PO-2026-8812',
      poName: 'PO-2026-8812',
      soNumber: 'SO-10101',
      soName: 'SO-10101 (MAP-SO-44)',
      styleName: 'Pro Dri-FIT Crew',
      customer: 'Nike Athletic',
      targetQuantity: 1500,
      plannedQty: 1500,
      preQc: 1480,
      qc: 1450,
      qcPassed: 1450,
      qcFailed: 30,
      packing: 1420,
      packedCount: 1420,
      aql: 12,
      aqlPassed: 12,
      aqlFailed: 0,
      finalAql: 12,
      finalAqlPassed: 12,
      transfers: 3,
      boxTransfers: 3,
      scrap: 8,
      scrappedCount: 8,
      completionPct: '95%',
      status: 'CURRENT',
      orderPathway: 'MULTI_TIER',
      createdAt: new Date().toISOString()
    },
    {
      id: 'so-102',
      poId: 'po-101',
      soId: 'so-102',
      poNumber: 'PO-2026-8812',
      poName: 'PO-2026-8812',
      soNumber: 'SO-10102',
      soName: 'SO-10102 (MAP-SO-45)',
      styleName: 'Pro Dri-FIT Crew',
      customer: 'Nike Athletic',
      targetQuantity: 1000,
      plannedQty: 1000,
      preQc: 980,
      qc: 960,
      qcPassed: 960,
      qcFailed: 20,
      packing: 940,
      packedCount: 940,
      aql: 8,
      aqlPassed: 8,
      aqlFailed: 0,
      finalAql: 8,
      finalAqlPassed: 8,
      transfers: 1,
      boxTransfers: 1,
      scrap: 4,
      scrappedCount: 4,
      completionPct: '94%',
      status: 'CURRENT',
      orderPathway: 'MULTI_TIER',
      createdAt: new Date().toISOString()
    },
    {
      id: 'so-201',
      poId: 'po-201',
      soId: 'so-201',
      poNumber: 'PO-2026-7734',
      poName: 'PO-2026-7734',
      soNumber: 'SO-20205',
      soName: 'SO-20205',
      styleName: 'Evostripe Hoodie',
      customer: 'Puma Sports',
      targetQuantity: 2000,
      plannedQty: 2000,
      preQc: 1920,
      qc: 1890,
      qcPassed: 1890,
      qcFailed: 30,
      packing: 1850,
      packedCount: 1850,
      aql: 16,
      aqlPassed: 16,
      aqlFailed: 1,
      finalAql: 15,
      finalAqlPassed: 15,
      transfers: 4,
      boxTransfers: 4,
      scrap: 12,
      scrappedCount: 12,
      completionPct: '93%',
      status: 'CURRENT',
      orderPathway: 'MULTI_TIER',
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
    },
    {
      id: 'po-301',
      poId: 'po-301',
      soId: null,
      poNumber: 'PO-2026-5590',
      poName: 'PO-2026-5590',
      soNumber: '',
      soName: 'No SO',
      styleName: 'Tech 2.0 Polo',
      customer: 'Under Armour',
      targetQuantity: 800,
      plannedQty: 800,
      preQc: 790,
      qc: 775,
      qcPassed: 775,
      qcFailed: 15,
      packing: 760,
      packedCount: 760,
      aql: 6,
      aqlPassed: 6,
      aqlFailed: 0,
      finalAql: 6,
      finalAqlPassed: 6,
      transfers: 2,
      boxTransfers: 2,
      scrap: 3,
      scrappedCount: 3,
      completionPct: '95%',
      status: 'CURRENT',
      orderPathway: 'PO_DIRECT',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      id: 'po-401',
      poId: 'po-401',
      soId: null,
      poNumber: 'PO-2026-3312',
      poName: 'PO-2026-3312',
      soNumber: '',
      soName: 'No SO',
      styleName: 'Classic Denim Shirt',
      customer: "Levi's Brand",
      targetQuantity: 1200,
      plannedQty: 1200,
      preQc: 1150,
      qc: 1120,
      qcPassed: 1120,
      qcFailed: 30,
      packing: 1080,
      packedCount: 1080,
      aql: 10,
      aqlPassed: 10,
      aqlFailed: 1,
      finalAql: 9,
      finalAqlPassed: 9,
      transfers: 5,
      boxTransfers: 5,
      scrap: 7,
      scrappedCount: 7,
      completionPct: '90%',
      status: 'CURRENT',
      orderPathway: 'PO_DIRECT',
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
    },
    {
      id: 'po-501',
      poId: 'po-501',
      soId: null,
      poNumber: '',
      poName: 'No PO & SO',
      soNumber: '',
      soName: 'No PO & SO',
      styleName: 'Scrubs V-Neck Standard',
      customer: 'BioTab Healthcare',
      targetQuantity: 600,
      plannedQty: 600,
      preQc: 590,
      qc: 580,
      qcPassed: 580,
      qcFailed: 10,
      packing: 570,
      packedCount: 570,
      aql: 5,
      aqlPassed: 5,
      aqlFailed: 0,
      finalAql: 5,
      finalAqlPassed: 5,
      transfers: 1,
      boxTransfers: 1,
      scrap: 2,
      scrappedCount: 2,
      completionPct: '95%',
      status: 'CURRENT',
      orderPathway: 'STYLE_DIRECT',
      createdAt: new Date().toISOString()
    },
    {
      id: 'po-502',
      poId: 'po-502',
      soId: null,
      poNumber: '',
      poName: 'No PO & SO',
      soNumber: '',
      soName: 'No PO & SO',
      styleName: 'Hospital Lab Coat',
      customer: 'BioTab Healthcare',
      targetQuantity: 450,
      plannedQty: 450,
      preQc: 440,
      qc: 430,
      qcPassed: 430,
      qcFailed: 10,
      packing: 420,
      packedCount: 420,
      aql: 4,
      aqlPassed: 4,
      aqlFailed: 0,
      finalAql: 4,
      finalAqlPassed: 4,
      transfers: 0,
      boxTransfers: 0,
      scrap: 1,
      scrappedCount: 1,
      completionPct: '93%',
      status: 'CURRENT',
      orderPathway: 'STYLE_DIRECT',
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      id: 'style-601',
      poId: null,
      soId: null,
      poNumber: '',
      poName: 'No PO & SO',
      soNumber: '',
      soName: 'No PO & SO',
      styleName: 'Trefoil Essential Tee',
      customer: 'Adidas Originals',
      targetQuantity: 0,
      plannedQty: 0,
      preQc: 0,
      qc: 0,
      qcPassed: 0,
      qcFailed: 0,
      qcPassRate: '100%',
      packing: 0,
      packedCount: 0,
      aql: 0,
      aqlPassed: 0,
      aqlFailed: 0,
      finalAql: 0,
      finalAqlPassed: 0,
      transfers: 0,
      boxTransfers: 0,
      scrap: 0,
      scrappedCount: 0,
      completionPct: '0%',
      status: 'REGISTERED',
      orderPathway: 'STYLE_ONLY',
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString()
    }
  ];

  // Realistic operational records fallback for local development (showing Pre-QC to QC Assignments)
  const FALLBACK_OPERATIONAL_DATA = {
    preQcLogs: [
      {
        id: 'pq-101',
        item_qr: 'PQ-NK-8801',
        assigned_qc_qr: 'QC-NK-0012',
        assigned_at: new Date(Date.now() - 3600000).toISOString(),
        assigned_by_name: 'Kamal Perera (Operator)',
        line_name: 'Line 1',
        operator_name: 'Sunil Jayasinghe',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 7200000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'pq-102',
        item_qr: 'PQ-NK-8802',
        assigned_qc_qr: 'QC-NK-0012',
        assigned_at: new Date(Date.now() - 3600000).toISOString(),
        assigned_by_name: 'Kamal Perera (Operator)',
        line_name: 'Line 1',
        operator_name: 'Sunil Jayasinghe',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 7100000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'pq-103',
        item_qr: 'PQ-NK-8803',
        assigned_qc_qr: 'QC-NK-0015',
        assigned_at: new Date(Date.now() - 2800000).toISOString(),
        assigned_by_name: 'Roshan Silva',
        line_name: 'Line 2',
        operator_name: 'Sunil Jayasinghe',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 6500000).toISOString(),
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        so_name: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'pq-104',
        item_qr: 'PQ-NK-8804',
        assigned_qc_qr: null,
        assigned_at: null,
        assigned_by_name: null,
        line_name: 'Line 1',
        operator_name: 'Sunil Jayasinghe',
        pre_qc_result: 'FAIL',
        failure_reason: 'Cutting Dimension Variance (>3mm)',
        scanned_at: new Date(Date.now() - 5000000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'pq-105',
        item_qr: 'PQ-AD-9011',
        assigned_qc_qr: 'QC-AD-5501',
        assigned_at: new Date(Date.now() - 4000000).toISOString(),
        assigned_by_name: 'Nimal Fernando',
        line_name: 'Line 3',
        operator_name: 'Anura Kumara',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 8000000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'pq-106',
        item_qr: 'PQ-AD-9012',
        assigned_qc_qr: null,
        assigned_at: null,
        assigned_by_name: null,
        line_name: 'Line 3',
        operator_name: 'Anura Kumara',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 3500000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'pq-107',
        item_qr: 'PQ-PM-7701',
        assigned_qc_qr: 'QC-PM-3001',
        assigned_at: new Date(Date.now() - 2100000).toISOString(),
        assigned_by_name: 'Manoj Dissanayake',
        line_name: 'Line 2',
        operator_name: 'Kasun Bandara',
        pre_qc_result: 'PASS',
        failure_reason: null,
        scanned_at: new Date(Date.now() - 4200000).toISOString(),
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        so_name: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        customer: 'Puma Sports'
      },
      {
        id: 'pq-108',
        item_qr: 'PQ-LV-3301',
        assigned_qc_qr: null,
        assigned_at: null,
        assigned_by_name: null,
        line_name: 'Line 4',
        operator_name: 'Dinesh Gamage',
        pre_qc_result: 'FAIL',
        failure_reason: 'Collar Stitch Skip defect',
        scanned_at: new Date(Date.now() - 1900000).toISOString(),
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      }
    ],
    qcLogs: [
      {
        id: 'qc-201',
        item_qr: 'QC-NK-0012',
        linked_pre_qc_qrs: 'PQ-NK-8801, PQ-NK-8802, PQ-NK-8803',
        line_name: 'Line 1',
        inspector_name: 'Kamal Perera',
        operator_name: 'Kamal Perera',
        qc_result: 'PASS',
        test_result: 'PASS',
        test_details: { 'Endline QC': 'PASS', 'Functional Test': 'PASS', 'Button Tension Test': 'PASS' },
        failure_reason: null,
        scanned_at: new Date(Date.now() - 3400000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'qc-202',
        item_qr: 'QC-NK-0015',
        linked_pre_qc_qrs: 'PQ-NK-8803, PQ-NK-8807',
        line_name: 'Line 2',
        inspector_name: 'Roshan Silva',
        operator_name: 'Roshan Silva',
        qc_result: 'PASS',
        test_result: 'PASS',
        test_details: { 'Endline QC': 'PASS', 'Functional Test': 'PASS' },
        failure_reason: null,
        scanned_at: new Date(Date.now() - 2500000).toISOString(),
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        so_name: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'qc-203',
        item_qr: 'QC-NK-0018',
        linked_pre_qc_qrs: null,
        line_name: 'Line 1',
        inspector_name: 'Kamal Perera',
        operator_name: 'Kamal Perera',
        qc_result: 'FAIL',
        test_result: 'FAIL',
        test_details: { 'Endline QC': 'FAIL', 'Functional Test': 'PASS' },
        failure_reason: 'Skipped Hem Stitch on Left Sleeve',
        scanned_at: new Date(Date.now() - 1800000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'qc-204',
        item_qr: 'QC-AD-5501',
        linked_pre_qc_qrs: 'PQ-AD-9011',
        line_name: 'Line 3',
        inspector_name: 'Nimal Fernando',
        operator_name: 'Nimal Fernando',
        qc_result: 'PASS',
        test_result: 'PASS',
        test_details: { 'Endline QC': 'PASS', 'Hood Stitch Test': 'PASS' },
        failure_reason: null,
        scanned_at: new Date(Date.now() - 3800000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'qc-205',
        item_qr: 'QC-PM-3001',
        linked_pre_qc_qrs: 'PQ-PM-7701',
        line_name: 'Line 2',
        inspector_name: 'Manoj Dissanayake',
        operator_name: 'Manoj Dissanayake',
        qc_result: 'PASS',
        test_result: 'PASS',
        test_details: { 'Endline QC': 'PASS', 'Seam Strength': 'PASS' },
        failure_reason: null,
        scanned_at: new Date(Date.now() - 1500000).toISOString(),
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        so_name: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        customer: 'Puma Sports'
      },
      {
        id: 'qc-206',
        item_qr: 'QC-UA-1102',
        linked_pre_qc_qrs: null,
        line_name: 'Line 4',
        inspector_name: 'Chathura Senanayake',
        operator_name: 'Chathura Senanayake',
        qc_result: 'PASS',
        test_result: 'PASS',
        test_details: { 'Endline QC': 'PASS' },
        failure_reason: null,
        scanned_at: new Date(Date.now() - 1100000).toISOString(),
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        so_name: 'No SO',
        style_name: 'Tech 2.0 Polo',
        customer: 'Under Armour'
      },
      {
        id: 'qc-207',
        item_qr: 'QC-LV-8820',
        linked_pre_qc_qrs: null,
        line_name: 'Line 4',
        inspector_name: 'Dinesh Gamage',
        operator_name: 'Dinesh Gamage',
        qc_result: 'FAIL',
        test_result: 'FAIL',
        test_details: { 'Endline QC': 'FAIL', 'Button Hole Test': 'FAIL' },
        failure_reason: 'Button alignment off by 4mm',
        scanned_at: new Date(Date.now() - 900000).toISOString(),
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      }
    ],
    packingLogs: [
      {
        id: 'box-nk-01',
        box_id: 'box-nk-01',
        box_code: 'BX-NK-2026-001',
        box_number: 'BX-NK-2026-001',
        boxCode: 'BX-NK-2026-001',
        boxNumber: 'BX-NK-2026-001',
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        poNumber: 'PO-2026-8801',
        so_name: 'SO-10101',
        soName: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        styleName: 'AeroReact Running Tee',
        customer: 'Nike USA',
        line_name: 'Line 1',
        lineName: 'Line 1',
        capacity: 24,
        current_fill: 12,
        activeFilledCount: 12,
        remainingCapacity: 12,
        box_status: 'COMPLETED',
        status: 'COMPLETED',
        aqlStatus: 'PASS',
        packed_by_name: 'Nimal Fernando',
        packed_at: new Date(Date.now() - 2000000).toISOString(),
        created_at: new Date(Date.now() - 2000000).toISOString(),
        productQrs: [
          'QC-NK-0012', 'QC-NK-0013', 'QC-NK-0014', 'QC-NK-0015',
          'QC-NK-0016', 'QC-NK-0017', 'QC-NK-0018', 'QC-NK-0019',
          'QC-NK-0020', 'QC-NK-0021', 'QC-NK-0022', 'QC-NK-0023'
        ],
        items: [
          'QC-NK-0012', 'QC-NK-0013', 'QC-NK-0014', 'QC-NK-0015',
          'QC-NK-0016', 'QC-NK-0017', 'QC-NK-0018', 'QC-NK-0019',
          'QC-NK-0020', 'QC-NK-0021', 'QC-NK-0022', 'QC-NK-0023'
        ].map(q => ({ qr_code: q, size: 'M', packed_at: new Date(Date.now() - 2000000).toISOString(), packed_by_name: 'Nimal Fernando' }))
      },
      {
        id: 'box-nk-02',
        box_id: 'box-nk-02',
        box_code: 'BX-NK-2026-002',
        box_number: 'BX-NK-2026-002',
        boxCode: 'BX-NK-2026-002',
        boxNumber: 'BX-NK-2026-002',
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        poNumber: 'PO-2026-8802',
        so_name: 'SO-10102',
        soName: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        styleName: 'AeroReact Running Tee',
        customer: 'Nike USA',
        line_name: 'Line 2',
        lineName: 'Line 2',
        capacity: 24,
        current_fill: 8,
        activeFilledCount: 8,
        remainingCapacity: 16,
        box_status: 'OPEN',
        status: 'OPEN',
        aqlStatus: 'PENDING',
        packed_by_name: 'Roshan Silva',
        packed_at: new Date(Date.now() - 1500000).toISOString(),
        created_at: new Date(Date.now() - 1500000).toISOString(),
        productQrs: [
          'QC-NK-0031', 'QC-NK-0032', 'QC-NK-0033', 'QC-NK-0034',
          'QC-NK-0035', 'QC-NK-0036', 'QC-NK-0037', 'QC-NK-0038'
        ],
        items: [
          'QC-NK-0031', 'QC-NK-0032', 'QC-NK-0033', 'QC-NK-0034',
          'QC-NK-0035', 'QC-NK-0036', 'QC-NK-0037', 'QC-NK-0038'
        ].map(q => ({ qr_code: q, size: 'L', packed_at: new Date(Date.now() - 1500000).toISOString(), packed_by_name: 'Roshan Silva' }))
      },
      {
        id: 'box-ad-01',
        box_id: 'box-ad-01',
        box_code: 'BX-AD-2026-001',
        box_number: 'BX-AD-2026-001',
        boxCode: 'BX-AD-2026-001',
        boxNumber: 'BX-AD-2026-001',
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        poNumber: 'PO-2026-9012',
        so_name: 'SO-20205',
        soName: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        styleName: 'Primegreen Training Hood',
        customer: 'Adidas Global',
        line_name: 'Line 3',
        lineName: 'Line 3',
        capacity: 20,
        current_fill: 6,
        activeFilledCount: 6,
        remainingCapacity: 14,
        box_status: 'COMPLETED',
        status: 'COMPLETED',
        aqlStatus: 'PASS',
        packed_by_name: 'Charith Bandara',
        packed_at: new Date(Date.now() - 3000000).toISOString(),
        created_at: new Date(Date.now() - 3000000).toISOString(),
        productQrs: ['QC-AD-5501', 'QC-AD-5502', 'QC-AD-5503', 'QC-AD-5504', 'QC-AD-5505', 'QC-AD-5506'],
        items: ['QC-AD-5501', 'QC-AD-5502', 'QC-AD-5503', 'QC-AD-5504', 'QC-AD-5505', 'QC-AD-5506'].map(q => ({ qr_code: q, size: 'XL', packed_at: new Date(Date.now() - 3000000).toISOString(), packed_by_name: 'Charith Bandara' }))
      },
      {
        id: 'box-pm-01',
        box_id: 'box-pm-01',
        box_code: 'BX-PM-2026-001',
        box_number: 'BX-PM-2026-001',
        boxCode: 'BX-PM-2026-001',
        boxNumber: 'BX-PM-2026-001',
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        poNumber: 'PO-2026-7734',
        so_name: 'SO-20205',
        soName: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        styleName: 'Evostripe Hoodie',
        customer: 'Puma Sports',
        line_name: 'Line 2',
        lineName: 'Line 2',
        capacity: 20,
        current_fill: 5,
        activeFilledCount: 5,
        remainingCapacity: 15,
        box_status: 'OPEN',
        status: 'OPEN',
        aqlStatus: 'PENDING',
        packed_by_name: 'Kasun Bandara',
        packed_at: new Date(Date.now() - 1100000).toISOString(),
        created_at: new Date(Date.now() - 1100000).toISOString(),
        productQrs: ['QC-PM-3001', 'QC-PM-3002', 'QC-PM-3003', 'QC-PM-3004', 'QC-PM-3005'],
        items: ['QC-PM-3001', 'QC-PM-3002', 'QC-PM-3003', 'QC-PM-3004', 'QC-PM-3005'].map(q => ({ qr_code: q, size: 'S', packed_at: new Date(Date.now() - 1100000).toISOString(), packed_by_name: 'Kasun Bandara' }))
      },
      {
        id: 'box-ua-01',
        box_id: 'box-ua-01',
        box_code: 'BX-UA-2026-001',
        box_number: 'BX-UA-2026-001',
        boxCode: 'BX-UA-2026-001',
        boxNumber: 'BX-UA-2026-001',
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        poNumber: 'PO-2026-5590',
        so_name: 'No SO',
        soName: 'No SO',
        style_name: 'Tech 2.0 Polo',
        styleName: 'Tech 2.0 Polo',
        customer: 'Under Armour',
        line_name: 'Line 4',
        lineName: 'Line 4',
        capacity: 25,
        current_fill: 6,
        activeFilledCount: 6,
        remainingCapacity: 19,
        box_status: 'COMPLETED',
        status: 'COMPLETED',
        aqlStatus: 'PASS',
        packed_by_name: 'Chathura Senanayake',
        packed_at: new Date(Date.now() - 950000).toISOString(),
        created_at: new Date(Date.now() - 950000).toISOString(),
        productQrs: ['QC-UA-1101', 'QC-UA-1102', 'QC-UA-1103', 'QC-UA-1104', 'QC-UA-1105', 'QC-UA-1106'],
        items: ['QC-UA-1101', 'QC-UA-1102', 'QC-UA-1103', 'QC-UA-1104', 'QC-UA-1105', 'QC-UA-1106'].map(q => ({ qr_code: q, size: 'M', packed_at: new Date(Date.now() - 950000).toISOString(), packed_by_name: 'Chathura Senanayake' }))
      },
      {
        id: 'box-lv-01',
        box_id: 'box-lv-01',
        box_code: 'BX-LV-2026-001',
        box_number: 'BX-LV-2026-001',
        boxCode: 'BX-LV-2026-001',
        boxNumber: 'BX-LV-2026-001',
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        poNumber: 'PO-2026-3312',
        so_name: 'No SO',
        soName: 'No SO',
        style_name: 'Classic Denim Shirt',
        styleName: 'Classic Denim Shirt',
        customer: "Levi's Brand",
        line_name: 'Line 4',
        lineName: 'Line 4',
        capacity: 20,
        current_fill: 4,
        activeFilledCount: 4,
        remainingCapacity: 16,
        box_status: 'OPEN',
        status: 'OPEN',
        aqlStatus: 'PENDING',
        packed_by_name: 'Dinesh Gamage',
        packed_at: new Date(Date.now() - 800000).toISOString(),
        created_at: new Date(Date.now() - 800000).toISOString(),
        productQrs: ['QC-LV-8801', 'QC-LV-8802', 'QC-LV-8803', 'QC-LV-8804'],
        items: ['QC-LV-8801', 'QC-LV-8802', 'QC-LV-8803', 'QC-LV-8804'].map(q => ({ qr_code: q, size: 'L', packed_at: new Date(Date.now() - 800000).toISOString(), packed_by_name: 'Dinesh Gamage' }))
      }
    ],
    aqlLogs: [
      {
        id: 'aql-401',
        box_code: 'BX-NK-2026-001',
        line_name: 'Line 1',
        inspector_name: 'Samantha Wickrama',
        required_samples: 5,
        sampled_count: 5,
        result: 'PASS',
        failure_reason: null,
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 1200000).toISOString(),
        created_at: new Date(Date.now() - 1200000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'aql-402',
        box_code: 'BX-AD-2026-001',
        line_name: 'Line 3',
        inspector_name: 'Samantha Wickrama',
        required_samples: 5,
        sampled_count: 5,
        result: 'PASS',
        failure_reason: null,
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 2200000).toISOString(),
        created_at: new Date(Date.now() - 2200000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'aql-403',
        box_code: 'BX-PM-2026-001',
        line_name: 'Line 2',
        inspector_name: 'Nuwan Alwis',
        required_samples: 5,
        sampled_count: 5,
        result: 'FAIL',
        failure_reason: '2 Hood Drawstring knots missing',
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 1600000).toISOString(),
        created_at: new Date(Date.now() - 1600000).toISOString(),
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        so_name: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        customer: 'Puma Sports'
      },
      {
        id: 'aql-404',
        box_code: 'BX-UA-2026-001',
        line_name: 'Line 4',
        inspector_name: 'Samantha Wickrama',
        required_samples: 5,
        sampled_count: 5,
        result: 'PASS',
        failure_reason: null,
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 900000).toISOString(),
        created_at: new Date(Date.now() - 900000).toISOString(),
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        so_name: 'No SO',
        style_name: 'Tech 2.0 Polo',
        customer: 'Under Armour'
      },
      {
        id: 'aql-405',
        box_code: 'BX-LV-2026-001',
        line_name: 'Line 4',
        inspector_name: 'Nuwan Alwis',
        required_samples: 5,
        sampled_count: 5,
        result: 'PASS',
        failure_reason: null,
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 750000).toISOString(),
        created_at: new Date(Date.now() - 750000).toISOString(),
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      },
      {
        id: 'aql-406',
        box_code: 'BX-NK-2026-002',
        line_name: 'Line 2',
        inspector_name: 'Samantha Wickrama',
        required_samples: 5,
        sampled_count: 5,
        result: 'PASS',
        failure_reason: null,
        stage: 'NORMAL',
        audited_at: new Date(Date.now() - 500000).toISOString(),
        created_at: new Date(Date.now() - 500000).toISOString(),
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        so_name: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      }
    ],
    finalAqlLogs: [
      {
        id: 'faql-501',
        box_code: 'BX-NK-2026-001',
        line_name: 'Line 1',
        inspector_name: 'Nuwan Alwis (QA Manager)',
        required_samples: 8,
        sampled_count: 8,
        result: 'PASS',
        failure_reason: 'Shipment Clearance Approved',
        stage: 'FINAL_AQL',
        audited_at: new Date(Date.now() - 600000).toISOString(),
        created_at: new Date(Date.now() - 600000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'faql-502',
        box_code: 'BX-AD-2026-001',
        line_name: 'Line 3',
        inspector_name: 'Nuwan Alwis (QA Manager)',
        required_samples: 8,
        sampled_count: 8,
        result: 'PASS',
        failure_reason: 'Final Export Gate Passed',
        stage: 'FINAL_AQL',
        audited_at: new Date(Date.now() - 1400000).toISOString(),
        created_at: new Date(Date.now() - 1400000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'faql-503',
        box_code: 'BX-UA-2026-001',
        line_name: 'Line 4',
        inspector_name: 'Nuwan Alwis (QA Manager)',
        required_samples: 8,
        sampled_count: 8,
        result: 'PASS',
        failure_reason: 'Shipment Approved for USA Distribution',
        stage: 'FINAL_AQL',
        audited_at: new Date(Date.now() - 700000).toISOString(),
        created_at: new Date(Date.now() - 700000).toISOString(),
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        so_name: 'No SO',
        style_name: 'Tech 2.0 Polo',
        customer: 'Under Armour'
      },
      {
        id: 'faql-504',
        box_code: 'BX-LV-2026-001',
        line_name: 'Line 4',
        inspector_name: 'Nuwan Alwis (QA Manager)',
        required_samples: 8,
        sampled_count: 8,
        result: 'PASS',
        failure_reason: 'Cleared for Local Warehouse Bay',
        stage: 'FINAL_AQL',
        audited_at: new Date(Date.now() - 450000).toISOString(),
        created_at: new Date(Date.now() - 450000).toISOString(),
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      },
      {
        id: 'faql-505',
        box_code: 'BX-NK-2026-002',
        line_name: 'Line 2',
        inspector_name: 'Nuwan Alwis (QA Manager)',
        required_samples: 8,
        sampled_count: 8,
        result: 'PASS',
        failure_reason: 'Clearance Approved with 100% barcode validation',
        stage: 'FINAL_AQL',
        audited_at: new Date(Date.now() - 350000).toISOString(),
        created_at: new Date(Date.now() - 350000).toISOString(),
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        so_name: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      }
    ],
    transferLogs: [
      {
        transfer_id: 'TRF-8801',
        source_box_code: 'BX-NK-2026-001',
        dest_box_code: 'WH-BAY-02 (Warehouse)',
        item_count: 24,
        transferred_by_name: 'Charith Bandara',
        line_name: 'Line 1',
        transferred_at: new Date(Date.now() - 400000).toISOString(),
        remarks: 'Transferred to Finished Goods Storage Bay B',
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        transfer_id: 'TRF-8802',
        source_box_code: 'BX-AD-2026-001',
        dest_box_code: 'WH-BAY-04 (Warehouse)',
        item_count: 20,
        transferred_by_name: 'Samantha Silva',
        line_name: 'Line 3',
        transferred_at: new Date(Date.now() - 850000).toISOString(),
        remarks: 'Transferred for pallet stacking',
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        transfer_id: 'TRF-8803',
        source_box_code: 'BX-PM-2026-001',
        dest_box_code: 'QC-REWORK-BAY',
        item_count: 5,
        transferred_by_name: 'Kasun Bandara',
        line_name: 'Line 2',
        transferred_at: new Date(Date.now() - 1100000).toISOString(),
        remarks: 'Moved to Rework Bay for drawstring adjustment',
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        so_name: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        customer: 'Puma Sports'
      },
      {
        transfer_id: 'TRF-8804',
        source_box_code: 'BX-UA-2026-001',
        dest_box_code: 'WH-BAY-01 (Export Staging)',
        item_count: 25,
        transferred_by_name: 'Chathura Senanayake',
        line_name: 'Line 4',
        transferred_at: new Date(Date.now() - 620000).toISOString(),
        remarks: 'Staged for shipping container loading',
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        so_name: 'No SO',
        style_name: 'Tech 2.0 Polo',
        customer: 'Under Armour'
      },
      {
        transfer_id: 'TRF-8805',
        source_box_code: 'BX-LV-2026-001',
        dest_box_code: 'WH-BAY-05',
        item_count: 15,
        transferred_by_name: 'Dinesh Gamage',
        line_name: 'Line 4',
        transferred_at: new Date(Date.now() - 510000).toISOString(),
        remarks: 'Transferred to primary finished goods storage',
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      },
      {
        transfer_id: 'TRF-8806',
        source_box_code: 'BX-NK-2026-002',
        dest_box_code: 'WH-BAY-02 (Warehouse)',
        item_count: 18,
        transferred_by_name: 'Charith Bandara',
        line_name: 'Line 1',
        transferred_at: new Date(Date.now() - 250000).toISOString(),
        remarks: 'Transferred for sealing and tagging',
        po_number: 'PO-2026-8802',
        po_name: 'PO-2026-8802',
        so_name: 'SO-10102',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      }
    ],
    scrappedLogs: [
      {
        id: 'scr-701',
        item_qr: 'QC-NK-0018',
        line_name: 'Line 1',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Fabric Tear during needle stitch repair',
        removed_by_name: 'Kamal Perera (Supervisor)',
        removed_at: new Date(Date.now() - 1200000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      },
      {
        id: 'scr-702',
        item_qr: 'QC-LV-8820',
        line_name: 'Line 4',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Permanent Oil Stain on chest panel',
        removed_by_name: 'Dinesh Gamage (Supervisor)',
        removed_at: new Date(Date.now() - 880000).toISOString(),
        po_number: 'PO-2026-3312',
        po_name: 'PO-2026-3312',
        so_name: 'No SO',
        style_name: 'Classic Denim Shirt',
        customer: "Levi's Brand"
      },
      {
        id: 'scr-703',
        item_qr: 'QC-PM-3088',
        line_name: 'Line 2',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Needle punch hole on front kangaroo pocket',
        removed_by_name: 'Manoj Dissanayake (Supervisor)',
        removed_at: new Date(Date.now() - 1500000).toISOString(),
        po_number: 'PO-2026-7734',
        po_name: 'PO-2026-7734',
        so_name: 'SO-20205',
        style_name: 'Evostripe Hoodie',
        customer: 'Puma Sports'
      },
      {
        id: 'scr-704',
        item_qr: 'QC-AD-5599',
        line_name: 'Line 3',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Severe fabric shade variation (>Delta E 2.5)',
        removed_by_name: 'Nimal Fernando (Supervisor)',
        removed_at: new Date(Date.now() - 2100000).toISOString(),
        po_number: 'PO-2026-9012',
        po_name: 'PO-2026-9012',
        so_name: 'SO-20205',
        style_name: 'Primegreen Training Hood',
        customer: 'Adidas Global'
      },
      {
        id: 'scr-705',
        item_qr: 'QC-UA-1199',
        line_name: 'Line 4',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Collar seam cut during trimming',
        removed_by_name: 'Chathura Senanayake (Supervisor)',
        removed_at: new Date(Date.now() - 650000).toISOString(),
        po_number: 'PO-2026-5590',
        po_name: 'PO-2026-5590',
        so_name: 'No SO',
        style_name: 'Tech 2.0 Polo',
        customer: 'Under Armour'
      },
      {
        id: 'scr-706',
        item_qr: 'QC-NK-0099',
        line_name: 'Line 1',
        action_type: 'PERMANENTLY_REMOVED',
        reason: 'Heat transfer logo burn mark',
        removed_by_name: 'Kamal Perera (Supervisor)',
        removed_at: new Date(Date.now() - 320000).toISOString(),
        po_number: 'PO-2026-8801',
        po_name: 'PO-2026-8801',
        so_name: 'SO-10101',
        style_name: 'AeroReact Running Tee',
        customer: 'Nike USA'
      }
    ]
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (timeRange.toLowerCase() !== 'all') {
        qParams.set('range', timeRange.toLowerCase());
      } else {
        qParams.set('range', 'all');
      }
      if (selectedDateFrom) qParams.set('startDate', selectedDateFrom);
      if (selectedDateTo) qParams.set('endDate', selectedDateTo);
      if (selectedPoFilter) qParams.set('poId', selectedPoFilter);
      if (selectedStyleFilter) qParams.set('styleName', selectedStyleFilter);
      if (selectedCustomerFilter) qParams.set('customer', selectedCustomerFilter);
      const queryStr = qParams.toString() ? `?${qParams.toString()}` : '';

      const [repRes, admRes, opLogsRes] = await Promise.all([
        apiFetch(`/api/reports/production${queryStr}`).catch(() => null),
        apiFetch(`/api/dashboard/admin`).catch(() => null),
        apiFetch(`/api/reports/operational-logs${queryStr}`).catch(() => null)
      ]);
      setReportData(repRes);
      setAdminData(admRes);
      if (opLogsRes && typeof opLogsRes === 'object') {
        setOpLogsData(opLogsRes);
      } else {
        setOpLogsData((prev: any) => prev || FALLBACK_OPERATIONAL_DATA);
      }
    } catch (err: any) {
      console.warn('Production reports API unavailable, falling back to local dataset:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    setVisibleCounts({
      preqc: 50,
      qc: 50,
      packing: 50,
      aql: 50,
      final_aql: 50,
      transfers: 50,
      scrapped: 50
    });
  }, [timeRange, selectedDateFrom, selectedDateTo, selectedCustomerFilter, selectedStyleFilter, selectedPoFilter]);

  useEffect(() => {
    if (activeLogTab === 'all') {
      fetchAllMergedPreview(0, false);
    }
  }, [activeLogTab, timeRange, tabTimeRange, selectedDateFrom, selectedDateTo, tabDateFrom, tabDateTo, selectedCustomerFilter, selectedStyleFilter, selectedPoFilter, selectedSoFilter, selectedSizeFilter, tabResultFilters.all, tabSearchTerm]);

  // Prioritize real database records when connected on VM; fallback smoothly if empty or local DB disconnected
  const rawPoBreakdown: any[] = (reportData?.poBreakdown && reportData.poBreakdown.length > 0)
    ? reportData.poBreakdown
    : FALLBACK_AUDIT_DATA;

  const availableCustomers: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.customer).filter(Boolean))).sort();
  const availableStyles: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.styleName).filter(Boolean))).sort();
  const availablePos: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.poName || p.poNumber).filter(p => p && p !== 'No PO & SO'))).sort();
  const availableSos: string[] = Array.from(new Set(rawPoBreakdown.map(p => p.soName || p.soNumber).filter(p => p && p !== 'No SO' && p !== 'No PO & SO'))).sort();

  const filteredOrders = rawPoBreakdown.filter(p => {
    if (selectedCustomerFilter && p.customer !== selectedCustomerFilter) return false;
    if (selectedStyleFilter && p.styleName !== selectedStyleFilter) return false;
    if (selectedPoFilter && p.poName !== selectedPoFilter && p.poNumber !== selectedPoFilter) return false;
    if (selectedSoFilter && p.soName !== selectedSoFilter && p.soNumber !== selectedSoFilter) return false;

    if (p.createdAt) {
      const itemDate = new Date(p.createdAt).toISOString().slice(0, 10);
      if (selectedDateFrom && itemDate < selectedDateFrom) return false;
      if (selectedDateTo && itemDate > selectedDateTo) return false;
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const combined = `${p.customer || ''} ${p.styleName || ''} ${p.poName || ''} ${p.poNumber || ''} ${p.soName || ''} ${p.soNumber || ''}`.toLowerCase();
      if (!combined.includes(term)) return false;
    }

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

  // 1. Pre QC Logs (with Pre-QC to QC Assignment link)
  const rawPreQcLogs: any[] = (opLogsData && opLogsData.preQcLogs !== undefined)
    ? opLogsData.preQcLogs
    : (adminData?.preQcLogs && adminData.preQcLogs.length > 0 ? adminData.preQcLogs : FALLBACK_OPERATIONAL_DATA.preQcLogs);

  // 2. QC Inspection Logs (with Linked Pre-QC QRs)
  const rawQcLogs: any[] = (opLogsData && opLogsData.qcLogs !== undefined)
    ? opLogsData.qcLogs
    : (adminData?.qcLogs && adminData.qcLogs.length > 0 ? adminData.qcLogs : FALLBACK_OPERATIONAL_DATA.qcLogs);

  // 3. Carton Packing Logs (Box-Level for Batch Inspection & Individual Item Removal)
  const rawPackingLogs: any[] = (opLogsData && opLogsData.packingLogs !== undefined)
    ? opLogsData.packingLogs
    : (adminData?.adminBoxes && adminData.adminBoxes.length > 0
        ? adminData.adminBoxes.map((b: any) => ({
            id: b.id,
            box_id: b.id,
            boxCode: b.boxCode || b.boxNumber,
            boxNumber: b.boxNumber || b.boxCode,
            box_code: b.boxCode || b.boxNumber,
            box_number: b.boxNumber || b.boxCode,
            capacity: Number(b.capacity || 24),
            current_fill: Number(b.activeFilledCount || (b.productQrs?.length || 0)),
            activeFilledCount: Number(b.activeFilledCount || (b.productQrs?.length || 0)),
            remainingCapacity: Math.max(0, Number(b.capacity || 24) - Number(b.activeFilledCount || (b.productQrs?.length || 0))),
            box_status: b.status || 'COMPLETED',
            status: b.status || 'COMPLETED',
            line_name: b.lineName || 'Line 1',
            lineName: b.lineName || 'Line 1',
            packed_at: b.created_at,
            created_at: b.created_at,
            po_number: b.poNumber || b.po_number,
            po_name: b.poName || b.po_name,
            poNumber: b.poNumber || b.po_number,
            so_name: b.soName || b.so_name || 'No SO',
            soName: b.soName || b.so_name || 'No SO',
            style_name: b.styleName || b.style_name,
            styleName: b.styleName || b.style_name,
            customer: b.customer,
            packed_by_name: b.packed_by_name || b.items?.[0]?.packed_by_name || 'Nimal Fernando',
            productQrs: b.productQrs || (b.items || []).map((it: any) => it.qr_code || it.qr),
            items: b.items || (b.productQrs || []).map((qr: string) => ({ qr_code: qr, size: 'M', packed_at: b.created_at, packed_by_name: b.packed_by_name || 'Nimal Fernando' }))
          }))
        : FALLBACK_OPERATIONAL_DATA.packingLogs);

  // 4. AQL Logs (Normal Stage)
  const rawAqlLogs: any[] = (opLogsData && opLogsData.aqlLogs !== undefined)
    ? opLogsData.aqlLogs
    : (adminData?.aqlLogs && adminData.aqlLogs.length > 0 ? adminData.aqlLogs : FALLBACK_OPERATIONAL_DATA.aqlLogs);

  // 5. Final AQL Logs (Shipment Gate Stage)
  const rawFinalAqlLogs: any[] = (opLogsData && opLogsData.finalAqlLogs !== undefined)
    ? opLogsData.finalAqlLogs
    : (adminData?.finalAqlLogs && adminData.finalAqlLogs.length > 0 ? adminData.finalAqlLogs : FALLBACK_OPERATIONAL_DATA.finalAqlLogs);

  // 6. Box Transfers Log
  const rawTransferLogs: any[] = (opLogsData && opLogsData.transferLogs !== undefined)
    ? opLogsData.transferLogs
    : (adminData?.boxTransfers && adminData.boxTransfers.length > 0 ? adminData.boxTransfers : FALLBACK_OPERATIONAL_DATA.transferLogs);

  // 7. Scrapped Items Log
  const rawScrapped: any[] = (opLogsData && opLogsData.scrappedLogs !== undefined)
    ? opLogsData.scrappedLogs
    : (adminData?.recentScrapped && adminData.recentScrapped.length > 0 ? adminData.recentScrapped : FALLBACK_OPERATIONAL_DATA.scrappedLogs);

  const availableLines: string[] = adminData?.filter?.availableLines || ['Line 1', 'Line 2', 'Line 3', 'Line 4'];

  // Extract size from barcodes like "PNFL-SS-111" -> "SS"
  const extractSizeFromQr = (qr?: string | null): string => {
    if (!qr || typeof qr !== 'string') return '';
    const trimmed = qr.trim().toUpperCase();
    const parts = trimmed.split('-');
    if (parts.length >= 3 && parts[1]) {
      return parts[1].trim();
    }
    return '';
  };

  const getItemSizes = (item: any): string[] => {
    const sizes = new Set<string>();
    const addSize = (val?: string | null) => {
      if (val && typeof val === 'string' && val.trim()) {
        sizes.add(val.trim().toUpperCase());
      }
    };
    const addFromQr = (qr?: string | null) => {
      const s = extractSizeFromQr(qr);
      if (s) sizes.add(s);
    };

    addSize(item.item_size || item.size);
    addFromQr(item.item_qr || item.qr_code || item.qcQrBarcode);
    addFromQr(item.assigned_qc_qr);

    if (Array.isArray(item.productQrs)) {
      item.productQrs.forEach((q: string) => addFromQr(q));
    }
    const qrsStr = item.packed_qrs_str || item.box_qrs_str;
    if (typeof qrsStr === 'string' && qrsStr.trim()) {
      qrsStr.split(',').forEach((q: string) => addFromQr(q));
    }

    return Array.from(sizes);
  };

  const availableSizes: string[] = Array.from(
    new Set([
      ...rawPreQcLogs.flatMap(getItemSizes),
      ...rawQcLogs.flatMap(getItemSizes),
      ...rawPackingLogs.flatMap(getItemSizes),
      ...rawAqlLogs.flatMap(getItemSizes),
      ...rawFinalAqlLogs.flatMap(getItemSizes),
      ...rawTransferLogs.flatMap(getItemSizes),
      ...rawScrapped.flatMap(getItemSizes)
    ].filter(Boolean))
  ).sort();

  // Inspection section multi-attribute filter helper
  const matchesInspectionFilters = (item: any) => {
    const itemCustomer = (item.customer || '').toLowerCase();
    const itemStyle = (item.style_name || item.styleName || item.name || '').toLowerCase();
    const itemPoCombined = `${item.po_number || ''} ${item.poNumber || ''} ${item.po_name || ''} ${item.poName || ''}`.toLowerCase();
    const itemSoCombined = `${item.so_number || ''} ${item.soNumber || ''} ${item.so_name || ''} ${item.soName || ''}`.toLowerCase();
    const itemLine = (item.line_name || item.lineName || item.line || item.line_number || '').toLowerCase();
    const rawDate = item.scanned_at || item.created_at || item.started_at || item.completed_at || item.removed_at || item.packed_at || item.transferred_at || '';
    
    // Convert to Sri Lanka local date (YYYY-MM-DD)
    let itemDate = '';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          itemDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
        }
      } catch {}
    }

    if (selectedCustomerFilter && itemCustomer && !itemCustomer.includes(selectedCustomerFilter.toLowerCase())) return false;
    if (selectedStyleFilter && itemStyle && !itemStyle.includes(selectedStyleFilter.toLowerCase())) return false;
    if (selectedPoFilter && itemPoCombined.trim() && !itemPoCombined.includes(selectedPoFilter.toLowerCase())) return false;
    if (selectedSoFilter && itemSoCombined.trim() && !itemSoCombined.includes(selectedSoFilter.toLowerCase())) return false;
    if (selectedLineFilter && (!itemLine || !itemLine.includes(selectedLineFilter.toLowerCase()))) return false;
    if (selectedSizeFilter) {
      const sizes = getItemSizes(item);
      if (!sizes.includes(selectedSizeFilter.toUpperCase())) return false;
    }
    
    // Tab time range filtering (Today, Weekly, Monthly, All)
    if (tabTimeRange !== 'All' && itemDate) {
      const todaySl = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
      if (tabTimeRange === 'Today') {
        if (itemDate !== todaySl) return false;
      } else if (tabTimeRange === 'Weekly') {
        const now = new Date();
        const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
        if (itemDate < pastWeek || itemDate > todaySl) return false;
      } else if (tabTimeRange === 'Monthly') {
        const now = new Date();
        const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
        if (itemDate < pastMonth || itemDate > todaySl) return false;
      }
    }

    if (tabDateFrom && itemDate && itemDate < tabDateFrom) return false;
    if (tabDateTo && itemDate && itemDate > tabDateTo) return false;
    if (selectedDateFilter && itemDate && itemDate !== selectedDateFilter) return false;

    if (tabSearchTerm.trim()) {
      const term = tabSearchTerm.toLowerCase();
      const str = JSON.stringify(item).toLowerCase();
      if (!str.includes(term)) return false;
    }

    return true;
  };

  const sortByLatest = (list: any[]) => [...list].sort((a, b) => {
    const rawA = a.scanned_at || a.created_at || a.started_at || a.completed_at || a.removed_at || a.packed_at || a.transferred_at || a.audited_at || 0;
    const rawB = b.scanned_at || b.created_at || b.started_at || b.completed_at || b.removed_at || b.packed_at || b.transferred_at || b.audited_at || 0;
    const timeA = rawA ? new Date(rawA).getTime() : 0;
    const timeB = rawB ? new Date(rawB).getTime() : 0;
    return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
  });

  const matchesResultFilter = (item: any, tabKey: string): boolean => {
    const rf = tabResultFilters[tabKey] || 'ALL';
    if (rf === 'ALL') return true;
    if (tabKey === 'preqc') {
      const res = (item.pre_qc_result || 'PASS').toUpperCase();
      return rf === 'PASS' ? res === 'PASS' : res === 'FAIL';
    }
    if (tabKey === 'qc') {
      const qcRes = (item.qc_result || 'PASS').toUpperCase();
      const testRes = (item.test_result || 'PASS').toUpperCase();
      const isFail = qcRes === 'FAIL' || testRes === 'FAIL';
      return rf === 'PASS' ? !isFail : isFail;
    }
    if (tabKey === 'packing') {
      const st = (item.box_status || item.status || '').toUpperCase();
      const isComplete = st === 'COMPLETED' || st === 'COMPLETE' || st === 'PASSED' || st === 'PASS';
      return rf === 'PASS' ? isComplete : !isComplete;
    }
    if (tabKey === 'aql' || tabKey === 'final_aql') {
      const res = (item.result || 'PASS').toUpperCase();
      return rf === 'PASS' ? res.includes('PASS') : res.includes('FAIL');
    }
    return true;
  };

  const filteredPreQcLogs = sortByLatest(rawPreQcLogs.filter(item => matchesInspectionFilters(item) && matchesResultFilter(item, 'preqc')));
  const filteredQcLogs = sortByLatest(rawQcLogs.filter(item => matchesInspectionFilters(item) && matchesResultFilter(item, 'qc')));
  const filteredPackingLogs = sortByLatest(rawPackingLogs.filter(item => matchesInspectionFilters(item) && matchesResultFilter(item, 'packing')));
  const filteredAqlLogs = sortByLatest(rawAqlLogs.filter(item => matchesInspectionFilters(item) && matchesResultFilter(item, 'aql')));
  const filteredFinalAqlLogs = sortByLatest(rawFinalAqlLogs.filter(item => matchesInspectionFilters(item) && matchesResultFilter(item, 'final_aql')));
  const filteredTransferLogs = sortByLatest(rawTransferLogs.filter(matchesInspectionFilters));
  const filteredScrapped = sortByLatest(rawScrapped.filter(matchesInspectionFilters));

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
      'Customer Name',
      'Style Name',
      'PO Name',
      'SO Name',
      'Planned QTY',
      'Pre QC',
      'QC',
      'Packing',
      'AQL',
      'Final AQL',
      'Transfers',
      'Scrap',
      'Date'
    ];

    const rows = filteredOrders.map(p => [
      `"${p.customer || 'Factory Customer'}"`,
      `"${p.styleName || p.styleCode || p.poName || p.poNumber || ''}"`,
      `"${p.poName || 'No PO & SO'}"`,
      `"${p.soName || 'No SO'}"`,
      p.plannedQty ?? p.targetQuantity ?? 0,
      p.preQc ?? 0,
      p.qc ?? p.qcPassed ?? 0,
      p.packing ?? p.packedCount ?? 0,
      p.aql ?? p.aqlPassed ?? 0,
      p.finalAql ?? p.finalAqlPassed ?? 0,
      p.transfers ?? p.boxTransfers ?? 0,
      p.scrap ?? p.scrappedCount ?? 0,
      p.createdAt ? `"${new Date(p.createdAt).toISOString().slice(0, 10)}"` : '""'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `UniFlow_Detailed_Audit_Report_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported detailed audit report (${filteredOrders.length} records) to Excel CSV successfully`, 'success');
  };

  /* ── Export to PDF Handler ───────────────────────────────── */
  const handleExportPdf = () => {
    window.print();
    showToast('Print / Save PDF dialog opened', 'info');
  };

  /* ── Export Active Operational Tab to CSV ─────────────────── */
  const handleExportActiveTabCsv = () => {
    let headers: string[] = [];
    let rows: any[][] = [];
    let tabTitle = activeLogTab.toUpperCase();

    if (activeLogTab === 'preqc') {
      tabTitle = 'PRE_QC_LOGS';
      headers = ['#', 'Pre-QC QR', 'Assigned QC QR (Product QR)', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Line', 'Operator', 'Pre-QC Result', 'Defect Reason', 'Date & Time'];
      rows = filteredPreQcLogs.map((pq, idx) => [
        idx + 1,
        `"${pq.item_qr || pq.pre_qc_qr || ''}"`,
        `"${pq.assigned_qc_qr || 'Pending Assignment'}"`,
        `"${pq.customer || ''}"`,
        `"${pq.style_name || ''}"`,
        `"${pq.po_number || pq.po_name || 'No PO & SO'}"`,
        `"${pq.so_name || pq.so_number || (pq.po_number === 'No PO & SO' ? 'No PO & SO' : 'No SO')}"`,
        `"${pq.line_name || pq.line_number || 'Line 1'}"`,
        `"${pq.operator_name || 'Operator'}"`,
        `"${pq.pre_qc_result || pq.result || 'PASS'}"`,
        `"${pq.failure_reason || pq.defect_reason || 'None'}"`,
        `"${formatSriLankaDateTime(pq.scanned_at)}"`
      ]);
    } else if (activeLogTab === 'qc') {
      tabTitle = 'QC_INSPECTION_RECORDS';
      headers = ['#', 'QC QR Barcode', 'Linked Pre-QC QR(s)', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Line', 'Inspector', 'Result', 'Defect / Reason', 'Date & Time'];
      rows = filteredQcLogs.map((qc, idx) => {
        const preQcList = Array.isArray(qc.linked_pre_qc_qrs)
          ? qc.linked_pre_qc_qrs
          : typeof qc.linked_pre_qc_qrs === 'string' && qc.linked_pre_qc_qrs.trim().length > 0
          ? qc.linked_pre_qc_qrs.split(',').map((s: string) => s.trim())
          : [];
        return [
          idx + 1,
          `"${qc.item_qr || qc.qr_code || ''}"`,
          `"${preQcList.join('; ') || 'Direct / None'}"`,
          `"${qc.customer || ''}"`,
          `"${qc.style_name || ''}"`,
          `"${qc.po_number || qc.po_name || 'No PO & SO'}"`,
          `"${qc.so_name || qc.so_number || (qc.po_number === 'No PO & SO' ? 'No PO & SO' : 'No SO')}"`,
          `"${qc.line_name || 'Line 1'}"`,
          `"${qc.inspector_name || qc.operator_name || 'QC Inspector'}"`,
          `"${qc.qc_result || qc.result || 'PASS'}"`,
          `"${qc.failure_reason || qc.defect_reason || 'None'}"`,
          `"${formatSriLankaDateTime(qc.scanned_at)}"`
        ];
      });
    } else if (activeLogTab === 'packing') {
      tabTitle = 'CARTON_PACKING_LOGS';
      headers = ['#', 'Box Code', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Line', 'Packed By', 'Capacity', 'Current Fill', 'Status', 'Packed Items QRs', 'Date & Time'];
      rows = filteredPackingLogs.map((pk, idx) => [
        idx + 1,
        `"${pk.box_code || pk.box_number || pk.boxCode || ''}"`,
        `"${pk.customer || ''}"`,
        `"${pk.style_name || pk.styleName || ''}"`,
        `"${pk.po_number || pk.po_name || pk.poNumber || 'No PO & SO'}"`,
        `"${pk.so_name || pk.so_number || pk.soName || 'No SO'}"`,
        `"${pk.line_name || pk.lineName || 'Line 1'}"`,
        `"${pk.packed_by_name || pk.items?.[0]?.packed_by_name || 'Operator'}"`,
        pk.capacity || 24,
        pk.current_fill ?? pk.activeFilledCount ?? 0,
        `"${pk.box_status || pk.status || 'OPEN'}"`,
        `"${(pk.productQrs || []).join('; ')}"`,
        `"${formatSriLankaDateTime(pk.packed_at || pk.created_at)}"`
      ]);
    } else if (activeLogTab === 'aql') {
      tabTitle = 'AQL_INSPECTION_LOGS';
      headers = ['#', 'Box Code', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Line', 'Samples Checked', 'Result', 'Defect Notes', 'Inspector', 'Date & Time'];
      rows = filteredAqlLogs.map((aql, idx) => [
        idx + 1,
        `"${aql.box_code || aql.box_number || ''}"`,
        `"${aql.customer || ''}"`,
        `"${aql.style_name || ''}"`,
        `"${aql.po_number || aql.po_name || 'No PO & SO'}"`,
        `"${aql.so_name || aql.so_number || 'No SO'}"`,
        `"${aql.line_name || 'Line 1'}"`,
        aql.required_samples || aql.sample_size || 5,
        `"${aql.result || 'PASS'}"`,
        `"${aql.failure_reason || aql.defect_notes || 'None'}"`,
        `"${aql.inspector_name || 'AQL Auditor'}"`,
        `"${formatSriLankaDateTime(aql.audited_at || aql.completed_at || aql.created_at)}"`
      ]);
    } else if (activeLogTab === 'final_aql') {
      tabTitle = 'FINAL_AQL_AUDIT_LOGS';
      headers = ['#', 'Box Code', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Line', 'Samples Checked', 'Decision', 'Notes', 'QA Auditor', 'Date & Time'];
      rows = filteredFinalAqlLogs.map((fa, idx) => [
        idx + 1,
        `"${fa.box_code || fa.box_number || ''}"`,
        `"${fa.customer || ''}"`,
        `"${fa.style_name || ''}"`,
        `"${fa.po_number || fa.po_name || 'No PO & SO'}"`,
        `"${fa.so_name || fa.so_number || 'No SO'}"`,
        `"${fa.line_name || 'Line 1'}"`,
        fa.required_samples || 8,
        `"${fa.result || 'APPROVED'}"`,
        `"${fa.failure_reason || 'Clearance Approved'}"`,
        `"${fa.inspector_name || 'QA Manager'}"`,
        `"${formatSriLankaDateTime(fa.audited_at || fa.completed_at || fa.created_at)}"`
      ]);
    } else if (activeLogTab === 'transfers') {
      tabTitle = 'BOX_TRANSFERS_LOGS';
      headers = ['#', 'Transfer ID', 'Source Box', 'Destination Box', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Item Count', 'Transferred By', 'Line', 'Date & Time', 'Remarks'];
      rows = filteredTransferLogs.map((trf, idx) => [
        idx + 1,
        `"${trf.transfer_id || trf.id || ''}"`,
        `"${trf.source_box_code || trf.source_box || ''}"`,
        `"${trf.dest_box_code || trf.destination_box || ''}"`,
        `"${trf.customer || ''}"`,
        `"${trf.style_name || ''}"`,
        `"${trf.po_number || trf.po_name || 'No PO & SO'}"`,
        `"${trf.so_name || trf.so_number || 'No SO'}"`,
        trf.item_count || 1,
        `"${trf.transferred_by_name || trf.transferred_by || 'Operator'}"`,
        `"${trf.line_name || 'Line 1'}"`,
        `"${formatSriLankaDateTime(trf.transferred_at)}"`,
        `"${trf.remarks || trf.reason || ''}"`
      ]);
    } else if (activeLogTab === 'scrapped') {
      tabTitle = 'SCRAPPED_ITEMS_LOGS';
      headers = ['#', 'Item QR Barcode', 'Customer', 'Style Name', 'PO Number', 'SO Name', 'Action Type', 'Defect / Scrap Reason', 'Origin Line', 'Scrapped By', 'Date & Time'];
      rows = filteredScrapped.map((scr, idx) => [
        idx + 1,
        `"${scr.item_qr || ''}"`,
        `"${scr.customer || ''}"`,
        `"${scr.style_name || ''}"`,
        `"${scr.po_number || scr.po_name || 'No PO & SO'}"`,
        `"${scr.so_name || scr.so_number || 'No SO'}"`,
        `"${scr.action_type || 'PERMANENTLY_REMOVED'}"`,
        `"${scr.reason || 'Damaged Garment'}"`,
        `"${scr.line_name || 'Line 1'}"`,
        `"${scr.removed_by_name || scr.operator_name || 'Supervisor'}"`,
        `"${formatSriLankaDateTime(scr.removed_at)}"`
      ]);
    }

    if (rows.length === 0) {
      showToast(`No records found in ${tabTitle} to export`, 'warning');
      return;
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `UniFlow_${tabTitle}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${tabTitle} (${rows.length} rows) to CSV`, 'success');
  };

  /* ── Export Complete Merged Product & Box CSV (with AQL & Final AQL) ─ */
  const handleExportMergedProductBoxCsv = async () => {
    try {
      showToast('Generating Merged Product & Box CSV report with AQL data...', 'info');

      const qParams = new URLSearchParams();
      if (tabTimeRange && tabTimeRange !== 'All') {
        qParams.set('range', tabTimeRange.toLowerCase());
      } else if (timeRange.toLowerCase() !== 'all') {
        qParams.set('range', timeRange.toLowerCase());
      } else {
        qParams.set('range', 'all');
      }

      const effectiveDateFrom = tabDateFrom || selectedDateFrom;
      const effectiveDateTo = tabDateTo || selectedDateTo;
      if (effectiveDateFrom) qParams.set('startDate', effectiveDateFrom);
      if (effectiveDateTo) qParams.set('endDate', effectiveDateTo);

      if (selectedPoFilter) qParams.set('poId', selectedPoFilter);
      if (selectedSoFilter) qParams.set('soId', selectedSoFilter);
      if (selectedStyleFilter) qParams.set('styleName', selectedStyleFilter);
      if (selectedCustomerFilter) qParams.set('customer', selectedCustomerFilter);
      if (selectedSizeFilter) qParams.set('size', selectedSizeFilter);
      if (tabResultFilters.all && tabResultFilters.all !== 'ALL') qParams.set('resultFilter', tabResultFilters.all);
      if (tabSearchTerm && tabSearchTerm.trim()) qParams.set('search', tabSearchTerm.trim());

      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const response = await fetch(`/api/reports/product-box-merged-export?${qParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        link.setAttribute('download', `UniFlow_Product_Box_Merged_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Merged Product & Box CSV exported successfully!', 'success');
        return;
      }

      // Client-side fallback if server endpoint cannot be reached
      console.warn('Backend merged CSV export endpoint returned', response.status, '- attempting client-side fallback');
      const headers = [
        '#',
        'Product QR Barcode',
        'Customer',
        'Style Name',
        'PO Number',
        'SO Name',
        'Line',
        
        // Inline (Pre-QC) Details
        'Inline Pre-QC QR(s)',
        'Inline Result',
        'Inline Tests & Details',
        'Inline Defect / Reason',
        'Inline Inspector',
        'Inline Date & Time',

        // Endline (QC & Test) Details
        'Endline QC Result',
        'Endline Test Result',
        'Endline Overall Result',
        'Endline Tests & Details (Passed Tests)',
        'Endline Defect / Reason',
        'Endline QC Inspector',
        'Endline Test Inspector',
        'Endline Date & Time',

        // Packing Details
        'Packing State',
        'Box Code',
        'Box Status',
        'Box Capacity',
        'Box Current Fill',
        'Packed By',
        'Packed Date & Time',

        // Normal AQL Details
        'Normal AQL Result',
        'Normal AQL Defect Notes',
        'Normal AQL Inspector',
        'Normal AQL Date & Time',

        // Final AQL Details
        'Final AQL Result',
        'Final AQL Notes',
        'Final AQL Auditor',
        'Final AQL Date & Time',

        // Box Transfer Details
        'Box Transfer State',
        'Transfer From Box',
        'Transfer To Box',
        'Transferred By',
        'Transfer Date & Time',
        'Transfer Remarks'
      ];

      const formatTestDetailsFallback = (rawTestDetails: any, qcRes?: string, testRes?: string): string => {
        const parts: string[] = [];
        if (rawTestDetails) {
          try {
            const d = typeof rawTestDetails === 'string' ? JSON.parse(rawTestDetails) : rawTestDetails;
            if (Array.isArray(d)) {
              for (const item of d) {
                if (typeof item === 'string') parts.push(item);
                else if (item && typeof item === 'object') {
                  const name = item.testName || item.name || item.title || 'Test';
                  const res = item.result || item.status || (item.passed ? 'PASS' : 'FAIL') || 'PASS';
                  parts.push(`${name}: ${res}`);
                }
              }
            } else if (d && typeof d === 'object') {
              for (const [k, v] of Object.entries(d)) {
                const res = typeof v === 'string' ? v : (v as any)?.result || (v as any)?.status || 'PASS';
                parts.push(`${k}: ${res}`);
              }
            }
          } catch {
            parts.push(String(rawTestDetails));
          }
        }
        if (parts.length === 0) {
          if (qcRes) parts.push(`QC: ${qcRes}`);
          if (testRes) parts.push(`Test: ${testRes}`);
        }
        return parts.join('; ') || 'PASS';
      };

      const toCsvField = (val: any): string => {
        if (val === null || val === undefined || val === '') return '';
        const str = String(val).trim();
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = filteredQcLogs.map((qc, idx) => {
        const qr = qc.item_qr || qc.qr_code || '';
        const matchingBox = filteredPackingLogs.find(bx => {
          const qrs = bx.productQrs || (bx.items || []).map((it: any) => typeof it === 'string' ? it : (it.qr_code || it.qr));
          return qrs.includes(qr);
        });

        const isPacked = Boolean(matchingBox);
        const boxCode = isPacked ? (matchingBox.box_code || matchingBox.box_number || matchingBox.boxCode) : 'Not Packed';
        const packingState = isPacked ? 'PACKED' : 'UNPACKED';
        const boxStatus = isPacked ? (matchingBox.box_status || matchingBox.status || 'COMPLETE') : '';
        const packedBy = isPacked ? (matchingBox.packed_by_name || matchingBox.items?.[0]?.packed_by_name || 'Operator') : '';
        const capacity = isPacked ? (matchingBox.capacity || 24) : '';
        const currentFill = isPacked ? (matchingBox.activeFilledCount || matchingBox.current_fill || (matchingBox.productQrs?.length || 0)) : '';
        const packedDateTime = isPacked ? formatSriLankaDateTime(matchingBox.packed_at || matchingBox.created_at) : '';

        // Inline
        const preQcList = Array.isArray(qc.linked_pre_qc_qrs)
          ? qc.linked_pre_qc_qrs
          : typeof qc.linked_pre_qc_qrs === 'string' && qc.linked_pre_qc_qrs.trim().length > 0
          ? qc.linked_pre_qc_qrs.split(',').map((s: string) => s.trim())
          : [];
        const linkedPreQcs = preQcList.length > 0 ? preQcList.join('; ') : 'Direct / None';
        const inlineResult = qc.inline_result || (preQcList.length > 0 ? 'PASS' : 'N/A');
        const inlineTests = formatTestDetailsFallback(qc.inline_test_details, inlineResult);
        const inlineDefect = qc.inline_failure_reason || '';
        const inlineInspector = qc.inline_inspector_name || '';
        const inlineDateTime = qc.inline_scanned_at ? formatSriLankaDateTime(qc.inline_scanned_at) : '';

        // Endline
        const endlineQcResult = qc.qc_result || qc.result || 'PASS';
        const endlineTestResult = qc.test_result || 'PASS';
        const endlineOverallResult = (endlineQcResult === 'FAIL' || endlineTestResult === 'FAIL') ? 'FAIL' : 'PASS';
        const endlineTestsPassed = formatTestDetailsFallback(qc.test_details, endlineQcResult, endlineTestResult);
        const endlineDefect = qc.failure_reason || qc.defect_reason || qc.test_failure_reason || '';
        const endlineQcInspector = qc.inspector_name || 'QC Inspector';
        const endlineTestInspector = qc.test_inspector_name || qc.inspector_name || '';
        const qcDateTime = formatSriLankaDateTime(qc.scanned_at);

        // AQL
        const matchingAql = isPacked ? filteredAqlLogs.find(a => (a.box_code === boxCode || a.box_id === matchingBox.id)) : null;
        const matchingFinalAql = isPacked ? filteredFinalAqlLogs.find(fa => (fa.box_code === boxCode || fa.box_id === matchingBox.id)) : null;

        const aqlResult = isPacked ? (matchingAql?.result || 'PENDING') : '';
        const aqlDefectNotes = isPacked ? (matchingAql?.failure_reason || matchingAql?.defect_notes || '') : '';
        const aqlInspector = isPacked ? (matchingAql?.inspector_name || '') : '';
        const aqlDateTime = isPacked && matchingAql ? formatSriLankaDateTime(matchingAql.audited_at || matchingAql.completed_at || matchingAql.created_at) : '';

        const finalAqlResult = isPacked ? (matchingFinalAql?.result || 'PENDING') : '';
        const finalAqlNotes = isPacked ? (matchingFinalAql?.failure_reason || matchingFinalAql?.defect_notes || '') : '';
        const finalAqlAuditor = isPacked ? (matchingFinalAql?.inspector_name || '') : '';
        const finalAqlDateTime = isPacked && matchingFinalAql ? formatSriLankaDateTime(matchingFinalAql.audited_at || matchingFinalAql.completed_at || matchingFinalAql.created_at) : '';

        // Box Transfer
        const matchingTransfer = isPacked ? filteredTransferLogs.find(t => (t.source_box_id === matchingBox.id || t.source_box_code === boxCode || t.destination_box_id === matchingBox.id || t.destination_box_code === boxCode)) : null;
        const transferState = matchingTransfer ? 'TRANSFERRED' : 'NOT TRANSFERRED';
        const transferFromBox = matchingTransfer ? (matchingTransfer.source_box_code || matchingTransfer.from_box || '') : '';
        const transferToBox = matchingTransfer ? (matchingTransfer.destination_box_code || matchingTransfer.to_box || '') : '';
        const transferredBy = matchingTransfer ? (matchingTransfer.transferred_by_name || matchingTransfer.operator_name || '') : '';
        const transferDateTime = matchingTransfer ? formatSriLankaDateTime(matchingTransfer.transferred_at || matchingTransfer.created_at) : '';
        const transferRemarks = matchingTransfer ? (matchingTransfer.remarks || '') : '';

        return [
          idx + 1,
          toCsvField(qr),
          toCsvField(qc.customer || matchingBox?.customer || ''),
          toCsvField(qc.style_name || matchingBox?.style_name || ''),
          toCsvField(qc.po_number || matchingBox?.po_number || 'No PO & SO'),
          toCsvField(qc.so_name || matchingBox?.so_name || 'No SO'),
          toCsvField(qc.line_name || matchingBox?.line_name || 'Line 1'),

          // Inline
          toCsvField(linkedPreQcs),
          toCsvField(inlineResult),
          toCsvField(inlineTests),
          toCsvField(inlineDefect),
          toCsvField(inlineInspector),
          toCsvField(inlineDateTime),

          // Endline
          toCsvField(endlineQcResult),
          toCsvField(endlineTestResult),
          toCsvField(endlineOverallResult),
          toCsvField(endlineTestsPassed),
          toCsvField(endlineDefect),
          toCsvField(endlineQcInspector),
          toCsvField(endlineTestInspector),
          toCsvField(qcDateTime),

          // Packing
          packingState,
          toCsvField(boxCode),
          boxStatus,
          capacity,
          currentFill,
          toCsvField(packedBy),
          toCsvField(packedDateTime),

          // Normal AQL
          toCsvField(aqlResult),
          toCsvField(aqlDefectNotes),
          toCsvField(aqlInspector),
          toCsvField(aqlDateTime),

          // Final AQL
          toCsvField(finalAqlResult),
          toCsvField(finalAqlNotes),
          toCsvField(finalAqlAuditor),
          toCsvField(finalAqlDateTime),

          // Box Transfer
          toCsvField(transferState),
          toCsvField(transferFromBox),
          toCsvField(transferToBox),
          toCsvField(transferredBy),
          toCsvField(transferDateTime),
          toCsvField(transferRemarks)
        ];
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `UniFlow_Product_Box_Merged_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported Merged Product & Box CSV (${rows.length} rows)`, 'success');
    } catch (err: any) {
      console.error('Merged CSV export error:', err);
      showToast(err.message || 'Failed to export Merged Product & Box CSV.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Page Header / Title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
          Reports
        </h2>
      </div>

      {/* ── Section: Factory Operational Logs & Deep Inspection ── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1.5px solid var(--border-color)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Master Cascade Selector Bar: Customer ➔ Style ➔ PO ➔ SO ➔ Line */}
        <div style={{
          backgroundColor: 'var(--bg-surface-2)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {(selectedCustomerFilter || selectedStyleFilter || selectedPoFilter || selectedSoFilter || selectedLineFilter || selectedSizeFilter) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                onClick={() => {
                  setSelectedCustomerFilter('');
                  setSelectedStyleFilter('');
                  setSelectedPoFilter('');
                  setSelectedSoFilter('');
                  setSelectedLineFilter('');
                  setSelectedSizeFilter('');
                  setTabSearchTerm('');
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <X size={12} /> Clear Filter Selection
              </button>
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            alignItems: 'end',
            width: '100%'
          }}>
            {/* 1. Customer Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Customer</label>
              <select
                value={selectedCustomerFilter}
                onChange={e => {
                  setSelectedCustomerFilter(e.target.value);
                  setSelectedPoFilter('');
                  setSelectedSoFilter('');
                }}
                style={styles.selectFilter}
              >
                <option value="">All Customers ({availableCustomers.length})</option>
                {availableCustomers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* 2. Style Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. Style Name</label>
              <select
                value={selectedStyleFilter}
                onChange={e => {
                  setSelectedStyleFilter(e.target.value);
                  setSelectedPoFilter('');
                  setSelectedSoFilter('');
                }}
                style={styles.selectFilter}
              >
                <option value="">All Styles ({availableStyles.length})</option>
                {availableStyles.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* 3. PO Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>3. Production Order (PO)</label>
              <select
                value={selectedPoFilter}
                onChange={e => {
                  setSelectedPoFilter(e.target.value);
                  setSelectedSoFilter('');
                }}
                style={styles.selectFilter}
              >
                <option value="">All POs ({availablePos.length})</option>
                {availablePos.map(po => (
                  <option key={po} value={po}>{po}</option>
                ))}
              </select>
            </div>

            {/* 4. SO Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Sales Order (SO)</label>
              <select
                value={selectedSoFilter}
                onChange={e => setSelectedSoFilter(e.target.value)}
                style={styles.selectFilter}
              >
                <option value="">All SOs ({availableSos.length})</option>
                {availableSos.map(so => (
                  <option key={so} value={so}>{so}</option>
                ))}
              </select>
            </div>

            {/* 5. Production Line */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Line</label>
              <select
                value={selectedLineFilter}
                onChange={e => setSelectedLineFilter(e.target.value)}
                style={styles.selectFilter}
              >
                <option value="">All Lines</option>
                {availableLines.map(ln => (
                  <option key={ln} value={ln}>{ln}</option>
                ))}
              </select>
            </div>

            {/* 6. Size Dropdown (extracted from e.g. PNFL-SS-111 -> SS) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, width: '100%' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Size</label>
              <select
                value={selectedSizeFilter}
                onChange={e => setSelectedSizeFilter(e.target.value)}
                style={styles.selectFilter}
              >
                <option value="">All Sizes ({availableSizes.length})</option>
                {availableSizes.map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
            </div>
          </div>
        </div>


        {/* 8 Dedicated Tabs Switcher (Horizontally swipeable on mobile) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          gap: '8px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '10px',
          scrollbarWidth: 'thin'
        }}>
          {[
            { key: 'all', label: `All${allMergedTotal > 0 ? ` (${allMergedTotal})` : ''}`, icon: <FileSpreadsheet size={14} />, hasResultDropdown: true },
            { key: 'preqc', label: `Inline (${filteredPreQcLogs.length})`, icon: <CheckCircle2 size={14} />, hasResultDropdown: true },
            { key: 'qc', label: `Endline (${filteredQcLogs.length})`, icon: <ShieldCheck size={14} />, hasResultDropdown: true },
            { key: 'packing', label: `Carton Packing (${filteredPackingLogs.length})`, icon: <Box size={14} />, hasResultDropdown: true },
            { key: 'aql', label: `AQL (${filteredAqlLogs.length})`, icon: <ClipboardCheck size={14} />, hasResultDropdown: true },
            { key: 'final_aql', label: `Final AQL (${filteredFinalAqlLogs.length})`, icon: <Layers size={14} />, hasResultDropdown: true }
          ].map(tab => {
            const isActive = activeLogTab === tab.key;
            const currentRes = tabResultFilters[tab.key] || 'ALL';
            return (
              <div
                key={tab.key}
                onClick={() => setActiveLogTab(tab.key as any)}
                style={{
                  ...styles.logTabBtn(isActive),
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  padding: '6px 10px'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.hasResultDropdown && (
                  <select
                    value={currentRes}
                    onClick={e => {
                      e.stopPropagation();
                      setActiveLogTab(tab.key as any);
                    }}
                    onChange={e => {
                      e.stopPropagation();
                      const val = e.target.value as 'ALL' | 'PASS' | 'FAIL';
                      setActiveLogTab(tab.key as any);
                      setTabResultFilters(prev => ({ ...prev, [tab.key]: val }));
                    }}
                    title="Filter by All / Pass / Fail"
                    style={{
                      marginLeft: '4px',
                      padding: '2px 4px',
                      borderRadius: '5px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: isActive ? '1px solid rgba(0,0,0,0.35)' : '1px solid rgba(234, 179, 8, 0.45)',
                      backgroundColor: isActive ? 'rgba(0,0,0,0.18)' : 'rgba(15, 23, 42, 0.85)',
                      color: isActive ? '#000000' : (currentRes === 'PASS' ? '#10B981' : currentRes === 'FAIL' ? '#EF4444' : '#FDE047'),
                      outline: 'none'
                    }}
                  >
                    <option value="ALL" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>All</option>
                    <option value="PASS" style={{ backgroundColor: '#0f172a', color: '#10B981' }}>Pass</option>
                    <option value="FAIL" style={{ backgroundColor: '#0f172a', color: '#EF4444' }}>Fail</option>
                  </select>
                )}
              </div>
            );
          })}
          <button
            onClick={() => setActiveLogTab('transfers')}
            style={{ ...styles.logTabBtn(activeLogTab === 'transfers'), flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <ArrowLeftRight size={14} /> Box Transfers ({filteredTransferLogs.length})
          </button>
          <button
            onClick={() => setActiveLogTab('scrapped')}
            style={{ ...styles.logTabBtn(activeLogTab === 'scrapped'), flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            <Trash2 size={14} /> Scrap Records ({filteredScrapped.length})
          </button>
        </div>

        {/* Tab Controls Bar: Period Presets, Date Range, Search & CSV Export */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-surface-2)',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px', maxWidth: '380px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={`Search in ${activeLogTab.toUpperCase()} (QR barcode, box, PO, SO, line...)...`}
              value={tabSearchTerm}
              onChange={e => setTabSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: '8px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-surface-1)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Quick Period Presets: All, Today, Weekly, Monthly */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>PERIOD:</span>
            <div style={styles.tabBar}>
              {(['All', 'Today', 'Weekly', 'Monthly'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  style={tabTimeRange === p ? styles.tabActive : styles.tabBtn}
                  onClick={() => {
                    setTabTimeRange(p);
                    setTabDateFrom('');
                    setTabDateTo('');
                    setSelectedDateFilter('');
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>FROM:</span>
              <input
                type="date"
                value={tabDateFrom}
                onChange={e => {
                  setTabDateFrom(e.target.value);
                  setTabTimeRange('All');
                }}
                style={{
                  ...styles.selectFilter,
                  padding: '4px 8px',
                  fontSize: '11px'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>TO:</span>
              <input
                type="date"
                value={tabDateTo}
                onChange={e => {
                  setTabDateTo(e.target.value);
                  setTabTimeRange('All');
                }}
                style={{
                  ...styles.selectFilter,
                  padding: '4px 8px',
                  fontSize: '11px'
                }}
              />
            </div>
            {(tabDateFrom || tabDateTo || tabTimeRange !== 'All' || selectedDateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setTabTimeRange('All');
                  setTabDateFrom('');
                  setTabDateTo('');
                  setSelectedDateFilter('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  padding: '4px'
                }}
                title="Reset date filter"
              >
                <X size={13} /> Reset
              </button>
            )}
          </div>

          {/* Export to CSV Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleExportMergedProductBoxCsv}
              className="btn btn-primary"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0D9488',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 4px rgba(13, 148, 136, 0.25)',
                cursor: 'pointer'
              }}
              title="Export complete Merged Product-to-Box CSV with AQL & Final AQL"
            >
              <FileSpreadsheet size={14} /> All Merged CSV Export
            </button>

            <button
              type="button"
              onClick={handleExportActiveTabCsv}
              className="btn btn-secondary"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Export currently active tab to CSV"
            >
              <FileSpreadsheet size={14} /> Export Active Tab CSV
            </button>
          </div>
        </div>

        {/* TAB 0: ALL (Full Merged Product-to-Box Preview matching CSV Export) */}
        {activeLogTab === 'all' && (
          <div>
            {allMergedLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <RefreshCw className="spin" size={24} color="var(--primary-teal)" />
                <span>Loading full merged records (first 50)...</span>
              </div>
            ) : allMergedRows.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No merged records found matching current filters.
              </div>
            ) : (
              <div>
                <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <table className="responsive-table" style={{ ...styles.table, minWidth: '2400px' }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>QC QR BARCODE</th>
                        <th style={styles.th}>BOX CODE</th>
                        <th style={styles.th}>PACKING STATE</th>
                        <th style={styles.th}>BOX STATUS</th>
                        <th style={styles.th}>CUSTOMER</th>
                        <th style={styles.th}>STYLE NAME</th>
                        <th style={styles.th}>PO NUMBER</th>
                        <th style={styles.th}>SO NAME</th>
                        <th style={styles.th}>LINE</th>
                        <th style={styles.th}>INSPECTOR</th>
                        <th style={styles.th}>RESULT</th>
                        <th style={styles.th}>DEFECT / REASON</th>
                        <th style={styles.th}>QC DATE & TIME</th>
                        <th style={styles.th}>PACKED BY</th>
                        <th style={styles.th}>CAPACITY</th>
                        <th style={styles.th}>CURRENT FILL</th>
                        <th style={styles.th}>PACKED DATE & TIME</th>
                        <th style={styles.th}>LINKED PRE-QC QR(S)</th>
                        <th style={styles.th}>AQL RESULT</th>
                        <th style={styles.th}>AQL DEFECT / NOTES</th>
                        <th style={styles.th}>AQL INSPECTOR</th>
                        <th style={styles.th}>AQL DATE & TIME</th>
                        <th style={styles.th}>FINAL AQL RESULT</th>
                        <th style={styles.th}>FINAL AQL NOTES</th>
                        <th style={styles.th}>FINAL AQL AUDITOR</th>
                        <th style={styles.th}>FINAL AQL DATE & TIME</th>
                        {isAdmin && <th style={styles.th}>ACTION</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {allMergedRows.map((r: any, idx: number) => (
                        <tr key={`${r.itemId || r.qcQrBarcode}-${idx}`} style={styles.tr}>
                          <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>{r.rowNumber || idx + 1}</td>
                          <td data-label="QC QR BARCODE" style={styles.td}>
                            <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{r.qcQrBarcode}</strong>
                          </td>
                          <td data-label="BOX CODE" style={styles.td}>
                            <strong style={{ color: r.packingState === 'PACKED' ? '#FDE047' : 'var(--text-muted)', fontFamily: 'monospace' }}>{r.boxCode}</strong>
                          </td>
                          <td data-label="PACKING STATE" style={styles.td}>
                            <StatusPill label={r.packingState} variant={r.packingState === 'PACKED' ? 'green' : 'muted'} />
                          </td>
                          <td data-label="BOX STATUS" style={styles.td}>{r.boxStatus || '—'}</td>
                          <td data-label="CUSTOMER" style={styles.td}>{r.customer || '—'}</td>
                          <td data-label="STYLE NAME" style={styles.td}>{r.styleName || '—'}</td>
                          <td data-label="PO NUMBER" style={styles.td}>{r.poNumber}</td>
                          <td data-label="SO NAME" style={styles.td}>{r.soName}</td>
                          <td data-label="LINE" style={styles.td}>{r.line}</td>
                          <td data-label="INSPECTOR" style={styles.td}>{r.inspector}</td>
                          <td data-label="RESULT" style={styles.td}>
                            <StatusPill label={r.result} variant={r.result === 'PASS' ? 'green' : 'red'} />
                          </td>
                          <td data-label="DEFECT / REASON" style={styles.td}>{r.defectReason || '—'}</td>
                          <td data-label="QC DATE & TIME" style={styles.td}><span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.qcDateTime || '—'}</span></td>
                          <td data-label="PACKED BY" style={styles.td}>{r.packedBy || '—'}</td>
                          <td data-label="CAPACITY" style={styles.td}>{r.capacity !== '' ? r.capacity : '—'}</td>
                          <td data-label="CURRENT FILL" style={styles.td}>{r.currentFill !== '' ? r.currentFill : '—'}</td>
                          <td data-label="PACKED DATE & TIME" style={styles.td}><span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.packedDateTime || '—'}</span></td>
                          <td data-label="LINKED PRE-QC QR(S)" style={styles.td}><span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{r.linkedPreQcs}</span></td>
                          <td data-label="AQL RESULT" style={styles.td}>
                            {r.aqlResult ? (
                              <StatusPill label={r.aqlResult} variant={r.aqlResult === 'PASS' || r.aqlResult === 'PASSED' ? 'green' : r.aqlResult === 'FAIL' || r.aqlResult === 'FAILED' ? 'red' : 'amber'} />
                            ) : '—'}
                          </td>
                          <td data-label="AQL DEFECT / NOTES" style={styles.td}>{r.aqlDefectNotes || '—'}</td>
                          <td data-label="AQL INSPECTOR" style={styles.td}>{r.aqlInspector || '—'}</td>
                          <td data-label="AQL DATE & TIME" style={styles.td}><span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.aqlDateTime || '—'}</span></td>
                          <td data-label="FINAL AQL RESULT" style={styles.td}>
                            {r.finalAqlResult ? (
                              <StatusPill label={r.finalAqlResult} variant={r.finalAqlResult === 'PASS' || r.finalAqlResult === 'PASSED' ? 'green' : r.finalAqlResult === 'FAIL' || r.finalAqlResult === 'FAILED' ? 'red' : 'amber'} />
                            ) : '—'}
                          </td>
                          <td data-label="FINAL AQL NOTES" style={styles.td}>{r.finalAqlNotes || '—'}</td>
                          <td data-label="FINAL AQL AUDITOR" style={styles.td}>{r.finalAqlAuditor || '—'}</td>
                          <td data-label="FINAL AQL DATE & TIME" style={styles.td}><span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.finalAqlDateTime || '—'}</span></td>
                          {isAdmin && (
                            <td data-label="ACTION" style={styles.td}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditItemQr(r.itemId, r.qcQrBarcode, 'all')}
                                title="Edit Serial / QR Barcode"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  border: '1px solid #3B82F6',
                                  color: '#60A5FA',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Edit2 size={12} />
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-surface-2)',
                  borderTop: '1px solid var(--border-color)',
                  borderBottomLeftRadius: '10px',
                  borderBottomRightRadius: '10px'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Showing <strong style={{ color: 'var(--text-primary)' }}>{allMergedRows.length}</strong> of <strong style={{ color: 'var(--primary-teal)' }}>{allMergedTotal}</strong> records
                  </span>
                  {allMergedRows.length < allMergedTotal && (
                    <button
                      type="button"
                      disabled={allMergedLoadingMore}
                      onClick={() => fetchAllMergedPreview(allMergedRows.length, true)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(20, 184, 166, 0.15)',
                        border: '1px solid var(--primary-teal)',
                        color: 'var(--primary-teal)',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: allMergedLoadingMore ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {allMergedLoadingMore ? 'Loading...' : `View More (+${Math.min(50, allMergedTotal - allMergedRows.length)})`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: PRE QC (With Pre-QC to QC Assignment Link) */}
        {activeLogTab === 'preqc' && (
          <div>
            {filteredPreQcLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No Pre-QC records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>PRE-QC QR</th>
                      <th style={styles.th}>ASSIGNED QC QR (PRODUCT QR)</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>OPERATOR</th>
                      <th style={styles.th}>RESULT</th>
                      <th style={styles.th}>DEFECT / NOTES</th>
                      <th style={styles.th}>SCANNED AT</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreQcLogs.slice(0, visibleCounts.preqc || 50).map((pq: any, idx: number) => (
                      <tr key={pq.id || idx} style={styles.tr}>
                        <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {idx + 1}
                        </td>
                        <td data-label="PRE-QC QR" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                            {pq.item_qr}
                          </strong>
                        </td>
                        <td data-label="ASSIGNED QC QR" style={styles.td}>
                          {pq.assigned_qc_qr ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                border: '1px solid var(--color-purple)',
                                color: 'var(--color-purple)',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                fontSize: '11px'
                              }}
                              title="Assigned to Main Product / QC Barcode"
                            >
                              <Link2 size={12} />
                              {pq.assigned_qc_qr}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Pending Assignment
                            </span>
                          )}
                        </td>
                        <td data-label="CUSTOMER / STYLE" style={styles.td}>
                          <div>
                            {pq.customer && (
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {pq.customer}
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{pq.style_name || 'Standard'}</span>
                          </div>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>
                          {pq.po_number === 'No PO & SO' || pq.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : (
                            pq.po_number || pq.po_name || 'N/A'
                          )}
                        </td>
                        <td data-label="SO NAME" style={styles.td}>
                          {pq.po_number === 'No PO & SO' || pq.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : pq.so_name || pq.so_number ? (
                            <strong style={{ color: '#60a5fa' }}>{pq.so_name || pq.so_number}</strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                          )}
                        </td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {pq.line_name || pq.line_number || '—'}
                          </span>
                        </td>
                        <td data-label="OPERATOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {pq.operator_name || pq.user_id || 'Line Operator'}
                          </span>
                        </td>
                        <td data-label="RESULT" style={styles.td}>
                          <StatusPill
                            label={pq.pre_qc_result || 'PASS'}
                            variant={pq.pre_qc_result === 'PASS' ? 'green' : 'red'}
                          />
                          {(() => {
                            let detailsObj: any = null;
                            if (pq.test_details) {
                              try {
                                detailsObj = typeof pq.test_details === 'string' ? JSON.parse(pq.test_details) : pq.test_details;
                              } catch {}
                            }
                            const subTests = detailsObj && typeof detailsObj === 'object' ? Object.entries(detailsObj) : [];
                            if (subTests.length === 0) return null;
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                {subTests.map(([tName, tVal]: [string, any], ti: number) => {
                                  const res = typeof tVal === 'string' ? tVal : (tVal?.result || 'PASS');
                                  return (
                                    <span key={ti} style={{ fontSize: '10px', color: res === 'PASS' ? '#10B981' : '#EF4444' }}>
                                      • {tName}: {res}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </td>
                        <td data-label="DEFECT / NOTES" style={styles.td}>
                          <span style={{ color: pq.defect_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {pq.defect_reason || pq.reason || 'None (Passed)'}
                          </span>
                        </td>
                        <td data-label="SCANNED AT" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSriLankaDateTime(pq.scanned_at)}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditItemQr(pq.item_id, pq.item_qr, 'preqc')}
                                title="Edit Serial / QR Barcode"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  border: '1px solid #3B82F6',
                                  color: '#60A5FA',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Edit2 size={12} />
                                Edit
                              </button>
                            )}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderViewMoreFooter('preqc', filteredPreQcLogs.length)}
              </>
            )}
          </div>
        )}

        {/* TAB 2: QC DETAILS (With Linked Pre-QC QRs) */}
        {activeLogTab === 'qc' && (
          <div>
            {filteredQcLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No QC inspection records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>QC QR BARCODE</th>
                      <th style={styles.th}>LINKED PRE-QC QR(S)</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>QC RESULT</th>
                      <th style={styles.th}>DEFECT / REASON</th>
                      <th style={styles.th}>INSPECTOR</th>
                      <th style={styles.th}>INSPECTION TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQcLogs.slice(0, visibleCounts.qc || 50).map((qc: any, idx: number) => {
                      const preQcList = Array.isArray(qc.linked_pre_qc_qrs)
                        ? qc.linked_pre_qc_qrs
                        : typeof qc.linked_pre_qc_qrs === 'string' && qc.linked_pre_qc_qrs.trim().length > 0
                        ? qc.linked_pre_qc_qrs.split(',').map((s: string) => s.trim())
                        : [];

                      return (
                        <tr key={qc.id || idx} style={styles.tr}>
                          <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                            {idx + 1}
                          </td>
                          <td data-label="QC QR BARCODE" style={styles.td}>
                            <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                              {qc.item_qr}
                            </strong>
                          </td>
                          <td data-label="LINKED PRE-QC QR(S)" style={styles.td}>
                            {preQcList.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setSelectedPreQcModal({
                                  itemQr: qc.item_qr || qc.qr_code,
                                  poNumber: qc.po_number || qc.po_name,
                                  styleName: qc.style_name || qc.styleName,
                                  preQcs: preQcList
                                })}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(234, 179, 8, 0.12)',
                                  border: '1px solid rgba(234, 179, 8, 0.45)',
                                  color: '#FDE047',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'monospace'
                                }}
                                title="Click to view and delete/unassign assigned Pre-QC barcodes"
                              >
                                <Link2 size={12} color="#FACC15" />
                                <span>{preQcList.length} Units ({preQcList[0]}{preQcList.length > 1 ? ` +${preQcList.length - 1}` : ''})</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Direct / No Pre-QC
                              </span>
                            )}
                          </td>
                          <td data-label="CUSTOMER / STYLE" style={styles.td}>
                            <div>
                              {qc.customer && (
                                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                  {qc.customer}
                                </span>
                              )}
                              <span style={{ fontWeight: 600 }}>{qc.style_name || 'Standard'}</span>
                            </div>
                          </td>
                          <td data-label="PO NUMBER" style={styles.td}>
                            {qc.po_number === 'No PO & SO' || qc.po_name === 'No PO & SO' ? (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                            ) : (
                              qc.po_number || qc.po_name || 'N/A'
                            )}
                          </td>
                          <td data-label="SO NAME" style={styles.td}>
                            {qc.po_number === 'No PO & SO' || qc.po_name === 'No PO & SO' ? (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                            ) : qc.so_name || qc.so_number ? (
                              <strong style={{ color: '#60a5fa' }}>{qc.so_name || qc.so_number}</strong>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                            )}
                          </td>
                          <td data-label="LINE" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {qc.line_name || qc.line_number || '—'}
                            </span>
                          </td>
                          <td data-label="QC RESULT" style={styles.td}>
                            <StatusPill label={qc.qc_result || 'PASS'} variant={qc.qc_result === 'PASS' ? 'green' : 'red'} />
                            {(() => {
                              let detailsObj: any = null;
                              if (qc.test_details) {
                                try {
                                  detailsObj = typeof qc.test_details === 'string' ? JSON.parse(qc.test_details) : qc.test_details;
                                } catch {}
                              }
                              const subTests = detailsObj && typeof detailsObj === 'object' ? Object.entries(detailsObj) : [];
                              if (subTests.length === 0) return null;
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                  {subTests.map(([tName, tVal]: [string, any], ti: number) => {
                                    const res = typeof tVal === 'string' ? tVal : (tVal?.result || 'PASS');
                                    return (
                                      <span key={ti} style={{ fontSize: '10px', color: res === 'PASS' ? '#10B981' : '#EF4444' }}>
                                        • {tName}: {res}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </td>
                          <td data-label="DEFECT / REASON" style={styles.td}>
                            <span style={{ color: qc.defect_reason ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                              {qc.defect_reason || qc.reason || 'None (Passed)'}
                            </span>
                          </td>
                          <td data-label="INSPECTOR" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {qc.inspector_name || qc.operator_name || qc.user_id || 'QC Inspector'}
                            </span>
                          </td>
                          <td data-label="INSPECTION TIME" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {formatSriLankaDateTime(qc.scanned_at)}
                            </span>
                          </td>
                          <td data-label="ACTION" style={styles.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditItemQr(qc.item_id, qc.item_qr, 'qc')}
                                  title="Edit Serial / QR Barcode"
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                    border: '1px solid #3B82F6',
                                    color: '#60A5FA',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <Edit2 size={12} />
                                  Edit
                                </button>
                              )}
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderViewMoreFooter('qc', filteredQcLogs.length)}
              </>
            )}
          </div>
        )}

        {/* TAB 3: CARTON PACKING */}
        {activeLogTab === 'packing' && (
          <div>
            {filteredPackingLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No carton packing records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>BOX IDENTIFIER</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>PACKED BY</th>
                      <th style={styles.th}>CAPACITY & FILL</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>PACKED AT</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPackingLogs.slice(0, visibleCounts.packing || 50).map((bx: any, idx: number) => {
                      const packedCount = bx.productQrs?.length || bx.items?.length || bx.activeFilledCount || bx.current_fill || 0;
                      return (
                        <tr key={bx.id || idx} style={styles.tr}>
                          <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                            {idx + 1}
                          </td>
                          <td data-label="BOX IDENTIFIER" style={styles.td}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ color: 'var(--color-purple)' }}>
                                {bx.box_code || bx.box_number || bx.boxCode || 'BOX-N/A'}
                              </strong>
                              <button
                                type="button"
                                onClick={() => handleOpenEditBox(bx)}
                                style={{
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.35)',
                                  borderRadius: '4px',
                                  padding: '2px 5px',
                                  cursor: 'pointer',
                                  color: '#38BDF8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontSize: '10px',
                                  fontWeight: 700
                                }}
                                title="Edit this box number"
                              >
                                <Edit2 size={11} />
                                Edit
                              </button>
                            </div>
                          </td>
                          <td data-label="CUSTOMER / STYLE" style={styles.td}>
                            <div>
                              {bx.customer && (
                                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                  {bx.customer}
                                </span>
                              )}
                              <span style={{ fontWeight: 600 }}>{bx.style_name || bx.styleName || 'Standard'}</span>
                            </div>
                          </td>
                          <td data-label="PO NUMBER" style={styles.td}>
                            {bx.po_number === 'No PO & SO' || bx.po_name === 'No PO & SO' || bx.poNumber === 'No PO & SO' ? (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                            ) : (
                              bx.po_number || bx.po_name || bx.poNumber || 'N/A'
                            )}
                          </td>
                          <td data-label="SO NAME" style={styles.td}>
                            {bx.po_number === 'No PO & SO' || bx.po_name === 'No PO & SO' || bx.poNumber === 'No PO & SO' ? (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                            ) : bx.so_name || bx.so_number || bx.soName ? (
                              <strong style={{ color: '#60a5fa' }}>{bx.so_name || bx.so_number || bx.soName}</strong>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                            )}
                          </td>
                          <td data-label="LINE" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {bx.line_name || bx.lineName || 'Line 1'}
                            </span>
                          </td>
                          <td data-label="PACKED BY" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {bx.packed_by_name || bx.items?.[0]?.packed_by_name || 'Operator'}
                            </span>
                          </td>
                          <td data-label="CAPACITY & FILL" style={styles.td}>
                            <button
                              type="button"
                              onClick={() => setSelectedBoxModal({
                                ...bx,
                                id: bx.id || bx.box_id,
                                boxCode: bx.box_code || bx.box_number || bx.boxCode,
                                boxNumber: bx.box_number || bx.box_code || bx.boxNumber,
                                poNumber: bx.po_number || bx.po_name || bx.poNumber,
                                styleName: bx.style_name || bx.styleName,
                                capacity: bx.capacity || 24,
                                activeFilledCount: packedCount,
                                productQrs: bx.productQrs || (bx.items || []).map((it: any) => it.qr_code || it.qr),
                                aqlStatus: bx.aqlStatus || bx.box_status || 'PENDING'
                              })}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                padding: 0
                              }}
                              title="Click to view all garments inside this box"
                            >
                              <strong style={{ color: 'var(--primary-teal)', textDecoration: 'underline' }}>
                                {packedCount}
                              </strong> / {bx.capacity || 24} pcs
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--color-purple)', fontWeight: 700 }}>
                                📦 View Items ({packedCount})
                              </span>
                            </button>
                          </td>
                          <td data-label="STATUS" style={styles.td}>
                            <StatusPill
                              label={bx.box_status || bx.status || 'PACKED'}
                              variant={(bx.box_status || bx.status) === 'COMPLETED' ? 'green' : 'teal'}
                            />
                          </td>
                          <td data-label="PACKED AT" style={styles.td}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {formatSriLankaDateTime(bx.packed_at || bx.created_at)}
                            </span>
                          </td>
                          <td data-label="ACTION" style={styles.td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditBox(bx)}
                                className="btn btn-secondary"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: '#38BDF8',
                                  borderColor: 'rgba(56, 189, 248, 0.4)',
                                  backgroundColor: 'rgba(56, 189, 248, 0.1)'
                                }}
                                title="Edit this box number"
                              >
                                <Edit2 size={12} color="#38BDF8" />
                                Edit Box
                              </button>
                              <button
                                onClick={() => setSelectedBoxModal({
                                  ...bx,
                                  id: bx.id || bx.box_id,
                                  boxCode: bx.box_code || bx.box_number || bx.boxCode,
                                  boxNumber: bx.box_number || bx.box_code || bx.boxNumber,
                                  poNumber: bx.po_number || bx.po_name || bx.poNumber,
                                  styleName: bx.style_name || bx.styleName,
                                  capacity: bx.capacity || 24,
                                  activeFilledCount: packedCount,
                                  productQrs: bx.productQrs || (bx.items || []).map((it: any) => it.qr_code || it.qr),
                                  aqlStatus: bx.aqlStatus || bx.box_status || 'PENDING'
                                })}
                                className="btn btn-secondary"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="View and remove items in this box"
                              >
                                <Box size={12} color="var(--primary-teal)" />
                                Items ({packedCount})
                              </button>
                              <button
                                onClick={() => handleDeleteBox(bx)}
                                title="Delete this entire carton box"
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
                                Delete Box
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderViewMoreFooter('packing', filteredPackingLogs.length)}
              </>
            )}
          </div>
        )}

        {/* TAB 4: AQL INSPECTIONS */}
        {activeLogTab === 'aql' && (
          <div>
            {filteredAqlLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No AQL inspection records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>BOX IDENTIFIER</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>STAGE</th>
                      <th style={styles.th}>SAMPLES CHECKED</th>
                      <th style={styles.th}>AQL RESULT</th>
                      <th style={styles.th}>DEFECT / REASON</th>
                      <th style={styles.th}>INSPECTOR</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAqlLogs.slice(0, visibleCounts.aql || 50).map((aql: any, idx: number) => (
                      <tr key={aql.id || idx} style={styles.tr}>
                        <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {idx + 1}
                        </td>
                        <td data-label="BOX IDENTIFIER" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>
                            {aql.box_code || aql.box_number || aql.box_id}
                          </strong>
                        </td>
                        <td data-label="CUSTOMER / STYLE" style={styles.td}>
                          <div>
                            {aql.customer && (
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {aql.customer}
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{aql.style_name || 'Standard'}</span>
                          </div>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>
                          {aql.po_number === 'No PO & SO' || aql.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : (
                            aql.po_number || aql.po_name || 'N/A'
                          )}
                        </td>
                        <td data-label="SO NAME" style={styles.td}>
                          {aql.po_number === 'No PO & SO' || aql.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : aql.so_name || aql.so_number ? (
                            <strong style={{ color: '#60a5fa' }}>{aql.so_name || aql.so_number}</strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                          )}
                        </td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {aql.line_name || aql.line_number || '—'}
                          </span>
                        </td>
                        <td data-label="STAGE" style={styles.td}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {aql.stage || 'In-line AQL'}
                          </span>
                        </td>
                        <td data-label="SAMPLES" style={styles.td}>
                          <span>{aql.sample_size || aql.samples_checked || 5} checked</span>
                        </td>
                        <td data-label="AQL RESULT" style={styles.td}>
                          <StatusPill
                            label={aql.result || 'PASS'}
                            variant={aql.result === 'PASS' ? 'green' : aql.result === 'FAIL' ? 'red' : 'amber'}
                          />
                        </td>
                        <td data-label="DEFECT / REASON" style={styles.td}>
                          <span style={{ color: aql.defect_notes ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {aql.defect_notes || aql.reason || 'None (Approved)'}
                          </span>
                        </td>
                        <td data-label="INSPECTOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {aql.inspector_name || aql.inspector || aql.operator_name || aql.user_id || 'AQL Auditor'}
                          </span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSriLankaDateTime(aql.created_at || aql.audited_at)}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditBox({
                                  id: aql.box_id,
                                  box_id: aql.box_id,
                                  box_code: aql.box_code,
                                  box_number: aql.box_number
                                })}
                                title="Edit Box / Serial Number"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  border: '1px solid #3B82F6',
                                  color: '#60A5FA',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Edit2 size={12} />
                                Edit
                              </button>
                            )}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderViewMoreFooter('aql', filteredAqlLogs.length)}
              </>
            )}
          </div>
        )}

        {/* TAB 5: FINAL AQL INSPECTIONS */}
        {activeLogTab === 'final_aql' && (
          <div>
            {filteredFinalAqlLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No Final AQL records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>BOX IDENTIFIER</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>STAGE</th>
                      <th style={styles.th}>SAMPLES CHECKED</th>
                      <th style={styles.th}>FINAL DECISION</th>
                      <th style={styles.th}>APPROVAL NOTES</th>
                      <th style={styles.th}>QA AUDITOR</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFinalAqlLogs.slice(0, visibleCounts.final_aql || 50).map((faql: any, idx: number) => (
                      <tr key={faql.id || idx} style={styles.tr}>
                        <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {idx + 1}
                        </td>
                        <td data-label="BOX IDENTIFIER" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>
                            {faql.box_code || faql.box_number || faql.box_id}
                          </strong>
                        </td>
                        <td data-label="CUSTOMER / STYLE" style={styles.td}>
                          <div>
                            {faql.customer && (
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {faql.customer}
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{faql.style_name || 'Standard'}</span>
                          </div>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>
                          {faql.po_number === 'No PO & SO' || faql.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : (
                            faql.po_number || faql.po_name || 'N/A'
                          )}
                        </td>
                        <td data-label="SO NAME" style={styles.td}>
                          {faql.po_number === 'No PO & SO' || faql.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : faql.so_name || faql.so_number ? (
                            <strong style={{ color: '#60a5fa' }}>{faql.so_name || faql.so_number}</strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                          )}
                        </td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {faql.line_name || faql.line_number || '—'}
                          </span>
                        </td>
                        <td data-label="STAGE" style={styles.td}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            color: '#3B82F6',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            Final AQL Gate
                          </span>
                        </td>
                        <td data-label="SAMPLES" style={styles.td}>
                          <span>{faql.sample_size || faql.samples_checked || 8} checked</span>
                        </td>
                        <td data-label="FINAL DECISION" style={styles.td}>
                          <StatusPill
                            label={faql.result || 'PASS'}
                            variant={faql.result === 'PASS' ? 'green' : faql.result === 'FAIL' ? 'red' : 'amber'}
                          />
                        </td>
                        <td data-label="APPROVAL NOTES" style={styles.td}>
                          <span style={{ color: faql.defect_notes ? '#EF4444' : 'var(--text-muted)', fontSize: '11px' }}>
                            {faql.defect_notes || faql.reason || 'Shipment Gate Approved'}
                          </span>
                        </td>
                        <td data-label="QA AUDITOR" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {faql.inspector_name || faql.inspector || faql.operator_name || faql.user_id || 'QA Auditor'}
                          </span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSriLankaDateTime(faql.created_at || faql.audited_at)}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditBox({
                                  id: faql.box_id,
                                  box_id: faql.box_id,
                                  box_code: faql.box_code,
                                  box_number: faql.box_number
                                })}
                                title="Edit Box / Serial Number"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                  border: '1px solid #3B82F6',
                                  color: '#60A5FA',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <Edit2 size={12} />
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAqlLog(faql)}
                              title="Delete this Final AQL record"
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderViewMoreFooter('final_aql', filteredFinalAqlLogs.length)}
              </>
            )}
          </div>
        )}

        {/* TAB 6: BOX TRANSFERS */}
        {activeLogTab === 'transfers' && (
          <div>
            {filteredTransferLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No box transfer records found matching current filters.
              </div>
            ) : (
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>TRANSFER REF #</th>
                      <th style={styles.th}>SOURCE BOX</th>
                      <th style={styles.th}>DESTINATION BOX / BAY</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>ITEM COUNT</th>
                      <th style={styles.th}>TRANSFERRED BY</th>
                      <th style={styles.th}>ORIGIN LINE</th>
                      <th style={styles.th}>DATE & TIME</th>
                      <th style={styles.th}>REMARKS</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransferLogs.slice(0, visibleCounts.transfers || 50).map((tr: any, idx: number) => (
                      <tr key={tr.id || idx} style={styles.tr}>
                        <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {idx + 1}
                        </td>
                        <td data-label="TRANSFER REF" style={styles.td}>
                          <strong style={{ color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                            {tr.transfer_number || tr.id || `TR-${idx + 101}`}
                          </strong>
                        </td>
                        <td data-label="SOURCE BOX" style={styles.td}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#EF4444',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            {tr.source_box_code || tr.source_box || tr.from_box || 'N/A'}
                          </span>
                        </td>
                        <td data-label="DESTINATION BOX" style={styles.td}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#10B981',
                            fontWeight: 700,
                            fontSize: '11px'
                          }}>
                            {tr.dest_box_code || tr.destination_box || tr.to_box || tr.destination_bay || 'N/A'}
                          </span>
                        </td>
                        <td data-label="CUSTOMER / STYLE" style={styles.td}>
                          <div>
                            {tr.customer && (
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {tr.customer}
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{tr.style_name || 'Standard'}</span>
                          </div>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>
                          {tr.po_number === 'No PO & SO' || tr.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : (
                            tr.po_number || tr.po_name || 'N/A'
                          )}
                        </td>
                        <td data-label="SO NAME" style={styles.td}>
                          {tr.po_number === 'No PO & SO' || tr.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : tr.so_name || tr.so_number ? (
                            <strong style={{ color: '#60a5fa' }}>{tr.so_name || tr.so_number}</strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                          )}
                        </td>
                        <td data-label="ITEM COUNT" style={styles.td}>
                          <strong style={{ color: 'var(--color-purple)' }}>{tr.item_count || 1}</strong> pcs
                        </td>
                        <td data-label="TRANSFERRED BY" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {tr.transferred_by_name || tr.transferred_by || tr.operator_name || 'Supervisor'}
                          </span>
                        </td>
                        <td data-label="ORIGIN LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {tr.line_name || 'Line 1'}
                          </span>
                        </td>
                        <td data-label="DATE & TIME" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSriLankaDateTime(tr.transferred_at)}
                          </span>
                        </td>
                        <td data-label="REMARKS" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {tr.reason || tr.notes || 'Rebalanced to meet carton quota'}
                          </span>
                        </td>
                        <td data-label="ACTION" style={styles.td}>
                          <button
                            onClick={() => handleDeleteTransferLog(tr)}
                            title="Delete this Box Transfer log"
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
              {renderViewMoreFooter('transfers', filteredTransferLogs.length)}
              </>
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
              <>
              <div className="table-responsive-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '620px', WebkitOverflowScrolling: 'touch', width: '100%', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table className="responsive-table" style={{ ...styles.table, minWidth: '950px' }}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>ITEM QR BARCODE</th>
                      <th style={styles.th}>CUSTOMER / STYLE</th>
                      <th style={styles.th}>PO NUMBER</th>
                      <th style={styles.th}>SO NAME</th>
                      <th style={styles.th}>ACTION TYPE</th>
                      <th style={styles.th}>REASON FOR SCRAP</th>
                      <th style={styles.th}>LINE</th>
                      <th style={styles.th}>REMOVED BY</th>
                      <th style={styles.th}>TIMESTAMP</th>
                      <th style={styles.th}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScrapped.slice(0, visibleCounts.scrapped || 50).map((item: any, idx: number) => (
                      <tr key={item.id || idx} style={styles.tr}>
                        <td data-label="#" style={{ ...styles.td, width: '40px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          {idx + 1}
                        </td>
                        <td data-label="ITEM QR BARCODE" style={styles.td}>
                          <strong style={{ color: '#EF4444', fontFamily: 'monospace' }}>{item.item_qr}</strong>
                        </td>
                        <td data-label="CUSTOMER / STYLE" style={styles.td}>
                          <div>
                            {item.customer && (
                              <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {item.customer}
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{item.style_name || item.styleName || 'Standard'}</span>
                          </div>
                        </td>
                        <td data-label="PO NUMBER" style={styles.td}>
                          {item.po_number === 'No PO & SO' || item.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : (
                            item.po_number || item.po_name || 'N/A'
                          )}
                        </td>
                        <td data-label="SO NAME" style={styles.td}>
                          {item.po_number === 'No PO & SO' || item.po_name === 'No PO & SO' ? (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                          ) : item.so_name || item.so_number ? (
                            <strong style={{ color: '#60a5fa' }}>{item.so_name || item.so_number}</strong>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                          )}
                        </td>
                        <td data-label="ACTION TYPE" style={styles.td}>
                          <StatusPill label={item.action_type || 'PERMANENTLY_REMOVE'} variant="red" />
                        </td>
                        <td data-label="REASON FOR SCRAP" style={styles.td}>{item.reason || 'Irreparable Damaged Garment'}</td>
                        <td data-label="LINE" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {item.line_name || 'Line 1'}
                          </span>
                        </td>
                        <td data-label="REMOVED BY" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {item.removed_by_name || item.operator_name || item.removed_by || 'Line Supervisor'}
                          </span>
                        </td>
                        <td data-label="TIMESTAMP" style={styles.td}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatSriLankaDateTime(item.removed_at)}
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
              {renderViewMoreFooter('scrapped', filteredScrapped.length)}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Overall Details (Production Order & Operation Detailed Audit Table) ──────── */}
      <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', margin: 0, padding: '16px', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Overall Details
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleExportExcel}
              className="btn btn-primary"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#059669',
                borderColor: '#059669',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              title="Export Overall Production Details to Excel/CSV"
            >
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <StatusPill label={`${filteredOrders.length} Records`} variant="teal" />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No audit records found matching the selected Customer, Style, PO, SO, or Time Period filters.
          </div>
        ) : (
          <div className="table-responsive-wrapper" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table className="responsive-table" style={{ ...styles.table, minWidth: '1250px' }}>
              <thead>
                <tr>
                  <th style={styles.th}>CUSTOMER NAME</th>
                  <th style={styles.th}>STYLE NAME</th>
                  <th style={styles.th}>PO NAME</th>
                  <th style={styles.th}>SO NAME</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>PLANNED QTY</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>PRE QC</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>QC</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>PACKING</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>AQL</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>FINAL AQL</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>TRANSFERS</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>SCRAP</th>
                </tr>
              </thead>
              <tbody>
                {(showAllOrders ? filteredOrders : filteredOrders.slice(0, 15)).map((p: any, idx: number) => {
                  const isStyleDirect = p.orderPathway === 'STYLE_DIRECT' || p.poName === 'No PO & SO';
                  const isStyleOnly = p.orderPathway === 'STYLE_ONLY';
                  const isNoSo = p.soName === 'No SO' || isStyleDirect || isStyleOnly;

                  return (
                    <tr
                      key={p.id || `${p.poId}-${p.soId}-${idx}`}
                      style={{
                        ...styles.tr,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      onClick={() => {
                        if (p.customer) setSelectedCustomerFilter(p.customer);
                        if (p.styleName) setSelectedStyleFilter(p.styleName);
                        if (p.poName && p.poName !== 'No PO & SO') setSelectedPoFilter(p.poName);
                        if (p.soName && p.soName !== 'No SO' && p.soName !== 'No PO & SO') setSelectedSoFilter(p.soName);
                        showToast(`Focused on ${p.customer || 'Customer'} - ${p.styleName} (Unit Records below)`, 'info');
                      }}
                      title="Click to inspect operational unit records for this order"
                    >
                      {/* 1. Customer Name */}
                      <td data-label="CUSTOMER NAME" style={styles.td}>
                        <strong style={{ color: 'var(--text-primary)' }}>{p.customer || 'Factory Customer'}</strong>
                      </td>

                      {/* 2. Style Name */}
                      <td data-label="STYLE NAME" style={styles.td}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.styleName || p.styleCode || p.poName || p.poNumber || '-'}</span>
                      </td>

                      {/* 3. PO Name */}
                      <td data-label="PO NAME" style={styles.td}>
                        {isStyleDirect || isStyleOnly ? (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                        ) : (
                          <strong style={{ color: 'var(--primary-teal)' }}>{p.poName || p.poNumber}</strong>
                        )}
                      </td>

                      {/* 4. SO Name */}
                      <td data-label="SO NAME" style={styles.td}>
                        {isStyleDirect || isStyleOnly ? (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No PO & SO</span>
                        ) : isNoSo ? (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px' }}>No SO</span>
                        ) : (
                          <strong style={{ color: '#60a5fa' }}>{p.soName || p.soNumber}</strong>
                        )}
                      </td>

                      {/* 5. Planned QTY */}
                      <td data-label="PLANNED QTY" style={{ ...styles.td, textAlign: 'right' }}>
                        <strong>{(p.plannedQty ?? p.targetQuantity ?? 0).toLocaleString()}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>pcs</span>
                      </td>

                      {/* 6. Pre QC */}
                      <td data-label="PRE QC" style={{ ...styles.td, textAlign: 'center' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 800 }}>{p.preQc ?? 0}</span>
                      </td>

                      {/* 7. QC */}
                      <td data-label="QC" style={{ ...styles.td, textAlign: 'center' }}>
                        <span style={{ color: '#10B981', fontWeight: 800 }}>{p.qc ?? p.qcPassed ?? 0}</span>
                      </td>

                      {/* 8. Packing */}
                      <td data-label="PACKING" style={{ ...styles.td, textAlign: 'center' }}>
                        <span style={{ color: '#818cf8', fontWeight: 800 }}>{p.packing ?? p.packedCount ?? 0}</span>
                      </td>

                      {/* 9. AQL */}
                      <td data-label="AQL" style={{ ...styles.td, textAlign: 'center' }}>
                        <StatusPill label={`${p.aql ?? p.aqlPassed ?? 0} Boxes`} variant={(p.aql ?? p.aqlPassed ?? 0) > 0 ? 'green' : 'muted'} />
                      </td>

                      {/* 10. Final AQL */}
                      <td data-label="FINAL AQL" style={{ ...styles.td, textAlign: 'center' }}>
                        <StatusPill label={`${p.finalAql ?? p.finalAqlPassed ?? 0} Boxes`} variant={(p.finalAql ?? p.finalAqlPassed ?? 0) > 0 ? 'green' : 'muted'} />
                      </td>

                      {/* 11. Transfers */}
                      <td data-label="TRANSFERS" style={{ ...styles.td, textAlign: 'center' }}>
                        <span style={{ color: '#c084fc', fontWeight: 800 }}>{p.transfers ?? p.boxTransfers ?? 0}</span>
                      </td>

                      {/* 12. Scrap */}
                      <td data-label="SCRAP" style={{ ...styles.td, textAlign: 'center' }}>
                        {(p.scrap ?? p.scrappedCount ?? 0) > 0 ? (
                          <span style={{ color: '#EF4444', fontWeight: 800 }}>⚠️ {p.scrap ?? p.scrappedCount}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Table Summary Footer */}
              <tfoot>
                <tr style={{ ...styles.tr, backgroundColor: 'rgba(20, 184, 166, 0.08)', fontWeight: 800 }}>
                  <td colSpan={4} style={{ ...styles.td, color: 'var(--primary-teal)', fontWeight: 800 }}>
                    TOTAL SUMMARY ({filteredOrders.length} records):
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', color: 'var(--primary-teal)' }}>
                    {filteredOrders.reduce((s, p) => s + (p.plannedQty ?? p.targetQuantity ?? 0), 0).toLocaleString()} pcs
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#38bdf8' }}>
                    {filteredOrders.reduce((s, p) => s + (p.preQc ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#10B981' }}>
                    {filteredOrders.reduce((s, p) => s + (p.qc ?? p.qcPassed ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#818cf8' }}>
                    {filteredOrders.reduce((s, p) => s + (p.packing ?? p.packedCount ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: 'var(--text-primary)' }}>
                    {filteredOrders.reduce((s, p) => s + (p.aql ?? p.aqlPassed ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: 'var(--text-primary)' }}>
                    {filteredOrders.reduce((s, p) => s + (p.finalAql ?? p.finalAqlPassed ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#c084fc' }}>
                    {filteredOrders.reduce((s, p) => s + (p.transfers ?? p.boxTransfers ?? 0), 0)}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#EF4444' }}>
                    {filteredOrders.reduce((s, p) => s + (p.scrap ?? p.scrappedCount ?? 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {filteredOrders.length > 15 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setShowAllOrders(!showAllOrders)}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 22px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid var(--primary-teal)',
                    color: 'var(--primary-teal)',
                    cursor: 'pointer'
                  }}
                >
                  {showAllOrders
                    ? '▲ Show Less (First 15 Rows)'
                    : `▼ See More (${filteredOrders.length - 15} more records)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

            {/* ── Pre-QC Linked QRs Detail Modal ──────────────────────── */}
      {selectedPreQcModal && (
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
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  LINKED PRE-QC SUB-ASSEMBLY QRS ({selectedPreQcModal.preQcs.length})
                </span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Garment QR: <span style={{ fontFamily: 'monospace', color: 'var(--primary-teal)' }}>{selectedPreQcModal.itemQr}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedPreQcModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: 'var(--bg-surface-2)', padding: '12px', borderRadius: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PO Number:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>
                  {selectedPreQcModal.poNumber || 'N/A'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Style Name:</span>
                <span style={{ fontSize: '12px', fontWeight: 700, display: 'block', color: 'var(--text-primary)' }}>
                  {selectedPreQcModal.styleName || 'Standard'}
                </span>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Assigned Pre-QC QR List ({selectedPreQcModal.preQcs.length} units):
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedPreQcModal.preQcs.join('\n'));
                    showToast('Copied all Pre-QC QRs to clipboard', 'success');
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '6px' }}
                >
                  Copy All
                </button>
              </div>

              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '8px',
                backgroundColor: 'var(--bg-surface-2)',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                {selectedPreQcModal.preQcs.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No Pre-QC barcodes currently assigned to this garment.
                  </div>
                ) : (
                  selectedPreQcModal.preQcs.map((pqr, pIdx) => (
                    <div
                      key={pIdx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(234, 179, 8, 0.08)',
                        border: '1px solid rgba(234, 179, 8, 0.3)',
                        color: '#FDE047',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>#{pIdx + 1}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{pqr}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnassignPreQc(selectedPreQcModal.itemQr, pqr)}
                        title={`Delete / Unassign Pre-QC ${pqr} from garment ${selectedPreQcModal.itemQr}`}
                        style={{
                          background: 'rgba(239, 68, 68, 0.18)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '4px',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '3px 6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10px',
                          fontWeight: 700
                        }}
                      >
                        <Trash2 size={11} />
                        Unassign
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                onClick={() => setSelectedPreQcModal(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 18px', fontSize: '12px', borderRadius: '10px' }}
              >
                Close
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Box {selectedBoxModal.boxCode || selectedBoxModal.boxNumber}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleOpenEditBox(selectedBoxModal)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '6px',
                      color: '#38BDF8',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Edit Box Number"
                  >
                    <Edit2 size={12} />
                    Edit
                  </button>
                </div>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Active Scanned Garment QRs ({selectedBoxModal.productQrs?.length || 0}):
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Click <span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span> to remove an item from box
                </span>
              </div>
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
                        onClick={() => handleRemoveBoxItem(selectedBoxModal.id || selectedBoxModal.box_id || selectedBoxModal.boxCode || selectedBoxModal.box_code || selectedBoxModal.boxNumber, qr)}
                        title={`Delete ${qr} from this box`}
                        style={{
                          background: 'rgba(239, 68, 68, 0.18)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '2px 4px',
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

      {/* ── Edit Product QR / Serial Number Modal ────────────────── */}
      {editingItemQr && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60A5FA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Edit Serial / QR Barcode
                  </h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                    Update garment QR &amp; serial number across records
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItemQr(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Current QR / Serial
                </label>
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  fontWeight: 700
                }}>
                  {editingItemQr.currentQr}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--primary-teal)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  New QR / Serial Number
                </label>
                <input
                  type="text"
                  autoFocus
                  value={editingItemQr.newQr}
                  onChange={e => setEditingItemQr(prev => prev ? { ...prev, newQr: e.target.value.toUpperCase() } : null)}
                  onKeyDown={e => { if (e.key === 'Enter' && !isSavingItemQr) handleSaveItemQr(); }}
                  placeholder="Enter new QR / Serial..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-surface-2)',
                    border: '1.5px solid var(--primary-teal)',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                disabled={isSavingItemQr}
                onClick={() => setEditingItemQr(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingItemQr || !editingItemQr.newQr.trim()}
                onClick={handleSaveItemQr}
                className="btn btn-primary"
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  backgroundColor: '#3B82F6',
                  color: '#ffffff',
                  border: 'none',
                  cursor: isSavingItemQr ? 'wait' : 'pointer'
                }}
              >
                {isSavingItemQr ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Carton Box Number Modal ────────────────────────── */}
      {editingBox && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38BDF8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Edit Carton Box Number
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Update the box identifier or barcode label
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingBoxEdit && setEditingBox(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: 'var(--bg-surface-2)',
              borderRadius: '10px',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Current Box Number:</span>
                <strong style={{ color: 'var(--color-purple)', fontFamily: 'monospace', fontSize: '13px' }}>
                  {editingBox.currentNumber}
                </strong>
              </div>
              {(editingBox.box.po_number || editingBox.box.poNumber || editingBox.box.po_name) && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>PO Number:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {editingBox.box.po_number || editingBox.box.poNumber || editingBox.box.po_name}
                  </span>
                </div>
              )}
              {(editingBox.box.style_name || editingBox.box.styleName) && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Style:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {editingBox.box.style_name || editingBox.box.styleName}
                  </span>
                </div>
              )}
              {editingBox.box.customer && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {editingBox.box.customer}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                New Box Number / Barcode *
              </label>
              <input
                type="text"
                value={editingBox.newNumber}
                onChange={(e) => setEditingBox({ ...editingBox, newNumber: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveBoxEdit();
                  }
                }}
                disabled={isSavingBoxEdit}
                autoFocus
                placeholder="Enter new box number (e.g. BX-001)..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-surface-2)',
                  border: '1.5px solid var(--primary-teal)',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                ⚠️ This will rename the box in all packing logs, AQL records, and CSV exports.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setEditingBox(null)}
                disabled={isSavingBoxEdit}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBoxEdit}
                disabled={isSavingBoxEdit || !editingBox.newNumber.trim()}
                className="btn btn-primary"
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isSavingBoxEdit || !editingBox.newNumber.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSavingBoxEdit || !editingBox.newNumber.trim() ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSavingBoxEdit ? <RefreshCw size={14} className="spin" /> : <Edit2 size={14} />}
                {isSavingBoxEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
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
    outline: 'none',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    overflow: 'hidden'
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
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 5,
    backgroundColor: 'var(--bg-surface-2, #182235)'
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
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: active ? 800 : 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: active ? '#EAB308' : 'rgba(234, 179, 8, 0.08)',
    color: active ? '#000000' : '#FDE047',
    border: active ? '1.5px solid #FACC15' : '1px solid rgba(234, 179, 8, 0.35)',
    boxShadow: active ? '0 0 14px rgba(234, 179, 8, 0.5)' : 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })
};
