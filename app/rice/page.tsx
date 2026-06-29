'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => {
  return `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
};

// --- CATEGORIES ---
const RICE_CATEGORIES = ['All', 'មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប', 'ផ្សេងៗ'];
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
}

interface HistoryRecord {
  id: number
  product_id: number
  price: number
  cost_price: number
  created_at: string
  imported_qty?: number
  sold_qty?: number
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

const DEFAULT_WIDTHS: Record<string, number> = {
  id: 60, name: 240, price: 120, cost_price: 120, stock: 100, weight: 90, linked_wholesale: 220, mtd_kg_used: 120, mtd_bags_used: 120, actions: 180
}

const DEFAULT_ORDER: Array<keyof Product | 'linked_wholesale' | 'actions'> = ['id', 'name', 'price', 'cost_price', 'stock', 'weight', 'linked_wholesale', 'mtd_kg_used', 'mtd_bags_used', 'actions']

export default function RiceControl() {
  // --- CORE STATE ---
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [imports, setImports] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<number>>(new Set())
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  // --- CELL EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: number, col: string} | null>(null)
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null)
  const [dropdownSearch, setDropdownSearch] = useState('')

  // --- VIEWS & TABS STATE ---
  const [activeView, setActiveView] = useState<'retail' | 'wholesale' | 'import' | 'pending' | 'suppliers'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')

  // --- IMPORT FORM STATE ---
  const [importForm, setImportForm] = useState({ supplier_id: '', product_id: '', qty: '', unit_cost: '', paid_amount: '', payment_method: 'Cash' })
  
  // --- MODALS ---
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', location: '' })
  const [payPendingModal, setPayPendingModal] = useState<{isOpen: boolean, record: any, amount: string, method: string}>({ isOpen: false, record: null, amount: '', method: 'Cash' })

  // --- COLUMN PREFERENCE STATE ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [columnOrder, setColumnOrder] = useState<Array<keyof Product | 'linked_wholesale' | 'actions'>>(DEFAULT_ORDER)
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- SORTING & FILTERING ---
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])

  // --- MODAL STATES ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', price: '' as any, cost_price: '' as any, weight: '' as any, stock: '' as any })

  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; product: Product | null; data: HistoryRecord[] }>({
    isOpen: false, product: null, data: []
  })
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)
  const [historyEdits, setHistoryEdits] = useState<Record<number, Partial<HistoryRecord>>>({})

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchProducts()
    fetchSettings()
    fetchSuppliers()
    fetchImports()
  }, [])

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['column_widths', 'column_order'])
    if (data) {
      const widths = data.find((d: any) => d.setting_key === 'column_widths')
      const order = data.find((d: any) => d.setting_key === 'column_order')
      if (widths && widths.setting_value) setColumnWidths(widths.setting_value)
      if (order && order.setting_value) {
        const cleanOrder = order.setting_value.filter((o: string) => o !== 'actions');
        setColumnOrder([...cleanOrder, 'actions'] as any);
      }
    }
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (data) setProducts(data)
    setEdits({})
  }

  async function fetchSuppliers() {
    const { data } = await supabase.from('suppliers').select('*').order('name', { ascending: true })
    if (data) setSuppliers(data)
  }

  async function fetchImports() {
    const { data } = await supabase.from('imports').select(`
      *,
      suppliers (name),
      products (name)
    `).order('created_at', { ascending: false })
    if (data) setImports(data)
  }

  // --- SUPPLIER & IMPORT ACTIONS ---
  async function handleAddSupplier() {
    if (!newSupplier.name) return alert('Supplier name is required');
    setLoading(true);
    const { error } = await supabase.from('suppliers').insert([{ name: newSupplier.name, phone: newSupplier.phone, location: newSupplier.location }]);
    setLoading(false);
    if (!error) {
      setIsAddSupplierOpen(false);
      setNewSupplier({ name: '', phone: '', location: '' });
      fetchSuppliers();
    } else alert(`Error: ${error.message}`);
  }

  async function handleProcessImport(isPayLater: boolean) {
    if (!importForm.supplier_id || !importForm.product_id || !importForm.qty || !importForm.unit_cost) {
      return alert('Please fill in all required fields (Supplier, Product, Qty, Cost).');
    }

    const qty = Number(importForm.qty);
    const unitCost = Number(importForm.unit_cost);
    const totalCost = qty * unitCost;
    const paidAmount = isPayLater ? (Number(importForm.paid_amount) || 0) : totalCost;
    
    if (paidAmount > totalCost) return alert('Cannot pay more than the total cost.');

    const status = paidAmount >= totalCost ? 'Paid' : 'Pending';
    const remainingDebt = totalCost - paidAmount;

    setLoading(true);

    try {
      // 1. Log Import
      const { error: importErr } = await supabase.from('imports').insert([{
        supplier_id: Number(importForm.supplier_id),
        product_id: Number(importForm.product_id),
        qty: qty,
        unit_cost: unitCost,
        total_cost: totalCost,
        paid_amount: paidAmount,
        status: status
      }]);
      if (importErr) throw importErr;

      // 2. Update Supplier Debt
      if (remainingDebt > 0) {
        const supplier = suppliers.find(s => s.id === Number(importForm.supplier_id));
        const newTotalOwed = Number(supplier?.total_owed || 0) + remainingDebt;
        await supabase.from('suppliers').update({ total_owed: newTotalOwed }).eq('id', supplier?.id);
      }

      // 3. Update Product Stock
      const product = products.find(p => p.id === Number(importForm.product_id));
      const newStock = Number(product?.stock || 0) + qty;
      await supabase.from('products').update({ stock: newStock, cost_price: unitCost }).eq('id', product?.id);

      // 4. Create Batch
      await supabase.from('price_history').insert([{
        product_id: Number(importForm.product_id),
        cost_price: unitCost,
        price: product?.price || 0,
        imported_qty: qty,
        sold_qty: 0
      }]);

      // 5. Log Expense (Deduct from Cash/QR)
      if (paidAmount > 0) {
        const supplierName = suppliers.find(s => s.id === Number(importForm.supplier_id))?.name || 'Unknown';
        await supabase.from('expenses').insert([{
          expense_date: new Date().toISOString().split('T')[0],
          spender: 'Business',
          payment_method: importForm.payment_method,
          remarks: `Stock Import: ${supplierName}`,
          amount: 0,
          amount_riel: paidAmount,
          description: 'BUSINESS'
        }]);
      }

      setImportForm({ supplier_id: '', product_id: '', qty: '', unit_cost: '', paid_amount: '', payment_method: 'Cash' });
      alert('Import processed successfully!');
      fetchProducts();
      fetchSuppliers();
      fetchImports();

      if (isPayLater) setActiveView('pending');
      else setActiveView('wholesale');

    } catch (err: any) {
      alert(`Error processing import: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePayPendingSubmit() {
    const record = payPendingModal.record;
    const payAmt = Number(payPendingModal.amount) || 0;
    
    if (payAmt <= 0) return alert('Enter a valid amount');
    const remainingBefore = Number(record.total_cost) - Number(record.paid_amount);
    if (payAmt > remainingBefore) return alert('Cannot pay more than what is owed');

    const newPaidAmount = Number(record.paid_amount) + payAmt;
    const newStatus = newPaidAmount >= Number(record.total_cost) ? 'Paid' : 'Pending';

    setLoading(true);

    try {
      // 1. Update Import
      await supabase.from('imports').update({ paid_amount: newPaidAmount, status: newStatus }).eq('id', record.id);

      // 2. Update Supplier Debt
      const supplier = suppliers.find(s => s.id === record.supplier_id);
      const newTotalOwed = Math.max(0, Number(supplier?.total_owed || 0) - payAmt);
      await supabase.from('suppliers').update({ total_owed: newTotalOwed }).eq('id', supplier?.id);

      // 3. Log Expense
      await supabase.from('expenses').insert([{
        expense_date: new Date().toISOString().split('T')[0],
        spender: 'Business',
        payment_method: payPendingModal.method,
        remarks: `Paid Debt: ${supplier?.name || 'Supplier'}`,
        amount: 0,
        amount_riel: payAmt,
        description: 'BUSINESS'
      }]);

      setPayPendingModal({ isOpen: false, record: null, amount: '', method: 'Cash' });
      fetchSuppliers();
      fetchImports();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // --- RECORD OPERATIONS ---
  const handleSaveRecord = async (id: number) => {
    if (!edits[id]) return;
    const payload = { ...edits[id] } as any;
    ['price', 'cost_price', 'weight', 'stock', 'mtd_kg_used', 'mtd_bags_used'].forEach(key => {
      if (payload[key] === '') payload[key] = 0;
      else if (payload[key] !== undefined) payload[key] = Number(payload[key]);
    });

    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (!error) {
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditingCell(null)
      fetchProducts()
    } else alert(`Error saving: ${error.message}`)
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedToDelete.size} item(s)?`)) return
    const { error } = await supabase.from('products').delete().in('id', Array.from(selectedToDelete))
    if (!error) { setSelectedToDelete(new Set()); fetchProducts() }
  }

  const addProduct = async () => {
    if (!newItem.name) return alert('Name is required')
    const payload = {
      name: newItem.name,
      price: Number(newItem.price) || 0,
      cost_price: Number(newItem.cost_price) || 0,
      weight: Number(newItem.weight) || 0,
      stock: Number(newItem.stock) || 0,
      mtd_kg_used: 0,
      mtd_bags_used: 0
    }
    const { error } = await supabase.from('products').insert([payload])
    if (!error) {
      setIsAddModalOpen(false)
      setNewItem({ name: '', price: '', cost_price: '', weight: '', stock: '' })
      fetchProducts()
    }
  }

  // --- HISTORY OPERATIONS (WITH STOCK SYNC) ---
  const fetchHistory = async (product: Product) => {
    const { data } = await supabase.from('price_history').select('*').eq('product_id', product.id).order('created_at', { ascending: false })
    setHistoryModal({ isOpen: true, product, data: data || [] })
    setEditingHistoryId(null)
    setHistoryEdits({})
  }

  const handleSaveHistory = async (historyId: number) => {
    const edits = historyEdits[historyId];
    if (!edits || !historyModal.product) return setEditingHistoryId(null);

    const originalRecord = historyModal.data.find(h => h.id === historyId);
    const originalQty = originalRecord?.imported_qty || 0;
    const newQty = edits.imported_qty !== undefined ? Number(edits.imported_qty) : originalQty;
    
    const qtyDifference = newQty - originalQty;

    const payload: any = {};
    if (edits.imported_qty !== undefined) payload.imported_qty = newQty;
    if (edits.price !== undefined) payload.price = Number(edits.price) || 0;
    if (edits.cost_price !== undefined) payload.cost_price = Number(edits.cost_price) || 0;

    const { error } = await supabase.from('price_history').update(payload).eq('id', historyId);
    
    if (!error) {
      if (qtyDifference !== 0) {
        const newStock = Number(historyModal.product.stock) + qtyDifference;
        await supabase.from('products').update({ stock: newStock }).eq('id', historyModal.product.id);
        setHistoryModal(prev => ({...prev, product: {...prev.product!, stock: newStock}}));
        fetchProducts(); 
      }
      fetchHistory(historyModal.product);
    } else {
      alert(`Error updating history: ${error?.message}`);
    }
  }

  const handleDeleteHistory = async (historyId: number) => {
    if (!historyModal.product) return;
    if (!confirm("Are you sure you want to delete this historical record? The imported quantity will be deducted from your stock.")) return;
    
    const recordToDelete = historyModal.data.find(h => h.id === historyId);
    const qtyToReverse = recordToDelete?.imported_qty || 0;

    const { error } = await supabase.from('price_history').delete().eq('id', historyId);
    
    if (!error) {
      if (qtyToReverse > 0) {
        const newStock = Number(historyModal.product.stock) - qtyToReverse;
        await supabase.from('products').update({ stock: newStock }).eq('id', historyModal.product.id);
        setHistoryModal(prev => ({...prev, product: {...prev.product!, stock: newStock}}));
        fetchProducts(); 
      }
      fetchHistory(historyModal.product);
    }
  }

  // --- NEW IMPORT REDIRECT ---
  const openImportModal = (product: Product) => {
    setImportForm(prev => ({ ...prev, product_id: String(product.id) }));
    setActiveView('import');
  }

  // --- PERSISTENT BAG LINKING LOGIC ---
  const handleLinkWholesaleBag = async (retailId: number, wholesaleProduct: Product | null) => {
    if (!wholesaleProduct) {
      const { error } = await supabase.from('products').update({ linked_wholesale_id: null }).eq('id', retailId);
      if (!error) fetchProducts();
      return;
    }

    const wholesaleWeight = wholesaleProduct.weight || 50; 
    const calculated1kgCogs = Math.round(wholesaleProduct.cost_price / wholesaleWeight);

    const { error } = await supabase.from('products').update({ 
      linked_wholesale_id: wholesaleProduct.id,
      cost_price: calculated1kgCogs 
    }).eq('id', retailId);
    
    if (!error) {
      setActiveDropdownId(null);
      setDropdownSearch('');
      fetchProducts();
    } else {
      alert(`Error linking wholesale product: ${error.message}`);
    }
  }

  // --- COLUMN DRAG & DROP LOGIC ---
  const handleDragStart = (e: React.DragEvent, col: string) => {
    if (col === 'actions') return; 
    e.dataTransfer.setData('text/plain', col)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() 
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    if (targetCol === 'actions') return;

    const sourceCol = e.dataTransfer.getData('text/plain') as keyof Product | 'linked_wholesale' | 'actions'
    if (!sourceCol || sourceCol === targetCol || sourceCol === 'actions') return

    setColumnOrder(prev => {
      const orderWithoutActions = prev.filter(c => c !== 'actions');
      const newOrder = orderWithoutActions.filter(c => c !== sourceCol);
      const targetIdx = newOrder.indexOf(targetCol as any);
      
      newOrder.splice(targetIdx, 0, sourceCol);
      const finalOrder = [...newOrder, 'actions'];
      
      supabase.from('app_settings').upsert({
        setting_key: 'column_order',
        setting_value: finalOrder
      }, { onConflict: 'setting_key' }).then()
      
      return finalOrder as any;
    })
  }

  // --- COLUMN RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation() 
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX
    const startWidth = widthsRef.current[columnKey] || 150

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX
      const newWidth = Math.max(40, startWidth + (currentX - startX))
      setColumnWidths(prev => ({ ...prev, [columnKey]: newWidth }))
    }

    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleUp)
      
      await supabase.from('app_settings').upsert({
        setting_key: 'column_widths',
        setting_value: widthsRef.current
      }, { onConflict: 'setting_key' })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchmove', handleMove)
    document.addEventListener('touchend', handleUp)
  }

  const handleSort = (key: any) => {
    if (key === 'linked_wholesale' || key === 'actions') return;
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  // --- DATA PROCESSING ---
  const processedProducts = products
    .map(p => ({ ...p, ...edits[p.id] }))
    .filter(p => {
      if (searchQuery && !p.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
      
      if (activeView === 'retail' && p.weight >= 50) return false
      if (activeView === 'wholesale' && p.weight < 50) return false

      if (activeView === 'wholesale' && activeCategory !== 'All') {
        const name = p.name || '';
        if (activeCategory === 'ផ្សេងៗ') {
          if (MAIN_KEYWORDS.some(kw => name.includes(kw))) return false;
        } else {
          if (!name.includes(activeCategory)) return false;
        }
      }

      for (const rule of filterRules) {
        if (!rule.value && rule.value !== 0) continue
        const val = p[rule.column as keyof Product]
        const checkVal = String(rule.value).toLowerCase()
        
        if (rule.operator === 'contains' && !String(val).toLowerCase().includes(checkVal)) return false
        if (rule.operator === 'equals' && String(val).toLowerCase() !== checkVal) return false
        if (rule.operator === 'gt' && Number(val) <= Number(rule.value)) return false
        if (rule.operator === 'lt' && Number(val) >= Number(rule.value)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      if ((a as any)[key] < (b as any)[key]) return direction === 'asc' ? -1 : 1;
      if ((a as any)[key] > (b as any)[key]) return direction === 'asc' ? 1 : -1;
      return 0;
    })

  // --- FORMATTERS ---
  const formatDisplayValue = (col: string, val: any) => {
    if (val === null || val === undefined) return '';
    if (['price', 'cost_price'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} ៛`;
    if (['stock', 'weight', 'id'].includes(col)) return new Intl.NumberFormat('en-US').format(val);
    if (['mtd_kg_used'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} kg`;
    if (['mtd_bags_used'].includes(col)) return `${new Intl.NumberFormat('en-US').format(val)} bags`;
    return String(val);
  }

  const Resizer = ({ columnKey }: { columnKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStart(e, columnKey)}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '14px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }}
    />
  )

  const pendingImports = imports.filter(i => i.status === 'Pending');
  const importTotalCalc = (Number(importForm.qty) || 0) * (Number(importForm.unit_cost) || 0);

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">🌾 Rice Inventory & Suppliers</h1>
        <div className="header-actions">
          {selectedToDelete.size > 0 && activeView !== 'import' && activeView !== 'pending' && activeView !== 'suppliers' && (
            <button className="delete-btn" onClick={handleDelete}>
              Delete ({selectedToDelete.size})
            </button>
          )}
          {(activeView === 'retail' || activeView === 'wholesale') && (
            <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
              + Add Product
            </button>
          )}
          {activeView === 'suppliers' && (
            <button className="add-btn" onClick={() => setIsAddSupplierOpen(true)}>
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
          <button className={activeView === 'pending' ? 'tab active' : 'tab'} onClick={() => setActiveView('pending')}>⏳ Pending Payments {pendingImports.length > 0 && `(${pendingImports.length})`}</button>
          <button className={activeView === 'suppliers' ? 'tab active' : 'tab'} onClick={() => setActiveView('suppliers')}>🏢 Suppliers</button>
        </div>
        
        {(activeView === 'retail' || activeView === 'wholesale') && (
          <>
            <input 
              className="toolbar-search" 
              placeholder="🔍 Quick search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            
            <div className="toolbar-filters">
              <button className="filter-btn" onClick={() => setIsFilterOpen(true)} style={{ color: filterRules.length > 0 ? '#3b82f6' : '#0f172a' }}>
                Y Filter {filterRules.length > 0 && `(${filterRules.length})`}
              </button>
            </div>
          </>
        )}
      </div>

      {/* RICE CATEGORIES (ONLY WHOLESALE) */}
      {activeView === 'wholesale' && (
        <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '16px', marginBottom: '8px' }}>
          {RICE_CATEGORIES.map(cat => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat)} 
              style={{ padding: '8px 16px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #cbd5e1', backgroundColor: activeCategory === cat ? '#b58a3d' : '#ffffff', color: activeCategory === cat ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* =========================================
          VIEW ROUTING ENGINE
          ========================================= */}

      {(activeView === 'retail' || activeView === 'wholesale') && (
        /* MAIN SPREADSHEET */
        <div className="table-wrapper fade-in">
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {columnOrder.map(key => {
                  if ((key === 'linked_wholesale' || key === 'mtd_kg_used' || key === 'mtd_bags_used') && activeView !== 'retail') return null;
                  if (key === 'actions' && activeView !== 'wholesale') return null; 
                  
                  const isDraggable = key !== 'actions' && key !== 'linked_wholesale';

                  return (
                    <th 
                      key={key} 
                      draggable={isDraggable}
                      onDragStart={(e) => handleDragStart(e, key)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, key)}
                      onClick={() => handleSort(key)}
                      style={{ width: columnWidths[key] || 150, position: 'relative', padding: '16px 12px', textAlign: key === 'actions' ? 'center' : 'left', color: '#475569', fontSize: '13px', textTransform: 'uppercase', fontWeight: 'bold', borderRight: '1px solid #f1f5f9', cursor: isDraggable ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                    >
                      {key === 'linked_wholesale' ? 'Linked Wholesale Bag' : key === 'mtd_kg_used' ? 'MTD Used (Kg)' : key === 'mtd_bags_used' ? 'MTD Used (Bags)' : key.replace('_', ' ')}
                      {isDraggable && (<span style={{ marginLeft: '6px', fontSize: '12px', opacity: sortConfig?.key === key ? 1 : 0.3 }}>{sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>)}
                      <Resizer columnKey={key} />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {processedProducts.length === 0 ? (
                <tr><td colSpan={columnOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No products found.</td></tr>
              ) : (
                processedProducts.map(p => (
                  <tr key={p.id} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)} style={{ borderBottom: '1px solid #f1f5f9', background: edits[p.id] ? '#fefcf3' : 'transparent', transition: 'background 0.2s' }}>
                    {columnOrder.map(col => {
                      if ((col === 'linked_wholesale' || col === 'mtd_kg_used' || col === 'mtd_bags_used') && activeView !== 'retail') return null;
                      if (col === 'actions') {
                        if (activeView !== 'wholesale') return null;
                        return (
                          <td key={col} style={{ borderRight: '1px solid #f1f5f9', padding: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                              {edits[p.id] ? (
                                <>
                                  <button onMouseDown={() => handleSaveRecord(p.id)} style={{ color: '#fff', background: '#10b981', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Save</button>
                                  <button onMouseDown={() => setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n })} style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>Undo</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => openImportModal(p)} style={{ color: '#fff', background: '#3b82f6', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📦 Import</button>
                                  <button onClick={() => fetchHistory(p)} style={{ color: '#ca8a04', background: '#fef3c7', border: '1px solid #fde047', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🕒 Batches</button>
                                </>
                              )}
                            </div>
                          </td>
                        )
                      }

                      const isIdCol = col === 'id';
                      const isEditing = editingCell?.id === p.id && editingCell?.col === col;
                      const val = edits[p.id]?.[col as keyof Product] ?? p[col as keyof Product] ?? '';

                      if (col === 'linked_wholesale') {
                        const linkedProduct = products.find(wp => wp.id === p.linked_wholesale_id);
                        const isDropdownOpen = activeDropdownId === p.id;
                        return (
                          <td key={col} style={{ borderRight: '1px solid #f1f5f9', position: 'relative', padding: '6px 12px', overflow: 'visible' }}>
                            {isDropdownOpen ? (
                              <div style={{ position: 'relative', zIndex: 100 }}>
                                <input autoFocus className="dropdown-search-input" placeholder="Search 50kg bag..." value={dropdownSearch} onChange={e => setDropdownSearch(e.target.value)} onBlur={() => setTimeout(() => setActiveDropdownId(null), 200)} onKeyDown={e => e.key === 'Escape' && setActiveDropdownId(null)} />
                                <div className="dropdown-results-tray">
                                  <div className="dropdown-row clear-option" onMouseDown={() => handleLinkWholesaleBag(p.id, null)}>❌ Clear Linked Bag</div>
                                  {products.filter(wp => wp.weight >= 50 && wp.name.toLowerCase().includes(dropdownSearch.toLowerCase())).map(wp => (
                                    <div key={wp.id} className="dropdown-row" onMouseDown={() => handleLinkWholesaleBag(p.id, wp)}>
                                      <span style={{ fontWeight: 'bold' }}>{wp.name}</span>
                                      <span style={{ fontSize: '11px', color: '#64748b' }}> ({formatRiel(wp.cost_price)})</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="interactive-select-trigger" onClick={() => { setActiveDropdownId(p.id); setDropdownSearch(''); }}>
                                {linkedProduct ? `🌾 ${linkedProduct.name}` : '🔍 Click to link 50kg Bag...'}
                              </div>
                            )}
                          </td>
                        )
                      }

                      return (
                        <td key={col} className={isEditing ? 'cell-editing' : ''} style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative', padding: 0 }}>
                          {isIdCol && (hoveredId === p.id || selectedToDelete.has(p.id)) && (
                            <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 25, background: edits[p.id] ? '#fefcf3' : '#fff', paddingRight: '4px' }}>
                              <input type="checkbox" checked={selectedToDelete.has(p.id)} onChange={() => { const next = new Set(selectedToDelete); next.has(p.id) ? next.delete(p.id) : next.add(p.id); setSelectedToDelete(next); }} style={{ cursor: 'pointer', width: '18px', height: '18px', margin: 0, accentColor: '#b58a3d' }} />
                            </div>
                          )}
                          {isEditing ? (
                            <input autoFocus type={['name'].includes(col as string) ? 'text' : 'number'} className="cell-input no-spinners" style={{ paddingLeft: isIdCol ? '36px' : '12px' }} value={val as any} onChange={(e) => { const newVal = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; setEdits(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), [col]: newVal } })) }} onBlur={() => handleSaveRecord(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n }); setEditingCell(null); } }} />
                          ) : (
                            <div className="cell-display" style={{ paddingLeft: isIdCol ? '36px' : '12px', fontWeight: col === 'name' ? 'bold' : 'normal', color: col === 'name' ? '#1e293b' : (['mtd_kg_used', 'mtd_bags_used'].includes(col) ? '#b58a3d' : '#334155'), cursor: ['mtd_kg_used', 'mtd_bags_used'].includes(col) ? 'default' : 'text' }} onClick={() => { if (!['mtd_kg_used', 'mtd_bags_used'].includes(col)) { setEditingCell({ id: p.id, col: col as string }) } }}>
                              {formatDisplayValue(col as string, val)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
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
              {/* Supplier */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }}>Select Supplier</label>
                  <button onClick={() => setIsAddSupplierOpen(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ Add New Supplier</button>
                </div>
                <select value={importForm.supplier_id} onChange={e => setImportForm({...importForm, supplier_id: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>
                  <option value="">-- Choose a Supplier --</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.location ? `(${s.location})` : ''}</option>)}
                </select>
              </div>

              {/* Product */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold' }}>Select Product (Rice)</label>
                  <button onClick={() => setIsAddModalOpen(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ Create New Product</button>
                </div>
                <select value={importForm.product_id} onChange={e => setImportForm({...importForm, product_id: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>
                  <option value="">-- Choose Rice Type --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.weight}kg)</option>)}
                </select>
              </div>

              {/* Qty & Cost */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Quantity Imported</label>
                  <input type="number" className="no-spinners" placeholder="0" value={importForm.qty} onChange={e => setImportForm({...importForm, qty: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Unit Cost (៛)</label>
                  <input type="number" className="no-spinners" placeholder="0" value={importForm.unit_cost} onChange={e => setImportForm({...importForm, unit_cost: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Summary Block */}
              <div style={{ background: '#fefcf3', padding: '16px', borderRadius: '8px', border: '1px solid #fde047', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#854d0e' }}>Total Bill Cost:</span>
                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(importTotalCalc)}</span>
              </div>

              {/* Payment Section */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1e293b' }}>Payment Details</h4>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>Amount Paying Now (៛)</label>
                    <input type="number" className="no-spinners" placeholder="0 (Leave empty to pay later)" value={importForm.paid_amount} onChange={e => setImportForm({...importForm, paid_amount: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>Payment Method</label>
                    <select value={importForm.payment_method} onChange={e => setImportForm({...importForm, payment_method: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#fff' }}>
                      <option value="Cash">💵 Cash</option>
                      <option value="QR Payment">📱 QR Code</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button 
                  onClick={() => handleProcessImport(true)} 
                  disabled={loading}
                  style={{ flex: 1, padding: '14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  ⏳ Save as Pending/Partial
                </button>
                <button 
                  onClick={() => handleProcessImport(false)} 
                  disabled={loading}
                  style={{ flex: 1, padding: '14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer' }}
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
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#fff1f2', borderBottom: '2px solid #fecaca' }}>
                <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Supplier</th>
                <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Product</th>
                <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Total Cost (៛)</th>
                <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Paid So Far</th>
                <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Remaining Debt</th>
                <th style={{ padding: '16px', textAlign: 'center', color: '#991b1b', fontSize: '13px', textTransform: 'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingImports.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#10b981', fontWeight: 'bold', fontSize: '16px' }}>🎉 No pending payments to suppliers!</td></tr>
              ) : (
                pendingImports.map((imp: any) => {
                  const remaining = Number(imp.total_cost) - Number(imp.paid_amount);
                  return (
                    <tr key={imp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px', color: '#64748b' }}>{new Date(imp.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '16px', fontWeight: 'bold', color: '#0f172a' }}>{imp.suppliers?.name}</td>
                      <td style={{ padding: '16px', color: '#475569' }}>{imp.products?.name} <span style={{color:'#94a3b8'}}>(x{imp.qty})</span></td>
                      <td style={{ padding: '16px', textAlign: 'right', color: '#475569' }}>{formatRiel(imp.total_cost)}</td>
                      <td style={{ padding: '16px', textAlign: 'right', color: '#10b981' }}>{formatRiel(imp.paid_amount)}</td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444', fontSize: '16px' }}>{formatRiel(remaining)}</td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button 
                          onClick={() => setPayPendingModal({ isOpen: true, record: imp, amount: remaining.toString(), method: 'Cash' })}
                          style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          💸 Pay Now
                        </button>
                      </td>
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
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Supplier Name</th>
                <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Phone</th>
                <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontSize: '13px', textTransform: 'uppercase' }}>Location</th>
                <th style={{ padding: '16px', textAlign: 'right', color: '#ef4444', fontSize: '13px', textTransform: 'uppercase' }}>Total Current Debt (៛)</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No suppliers recorded.</td></tr>
              ) : (
                suppliers.map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: '#0f172a' }}>{s.name}</td>
                    <td style={{ padding: '16px', color: '#475569' }}>{s.phone || '-'}</td>
                    <td style={{ padding: '16px', color: '#475569' }}>{s.location || '-'}</td>
                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: Number(s.total_owed) > 0 ? '#ef4444' : '#10b981', fontSize: '16px' }}>
                      {formatRiel(s.total_owed || 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}


      {/* === GLOBAL MODALS === */}

      {/* PAY PENDING MODAL */}
      {payPendingModal.isOpen && payPendingModal.record && (
        <div className="modal-overlay" onMouseDown={() => setPayPendingModal({ isOpen: false, record: null, amount: '', method: 'Cash' })}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>💸 Settle Supplier Bill</h3>
            <p style={{ margin: '0 0 16px 0', color: '#475569', fontSize: '14px' }}>Paying: <b>{payPendingModal.record.suppliers?.name}</b></p>
            
            <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase' }}>Remaining Debt</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
                {formatRiel(Number(payPendingModal.record.total_cost) - Number(payPendingModal.record.paid_amount))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Amount to Pay Now (៛)</label>
              <input type="number" className="no-spinners" value={payPendingModal.amount} onChange={e => setPayPendingModal({...payPendingModal, amount: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Payment Method (Deducts from Asset)</label>
              <select value={payPendingModal.method} onChange={e => setPayPendingModal({...payPendingModal, method: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}>
                <option value="Cash">💵 Paid in Cash</option>
                <option value="QR Payment">📱 Paid via QR</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setPayPendingModal({ isOpen: false, record: null, amount: '', method: 'Cash' })} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handlePayPendingSubmit} disabled={loading} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Payment</button>
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
                <input autoFocus placeholder="e.g. Mega Rice Corp" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px' }} />
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
              <button onClick={handleAddSupplier} disabled={loading} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Save Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. FILTER MODAL */}
      {isFilterOpen && (
        <div className="modal-overlay" onMouseDown={() => setIsFilterOpen(false)}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', color: '#1e293b' }}>Filter Records</h3>
            
            {filterRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '13px', color: '#475569', width: '40px', fontWeight: 'bold' }}>{index === 0 ? 'Where' : 'And'}</span>
                <select value={rule.column} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof Product } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a' }}>
                  {DEFAULT_ORDER.filter(o => o !== 'linked_wholesale' && o !== 'actions').map(c => <option key={c} value={c as string}>{String(c).toUpperCase()}</option>)}
                </select>
                <select value={rule.operator} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: e.target.value as FilterOperator } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a' }}>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals (=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                </select>
                <input placeholder="Value..." value={rule.value} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))} style={{ flex: '1 1 120px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '16px', backgroundColor: '#fff', color: '#0f172a' }} className="no-spinners" type={['price', 'cost_price', 'stock', 'weight'].includes(rule.column as string) ? 'number' : 'text'} />
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

      {/* 3. LIVE BATCH HISTORY MODAL */}
      {historyModal.isOpen && historyModal.product && (
        <div className="modal-overlay" onMouseDown={() => setHistoryModal({ isOpen: false, product: null, data: [] })}>
          <div className="modal-content" style={{ maxWidth: '650px' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>Live Batches & History</h2>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>Tracking: <b style={{ color: '#0f172a' }}>{historyModal.product.name}</b></p>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false, product: null, data: [] })} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', maxHeight: '60vh' }}>
              {historyModal.data.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>No history recorded yet.</p>
              ) : (
                historyModal.data.map((h) => {
                  const isEditing = editingHistoryId === h.id;
                  const editData = historyEdits[h.id] || { imported_qty: h.imported_qty, price: h.price, cost_price: h.cost_price };
                  
                  // Live Math
                  const remaining = (h.imported_qty || 0) - (h.sold_qty || 0);
                  const isActive = remaining > 0;

                  return (
                    <div key={h.id} style={{ background: isEditing ? '#fefcf3' : (isActive ? '#f0fdf4' : '#f8fafc'), padding: '16px', borderRadius: '12px', border: isEditing ? '1px solid #b58a3d' : (isActive ? '1px solid #bbf7d0' : '1px solid #e2e8f0'), marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', transition: 'all 0.2s', opacity: isActive || isEditing ? 1 : 0.6 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                          <div style={{ flex: '1 1 80px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Import Qty</label>
                            <input autoFocus type="number" className="no-spinners" value={editData.imported_qty} onChange={e => setHistoryEdits({...historyEdits, [h.id]: {...editData, imported_qty: Number(e.target.value)}})} onKeyDown={e => e.key === 'Enter' && handleSaveHistory(h.id)} style={{ width: '100%', padding: '6px', border: '1px solid #b58a3d', borderRadius: '4px', fontSize: '14px', color: '#0f172a', backgroundColor: '#fff' }} />
                          </div>
                          <div style={{ flex: '1 1 100px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Selling (៛)</label>
                            <input type="number" className="no-spinners" value={editData.price} onChange={e => setHistoryEdits({...historyEdits, [h.id]: {...editData, price: Number(e.target.value)}})} onKeyDown={e => e.key === 'Enter' && handleSaveHistory(h.id)} style={{ width: '100%', padding: '6px', border: '1px solid #b58a3d', borderRadius: '4px', fontSize: '14px', color: '#0f172a', backgroundColor: '#fff' }} />
                          </div>
                          <div style={{ flex: '1 1 100px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Cost (៛)</label>
                            <input type="number" className="no-spinners" value={editData.cost_price} onChange={e => setHistoryEdits({...historyEdits, [h.id]: {...editData, cost_price: Number(e.target.value)}})} onKeyDown={e => e.key === 'Enter' && handleSaveHistory(h.id)} style={{ width: '100%', padding: '6px', border: '1px solid #b58a3d', borderRadius: '4px', fontSize: '14px', color: '#0f172a', backgroundColor: '#fff' }} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: isActive ? '#15803d' : '#64748b', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isActive ? (
                              <><span style={{ padding: '2px 8px', background: '#dcfce7', borderRadius: '12px', fontSize: '12px' }}>🔥 Active</span> {remaining} bags left</>
                            ) : (
                              <><span style={{ padding: '2px 8px', background: '#e2e8f0', borderRadius: '12px', fontSize: '12px' }}>📦 Depleted</span> 0 / {h.imported_qty} bags</>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Selling: <span style={{ color: '#b58a3d' }}>{formatRiel(h.price)}</span></div>
                          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>Cost: {formatRiel(h.cost_price || 0)}</div>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>
                          {new Date(h.created_at).toLocaleString()}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => handleSaveHistory(h.id)} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Save</button>
                              <button onClick={() => setEditingHistoryId(null)} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingHistoryId(h.id); setHistoryEdits({ [h.id]: { imported_qty: h.imported_qty, price: h.price, cost_price: h.cost_price } }); }} style={{ padding: '4px 8px', background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>✏️ Edit</button>
                              <button onClick={() => handleDeleteHistory(h.id)} style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>🗑️ Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD PRODUCT MODAL */}
      {isAddModalOpen && (
        <div className="modal-overlay" onMouseDown={() => setIsAddModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b' }}>Add New Product</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Product Name</label>
                <input placeholder="e.g. Jasmine Rice" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Selling Price (៛)</label>
                  <input type="number" className="no-spinners" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>COGS (៛)</label>
                  <input type="number" className="no-spinners" value={newItem.cost_price} onChange={e => setNewItem({...newItem, cost_price: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Weight (kg)</label>
                  <input type="number" className="no-spinners" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Initial Stock</label>
                  <input type="number" className="no-spinners" value={newItem.stock} onChange={e => setNewItem({...newItem, stock: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
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

        .main-wrapper {
          padding: 24px 24px 24px 75px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: #333;
          box-sizing: border-box;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .page-title {
          font-size: 24px;
          font-weight: bold;
          color: #4a3b1b;
          margin: 0;
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

        /* Interactive Inline Selector Style Rules */
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
          padding: 8px 12px;
          border: 2px solid #b58a3d;
          border-radius: 6px;
          font-size: 14px;
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

        @media (max-width: 1023px) {
          .main-wrapper {
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
          }
          .header-container {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .header-actions {
            flex-direction: column;
            width: 100%;
          }
          .delete-btn, .add-btn {
            width: 100%;
            padding: 14px;
            font-size: 15px;
          }
          .toolbar-container {
            flex-direction: column;
            align-items: stretch;
          }
          .toolbar-tabs {
            width: 100%;
          }
          .tab {
            flex: 1;
            text-align: center;
          }
          .toolbar-search {
            width: 100%;
            box-sizing: border-box;
          }
          .toolbar-filters {
            width: 100%;
          }
          .filter-btn {
            flex: 1;
            text-align: center;
          }
        }
      `}</style>
    </div>
  )
}