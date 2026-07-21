'use client'

import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => {
  return `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
};

const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

const formatNumber = (v: number) => new Intl.NumberFormat('en-US').format(v);

const EXCHANGE_RATE = 4000;

// --- CATEGORIES ---
const RICE_CATEGORIES = ['All', 'មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប', 'ផ្សេងៗ', '❌ Out of Stock'];
const MAIN_KEYWORDS = ['មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប'];

// --- TYPES ---
interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
  linked_wholesale_id?: number | null
  mtd_kg_used?: number
  mtd_bags_used?: number
  min_stock_level?: number
}

interface InventoryBatch {
  id: number
  product_id: number
  cost_price: number
  remaining_qty: number
  created_at: string
}

type SortConfig = {
  key: keyof Product;
  direction: 'asc' | 'desc';
} | null;

type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt'
interface FilterRule {
  id: number
  column: keyof Product
  operator: FilterOperator
  value: string | number
}

type PaymentRow = { id: number, method: string, amount: number | '' };

type ColumnKey = keyof Product | 'expand' | 'linked_wholesale' | 'actions';

const DEFAULT_WIDTHS: Record<string, number> = {
  expand: 40, id: 60, name: 240, price: 120, cost_price: 120, stock: 100, min_stock_level: 100, weight: 90, linked_wholesale: 220, mtd_kg_used: 120, mtd_bags_used: 120, actions: 160
}
const DEFAULT_ORDER: ColumnKey[] = ['expand', 'id', 'name', 'price', 'cost_price', 'stock', 'min_stock_level', 'weight', 'linked_wholesale', 'mtd_kg_used', 'mtd_bags_used', 'actions']

const DEFAULT_PENDING_WIDTHS: Record<string, number> = { date: 120, supplier: 180, product: 200, total_cost: 140, paid_so_far: 140, remaining_debt: 150, actions: 200 };
const DEFAULT_PENDING_ORDER: string[] = ['date', 'supplier', 'product', 'total_cost', 'paid_so_far', 'remaining_debt', 'actions'];

const DEFAULT_SUPPLIER_WIDTHS: Record<string, number> = { select: 50, name: 240, phone: 160, location: 200, total_owed: 180 };
const DEFAULT_SUPPLIER_ORDER: string[] = ['select', 'name', 'phone', 'location', 'total_owed'];

// ==========================================
// ROBUST LIVE COMMA FORMATTER 
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, onEnter }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === undefined) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== value) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    let formatted = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : '';
    if (parts.length > 1) formatted += '.' + parts[1].substring(0, 2);
    if (raw === '') formatted = '';

    setInputValue(formatted);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? '' : num);
  };

  return (
    <input 
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.currentTarget.blur();
          if (onEnter) onEnter();
        }
      }}
      onBlur={() => {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }, 100);
      }}
      style={{ ...style, color: '#334155', fontWeight: 'normal' }}
      className="mobile-input-field no-spinners"
    />
  )
}

export default function RiceControl() {
  // --- CORE STATE ---
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [imports, setImports] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<number>>(new Set())
  const [selectedSuppliersToDelete, setSelectedSuppliersToDelete] = useState<Set<number>>(new Set())
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  
  const [isProcessing, setIsProcessing] = useState(false) 
  const isImportingRef = useRef(false);

  // --- NOTIFICATION SYSTEM ---
  const [toast, setToast] = useState<{show: boolean, type: 'success' | 'error' | 'info', title: string, msg: string} | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', title: string, msg: string) => {
    setToast({ show: true, type, title, msg });
    setTimeout(() => setToast(null), 4500);
  };

  // --- CELL EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: number, col: string} | null>(null)
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null)
  const [dropdownSearch, setDropdownSearch] = useState('')

  // --- IMPORT DROPDOWN STATE ---
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false)
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')

  // --- VIEWS & TABS STATE ---
  const [activeView, setActiveView] = useState<'retail' | 'wholesale' | 'import' | 'pending' | 'suppliers'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [categoryOrder, setCategoryOrder] = useState<string[]>(RICE_CATEGORIES)

  // --- BATCH ENGINE STATES ---
  const [activeBatchesMap, setActiveBatchesMap] = useState<Record<number, InventoryBatch[]>>({})
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)

  // --- IMPORT FORM STATE ---
  const [importForm, setImportForm] = useState({ supplier_id: '', product_id: '', qty: '', unit_cost: '', paid_amount: '', payment_method: 'Cash ៛' })
  
  // --- MODALS ---
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', location: '' })
  
  const [payPendingModal, setPayPendingModal] = useState<{isOpen: boolean, record: any, totalDue: number}>({ isOpen: false, record: null, totalDue: 0 })
  const [pendingPaymentRows, setPendingPaymentRows] = useState<PaymentRow[]>([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);

  // --- MAIN PRODUCTS TABLE STATE ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_ORDER)
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // --- PENDING IMPORTS TABLE STATE ---
  const [pendingColWidths, setPendingColWidths] = useState<Record<string, number>>(DEFAULT_PENDING_WIDTHS)
  const [pendingColOrder, setPendingColOrder] = useState<string[]>(DEFAULT_PENDING_ORDER)
  const pendingWidthsRef = useRef(pendingColWidths)
  pendingWidthsRef.current = pendingColWidths
  const [pendingSort, setPendingSort] = useState<{key: string, direction: 'asc'|'desc'} | null>(null)

  // --- SUPPLIERS TABLE STATE ---
  const [supplierColWidths, setSupplierColWidths] = useState<Record<string, number>>(DEFAULT_SUPPLIER_WIDTHS)
  const [supplierColOrder, setSupplierColOrder] = useState<string[]>(DEFAULT_SUPPLIER_ORDER)
  const supplierWidthsRef = useRef(supplierColWidths)
  supplierWidthsRef.current = supplierColWidths
  const [supplierSort, setSupplierSort] = useState<{key: string, direction: 'asc'|'desc'} | null>(null)

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', price: 0 as any, cost_price: 0 as any, weight: 50 as any, stock: 0 as any, min_stock_level: 10 as any })

  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; product: Product | null; data: any[]; activeBatches: InventoryBatch[] }>({
    isOpen: false, product: null, data: [], activeBatches: []
  })
  
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)
  const [historyEdits, setHistoryEdits] = useState<Record<number, Partial<InventoryBatch>>>({})

  // --- DRAG HANDLERS FOR CATEGORIES ---
  const handleCategoryDragStart = (e: React.DragEvent, cat: string) => {
    e.dataTransfer.setData('text/category', cat)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCategoryDrop = async (e: React.DragEvent, targetCat: string) => {
    e.preventDefault()
    const sourceCat = e.dataTransfer.getData('text/category');
    if (!sourceCat || sourceCat === targetCat) return

    setCategoryOrder(prev => {
      const newOrder = prev.filter(c => c !== sourceCat);
      const targetIdx = newOrder.indexOf(targetCat);
      newOrder.splice(targetIdx, 0, sourceCat);
      
      supabase.from('app_settings').upsert({
        setting_key: 'category_order',
        setting_value: newOrder
      }, { onConflict: 'setting_key' }).then()
      
      return newOrder;
    })
  }

  const handleOpenAddProduct = () => {
    setNewItem({
      name: '',
      price: 0,
      cost_price: 0,
      weight: activeView === 'retail' ? 1 : 50,
      stock: 0,
      min_stock_level: 10
    });
    setIsAddModalOpen(true);
  };

  useEffect(() => { 
    fetchProducts()
    fetchSettings()
    fetchSuppliers()
    fetchImports()
    fetchBatches()

    const productsSub = supabase.channel('products-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchProducts)
      .subscribe()
      
    const importsSub = supabase.channel('imports-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'imports' }, fetchImports)
      .subscribe()

    const batchesSub = supabase.channel('batches-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, fetchBatches)
      .subscribe()

    return () => {
      supabase.removeChannel(productsSub)
      supabase.removeChannel(importsSub)
      supabase.removeChannel(batchesSub)
    }
  }, [])

  const handleManualPull = async (retailId: number, wholesaleId: number) => {
    const wholesaleProduct = products.find(p => p.id === wholesaleId);
    if (!wholesaleProduct || Number(wholesaleProduct.stock) < 1) {
      showToast('error', 'Action Blocked', 'Cannot pull: Wholesale bag is out of stock!');
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase.rpc('pull_wholesale_bags', {
         p_retail_id: retailId,
         p_wholesale_id: wholesaleId,
         p_bags_needed: 1
      });

      if (error) throw new Error(error.message);
      showToast('success', 'Bags Pulled', 'Wholesale stock converted to retail successfully.');

    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', [
      'column_widths', 'column_order', 'category_order', 
      'pending_col_widths', 'pending_col_order',
      'supplier_col_widths', 'supplier_col_order'
    ])
    if (data) {
      const widths = data.find((d: any) => d.setting_key === 'column_widths')
      const order = data.find((d: any) => d.setting_key === 'column_order')
      const catOrder = data.find((d: any) => d.setting_key === 'category_order')
      const pendWidths = data.find((d: any) => d.setting_key === 'pending_col_widths')
      const pendOrder = data.find((d: any) => d.setting_key === 'pending_col_order')
      const supWidths = data.find((d: any) => d.setting_key === 'supplier_col_widths')
      const supOrder = data.find((d: any) => d.setting_key === 'supplier_col_order')

      if (widths?.setting_value) setColumnWidths(widths.setting_value)
      if (order?.setting_value) {
        const cleanOrder = order.setting_value.filter((o: string) => o !== 'actions' && o !== 'expand');
        cleanOrder.unshift('expand');
        setColumnOrder([...cleanOrder, 'actions'] as any);
      }
      if (catOrder?.setting_value) {
        const saved = catOrder.setting_value;
        const missing = RICE_CATEGORIES.filter(c => !saved.includes(c));
        setCategoryOrder([...saved, ...missing]);
      }
      if (pendWidths?.setting_value) setPendingColWidths(pendWidths.setting_value)
      if (pendOrder?.setting_value) {
        const cleanOrder = pendOrder.setting_value.filter((o: string) => o !== 'actions');
        setPendingColOrder([...cleanOrder, 'actions']);
      }
      if (supWidths?.setting_value) setSupplierColWidths(supWidths.setting_value)
      if (supOrder?.setting_value) {
        const cleanOrder = supOrder.setting_value.filter((o: string) => o !== 'select');
        cleanOrder.unshift('select');
        setSupplierColOrder(cleanOrder);
      }
    }
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').eq('is_archived', false).order('id', { ascending: true })
    if (data) setProducts(data)
  }

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').eq('is_archived', false).order('name', { ascending: true })
    if (data) setSuppliers(data)
  }

  async function fetchImports() {
    const { data } = await supabase.from('imports').select(`*, suppliers (name), products (name)`).order('created_at', { ascending: false })
    if (data) setImports(data)
  }

  async function fetchBatches() {
    const { data } = await supabase.from('inventory_batches')
      .select('*')
      .gt('remaining_qty', 0) 
      .order('id', { ascending: true }); 

    if (data) {
      const bMap: Record<number, InventoryBatch[]> = {}
      data.forEach(b => {
        if (!bMap[b.product_id]) bMap[b.product_id] = []
        bMap[b.product_id].push(b)
      })
      setActiveBatchesMap(bMap)
    }
  }

  const fetchHistory = async (product: Product) => {
    const { data: importLog } = await supabase.from('imports')
      .select(`*, suppliers(name)`)
      .eq('product_id', product.id)
      .order('created_at', { ascending: false });

    const { data: activeBatches } = await supabase.from('inventory_batches')
      .select('*')
      .eq('product_id', product.id)
      .gt('remaining_qty', 0)
      .order('id', { ascending: true });

    setHistoryModal({ isOpen: true, product, data: importLog || [], activeBatches: activeBatches || [] })
    setEditingHistoryId(null);
    setHistoryEdits({});
  }

  const handleSaveHistory = async (batchId: number) => {
    const edits = historyEdits[batchId];
    if (!edits) return setEditingHistoryId(null);

    const originalBatch = historyModal.activeBatches.find(b => b.id === batchId);
    if (!originalBatch) return setEditingHistoryId(null);
    
    const targetProduct = products.find(p => p.id === originalBatch.product_id);
    if (!targetProduct) return setEditingHistoryId(null);
    
    const originalQty = Number(originalBatch.remaining_qty) || 0;
    const newQty = edits.remaining_qty !== undefined ? Number(edits.remaining_qty) : originalQty;
    const qtyDifference = newQty - originalQty;

    const payload: any = {};
    if (edits.remaining_qty !== undefined) payload.remaining_qty = newQty;
    if (edits.cost_price !== undefined) payload.cost_price = Number(edits.cost_price) || 0;

    const { error } = await supabase.from('inventory_batches').update(payload).eq('id', batchId);
    
    if (!error) {
      if (qtyDifference !== 0) {
        const newStock = Number(targetProduct.stock) + qtyDifference;
        await supabase.from('products').update({ stock: newStock }).eq('id', targetProduct.id);
        
        if (historyModal.product) {
            setHistoryModal(prev => ({...prev, product: {...prev.product!, stock: newStock}}));
        }
      }
      
      const { data: updatedBatches } = await supabase.from('inventory_batches')
        .select('*').eq('product_id', targetProduct.id).gt('remaining_qty', 0).order('id', { ascending: true });
      
      setHistoryModal(prev => ({...prev, activeBatches: updatedBatches || []}));
      setEditingHistoryId(null);
      showToast('success', 'Batch Updated', 'Inventory limits adjusted successfully.');
    } else {
      showToast('error', 'Update Failed', error.message);
    }
  }

  const handleDeleteHistory = async (batchId: number) => {
    const originalBatch = historyModal.activeBatches.find(b => b.id === batchId);
    if (!originalBatch) return;
    
    const targetProduct = products.find(p => p.id === originalBatch.product_id);
    if (!targetProduct) return;

    if (!confirm("Are you sure you want to delete this active batch? The remaining quantity will be deducted from your master stock.")) return;
    
    const qtyToReverse = Number(originalBatch.remaining_qty) || 0;

    const { error } = await supabase.from('inventory_batches').delete().eq('id', batchId);
    
    if (!error) {
      if (qtyToReverse > 0) {
        const newStock = Number(targetProduct.stock) - qtyToReverse;
        await supabase.from('products').update({ stock: newStock }).eq('id', targetProduct.id);
        
        if (historyModal.product) {
            setHistoryModal(prev => ({...prev, product: {...prev.product!, stock: newStock}}));
        }
      }
      
      const { data: updatedBatches } = await supabase.from('inventory_batches')
        .select('*').eq('product_id', targetProduct.id).gt('remaining_qty', 0).order('id', { ascending: true });
      
      setHistoryModal(prev => ({...prev, activeBatches: updatedBatches || []}));
      showToast('success', 'Batch Deleted', 'Remaining stock deducted safely.');
      
    } else {
      showToast('error', 'Delete Failed', error.message);
    }
  }

  const handleVoidImport = async (importId: number) => {
    if (!confirm(`🚨 Are you sure you want to VOID this import?\n\nThis will instantly:\n1. Remove the bags from stock\n2. Delete the linked batch\n3. Reverse supplier debt & expenses\n4. Permanently erase this import record`)) return;

    setIsProcessing(true);
    try {
      const { data: impData } = await supabase.from('imports').select('*').eq('id', importId).single();
      if (!impData) throw new Error("Import not found");

      const targetProduct = products.find(p => p.id === impData.product_id);
      if (targetProduct) {
        const newStock = Math.max(0, Number(targetProduct.stock) - Number(impData.qty));
        await supabase.from('products').update({ stock: newStock }).eq('id', targetProduct.id);
      }

      const { data: batches } = await supabase.from('inventory_batches')
        .select('*')
        .eq('product_id', impData.product_id)
        .eq('cost_price', impData.unit_cost)
        .eq('remaining_qty', impData.qty)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (batches && batches.length > 0) {
        await supabase.from('inventory_batches').delete().eq('id', batches[0].id);
      }

      const { data: supData } = await supabase.from('suppliers').select('name, total_owed_riel').eq('id', impData.supplier_id).single();
      const supplierName = supData?.name || 'Unknown Supplier';

      const debtAdded = Number(impData.total_cost) - Number(impData.paid_amount);
      if (debtAdded > 0) {
        if (supData) {
          await supabase.from('suppliers').update({ total_owed_riel: Math.max(0, Number(supData.total_owed_riel) - debtAdded) }).eq('id', impData.supplier_id);
        }
        await supabase.from('accounts_payable')
          .delete()
          .eq('supplier_name', supplierName)
          .eq('notes', `Stock Import: ${impData.qty} bags`)
          .eq('status', 'Unpaid');
      }

      if (Number(impData.paid_amount) > 0) {
        await supabase.from('expenses')
          .delete()
          .eq('remarks', `Stock Import: ${supplierName}`);
      }

      await supabase.from('imports').delete().eq('id', importId);

      showToast('success', 'Import Voided', 'Record and associated funds safely reversed.');
      setHistoryModal({ isOpen: false, product: null, data: [], activeBatches: [] });
      fetchProducts();
      fetchSuppliers();
      fetchBatches();
      fetchImports();

    } catch (err: any) {
      showToast('error', 'Error Voiding Import', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleAddSupplier() {
    if (!newSupplier.name) return showToast('error', 'Validation Error', 'Supplier name is required');
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.from('suppliers').insert([{ name: newSupplier.name, phone: newSupplier.phone, location: newSupplier.location }]).select();
      if (error) throw error;
      
      setIsAddSupplierOpen(false);
      setNewSupplier({ name: '', phone: '', location: '' });

      if (data && data.length > 0) {
        setSuppliers(prev => [...prev, data[0]]);
        setImportForm(prev => ({ ...prev, supplier_id: String(data[0].id) }));
        setActiveView('import');
        showToast('success', 'Supplier Added', `${data[0].name} has been added successfully.`);
      }

    } catch (err: any) {
      showToast('error', 'Database Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleProcessImport(isPayLater: boolean) {
    if (isImportingRef.current) return;

    if (!importForm.supplier_id || !importForm.product_id || !importForm.qty || !importForm.unit_cost) {
      return showToast('error', 'Missing Data', 'Please fill in Supplier, Product, Qty, and Cost.');
    }

    isImportingRef.current = true;
    setIsProcessing(true);

    const qty = Number(importForm.qty);
    const unitCost = Number(importForm.unit_cost);
    const totalCost = qty * unitCost;
    const paidAmount = isPayLater ? (Number(importForm.paid_amount) || 0) : totalCost;
    
    if (paidAmount > totalCost) {
      isImportingRef.current = false;
      setIsProcessing(false);
      return showToast('error', 'Invalid Amount', 'Cannot pay more than the total cost.');
    }

    const status = paidAmount >= totalCost ? 'Paid' : 'Pending';
    const remainingDebt = totalCost - paidAmount;

    try {
      const supplierName = suppliers.find(s => String(s.id) === String(importForm.supplier_id))?.name || 'Unknown Supplier';
      const product = products.find(p => String(p.id) === String(importForm.product_id));
      if (!product) throw new Error("Product ID mismatch");

      const { error: importErr } = await supabase.from('imports').insert([{
        supplier_id: Number(importForm.supplier_id),
        product_id: Number(importForm.product_id),
        product_name: product.name,
        qty: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        paid_amount: paidAmount,
        status: status
      }]);
      if (importErr) throw importErr;

      if (remainingDebt > 0) {
        const supplier = suppliers.find(s => String(s.id) === String(importForm.supplier_id));
        const newTotalOwed = Number(supplier?.total_owed_riel || 0) + remainingDebt;
        await supabase.from('suppliers').update({ total_owed_riel: newTotalOwed }).eq('id', supplier?.id);

        await supabase.from('accounts_payable').insert([{
          supplier_name: supplierName,
          amount_riel: remainingDebt,
          amount_usd: 0,
          notes: `Stock Import: ${qty} bags`,
          status: 'Unpaid'
        }]);
      }
      
      const newStock = Number(product.stock || 0) + qty;
      const { error: stockErr } = await supabase.from('products').update({ stock: newStock, cost_price: unitCost }).eq('id', product.id);
      if (stockErr) throw stockErr;

      await supabase.from('inventory_batches').insert([{
        product_id: Number(importForm.product_id),
        product_name: product.name,
        cost_price: unitCost,
        remaining_qty: qty
      }]);

      if (paidAmount > 0) {
        let amtUsd = 0;
        let amtRiel = paidAmount;
        if (importForm.payment_method.includes('$')) {
          amtUsd = paidAmount;
          amtRiel = paidAmount * EXCHANGE_RATE;
        }

        await supabase.from('expenses').insert([{
          expense_date: new Date().toISOString().split('T')[0],
          spender: 'Both',
          payment_method: importForm.payment_method,
          remarks: `Stock Import: ${supplierName}`,
          amount_usd: Math.abs(amtUsd),
          amount_riel: Math.abs(amtRiel),
          description: 'BUSINESS'
        }]);
      }

      setImportForm({ supplier_id: '', product_id: '', qty: '', unit_cost: '', paid_amount: '', payment_method: 'Cash ៛' });
      showToast('success', 'Stock Received', `${qty} bags added to inventory. Batch logged.`);
      
      if (isPayLater) setActiveView('pending');
      else setActiveView('wholesale');

    } catch (err: any) {
      showToast('error', 'Import Error', err.message);
    } finally {
      isImportingRef.current = false;
      setIsProcessing(false);
    }
  }

  async function handlePayPendingSubmit() {
    const record = payPendingModal.record;
    
    let totalRielEq = 0;
    let totalUsdFace = 0;
    let totalRielFace = 0;
    let methodStrings: string[] = [];

    for (const r of pendingPaymentRows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      
      if (r.method.includes('$')) {
        totalRielEq += (amt * EXCHANGE_RATE);
        totalUsdFace += amt;
      } else {
        totalRielEq += amt;
        totalRielFace += amt;
      }
      methodStrings.push(`${r.method}: ${amt}`);
    }

    if (totalRielEq <= 0) return showToast('error', 'Invalid Amount', 'Enter a valid payment amount.');
    const remainingBefore = Number(record.total_cost) - Number(record.paid_amount);
    if (totalRielEq > remainingBefore + 0.1) return showToast('error', 'Overpayment', 'Cannot pay more than what is owed.');

    setIsProcessing(true); 

    try {
      const newPaidAmount = Number(record.paid_amount) + totalRielEq;
      const newStatus = newPaidAmount >= Number(record.total_cost) ? 'Paid' : 'Pending';

      await supabase.from('imports').update({ paid_amount: newPaidAmount, status: newStatus }).eq('id', record.id);

      const supplier = suppliers.find(s => String(s.id) === String(record.supplier_id));
      const newTotalOwed = Math.max(0, Number(supplier?.total_owed_riel || 0) - totalRielEq);
      await supabase.from('suppliers').update({ total_owed_riel: newTotalOwed }).eq('id', supplier?.id);

      const { data: apRows } = await supabase.from('accounts_payable')
        .select('*')
        .eq('supplier_name', supplier?.name)
        .eq('status', 'Unpaid')
        .order('created_at', { ascending: true });
      
      if (apRows && apRows.length > 0) {
          let debtRemainingToOffset = totalRielEq;
          for (let apRow of apRows) {
              if (debtRemainingToOffset <= 0) break;
              let apRowAmount = Number(apRow.amount_riel);
              let apply = Math.min(apRowAmount, debtRemainingToOffset);
              let newRowBalance = apRowAmount - apply;
              
              await supabase.from('accounts_payable').update({
                  amount_riel: newRowBalance,
                  status: newRowBalance <= 0 ? 'Paid' : 'Unpaid'
              }).eq('id', apRow.id);
              
              debtRemainingToOffset -= apply;
          }
      }

      await supabase.from('expenses').insert([{
        expense_date: new Date().toISOString().split('T')[0],
        spender: 'Both',
        payment_method: methodStrings.join(', '),
        remarks: `Paid Debt: ${supplier?.name || 'Supplier'}`,
        amount_usd: Math.abs(totalUsdFace),
        amount_riel: Math.abs(totalRielFace),
        description: 'BUSINESS'
      }]);

      setPayPendingModal({ isOpen: false, record: null, totalDue: 0 });
      setPendingPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
      
      if (newStatus === 'Paid') {
        showToast('success', 'Bill Cleared', 'The supplier debt has been fully settled.');
      } else {
        showToast('info', 'Partial Payment', `Payment logged. ${formatRiel(remainingBefore - totalRielEq)} remaining.`);
      }
      
    } catch (err: any) {
      showToast('error', 'Payment Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  const handleSaveRecord = async (id: number) => {
    if (!edits[id]) return;
    const payload = { ...edits[id] } as any;
    
    const mainProd = products.find(p => p.id === id);
    if (!mainProd) return;

    if (activeView === 'wholesale') {
      const pBatches = activeBatchesMap[id] || [];
      pBatches.sort((a,b) => a.id - b.id);
      const currentBatch = pBatches.length > 0 ? pBatches[0] : null;

      if (currentBatch) {
        const batchPayload: any = {};
        let updateBatch = false;

        if (payload.cost_price !== undefined) { 
           batchPayload.cost_price = Number(payload.cost_price); 
           updateBatch = true; 
        }

        if (payload.stock !== undefined) {
           const newMasterStock = Number(payload.stock);
           const oldMasterStock = Number(mainProd.stock);
           const diff = newMasterStock - oldMasterStock;
           
           batchPayload.remaining_qty = Math.max(0, Number(currentBatch.remaining_qty) + diff);
           updateBatch = true;
           
           payload.stock = newMasterStock;
        }

        if (updateBatch) {
           await supabase.from('inventory_batches').update(batchPayload).eq('id', currentBatch.id);
        }
      }
    }

    ['price', 'cost_price', 'weight', 'stock', 'mtd_kg_used', 'mtd_bags_used', 'min_stock_level'].forEach(key => {
      if (payload[key] === '') payload[key] = 0;
      else if (payload[key] !== undefined) payload[key] = Number(payload[key]);
    });

    if (Object.keys(payload).length > 0) {
       const { error } = await supabase.from('products').update(payload).eq('id', id);
       if (error) showToast('error', 'Save Failed', error.message);
    }

    setEdits(prev => { const n = { ...prev }; delete n[id]; return n });
    setEditingCell(null);
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedToDelete.size} item(s)?`)) return
    const { error } = await supabase.from('products').update({ is_archived: true }).in('id', Array.from(selectedToDelete))
    if (!error) { 
      setSelectedToDelete(new Set()); 
      fetchProducts(); 
      showToast('success', 'Products Deleted', 'Items removed safely.');
    }
  }

  const handleDeleteSuppliers = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedSuppliersToDelete.size} supplier(s)?`)) return
    const { error } = await supabase.from('suppliers').update({ is_archived: true }).in('id', Array.from(selectedSuppliersToDelete))
    if (!error) { 
      setSelectedSuppliersToDelete(new Set()); 
      fetchSuppliers(); 
      showToast('success', 'Suppliers Deleted', 'Suppliers archived safely.');
    }
  }

  const addProduct = async () => {
    if (!newItem.name) return showToast('error', 'Missing Data', 'Name is required');
    const payload = {
      name: newItem.name,
      price: Number(newItem.price) || 0,
      cost_price: Number(newItem.cost_price) || 0,
      weight: Number(newItem.weight) || 50,
      stock: Number(newItem.stock) || 0,
      min_stock_level: Number(newItem.min_stock_level) || 10,
      mtd_kg_used: 0,
      mtd_bags_used: 0
    }
    const { data, error } = await supabase.from('products').insert([payload]).select()
    
    if (!error && data && data.length > 0) {
      setIsAddModalOpen(false)
      setNewItem({ name: '', price: 0, cost_price: 0, weight: 50, stock: 0, min_stock_level: 10 })
      
      setProducts(prev => [...prev, data[0]]);
      setImportForm(prev => ({ ...prev, product_id: String(data[0].id) }));
      setActiveView('import');
      showToast('success', 'Product Created', 'Ready to receive stock.');

    } else if (error) {
      showToast('error', 'Creation Failed', error.message);
    }
  }

  const openImportModal = (product: Product) => {
    setImportForm(prev => ({ ...prev, product_id: String(product.id) }));
    setActiveView('import');
  }

  const handleLinkWholesaleBag = async (retailId: number, wholesaleProduct: Product | null) => {
    const { error } = await supabase.from('products').update({ 
      linked_wholesale_id: wholesaleProduct ? wholesaleProduct.id : null,
    }).eq('id', retailId);
    
    if (!error) {
      setActiveDropdownId(null);
      setDropdownSearch('');
    } else {
      showToast('error', 'Link Failed', error.message);
    }
  }

  // --- UNIVERSAL DRAG & DROP FOR ALL TABLES ---
  const onDragStartCol = (e: React.DragEvent, col: string, unmovables: string[]) => {
    if (unmovables.includes(col)) return;
    e.dataTransfer.setData('text/plain', col);
    e.dataTransfer.effectAllowed = 'move';
  }

  const onDragOverCol = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  const handleProductDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    if (targetCol === 'actions' || targetCol === 'expand') return;
    const sourceCol = e.dataTransfer.getData('text/plain') as ColumnKey;
    if (!sourceCol || sourceCol === targetCol || sourceCol === 'actions' || sourceCol === 'expand') return

    setColumnOrder(prev => {
      const staticCols = ['expand', 'actions'];
      const movableOrder = prev.filter(c => !staticCols.includes(c as string));
      const newOrder = movableOrder.filter(c => c !== sourceCol);
      const targetIdx = newOrder.indexOf(targetCol as any);
      
      newOrder.splice(targetIdx, 0, sourceCol);
      const finalOrder = ['expand', ...newOrder, 'actions'] as ColumnKey[];
      
      supabase.from('app_settings').upsert({ setting_key: 'column_order', setting_value: finalOrder }, { onConflict: 'setting_key' }).then();
      return finalOrder;
    })
  }

  const handlePendingDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    if (targetCol === 'actions') return;
    const sourceCol = e.dataTransfer.getData('text/plain');
    if (!sourceCol || sourceCol === targetCol || sourceCol === 'actions') return;

    setPendingColOrder(prev => {
      const movableOrder = prev.filter(c => c !== 'actions');
      const newOrder = movableOrder.filter(c => c !== sourceCol);
      const targetIdx = newOrder.indexOf(targetCol);
      
      newOrder.splice(targetIdx, 0, sourceCol);
      const finalOrder = [...newOrder, 'actions'];
      
      supabase.from('app_settings').upsert({ setting_key: 'pending_col_order', setting_value: finalOrder }, { onConflict: 'setting_key' }).then();
      return finalOrder;
    })
  }

  const handleSupplierDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    if (targetCol === 'select') return;
    const sourceCol = e.dataTransfer.getData('text/plain');
    if (!sourceCol || sourceCol === targetCol || sourceCol === 'select') return;

    setSupplierColOrder(prev => {
      const movableOrder = prev.filter(c => c !== 'select');
      const newOrder = movableOrder.filter(c => c !== sourceCol);
      const targetIdx = newOrder.indexOf(targetCol);
      
      newOrder.splice(targetIdx, 0, sourceCol);
      const finalOrder = ['select', ...newOrder];
      
      supabase.from('app_settings').upsert({ setting_key: 'supplier_col_order', setting_value: finalOrder }, { onConflict: 'setting_key' }).then();
      return finalOrder;
    })
  }

  const handleResizeStartProduct = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    if (columnKey === 'expand') return;
    e.preventDefault(); e.stopPropagation();
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX;
    const startWidth = widthsRef.current[columnKey] || 150;
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX;
      const newWidth = Math.max(40, startWidth + (currentX - startX));
      setColumnWidths(prev => ({ ...prev, [columnKey]: newWidth }));
    }
    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleUp);
      await supabase.from('app_settings').upsert({ setting_key: 'column_widths', setting_value: widthsRef.current }, { onConflict: 'setting_key' });
    }
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false }); document.addEventListener('touchend', handleUp);
  }

  const handleResizeStartPending = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    if (columnKey === 'actions') return;
    e.preventDefault(); e.stopPropagation();
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX;
    const startWidth = pendingWidthsRef.current[columnKey] || 150;
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX;
      const newWidth = Math.max(40, startWidth + (currentX - startX));
      setPendingColWidths(prev => ({ ...prev, [columnKey]: newWidth }));
    }
    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleUp);
      await supabase.from('app_settings').upsert({ setting_key: 'pending_col_widths', setting_value: pendingWidthsRef.current }, { onConflict: 'setting_key' });
    }
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false }); document.addEventListener('touchend', handleUp);
  }

  const handleResizeStartSupplier = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    if (columnKey === 'select') return;
    e.preventDefault(); e.stopPropagation();
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX;
    const startWidth = supplierWidthsRef.current[columnKey] || 150;
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX;
      const newWidth = Math.max(40, startWidth + (currentX - startX));
      setSupplierColWidths(prev => ({ ...prev, [columnKey]: newWidth }));
    }
    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleUp);
      await supabase.from('app_settings').upsert({ setting_key: 'supplier_col_widths', setting_value: supplierWidthsRef.current }, { onConflict: 'setting_key' });
    }
    document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false }); document.addEventListener('touchend', handleUp);
  }

  const handleProductSort = (key: any) => {
    if (key === 'linked_wholesale' || key === 'actions' || key === 'expand') return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  }

  const handlePendingSort = (key: string) => {
    if (key === 'actions') return;
    let direction: 'asc' | 'desc' = 'asc';
    if (pendingSort && pendingSort.key === key && pendingSort.direction === 'asc') direction = 'desc';
    setPendingSort({ key, direction });
  }

  const handleSupplierSort = (key: string) => {
    if (key === 'select') return;
    let direction: 'asc' | 'desc' = 'asc';
    if (supplierSort && supplierSort.key === key && supplierSort.direction === 'asc') direction = 'desc';
    setSupplierSort({ key, direction });
  }

  const processedProducts = products
    .map(p => ({ ...p, ...edits[p.id] }))
    .filter(p => {
      const isEditingThisRow = editingCell?.id === p.id;
      if (searchQuery && !p.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (activeView === 'retail' && p.weight >= 50) return false;
      if (activeView === 'wholesale' && p.weight < 50) return false;
      if (activeView === 'wholesale') {
        if (activeCategory === '❌ Out of Stock') {
            if (!isEditingThisRow && Number(p.stock) > 0) return false;
        } else {
            if (!isEditingThisRow && Number(p.stock) <= 0) return false;
        }
      }
      if (activeView === 'wholesale' && activeCategory !== 'All' && activeCategory !== '❌ Out of Stock') {
        const name = p.name || '';
        if (activeCategory === 'ផ្សេងៗ') {
          if (MAIN_KEYWORDS.some(kw => name.includes(kw))) return false;
        } else {
          if (!name.includes(activeCategory)) return false;
        }
      }
      for (const rule of filterRules) {
        if (!rule.value && rule.value !== 0) continue;
        const val = p[rule.column as keyof Product];
        const checkVal = String(rule.value).toLowerCase();
        if (rule.operator === 'contains' && !String(val).toLowerCase().includes(checkVal)) return false;
        if (rule.operator === 'equals' && String(val).toLowerCase() !== checkVal) return false;
        if (rule.operator === 'gt' && Number(val) <= Number(rule.value)) return false;
        if (rule.operator === 'lt' && Number(val) >= Number(rule.value)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      if ((a as any)[key] < (b as any)[key]) return direction === 'asc' ? -1 : 1;
      if ((a as any)[key] > (b as any)[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    });

  const processedPending = imports.filter(i => i.status === 'Pending').sort((a, b) => {
    if (!pendingSort) return 0;
    const { key, direction } = pendingSort;
    let valA, valB;
    if (key === 'date') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
    else if (key === 'supplier') { valA = a.suppliers?.name || ''; valB = b.suppliers?.name || ''; }
    else if (key === 'product') { valA = a.products?.name || ''; valB = b.products?.name || ''; }
    else if (key === 'total_cost') { valA = Number(a.total_cost); valB = Number(b.total_cost); }
    else if (key === 'paid_so_far') { valA = Number(a.paid_amount); valB = Number(b.paid_amount); }
    else if (key === 'remaining_debt') { valA = Number(a.total_cost) - Number(a.paid_amount); valB = Number(b.total_cost) - Number(b.paid_amount); }
    
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const processedSuppliers = [...suppliers].sort((a, b) => {
    if (!supplierSort) return 0;
    const { key, direction } = supplierSort;
    let valA = a[key] || '';
    let valB = b[key] || '';
    if (key === 'total_owed') { valA = Number(a.total_owed_riel); valB = Number(b.total_owed_riel); }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const formatDisplayValue = (col: string, val: any) => {
    if (val === null || val === undefined) return '';
    if (['price', 'cost_price'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} ៛`;
    if (['stock', 'weight', 'id', 'min_stock_level'].includes(col)) return new Intl.NumberFormat('en-US').format(val);
    if (['mtd_kg_used'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} kg`;
    if (['mtd_bags_used'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} bags`;
    return String(val);
  };

  const importTotalCalc = (Number(importForm.qty) || 0) * (Number(importForm.unit_cost) || 0);
  const liveTotalPendingReceived = pendingPaymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);
  const livePendingRemaining = payPendingModal.totalDue - liveTotalPendingReceived;

  return (
    <div className="main-wrapper">

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className={`toast-notification fade-in ${toast.type}`}>
          <div className="toast-icon">
            {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
          </div>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-msg">{toast.msg}</div>
          </div>
        </div>
      )}
      
      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">🌾 Rice Inventory & Suppliers</h1>
        </div>
        <div className="header-actions">
          {selectedToDelete.size > 0 && (activeView === 'retail' || activeView === 'wholesale') && (
            <button className="delete-btn" onClick={handleDelete}>
              Delete ({selectedToDelete.size})
            </button>
          )}
          {selectedSuppliersToDelete.size > 0 && activeView === 'suppliers' && (
            <button className="delete-btn" onClick={handleDeleteSuppliers}>
              Delete ({selectedSuppliersToDelete.size})
            </button>
          )}
          {(activeView === 'retail' || activeView === 'wholesale') && (
            <button className="add-btn desktop-only-btn" onClick={handleOpenAddProduct}>
              + Add Product
            </button>
          )}
          {activeView === 'suppliers' && (
            <button className="add-btn desktop-only-btn" onClick={() => setIsAddSupplierOpen(true)}>
              + Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR & TABS */}
      <div className="toolbar-container">
        <div className="toolbar-tabs" style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <button className={activeView === 'retail' ? 'tab active' : 'tab'} onClick={() => { setActiveView('retail'); setActiveCategory('All'); }}>🛍️ Retail</button>
          <button className={activeView === 'wholesale' ? 'tab active' : 'tab'} onClick={() => setActiveView('wholesale')}>🌾 Wholesale</button>
          <button className={activeView === 'import' ? 'tab active' : 'tab'} onClick={() => setActiveView('import')}>🚚 Receive Stock</button>
          <button className={activeView === 'pending' ? 'tab active' : 'tab'} onClick={() => setActiveView('pending')}>⏳ Pending Payments {processedPending.length > 0 && `(${processedPending.length})`}</button>
          <button className={activeView === 'suppliers' ? 'tab active' : 'tab'} onClick={() => setActiveView('suppliers')}>🏢 Suppliers</button>
        </div>
        
        {(activeView === 'retail' || activeView === 'wholesale') && (
          <div className="mobile-action-row">
            <input 
              className="toolbar-search" 
              placeholder="🔍 Quick search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            
            <div className="toolbar-filters">
              <button className="add-btn-inline mobile-only-btn" onClick={handleOpenAddProduct}>
                + Add Product
              </button>
              <button className="filter-btn" onClick={() => setIsFilterOpen(true)} style={{ color: filterRules.length > 0 ? '#3b82f6' : '#0f172a' }}>
                Y Filter {filterRules.length > 0 && `(${filterRules.length})`}
              </button>
            </div>
          </div>
        )}

        {activeView === 'suppliers' && (
          <div className="mobile-action-row mobile-only-flex" style={{ justifyContent: 'flex-end' }}>
             <button className="add-btn-inline" onClick={() => setIsAddSupplierOpen(true)}>
               + Add Supplier
             </button>
          </div>
        )}
      </div>

      {/* RICE CATEGORIES (ONLY WHOLESALE) */}
      {activeView === 'wholesale' && (
        <div 
          className="hide-scrollbar" 
          style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '16px', marginBottom: '8px', WebkitOverflowScrolling: 'touch', userSelect: 'none' }}
        >
          {categoryOrder.map(cat => (
            <button 
              key={cat} 
              draggable={true}
              onDragStart={(e) => handleCategoryDragStart(e, cat)}
              onDragOver={onDragOverCol}
              onDrop={(e) => handleCategoryDrop(e, cat)}
              onClick={() => setActiveCategory(cat)} 
              style={{ flexShrink: 0, padding: '8px 16px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #cbd5e1', backgroundColor: activeCategory === cat ? '#b58a3d' : '#ffffff', color: activeCategory === cat ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'grab', fontSize: '13px', whiteSpace: 'nowrap', boxShadow: activeCategory === cat ? '0 2px 4px rgba(181, 138, 61, 0.3)' : 'none' }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* SPREADSHEET VIEWS: RETAIL & WHOLESALE */}
      {(activeView === 'retail' || activeView === 'wholesale') && (
        <div className="table-wrapper fade-in">
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {columnOrder.map(key => {
                  if (key === 'expand' && activeView !== 'wholesale') return null;
                  if ((key === 'linked_wholesale' || key === 'mtd_kg_used' || key === 'mtd_bags_used') && activeView !== 'retail') return null;
                  if (key === 'actions' && activeView !== 'wholesale') return null; 
                  
                  const isDraggable = key !== 'actions' && key !== 'linked_wholesale' && key !== 'expand';

                  if (key === 'expand') {
                    return <th key={key} style={{ width: '40px', minWidth: '40px', maxWidth: '40px', padding: '16px 8px', borderRight: '1px solid #f1f5f9' }}></th>;
                  }

                  return (
                    <th 
                      key={key} 
                      draggable={isDraggable}
                      onDragStart={(e) => onDragStartCol(e, key as string, ['actions', 'linked_wholesale', 'expand'])}
                      onDragOver={onDragOverCol}
                      onDrop={(e) => handleProductDrop(e, key as string)}
                      onClick={() => handleProductSort(key)}
                      style={{ width: columnWidths[key as string] || 150, position: 'relative', padding: '16px 12px', textAlign: key === 'actions' ? 'center' : 'left', color: '#475569', fontSize: '13px', textTransform: 'uppercase', fontWeight: 'bold', borderRight: '1px solid #f1f5f9', cursor: isDraggable ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}
                    >
                      {key === 'linked_wholesale' ? 'Linked Wholesale Bag' : key === 'mtd_kg_used' ? 'MTD Used (Kg)' : key === 'mtd_bags_used' ? 'MTD Used (Bags)' : key === 'min_stock_level' ? 'Min Stock' : (key as string).replace('_', ' ')}
                      {isDraggable && (<span style={{ marginLeft: '6px', fontSize: '12px', opacity: sortConfig?.key === key ? 1 : 0.3 }}>{sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>)}
                      {isDraggable && <div onMouseDown={(e) => handleResizeStartProduct(e, key as string)} onTouchStart={(e) => handleResizeStartProduct(e, key as string)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '14px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }} />}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {processedProducts.length === 0 ? (
                <tr><td colSpan={columnOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No products found.</td></tr>
              ) : (
                processedProducts.map(p => {
                  const pBatches = activeBatchesMap[p.id] || [];
                  pBatches.sort((a,b) => a.id - b.id); 
                  const currentBatch = pBatches.length > 0 ? pBatches[0] : null;
                  const isExpanded = expandedProductId === p.id;
                  const totalActiveBatchStock = pBatches.reduce((sum, b) => sum + Number(b.remaining_qty), 0);

                  return (
                    <React.Fragment key={p.id}>
                      <tr onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)} style={{ borderBottom: '1px solid #f1f5f9', background: edits[p.id] ? '#fefcf3' : 'transparent', transition: 'background 0.2s' }}>
                        {columnOrder.map(col => {
                          if (col === 'expand' && activeView !== 'wholesale') return null;
                          if ((col === 'linked_wholesale' || col === 'mtd_kg_used' || col === 'mtd_bags_used') && activeView !== 'retail') return null;
                          
                          if (col === 'expand') {
                             return (
                               <td key={col} style={{ width: '40px', minWidth: '40px', maxWidth: '40px', borderRight: '1px solid #f1f5f9', padding: '8px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                                 {pBatches.length > 1 && (
                                   <button 
                                     onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedProductId(isExpanded ? null : p.id); }} 
                                     style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                                   >
                                     {isExpanded ? '▼' : '▶'}
                                   </button>
                                 )}
                               </td>
                             )
                          }

                          if (col === 'actions') {
                            if (activeView === 'retail') {
                               return (
                                 <td key={col} style={{ borderRight: '1px solid #f1f5f9', padding: '8px', overflow: 'hidden', textAlign: 'center' }}>
                                   {p.linked_wholesale_id ? (() => {
                                     const wholesaleProd = products.find(wp => wp.id === p.linked_wholesale_id);
                                     const isOutOfStock = wholesaleProd ? Number(wholesaleProd.stock) < 1 : true;
                                     return (
                                       <button 
                                         onClick={() => handleManualPull(p.id, p.linked_wholesale_id!)}
                                         disabled={isProcessing || isOutOfStock}
                                         style={{ background: isOutOfStock ? '#cbd5e1' : '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: (isProcessing || isOutOfStock) ? 'not-allowed' : 'pointer' }}
                                       >
                                         {isOutOfStock ? '❌ No Stock' : '♻️ Pull 1 Bag'}
                                       </button>
                                     )
                                   })() : (
                                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>No Link</span>
                                   )}
                                 </td>
                               )
                            }
                            
                            return (
                              <td key={col} style={{ borderRight: '1px solid #f1f5f9', padding: '8px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                                  {edits[p.id] ? (
                                    <>
                                      <button onMouseDown={(e) => { e.stopPropagation(); handleSaveRecord(p.id); }} style={{ color: '#fff', background: '#10b981', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Save</button>
                                      <button onMouseDown={(e) => { e.stopPropagation(); setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n }) }} style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Undo</button>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); openImportModal(p); }} style={{ color: '#fff', background: '#3b82f6', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📦 Import</button>
                                      <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); fetchHistory(p); }} title="View Import Log" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}>🕒</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )
                          }

                          const isIdCol = col === 'id';
                          const isEditing = editingCell?.id === p.id && editingCell?.col === col;
                          
                          let val = edits[p.id]?.[col as keyof Product] ?? p[col as keyof Product] ?? '';
                          if (activeView === 'wholesale' && currentBatch) {
                             if (col === 'cost_price') val = edits[p.id]?.cost_price ?? currentBatch.cost_price;
                          }

                          if (!isEditing && !edits[p.id] && activeView === 'retail' && col === 'cost_price' && p.linked_wholesale_id) {
                            const parentWholesale = products.find(wp => wp.id === p.linked_wholesale_id);
                            if (parentWholesale) {
                              const parentBatches = (activeBatchesMap[parentWholesale.id] || []);
                              parentBatches.sort((a,b) => a.id - b.id);
                              const liveParentCogs = parentBatches.length > 0 ? parentBatches[0].cost_price : (parentWholesale.cost_price || 0);
                              const parentWeight = parentWholesale.weight || 50;
                              val = Math.round(liveParentCogs / parentWeight);
                            }
                          }

                          if (col === 'linked_wholesale') {
                            if (activeView === 'retail') {
                                const linkedProduct = products.find(wp => wp.id === p.linked_wholesale_id);
                                const isDropdownOpen = activeDropdownId === p.id;
                                return (
                                  <td key={col} style={{ borderRight: '1px solid #f1f5f9', position: 'relative', padding: '6px 12px', overflow: 'visible' }}>
                                    {isDropdownOpen ? (
                                      <div style={{ position: 'relative', zIndex: 100 }}>
                                        <input autoFocus className="dropdown-search-input" placeholder="Search 50kg bag..." value={dropdownSearch} onChange={e => setDropdownSearch(e.target.value)} onBlur={() => setTimeout(() => setActiveDropdownId(null), 200)} onKeyDown={e => e.key === 'Escape' && setActiveDropdownId(null)} />
                                        <div className="dropdown-results-tray">
                                          <div className="dropdown-row clear-option" onMouseDown={(e) => { e.stopPropagation(); handleLinkWholesaleBag(p.id, null); }}>❌ Clear Linked Bag</div>
                                          {products.filter(wp => wp.weight >= 50 && wp.name.toLowerCase().includes(dropdownSearch.toLowerCase())).map(wp => (
                                            <div key={wp.id} className="dropdown-row" onMouseDown={(e) => { e.stopPropagation(); handleLinkWholesaleBag(p.id, wp); }}>
                                              <span style={{ fontWeight: 'bold' }}>{wp.name}</span>
                                              <span style={{ fontSize: '11px', color: '#64748b' }}> ({formatRiel(wp.cost_price)})</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <div className="interactive-select-trigger" onClick={(e) => { e.stopPropagation(); setActiveDropdownId(p.id); setDropdownSearch(''); }} style={{ flex: 1 }}>
                                          {linkedProduct ? `🌾 ${linkedProduct.name}` : '🔍 Click to link 50kg Bag...'}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                )
                            }
                            return null;
                          }

                          return (
                            <td key={col} className={isEditing ? 'cell-editing' : ''} style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative', padding: 0 }}>
                              {isIdCol && (hoveredId === p.id || selectedToDelete.has(p.id)) && (
                                <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 25, background: edits[p.id] ? '#fefcf3' : '#fff', paddingRight: '4px' }}>
                                  <input type="checkbox" checked={selectedToDelete.has(p.id)} onChange={() => { const next = new Set(selectedToDelete); next.has(p.id) ? next.delete(p.id) : next.add(p.id); setSelectedToDelete(next); }} style={{ cursor: 'pointer', width: '18px', height: '18px', margin: 0, accentColor: '#b58a3d' }} />
                                </div>
                              )}
                              
                              {isEditing ? (
                                <input 
                                  autoFocus 
                                  enterKeyHint="done"
                                  type={['name'].includes(col as string) ? 'text' : 'number'} 
                                  className="cell-input no-spinners" 
                                  style={{ paddingLeft: isIdCol ? '36px' : '12px' }} 
                                  value={val as any} 
                                  onChange={(e) => { const newVal = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; setEdits(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), [col]: newVal } })) }} 
                                  onBlur={() => handleSaveRecord(p.id)} 
                                  onKeyDown={(e) => { 
                                    if (e.key === 'Enter' || e.keyCode === 13) { 
                                      e.preventDefault();
                                      e.currentTarget.blur(); 
                                    } 
                                    if (e.key === 'Escape') { 
                                      setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n }); 
                                      setEditingCell(null); 
                                    } 
                                  }} 
                                />
                              ) : (
                                <div className="cell-display" style={{ paddingLeft: isIdCol ? '36px' : '12px', fontWeight: col === 'name' ? 'bold' : 'normal', color: col === 'name' ? '#1e293b' : (['mtd_kg_used', 'mtd_bags_used'].includes(col) ? '#b58a3d' : '#334155'), cursor: 'text' }} onClick={() => { setEditingCell({ id: p.id, col: col as string }) }}>
                                  
                                  {col === 'name' ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {activeView === 'wholesale' && (
                                        <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                          📦 {totalActiveBatchStock} Total
                                        </span>
                                      )}
                                      {formatDisplayValue(col as string, val)}
                                    </span>
                                  ) : (
                                    formatDisplayValue(col as string, val)
                                  )}

                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Expandable Child Row Batch List (View Only) */}
                      {isExpanded && activeView === 'wholesale' && pBatches.length > 1 && pBatches.slice(1).map((batch, index) => {
                          let batchLabel = index === 0 ? '2nd Batch' : index === 1 ? '3rd Batch' : `${index + 2}th Batch`;
                          
                          return (
                            <tr key={`batch-${batch.id}`} style={{ background: '#f8fafc', borderBottom: index === pBatches.length - 2 ? '2px solid #cbd5e1' : '1px dashed #e2e8f0' }}>
                               {columnOrder.map(col => {
                                 if (col === 'expand') return <td key={col} style={{ borderRight: '1px solid #f1f5f9' }}></td>;
                                 if (col === 'linked_wholesale' || col === 'mtd_kg_used' || col === 'mtd_bags_used') return null;
                                 if (col === 'id') return <td key={col} style={{ borderRight: '1px solid #f1f5f9' }}></td>;
                                 
                                 if (col === 'name') return (
                                   <td key={col} style={{ padding: '12px 12px 12px 48px', borderRight: '1px solid #f1f5f9', color: '#475569', fontSize: '14px' }}>
                                     ↳ {batchLabel}
                                   </td>
                                 );
                                 
                                 if (col === 'price') return <td key={col} style={{ padding: '12px', borderRight: '1px solid #f1f5f9', color: '#475569', fontSize: '14px' }}>-</td>;
                                 
                                 if (col === 'cost_price') return <td key={col} style={{ padding: '12px', borderRight: '1px solid #f1f5f9', color: '#475569', fontSize: '14px' }}>{formatRiel(batch.cost_price)}</td>;
                                 
                                 if (col === 'stock') return <td key={col} style={{ padding: '12px', borderRight: '1px solid #f1f5f9', color: '#b58a3d', fontWeight: 'bold', fontSize: '14px' }}>{batch.remaining_qty}</td>;
                                 
                                 if (col === 'actions') {
                                   return <td key={col} style={{ borderRight: '1px solid #f1f5f9' }}></td>;
                                 }
                                 
                                 return <td key={col} style={{ padding: '12px', borderRight: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>-</td>;
                               })}
                            </tr>
                          )
                      })}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* IMPORT FORM TAB */}
      {activeView === 'import' && (
        <div className="fade-in" style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '600px' }}>
            <h2 style={{ marginTop: 0, color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px' }}>🚚 Receive New Stock</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* SUPPLIER SEARCHABLE DROPDOWN */}
              <div style={{ position: 'relative', zIndex: isSupplierDropdownOpen ? 100 : 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }}>Select Supplier</label>
                  <button onClick={() => setIsAddSupplierOpen(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ Add New Supplier</button>
                </div>
                {isSupplierDropdownOpen ? (
                  <div style={{ position: 'relative' }}>
                    <input 
                      autoFocus 
                      className="dropdown-search-input" 
                      placeholder="Search..." 
                      value={supplierSearch} 
                      onChange={e => setSupplierSearch(e.target.value)} 
                      onBlur={() => setTimeout(() => setIsSupplierDropdownOpen(false), 200)} 
                      onKeyDown={e => e.key === 'Escape' && setIsSupplierDropdownOpen(false)} 
                    />
                    <div className="dropdown-results-tray">
                      {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map(s => (
                        <div key={s.id} className="dropdown-row" onMouseDown={(e) => { e.stopPropagation(); setImportForm({...importForm, supplier_id: String(s.id)}); setIsSupplierDropdownOpen(false); }}>
                          <span style={{ fontWeight: 'bold' }}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="interactive-select-trigger" onClick={() => { setIsSupplierDropdownOpen(true); setSupplierSearch(''); }} style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
                    {importForm.supplier_id ? suppliers.find(s => String(s.id) === String(importForm.supplier_id))?.name || 'Unknown' : '-- Choose a Supplier --'}
                  </div>
                )}
              </div>

              {/* PRODUCT SEARCHABLE DROPDOWN */}
              <div style={{ position: 'relative', zIndex: isProductDropdownOpen ? 90 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }}>Select Product (Rice)</label>
                  <button onClick={handleOpenAddProduct} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ Create New Product</button>
                </div>
                {isProductDropdownOpen ? (
                  <div style={{ position: 'relative' }}>
                    <input 
                      autoFocus 
                      className="dropdown-search-input" 
                      placeholder="Search..." 
                      value={productSearch} 
                      onChange={e => setProductSearch(e.target.value)} 
                      onBlur={() => setTimeout(() => setIsProductDropdownOpen(false), 200)} 
                      onKeyDown={e => e.key === 'Escape' && setIsProductDropdownOpen(false)} 
                    />
                    <div className="dropdown-results-tray">
                      {products.filter(p => p.weight >= 50 && p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                        <div key={p.id} className="dropdown-row" onMouseDown={(e) => { e.stopPropagation(); setImportForm({...importForm, product_id: String(p.id)}); setIsProductDropdownOpen(false); }}>
                          <span style={{ fontWeight: 'bold' }}>{p.name}</span>
                          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>({p.weight}kg)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="interactive-select-trigger" onClick={() => { setIsProductDropdownOpen(true); setProductSearch(''); }} style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
                    {importForm.product_id ? products.find(p => String(p.id) === String(importForm.product_id))?.name || 'Unknown' : '-- Choose Rice Type --'}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Quantity Imported</label>
                  <input type="number" className="no-spinners" placeholder="" value={importForm.qty} onChange={e => setImportForm({...importForm, qty: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Unit Cost (៛)</label>
                  <input type="number" className="no-spinners" placeholder="" value={importForm.unit_cost} onChange={e => setImportForm({...importForm, unit_cost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ background: '#fefcf3', padding: '16px', borderRadius: '8px', border: '1px solid #fde047', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#854d0e' }}>Total Bill Cost:</span>
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(importTotalCalc)}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1e293b' }}>Payment Details</h4>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>Amount Paying Now (៛)</label>
                    <input type="number" className="no-spinners" placeholder="" value={importForm.paid_amount} onChange={e => setImportForm({...importForm, paid_amount: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>Payment Method</label>
                    <select value={importForm.payment_method} onChange={e => setImportForm({...importForm, payment_method: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', backgroundColor: '#fff' }}>
                      <option value="Cash ៛">💵 Cash ៛</option>
                      <option value="Cash $">💵 Cash $</option>
                      <option value="QR ៛">📱 QR ៛</option>
                      <option value="QR $">📱 QR $</option>
                      <option value="Mom QR ៛">👩 Mom QR ៛</option>
                      <option value="Mom QR $">👩 Mom QR $</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button 
                  onClick={() => handleProcessImport(true)} 
                  disabled={isProcessing}
                  style={{ flex: 1, padding: '14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                >
                  ⏳ Save as Pending/Partial
                </button>
                <button 
                  onClick={() => handleProcessImport(false)} 
                  disabled={isProcessing}
                  style={{ flex: 1, padding: '14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: isProcessing ? 'not-allowed' : 'pointer' }}
                >
                  ✅ Paid Full & Import
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* PENDING PAYMENTS TAB */}
      {activeView === 'pending' && (
        <div className="table-wrapper fade-in">
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#fff1f2', borderBottom: '2px solid #fecaca' }}>
                {pendingColOrder.map(col => {
                  const isDraggable = col !== 'actions';
                  let label = col;
                  if (col === 'date') label = 'Date';
                  if (col === 'supplier') label = 'Supplier';
                  if (col === 'product') label = 'Product';
                  if (col === 'total_cost') label = 'Total Cost (៛)';
                  if (col === 'paid_so_far') label = 'Paid So Far';
                  if (col === 'remaining_debt') label = 'Remaining Debt';
                  if (col === 'actions') label = 'Action';

                  return (
                    <th 
                      key={col}
                      draggable={isDraggable}
                      onDragStart={(e) => onDragStartCol(e, col, ['actions'])}
                      onDragOver={onDragOverCol}
                      onDrop={(e) => handlePendingDrop(e, col)}
                      onClick={() => handlePendingSort(col)}
                      style={{ 
                        width: pendingColWidths[col] || 150, 
                        position: 'relative', 
                        padding: '16px 12px', 
                        textAlign: col === 'actions' ? 'center' : (['total_cost', 'paid_so_far', 'remaining_debt'].includes(col) ? 'right' : 'left'), 
                        color: '#991b1b', 
                        fontSize: '13px', 
                        textTransform: 'uppercase', 
                        fontWeight: 'bold', 
                        borderRight: '1px solid #fee2e2', 
                        cursor: isDraggable ? 'pointer' : 'default', 
                        whiteSpace: 'nowrap', 
                        userSelect: 'none' 
                      }}
                    >
                      {label}
                      {isDraggable && (<span style={{ marginLeft: '6px', fontSize: '12px', opacity: pendingSort?.key === col ? 1 : 0.3 }}>{pendingSort?.key === col ? (pendingSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>)}
                      {isDraggable && <div onMouseDown={(e) => handleResizeStartPending(e, col)} onTouchStart={(e) => handleResizeStartPending(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '14px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {processedPending.length === 0 ? (
                <tr><td colSpan={pendingColOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#10b981', fontWeight: 'bold', fontSize: '16px' }}>🎉 No pending payments to suppliers!</td></tr>
              ) : (
                processedPending.map((imp: any) => {
                  const remaining = Number(imp.total_cost) - Number(imp.paid_amount);
                  return (
                    <tr key={imp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {pendingColOrder.map(col => {
                        if (col === 'date') return <td key={col} style={{ padding: '14px 12px', color: '#64748b', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{new Date(imp.created_at).toLocaleDateString()}</td>;
                        if (col === 'supplier') return <td key={col} style={{ padding: '14px 12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{imp.suppliers?.name}</td>;
                        if (col === 'product') return <td key={col} style={{ padding: '14px 12px', color: '#475569', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{imp.products?.name} <span style={{color:'#94a3b8'}}>(x{imp.qty})</span></td>;
                        if (col === 'total_cost') return <td key={col} style={{ padding: '14px 12px', textAlign: 'right', color: '#475569', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatRiel(imp.total_cost)}</td>;
                        if (col === 'paid_so_far') return <td key={col} style={{ padding: '14px 12px', textAlign: 'right', color: '#10b981', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatRiel(imp.paid_amount)}</td>;
                        if (col === 'remaining_debt') return <td key={col} style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatRiel(remaining)}</td>;
                        if (col === 'actions') return (
                          <td key={col} style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button 
                                onClick={() => {
                                  setPayPendingModal({ isOpen: true, record: imp, totalDue: remaining });
                                  setPendingPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
                                }}
                                style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                              >
                                💸 Pay Now
                              </button>
                              <button 
                                onClick={() => handleVoidImport(imp.id)}
                                disabled={isProcessing}
                                style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                              >
                                ❌ Void
                              </button>
                            </div>
                          </td>
                        );
                        return null;
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SUPPLIERS DATABASE TAB */}
      {activeView === 'suppliers' && (
        <div className="table-wrapper fade-in">
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {supplierColOrder.map(col => {
                  const isDraggable = col !== 'select';
                  let label = col;
                  if (col === 'name') label = 'Supplier Name';
                  if (col === 'phone') label = 'Phone';
                  if (col === 'location') label = 'Location';
                  if (col === 'total_owed') label = 'Total Current Debt (៛)';

                  if (col === 'select') {
                    return (
                      <th key={col} style={{ width: '50px', minWidth: '50px', maxWidth: '50px', padding: '16px 8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedSuppliersToDelete.size === suppliers.length && suppliers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedSuppliersToDelete(new Set(suppliers.map(s => s.id)));
                            else setSelectedSuppliersToDelete(new Set());
                          }}
                          style={{ cursor: 'pointer', accentColor: '#b58a3d', width: '16px', height: '16px' }}
                        />
                      </th>
                    );
                  }

                  return (
                    <th 
                      key={col}
                      draggable={isDraggable}
                      onDragStart={(e) => onDragStartCol(e, col, ['select'])}
                      onDragOver={onDragOverCol}
                      onDrop={(e) => handleSupplierDrop(e, col)}
                      onClick={() => handleSupplierSort(col)}
                      style={{ 
                        width: supplierColWidths[col] || 150, 
                        position: 'relative', 
                        padding: '16px 12px', 
                        textAlign: col === 'total_owed' ? 'right' : 'left', 
                        color: '#475569', 
                        fontSize: '13px', 
                        textTransform: 'uppercase', 
                        fontWeight: 'bold', 
                        borderRight: '1px solid #f1f5f9', 
                        cursor: isDraggable ? 'pointer' : 'default', 
                        whiteSpace: 'nowrap', 
                        userSelect: 'none' 
                      }}
                    >
                      {label}
                      {isDraggable && (<span style={{ marginLeft: '6px', fontSize: '12px', opacity: supplierSort?.key === col ? 1 : 0.3 }}>{supplierSort?.key === col ? (supplierSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>)}
                      {isDraggable && <div onMouseDown={(e) => handleResizeStartSupplier(e, col)} onTouchStart={(e) => handleResizeStartSupplier(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '14px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {processedSuppliers.length === 0 ? (
                <tr><td colSpan={supplierColOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No suppliers recorded.</td></tr>
              ) : (
                processedSuppliers.map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {supplierColOrder.map(col => {
                      if (col === 'select') return (
                        <td key={col} style={{ padding: '14px 12px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedSuppliersToDelete.has(s.id)}
                            onChange={() => {
                              const next = new Set(selectedSuppliersToDelete)
                              next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                              setSelectedSuppliersToDelete(next)
                            }} 
                            style={{ cursor: 'pointer', accentColor: '#b58a3d', width: '16px', height: '16px' }} 
                          />
                        </td>
                      );
                      if (col === 'name') return <td key={col} style={{ padding: '14px 12px', fontWeight: 'bold', color: '#0f172a', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>;
                      if (col === 'phone') return <td key={col} style={{ padding: '14px 12px', color: '#475569', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.phone || '-'}</td>;
                      if (col === 'location') return <td key={col} style={{ padding: '14px 12px', color: '#475569', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.location || '-'}</td>;
                      if (col === 'total_owed') return (
                        <td key={col} style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 'bold', color: Number(s.total_owed_riel) > 0 ? '#ef4444' : '#10b981', fontSize: '14px', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatRiel(s.total_owed_riel || 0)}
                          {Number(s.total_owed_usd) > 0 && <div style={{ fontSize: '12px', marginTop: '4px' }}>{formatUSD(s.total_owed_usd)}</div>}
                        </td>
                      );
                      return null;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* === GLOBAL MODALS === */}

      {/* SETTLE SUPPLIER BILL MODAL */}
      {payPendingModal.isOpen && payPendingModal.record && (
        <div className="modal-overlay" onMouseDown={() => setPayPendingModal({ isOpen: false, record: null, totalDue: 0 })}>
          <div className="modal-content" style={{ maxWidth: '450px' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>💸 Settle Supplier Bill</h3>
            <p style={{ margin: '0 0 16px 0', color: '#475569', fontSize: '14px' }}>Paying: <b>{payPendingModal.record.suppliers?.name}</b></p>
            
            <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase' }}>Remaining Debt</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
                {formatRiel(payPendingModal.totalDue)}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }}>Payment Method(s)</label>
                <button onClick={() => setPendingPaymentRows([...pendingPaymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>+ Split</button>
              </div>

              {pendingPaymentRows.map((row, index) => (
                <div key={row.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                  <select 
                    value={row.method} 
                    onChange={e => {
                      const newRows = [...pendingPaymentRows];
                      newRows[index].method = e.target.value;
                      setPendingPaymentRows(newRows);
                    }}
                    style={{ width: '45%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#334155' }}
                  >
                    <option value="Cash ៛">💵 Cash ៛</option>
                    <option value="Cash $">💵 Cash $</option>
                    <option value="QR ៛">📱 QR ៛</option>
                    <option value="QR $">📱 QR $</option>
                    <option value="Mom QR ៛">👩 Mom QR ៛</option>
                    <option value="Mom QR $">👩 Mom QR $</option>
                  </select>
                  
                  <div style={{ flex: 1 }}>
                    <CurrencyInput 
                      placeholder="" 
                      value={row.amount} 
                      onChange={(val: any) => {
                        const newRows = [...pendingPaymentRows];
                        newRows[index].amount = val;
                        setPendingPaymentRows(newRows);
                      }}
                      onEnter={handlePayPendingSubmit}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', textAlign: 'right', fontSize: '16px' }}
                    />
                  </div>
                  
                  {pendingPaymentRows.length > 1 && (
                    <button onClick={() => setPendingPaymentRows(pendingPaymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {pendingPaymentRows.some(r => Number(r.amount) > 0) && (
              <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Total Processed:</span>
                  <span style={{ color: '#334155', fontWeight: 'bold' }}>{formatRiel(liveTotalPendingReceived)}</span>
                </div>
                {livePendingRemaining < 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ef4444' }}>Overpaid By:</span>
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatRiel(Math.abs(livePendingRemaining))}</span>
                  </div>
                ) : livePendingRemaining > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#d97706' }}>Still Owes:</span>
                    <span style={{ color: '#b45309', fontWeight: 'bold' }}>{formatRiel(livePendingRemaining)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#166534' }}>Balance:</span>
                    <span style={{ color: '#15803d', fontWeight: 'bold' }}>Perfectly Cleared ✅</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setPayPendingModal({ isOpen: false, record: null, totalDue: 0 })} style={{ padding: '12px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={handlePayPendingSubmit} disabled={isProcessing} style={{ padding: '12px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DUAL-VIEW HISTORY MODAL WITH AUTOMATED VOID FEATURE */}
      {historyModal.isOpen && historyModal.product && (
        <div className="modal-overlay" onMouseDown={() => setHistoryModal({ isOpen: false, product: null, data: [], activeBatches: [] })}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>📦 Batch & Import History</h2>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>Tracking: <b style={{ color: '#0f172a' }}>{historyModal.product.name}</b></p>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false, product: null, data: [], activeBatches: [] })} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', maxHeight: '50vh' }}>
              
              {/* SECTION 1: Active Shelved Batches (These decrease) */}
              <h3 style={{ fontSize: '13px', color: '#475569', textTransform: 'uppercase', marginBottom: '12px' }}>🟢 Active Batches on Shelf</h3>
              {historyModal.activeBatches.length === 0 ? (
                <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '24px' }}>No active batches remaining. Stock is empty.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {historyModal.activeBatches.map((b, index) => {
                    const isEditing = editingHistoryId === b.id;
                    const editData = historyEdits[b.id] || { remaining_qty: b.remaining_qty, cost_price: b.cost_price };
                    let batchLabel = index === 0 ? '1st Batch (Current)' : index === 1 ? '2nd Batch' : `${index + 1}th Batch`;

                    return (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: index === 0 ? '#f0fdf4' : '#f8fafc', border: isEditing ? '1px solid #b58a3d' : (index === 0 ? '1px solid #bbf7d0' : '1px solid #e2e8f0'), borderRadius: '8px', transition: 'all 0.2s' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                            <div style={{ flex: '1 1 80px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Remaining Qty</label>
                              <input autoFocus type="number" className="no-spinners" value={editData.remaining_qty} onChange={e => setHistoryEdits({...historyEdits, [b.id]: {...editData, remaining_qty: Number(e.target.value)}})} onKeyDown={e => e.key === 'Enter' && handleSaveHistory(b.id)} style={{ width: '100%', padding: '6px', border: '1px solid #b58a3d', borderRadius: '4px', fontSize: '16px', color: '#0f172a', backgroundColor: '#fff' }} />
                            </div>
                            <div style={{ flex: '1 1 100px' }}>
                              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Cost (៛)</label>
                              <input type="number" className="no-spinners" value={editData.cost_price} onChange={e => setHistoryEdits({...historyEdits, [b.id]: {...editData, cost_price: Number(e.target.value)}})} onKeyDown={e => e.key === 'Enter' && handleSaveHistory(b.id)} style={{ width: '100%', padding: '6px', border: '1px solid #b58a3d', borderRadius: '4px', fontSize: '16px', color: '#0f172a', backgroundColor: '#fff' }} />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 'bold', color: index === 0 ? '#15803d' : '#0f172a' }}>{batchLabel}</div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Arrived: {new Date(b.created_at).toLocaleDateString()}</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          {!isEditing && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '16px' }}>{b.remaining_qty} Bags Left</div>
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Cost: {formatRiel(b.cost_price)}</div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginTop: isEditing ? '20px' : '8px' }}>
                            {isEditing ? (
                              <>
                                <button onClick={() => handleSaveHistory(b.id)} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Save</button>
                                <button onClick={() => setEditingHistoryId(null)} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingHistoryId(b.id); setHistoryEdits({ [b.id]: { remaining_qty: b.remaining_qty, cost_price: b.cost_price } }); }} style={{ padding: '4px 8px', background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>✏️ Edit</button>
                                <button onClick={() => handleDeleteHistory(b.id)} style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>🗑️ Del</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* SECTION 2: Permanent Import Log (These never decrease) */}
              <h3 style={{ fontSize: '13px', color: '#475569', textTransform: 'uppercase', marginBottom: '12px', paddingTop: '16px', borderTop: '2px dashed #e2e8f0' }}>📦 Permanent Invoice Log</h3>
              {historyModal.data.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '14px' }}>No import records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {historyModal.data.map((h) => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
                       <div>
                         <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px', fontSize: '13px' }}>{new Date(h.created_at).toLocaleDateString()} at {new Date(h.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                         <div style={{ color: '#64748b', fontSize: '12px' }}>Supplier: <span style={{ color: '#334155', fontWeight: 'bold' }}>{h.suppliers?.name || 'Unknown'}</span></div>
                       </div>
                       <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                         <div>
                           <div style={{ fontWeight: 'bold', color: '#10b981', fontSize: '14px' }}>+{h.qty} Bags Imported</div>
                           <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>Paid: {formatRiel(h.unit_cost)} / bag</div>
                         </div>
                         <button 
                           onClick={() => handleVoidImport(h.id)}
                           disabled={isProcessing}
                           style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                         >
                           ❌ Void
                         </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ADD SUPPLIER MODAL */}
      {isAddSupplierOpen && (
        <div className="modal-overlay" onMouseDown={() => setIsAddSupplierOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b' }}>🏢 Add New Supplier</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Supplier Name</label>
                <input autoFocus placeholder="" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Phone Number (Optional)</label>
                <input value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Location / Address (Optional)</label>
                <input value={newSupplier.location} onChange={e => setNewSupplier({...newSupplier, location: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
              </div>
            </div>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setIsAddSupplierOpen(false)} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleAddSupplier} disabled={isProcessing} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Save Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER MODAL */}
      {isFilterOpen && (
        <div className="modal-overlay" onMouseDown={() => setIsFilterOpen(false)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', color: '#1e293b' }}>Filter Records</h3>
            
            {filterRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '13px', color: '#475569', width: '40px', fontWeight: 'bold' }}>{index === 0 ? 'Where' : 'And'}</span>
                <select value={rule.column} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof Product } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a' }}>
                  {DEFAULT_ORDER.filter(o => o !== 'linked_wholesale' && o !== 'actions' && o !== 'expand').map(c => <option key={c} value={c as string}>{String(c).toUpperCase()}</option>)}
                </select>
                <select value={rule.operator} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: e.target.value as FilterOperator } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a' }}>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals (=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                </select>
                <input placeholder="" value={rule.value} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))} style={{ flex: '1 1 120px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '16px', backgroundColor: '#fff', color: '#0f172a' }} className="no-spinners" type={['price', 'cost_price', 'stock', 'weight'].includes(rule.column as string) ? 'number' : 'text'} />
                <button onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>✕</button>
              </div>
            ))}
            
            <button onClick={() => setFilterRules(prev => [...prev, { id: Date.now(), column: 'name', operator: 'contains', value: '' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', fontSize: '14px' }}>+ Add condition</button>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setFilterRules([])} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Clear All</button>
              <button onClick={() => setIsFilterOpen(false)} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Apply Filters</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW PRODUCT CREATION MODAL */}
      {isAddModalOpen && (
        <div className="modal-overlay" onMouseDown={() => setIsAddModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: '#1e293b', marginBottom: '20px' }}>📦 Add New Product</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Product Name</label>
                <input autoFocus placeholder="" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Selling Price (៛)</label>
                  <CurrencyInput value={newItem.price} onChange={(v:any) => setNewItem({...newItem, price: v})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Cost Price (៛)</label>
                  <CurrencyInput value={newItem.cost_price} onChange={(v:any) => setNewItem({...newItem, cost_price: v})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Weight (kg)</label>
                  <input type="number" className="no-spinners" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Initial Stock</label>
                  <input type="number" className="no-spinners" value={newItem.stock} onChange={e => setNewItem({...newItem, stock: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
                </div>
              </div>
              
              <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#991b1b', fontWeight: 'bold', marginBottom: '6px' }}>🚨 Min Stock Alert Level</label>
                <input type="number" className="no-spinners" value={newItem.min_stock_level} onChange={e => setNewItem({...newItem, min_stock_level: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fca5a5', boxSizing: 'border-box', background: '#fff', fontSize: '16px' }} />
                <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', marginBottom: 0 }}>Triggers a Restock Alert if current stock falls below this amount.</p>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setIsAddModalOpen(false)} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={addProduct} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* 🚀 FIXED CSS: Hide spin buttons on number inputs to stop scroll-wheel changes */
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }

        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* 🔥 TOAST NOTIFICATION STYLES */
        .toast-notification {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100000;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          background: #ffffff;
          min-width: 300px;
          border-left: 4px solid #3b82f6;
          animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1), fadeOut 0.4s ease-in-out 4s forwards;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translate(-50%, 0); }
          to { opacity: 0; transform: translate(-50%, -20px); }
        }
        .toast-notification.success { border-left-color: #10b981; }
        .toast-notification.error { border-left-color: #ef4444; }
        .toast-notification.info { border-left-color: #3b82f6; }
        
        .toast-icon { font-size: 20px; }
        .toast-content { display: flex; flex-direction: column; gap: 2px; }
        .toast-title { font-weight: bold; color: #0f172a; font-size: 14px; }
        .toast-msg { color: #64748b; font-size: 13px; }

        /* 📱 RESPONSIVE CLASSES */
        .desktop-only-btn { display: block; }
        .mobile-only-btn { display: none !important; }

        .mobile-action-row {
          display: flex;
          flex: 1;
          gap: 12px;
          align-items: center;
          min-width: 300px;
        }

        /* 🔥 DESKTOP LAYOUT FIXES (Aligned with other pages) */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: 'Inter', sans-serif; 
          box-sizing: border-box; 
          color: #333;
          width: 100%;
          
          /* 👇 SCROLL FIX 👇 */
          height: 100dvh; 
          overflow-y: auto; 
          -webkit-overflow-scrolling: touch;
        }

        .header-container { 
          display: flex;
          justify-content: space-between;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; 
          gap: 12px;
          min-height: 48px; 
        }
        
        .header-left {
          display: flex;
          align-items: center; 
          gap: 12px;
        }

        .page-title { 
          font-size: 24px !important; 
          color: #4a3b1b !important; 
          margin: 0 !important; 
          font-weight: bold;
          letter-spacing: -0.5px;
          line-height: normal !important; 
          display: flex;
          align-items: center;
          min-width: 0;
          white-space: nowrap !important; 
        }

        .header-actions {
          display: flex;
          gap: 10px;
        }
        .delete-btn {
          padding: 10px 20px;
          background: #ef4444;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }
        .add-btn {
          padding: 10px 20px;
          background: #b58a3d;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }
        .toolbar-container {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          background: #fff;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          align-items: center;
          flex-wrap: wrap;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .toolbar-tabs {
          display: flex;
          gap: 8px;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 8px;
        }
        .tab {
          padding: 10px 16px;
          border-radius: 6px;
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: bold;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .tab.active {
          background: #10b981;
          color: #fff;
        }
        .toolbar-search {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          flex: 1;
          outline: none;
          min-width: 150px;
          font-size: 16px;
          color: #0f172a;
          background-color: #ffffff;
        }
        .toolbar-filters {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }
        .filter-btn {
          padding: 10px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
        }

        .add-btn-inline {
          display: flex;
          align-items: center;
          padding: 8px 14px;
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          font-size: 13px; 
          white-space: nowrap;
          transition: background 0.2s;
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .table-wrapper {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
          -webkit-overflow-scrolling: touch;
        }
        .cell-display {
          padding: 16px 12px;
          font-size: 14px;
          min-height: 48px;
          cursor: text;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
        }
        .cell-input {
          width: 100%;
          height: 100%;
          padding: 16px 12px;
          font-size: 16px;
          border: none;
          outline: 2px solid #b58a3d;
          box-shadow: 0 0 5px rgba(181, 138, 61, 0.3);
          background: #fff;
          position: absolute;
          top: 0;
          left: 0;
          z-index: 20;
          box-sizing: border-box;
          color: #0f172a;
        }
        .cell-editing {
          z-index: 20;
          position: relative;
        }

        .interactive-select-trigger {
          padding: 8px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #f8fafc;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background 0.15s;
        }
        .interactive-select-trigger:hover {
          background: #edf2f7;
          border-color: #94a3b8;
        }
        .dropdown-search-input {
          width: 100%;
          padding: 10px 12px;
          border: 2px solid #b58a3d;
          border-radius: 6px;
          font-size: 16px;
          outline: none;
          box-sizing: border-box;
          color: #0f172a;
          background-color: #ffffff;
        }
        .dropdown-results-tray {
          position: absolute;
          top: 100%;
          left: 12px;
          right: 12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          max-height: 180px;
          overflow-y: auto;
          margin-top: 4px;
        }
        .dropdown-row {
          padding: 10px 12px;
          font-size: 13px;
          cursor: pointer;
          color: #0f172a;
          border-bottom: 1px solid #f1f5f9;
        }
        .dropdown-row:hover {
          background: #f1f5f9;
        }
        .clear-option {
          color: #ef4444;
          font-weight: bold;
          background: #fff5f5;
        }
        .clear-option:hover {
          background: #fee2e2;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 16px;
          box-sizing: border-box;
        }
        .modal-content {
          background: #fff;
          padding: 30px;
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }

        /* 🔥 MOBILE OVERRIDES */
        @media (max-width: 1023px) { 
          .desktop-only-btn { display: none !important; }
          .mobile-only-btn { display: flex !important; }
          .mobile-only-flex { display: flex !important; }

          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
          
          .header-container { 
            margin-left: 54px !important; 
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            align-items: center !important; 
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
          }

          .header-left {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .page-title {
            font-size: 21px !important; 
            line-height: normal !important; 
            white-space: nowrap !important; 
          }

          .toolbar-container {
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 12px !important;
            gap: 10px !important;
          }
          .toolbar-tabs {
            width: 100%;
          }
          
          .mobile-action-row {
            width: 100%;
            gap: 8px !important;
            min-width: 0 !important;
            justify-content: space-between;
          }
          .toolbar-search {
            min-width: 0 !important;
            width: 100%;
            padding: 8px 10px !important;
            font-size: 16px !important;
          }
          .toolbar-filters {
            gap: 6px !important;
          }
          .filter-btn, .add-btn-inline {
            padding: 8px 10px !important;
            font-size: 12px !important; 
            white-space: nowrap !important;
          }

          .supplier-name-cell {
            font-size: 14px !important;
          }

          .mobile-input-field {
            font-size: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}