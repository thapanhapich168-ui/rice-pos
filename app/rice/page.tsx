'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- TYPES ---
interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
}

interface HistoryRecord {
  id: number
  product_id: number
  price: number
  cost_price: number
  created_at: string
}

type SortDirection = 'asc' | 'desc'
interface SortRule {
  id: number
  column: keyof Product
  direction: SortDirection
}

type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt'
interface FilterRule {
  id: number
  column: keyof Product
  operator: FilterOperator
  value: string | number
}

const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 50,
  id: 60,
  name: 180,
  price: 110,
  cost_price: 110,
  stock: 90,
  weight: 90,
  actions: 140
}

export default function RiceControl() {
  // --- CORE STATE ---
  const [products, setProducts] = useState<Product[]>([])
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [searchQuery, setSearchQuery] = useState('')
  const [edits, setEdits] = useState<Record<number, Partial<Product>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<number>>(new Set())
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  // --- COLUMN RESIZE STATE ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- MODAL STATES ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', price: '' as any, cost_price: '' as any, weight: '' as any, stock: '' as any })

  const [isSortOpen, setIsSortOpen] = useState(false)
  const [sortRules, setSortRules] = useState<SortRule[]>([])

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])

  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; product: Product | null; data: HistoryRecord[] }>({
    isOpen: false, product: null, data: []
  })

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchProducts()
    fetchSettings()
  }, [])

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'column_widths').single()
    if (data && data.setting_value) {
      setColumnWidths(data.setting_value)
    }
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (data) setProducts(data)
    setEdits({})
  }

  const handleSave = async (id: number) => {
    const { error } = await supabase.from('products').update(edits[id]).eq('id', id)
    if (!error) {
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
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
      stock: Number(newItem.stock) || 0
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

  // --- COLUMN RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    e.preventDefault()
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX
    const startWidth = widthsRef.current[columnKey]

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX
      const newWidth = Math.max(50, startWidth + (currentX - startX))
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

  // --- DATA PROCESSING ---
  const processedProducts = products
    .map(p => ({ ...p, ...edits[p.id] }))
    .filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTab = activeTab === 'retail' ? p.weight < 50 : p.weight >= 50
      if (!matchesSearch || !matchesTab) return false

      for (const rule of filterRules) {
        if (!rule.value && rule.value !== 0) continue
        const val = p[rule.column]
        const checkVal = String(rule.value).toLowerCase()
        
        if (rule.operator === 'contains' && !String(val).toLowerCase().includes(checkVal)) return false
        if (rule.operator === 'equals' && String(val).toLowerCase() !== checkVal) return false
        if (rule.operator === 'gt' && Number(val) <= Number(rule.value)) return false
        if (rule.operator === 'lt' && Number(val) >= Number(rule.value)) return false
      }
      return true
    })
    .sort((a, b) => {
      for (const rule of sortRules) {
        const valA = a[rule.column]
        const valB = b[rule.column]
        if (valA < valB) return rule.direction === 'asc' ? -1 : 1
        if (valA > valB) return rule.direction === 'asc' ? 1 : -1
      }
      return 0
    })

  // --- HELPERS ---
  const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`
  const columns: Array<keyof Product> = ['id', 'name', 'price', 'cost_price', 'stock', 'weight']

  // --- REUSABLE COMPONENTS ---
  const Cell = ({ id, field, value, type = "text" }: { id: number, field: keyof Product, value: any, type?: string }) => (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value } }))}
      className="no-spinners"
      style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', outline: 'none', color: '#333', boxSizing: 'border-box', fontSize: '14px' }}
      onFocus={(e) => e.target.style.background = '#f0f9ff'}
      onBlur={(e) => e.target.style.background = 'transparent'}
    />
  )

  const Resizer = ({ columnKey }: { columnKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStart(e, columnKey)}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '12px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }}
    />
  )

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">Rice Inventory</h1>
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

      {/* TOOLBAR */}
      <div className="toolbar-container">
        <div className="toolbar-tabs">
          <button className={activeTab === 'retail' ? 'tab active' : 'tab'} onClick={() => setActiveTab('retail')}>Retail (1kg)</button>
          <button className={activeTab === 'wholesale' ? 'tab active' : 'tab'} onClick={() => setActiveTab('wholesale')}>Wholesale (50kg)</button>
        </div>
        
        <input className="toolbar-search" placeholder="🔍 Quick search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        
        <div className="toolbar-filters">
          <button className="filter-btn" onClick={() => setIsFilterOpen(true)} style={{ color: filterRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}>
            Y Filter {filterRules.length > 0 && `(${filterRules.length})`}
          </button>
          <button className="sort-btn" onClick={() => setIsSortOpen(true)} style={{ color: sortRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}>
            ⇅ Sort {sortRules.length > 0 && `(${sortRules.length})`}
          </button>
        </div>
      </div>

      {/* MAIN SPREADSHEET */}
      <div className="table-wrapper">
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              
              <th style={{ width: columnWidths.checkbox, position: 'relative', padding: '14px 12px' }}>
                <Resizer columnKey="checkbox" />
              </th>
              
              {['id', 'name', 'price', 'cost_price', 'stock', 'weight'].map(key => (
                <th key={key} style={{ width: columnWidths[key], position: 'relative', padding: '14px 12px', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold', borderRight: '1px solid #f1f5f9' }}>
                  {key.replace('_', ' ')}
                  <Resizer columnKey={key} />
                </th>
              ))}
              
              <th style={{ width: columnWidths.actions, position: 'relative', padding: '14px 12px', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Actions
                <Resizer columnKey="actions" />
              </th>

            </tr>
          </thead>
          <tbody>
            {processedProducts.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No products found.</td></tr>
            ) : (
              processedProducts.map(p => (
                <tr key={p.id} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)} style={{ borderBottom: '1px solid #f1f5f9', background: edits[p.id] ? '#fefcf3' : 'transparent' }}>
                  
                  <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                    {(hoveredId === p.id || selectedToDelete.has(p.id)) && (
                      <input type="checkbox" checked={selectedToDelete.has(p.id)} onChange={() => {
                        const next = new Set(selectedToDelete)
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                        setSelectedToDelete(next)
                      }} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                    )}
                  </td>
                  
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="id" value={p.id} type="number" /></td>
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="name" value={p.name} /></td>
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="price" value={p.price} type="number" /></td>
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="cost_price" value={p.cost_price} type="number" /></td>
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="stock" value={p.stock} type="number" /></td>
                  <td style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden' }}><Cell id={p.id} field="weight" value={p.weight} type="number" /></td>
                  
                  <td style={{ padding: '8px 12px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {edits[p.id] ? (
                        <>
                          <button onClick={() => handleSave(p.id)} style={{ color: '#fff', background: '#10b981', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                          <button onClick={() => setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n })} style={{ color: '#ef4444', background: '#fee2e2', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>Undo</button>
                        </>
                      ) : (
                        <button onClick={() => fetchHistory(p)} style={{ color: '#4a3b1b', background: '#f4f1ea', border: '1px solid #eadeca', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          🕒 History
                        </button>
                      )}
                    </div>
                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* === MODALS === */}

      {/* 1. SORT MODAL */}
      {isSortOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Sort Records</h3>
            
            {sortRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#666', width: '60px' }}>{index === 0 ? 'Sort by' : 'Then by'}</span>
                <select value={rule.column} onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof Product } : r))} style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  {columns.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
                <select value={rule.direction} onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, direction: e.target.value as SortDirection } : r))} style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <option value="asc">A-Z / 1-10 (Asc)</option>
                  <option value="desc">Z-A / 10-1 (Desc)</option>
                </select>
                <button onClick={() => setSortRules(prev => prev.filter(r => r.id !== rule.id))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px', padding: '0 5px' }}>✕</button>
              </div>
            ))}
            
            <button onClick={() => setSortRules(prev => [...prev, { id: Date.now(), column: 'name', direction: 'asc' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ Add sort level</button>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setIsSortOpen(false)} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Apply Sort</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. FILTER MODAL */}
      {isFilterOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Filter Records</h3>
            
            {filterRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#666', width: '40px' }}>{index === 0 ? 'Where' : 'And'}</span>
                <select value={rule.column} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof Product } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  {columns.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
                <select value={rule.operator} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: e.target.value as FilterOperator } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals (=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                </select>
                <input placeholder="Value..." value={rule.value} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))} style={{ flex: '1 1 120px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} className="no-spinners" type={['price', 'cost_price', 'stock', 'weight'].includes(rule.column as string) ? 'number' : 'text'} />
                <button onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
            ))}
            
            <button onClick={() => setFilterRules(prev => [...prev, { id: Date.now(), column: 'name', operator: 'contains', value: '' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ Add condition</button>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setFilterRules([])} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear All</button>
              <button onClick={() => setIsFilterOpen(false)} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Apply Filters</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. PRICE HISTORY MODAL */}
      {historyModal.isOpen && historyModal.product && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1b4d3e', fontSize: '18px' }}>Price Mutation History</h2>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>Tracking: <b>{historyModal.product.name}</b></p>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false, product: null, data: [] })} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px', maxHeight: '50vh' }}>
              {historyModal.data.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>No price variations recorded yet.</p>
              ) : (
                historyModal.data.map((h) => (
                  <div key={h.id} style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #f1f5f9', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>Selling: <span style={{ color: '#b58a3d' }}>{formatRiel(h.price)}</span></div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Base Cost: {formatRiel(h.cost_price || 0)}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'right' }}>
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
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Add New Product</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>Product Name</label>
                <input placeholder="e.g. Jasmine Rice" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>Price (៛)</label>
                  <input type="number" className="no-spinners" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>COGS (៛)</label>
                  <input type="number" className="no-spinners" value={newItem.cost_price} onChange={e => setNewItem({...newItem, cost_price: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>Weight (kg)</label>
                  <input type="number" className="no-spinners" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}>Initial Stock</label>
                  <input type="number" className="no-spinners" value={newItem.stock} onChange={e => setNewItem({...newItem, stock: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setIsAddModalOpen(false)} style={{ padding: '10px 16px', background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={addProduct} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS FOR MOBILE & SPINNERS --- */}
      <style jsx global>{`
        /* Remove Number Spinners globally */
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }

        /* Base Desktop Layout */
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
          gap: 10px;
          margin-bottom: 20px;
          background: #fff;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          align-items: center;
        }
        .toolbar-tabs {
          display: flex;
          gap: 10px;
        }
        .tab {
          padding: 8px 16px;
          border-radius: 4px;
          border: none;
          background: transparent;
          font-weight: bold;
          color: #64748b;
          cursor: pointer;
        }
        .tab.active {
          background: #f1f5f9;
          color: #b58a3d;
        }
        .toolbar-search {
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          flex: 1;
          outline: none;
        }
        .toolbar-filters {
          display: flex;
          gap: 10px;
        }
        .filter-btn, .sort-btn {
          padding: 8px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        }
        .table-wrapper {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
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
          padding: 24px;
          border-radius: 12px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }

        /* Mobile Layout Adjustments */
        @media (max-width: 768px) {
          .main-wrapper {
            padding: 80px 16px 16px 16px; /* Top padding clears the floating sidebar burger */
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
          }
          .toolbar-search {
            width: 100%;
            box-sizing: border-box;
          }
          .toolbar-filters {
            width: 100%;
          }
          .filter-btn, .sort-btn {
            flex: 1;
          }
        }
      `}</style>
    </div>
  )
}