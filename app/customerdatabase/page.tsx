'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { Customer } from '@/types'
import { useToast } from '@/components/ToastProvider'
import { useDebounce } from '@/lib/useDebounce'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'
import Modal from '@/components/Modal'

type SortConfig = {
  key: keyof Customer;
  direction: 'asc' | 'desc';
} | null;

const DEFAULT_WIDTHS: Record<string, number> = {
  created_at: 120, id: 280, name: 240, owner: 120, type: 120,
  phone: 150, location: 200, google_map: 120, last_purchase_date: 150,
  days_since_last_purchase: 160 
}

const DEFAULT_ORDER: Array<keyof Customer> = [
  'created_at', 'name', 'phone', 'location', 'type', 'owner', 'google_map', 'last_purchase_date', 'days_since_last_purchase', 'id'
]

export default function CustomerDatabasePage() {
  const { showToast } = useToast();

  // --- CORE STATE ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300) // 🚀 Lightning fast mobile search
  const [edits, setEdits] = useState<Record<string, Partial<Customer>>>({})
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // --- CELL EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: string, col: string} | null>(null)

  // --- FILTER & SORT STATE ---
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('All')
  const [ownerFilter, setOwnerFilter] = useState<string>('All')
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
    setIsLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      
    if (!error && data) {
      setCustomers(data as Customer[])
      setEdits({})
    }
    setIsLoading(false)
  }

  // --- RECORD OPERATIONS ---
  const handleSaveRecord = async (id: string) => {
    if (!edits[id]) return;
    
    if (edits[id].name !== undefined && edits[id].name?.trim() === '') {
      showToast('error', 'Validation Error', 'Customer Name cannot be empty.');
      return;
    }

    const { error } = await supabase.from('customers').update(edits[id]).eq('id', id)
    if (!error) {
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
      setEditingCell(null)
      showToast('success', 'Saved', 'Customer updated successfully.');
      loadCustomers()
    } else {
      showToast('error', 'Save Failed', error.message);
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to archive ${selectedToDelete.size} customer(s)?`)) return
    
    const { error } = await supabase
      .from('customers')
      .update({ is_archived: true })
      .in('id', Array.from(selectedToDelete))
      
    if (!error) { 
      setSelectedToDelete(new Set()); 
      showToast('success', 'Deleted', 'Customer(s) archived successfully.');
      loadCustomers() 
    } else {
      showToast('error', 'Deletion Failed', error.message);
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
      showToast('success', 'Customer Added', `${newCustomer.name} added successfully.`);
      setNewCustomer({ name: '', owner: 'Both', type: 'ហូប', phone: '', location: '', google_map: '' })
      loadCustomers() 
    } else {
      showToast('error', 'Error', error.message);
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
      const cid = String(c.id);
      const merged = { ...c, ...edits[cid] };
      
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
      if (ownerFilter !== 'All' && c.owner !== ownerFilter) return false;

      // 🚀 Now uses debouncedSearch for huge performance boost on mobile
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
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
          <h1 className="saas-page-title">🧑‍🌾 Customer Database</h1>
        </div>

        <div className="header-actions">
          {selectedToDelete.size > 0 && (
            <button className="saas-btn saas-btn-danger" onClick={handleDelete}>
              Delete ({selectedToDelete.size})
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="saas-card" style={{ padding: '16px', marginBottom: '24px' }}>
        
        {/* Top Row: Search & Add Button */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input 
            className="saas-input" 
            placeholder="🔍 Search by name, phone, or location..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <button className="saas-btn saas-btn-primary" onClick={() => setShowAddModal(true)}>
            <span style={{ fontSize: '16px', marginRight: '4px', fontWeight: 'bold' }}>+</span>
            Add Customer
          </button>
        </div>

        {/* OWNER PRE-FILTERS */}
        <div className="saas-tab-container hide-scrollbar" style={{ border: 'none', padding: 0, boxShadow: 'none', margin: '0 0 12px 0', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <button 
            onClick={() => setOwnerFilter('All')} 
            className={`saas-tab ${ownerFilter === 'All' ? 'active' : ''}`}
          >
            All Owners
          </button>
          {(['Pich', 'Jing', 'Both', 'Mom'] as const).map(ownerItem => {
            const filteredByType = customerTypeFilter === 'All' ? customers : customers.filter(c => c.type === customerTypeFilter);
            const count = filteredByType.filter(c => c.owner === ownerItem).length;
            return (
              <button 
                key={ownerItem} 
                onClick={() => setOwnerFilter(ownerItem)} 
                className={`saas-tab ${ownerFilter === ownerItem ? 'active' : ''}`}
              >
                👤 {ownerItem} ({count})
              </button>
            )
          })}
        </div>

        {/* CUSTOMER TYPE FILTERS */}
        <div className="saas-tab-container hide-scrollbar" style={{ border: 'none', padding: 0, boxShadow: 'none', margin: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
          <button 
            onClick={() => setCustomerTypeFilter('All')} 
            className={`saas-tab ${customerTypeFilter === 'All' ? 'active' : ''}`}
          >
            All Types ({ownerFilter === 'All' ? customers.length : customers.filter(c => c.owner === ownerFilter).length})
          </button>
          {(['ហូប', 'លក់បាយ', 'លក់ត', 'ធ្វើនំ', 'អំណោយ'] as const).map(typeItem => {
            const filteredByOwner = ownerFilter === 'All' ? customers : customers.filter(c => c.owner === ownerFilter);
            const count = filteredByOwner.filter(c => c.type === typeItem).length;
            return (
              <button 
                key={typeItem} 
                onClick={() => setCustomerTypeFilter(typeItem)} 
                className={`saas-tab ${customerTypeFilter === typeItem ? 'active' : ''}`}
              >
                🏷️ {typeItem} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* SPREADSHEET TABLE */}
      <div className="saas-table-wrapper">
        <div className="saas-table-responsive">
          <table className="saas-table" style={{ width: 'max-content', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {/* Checkbox Header Column */}
                <th className="saas-th" style={{ width: '46px', minWidth: '46px', maxWidth: '46px', padding: '16px 8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                   <input 
                     type="checkbox" 
                     checked={selectedToDelete.size === processedCustomers.length && processedCustomers.length > 0}
                     onChange={(e) => {
                       if (e.target.checked) setSelectedToDelete(new Set(processedCustomers.map(c => String(c.id))));
                       else setSelectedToDelete(new Set());
                     }}
                     style={{ cursor: 'pointer', accentColor: '#b58a3d', width: '16px', height: '16px' }}
                   />
                </th>

                {/* 🔥 FIXED NUMBER COLUMN HEADER */}
                <th className="saas-th" style={{ width: '50px', minWidth: '50px', maxWidth: '50px', padding: '16px 8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                  #
                </th>

                {columnOrder.map(key => (
                  <th 
                    key={key} 
                    className="saas-th"
                    draggable 
                    onDragStart={(e) => handleDragStart(e, key as string)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, key as string)}
                    onClick={() => handleSort(key)}
                    style={{ 
                      width: columnWidths[key as string] || 150, 
                      position: 'relative', 
                      borderRight: '1px solid #f1f5f9', 
                      cursor: 'pointer', 
                    }}
                    title="Click to Sort, Drag to Reorder"
                  >
                    {formatHeader(key as string)}
                    <span style={{ marginLeft: '6px', fontSize: '12px', opacity: sortConfig?.key === key ? 1 : 0.3 }}>
                      {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                    <Resizer columnKey={key as string} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <TableSkeleton columns={columnOrder.length + 2} rows={8} />
              ) : processedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={columnOrder.length + 2} style={{ padding: 0 }}>
                    <EmptyState 
                      icon="🔍" 
                      title="No customers found" 
                      message="Try adjusting your search or owner filters." 
                    />
                  </td>
                </tr>
              ) : (
                processedCustomers.map((c, index) => {
                  const cid = String(c.id);
                  return (
                    <tr key={cid} onMouseEnter={() => setHoveredId(cid)} onMouseLeave={() => setHoveredId(null)} className={`saas-tr ${selectedToDelete.has(cid) ? 'selected' : ''} ${edits[cid] ? 'editing' : ''}`}>
                      
                      {/* Checkbox Row Column */}
                      <td className="saas-td" style={{ width: '46px', padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedToDelete.has(cid)}
                          onChange={() => {
                            const next = new Set(selectedToDelete)
                            next.has(cid) ? next.delete(cid) : next.add(cid)
                            setSelectedToDelete(next)
                          }} 
                          style={{ cursor: 'pointer', width: '16px', height: '16px', margin: 0, accentColor: '#b58a3d' }} 
                        />
                      </td>

                      {/* 🔥 FIXED NUMBER COLUMN ROW */}
                      <td className="saas-td" style={{ width: '50px', padding: '8px', textAlign: 'center', borderRight: '1px solid #f1f5f9', color: '#64748b', fontWeight: 'bold' }}>
                        {index + 1}
                      </td>

                      {columnOrder.map(col => {
                        const isNameCol = col === 'name';
                        const editing = editingCell?.id === cid && editingCell?.col === col;
                        const val = edits[cid]?.[col as keyof Customer] ?? (c as any)[col] ?? '';
                        const readOnly = isReadOnly(col as string);

                        return (
                          <td key={col as string} className={`saas-td ${editing ? 'cell-editing' : ''}`} style={{ borderRight: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative', padding: 0 }}>
                            
                            {/* Input Transform */}
                            {editing && !readOnly ? (
                              col === 'owner' ? (
                                <select 
                                  autoFocus 
                                  className="cell-input" 
                                  value={val} 
                                  onChange={(e) => setEdits(prev => ({ ...prev, [cid]: { ...(prev[cid] || {}), [col]: e.target.value } }))}
                                  onBlur={() => handleSaveRecord(cid)}
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
                                  onChange={(e) => setEdits(prev => ({ ...prev, [cid]: { ...(prev[cid] || {}), [col]: e.target.value } }))}
                                  onBlur={() => handleSaveRecord(cid)}
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
                                  onChange={(e) => setEdits(prev => ({ ...prev, [cid]: { ...(prev[cid] || {}), [col]: e.target.value } }))}
                                  onBlur={() => handleSaveRecord(cid)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEdits(prev => { const n = { ...prev }; delete n[cid]; return n }); setEditingCell(null); } }}
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
                                onClick={() => !readOnly && setEditingCell({ id: cid, col: col as string })}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {col === 'google_map' && val ? (
                                    <a href={val} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }} onClick={e => e.stopPropagation()}>🗺️ Open Map</a>
                                  ) : (
                                    formatDisplayValue(col as string, val)
                                  )}
                                </span>
                              </div>
                            )}

                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ADD CUSTOMER MODAL --- */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Customer" icon="👤" maxWidth="460px">
        <form onSubmit={handleAddCustomer}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Customer Full Name *</label>
              <input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="saas-input" required />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 130px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Account Owner</label>
                <select value={newCustomer.owner} onChange={(e) => setNewCustomer({ ...newCustomer, owner: e.target.value })} className="saas-input" style={{ cursor: 'pointer' }}>
                  <option value="Both">Both</option>
                  <option value="Jing">Jing</option>
                  <option value="Pich">Pich</option>
                  <option value="Mom">Mom</option>
                </select>
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Customer Type</label>
                <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} className="saas-input" style={{ cursor: 'pointer' }}>
                  <option value="ហូប">ហូប</option>
                  <option value="លក់បាយ">លក់បាយ</option>
                  <option value="លក់ត">លក់ត</option>
                  <option value="ធ្វើនំ">ធ្វើនំ</option>
                  <option value="អំណោយ">អំណោយ</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Phone Number</label>
              <input type="text" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="e.g. 012 345 678" className="saas-input" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Location</label>
              <input type="text" value={newCustomer.location} onChange={(e) => setNewCustomer({ ...newCustomer, location: e.target.value })} placeholder="Phnom Penh" className="saas-input" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Google Map URL Link</label>
              <input type="url" value={newCustomer.google_map} onChange={(e) => setNewCustomer({ ...newCustomer, google_map: e.target.value })} placeholder="https://maps.google.com/..." className="saas-input" />
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={() => setShowAddModal(false)} className="saas-btn saas-btn-secondary">Cancel</button>
            <button type="submit" className="saas-btn saas-btn-primary">Save Customer</button>
          </div>
        </form>
      </Modal>

      {/* --- PAGE-SPECIFIC CSS --- */}
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* Clears the burger menu icon for horizontal alignment */
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

        .header-actions {
          display: flex;
          gap: 10px;
          margin-left: auto;
          padding-right: 60px; 
        }

        @media (max-width: 1023px) {
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

          .header-actions {
            margin-left: auto;
            padding-right: 0px; 
          }
        }
      `}</style>
    </div>
  )
}