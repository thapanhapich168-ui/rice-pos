'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => {
  return `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
};

const formatNumber = (v: number) => {
  return new Intl.NumberFormat('en-US').format(v);
};

// Smart Converter for database values
const parseToRiel = (amount: any, currency?: string) => {
  const val = Number(amount || 0);
  if (val === 0) return 0;
  if (currency?.toLowerCase() === 'usd') return val * EXCHANGE_RATE;
  if (currency?.toLowerCase() === 'khr' || currency?.toLowerCase() === 'riel') return val;
  return (Math.abs(val) < 10000) ? val * EXCHANGE_RATE : val;
}

// Formats 'total_sales' into 'Total Sales', 'qty' to 'Quantity'
const formatHeader = (key: string) => {
  if (key === 'qty') return 'Quantity';
  if (key === 'cogs_price') return 'COGS Price';
  if (key === 'invoice_id') return 'Invoice ID';
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// --- UNIFIED TRANSACTION TYPE ---
interface UnifiedTransaction {
  [key: string]: any; // Allows dynamic access for sorting/filtering
  id: string;
  source: 'Invoice Summary' | 'Daily Invoice' | 'Expense';
  created_at: string;
}

type SortDirection = 'asc' | 'desc'
interface SortRule {
  id: number
  column: string
  direction: SortDirection
}

type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt'
interface FilterRule {
  id: number
  column: string
  operator: FilterOperator
  value: string | number
}

// Standardized initial widths for all possible columns
const DEFAULT_WIDTHS: Record<string, number> = {
  invoice_id: 140,
  created_at: 160,
  customer_name: 160,
  owner: 100,
  rice_types: 250,
  rice_type: 180,
  qty: 100,
  price_per_bag: 130,
  cogs_price: 130,
  total_sales: 140,
  total_cogs: 140,
  total_profit: 140,
  description: 200,
  amount: 140,
  category: 140,
  status: 120
}

const DEFAULT_SUMMARY_COLS = ['invoice_id', 'created_at', 'customer_name', 'owner', 'rice_types', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_DAILY_COLS = ['invoice_id', 'created_at', 'customer_name', 'owner', 'rice_type', 'qty', 'price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_EXPENSE_COLS = ['created_at', 'description', 'amount', 'category', 'status', 'owner'];

export default function BizDatabase() {
  // --- CORE STATE ---
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([])
  const [activeTab, setActiveTab] = useState<'Invoice Summary' | 'Daily Invoice' | 'Expense'>('Invoice Summary')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  
  // --- PREFERENCES ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [summaryCols, setSummaryCols] = useState<string[]>(DEFAULT_SUMMARY_COLS)
  const [dailyCols, setDailyCols] = useState<string[]>(DEFAULT_DAILY_COLS)
  const [expenseCols, setExpenseCols] = useState<string[]>(DEFAULT_EXPENSE_COLS)
  
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- MODAL STATES ---
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [sortRules, setSortRules] = useState<SortRule[]>([])

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])

  // Dynamic active columns based on tab
  const activeColumns = activeTab === 'Invoice Summary' ? summaryCols : activeTab === 'Daily Invoice' ? dailyCols : expenseCols;

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchData()
    fetchSettings()
  }, [])

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['biz_col_widths', 'biz_sum_cols', 'biz_daily_cols', 'biz_exp_cols'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'biz_col_widths')
      const sumCols = data.find(d => d.setting_key === 'biz_sum_cols')
      const dalCols = data.find(d => d.setting_key === 'biz_daily_cols')
      const expCols = data.find(d => d.setting_key === 'biz_exp_cols')
      
      if (widths?.setting_value) setColumnWidths(widths.setting_value)
      if (sumCols?.setting_value) setSummaryCols(sumCols.setting_value)
      if (dalCols?.setting_value) setDailyCols(dalCols.setting_value)
      if (expCols?.setting_value) setExpenseCols(expCols.setting_value)
    }
  }

  async function fetchData() {
    setIsLoading(true)
    
    // Fetch all 3 tables safely
    const { data: summaryData } = await supabase.from('invoice_summaries').select('*')
    const { data: dailyData } = await supabase.from('sales').select('*')
    
    // Fixed Try-Catch block for Expenses
    let expensesData: any[] = []
    try {
      const { data, error } = await supabase.from('expenses').select('*')
      if (data && !error) {
        expensesData = data
      }
    } catch (e) {
      console.warn("Expenses table not found or accessible yet. Defaulting to empty.", e)
    }

    const unified: UnifiedTransaction[] = []

    if (summaryData) {
      summaryData.forEach(s => {
        unified.push({
          id: `sum_${s.id}`,
          source: 'Invoice Summary',
          created_at: s.created_at,
          invoice_id: s.invoice_id,
          customer_name: s.customer_name || 'Walk-in',
          owner: s.owner || '-',
          rice_types: s.rice_types,
          total_sales: Number(s.total_sales || 0),
          total_cogs: Number(s.total_cogs || 0),
          total_profit: Number(s.total_profit || 0)
        })
      })
    }

    if (dailyData) {
      dailyData.forEach(d => {
        unified.push({
          id: `daily_${d.id}`,
          source: 'Daily Invoice',
          created_at: d.created_at,
          invoice_id: d.invoice_id,
          customer_name: d.customer_name || 'Walk-in',
          owner: d.owner || '-',
          rice_type: d.rice_type,
          qty: Number(d.qty || 0),
          price_per_bag: Number(d.price_per_bag || 0),
          cogs_price: Number(d.cogs_price || 0),
          total_sales: Number(d.total_sales || 0),
          total_cogs: Number(d.total_cogs || 0),
          total_profit: Number(d.total_profit || 0)
        })
      })
    }

    if (expensesData && expensesData.length > 0) {
      expensesData.forEach(e => {
        unified.push({
          id: `exp_${e.id}`,
          source: 'Expense',
          created_at: e.created_at,
          description: e.description || `Expense #${e.id}`,
          amount: parseToRiel(e.amount, e.currency),
          category: e.category || 'Uncategorized',
          status: e.status || 'cleared',
          owner: e.owner || '-'
        })
      })
    }

    // Sort globally by newest first
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    setTransactions(unified)
    setIsLoading(false)
  }

  // --- COLUMN DRAG & DROP LOGIC ---
  const handleDragStart = (e: React.DragEvent, col: string) => {
    e.dataTransfer.setData('text/plain', col)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() 
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    const sourceCol = e.dataTransfer.getData('text/plain')
    if (!sourceCol || sourceCol === targetCol) return

    const reorder = (prev: string[]) => {
      const newOrder = prev.filter(c => c !== sourceCol)
      const targetIdx = newOrder.indexOf(targetCol)
      newOrder.splice(targetIdx, 0, sourceCol)
      return newOrder
    }

    if (activeTab === 'Invoice Summary') {
      const updated = reorder(summaryCols)
      setSummaryCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_sum_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else if (activeTab === 'Daily Invoice') {
      const updated = reorder(dailyCols)
      setDailyCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_daily_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else {
      const updated = reorder(expenseCols)
      setExpenseCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_exp_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    }
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
      document.removeEventListener('touchend', handleUp)
      
      await supabase.from('app_settings').upsert({ setting_key: 'biz_col_widths', setting_value: widthsRef.current }, { onConflict: 'setting_key' })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchend', handleUp)
  }

  // --- DATA PROCESSING & CALCULATIONS ---
  const processedTransactions = transactions
    .filter(t => {
      // 1. Tab Filter
      if (t.source !== activeTab) return false

      // 2. Quick Search (Check string matching across main columns)
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const searchableText = `${t.invoice_id || ''} ${t.customer_name || ''} ${t.rice_types || ''} ${t.rice_type || ''} ${t.description || ''} ${t.category || ''}`.toLowerCase()
        if (!searchableText.includes(query)) return false
      }

      // 3. Advanced Filters
      for (const rule of filterRules) {
        if (!rule.value && rule.value !== 0) continue
        const val = t[rule.column]
        const checkVal = String(rule.value).toLowerCase()
        
        if (rule.operator === 'contains' && !String(val).toLowerCase().includes(checkVal)) return false
        if (rule.operator === 'equals' && String(val).toLowerCase() !== checkVal) return false
        if (rule.operator === 'gt' && Number(val) <= Number(rule.value)) return false
        if (rule.operator === 'lt' && Number(val) >= Number(rule.value)) return false
      }
      return true
    })
    .sort((a, b) => {
      // 4. Sorting
      for (const rule of sortRules) {
        const valA = a[rule.column]
        const valB = b[rule.column]
        if (valA < valB) return rule.direction === 'asc' ? -1 : 1
        if (valA > valB) return rule.direction === 'asc' ? 1 : -1
      }
      return 0
    })

  // --- CONTEXT-AWARE SUMMARY CARDS ---
  let card1 = { title: '', value: '', color: '#1e293b' }
  let card2 = { title: '', value: '', color: '#1e293b' }
  let card3 = { title: '', value: '', color: '#1e293b' }

  if (activeTab === 'Invoice Summary') {
    const sumSales = processedTransactions.reduce((acc, t) => acc + (t.total_sales || 0), 0)
    const sumCogs = processedTransactions.reduce((acc, t) => acc + (t.total_cogs || 0), 0)
    const sumProfit = processedTransactions.reduce((acc, t) => acc + (t.total_profit || 0), 0)
    card1 = { title: 'Total Sales Revenue', value: formatRiel(sumSales), color: '#2563eb' }
    card2 = { title: 'Total COGS', value: formatRiel(sumCogs), color: '#b91c1c' }
    card3 = { title: 'Total Net Profit', value: formatRiel(sumProfit), color: sumProfit >= 0 ? '#10b981' : '#ef4444' }
  } else if (activeTab === 'Daily Invoice') {
    const sumQty = processedTransactions.reduce((acc, t) => acc + (t.qty || 0), 0)
    const sumSales = processedTransactions.reduce((acc, t) => acc + (t.total_sales || 0), 0)
    card1 = { title: 'Total Items Sold', value: formatNumber(sumQty), color: '#475569' }
    card2 = { title: 'Total Row Sales', value: formatRiel(sumSales), color: '#2563eb' }
    card3 = { title: 'Records Matching', value: formatNumber(processedTransactions.length), color: '#475569' }
  } else {
    const bizExp = processedTransactions.filter(t => t.category?.toLowerCase().includes('biz') || t.category?.toLowerCase().includes('business')).reduce((acc, t) => acc + (t.amount || 0), 0)
    const persExp = processedTransactions.filter(t => !t.category?.toLowerCase().includes('biz') && !t.category?.toLowerCase().includes('business')).reduce((acc, t) => acc + (t.amount || 0), 0)
    const sumExp = processedTransactions.reduce((acc, t) => acc + (t.amount || 0), 0)
    card1 = { title: 'Business Expenses', value: formatRiel(bizExp), color: '#b91c1c' }
    card2 = { title: 'Personal Expenses', value: formatRiel(persExp), color: '#f59e0b' }
    card3 = { title: 'Total Expenses', value: formatRiel(sumExp), color: '#1e293b' }
  }

  // --- HELPERS ---
  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    return d.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const Resizer = ({ columnKey }: { columnKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStart(e, columnKey)}
      style={{ 
        position: 'absolute', 
        right: 0, 
        top: 0, 
        bottom: 0, 
        width: '14px', 
        cursor: 'col-resize', 
        background: 'transparent', 
        zIndex: 10, 
        transform: 'translateX(50%)' 
      }}
    />
  )

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">💼 Business Database</h1>
        <button className="refresh-btn" onClick={fetchData}>
          {isLoading ? '🔄 Loading...' : '🔄 Refresh Data'}
        </button>
      </div>

      {/* DYNAMIC CONTEXT-AWARE CARDS */}
      <div className="summary-cards">
        <div className="card">
          <p className="card-title">{card1.title}</p>
          <h2 className="card-value" style={{ color: card1.color }}>{card1.value}</h2>
        </div>
        <div className="card">
          <p className="card-title">{card2.title}</p>
          <h2 className="card-value" style={{ color: card2.color }}>{card2.value}</h2>
        </div>
        <div className="card">
          <p className="card-title">{card3.title}</p>
          <h2 className="card-value" style={{ color: card3.color }}>{card3.value}</h2>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-container">
        <div className="toolbar-tabs">
          <button 
            className={activeTab === 'Invoice Summary' ? 'tab active' : 'tab'} 
            onClick={() => setActiveTab('Invoice Summary')}
          >
            Invoice Summary
          </button>
          <button 
            className={activeTab === 'Daily Invoice' ? 'tab active' : 'tab'} 
            onClick={() => setActiveTab('Daily Invoice')}
          >
            Daily Invoice Items
          </button>
          <button 
            className={activeTab === 'Expense' ? 'tab active' : 'tab'} 
            onClick={() => setActiveTab('Expense')}
          >
            Expenses Log
          </button>
        </div>
        
        <input 
          className="toolbar-search" 
          placeholder="🔍 Search records..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
        />
        
        <div className="toolbar-filters">
          <button 
            className="filter-btn" 
            onClick={() => setIsFilterOpen(true)} 
            style={{ color: filterRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}
          >
            Y Filter {filterRules.length > 0 && `(${filterRules.length})`}
          </button>
          <button 
            className="sort-btn" 
            onClick={() => setIsSortOpen(true)} 
            style={{ color: sortRules.length > 0 ? '#3b82f6' : '#4a3b1b' }}
          >
            ⇅ Sort {sortRules.length > 0 && `(${sortRules.length})`}
          </button>
        </div>
      </div>

      {/* MAIN SPREADSHEET */}
      <div className="table-wrapper">
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {activeColumns.map(key => (
                <th 
                  key={key} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, key)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, key)}
                  style={{ 
                    width: columnWidths[key] || 150, 
                    position: 'relative', 
                    padding: '14px 12px', 
                    textAlign: 'left', 
                    color: '#64748b', 
                    fontSize: '12px', 
                    textTransform: 'uppercase', 
                    fontWeight: 'bold', 
                    borderRight: '1px solid #f1f5f9', 
                    cursor: 'grab' 
                  }}
                >
                  {formatHeader(key)}
                  <Resizer columnKey={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading database...
                </td>
              </tr>
            ) : processedTransactions.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No records match your view.
                </td>
              </tr>
            ) : (
              processedTransactions.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {activeColumns.map(col => (
                    <td 
                      key={col} 
                      style={{ 
                        padding: '12px', 
                        borderRight: '1px solid #f1f5f9', 
                        overflow: 'hidden', 
                        whiteSpace: 'nowrap', 
                        textOverflow: 'ellipsis', 
                        fontSize: '14px', 
                        color: '#334155' 
                      }}
                    >
                      {/* TEXT FIELDS */}
                      {['invoice_id', 'customer_name', 'rice_types', 'rice_type', 'description'].includes(col) && (
                        <span style={{ fontWeight: col === 'invoice_id' ? 'bold' : 'normal', color: col === 'invoice_id' ? '#1e293b' : 'inherit' }}>
                          {t[col] || '-'}
                        </span>
                      )}
                      
                      {/* CAPS & BADGES */}
                      {col === 'owner' && <span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#64748b' }}>{t.owner || '-'}</span>}
                      {col === 'category' && <span style={{ textTransform: 'capitalize', color: '#475569' }}>{t.category || '-'}</span>}
                      {col === 'status' && <span style={{ color: '#64748b', fontStyle: 'italic' }}>{t.status || '-'}</span>}
                      
                      {/* NUMBERS & DATES */}
                      {col === 'created_at' && formatDate(t.created_at)}
                      {col === 'qty' && formatNumber(t[col] || 0)}

                      {/* CURRENCY FIELDS */}
                      {['price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit', 'amount'].includes(col) && (
                        <span style={{ 
                          fontWeight: 'bold', 
                          color: (col === 'total_profit' && t[col] < 0) || col === 'total_cogs' || col === 'cogs_price' || col === 'amount' ? '#ef4444' : '#10b981' 
                        }}>
                          {formatRiel(t[col] || 0)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* === MODALS === */}

      {/* SORT MODAL */}
      {isSortOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Sort Records</h3>
            {sortRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#666', width: '60px' }}>{index === 0 ? 'Sort by' : 'Then by'}</span>
                <select 
                  value={rule.column} 
                  onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value } : r))} 
                  style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                  {activeColumns.map(c => <option key={c} value={c}>{formatHeader(c)}</option>)}
                </select>
                <select 
                  value={rule.direction} 
                  onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, direction: e.target.value as SortDirection } : r))} 
                  style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                  <option value="asc">Ascending (A-Z / Low-High)</option>
                  <option value="desc">Descending (Z-A / High-Low)</option>
                </select>
                <button 
                  onClick={() => setSortRules(prev => prev.filter(r => r.id !== rule.id))} 
                  style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button 
              onClick={() => setSortRules(prev => [...prev, { id: Date.now(), column: 'created_at', direction: 'desc' }])} 
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}
            >
              + Add sort level
            </button>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setIsSortOpen(false)} 
                style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Apply Sort
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER MODAL */}
      {isFilterOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Filter Records</h3>
            {filterRules.map((rule, index) => (
              <div key={rule.id} style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#666', width: '40px' }}>{index === 0 ? 'Where' : 'And'}</span>
                <select 
                  value={rule.column} 
                  onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value } : r))} 
                  style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                  {activeColumns.map(c => <option key={c} value={c}>{formatHeader(c)}</option>)}
                </select>
                <select 
                  value={rule.operator} 
                  onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: e.target.value as FilterOperator } : r))} 
                  style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                  <option value="contains">Contains (Text)</option>
                  <option value="equals">Equals (=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                </select>
                <input 
                  placeholder="Value..." 
                  value={rule.value} 
                  onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))} 
                  style={{ flex: '1 1 120px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} 
                  type={['amount', 'total_sales', 'total_profit', 'total_cogs', 'qty'].includes(rule.column) ? 'number' : 'text'} 
                />
                <button 
                  onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))} 
                  style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button 
              onClick={() => setFilterRules(prev => [...prev, { id: Date.now(), column: activeColumns[0], operator: 'contains', value: '' }])} 
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}
            >
              + Add condition
            </button>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setFilterRules([])} 
                style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Clear All
              </button>
              <button 
                onClick={() => setIsFilterOpen(false)} 
                style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
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
          margin-bottom: 20px;
        }
        .page-title {
          font-size: 24px;
          font-weight: bold;
          color: #0f172a;
          margin: 0;
        }
        .refresh-btn {
          padding: 8px 16px;
          background: #e2e8f0;
          color: #475569;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
        }
        .summary-cards {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .card {
          flex: 1;
          min-width: 200px;
          background: #fff;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .card-title {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: bold;
        }
        .card-value {
          margin: 0;
          font-size: 24px;
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
          flex-wrap: wrap;
        }
        .toolbar-tabs {
          display: flex;
          gap: 5px;
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
          color: #0f172a;
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
        
        @media (max-width: 768px) {
          .main-wrapper {
            padding: 80px 16px 16px 16px; 
          }
          .header-container {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .refresh-btn {
            width: 100%;
            padding: 12px;
          }
          .summary-cards {
            flex-direction: column;
          }
          .toolbar-container {
            flex-direction: column;
            align-items: stretch;
          }
          .toolbar-tabs {
            flex-wrap: wrap;
          }
          .tab {
            flex: 1 1 100px;
            text-align: center;
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