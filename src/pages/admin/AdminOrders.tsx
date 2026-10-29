import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { StatusPill } from '../../components/StatusPill';
import { SlidersHorizontal, Edit3, Trash2, RefreshCw, X, Box, Zap, ShieldAlert, Copy, Shirt, Plus, PlusCircle, ArrowRight, Users, ClipboardList, Search, ScanLine, Building2, Layers, CheckCircle2, Settings } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { parsePoLines, formatPoLinesString } from '../../utils/formatters';
import { CodeLifecycleModal } from '../../components/CodeLifecycleModal';
import '../../styles/tokens.css';

interface PoConfigItem {
  id?: string;
  config_code?: string;
  configCode?: string;
  size?: string;
  product_type?: string;
  productType?: string;
  quantity: number;
}

interface PoBoxConfigItem {
  id?: string;
  prefix: string;
  size: string;
  capacity: number;
}

interface FullPoFormData {
  poNumber: string;
  poName: string;
  mapPo: string;
  customer: string;
  styleId: string;
  supervisorId: string;
  shiftId: string;
  startDate: string;
  dueDate: string;
  plant?: string;
  lineNumber?: string;
  status: string;
  qcTestMode: string;
  remarks: string;
  allowNoProductPrefix: boolean;
  allowNoBoxPrefix: boolean;
  totalQuantity: number;
  configs: PoConfigItem[];
  boxConfigs: PoBoxConfigItem[];
}

export const AdminOrders: React.FC = () => {
  const navigate = useNavigate();
  const { currentRole, showToast } = useApp();
  const canDelete = currentRole === 'admin';
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [showLifecycleModal, setShowLifecycleModal] = useState<boolean>(false);
  const [lifecycleSearchCode, setLifecycleSearchCode] = useState<string>('');

  // Reference catalog data for full edit
  const [stylesList, setStylesList] = useState<any[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<any[]>([]);
  const [shiftsList, setShiftsList] = useState<any[]>([]);

  // 1. Edit Quantity Modal State
  const [qtyOrder, setQtyOrder] = useState<any | null>(null);
  const [editTotalQty, setEditTotalQty] = useState<number>(0);
  const [editConfigs, setEditConfigs] = useState<PoConfigItem[]>([]);
  const [savingQty, setSavingQty] = useState<boolean>(false);
  const [isQtyDirty, setIsQtyDirty] = useState<boolean>(false);

  // 2. Edit Full PO Modal State
  const [fullOrder, setFullOrder] = useState<any | null>(null);
  const [fullForm, setFullForm] = useState<FullPoFormData>({
    poNumber: '',
    poName: '',
    mapPo: '',
    customer: '',
    styleId: '',
    supervisorId: '',
    shiftId: '',
    startDate: '',
    dueDate: '',
    plant: '',
    status: 'CURRENT',
    qcTestMode: 'QC & Test',
    remarks: '',
    allowNoProductPrefix: false,
    allowNoBoxPrefix: false,
    totalQuantity: 500,
    configs: [],
    boxConfigs: []
  });
  const [savingFull, setSavingFull] = useState<boolean>(false);
  const [isFullDirty, setIsFullDirty] = useState<boolean>(false);

  // 3. Delete PO Modal State
  const [deleteTargetPo, setDeleteTargetPo] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // ── Primary Tab State: 'new' vs 'current' ───────────────────────
  const [activeTab, setActiveTab] = useState<'new' | 'current'>('current');
  const [currentSubTab, setCurrentSubTab] = useState<'customer' | 'styles' | 'po' | 'so'>('po');
  const [newStep, setNewStep] = useState<'customer' | 'style' | 'po' | 'so'>('customer');

  // Customer state
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showAddCustomerModal, setShowAddCustomerModal] = useState<boolean>(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    code: '',
    notes: ''
  });
  const [savingCustomer, setSavingCustomer] = useState<boolean>(false);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState<any | null>(null);

  // Edit Customer Modal State
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [editCustomerForm, setEditCustomerForm] = useState({
    name: '',
    code: '',
    notes: ''
  });
  const [savingEditCustomer, setSavingEditCustomer] = useState<boolean>(false);

  // Edit Style Modal State
  const [editingStyle, setEditingStyle] = useState<any | null>(null);
  const [editStyleForm, setEditStyleForm] = useState({
    code: '',
    name: '',
    customer: '',
    notes: ''
  });
  const [savingEditStyle, setSavingEditStyle] = useState<boolean>(false);

  // Edit PO Modal State (Normal Edit)
  const [editingPo, setEditingPo] = useState<any | null>(null);
  const [editPoForm, setEditPoForm] = useState({
    poNumber: '',
    poName: '',
    remarks: ''
  });
  const [savingEditPo, setSavingEditPo] = useState<boolean>(false);

  // Edit SO Modal State
  const [editingSo, setEditingSo] = useState<any | null>(null);
  const [editSoForm, setEditSoForm] = useState({
    so_number: '',
    map_so: '',
    notes: ''
  });
  const [savingEditSo, setSavingEditSo] = useState<boolean>(false);
  const [deleteTargetSo, setDeleteTargetSo] = useState<any | null>(null);
  const [deletingSo, setDeletingSo] = useState<boolean>(false);

  // Sales Orders state
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loadingSalesOrders, setLoadingSalesOrders] = useState<boolean>(false);
  const [soSearchQuery, setSoSearchQuery] = useState<string>('');
  const [showAddSoModal, setShowAddSoModal] = useState<boolean>(false);
  const [newSoForm, setNewSoForm] = useState({
    production_order_id: '',
    so_number: '',
    map_so: '',
    product: '',
    style_code: '',
    colour: 'Default',
    size_range: 'ALL',
    order_quantity: 500,
    box_capacity: 12,
    line_id: '',
    shift_id: ''
  });
  const [savingSo, setSavingSo] = useState<boolean>(false);

  // Selected entities for cascading 'Create New'
  const [selectedCustomerForNew, setSelectedCustomerForNew] = useState<any | null>(null);
  const [selectedStyleForNew, setSelectedStyleForNew] = useState<any | null>(null);
  const [selectedPoForNew, setSelectedPoForNew] = useState<any | null>(null);
  const [selectedSoForNew, setSelectedSoForNew] = useState<any | null>(null);

  // Step forms for cascading 'Create New' wizard
  const [newPoStepForm, setNewPoStepForm] = useState({
    poNumber: `PO-${Date.now().toString().slice(-6)}`,
    poName: '',
    mapPo: `SO-${Date.now().toString().slice(-4)}`,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    plant: 'Plant 1',
    lineNumber: 'Line 1',
    totalQuantity: 500,
    remarks: ''
  });
  const [newSoStepForm, setNewSoStepForm] = useState({
    so_number: `SO-${Date.now().toString().slice(-5)}`,
    map_so: `MAP-SO-${Date.now().toString().slice(-4)}`,
    product: 'Garment Product',
    colour: 'Standard',
    size_range: 'S, M, L, XL',
    order_quantity: 500,
    box_capacity: 12
  });

  // Step 3 (PO) Creation Modal State
  const [showAddPoModalInStep, setShowAddPoModalInStep] = useState<boolean>(false);
  const [newPoModalForm, setNewPoModalForm] = useState({
    poNumber: '',
    poName: '',
    notes: ''
  });
  const [savingPoInStep, setSavingPoInStep] = useState<boolean>(false);

  // Step 4 (SO) Creation Modal State
  const [showAddSoModalInStep, setShowAddSoModalInStep] = useState<boolean>(false);
  const [newSoModalForm, setNewSoModalForm] = useState({
    so_number: '',
    map_so: '',
    notes: ''
  });
  const [savingSoInStep, setSavingSoInStep] = useState<boolean>(false);

  const handleLaunchStyleDirect = () => {
    if (!selectedStyleForNew) {
      showToast('Please select a style first', 'error');
      return;
    }
    const poNum = `STYLE-${selectedStyleForNew.code}-${Date.now().toString().slice(-4)}`;
    const mapPo = `SO-${Date.now().toString().slice(-4)}`;
    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleForNew.id);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify({
      orderPathway: 'STYLE_DIRECT',
      customer: selectedCustomerForNew?.name || selectedStyleForNew.customer || 'Factory Customer',
      customerId: selectedCustomerForNew?.id || selectedStyleForNew.customer_id || '',
      styleId: selectedStyleForNew.id,
      styleCode: selectedStyleForNew.code,
      styleName: selectedStyleForNew.name,
      poNumber: poNum,
      poName: `${selectedStyleForNew.name} Direct Run`,
      mapPo: mapPo,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
    }));
    showToast('Style selected! Direct order configuration ready.', 'success');
    navigate('/admin/orders/configure');
  };

  const handleLaunchPoDirect = () => {
    if (!selectedStyleForNew) {
      showToast('Please select a style first', 'error');
      return;
    }
    const poNum = (selectedPoForNew?.poNumber || selectedPoForNew?.id || newPoStepForm.poNumber || `PO-${Date.now().toString().slice(-6)}`).trim();
    const mapPo = (selectedPoForNew?.mapPo || newPoStepForm.mapPo || `SO-${Date.now().toString().slice(-4)}`).trim();
    
    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleForNew.id);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify({
      orderPathway: 'PO_DIRECT',
      customer: selectedCustomerForNew?.name || selectedStyleForNew.customer || 'Factory Customer',
      customerId: selectedCustomerForNew?.id || selectedStyleForNew.customer_id || '',
      styleId: selectedStyleForNew.id,
      styleCode: selectedStyleForNew.code,
      styleName: selectedStyleForNew.name,
      poNumber: poNum,
      poName: (selectedPoForNew?.name || selectedPoForNew?.poName || newPoStepForm.poName || `${selectedStyleForNew.name} Run`).trim(),
      mapPo: mapPo,
      startDate: newPoStepForm.startDate,
      dueDate: newPoStepForm.dueDate,
      plant: newPoStepForm.plant,
      lineNumber: newPoStepForm.lineNumber,
      remarks: selectedPoForNew?.remarks || newPoStepForm.remarks
    }));
    showToast(`PO ${poNum} configured! Proceeding to operations & configs...`, 'success');
    navigate('/admin/orders/configure');
  };

  const handleLaunchFullMultiTier = async () => {
    if (!selectedStyleForNew) {
      showToast('Please select a style first', 'error');
      return;
    }
    const poNum = (selectedPoForNew?.poNumber || selectedPoForNew?.id || newPoStepForm.poNumber || `PO-${Date.now().toString().slice(-6)}`).trim();
    const mapPo = (selectedPoForNew?.mapPo || newPoStepForm.mapPo || `SO-${Date.now().toString().slice(-4)}`).trim();
    const soNum = (selectedSoForNew?.so_number || newSoStepForm.so_number || `SO-${Date.now().toString().slice(-5)}`).trim();

    sessionStorage.setItem('uniflow_draft_po_style_id', selectedStyleForNew.id);
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify({
      orderPathway: 'MULTI_TIER',
      customer: selectedCustomerForNew?.name || selectedStyleForNew.customer || 'Factory Customer',
      customerId: selectedCustomerForNew?.id || selectedStyleForNew.customer_id || '',
      styleId: selectedStyleForNew.id,
      styleCode: selectedStyleForNew.code,
      styleName: selectedStyleForNew.name,
      poNumber: poNum,
      poName: (selectedPoForNew?.name || selectedPoForNew?.poName || newPoStepForm.poName || `${selectedStyleForNew.name} - ${soNum}`).trim(),
      mapPo: mapPo,
      soNumber: soNum,
      soId: selectedSoForNew?.id,
      startDate: newPoStepForm.startDate,
      dueDate: newPoStepForm.dueDate,
      plant: newPoStepForm.plant,
      lineNumber: newPoStepForm.lineNumber,
      remarks: `Sales Order: ${soNum} | Colour: ${selectedSoForNew?.colour || newSoStepForm.colour || 'Standard'}`
    }));

    showToast(`Full Multi-Tier Order (${selectedCustomerForNew?.name || 'Customer'} ➔ ${selectedStyleForNew.code} ➔ ${poNum} ➔ ${soNum}) configured!`, 'success');
    navigate('/admin/orders/configure');
  };

  // Garment Styles Management State
  const [adminStyles, setAdminStyles] = useState<any[]>([]);
  const [loadingStyles, setLoadingStyles] = useState<boolean>(false);
  const [styleSearchQuery, setStyleSearchQuery] = useState<string>('');

  // Add Style Modal State
  const [showAddStyleModal, setShowAddStyleModal] = useState<boolean>(false);
  const [newStyleForm, setNewStyleForm] = useState({
    code: '',
    name: '',
    customer: '',
    customerId: '',
    notes: ''
  });
  const [savingNewStyle, setSavingNewStyle] = useState<boolean>(false);

  // Delete Style Modal State
  const [deleteTargetStyle, setDeleteTargetStyle] = useState<any | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<boolean>(false);
  const [deletingStyle, setDeletingStyle] = useState<boolean>(false);

  const fetchAdminCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const res = await apiFetch<any[]>('/api/admin/customers');
      if (Array.isArray(res)) {
        setCustomers(res);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load customers', 'error');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerForm.name.trim() || !newCustomerForm.code.trim()) {
      showToast('Customer name and code are required', 'error');
      return;
    }
    setSavingCustomer(true);
    try {
      const created: any = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomerForm)
      });
      showToast(`Customer "${newCustomerForm.name}" created successfully`, 'success');
      setShowAddCustomerModal(false);
      setNewCustomerForm({ name: '', code: '', notes: '' });
      fetchAdminCustomers();
      if (created && created.id) {
        setSelectedCustomerForNew(created);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create customer', 'error');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTargetCustomer) return;
    try {
      await apiFetch(`/api/customers/${deleteTargetCustomer.id}`, { method: 'DELETE' });
      showToast(`Customer "${deleteTargetCustomer.name}" deleted successfully`, 'success');
      setDeleteTargetCustomer(null);
      fetchAdminCustomers();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete customer', 'error');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!editCustomerForm.name.trim() || !editCustomerForm.code.trim()) {
      showToast('Customer name and code are required', 'error');
      return;
    }
    setSavingEditCustomer(true);
    try {
      await apiFetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCustomerForm)
      });
      showToast(`Customer "${editCustomerForm.name}" updated successfully`, 'success');
      setEditingCustomer(null);
      fetchAdminCustomers();
    } catch (err: any) {
      showToast(err.message || 'Failed to update customer', 'error');
    } finally {
      setSavingEditCustomer(false);
    }
  };

  const handleUpdateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStyle) return;
    if (!editStyleForm.code.trim() || !editStyleForm.name.trim()) {
      showToast('Style code and style name are required', 'error');
      return;
    }
    setSavingEditStyle(true);
    try {
      await apiFetch(`/api/admin/styles/${editingStyle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editStyleForm)
      });
      showToast(`Style "${editStyleForm.code}" updated successfully`, 'success');
      setEditingStyle(null);
      fetchAdminStyles();
      fetchReferenceData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update style', 'error');
    } finally {
      setSavingEditStyle(false);
    }
  };

  const handleUpdatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPo) return;
    if (!editPoForm.poNumber.trim()) {
      showToast('PO number is required', 'error');
      return;
    }
    setSavingEditPo(true);
    try {
      await apiFetch(`/api/admin/orders/${editingPo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: editPoForm.poNumber.trim(),
          poName: editPoForm.poName.trim(),
          remarks: editPoForm.remarks.trim()
        })
      });
      showToast(`Production Order "${editPoForm.poNumber}" updated successfully`, 'success');
      setEditingPo(null);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update Production Order', 'error');
    } finally {
      setSavingEditPo(false);
    }
  };

  const handleUpdateSo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSo) return;
    if (!editSoForm.so_number.trim()) {
      showToast('SO number is required', 'error');
      return;
    }
    setSavingEditSo(true);
    try {
      await apiFetch(`/api/sales-orders/${editingSo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSoForm)
      });
      showToast(`Sales Order "${editSoForm.so_number}" updated successfully`, 'success');
      setEditingSo(null);
      fetchAdminSalesOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update Sales Order', 'error');
    } finally {
      setSavingEditSo(false);
    }
  };

  const handleDeleteSo = async () => {
    if (!deleteTargetSo) return;
    setDeletingSo(true);
    try {
      await apiFetch(`/api/sales-orders/${deleteTargetSo.id}`, {
        method: 'DELETE'
      });
      showToast(`Sales Order "${deleteTargetSo.so_number}" deleted successfully`, 'success');
      setDeleteTargetSo(null);
      fetchAdminSalesOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete Sales Order', 'error');
    } finally {
      setDeletingSo(false);
    }
  };

  const fetchAdminSalesOrders = async () => {
    setLoadingSalesOrders(true);
    try {
      const res = await apiFetch<any[]>('/api/admin/sales-orders');
      if (Array.isArray(res)) {
        setSalesOrders(res);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load sales orders', 'error');
    } finally {
      setLoadingSalesOrders(false);
    }
  };

  const handleCreateSalesOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSoForm.so_number.trim() || !newSoForm.production_order_id) {
      showToast('Sales Order number and Production Order selection are required', 'error');
      return;
    }
    setSavingSo(true);
    try {
      await apiFetch('/api/sales-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSoForm)
      });
      showToast(`Sales Order "${newSoForm.so_number}" created successfully`, 'success');
      setShowAddSoModal(false);
      setNewSoForm({
        production_order_id: '',
        so_number: '',
        map_so: '',
        product: '',
        style_code: '',
        colour: 'Default',
        size_range: 'ALL',
        order_quantity: 500,
        box_capacity: 12,
        line_id: '',
        shift_id: ''
      });
      fetchAdminSalesOrders();
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to create Sales Order', 'error');
    } finally {
      setSavingSo(false);
    }
  };

  const fetchAdminStyles = async () => {
    setLoadingStyles(true);
    try {
      const res = await apiFetch('/api/admin/styles');
      if (Array.isArray(res)) {
        setAdminStyles(res);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load garment styles', 'error');
    } finally {
      setLoadingStyles(false);
    }
  };

  const handleCreateStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStyleForm.code.trim() || !newStyleForm.name.trim()) {
      showToast('Style code and style name are required', 'error');
      return;
    }
    setSavingNewStyle(true);
    try {
      const payload: any = {
        code: newStyleForm.code.trim().toUpperCase(),
        name: newStyleForm.name.trim(),
        customer: selectedCustomerForNew ? selectedCustomerForNew.name : newStyleForm.customer.trim(),
        customerId: selectedCustomerForNew ? selectedCustomerForNew.id : newStyleForm.customerId,
        notes: newStyleForm.notes.trim()
      };
      const created: any = await apiFetch('/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(`Style "${newStyleForm.code}" created successfully`, 'success');
      setShowAddStyleModal(false);
      setNewStyleForm({ code: '', name: '', customer: '', customerId: '', notes: '' });
      fetchAdminStyles();
      fetchReferenceData();
      if (created && created.id) {
        setSelectedStyleForNew(created);
      } else {
        setSelectedStyleForNew({
          id: `style-${Date.now()}`,
          ...payload
        });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create style', 'error');
    } finally {
      setSavingNewStyle(false);
    }
  };

  const handleCreatePoInStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoModalForm.poNumber.trim()) {
      showToast('PO number is required', 'error');
      return;
    }
    setSavingPoInStep(true);
    const poNumberTrimmed = newPoModalForm.poNumber.trim();
    const poNameTrimmed = newPoModalForm.poName.trim() || `${selectedStyleForNew?.name || 'Garment'} PO`;
    const customerName = selectedCustomerForNew?.name || selectedStyleForNew?.customer || 'Factory Customer';
    
    const newPo = {
      id: `po-${Date.now()}`,
      poNumber: poNumberTrimmed,
      name: poNameTrimmed,
      customer: customerName,
      customer_id: selectedCustomerForNew?.id,
      style_id: selectedStyleForNew?.id,
      styleId: selectedStyleForNew?.id,
      style_code: selectedStyleForNew?.code,
      styleName: selectedStyleForNew?.name,
      status: 'CURRENT',
      totalQuantity: 500,
      remarks: newPoModalForm.notes.trim()
    };

    setOrders(prev => [newPo, ...prev]);
    setSelectedPoForNew(newPo);
    setNewPoStepForm(prev => ({
      ...prev,
      poNumber: poNumberTrimmed,
      poName: poNameTrimmed,
      remarks: newPoModalForm.notes.trim()
    }));
    setShowAddPoModalInStep(false);
    setNewPoModalForm({ poNumber: '', poName: '', notes: '' });
    setSavingPoInStep(false);
    showToast(`Production Order "${poNumberTrimmed}" created successfully`, 'success');
  };

  const handleCreateSoInStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSoModalForm.so_number.trim()) {
      showToast('Sales Order number is required', 'error');
      return;
    }
    setSavingSoInStep(true);
    const soNumberTrimmed = newSoModalForm.so_number.trim();
    const mapSoTrimmed = newSoModalForm.map_so.trim() || soNumberTrimmed;
    const poId = selectedPoForNew?.id || `po-${Date.now()}`;
    const poNum = selectedPoForNew?.poNumber || selectedPoForNew?.id || newPoStepForm.poNumber;

    const newSo = {
      id: `so-${Date.now()}`,
      so_number: soNumberTrimmed,
      map_so: mapSoTrimmed,
      production_order_id: poId,
      po_number: poNum,
      customer: selectedCustomerForNew?.name || 'Factory Customer',
      style_code: selectedStyleForNew?.code || '',
      product: selectedStyleForNew?.name || 'Garment Product',
      colour: 'Standard',
      order_quantity: 500,
      box_capacity: 12,
      status: 'CURRENT',
      remarks: newSoModalForm.notes.trim()
    };

    try {
      if (selectedPoForNew?.id && !selectedPoForNew.id.startsWith('po-')) {
        await apiFetch('/api/sales-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            production_order_id: selectedPoForNew.id,
            so_number: soNumberTrimmed,
            map_so: mapSoTrimmed,
            product: newSo.product,
            style_code: newSo.style_code,
            colour: 'Standard',
            order_quantity: 500,
            box_capacity: 12
          })
        });
        fetchAdminSalesOrders();
      }
    } catch {
      // Local fallback
    }

    setSalesOrders(prev => [newSo, ...prev]);
    setSelectedSoForNew(newSo);
    setNewSoStepForm(prev => ({
      ...prev,
      so_number: soNumberTrimmed,
      map_so: mapSoTrimmed
    }));
    setShowAddSoModalInStep(false);
    setNewSoModalForm({ so_number: '', map_so: '', notes: '' });
    setSavingSoInStep(false);
    showToast(`Sales Order "${soNumberTrimmed}" created successfully`, 'success');
  };

  const handleDeleteStyle = async () => {
    if (!deleteTargetStyle) return;
    setDeletingStyle(true);
    try {
      const query = confirmUnlink ? '?force=true' : '';
      await apiFetch(`/api/admin/styles/${deleteTargetStyle.id}${query}`, {
        method: 'DELETE'
      });
      showToast(`Style "${deleteTargetStyle.code || deleteTargetStyle.name}" deleted successfully`, 'success');
      setDeleteTargetStyle(null);
      setConfirmUnlink(false);
      fetchAdminStyles();
      fetchReferenceData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete style', 'error');
    } finally {
      setDeletingStyle(false);
    }
  };

  const filteredStyles = adminStyles.filter((s) => {
    if (!styleSearchQuery.trim()) return true;
    const q = styleSearchQuery.toLowerCase();
    return (
      (s.code || '').toLowerCase().includes(q) ||
      (s.name || '').toLowerCase().includes(q) ||
      (s.customer || '').toLowerCase().includes(q) ||
      (s.season || '').toLowerCase().includes(q)
    );
  });

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/orders');
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch production orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchReferenceData = async () => {
    try {
      const [stylesData, usersData, shiftsData] = await Promise.allSettled([
        apiFetch('/api/styles'),
        apiFetch('/api/admin/users'),
        apiFetch('/api/shifts')
      ]);

      if (stylesData.status === 'fulfilled' && Array.isArray(stylesData.value)) {
        setStylesList(stylesData.value);
      }
      if (usersData.status === 'fulfilled' && Array.isArray(usersData.value)) {
        // Include supervisors and admins
        const sups = usersData.value.filter((u: any) => u.role === 'SUPERVISOR' || u.role === 'ADMIN');
        setSupervisorsList(sups.length > 0 ? sups : usersData.value);
      }
      if (shiftsData.status === 'fulfilled' && Array.isArray(shiftsData.value)) {
        setShiftsList(shiftsData.value);
      }
    } catch (err) {
      console.warn('Failed to pre-fetch reference catalogs', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchReferenceData();
    fetchAdminStyles();
    fetchAdminCustomers();
    fetchAdminSalesOrders();

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'new') {
      setActiveTab('new');
    } else if (tabParam === 'styles') {
      setActiveTab('current');
      setCurrentSubTab('styles');
    } else if (tabParam === 'customer' || tabParam === 'customers') {
      setActiveTab('current');
      setCurrentSubTab('customer');
    } else if (tabParam === 'so' || tabParam === 'sales') {
      setActiveTab('current');
      setCurrentSubTab('so');
    } else {
      setActiveTab('current');
      setCurrentSubTab('po');
    }
  }, []);

  // ── Open Edit PO Qty Modal ───────────────────────────────────────
  const openEditQtyModal = (po: any) => {
    setQtyOrder(po);
    setEditTotalQty(po.configuredQuantity || po.total_quantity || 500);
    setEditConfigs(
      (po.configs || []).map((c: any) => ({
        id: c.id,
        config_code: c.config_code || c.configCode,
        size: c.size,
        quantity: c.quantity || 0
      }))
    );
    setIsQtyDirty(false);
  };

  const handleCloseQtyModal = () => {
    if (isQtyDirty && !window.confirm('You have unsaved quantity edits. Discard changes and close?')) {
      return;
    }
    setQtyOrder(null);
    setIsQtyDirty(false);
  };

  const handleSaveQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qtyOrder) return;

    setSavingQty(true);
    try {
      const payload: any = {};
      if (editConfigs.length > 0) {
        payload.configs = editConfigs.map(c => ({
          id: c.id,
          quantity: Number(c.quantity)
        }));
        payload.newQuantity = editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
      } else {
        payload.newQuantity = Number(editTotalQty);
      }

      await apiFetch(`/api/admin/orders/${qtyOrder.id}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      showToast(`Updated planned quantity for PO ${qtyOrder.poNumber || qtyOrder.po_number}`, 'success');
      setQtyOrder(null);
      setIsQtyDirty(false);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update PO quantity', 'error');
    } finally {
      setSavingQty(false);
    }
  };

  // ── Open Edit Full PO Modal ───────────────────────────────────────
  const openEditFullModal = (po: any) => {
    setFullOrder(po);

    let resolvedQcMode = 'QC & Test';
    const rawQc = po.qcTestMode || po.qc_test_mode;
    if (rawQc === 'QC_ONLY' || rawQc === 'QC Only') resolvedQcMode = 'QC Only';
    else if (rawQc === 'TEST_ONLY' || rawQc === 'Test Only' || rawQc === 'Functional Test Only') resolvedQcMode = 'Functional Test Only';

    setFullForm({
      poNumber: po.poNumber || po.po_number || '',
      poName: po.poName || po.po_name || '',
      mapPo: po.mapPo || po.map_po || po.poNumber || po.po_number || '',
      customer: po.customer || 'Factory Customer',
      styleId: po.styleId || po.style_id || '',
      supervisorId: po.supervisorId || po.supervisor_id || '',
      shiftId: po.shiftId || po.shift_id || '',
      startDate: po.startDate || po.start_date || new Date().toISOString().split('T')[0],
      dueDate: po.dueDate || po.due_date || new Date().toISOString().split('T')[0],
      plant: po.plant || '',
      lineNumber: po.lineNumber || po.line_number || '',
      status: (po.status || 'CURRENT').toUpperCase(),
      qcTestMode: resolvedQcMode,
      remarks: po.remarks || '',
      allowNoProductPrefix: Boolean(po.allowNoProductPrefix),
      allowNoBoxPrefix: Boolean(po.allowNoBoxPrefix),
      totalQuantity: po.configuredQuantity || po.total_quantity || 500,
      configs: (po.configs || []).map((c: any) => ({
        id: c.id,
        configCode: c.configCode || c.config_code,
        size: c.size,
        productType: c.productType || c.product_type,
        quantity: Number(c.quantity) || 0
      })),
      boxConfigs: (po.boxConfigurations || po.boxConfigs || []).map((b: any) => ({
        id: b.id,
        prefix: b.prefix || 'BX',
        size: b.size || 'M',
        capacity: Number(b.capacity) || 12
      }))
    });
    setIsFullDirty(false);
  };

  const handleAddProductConfig = () => {
    const newCfg: PoConfigItem = {
      configCode: '',
      size: '',
      productType: 'GARMENT',
      quantity: 100
    };
    setFullForm(prev => ({
      ...prev,
      configs: [...prev.configs, newCfg]
    }));
    setIsFullDirty(true);
  };

  const handleRemoveProductConfig = (index: number) => {
    setFullForm(prev => {
      const updated = [...prev.configs];
      updated.splice(index, 1);
      return {
        ...prev,
        configs: updated
      };
    });
    setIsFullDirty(true);
  };

  const handleAddBoxConfig = () => {
    const newBox: PoBoxConfigItem = {
      prefix: 'BX',
      size: 'M',
      capacity: 12
    };
    setFullForm(prev => ({
      ...prev,
      boxConfigs: [...prev.boxConfigs, newBox]
    }));
    setIsFullDirty(true);
  };

  const handleRemoveBoxConfig = (index: number) => {
    setFullForm(prev => {
      const updated = [...prev.boxConfigs];
      updated.splice(index, 1);
      return {
        ...prev,
        boxConfigs: updated
      };
    });
    setIsFullDirty(true);
  };

  const handleCloseFullModal = () => {
    if (isFullDirty && !window.confirm('You have unsaved changes in this PO. Discard and close?')) {
      return;
    }
    setFullOrder(null);
    setIsFullDirty(false);
  };

  const handleSaveFullOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullOrder) return;

    if (!fullForm.poNumber.trim()) {
      showToast('PO Number is required', 'error');
      return;
    }
    if (!fullForm.customer.trim()) {
      showToast('Customer name is required', 'error');
      return;
    }

    setSavingFull(true);
    try {
      const payload: any = {
        poNumber: fullForm.poNumber.trim(),
        poName: fullForm.poName.trim() || null,
        mapPo: fullForm.mapPo.trim() || fullForm.poNumber.trim(),
        customer: fullForm.customer.trim(),
        styleId: fullForm.styleId || null,
        supervisorId: fullForm.supervisorId || null,
        shiftId: fullForm.shiftId || null,
        plant: fullForm.plant?.trim() || null,
        lineNumber: fullForm.lineNumber?.trim() ? (formatPoLinesString(fullForm.lineNumber) || fullForm.lineNumber.trim()) : null,
        startDate: fullForm.startDate,
        dueDate: fullForm.dueDate,
        status: fullForm.status,
        qcTestMode: fullForm.qcTestMode,
        remarks: fullForm.remarks,
        allowNoProductPrefix: fullForm.allowNoProductPrefix,
        allowNoBoxPrefix: fullForm.allowNoBoxPrefix
      };

      if (fullForm.configs.length > 0) {
        payload.configs = fullForm.configs.map(c => ({
          id: c.id,
          configCode: (c.configCode || c.config_code || '').trim().toUpperCase(),
          size: (c.size || '').trim().toUpperCase(),
          productType: (c.productType || c.product_type || 'GARMENT').trim(),
          quantity: Number(c.quantity)
        }));
        payload.totalQuantity = fullForm.configs.reduce((sum, c) => sum + Number(c.quantity || 0), 0);
      } else {
        payload.totalQuantity = Number(fullForm.totalQuantity);
      }

      if (Array.isArray(fullForm.boxConfigs)) {
        payload.boxConfigs = fullForm.boxConfigs.map(b => ({
          id: b.id,
          prefix: (b.prefix || '').trim().toUpperCase(),
          size: (b.size || '').trim().toUpperCase(),
          capacity: Number(b.capacity) || 12
        }));
      }

      const res = await apiFetch<{ message: string; order: any }>(`/api/admin/orders/${fullOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      showToast(res.message || `PO ${fullForm.poNumber} updated successfully`, 'success');
      setFullOrder(null);
      setIsFullDirty(false);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update Production Order', 'error');
    } finally {
      setSavingFull(false);
    }
  };

  const handleDeletePo = async () => {
    if (!deleteTargetPo) return;
    setDeleting(true);
    try {
      const res = await apiFetch<{ message: string }>(`/api/admin/orders/${deleteTargetPo.id}`, {
        method: 'DELETE'
      });
      showToast(res.message || `PO ${deleteTargetPo.poNumber || deleteTargetPo.po_number} permanently deleted`, 'success');
      setDeleteTargetPo(null);
      fetchOrders();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete Production Order', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyPoToNew = (po: any) => {
    const newPoId = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const draftGen = {
      id: newPoId,
      poName: po.poName || po.po_name ? `${po.poName || po.po_name} (Copy)` : `${po.poNumber || po.po_number || po.id} Copy`,
      mapPo: po.mapPo || po.map_po ? `${po.mapPo || po.map_po}-COPY` : `MAP-PO-${Math.floor(40000 + Math.random() * 9000)}`,
      customer: po.customer,
      styleId: po.styleId || po.style_id,
      styleCode: po.styleCode || po.style_code,
      styleName: po.styleName || po.style_name,
      startDate: po.startDate || po.start_date,
      dueDate: po.dueDate || po.due_date,
      supervisorId: po.supervisorId || po.supervisor_id,
      shiftId: po.shiftId || po.shift_id,
      shiftName: po.shiftName || po.shift_name,
      remarks: po.remarks,
      selectedOperations: po.selectedOperations || ['Pre QC', 'QC Test', 'Packing', 'AQL Checker', 'Box Transfer'],
      qcTestMode: po.qcTestMode || 'QC & Test',
      qcStationCount: po.qcStationCount || po.qc_station_count || 1,
      allocations: po.allocations || po.shifts || []
    };

    sessionStorage.setItem('uniflow_draft_po_style_id', po.styleId || po.style_id || '');
    sessionStorage.setItem('uniflow_draft_po_general', JSON.stringify(draftGen));
    sessionStorage.setItem('uniflow_draft_po_shifts', JSON.stringify(po.allocations || po.shifts || []));
    sessionStorage.setItem('uniflow_draft_po_configs', JSON.stringify(po.productConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_box_configs', JSON.stringify(po.boxConfigurations || []));
    sessionStorage.setItem('uniflow_draft_po_allow_no_product_prefix', String(Boolean(po.allowNoProductPrefix || po.allow_no_product_prefix)));
    sessionStorage.setItem('uniflow_draft_po_allow_no_box_prefix', String(Boolean(po.allowNoBoxPrefix || po.allow_no_box_prefix)));
    sessionStorage.setItem('uniflow_copy_source_po_id', po.poNumber || po.po_number || po.id);

    showToast(`Configurations copied from ${po.poNumber || po.po_number || po.id}! Customizing new PO...`, 'info');
    navigate('/supervisor/production-orders/new/general');
  };

  const filteredOrders = orders.filter(po => {
    // If order was launched directly from STYLE (without PO), it belongs exclusively to the Style subtab, not PO subtab!
    const pathway = (po.orderPathway || po.order_pathway || '').toUpperCase();
    const poNumRaw = String(po.poNumber || po.po_number || po.id || '');
    if (pathway === 'STYLE_DIRECT' || poNumRaw.startsWith('STYLE-')) {
      return false;
    }

    if (!orderSearchQuery.trim()) return true;
    const q = orderSearchQuery.toLowerCase().trim();
    const poNum = poNumRaw.toLowerCase();
    const poName = String(po.poName || po.po_name || '').toLowerCase();
    const styleName = String(po.styleName || po.style_name || '').toLowerCase();
    const styleCode = String(po.styleCode || po.style_code || '').toLowerCase();
    const customer = String(po.customer || '').toLowerCase();
    const lineNum = String(po.lineNumber || po.line_number || '').toLowerCase();
    return (
      poNum.includes(q) ||
      poName.includes(q) ||
      styleName.includes(q) ||
      styleCode.includes(q) ||
      customer.includes(q) ||
      lineNum.includes(q)
    );
  });

  const filteredCustomers = customers.filter(c => {
    if (!customerSearchQuery.trim()) return true;
    const q = customerSearchQuery.toLowerCase().trim();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  const filteredSalesOrders = salesOrders.filter(so => {
    if (!soSearchQuery.trim()) return true;
    const q = soSearchQuery.toLowerCase().trim();
    return (
      (so.so_number || '').toLowerCase().includes(q) ||
      (so.map_so || '').toLowerCase().includes(q) ||
      (so.po_number || '').toLowerCase().includes(q) ||
      (so.po_name || '').toLowerCase().includes(q) ||
      (so.customer || so.customer_name || '').toLowerCase().includes(q) ||
      (so.style_code || so.style_name || '').toLowerCase().includes(q) ||
      (so.product || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: '1 1 auto', minWidth: '200px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>
            {activeTab === 'new'
              ? 'Launch New Order (Customer ➔ Style ➔ PO ➔ SO)'
              : 'Factory Production Orders & Multi-Tier Oversight'}
          </h2>
          {activeTab !== 'new' && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              Live oversight across Customers, Styles, Production Orders, and Sales Orders with live status.
            </p>
          )}
        </div>
      </div>

      {/* ── Modern Primary Tabs Bar (Only 2 Tabs: Create New & Current) ── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        backgroundColor: 'var(--bg-surface-1)',
        padding: '5px',
        borderRadius: '14px',
        border: '1.5px solid var(--border-color)',
        width: '100%',
        maxWidth: '440px',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 800,
            borderRadius: '10px',
            backgroundColor: activeTab === 'new' ? 'var(--primary-teal)' : 'transparent',
            color: activeTab === 'new' ? '#071B23' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'new' ? '0 0 12px rgba(20, 184, 166, 0.25)' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          <PlusCircle size={16} /> Create New
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('current')}
          style={{
            flex: 1,
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 800,
            borderRadius: '10px',
            backgroundColor: activeTab === 'current' ? 'var(--primary-teal)' : 'transparent',
            color: activeTab === 'current' ? '#071B23' : 'var(--text-secondary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'current' ? '0 0 12px rgba(20, 184, 166, 0.25)' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          <ClipboardList size={16} /> Current
        </button>
      </div>

      {/* ── TAB 1: CREATE NEW PO WORKFLOW (Admin) ── */}
      {activeTab === 'new' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Step Navigation Bar: 1. Customer -> 2. Style -> 3. PO (Optional) -> 4. SO (Optional) */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-surface-1)',
            borderRadius: '14px',
            border: '1.5px solid var(--border-color)',
            padding: '6px',
            gap: '8px',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}>
            <button
              type="button"
              onClick={() => setNewStep('customer')}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: newStep === 'customer' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: newStep === 'customer' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: newStep === 'customer' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Building2 size={16} /> 1. Customer {selectedCustomerForNew ? '✓' : ''}
            </button>

            <button
              type="button"
              onClick={() => setNewStep('style')}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: newStep === 'style' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: newStep === 'style' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: newStep === 'style' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Shirt size={16} /> 2. Style {selectedStyleForNew ? '✓' : ''}
            </button>

            <button
              type="button"
              onClick={() => setNewStep('po')}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: newStep === 'po' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: newStep === 'po' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: newStep === 'po' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <ClipboardList size={16} /> 3. PO (Optional)
            </button>

            <button
              type="button"
              onClick={() => setNewStep('so')}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: newStep === 'so' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: newStep === 'so' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: newStep === 'so' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Layers size={16} /> 4. SO (Optional)
            </button>
          </div>

          {/* ── STEP 1: CUSTOMER SELECTION OR CREATION ── */}
          {newStep === 'customer' && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', padding: '18px 16px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Step 1 of 4 • Primary Client Entity
                  </span>
                  <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 0' }}>
                    Select or Create Customer
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(true)}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> + Create New Customer
                </button>
              </div>

              {selectedCustomerForNew && (
                <div style={{
                  backgroundColor: 'rgba(20, 184, 166, 0.1)',
                  border: '1.5px solid var(--primary-teal)',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  flexWrap: 'wrap'
                }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                      SELECTED ACTIVE CUSTOMER:
                    </span>
                    <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                      {selectedCustomerForNew.name} ({selectedCustomerForNew.code})
                    </strong>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setNewStep('style')}
                      style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 800, borderRadius: '8px', backgroundColor: 'var(--primary-teal)', border: 'none', color: '#041820', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      Proceed to Step 2: Style <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Or select from existing registered customers:
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Scrollable catalog ({customers.length} available)
                </span>
              </div>
              <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                paddingRight: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: '10px'
              }}>
                {customers.map(c => {
                  const isSelected = selectedCustomerForNew?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCustomerForNew(c)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                        border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)' }}>{c.code}</span>
                        {isSelected && <CheckCircle2 size={16} color="var(--primary-teal)" />}
                      </div>
                      <h4 style={{ margin: '4px 0 2px', fontSize: '15px', color: 'var(--text-primary)' }}>{c.name}</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{c.styles_count || 0} styles registered</span>
                        {c.notes && (
                          <span style={{ fontStyle: 'italic', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.notes}>
                            "{c.notes}"
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2: STYLE SELECTION OR CREATION ── */}
          {newStep === 'style' && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', padding: '22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Step 2 of 4 • Garment Style & Design
                  </span>
                  <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                    Select or Define Garment Style
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Selected Customer: <strong style={{ color: 'var(--primary-teal)' }}>{selectedCustomerForNew?.name || 'Any Customer'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setNewStep('customer')}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change Customer
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCustomerForNew) {
                      setNewStyleForm(prev => ({
                        ...prev,
                        customer: selectedCustomerForNew.name,
                        customerId: selectedCustomerForNew.id
                      }));
                    }
                    setShowAddStyleModal(true);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> + Create New Style
                </button>
              </div>

              {selectedStyleForNew && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    border: '1.5px solid var(--primary-teal)',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                        SELECTED ACTIVE STYLE:
                      </span>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                        {selectedStyleForNew.name} ({selectedStyleForNew.code})
                      </strong>
                    </div>
                  </div>

                  {/* ── TWO CLEAR ACTION PATHWAYS WHEN STYLE IS SELECTED (50% / 50% SIDE-BY-SIDE) ── */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                    gap: '14px'
                  }}>
                    {/* Left Box (50%): Option 1 - Proceed to Step 3 (PO Order) */}
                    <div style={{
                      backgroundColor: 'rgba(20, 184, 166, 0.06)',
                      border: '1.5px dashed var(--primary-teal)',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-teal)', fontWeight: 800, fontSize: '13px' }}>
                        <ArrowRight size={16} /> Option 1: Proceed to Step 3 (PO Order)
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewStep('po')}
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          padding: '11px 18px',
                          fontSize: '13px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Proceed to Step 3: Production Order (PO) <ArrowRight size={15} />
                      </button>
                    </div>

                    {/* Right Box (50%): Option 2 - Configure & Launch Style Order (Yellow Button) */}
                    <div style={{
                      backgroundColor: 'rgba(234, 179, 8, 0.06)',
                      border: '1.5px dashed #eab308',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#eab308', fontWeight: 800, fontSize: '13px' }}>
                        <Zap size={16} /> Option 2: Launch Direct Order at Style Level
                      </div>
                      <button
                        type="button"
                        onClick={handleLaunchStyleDirect}
                        style={{
                          width: '100%',
                          padding: '11px 18px',
                          backgroundColor: '#eab308',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#0f172a',
                          fontWeight: 800,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 12px rgba(234, 179, 8, 0.35)'
                        }}
                      >
                        <Zap size={15} /> Configure & Launch Style Order ➔
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Select from garment styles:
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Scrollable catalog ({adminStyles.filter(s => !selectedCustomerForNew || !s.customer_id || s.customer_id === selectedCustomerForNew.id || (s.customer && s.customer.toLowerCase() === selectedCustomerForNew.name.toLowerCase())).length} styles available)
                </span>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                paddingRight: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: '10px'
              }}>
                {adminStyles
                  .filter(s => !selectedCustomerForNew || !s.customer_id || s.customer_id === selectedCustomerForNew.id || (s.customer && s.customer.toLowerCase() === selectedCustomerForNew.name.toLowerCase()))
                  .map(s => {
                    const isSelected = selectedStyleForNew?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedStyleForNew(s)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                          border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', fontFamily: 'monospace' }}>{s.code}</span>
                          {isSelected && <CheckCircle2 size={16} color="var(--primary-teal)" />}
                        </div>
                        <h4 style={{ margin: '4px 0 2px', fontSize: '15px', color: 'var(--text-primary)' }}>{s.name}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer: {s.customer || 'Factory'}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── STEP 3: PRODUCTION ORDER (PO) SPECIFICATION ── */}
          {newStep === 'po' && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', padding: '22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Step 3 of 4 • Production Order (PO) Details
                  </span>
                  <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                    Select or Define Production Order (PO)
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Customer: <strong style={{ color: 'var(--primary-teal)' }}>{selectedCustomerForNew?.name || selectedStyleForNew?.customer || 'Factory Customer'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedCustomerForNew(null); setSelectedStyleForNew(null); setSelectedPoForNew(null); setSelectedSoForNew(null); setNewStep('customer'); }}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change Customer
                    </button>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Style: <strong style={{ color: 'var(--primary-teal)' }}>{selectedStyleForNew?.name} ({selectedStyleForNew?.code})</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedStyleForNew(null); setSelectedPoForNew(null); setSelectedSoForNew(null); setNewStep('style'); }}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change Style
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const freshPo = `PO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
                    setNewPoModalForm({
                      poNumber: freshPo,
                      poName: `${selectedStyleForNew?.name || 'Garment'} Production Run`,
                      notes: ''
                    });
                    setShowAddPoModalInStep(true);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> + Create New PO
                </button>
              </div>

              {selectedPoForNew && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    border: '1.5px solid var(--primary-teal)',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                        SELECTED ACTIVE PO:
                      </span>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                        {selectedPoForNew.poNumber || selectedPoForNew.id} {selectedPoForNew.name || selectedPoForNew.poName ? `— ${selectedPoForNew.name || selectedPoForNew.poName}` : ''}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '10px' }}>
                        • Style: {selectedStyleForNew?.code || selectedPoForNew.style_code || 'STD'} • Customer: {selectedCustomerForNew?.name || selectedPoForNew.customer || 'Factory'}
                      </span>
                    </div>
                  </div>

                  {/* ── TWO CLEAR ACTION PATHWAYS WHEN PO IS SELECTED (50% / 50% SIDE-BY-SIDE) ── */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                    gap: '14px'
                  }}>
                    {/* Left Box (50%): Option 1 - Proceed to Step 4 (SO Order) */}
                    <div style={{
                      backgroundColor: 'rgba(20, 184, 166, 0.06)',
                      border: '1.5px dashed var(--primary-teal)',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-teal)', fontWeight: 800, fontSize: '13px' }}>
                        <ArrowRight size={16} /> Option 1: Proceed to Step 4 (SO Order)
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewStep('so')}
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          padding: '11px 18px',
                          fontSize: '13px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Proceed to Step 4: Sales Order (SO) <ArrowRight size={15} />
                      </button>
                    </div>

                    {/* Right Box (50%): Option 2 - Configure & Launch PO Order (Yellow Button) */}
                    <div style={{
                      backgroundColor: 'rgba(234, 179, 8, 0.06)',
                      border: '1.5px dashed #eab308',
                      borderRadius: '14px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#eab308', fontWeight: 800, fontSize: '13px' }}>
                        <ClipboardList size={16} /> Option 2: Launch Direct Production Order
                      </div>
                      <button
                        type="button"
                        onClick={handleLaunchPoDirect}
                        style={{
                          width: '100%',
                          padding: '11px 18px',
                          backgroundColor: '#eab308',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#0f172a',
                          fontWeight: 800,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 12px rgba(234, 179, 8, 0.35)'
                        }}
                      >
                        <Zap size={15} /> Configure & Launch PO Order ➔
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Select from existing registered Production Orders:
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Scrollable catalog ({
                    orders.filter(po => {
                      const pathway = (po.orderPathway || po.order_pathway || '').toUpperCase();
                      const num = String(po.poNumber || po.po_number || po.id || '');
                      if (pathway === 'STYLE_DIRECT' || num.startsWith('STYLE-')) return false;

                      if (!selectedStyleForNew) return true;
                      return po.styleId === selectedStyleForNew.id || po.style_id === selectedStyleForNew.id || po.style_code === selectedStyleForNew.code || (po.style && (po.style.id === selectedStyleForNew.id || po.style.code === selectedStyleForNew.code));
                    }).length
                  } POs available)
                </span>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                paddingRight: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: '10px'
              }}>
                {orders
                  .filter(po => {
                    const pathway = (po.orderPathway || po.order_pathway || '').toUpperCase();
                    const num = String(po.poNumber || po.po_number || po.id || '');
                    if (pathway === 'STYLE_DIRECT' || num.startsWith('STYLE-')) return false;

                    if (!selectedStyleForNew) return true;
                    return po.styleId === selectedStyleForNew.id || po.style_id === selectedStyleForNew.id || po.style_code === selectedStyleForNew.code || (po.style && (po.style.id === selectedStyleForNew.id || po.style.code === selectedStyleForNew.code));
                  })
                  .map(po => {
                    const isSelected = selectedPoForNew?.id === po.id || selectedPoForNew?.poNumber === (po.poNumber || po.id);
                    return (
                      <div
                        key={po.id || po.poNumber}
                        onClick={() => {
                          setSelectedPoForNew(po);
                          setNewPoStepForm(prev => ({
                            ...prev,
                            poNumber: po.poNumber || po.id,
                            poName: po.name || po.poName || '',
                            totalQuantity: po.totalQuantity || 500
                          }));
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                          border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                            {po.poNumber || po.id}
                          </span>
                          {isSelected && <CheckCircle2 size={16} color="var(--primary-teal)" />}
                        </div>
                        <h4 style={{ margin: '4px 0 2px', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {po.name || po.poName || 'Production Order'}
                        </h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Qty: {po.totalQuantity || 500} • Customer: {po.customer || 'Factory'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── STEP 4: SALES ORDER (SO) SPECIFICATION ── */}
          {newStep === 'so' && (
            <div className="card" style={{ backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-color)', padding: '22px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Step 4 of 4 • Sales Order (SO) Specification
                  </span>
                  <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
                    Select or Define Sales Order (SO)
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Hierarchy: <strong>{selectedCustomerForNew?.name || 'Customer'}</strong> ➔ <strong>{selectedStyleForNew?.code || 'Style'}</strong> ➔ <strong style={{ color: 'var(--primary-teal)' }}>{selectedPoForNew?.poNumber || selectedPoForNew?.id || newPoStepForm.poNumber}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedSoForNew(null); setNewStep('po'); }}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change PO
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewSoModalForm({
                      so_number: `SO-${Date.now().toString().slice(-5)}`,
                      map_so: `MAP-SO-${Date.now().toString().slice(-4)}`,
                      notes: ''
                    });
                    setShowAddSoModalInStep(true);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} /> + Create New SO
                </button>
              </div>

              {selectedSoForNew && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    border: '1.5px solid var(--primary-teal)',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', display: 'block' }}>
                        SELECTED ACTIVE SO:
                      </span>
                      <strong style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                        {selectedSoForNew.so_number} {selectedSoForNew.map_so ? `— ${selectedSoForNew.map_so}` : ''}
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '10px' }}>
                        • PO: {selectedSoForNew.po_number || selectedPoForNew?.poNumber || selectedPoForNew?.id}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSoForNew(null)}
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      Change SO
                    </button>
                  </div>

                  <div style={{
                    backgroundColor: 'rgba(234, 179, 8, 0.06)',
                    border: '1.5px dashed #eab308',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '14px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#eab308', fontWeight: 800, fontSize: '13px' }}>
                        <Zap size={16} /> Full 4-Tier Order Hierarchy Ready
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        All tiers verified: Customer ➔ Style ➔ PO ➔ SO. Proceed directly to configure Pre-QC, QC, Shift assignments, and box packing.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchFullMultiTier}
                      style={{
                        padding: '12px 22px',
                        fontSize: '13px',
                        fontWeight: 900,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        whiteSpace: 'nowrap',
                        backgroundColor: '#eab308',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(234, 179, 8, 0.4)'
                      }}
                    >
                      <Zap size={16} /> Configure & Launch Full Multi-Tier Order ➔
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Select from existing registered Sales Orders (SO):
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Scrollable catalog ({
                    salesOrders.filter(so => {
                      if (!selectedPoForNew) return true;
                      return so.production_order_id === selectedPoForNew.id || so.po_number === (selectedPoForNew.poNumber || selectedPoForNew.id);
                    }).length
                  } SOs available)
                </span>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                paddingRight: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                gap: '10px'
              }}>
                {salesOrders
                  .filter(so => {
                    if (!selectedPoForNew) return true;
                    return so.production_order_id === selectedPoForNew.id || so.po_number === (selectedPoForNew.poNumber || selectedPoForNew.id);
                  })
                  .map(so => {
                    const isSelected = selectedSoForNew?.id === so.id || selectedSoForNew?.so_number === so.so_number;
                    return (
                      <div
                        key={so.id || so.so_number}
                        onClick={() => {
                          setSelectedSoForNew(so);
                          setNewSoStepForm(prev => ({
                            ...prev,
                            so_number: so.so_number,
                            map_so: so.map_so || so.so_number,
                            order_quantity: so.order_quantity || 500,
                            box_capacity: so.box_capacity || 12
                          }));
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-surface-2)',
                          border: isSelected ? '1.5px solid var(--primary-teal)' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', fontFamily: 'monospace' }}>
                            {so.so_number}
                          </span>
                          {isSelected && <CheckCircle2 size={16} color="var(--primary-teal)" />}
                        </div>
                        <h4 style={{ margin: '4px 0 2px', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {so.map_so || so.product || 'Sales Order'}
                        </h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Colour: {so.colour || 'Standard'}{so.order_quantity ? ` • Qty: ${so.order_quantity}` : ''}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setNewStep('po')}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ← Back to PO Step
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: CURRENT (MULTI-TIER OVERSIGHT: CUSTOMER, STYLES, PO, SO) ── */}
      {activeTab === 'current' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Sub-Tabs Bar: 1. Customer, 2. Styles, 3. PO, 4. SO */}
          <div style={{
            display: 'flex',
            gap: '8px',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '6px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}>
            <button
              type="button"
              onClick={() => { setCurrentSubTab('customer'); fetchAdminCustomers(); }}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: currentSubTab === 'customer' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: currentSubTab === 'customer' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: currentSubTab === 'customer' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Building2 size={15} /> 1. Customer ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => { setCurrentSubTab('styles'); fetchAdminStyles(); }}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: currentSubTab === 'styles' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: currentSubTab === 'styles' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: currentSubTab === 'styles' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Shirt size={15} /> 2. Styles ({adminStyles.length})
            </button>

            <button
              type="button"
              onClick={() => { setCurrentSubTab('po'); fetchOrders(); }}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: currentSubTab === 'po' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: currentSubTab === 'po' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: currentSubTab === 'po' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <ClipboardList size={15} /> 3. PO ({orders.length})
            </button>

            <button
              type="button"
              onClick={() => { setCurrentSubTab('so'); fetchAdminSalesOrders(); }}
              style={{
                flex: '1 0 auto',
                minWidth: '120px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: currentSubTab === 'so' ? '1.5px solid var(--primary-teal)' : '1px solid transparent',
                backgroundColor: currentSubTab === 'so' ? 'rgba(20, 184, 166, 0.16)' : 'transparent',
                color: currentSubTab === 'so' ? 'var(--primary-teal)' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Layers size={15} /> 4. SO ({salesOrders.length})
            </button>
          </div>

          {/* ── SubTab 1: CUSTOMERS ── */}
          {currentSubTab === 'customer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                backgroundColor: 'var(--bg-surface-1)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search customers by name, code, contact..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      style={{
                        ...styles.input,
                        paddingLeft: '34px',
                        margin: 0
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={fetchAdminCustomers}
                    className="btn btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
                    disabled={loadingCustomers}
                  >
                    <RefreshCw size={13} className={loadingCustomers ? 'spin' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <div style={{
                  backgroundColor: 'var(--bg-surface-1)',
                  borderRadius: '12px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  border: '1px solid var(--border-color)'
                }}>
                  <Building2 size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>No Customers Found</h4>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {customerSearchQuery ? 'Try matching a different keyword' : 'No factory customers registered yet.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
                  {filteredCustomers.map(c => (
                    <div
                      key={c.id}
                      className="card"
                      style={{
                        backgroundColor: 'var(--bg-surface-1)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '14px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {c.code}
                            </span>
                            <h4 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 4px' }}>
                              {c.name}
                            </h4>
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(20, 184, 166, 0.15)',
                            color: 'var(--primary-teal)',
                            border: '1px solid rgba(20, 184, 166, 0.3)'
                          }}>
                            {c.styles_count || 0} Styles
                          </span>
                        </div>

                        {c.notes ? (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-2)', padding: '8px 10px', borderRadius: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                              Special Notes:
                            </span>
                            <span style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>"{c.notes}"</span>
                          </div>
                        ) : (
                          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Standard terms • No special notes
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomer(c);
                            setEditCustomerForm({
                              name: c.name || '',
                              code: c.code || '',
                              notes: c.notes || ''
                            });
                          }}
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '8px',
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid #3b82f6',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteTargetCustomer(c)}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              borderRadius: '8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef4444',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SubTab 3: PRODUCTION ORDERS (PO) ── */}
          {currentSubTab === 'po' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Search Bar for POs, Styles & Barcode scanning */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '10px 14px',
            borderRadius: '14px',
            border: '1.5px solid var(--border-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}>
            <Search size={18} color="var(--primary-teal)" />
            <input
              type="text"
              value={orderSearchQuery}
              onChange={e => setOrderSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && orderSearchQuery.trim()) {
                  setLifecycleSearchCode(orderSearchQuery.trim());
                  setShowLifecycleModal(true);
                }
              }}
              placeholder="Search by PO Number, Style, Customer or scan Box / Product QR…"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 600,
                outline: 'none',
                flex: 1
              }}
            />
            {orderSearchQuery && (
              <button
                type="button"
                onClick={() => setOrderSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLifecycleSearchCode(orderSearchQuery.trim());
                setShowLifecycleModal(true);
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(22, 184, 174, 0.15)',
                border: '1px solid var(--primary-teal)',
                color: 'var(--primary-teal)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
              title="Inspect lifecycle of product QR or box code"
            >
              <ScanLine size={14} /> Scan / Inspect QR
            </button>
          </div>

          {loading && orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading production orders...
            </div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No production orders registered.
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{
              padding: '30px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                No Production Orders matched "<strong>{orderSearchQuery}</strong>"
              </span>
              <button
                type="button"
                onClick={() => {
                  setLifecycleSearchCode(orderSearchQuery.trim());
                  setShowLifecycleModal(true);
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ScanLine size={14} color="var(--primary-teal)" /> Inspect "{orderSearchQuery}" as Product QR or Box Barcode
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
              {filteredOrders.map(po => {
            const packedQty = Number(po.packedCount || po.packed_count || 0);
            const targetQty = Number(po.configuredQuantity || po.total_quantity || 500);
            const configs: any[] = po.configs || [];
            const percent = targetQty > 0 ? Math.min(100, Math.round((packedQty / targetQty) * 100)) : 0;

            return (
              <div key={po.id} className="card" style={{ backgroundColor: 'var(--bg-surface-1)', margin: 0, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  {/* Header Row: PO Number & Status Pill */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box size={16} color="var(--color-teal)" />
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-teal)', margin: 0 }}>
                        {po.poNumber || po.po_number}
                      </h3>
                    </div>
                    <StatusPill label={po.status || 'CURRENT'} variant={po.status === 'COMPLETED' ? 'green' : 'teal'} />
                  </div>

                  {/* Sub-info: Name, Style, Plant, Line */}
                  <div style={{ marginTop: '8px' }}>
                    {(po.poName || po.po_name) && (
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                        🏷️ {po.poName || po.po_name}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Style: <strong>{po.styleName || po.style_name || 'Standard Style'}</strong></span>
                      {po.plant && (
                        <span style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          fontWeight: 700
                        }}>
                          🏢 {po.plant}
                        </span>
                      )}
                      {(po.lineNumber || po.line_number) && (
                        <span style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          fontWeight: 700
                        }}>
                          🧵 {po.lineNumber || po.line_number}
                        </span>
                      )}
                    </div>
                    {(po.allowNoProductPrefix || po.allowNoBoxPrefix) && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {po.allowNoProductPrefix && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(20, 184, 166, 0.15)', color: 'var(--color-teal)', fontWeight: 700 }}>
                            🔓 Free Serials
                          </span>
                        )}
                        {po.allowNoBoxPrefix && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(20, 184, 166, 0.15)', color: 'var(--color-teal)', fontWeight: 700 }}>
                            📦 Free Box IDs
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Destination & Total Quantity Info */}
                  {(() => {
                    const hasSoDest = (po.orderPathway || po.order_pathway || '').toUpperCase() === 'SO' || 
                      salesOrders.some(so => so.production_order_id === po.id || so.production_order_id === po.dbId || so.po_number === po.poNumber || so.po_number === po.id);
                    const destinationText = hasSoDest ? 'Sales Order (SO)' : 'Direct PO';
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '12px' }}>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px 10px', borderRadius: '8px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>Destination</span>
                          <span style={{ color: hasSoDest ? '#a855f7' : 'var(--color-teal)', fontWeight: 800 }}>
                            {destinationText}
                          </span>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '8px 10px', borderRadius: '8px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>Total Quantity</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>
                            {targetQty.toLocaleString()} pcs
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Action Buttons: Full Configs (Yellow) ONLY if destination is PO (not SO) */}
                {(() => {
                  const hasSoDestination = (po.orderPathway || po.order_pathway || '').toUpperCase() === 'SO' || 
                    salesOrders.some(so => so.production_order_id === po.id || so.production_order_id === po.dbId || so.po_number === po.poNumber || so.po_number === po.id);
                  return (
                    <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {!hasSoDestination && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/configure?editPoId=${po.id || po.dbId || po.poNumber}`)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            borderRadius: '8px',
                            backgroundColor: '#eab308',
                            color: '#000000',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 6px rgba(234, 179, 8, 0.25)',
                            transition: 'all 0.2s ease'
                          }}
                          title="Edit full 3-step configurations (Dates, Lines, Tests, Stations, Shifts, Box/Product Configs)"
                        >
                          <Settings size={13} /> ⚙️ Configure & Edit All Flow
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setEditingPo(po);
                        setEditPoForm({
                          poNumber: po.poNumber || po.po_number || '',
                          poName: po.poName || po.po_name || '',
                          remarks: po.remarks || po.notes || ''
                        });
                      }}
                      style={{
                        flex: 1,
                        fontSize: '11px',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid #3b82f6',
                        color: '#60a5fa',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Edit this Production Order"
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                  {canDelete && (
                    <button
                      onClick={() => setDeleteTargetPo(po)}
                      style={{
                        flex: 1,
                        fontSize: '11px',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#f87171',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Permanently delete this Production Order"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
          );
          })}
        </div>
      )}
    </div>
  )}

  {/* ── SubTab 2: GARMENT STYLES ── */}
  {currentSubTab === 'styles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search styles by code, name, customer..."
                  value={styleSearchQuery}
                  onChange={(e) => setStyleSearchQuery(e.target.value)}
                  style={{
                    ...styles.input,
                    paddingLeft: '34px',
                    margin: 0
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredStyles.length}</strong> of {adminStyles.length} styles
              </span>
              <button
                type="button"
                onClick={fetchAdminStyles}
                className="btn btn-secondary"
                style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
                disabled={loadingStyles}
              >
                <RefreshCw size={13} className={loadingStyles ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Styles Grid */}
          {loadingStyles && adminStyles.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading garment styles...
            </div>
          ) : filteredStyles.length === 0 ? (
            <div style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color)',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Shirt size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>No garment styles found</p>
              <p style={{ margin: 0, fontSize: '12px' }}>
                {styleSearchQuery ? 'Try matching a different keyword or filter' : 'No garment styles registered yet.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
              {filteredStyles.map((s: any) => {
                const poCount = Number(s.po_count || 0);
                const directStyleOrder = orders.find(o => {
                  const isMatch = o.styleId === s.id || o.style_id === s.id || o.styleCode === s.code;
                  const pathway = (o.orderPathway || o.order_pathway || '').toUpperCase();
                  const num = String(o.poNumber || o.po_number || o.id || '');
                  return isMatch && (pathway === 'STYLE_DIRECT' || num.startsWith('STYLE-'));
                });
                return (
                  <div
                    key={s.id}
                    className="card"
                    style={{
                      backgroundColor: 'var(--bg-surface-1)',
                      margin: 0,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(20, 184, 166, 0.15)',
                              color: 'var(--color-teal)',
                              fontWeight: 800,
                              fontSize: '12px',
                              fontFamily: 'monospace'
                            }}>
                              {s.code}
                            </span>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: poCount > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              color: poCount > 0 ? '#60a5fa' : 'var(--text-muted)',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>
                              {poCount} {poCount === 1 ? 'PO' : 'POs'} Linked
                            </span>
                          </div>
                          <h4 style={{ margin: '8px 0 0 0', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {s.name}
                          </h4>
                        </div>
                      </div>

                      {/* Metadata Table / Items */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '12px' }}>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Customer</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.customer || '—'}</span>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 10px', borderRadius: '6px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Season</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.season || '—'}</span>
                        </div>
                      </div>

                      {s.notes && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '6px 8px', borderRadius: '6px' }}>
                          "{s.notes}"
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>Added: {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Active'}</span>
                        <span style={{ color: 'var(--color-teal)' }}>ID: {s.id}</span>
                      </div>

                      {/* Yellow Full Configs Button — ONLY if this Style was the final destination */}
                      {directStyleOrder && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/configure?editPoId=${directStyleOrder.id || directStyleOrder.dbId || directStyleOrder.poNumber}`)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            borderRadius: '8px',
                            backgroundColor: '#eab308',
                            color: '#000000',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 6px rgba(234, 179, 8, 0.25)',
                            marginBottom: '8px',
                            transition: 'all 0.2s ease'
                          }}
                          title={`Edit full configurations of direct style run (${directStyleOrder.poNumber || directStyleOrder.id})`}
                        >
                          <Settings size={13} /> ⚙️ Configure & Edit All Flow ({s.code})
                        </button>
                      )}

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStyle(s);
                            setEditStyleForm({
                              code: s.code || '',
                              name: s.name || '',
                              customer: s.customer || '',
                              notes: s.notes || ''
                            });
                          }}
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '8px',
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid #3b82f6',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTargetStyle(s);
                              setConfirmUnlink(false);
                            }}
                            style={{
                              flex: 1,
                              padding: '7px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              borderRadius: '8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid #ef4444',
                              color: '#f87171',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SubTab 4: SALES ORDERS (SO) ── */}
      {currentSubTab === 'so' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            backgroundColor: 'var(--bg-surface-1)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search SO number, SO Name, PO, Style..."
                  value={soSearchQuery}
                  onChange={(e) => setSoSearchQuery(e.target.value)}
                  style={{
                    ...styles.input,
                    paddingLeft: '34px',
                    margin: 0
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={fetchAdminSalesOrders}
                className="btn btn-secondary"
                style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
                disabled={loadingSalesOrders}
              >
                <RefreshCw size={13} className={loadingSalesOrders ? 'spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {filteredSalesOrders.length === 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-surface-1)',
              borderRadius: '12px',
              padding: '36px 20px',
              textAlign: 'center',
              border: '1px solid var(--border-color)'
            }}>
              <Layers size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>No Sales Orders Found</h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                {soSearchQuery ? 'Try matching a different keyword' : 'No sales orders registered yet.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '14px' }}>
              {filteredSalesOrders.map(so => (
                <div
                  key={so.id}
                  className="card"
                  style={{
                    backgroundColor: 'var(--bg-surface-1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary-teal)', textTransform: 'uppercase' }}>
                          SO: {so.so_number}
                        </span>
                        <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0' }}>
                          SO Name: {so.map_so || '—'}
                        </h4>
                      </div>
                      <StatusPill label={so.status || 'CURRENT'} variant={so.status === 'COMPLETED' ? 'green' : 'teal'} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '10px 0', fontSize: '11px' }}>
                      <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 8px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Parent PO</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{so.po_number || '—'}</span>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 8px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Customer</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{so.customer_name || so.customer || '—'}</span>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 8px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Style</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{so.style_name || so.style_code || '—'}</span>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-surface-2)', padding: '6px 8px', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Target Quantity</span>
                        <span style={{ color: 'var(--color-teal)', fontWeight: 800 }}>{so.order_quantity} pcs</span>
                      </div>
                    </div>

                    {(so.line_name || so.shift_name) && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {so.line_name && <span>Line: {so.line_name} </span>}
                        {so.shift_name && <span>• Shift: {so.shift_name}</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>Created: {so.created_at ? new Date(so.created_at).toLocaleDateString() : '—'}</span>
                      <span style={{ color: 'var(--primary-teal)' }}>Box Cap: {so.box_capacity || 12}</span>
                    </div>

                    {/* Yellow Parent PO Configs Button */}
                    {(() => {
                      const linkedPoForSo = orders.find(o => o.id === so.production_order_id || o.dbId === so.production_order_id || o.poNumber === so.po_number || o.id === so.po_number);
                      const targetPoId = so.production_order_id || linkedPoForSo?.id || linkedPoForSo?.dbId;
                      if (!targetPoId) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/configure?editPoId=${targetPoId}`)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            borderRadius: '8px',
                            backgroundColor: '#eab308',
                            color: '#000000',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 6px rgba(234, 179, 8, 0.25)',
                            marginBottom: '8px',
                            transition: 'all 0.2s ease'
                          }}
                          title={`Edit all configurations of parent PO (${so.po_number || 'Parent PO'})`}
                        >
                          <Settings size={13} /> ⚙️ Configure & Edit All Flow ({so.so_number || 'SO Flow'})
                        </button>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSo(so);
                          setEditSoForm({
                            so_number: so.so_number || '',
                            map_so: so.map_so || '',
                            notes: so.remarks || so.notes || ''
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          backgroundColor: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid #3b82f6',
                          color: '#60a5fa',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Edit3 size={13} /> Edit
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleteTargetSo(so)}
                          style={{
                            flex: 1,
                            padding: '7px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            color: '#f87171',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )}

      {/* ── 1. EDIT PO QUANTITY MODAL ────────────────────────────────────── */}
      {qtyOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '12px 8px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: '16px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-teal)' }}>PO QUANTITY CONFIGURATION</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit PO Quantity: {qtyOrder.poNumber || qtyOrder.po_number}
                </h3>
              </div>
              <button onClick={handleCloseQtyModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.3)', padding: '10px 12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)' }}>
                🛡️ Processed Safety Limit: Minimum {qtyOrder.packedCount || qtyOrder.packed_count || 0} pcs
              </span>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                You cannot reduce target planned quantity below already packed/processed garments ({qtyOrder.packedCount || qtyOrder.packed_count || 0} pcs). This updates only the quantity.
              </p>
            </div>

            <form onSubmit={handleSaveQuantity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {editConfigs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Size Configurations Quantity:</label>
                  {editConfigs.map((cfg, index) => (
                    <div key={cfg.id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '120px' }}>
                        Size {cfg.size || 'STD'} ({cfg.config_code || cfg.configCode})
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={cfg.quantity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const updated = [...editConfigs];
                          updated[index].quantity = val;
                          setEditConfigs(updated);
                          setIsQtyDirty(true);
                        }}
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontWeight: 700
                        }}
                        required
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)', textAlign: 'right', marginTop: '4px' }}>
                    Total Target Planned: {editConfigs.reduce((sum, c) => sum + Number(c.quantity || 0), 0)} pcs
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>Total Target Quantity (pcs)</label>
                  <input
                    type="number"
                    min={Number(qtyOrder.packedCount || qtyOrder.packed_count || 0)}
                    value={editTotalQty}
                    onChange={e => {
                      setEditTotalQty(Number(e.target.value));
                      setIsQtyDirty(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontWeight: 700
                    }}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseQtyModal}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={savingQty}
                >
                  {savingQty ? 'Saving...' : 'Save Quantity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 2. EDIT FULL PO MODAL ────────────────────────────────────────── */}
      {fullOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '12px 8px',
          overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '740px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
            margin: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-1)',
              flexShrink: 0
            }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  FULL PRODUCTION ORDER MANAGEMENT
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Full PO: {fullOrder.poNumber || fullOrder.po_number}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseFullModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveFullOrder} style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {/* Safety banner */}
              <div style={{
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                padding: '10px 14px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <ShieldAlert size={18} color="#c084fc" />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#c084fc' }}>Processed Safeguard: </strong>
                  Cannot reduce quantity below already processed garments ({fullOrder.packedCount || fullOrder.packed_count || 0} pcs). Existing IDs, relationships, and tracking records will be preserved.
                </div>
              </div>

              {/* 1. Identification Section */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  1. PO Identification & Reference
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      PO Number *
                    </label>
                    <input
                      type="text"
                      value={fullForm.poNumber}
                      onChange={e => {
                        setFullForm({ ...fullForm, poNumber: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Customer PO
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CUST-PO-90210"
                      value={fullForm.poName}
                      onChange={e => {
                        setFullForm({ ...fullForm, poName: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Customer / Buyer *
                    </label>
                    <input
                      type="text"
                      value={fullForm.customer}
                      onChange={e => {
                        setFullForm({ ...fullForm, customer: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      SO (Sales Order)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SO-44821"
                      value={fullForm.mapPo}
                      onChange={e => {
                        setFullForm({ ...fullForm, mapPo: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Operations & Style Section */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  2. Style & Operational Assignment
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Garment Style
                    </label>
                    <select
                      value={fullForm.styleId}
                      onChange={e => {
                        setFullForm({ ...fullForm, styleId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Current Style ({fullOrder.styleName || 'Standard'}) --</option>
                      {stylesList.map(st => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Assigned Supervisor
                    </label>
                    <select
                      value={fullForm.supervisorId}
                      onChange={e => {
                        setFullForm({ ...fullForm, supervisorId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Keep Current ({fullOrder.supervisorName || 'Supervisor'}) --</option>
                      {supervisorsList.map(sup => (
                        <option key={sup.id} value={sup.id}>
                          {sup.full_name || sup.name || sup.username} ({sup.employee_no || sup.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Shift Allocation
                    </label>
                    <select
                      value={fullForm.shiftId}
                      onChange={e => {
                        setFullForm({ ...fullForm, shiftId: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="">-- Factory Shift (Default) --</option>
                      {shiftsList.map(sh => (
                        <option key={sh.id} value={sh.id}>
                          {sh.name} ({sh.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Order Status
                    </label>
                    <select
                      value={fullForm.status}
                      onChange={e => {
                        setFullForm({ ...fullForm, status: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="CURRENT">CURRENT (Active / In Progress)</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Plant / Garment Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Biyagama, Katunayake"
                      value={fullForm.plant || ''}
                      onChange={e => {
                        setFullForm({ ...fullForm, plant: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.input}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Production Line Numbers (Assigned Lines)
                      </label>
                      {fullForm.lineNumber?.trim() && (
                        <span style={{ fontSize: '11px', color: 'var(--primary-teal)', fontWeight: 700 }}>
                          {parsePoLines(fullForm.lineNumber).length} Line{parsePoLines(fullForm.lineNumber).length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        position: 'absolute',
                        left: '12px',
                        color: 'var(--primary-teal)',
                        fontWeight: 800,
                        fontSize: '12px',
                        pointerEvents: 'none'
                      }}>
                        Line
                      </div>
                      <input
                        type="text"
                        placeholder="1, 6, 8 (Enter line numbers separated by comma)"
                        value={(fullForm.lineNumber || '').replace(/^Line\s*/i, '')}
                        onChange={e => {
                          const val = e.target.value;
                          setFullForm({
                            ...fullForm,
                            lineNumber: !val.trim() ? '' : val.toLowerCase().startsWith('line') ? val : `Line ${val}`
                          });
                          setIsFullDirty(true);
                        }}
                        style={{ ...styles.input, paddingLeft: '48px' }}
                      />
                    </div>
                    {fullForm.lineNumber?.trim() && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {parsePoLines(fullForm.lineNumber).map((line, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: 'rgba(20, 184, 166, 0.15)',
                              color: 'var(--primary-teal)',
                              border: '1px solid rgba(20, 184, 166, 0.35)'
                            }}
                          >
                            ✓ {line}
                          </span>
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                      Multiple factory line numbers (e.g. 1, 6, 8). Operators can select their active line during work.
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Schedule & QC Mode */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  3. Timeline Schedule & Quality Testing
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={fullForm.startDate}
                      onChange={e => {
                        setFullForm({ ...fullForm, startDate: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      Due Date *
                    </label>
                    <input
                      type="date"
                      value={fullForm.dueDate}
                      onChange={e => {
                        setFullForm({ ...fullForm, dueDate: e.target.value });
                        setIsFullDirty(true);
                      }}
                      required
                      style={styles.input}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                      QC Test Mode
                    </label>
                    <select
                      value={fullForm.qcTestMode}
                      onChange={e => {
                        setFullForm({ ...fullForm, qcTestMode: e.target.value });
                        setIsFullDirty(true);
                      }}
                      style={styles.select}
                    >
                      <option value="QC & Test">QC & Functional Test (Standard)</option>
                      <option value="QC Only">QC Only</option>
                      <option value="Functional Test Only">Functional Test Only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 4. Prefix Validation Modes */}
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--bg-surface-2)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                  4. Prefix Validation Modes
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fullForm.allowNoProductPrefix}
                      onChange={e => {
                        setFullForm({ ...fullForm, allowNoProductPrefix: e.target.checked });
                        setIsFullDirty(true);
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-teal)' }}
                    />
                    <span>
                      <strong>No Prefix / Free Serial Numbers</strong>
                      <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        Permit product serial numbers without enforcing configured prefixes.
                      </small>
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fullForm.allowNoBoxPrefix}
                      onChange={e => {
                        setFullForm({ ...fullForm, allowNoBoxPrefix: e.target.checked });
                        setIsFullDirty(true);
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--color-teal)' }}
                    />
                    <span>
                      <strong>No Box Prefix / Free Box Identifiers</strong>
                      <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '11px' }}>
                        Permit any box identifier without enforcing configured box prefix.
                      </small>
                    </span>
                  </label>
                </div>
              </div>

              {/* 5. Planned Quantities & Product Size Configurations */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    5. Product Configurations & Size Breakdown
                  </span>
                  <button
                    type="button"
                    onClick={handleAddProductConfig}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      border: '1px solid var(--primary-teal)',
                      color: 'var(--primary-teal)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Add Size / Configuration
                  </button>
                </div>

                {fullForm.configs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {fullForm.configs.map((cfg, index) => (
                      <div key={cfg.id || index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'var(--bg-surface-2)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ flex: '1 1 120px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Prefix / Code</label>
                          <input
                            type="text"
                            placeholder="e.g. PNFLSS"
                            value={cfg.configCode || cfg.config_code || ''}
                            onChange={e => {
                              const updated = [...fullForm.configs];
                              updated[index].configCode = e.target.value;
                              setFullForm({ ...fullForm, configs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', textTransform: 'uppercase' }}
                            required={!fullForm.allowNoProductPrefix}
                          />
                        </div>

                        <div style={{ flex: '1 1 80px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Size</label>
                          <input
                            type="text"
                            placeholder="e.g. M, L, XL"
                            value={cfg.size || ''}
                            onChange={e => {
                              const updated = [...fullForm.configs];
                              updated[index].size = e.target.value;
                              setFullForm({ ...fullForm, configs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', textTransform: 'uppercase' }}
                            required
                          />
                        </div>

                        <div style={{ flex: '1 1 100px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Type</label>
                          <input
                            type="text"
                            placeholder="e.g. GARMENT"
                            value={cfg.productType || cfg.product_type || 'GARMENT'}
                            onChange={e => {
                              const updated = [...fullForm.configs];
                              updated[index].productType = e.target.value;
                              setFullForm({ ...fullForm, configs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{ ...styles.input, padding: '4px 8px', fontSize: '12px' }}
                          />
                        </div>

                        <div style={{ flex: '1 1 100px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Planned Qty</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              min={1}
                              value={cfg.quantity}
                              onChange={e => {
                                const val = Number(e.target.value);
                                const updated = [...fullForm.configs];
                                updated[index].quantity = val;
                                setFullForm({ ...fullForm, configs: updated });
                                setIsFullDirty(true);
                              }}
                              style={{ ...styles.input, padding: '4px 8px', fontSize: '12px' }}
                              required
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>pcs</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveProductConfig(index)}
                          title="Remove this configuration"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '14px'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-teal)', textAlign: 'right', marginTop: '4px' }}>
                      Sum Target Planned: {fullForm.configs.reduce((sum, c) => sum + Number(c.quantity || 0), 0)} pcs
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      No individual size breakdown defined. Single total PO planned quantity will be used. Click "+ Add Size / Configuration" above to define sizes and prefixes.
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                        Total Planned Quantity (pcs) *
                      </label>
                      <input
                        type="number"
                        min={Number(fullOrder.packedCount || fullOrder.packed_count || 0)}
                        value={fullForm.totalQuantity}
                        onChange={e => {
                          setFullForm({ ...fullForm, totalQuantity: Number(e.target.value) });
                          setIsFullDirty(true);
                        }}
                        required
                        style={styles.input}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Box Configurations (Carton Boxes) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    6. Box Configurations (Cartons)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddBoxConfig}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(20, 184, 166, 0.15)',
                      border: '1px solid var(--primary-teal)',
                      color: 'var(--primary-teal)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Add Box Config
                  </button>
                </div>

                {fullForm.boxConfigs.length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', backgroundColor: 'var(--bg-surface-2)', borderRadius: '8px' }}>
                    No carton box configurations defined. Click "+ Add Box Config" above to set box prefixes, sizes, and carton capacities.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {fullForm.boxConfigs.map((bCfg, bIdx) => (
                      <div key={bCfg.id || bIdx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'var(--bg-surface-2)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ flex: '1 1 120px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Box Prefix</label>
                          <input
                            type="text"
                            placeholder="e.g. BX"
                            value={bCfg.prefix}
                            onChange={e => {
                              const updated = [...fullForm.boxConfigs];
                              updated[bIdx].prefix = e.target.value;
                              setFullForm({ ...fullForm, boxConfigs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', textTransform: 'uppercase' }}
                            required={!fullForm.allowNoBoxPrefix}
                          />
                        </div>

                        <div style={{ flex: '1 1 100px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Size</label>
                          <input
                            type="text"
                            placeholder="e.g. M, L, XL"
                            value={bCfg.size}
                            onChange={e => {
                              const updated = [...fullForm.boxConfigs];
                              updated[bIdx].size = e.target.value;
                              setFullForm({ ...fullForm, boxConfigs: updated });
                              setIsFullDirty(true);
                            }}
                            style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', textTransform: 'uppercase' }}
                            required
                          />
                        </div>

                        <div style={{ flex: '1 1 100px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', fontWeight: 700 }}>Capacity / Qty</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              min={1}
                              value={bCfg.capacity}
                              onChange={e => {
                                const updated = [...fullForm.boxConfigs];
                                updated[bIdx].capacity = Number(e.target.value);
                                setFullForm({ ...fullForm, boxConfigs: updated });
                                setIsFullDirty(true);
                              }}
                              style={{ ...styles.input, padding: '4px 8px', fontSize: '12px' }}
                              required
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>pcs</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveBoxConfig(bIdx)}
                          title="Remove this box configuration"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '14px'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 7. Remarks / Notes */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Remarks / Special Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional production instructions or audit notes..."
                  value={fullForm.remarks}
                  onChange={e => {
                    setFullForm({ ...fullForm, remarks: e.target.value });
                    setIsFullDirty(true);
                  }}
                  style={{
                    ...styles.input,
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: 'auto',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface-1)',
                position: 'sticky',
                bottom: 0,
                zIndex: 10
              }}>
                <button
                  type="button"
                  onClick={handleCloseFullModal}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1.5,
                    backgroundColor: '#a855f7',
                    borderColor: '#a855f7',
                    color: '#ffffff'
                  }}
                  disabled={savingFull}
                >
                  {savingFull ? 'Saving Full PO...' : 'Save Full PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 3. DELETE PO CONFIRMATION MODAL ───────────────────────────── */}
      {deleteTargetPo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface-1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '20px',
            width: '94%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Production Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !deleting && setDeleteTargetPo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete Production Order{' '}
                <strong style={{ color: '#f87171' }}>{deleteTargetPo.poNumber || deleteTargetPo.po_number}</strong>?
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                This action is irreversible and will permanently delete all associated size configurations, allocations, and child records from the database.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setDeleteTargetPo(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePo}
                className="btn btn-primary"
                style={{
                  flex: 1.2,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff'
                }}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add New Style Modal ────────────────────────────────────── */}
      {showAddStyleModal && (
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
            maxWidth: '500px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shirt size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New Garment Style
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingNewStyle && setShowAddStyleModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateStyle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Style Code (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ST-900, POLO-01"
                  style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                  value={newStyleForm.code}
                  onChange={e => setNewStyleForm({ ...newStyleForm, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Style Name (Required)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Classic Cotton T-Shirt"
                  style={styles.input}
                  value={newStyleForm.name}
                  onChange={e => setNewStyleForm({ ...newStyleForm, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Customer {selectedCustomerForNew ? '(Locked from Flow)' : ''}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Factory Orders"
                  disabled={Boolean(selectedCustomerForNew)}
                  style={{
                    ...styles.input,
                    ...(selectedCustomerForNew ? { backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85 } : {})
                  }}
                  value={selectedCustomerForNew ? selectedCustomerForNew.name : newStyleForm.customer}
                  onChange={e => setNewStyleForm({ ...newStyleForm, customer: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Notes / Specifications (Optional)
                </label>
                <textarea
                  placeholder="e.g. Standard stitching, 100% cotton..."
                  style={{ ...styles.input, height: '60px', resize: 'vertical' }}
                  value={newStyleForm.notes}
                  onChange={e => setNewStyleForm({ ...newStyleForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddStyleModal(false)}
                  disabled={savingNewStyle}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingNewStyle}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingNewStyle ? 'Creating...' : '+ Create Style'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Style Confirmation Modal ───────────────────────── */}
      {deleteTargetStyle && (
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
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Garment Style
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !deletingStyle && setDeleteTargetStyle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete style{' '}
                <strong style={{ color: '#f87171' }}>{deleteTargetStyle.name} ({deleteTargetStyle.code})</strong>?
              </p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                This will remove the style from the catalog and drop-down selectors.
              </p>
            </div>

            {Number(deleteTargetStyle.po_count || 0) > 0 && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                  ⚠️ Style Linked to Active Orders
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  This style is currently associated with <strong>{deleteTargetStyle.po_count}</strong> production order(s).
                  Deleting this style will unlink it from these orders.
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmUnlink}
                    onChange={e => setConfirmUnlink(e.target.checked)}
                    style={{ accentColor: '#ef4444' }}
                  />
                  I confirm unlinking and deleting this style
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => { setDeleteTargetStyle(null); setConfirmUnlink(false); }}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={deletingStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStyle}
                className="btn btn-primary"
                style={{
                  flex: 1.2,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#ffffff',
                  opacity: (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink) ? 0.5 : 1,
                  cursor: (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink) ? 'not-allowed' : 'pointer'
                }}
                disabled={deletingStyle || (Number(deleteTargetStyle.po_count || 0) > 0 && !confirmUnlink)}
              >
                {deletingStyle ? 'Deleting...' : 'Delete Style'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Customer Modal ───────────────────────────────────── */}
      {showAddCustomerModal && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New Customer Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingCustomer && setShowAddCustomerModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.name}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Nike International"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerForm.code}
                    onChange={e => setNewCustomerForm({ ...newCustomerForm, code: e.target.value.toUpperCase() })}
                    style={styles.input}
                    placeholder="e.g. NIKE"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Contract Terms
                </label>
                <textarea
                  rows={2}
                  value={newCustomerForm.notes}
                  onChange={e => setNewCustomerForm({ ...newCustomerForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. Preferred AQL 2.5 standards"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="btn btn-secondary"
                  disabled={savingCustomer}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingCustomer}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingCustomer ? 'Saving...' : '+ Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Customer Modal ─────────────────────────────────── */}
      {deleteTargetCustomer && (
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
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Customer Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetCustomer(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete customer <strong style={{ color: '#f87171' }}>{deleteTargetCustomer.name} ({deleteTargetCustomer.code})</strong>?
            </p>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setDeleteTargetCustomer(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                className="btn btn-primary"
                style={{ flex: 1.2, backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                Delete Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Sales Order (SO) Modal ────────────────────────────── */}
      {showAddSoModal && (
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
            maxWidth: '540px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Create Sales Order (SO)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingSo && setShowAddSoModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSalesOrder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Parent Production Order (PO) *
                </label>
                <select
                  required
                  value={newSoForm.production_order_id}
                  onChange={e => {
                    const poId = e.target.value;
                    const found = orders.find(o => o.id === poId);
                    setNewSoForm({
                      ...newSoForm,
                      production_order_id: poId,
                      style_code: found?.styleCode || found?.style_code || found?.styleName || ''
                    });
                  }}
                  style={styles.select}
                >
                  <option value="">Select Target Production Order</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.poNumber || o.po_number} — {o.styleName || o.style_name} ({o.customer || 'Factory'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Sales Order (SO) Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSoForm.so_number}
                    onChange={e => setNewSoForm({ ...newSoForm, so_number: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. SO-88910"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    SO Name
                  </label>
                  <input
                    type="text"
                    value={newSoForm.map_so}
                    onChange={e => setNewSoForm({ ...newSoForm, map_so: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. SO Name / Internal Ref"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Product Description
                  </label>
                  <input
                    type="text"
                    value={newSoForm.product}
                    onChange={e => setNewSoForm({ ...newSoForm, product: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Dri-Fit T-Shirt"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Colour
                  </label>
                  <input
                    type="text"
                    value={newSoForm.colour}
                    onChange={e => setNewSoForm({ ...newSoForm, colour: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Navy Blue"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Target Order Quantity (pcs) *
                  </label>
                  <input
                    type="number"
                    required
                    value={newSoForm.order_quantity}
                    onChange={e => setNewSoForm({ ...newSoForm, order_quantity: Number(e.target.value) || 500 })}
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Box Capacity (pcs/box)
                  </label>
                  <input
                    type="number"
                    value={newSoForm.box_capacity}
                    onChange={e => setNewSoForm({ ...newSoForm, box_capacity: Number(e.target.value) || 12 })}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddSoModal(false)}
                  className="btn btn-secondary"
                  disabled={savingSo}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingSo}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingSo ? 'Creating...' : '+ Create Sales Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add PO Modal (Cascading Flow) ─────────────────────────── */}
      {showAddPoModalInStep && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New Production Order (PO)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingPoInStep && setShowAddPoModalInStep(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePoInStep} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    PO Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPoModalForm.poNumber}
                    onChange={e => setNewPoModalForm({ ...newPoModalForm, poNumber: e.target.value.toUpperCase() })}
                    style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                    placeholder="e.g. PO-9801"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    PO Name / Title
                  </label>
                  <input
                    type="text"
                    value={newPoModalForm.poName}
                    onChange={e => setNewPoModalForm({ ...newPoModalForm, poName: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Summer Series Run"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer (Locked from Flow)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedCustomerForNew?.name || selectedStyleForNew?.customer || 'Factory Customer'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style (Locked from Flow)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedStyleForNew ? `${selectedStyleForNew.name} (${selectedStyleForNew.code})` : 'Style'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Contract Terms
                </label>
                <textarea
                  rows={2}
                  value={newPoModalForm.notes}
                  onChange={e => setNewPoModalForm({ ...newPoModalForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. Priority execution, standard AQL 2.5 parameters"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddPoModalInStep(false)}
                  className="btn btn-secondary"
                  disabled={savingPoInStep}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPoInStep}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingPoInStep ? 'Saving...' : '+ Save PO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add SO Modal (Cascading Flow) ─────────────────────────── */}
      {showAddSoModalInStep && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Add New Sales Order (SO)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingSoInStep && setShowAddSoModalInStep(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSoInStep} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    SO Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSoModalForm.so_number}
                    onChange={e => setNewSoModalForm({ ...newSoModalForm, so_number: e.target.value.toUpperCase() })}
                    style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                    placeholder="e.g. SO-8840"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    SO Name
                  </label>
                  <input
                    type="text"
                    value={newSoModalForm.map_so}
                    onChange={e => setNewSoModalForm({ ...newSoModalForm, map_so: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. SO Name / Internal Ref"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedCustomerForNew?.name || 'Customer'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedStyleForNew?.code || 'Style'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    PO (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={selectedPoForNew?.poNumber || selectedPoForNew?.id || newPoStepForm.poNumber}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Packaging Requirements
                </label>
                <textarea
                  rows={2}
                  value={newSoModalForm.notes}
                  onChange={e => setNewSoModalForm({ ...newSoModalForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. 12 pcs per inner box, barcode labelling on tag"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddSoModalInStep(false)}
                  className="btn btn-secondary"
                  disabled={savingSoInStep}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingSoInStep}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingSoInStep ? 'Saving...' : '+ Save SO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Customer Modal ───────────────────────────────────── */}
      {editingCustomer && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Customer Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingEditCustomer && setEditingCustomer(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCustomerForm.name}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Nike International"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCustomerForm.code}
                    onChange={e => setEditCustomerForm({ ...editCustomerForm, code: e.target.value.toUpperCase() })}
                    style={styles.input}
                    placeholder="e.g. NIKE"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Contract Terms
                </label>
                <textarea
                  rows={2}
                  value={editCustomerForm.notes}
                  onChange={e => setEditCustomerForm({ ...editCustomerForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. Preferred AQL 2.5 standards"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="btn btn-secondary"
                  disabled={savingEditCustomer}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditCustomer}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingEditCustomer ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Style Modal ─────────────────────────────────────── */}
      {editingStyle && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shirt size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Garment Style
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingEditStyle && setEditingStyle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateStyle} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={editStyleForm.code}
                    onChange={e => setEditStyleForm({ ...editStyleForm, code: e.target.value.toUpperCase() })}
                    style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editStyleForm.name}
                    onChange={e => setEditStyleForm({ ...editStyleForm, name: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Customer Name
                </label>
                <input
                  type="text"
                  value={editStyleForm.customer}
                  onChange={e => setEditStyleForm({ ...editStyleForm, customer: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={editStyleForm.notes}
                  onChange={e => setEditStyleForm({ ...editStyleForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingStyle(null)}
                  className="btn btn-secondary"
                  disabled={savingEditStyle}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditStyle}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingEditStyle ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Production Order (PO) Modal (Normal Edit) ───────── */}
      {editingPo && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Box size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Production Order (PO)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingEditPo && setEditingPo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdatePo} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    PO Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editPoForm.poNumber}
                    onChange={e => setEditPoForm({ ...editPoForm, poNumber: e.target.value.toUpperCase() })}
                    style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    PO Name / Title
                  </label>
                  <input
                    type="text"
                    value={editPoForm.poName}
                    onChange={e => setEditPoForm({ ...editPoForm, poName: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. Summer Series Run"
                  />
                </div>
              </div>

              {/* Locked Parent Context */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingPo.customer || 'Factory Customer'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingPo.styleName || editingPo.style_name || editingPo.styleCode || 'Style'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Contract Terms
                </label>
                <textarea
                  rows={2}
                  value={editPoForm.remarks}
                  onChange={e => setEditPoForm({ ...editPoForm, remarks: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. Priority execution, standard AQL 2.5 parameters"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingPo(null)}
                  className="btn btn-secondary"
                  disabled={savingEditPo}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditPo}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingEditPo ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Sales Order (SO) Modal ──────────────────────────── */}
      {editingSo && (
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
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} color="var(--primary-teal)" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Edit Sales Order (SO)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !savingEditSo && setEditingSo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateSo} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Sales Order (SO) Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSoForm.so_number}
                    onChange={e => setEditSoForm({ ...editSoForm, so_number: e.target.value.toUpperCase() })}
                    style={{ ...styles.input, textTransform: 'uppercase', fontWeight: 800 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    SO Name
                  </label>
                  <input
                    type="text"
                    value={editSoForm.map_so}
                    onChange={e => setEditSoForm({ ...editSoForm, map_so: e.target.value })}
                    style={styles.input}
                    placeholder="e.g. SO Name / Internal Ref"
                  />
                </div>
              </div>

              {/* Locked Parent Context */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingSo?.customer_name || editingSo?.customer || '—'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Style (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingSo?.style_name || editingSo?.style_code || '—'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Parent PO (Locked)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingSo?.po_number || '—'}
                    style={{ ...styles.input, backgroundColor: 'var(--bg-surface-3)', cursor: 'not-allowed', opacity: 0.85, fontSize: '12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Special Notes / Packaging Requirements
                </label>
                <textarea
                  rows={2}
                  value={editSoForm.notes}
                  onChange={e => setEditSoForm({ ...editSoForm, notes: e.target.value })}
                  style={{ ...styles.input, resize: 'vertical' }}
                  placeholder="e.g. Special packaging notes or instructions"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingSo(null)}
                  className="btn btn-secondary"
                  disabled={savingEditSo}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditSo}
                  style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {savingEditSo ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Sales Order (SO) Modal ────────────────────────── */}
      {deleteTargetSo && (
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
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={20} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Delete Sales Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetSo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete Sales Order <strong style={{ color: '#f87171' }}>{deleteTargetSo.so_number}</strong>?
            </p>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setDeleteTargetSo(null)}
                className="btn btn-secondary"
                disabled={deletingSo}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSo}
                disabled={deletingSo}
                className="btn btn-primary"
                style={{ flex: 1.2, backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {deletingSo ? 'Deleting...' : 'Delete Sales Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan & Lifecycle Lookup Modal ── */}
      <CodeLifecycleModal
        isOpen={showLifecycleModal}
        onClose={() => setShowLifecycleModal(false)}
        initialQuery={lifecycleSearchCode}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-surface-2)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    boxSizing: 'border-box'
  }
};
