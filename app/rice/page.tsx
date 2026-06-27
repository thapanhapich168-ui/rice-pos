'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

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

// Default widths and order
const DEFAULT_WIDTHS: Record<string, number> = {
  id: 60,
  name: 240,
  price: 120,
  cost_price: 120,
  stock: 100,
  weight: 90,
  linked_wholesale: 220,
  mtd_kg_used: 120,
  mtd_bags_used: 120,
  actions: 180
}

const DEFAULT_ORDER: Array<keyof Product | 'linked_wholesale' | 'actions'> = ['id', 'name', 'price', 'cost_price', 'stock', 'weight', 'linked_wholesale', 'mtd_kg_used', 'mtd_bags_used', 'actions']

export default function RiceControl() {
  // --- CORE STATE ---
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<number>>(new Set())
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // --- CELL EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: number, col: string} | null>(null)
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null)
  const [dropdownSearch, setDropdownSearch] = useState('')

  // --- VIEWS & TABS STATE ---
  const [activeView, setActiveView] = useState<'retail' | 'wholesale'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')

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

  const [importModal, setImportModal] = useState<{ isOpen: boolean; product: Product | null; add_qty: string | number; new_cost: string | number; new_price: string | number }>({
    isOpen: false, product: null, add_qty: '', new_cost: '', new_price: ''
  })

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchProducts()
    fetchSettings()
  }, [])

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['column_widths', 'column_order'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'column_widths')
      const order = data.find(d => d.setting_key === 'column_order')
      if (widths && widths.setting_value) setColumnWidths(widths.setting_value)
      if (order && order.setting_value) {
        const cleanOrder = order.setting_value.filter((o: string) => o !== 'actions');
        setColumnOrder([...cleanOrder, 'actions']);
      }
    }
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (data) setProducts(data)
    setEdits({})
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

  const fetchHistory = async (product: Product) => {
    const { data } = await supabase.from('price_history').select('*').eq('product_id', product.id).order('created_at', { ascending: false })
    setHistoryModal({ isOpen: true, product, data: data || [] })
  }

  // --- IMPORT NEW STOCK LOGIC (Wholesale) ---
  const handleImportStock = async () => {
    if (!importModal.product) return;
    
    const qtyToAdd = Number(importModal.add_qty) || 0;
    const nCost = Number(importModal.new_cost) || 0;
    const nPrice = Number(importModal.new_price) || 0;

    if (qtyToAdd <= 0) return alert('Please enter a valid quantity to import.');

    const newTotalStock = Number(importModal.product.stock) + qtyToAdd;

    const { error: prodErr } = await supabase.from('products').update({ 
      stock: newTotalStock, 
      cost_price: nCost, 
      price: nPrice 
    }).eq('id', importModal.product.id);

    if (prodErr) return alert(`Error updating product: ${prodErr.message}`);

    await supabase.from('price_history').insert([{
      product_id: importModal.product.id,
      cost_price: nCost,
      price: nPrice,
      imported_qty: qtyToAdd 
    }]);

    setImportModal({ isOpen: false, product: null, add_qty: '', new_cost: '', new_price: '' });
    fetchProducts();
  }

  const openImportModal = (product: Product) => {
    setImportModal({
      isOpen: true,
      product: product,
      add_qty: '',
      new_cost: product.cost_price,
      new_price: product.price
    });
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

    // VERCEL FIX: Added 'actions' to the allowed type array here so the if check passes!
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

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">🌾 Rice Inventory</h1>
        <div className="header-actions">
          {selectedToDelete.size > 0 && (
            <button className="delete-btn" onClick={handleDelete}>
              Delete ({selectedToDelete.size})
            </button>
          )}
          <button className="add-btn" onClick={() => setIsAddModalOpen(true)}>
            + Add Product
          </button>
        </div>
      </div>

      {/* TOOLBAR & TABS */}
      <div className="toolbar-container">
        <div className="toolbar-tabs">
          <button className={activeView === 'retail' ? 'tab active' : 'tab'} onClick={() => { setActiveView('retail'); setActiveCategory('All'); }}>🛍️ Retail (1kg)</button>
          <button className={activeView === 'wholesale' ? 'tab active' : 'tab'} onClick={() => setActiveView('wholesale')}>🌾 Wholesale (50kg)</button>
        </div>
        
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

      {/* MAIN SPREADSHEET */}
      <div className="table-wrapper">
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              
              {/* Dynamic Draggable Headers */}
              {columnOrder.map(key => {
                if ((key === 'linked_wholesale' || key === 'mtd_kg_used' || key === 'mtd_bags_used') && activeView !== 'retail') return null; // Hide from wholesale view
                if (key === 'actions' && activeView !== 'wholesale') return null; // Hide actions from retail view
                
                const isDraggable = key !== 'actions' && key !== 'linked_wholesale';

                return (
                  <th 
                    key={key} 
                    draggable={isDraggable}
                    onDragStart={(e) => handleDragStart(e, key)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, key)}
                    onClick={() => handleSort(key)}
                    style={{ 
                      width: columnWidths[key] || 150, 
                      position: 'relative', 
                      padding: '16px 12px', 
                      textAlign: key === 'actions' ? 'center' : 'left', 
                      color: '#475569', 
                      fontSize: '13px', 
                      textTransform: 'uppercase', 
                      fontWeight: 'bold', 
                      borderRight: '1px solid #f1f5f9', 
                      cursor: isDraggable ? 'pointer' : 'default', 
                      whiteSpace: 'nowrap' 
                    }}
                    title={isDraggable ? "Click to Sort, Drag to Reorder" : ""}
                  >
                    {key === 'linked_wholesale' ? 'Linked Wholesale Bag' : 
                     key === 'mtd_kg_used' ? 'MTD Used (Kg)' : 
                     key === 'mtd_bags_used' ? 'MTD Used (Bags)' : 
                     key.replace('_', ' ')}
                    
                    {isDraggable && (
                      <span style={{ marginLeft: '6px', fontSize: '12px', opacity: sortConfig?.key === key ? 1 : 0.3 }}>
                        {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    )}
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
                  
                  {/* Dynamic Data Cells */}
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
                                <button onClick={() => openImportModal(p)} style={{ color: '#fff', background: '#3b82f6', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                  📦 Import
                                </button>
                                <button onClick={() => fetchHistory(p)} style={{ color: '#ca8a04', background: '#fef3c7', border: '1px solid #fde047', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                  🕒 History
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )
                    }

                    const isIdCol = col === 'id';
                    const isEditing = editingCell?.id === p.id && editingCell?.col === col;
                    const val = edits[p.id]?.[col as keyof Product] ?? p[col as keyof Product] ?? '';

                    // CUSTOM RENDERING FOR INTERACTIVE DROPDOWN COLUMN
                    if (col === 'linked_wholesale') {
                      const linkedProduct = products.find(wp => wp.id === p.linked_wholesale_id);
                      const isDropdownOpen = activeDropdownId === p.id;

                      return (
                        <td key={col} style={{ borderRight: '1px solid #f1f5f9', position: 'relative', padding: '6px 12px', overflow: 'visible' }}>
                          {isDropdownOpen ? (
                            <div style={{ position: 'relative', zIndex: 100 }}>
                              <input 
                                autoFocus
                                className="dropdown-search-input"
                                placeholder="Search 50kg bag..."
                                value={dropdownSearch}
                                onChange={e => setDropdownSearch(e.target.value)}
                                onBlur={() => setTimeout(() => setActiveDropdownId(null), 200)} // delay to allow clicks
                                onKeyDown={e => e.key === 'Escape' && setActiveDropdownId(null)}
                              />
                              <div className="dropdown-results-tray">
                                <div className="dropdown-row clear-option" onMouseDown={() => handleLinkWholesaleBag(p.id, null)}>
                                  ❌ Clear Linked Bag
                                </div>
                                {products
                                  .filter(wp => wp.weight >= 50 && wp.name.toLowerCase().includes(dropdownSearch.toLowerCase()))
                                  .map(wp => (
                                    <div key={wp.id} className="dropdown-row" onMouseDown={() => handleLinkWholesaleBag(p.id, wp)}>
                                      <span style={{ fontWeight: 'bold' }}>{wp.name}</span>
                                      <span style={{ fontSize: '11px', color: '#64748b' }}> ({formatRiel(wp.cost_price)})</span>
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="interactive-select-trigger"
                              onClick={() => { setActiveDropdownId(p.id); setDropdownSearch(''); }}
                            >
                              {linkedProduct ? `🌾 ${linkedProduct.name}` : '🔍 Click to link 50kg Bag...'}
                            </div>
                          )}
                        </td>
                      )
                    }

                    return (
                      <td key={col} className={isEditing ? 'cell-editing' : ''} style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative', padding: 0 }}>
                        
                        {/* Hover Checkbox */}
                        {isIdCol && (hoveredId === p.id || selectedToDelete.has(p.id)) && (
                          <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', zIndex: 25, background: edits[p.id] ? '#fefcf3' : '#fff', paddingRight: '4px' }}>
                            <input type="checkbox" checked={selectedToDelete.has(p.id)} onChange={() => {
                              const next = new Set(selectedToDelete)
                              next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                              setSelectedToDelete(next)
                            }} style={{ cursor: 'pointer', width: '18px', height: '18px', margin: 0, accentColor: '#b58a3d' }} />
                          </div>
                        )}
                        
                        {/* Display vs Edit Transform */}
                        {isEditing ? (
                          <input 
                            autoFocus
                            type={['name'].includes(col as string) ? 'text' : 'number'}
                            className="cell-input no-spinners"
                            style={{ paddingLeft: isIdCol ? '36px' : '12px' }}
                            value={val as any}
                            onChange={(e) => {
                              const newVal = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                              setEdits(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), [col]: newVal } }))
                            }}
                            onBlur={() => handleSaveRecord(p.id)}
                            onKeyDown={(e) => { 
                              if (e.key === 'Enter') e.currentTarget.blur(); 
                              if (e.key === 'Escape') {
                                setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n });
                                setEditingCell(null);
                              }
                            }}
                          />
                        ) : (
                          <div 
                            className="cell-display"
                            style={{ 
                              paddingLeft: isIdCol ? '36px' : '12px', 
                              fontWeight: col === 'name' ? 'bold' : 'normal', 
                              color: col === 'name' ? '#1e293b' : (['mtd_kg_used', 'mtd_bags_used'].includes(col) ? '#b58a3d' : '#334155'),
                              cursor: ['mtd_kg_used', 'mtd_bags_used'].includes(col) ? 'default' : 'text'
                            }}
                            onClick={() => {
                              if (!['mtd_kg_used', 'mtd_bags_used'].includes(col)) {
                                setEditingCell({ id: p.id, col: col as string })
                              }
                            }}
                          >
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

      {/* === MODALS === */}

      {/* 1. IMPORT STOCK MODAL (WHOLESALE ONLY) */}
      {importModal.isOpen && importModal.product && (
        <div className="modal-overlay" onMouseDown={() => setImportModal({ isOpen: false, product: null, add_qty: '', new_cost: '', new_price: '' })}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', color: '#1e293b' }}>📦 Import Stock</h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#64748b' }}>Adding stock for: <b>{importModal.product.name}</b></p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Quantity to Add (Bags)</label>
                <input autoFocus type="number" className="no-spinners" placeholder="0" value={importModal.add_qty} onChange={e => setImportModal({...importModal, add_qty: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>New Bag Cost (៛)</label>
                  <input type="number" className="no-spinners" value={importModal.new_cost} onChange={e => setImportModal({...importModal, new_cost: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>New Selling Price (៛)</label>
                  <input type="number" className="no-spinners" value={importModal.new_price} onChange={e => setImportModal({...importModal, new_price: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setImportModal({ isOpen: false, product: null, add_qty: '', new_cost: '', new_price: '' })} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleImportStock} disabled={!importModal.add_qty} style={{ padding: '10px 16px', background: importModal.add_qty ? '#3b82f6' : '#94a3b8', color: '#fff', border: 'none', borderRadius: '6px', cursor: importModal.add_qty ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px' }}>Save Import</button>
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
                  {DEFAULT_ORDER.filter(o => o !== 'linked_wholesale' && o !== 'actions').map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
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

      {/* 3. PRICE HISTORY MODAL */}
      {historyModal.isOpen && historyModal.product && (
        <div className="modal-overlay" onMouseDown={() => setHistoryModal({ isOpen: false, product: null, data: [] })}>
          <div className="modal-content" onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px' }}>Import & Price History</h2>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>Tracking: <b style={{ color: '#0f172a' }}>{historyModal.product.name}</b></p>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false, product: null, data: [] })} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', maxHeight: '60vh' }}>
              {historyModal.data.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>No history recorded yet.</p>
              ) : (
                historyModal.data.map((h) => (
                  <div key={h.id} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      {h.imported_qty && <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '4px' }}>📦 Imported: {h.imported_qty}</div>}
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>Selling: <span style={{ color: '#b58a3d' }}>{formatRiel(h.price)}</span></div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>Cost: {formatRiel(h.cost_price || 0)}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right', fontWeight: 'bold' }}>
                      {new Date(h.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. ADD PRODUCT MODAL */}
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
          flex-wrap: wrap;
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