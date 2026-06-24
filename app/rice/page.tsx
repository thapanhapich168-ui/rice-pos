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

// Default widths for the resizable columns
const DEFAULT_WIDTHS: Record<string, number> = {
  checkbox: 50,
  id: 70,
  name: 200,
  price: 120,
  cost_price: 120,
  stock: 100,
  weight: 100,
  actions: 160
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
  // Default numbers to empty strings so the form is completely blank initially
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
    
    // Convert string inputs back to numbers for database
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
    // Support both mouse and touch events
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
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#cbd5e1')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    />
  )

  return (
    <div className="main-wrapper" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'Arial, sans-serif', color: '#333', boxSizing: 'border-box' }}>
      
      {/* HEADER */}
      <div className="header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#4a3b1b', margin: 0 }}>🌾 Rice Inventory</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {selectedToDelete.size > 0 && (
            <button onClick={handleDelete} style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
              Delete ({selectedToDelete.size})
            </button>
          )}
          <button onClick={() => setIsAddModalOpen(true)} style={{ padding: '10px 20px', background: '#b58a3d', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', flex: 1, whiteSpace: 'nowrap' }}>
            + Add Product
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('retail')} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: activeTab === 'retail' ? '#f1f5f9' : 'transparent', fontWeight: 'bold', color: activeTab === 'retail' ? '#b58a3d' : '#64748b', cursor: 'pointer' }}>Retail (1kg)</button>
        <button onClick={() => setActiveTab('wholesale')} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: activeTab === 'wholesale' ? '#f1f5f9' : 'transparent', fontWeight: 'bold', color: activeTab === 'wholesale' ? '#b58a3d' : '#64748b', cursor: 'pointer' }}>Wholesale (50kg)</button>
        
        <div className="mobile-hidden" style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 10px' }}></div>
        
        <input placeholder="🔍 Quick search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '4px', flex: '1 1 200px', outline: 'none' }} />
        
        <div style={{ display: 'flex', gap: '10px', flex: '1 1 100%' }}>
          <button onClick={() => setIsFilterOpen(true)} style={{ flex: 1, padding: '8px 16px', background: filterRules.length > 0 ? '#eff6ff' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: filterRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}>
            Y Filter {filterRules.length > 0 && `(${filterRules.length})`}
          </button>
          <button onClick={() => setIsSortOpen(true)} style={{ flex: 1, padding: '8px 16px', background: sortRules.length > 0 ? '#eff6ff' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: sortRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}>
            ⇅ Sort {sortRules.length > 0 && `(${sortRules.length})`}
          </button>
        </div>
      </div>

      {/* MAIN SPREADSHEET */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1b4d3e', fontSize: '18px' }}>Price Mutation History</h2>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '14px' }}>Tracking: <b>{historyModal.product.name}</b></p>
              </div>
              <button onClick={() => setHistoryModal({ isOpen: false, product: null, data: [] })} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
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
        /* Remove Number Spinners globally for this component */
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
          .main-wrapper {
            padding: 16px !important;
          }
          .mobile-hidden {
            display: none !important;
          }
          .header-container {
            flex-direction: column;
            align-items: stretch !important;
          }
        }
      `}</style>
    </div>
  )
}