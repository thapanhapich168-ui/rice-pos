'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- UNIFIED TRANSACTION TYPE ---
// This is the secret to scalability. We map different tables to this single format.
interface UnifiedTransaction {
  id: string           // Unique string like 'sale_1' or 'exp_5'
  source: 'Sale' | 'Expense'
  created_at: string
  description: string  // Invoice No for sales, Description for expenses
  amount: number       // Always positive here; we subtract based on 'source'
  category: string     // Payment Method for sales, Category for expenses
  status: string
  raw_id: number       // Original ID from the source table
}

type SortDirection = 'asc' | 'desc'
interface SortRule {
  id: number
  column: keyof UnifiedTransaction
  direction: SortDirection
}

type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt'
interface FilterRule {
  id: number
  column: keyof UnifiedTransaction
  operator: FilterOperator
  value: string | number
}

const DEFAULT_WIDTHS: Record<string, number> = {
  source: 100,
  created_at: 160,
  description: 200,
  amount: 140,
  category: 140,
  status: 120
}

const DEFAULT_ORDER: Array<keyof UnifiedTransaction> = ['source', 'created_at', 'description', 'amount', 'category', 'status']

export default function BizDatabase() {
  // --- CORE STATE ---
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'Sale' | 'Expense'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  
  // --- PREFERENCES ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [columnOrder, setColumnOrder] = useState<Array<keyof UnifiedTransaction>>(DEFAULT_ORDER)
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- MODAL STATES ---
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [sortRules, setSortRules] = useState<SortRule[]>([])

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchData()
    fetchSettings()
  }, [])

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['biz_col_widths', 'biz_col_order'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'biz_col_widths')
      const order = data.find(d => d.setting_key === 'biz_col_order')
      if (widths?.setting_value) setColumnWidths(widths.setting_value)
      if (order?.setting_value) setColumnOrder(order.setting_value)
    }
  }

  async function fetchData() {
    setIsLoading(true)
    
    // 1. Fetch Sales
    const { data: salesData, error: salesError } = await supabase.from('sales').select('*')
    // 2. Fetch Expenses
    const { data: expensesData, error: expensesError } = await supabase.from('expenses').select('*')

    const unified: UnifiedTransaction[] = []

    if (salesData) {
      salesData.forEach(s => {
        unified.push({
          id: `sale_${s.id}`,
          source: 'Sale',
          created_at: s.created_at,
          description: s.invoice_no || `Sale #${s.id}`,
          amount: Number(s.total_amount) || 0,
          category: s.payment_method || 'Uncategorized',
          status: s.payment_status || 'completed',
          raw_id: s.id
        })
      })
    }

    if (expensesData) {
      expensesData.forEach(e => {
        unified.push({
          id: `exp_${e.id}`,
          source: 'Expense',
          created_at: e.created_at,
          description: e.description || `Expense #${e.id}`,
          amount: Number(e.amount) || 0,
          category: e.category || 'Uncategorized',
          status: e.status || 'cleared',
          raw_id: e.id
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
    const sourceCol = e.dataTransfer.getData('text/plain') as keyof UnifiedTransaction
    if (!sourceCol || sourceCol === targetCol) return

    setColumnOrder(prev => {
      const newOrder = prev.filter(c => c !== sourceCol)
      const targetIdx = newOrder.indexOf(targetCol as keyof UnifiedTransaction)
      newOrder.splice(targetIdx, 0, sourceCol)
      
      supabase.from('app_settings').upsert({ setting_key: 'biz_col_order', setting_value: newOrder }, { onConflict: 'setting_key' }).then()
      return newOrder
    })
  }

  // --- COLUMN RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX
    const startWidth = widthsRef.current[columnKey]

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
      if (activeTab !== 'all' && t.source !== activeTab) return false

      // 2. Quick Search
      const matchesSearch = t.description?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            t.category?.toLowerCase().includes(searchQuery.toLowerCase())
      if (!matchesSearch) return false

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

  // Calculate Totals based on currently filtered view
  const totalIncome = processedTransactions.filter(t => t.source === 'Sale').reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = processedTransactions.filter(t => t.source === 'Expense').reduce((sum, t) => sum + t.amount, 0)
  const netProfit = totalIncome - totalExpense

  // --- HELPERS ---
  const formatUSD = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const columns: Array<keyof UnifiedTransaction> = ['source', 'created_at', 'description', 'amount', 'category', 'status']

  const Resizer = ({ columnKey }: { columnKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStart(e, columnKey)}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '14px', cursor: 'col-resize', background: 'transparent', zIndex: 10, transform: 'translateX(50%)' }}
    />
  )

  return (
    <div className="main-wrapper">
      
      {/* HEADER & FINANCIAL SUMMARY */}
      <div className="header-container">
        <h1 className="page-title">💼 Business Database</h1>
        <button className="refresh-btn" onClick={fetchData}>{isLoading ? '🔄 Loading...' : '🔄 Refresh Data'}</button>
      </div>

      <div className="summary-cards">
        <div className="card income">
          <p className="card-title">Total Income (Filtered)</p>
          <h2 className="card-value">{formatUSD(totalIncome)}</h2>
        </div>
        <div className="card expense">
          <p className="card-title">Total Expenses (Filtered)</p>
          <h2 className="card-value">{formatUSD(totalExpense)}</h2>
        </div>
        <div className={`card net ${netProfit >= 0 ? 'positive' : 'negative'}`}>
          <p className="card-title">Net Cash Flow</p>
          <h2 className="card-value">{formatUSD(netProfit)}</h2>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-container">
        <div className="toolbar-tabs">
          <button className={activeTab === 'all' ? 'tab active' : 'tab'} onClick={() => setActiveTab('all')}>All Transactions</button>
          <button className={activeTab === 'Sale' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Sale')}>Sales Only</button>
          <button className={activeTab === 'Expense' ? 'tab active' : 'tab'} onClick={() => setActiveTab('Expense')}>Expenses Only</button>
        </div>
        
        <input className="toolbar-search" placeholder="🔍 Search description or category..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        
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
              {columnOrder.map(key => (
                <th 
                  key={key} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, key)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, key)}
                  style={{ width: columnWidths[key], position: 'relative', padding: '14px 12px', textAlign: 'left', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold', borderRight: '1px solid #f1f5f9', cursor: 'grab' }}
                >
                  {key.replace('_', ' ')}
                  <Resizer columnKey={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columnOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading database...</td></tr>
            ) : processedTransactions.length === 0 ? (
              <tr><td colSpan={columnOrder.length} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No records match your view.</td></tr>
            ) : (
              processedTransactions.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {columnOrder.map(col => (
                    <td key={col} style={{ padding: '12px', borderRight: '1px solid #f1f5f9', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: '14px' }}>
                      {col === 'source' && (
                        <span style={{ background: t.source === 'Sale' ? '#dcfce7' : '#fee2e2', color: t.source === 'Sale' ? '#166534' : '#991b1b', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                          {t.source}
                        </span>
                      )}
                      {col === 'created_at' && formatDate(t.created_at)}
                      {col === 'description' && <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{t.description}</span>}
                      {col === 'amount' && (
                        <span style={{ fontWeight: 'bold', color: t.source === 'Sale' ? '#10b981' : '#ef4444' }}>
                          {t.source === 'Sale' ? '+' : '-'}{formatUSD(t.amount)}
                        </span>
                      )}
                      {col === 'category' && <span style={{ textTransform: 'capitalize', color: '#475569' }}>{t.category}</span>}
                      {col === 'status' && <span style={{ color: '#64748b', fontStyle: 'italic' }}>{t.status}</span>}
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
                <select value={rule.column} onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof UnifiedTransaction } : r))} style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  {columns.map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
                </select>
                <select value={rule.direction} onChange={e => setSortRules(prev => prev.map(r => r.id === rule.id ? { ...r, direction: e.target.value as SortDirection } : r))} style={{ flex: 1, minWidth: '100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <option value="asc">Ascending (A-Z / Old-New)</option>
                  <option value="desc">Descending (Z-A / New-Old)</option>
                </select>
                <button onClick={() => setSortRules(prev => prev.filter(r => r.id !== rule.id))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
            ))}
            <button onClick={() => setSortRules(prev => [...prev, { id: Date.now(), column: 'created_at', direction: 'desc' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ Add sort level</button>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsSortOpen(false)} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Apply Sort</button>
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
                <select value={rule.column} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, column: e.target.value as keyof UnifiedTransaction } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  {columns.map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
                </select>
                <select value={rule.operator} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, operator: e.target.value as FilterOperator } : r))} style={{ flex: '1 1 100px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals (=)</option>
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                </select>
                <input placeholder="Value..." value={rule.value} onChange={e => setFilterRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))} style={{ flex: '1 1 120px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} type={['amount'].includes(rule.column as string) ? 'number' : 'text'} />
                <button onClick={() => setFilterRules(prev => prev.filter(r => r.id !== rule.id))} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
            ))}
            <button onClick={() => setFilterRules(prev => [...prev, { id: Date.now(), column: 'description', operator: 'contains', value: '' }])} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>+ Add condition</button>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setFilterRules([])} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear All</button>
              <button onClick={() => setIsFilterOpen(false)} style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Apply Filters</button>
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
        .card.income .card-value { color: #10b981; }
        .card.expense .card-value { color: #ef4444; }
        .card.net.positive .card-value { color: #10b981; }
        .card.net.negative .card-value { color: #ef4444; }
        
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