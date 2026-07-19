'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

// --- TYPES ---
interface Customer {
  id: string;
  name: string;
  owner: string;
  type: string;
  phone: string;
  location: string;
  google_map: string;
  created_at: string;
  last_purchase_date: string;
  days_since_last_purchase?: number | null; 
}

type SortConfig = {
  key: keyof Customer;
  direction: 'asc' | 'desc';
} | null;

const DEFAULT_WIDTHS: Record<string, number> = {
  created_at: 120,
  id: 280,
  name: 240, 
  owner: 120,
  type: 120,
  phone: 150,
  location: 200,
  google_map: 120,
  last_purchase_date: 150,
  days_since_last_purchase: 160 
}

const DEFAULT_ORDER: Array<keyof Customer> = [
  'created_at', 'name', 'phone', 'location', 'type', 'owner', 'google_map', 'last_purchase_date', 'days_since_last_purchase', 'id'
]

export default function CustomerDatabasePage() {
  // --- CORE STATE ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [edits, setEdits] = useState<Record<string, Partial<Customer>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // --- CELL EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: string, col: string} | null>(null)

  // --- FILTER & SORT STATE ---
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('All')
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // --- COLUMN PREFERENCE STATE ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [columnOrder, setColumnOrder] = useState<Array<keyof Customer>>(DEFAULT_ORDER)
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- MODALS ---
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '', owner: 'Both', type: 'ហូប', phone: '', location: '', google_map: ''
  })

  // --- LIFECYCLE ---
  useEffect(() => {
    loadCustomers()
    fetchSettings()
  }, [])

  useFocusRefresh(loadCustomers);

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['cust_col_widths', 'cust_col_order'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'cust_col_widths')
      const order = data.find(d => d.setting_key === 'cust_col_order')
      
      if (widths && widths.setting_value) {
        setColumnWidths({ ...DEFAULT_WIDTHS, ...widths.setting_value })
      }
      if (order && order.setting_value) {
        const savedOrder = order.setting_value as Array<keyof Customer>;
        if (!savedOrder.includes('days_since_last_purchase')) {
          savedOrder.splice(savedOrder.indexOf('last_purchase_date') + 1, 0, 'days_since_last_purchase');
        }
        setColumnOrder(savedOrder)
      }
    }
  }

  async function loadCustomers() {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (!error && data) {
      setCustomers(data)
      setEdits({})
    }
  }

  // --- RECORD OPERATIONS ---
  const handleSaveRecord = async (id: string) => {
    if (!edits[id]) return;
    
    if (edits[id].name !== undefined && edits[id].name?.trim() === '') {
      alert("❌ Customer Name cannot be empty.");
      return;
    }

    const { error } = await supabase.from('customers').update(edits[id]).eq('id', id)
    if (!error) {
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditingCell(null)
      loadCustomers()
    } else {
      alert(`Error saving: ${error.message}`)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedToDelete.size} customer(s)?`)) return
    const { error } = await supabase.from('customers').delete().in('id', Array.from(selectedToDelete))
    if (!error) { 
      setSelectedToDelete(new Set()); 
      loadCustomers() 
    } else {
      alert(`❌ Cannot delete customer: ${error.message}\n\nMake sure you ran the SQL script if they have past orders!`)
    }
  }

  const handleDeleteSingle = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete: ${name}?`)) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (!error) { 
      loadCustomers() 
    } else {
      alert(`❌ Cannot delete ${name}: ${error.message}\n\nMake sure you ran the SQL script if they have past orders!`)
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!newCustomer.name.trim()) return

    const { error } = await supabase.from('customers').insert([{
      name: newCustomer.name, owner: newCustomer.owner, type: newCustomer.type, 
      phone: newCustomer.phone, location: newCustomer.location, google_map: newCustomer.google_map
    }])

    if (!error) {
      setShowAddModal(false)
      setNewCustomer({ name: '', owner: 'Both', type: 'ហូប', phone: '', location: '', google_map: '' })
      loadCustomers() 
    } else {
      alert(`Error: ${error.message}`)
    }
  }

  // --- COLUMN DRAG & DROP LOGIC ---
  const handleDragStart = (e: React.DragEvent, col: string) => {
    e.dataTransfer.setData('text/plain', col)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    const sourceCol = e.dataTransfer.getData('text/plain') as keyof Customer
    if (!sourceCol || sourceCol === targetCol) return

    setColumnOrder(prev => {
      const newOrder = prev.filter(c => c !== sourceCol)
      const targetIdx = newOrder.indexOf(targetCol as keyof Customer)
      newOrder.splice(targetIdx, 0, sourceCol)
      
      supabase.from('app_settings').upsert({ setting_key: 'cust_col_order', setting_value: newOrder }, { onConflict: 'setting_key' }).then()
      return newOrder
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
      const newWidth = Math.max(60, startWidth + (currentX - startX))
      setColumnWidths(prev => ({ ...prev, [columnKey]: newWidth }))
    }

    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleUp)
      
      await supabase.from('app_settings').upsert({ setting_key: 'cust_col_widths', setting_value: widthsRef.current }, { onConflict: 'setting_key' })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchmove', handleMove)
    document.addEventListener('touchend', handleUp)
  }

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  // --- DATA PROCESSING ---
  const now = new Date().getTime(); 

  const processedCustomers = customers
    .map(c => {
      const merged = { ...c, ...edits[c.id] };
      
      let daysSince = null;
      if (merged.last_purchase_date) {
        const diffTime = now - new Date(merged.last_purchase_date).getTime();
        daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (daysSince < 0) daysSince = 0; 
      }
      
      return { ...merged, days_since_last_purchase: daysSince };
    })
    .filter(c => {
      if (customerTypeFilter !== 'All' && c.type !== customerTypeFilter) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.location?.toLowerCase().includes(q)
        )
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      
      let valA = a[key];
      let valB = b[key];

      if (valA === null || valA === undefined || valA === '') return 1;
      if (valB === null || valB === undefined || valB === '') return -1;

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    })

  // --- FORMATTERS ---
  const formatHeader = (key: string) => {
    if (key === 'id') return 'ID';
    if (key === 'google_map') return 'Map Link';
    if (key === 'days_since_last_purchase') return 'Days Since Last Order';
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  const formatDisplayValue = (col: string, val: any) => {
    if (val === null || val === undefined || val === '') {
      if (col === 'days_since_last_purchase') return 'No purchases';
      return '—';
    }
    
    if (col === 'created_at' || col === 'last_purchase_date') {
      return new Date(val).toLocaleDateString('en-GB');
    }
    
    if (col === 'days_since_last_purchase') {
      if (val === 0) return 'Today';
      
      const totalDays = Number(val);
      const years = Math.floor(totalDays / 365);
      const remDays = totalDays % 365;
      const months = Math.floor(remDays / 30);
      const days = remDays % 30;

      const parts = [];
      if (years > 0) parts.push(`${years}Y`);
      if (months > 0) parts.push(`${months}M`);
      if (days > 0) parts.push(`${days}D`);

      if (parts.length === 0) return 'Today';
      return parts.join(' '); 
    }

    return String(val);
  }

  const isReadOnly = (col: string) => ['id', 'created_at', 'last_purchase_date', 'days_since_last_purchase'].includes(col);

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
        <div className="header-left">
          <h1 className="page-title">🧑‍🌾 Customer Database</h1>
        </div>

        <div className="header-actions">
          {selectedToDelete.size > 0 && (
            <button className="delete-btn" onClick={handleDelete}>
              Delete ({selectedToDelete.size})
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-container">
        <input 
          className="toolbar-search" 
          placeholder="🔍 Search by name, phone, or location..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button className="add-btn-inline" onClick={() => setShowAddModal(true)}>
          <span style={{ color: '#10b981', fontSize: '16px', marginRight: '4px', fontWeight: 'bold' }}>+</span>
          Add Customer
        </button>
      </div>

      {/* FILTER SEGMENTS */}
      <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '16px', marginBottom: '8px' }}>
        <button 
          onClick={() => setCustomerTypeFilter('All')} 
          style={{ padding: '8px 16px', borderRadius: '20px', border: customerTypeFilter === 'All' ? 'none' : '1px solid #cbd5e1', backgroundColor: customerTypeFilter === 'All' ? '#b58a3d' : '#ffffff', color: customerTypeFilter === 'All' ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
        >
          All Types ({customers.length})
        </button>
        {(['ហូប', 'លក់បាយ', 'លក់ត', 'ធ្វើនំ', 'អំណោយ'] as const).map(typeItem => {
          const count = customers.filter(c => c.type === typeItem).length;
          return (
            <button 
              key={typeItem} 
              onClick={() => setCustomerTypeFilter(typeItem)} 
              style={{ padding: '8px 16px', borderRadius: '20px', border: customerTypeFilter === typeItem ? 'none' : '1px solid #cbd5e1', backgroundColor: customerTypeFilter === typeItem ? '#b58a3d' : '#ffffff', color: customerTypeFilter === typeItem ? '#fff' : '#475569', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              🏷️ {typeItem} ({count})
            </button>
          )
        })}
      </div>

      {/* SPREADSHEET TABLE */}
      <div className="table-wrapper">
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              
              {/* 🔥 NEW: Dedicated Checkbox Header Column */}
              <th style={{ width: '46px', minWidth: '46px', maxWidth: '46px', padding: '16px 8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                 <input 
                   type="checkbox" 
                   checked={selectedToDelete.size === processedCustomers.length && processedCustomers.length > 0}
                   onChange={(e) => {
                     if (e.target.checked) setSelectedToDelete(new Set(processedCustomers.map(c => c.id)));
                     else setSelectedToDelete(new Set());
                   }}
                   style={{ cursor: 'pointer', accentColor: '#b58a3d', width: '16px', height: '16px' }}
                 />
              </th>

              {columnOrder.map(key => (
                <th 
                  key={key} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, key)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, key)}
                  onClick={() => handleSort(key)}
                  style={{ 
                    width: columnWidths[key] || 150, 
                    position: 'relative', 
                    padding: '16px 12px', 
                    textAlign: 'left', 
                    color: '#475569', 
                    fontSize: '13px', 
                    textTransform: 'uppercase', 
                    fontWeight: 'bold', 
                    borderRight: '1px solid #f1f5f9', 
                    cursor: 'pointer', 
                    whiteSpace: 'nowrap' 
                  }}
                  title="Click to Sort, Drag to Reorder"
                >
                  {formatHeader(key)}
                  <span style={{ marginLeft: '6px', fontSize: '12px', opacity: sortConfig?.key === key ? 1 : 0.3 }}>
                    {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                  <Resizer columnKey={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedCustomers.length === 0 ? (
              <tr><td colSpan={columnOrder.length + 1} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No customers found.</td></tr>
            ) : (
              processedCustomers.map(c => (
                <tr key={c.id} onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)} style={{ borderBottom: '1px solid #f1f5f9', background: edits[c.id] ? '#fefcf3' : 'transparent', transition: 'background 0.2s' }}>
                  
                  {/* 🔥 NEW: Dedicated Checkbox Row Column */}
                  <td style={{ width: '46px', padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f5f9', background: edits[c.id] ? '#fefcf3' : 'transparent' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedToDelete.has(c.id)}
                      onChange={() => {
                        const next = new Set(selectedToDelete)
                        next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                        setSelectedToDelete(next)
                      }} 
                      style={{ cursor: 'pointer', width: '16px', height: '16px', margin: 0, accentColor: '#b58a3d' }} 
                    />
                  </td>

                  {columnOrder.map(col => {
                    const isNameCol = col === 'name';
                    const editing = editingCell?.id === c.id && editingCell?.col === col;
                    const val = edits[c.id]?.[col] ?? (c as any)[col] ?? '';
                    const readOnly = isReadOnly(col);

                    return (
                      <td key={col} className={editing ? 'cell-editing' : ''} style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative', padding: 0 }}>
                        
                        {/* Input Transform */}
                        {editing && !readOnly ? (
                          col === 'owner' ? (
                            <select 
                              autoFocus 
                              className="cell-input" 
                              value={val} 
                              onChange={(e) => setEdits(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [col]: e.target.value } }))}
                              onBlur={() => handleSaveRecord(c.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null); }}
                            >
                              <option value="Both">Both</option>
                              <option value="Jing">Jing</option>
                              <option value="Pich">Pich</option>
                              <option value="Mom">Mom</option>
                            </select>
                          ) : col === 'type' ? (
                            <select 
                              autoFocus 
                              className="cell-input" 
                              value={val} 
                              onChange={(e) => setEdits(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [col]: e.target.value } }))}
                              onBlur={() => handleSaveRecord(c.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingCell(null); }}
                            >
                              <option value="ហូប">ហូប</option>
                              <option value="លក់បាយ">លក់បាយ</option>
                              <option value="លក់ត">លក់ត</option>
                              <option value="ធ្វើនំ">ធ្វើនំ</option>
                              <option value="អំណោយ">អំណោយ</option>
                            </select>
                          ) : (
                            <input 
                              autoFocus
                              type="text"
                              className="cell-input"
                              style={{ paddingLeft: '12px' }}
                              value={val}
                              onChange={(e) => setEdits(prev => ({ ...prev, [c.id]: { ...(prev[c.id] || {}), [col]: e.target.value } }))}
                              onBlur={() => handleSaveRecord(c.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEdits(prev => { const n = { ...prev }; delete n[c.id]; return n }); setEditingCell(null); } }}
                            />
                          )
                        ) : (
                          <div 
                            className="cell-display"
                            style={{ 
                              paddingLeft: '12px', 
                              fontWeight: isNameCol || col === 'days_since_last_purchase' ? 'bold' : 'normal', 
                              color: isNameCol ? '#1e293b' : col === 'days_since_last_purchase' ? '#b58a3d' : readOnly ? '#94a3b8' : '#334155',
                              cursor: readOnly ? 'default' : 'text',
                              fontFamily: col === 'id' ? 'monospace' : 'inherit',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%',
                              boxSizing: 'border-box'
                            }}
                            onClick={() => !readOnly && setEditingCell({ id: c.id, col: col as string })}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {col === 'google_map' && val ? (
                                <a href={val} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }} onClick={e => e.stopPropagation()}>🗺️ Open Map</a>
                              ) : (
                                formatDisplayValue(col as string, val)
                              )}
                            </span>

                            {/* 🔥 NEW: Inline Single Delete Button visible on Hover */}
                            {isNameCol && hoveredId === c.id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingCell(null); handleDeleteSingle(c.id, c.name); }}
                                style={{ 
                                  background: '#fee2e2', border: 'none', borderRadius: '4px', 
                                  cursor: 'pointer', padding: '4px 8px', fontSize: '11px', color: '#ef4444', 
                                  fontWeight: 'bold', marginLeft: '8px', zIndex: 30
                                }}
                                title="Delete Customer"
                              >
                                🗑️ Delete
                              </button>
                            )}
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

      {/* --- ADD CUSTOMER MODAL --- */}
      {showAddModal && (
        <div className="modal-overlay" onMouseDown={() => setShowAddModal(false)}>
          <form onSubmit={handleAddCustomer} className="modal-content" style={{ maxWidth: '460px' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b' }}>👤 Add New Customer</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Customer Full Name *</label>
                <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} required />
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Account Owner</label>
                  <select value={newCustomer.owner} onChange={(e) => setNewCustomer({ ...newCustomer, owner: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="Both">Both</option>
                    <option value="Jing">Jing</option>
                    <option value="Pich">Pich</option>
                    <option value="Mom">Mom</option>
                  </select>
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Customer Type</label>
                  <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }}>
                    <option value="ហូប">ហូប</option>
                    <option value="លក់បាយ">លក់បាយ</option>
                    <option value="លក់ត">លក់ត</option>
                    <option value="ធ្វើនំ">ធ្វើនំ</option>
                    <option value="អំណោយ">អំណោយ</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Phone Number</label>
                <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="e.g. 012 345 678" style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Location</label>
                <input type="text" value={newCustomer.location} onChange={(e) => setNewCustomer({ ...newCustomer, location: e.target.value })} placeholder="Phnom Penh" style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginBottom: '6px' }}>Google Map URL Link</label>
                <input type="url" value={newCustomer.google_map} onChange={(e) => setNewCustomer({ ...newCustomer, google_map: e.target.value })} placeholder="https://maps.google.com/..." style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }} />
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button type="submit" style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Save Customer</button>
            </div>
          </form>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        /* 🔥 DESKTOP LAYOUT FIXES (EXACT DASHBOARD CSS) */
        .main-wrapper {
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          width: 100%;
          height: 100dvh; 
          overflow-y: auto; 
          -webkit-overflow-scrolling: touch;
        }

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* 🔥 Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          min-height: 42px; 
          width: 100%;
          max-width: 1600px;
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

        /* 🔥 FIX: Wraps the button securely inside the screen width WITHOUT touching .header-container */
        .header-actions {
          display: flex;
          gap: 10px;
          margin-left: auto;
          padding-right: 60px; 
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
        
        .toolbar-container {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          background: #fff;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          align-items: center;
          flex-wrap: nowrap; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        
        .toolbar-search {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          flex: 1;
          min-width: 0; 
          outline: none;
          font-size: 16px;
          color: #0f172a;
          background-color: #ffffff;
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
        .add-btn-inline:hover {
          background: #dcfce7;
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
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }

        /* 🔥 MOBILE LAYOUT FIXES (EXACT DASHBOARD CSS) */
        @media (max-width: 1023px) {
          .main-wrapper {
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .header-container { 
            margin-left: 54px !important; /* Clears mobile hamburger button safely */
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

          .header-actions {
            margin-left: auto;
            padding-right: 0px; /* Reset on mobile because calc() handles the width perfectly */
          }
          
          .delete-btn {
            padding: 8px 12px;
            font-size: 13px;
          }

          .toolbar-container {
            flex-direction: row; 
            align-items: center;
            padding: 12px 16px;
          }
          .toolbar-search {
            width: 100%;
            box-sizing: border-box;
          }
          .add-btn-inline {
            padding: 10px 12px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  )
}