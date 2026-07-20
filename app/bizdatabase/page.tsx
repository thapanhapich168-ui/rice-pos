'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => {
  return `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
};

const formatNumber = (v: number) => {
  return new Intl.NumberFormat('en-US').format(v);
};

// Formats 'total_sales' into 'Total Sales', 'qty' to 'Quantity'
const formatHeader = (key: string) => {
  if (key === 'qty') return 'Quantity';
  if (key === 'cogs_price') return 'COGS Price';
  if (key === 'invoice_id') return 'Invoice ID';
  if (key === 'transaction_id') return 'Transaction ID';
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ==========================================
// ROBUST LIVE COMMA FORMATTER 
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, onEnter }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === undefined || value === null) {
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
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
          if (onEnter) onEnter();
        }
      }}
      style={{ ...style, fontWeight: 'bold' }}
      className="cell-input no-spinners"
    />
  )
}

// --- UNIFIED TRANSACTION TYPE ---
interface UnifiedTransaction {
  [key: string]: any; 
  id: string;
  source: 'Wholesale Invoice Summary' | 'Wholesale Day Invoice Item' | 'Retails only' | 'Expense log';
  created_at: string;
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

type TimeFilter = 'Today' | 'This Week' | 'This Month' | 'All Time';

// Standardized initial widths for all possible columns
const DEFAULT_WIDTHS: Record<string, number> = {
  invoice_id: 140,
  transaction_id: 140,
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
const DEFAULT_RETAIL_COLS = ['transaction_id', 'created_at', 'rice_type', 'qty', 'price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_EXPENSE_COLS = ['created_at', 'description', 'amount', 'category', 'status', 'owner'];

export default function BizDatabase() {
  // --- CORE STATE ---
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([])
  const [activeTab, setActiveTab] = useState<'Wholesale Invoice Summary' | 'Wholesale Day Invoice Item' | 'Retails only' | 'Expense log'>('Wholesale Invoice Summary')
  const [searchQuery, setSearchQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Today')
  const [isLoading, setIsLoading] = useState(true)

  // --- EDITING STATE ---
  const [editingCell, setEditingCell] = useState<{id: string, col: string} | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<UnifiedTransaction>>>({})
  
  // --- PREFERENCES ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [summaryCols, setSummaryCols] = useState<string[]>(DEFAULT_SUMMARY_COLS)
  const [dailyCols, setDailyCols] = useState<string[]>(DEFAULT_DAILY_COLS)
  const [retailCols, setRetailCols] = useState<string[]>(DEFAULT_RETAIL_COLS)
  const [expenseCols, setExpenseCols] = useState<string[]>(DEFAULT_EXPENSE_COLS)
  
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- SORT STATE ---
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // Dynamic active columns based on tab
  const activeColumns = activeTab === 'Wholesale Invoice Summary' ? summaryCols 
                      : activeTab === 'Wholesale Day Invoice Item' ? dailyCols 
                      : activeTab === 'Retails only' ? retailCols 
                      : expenseCols;

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchData()
    fetchSettings()
  }, [])

  // 🚀 NEW: Window Focus Auto-Refresh
  useFocusRefresh(fetchData);

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['biz_col_widths', 'biz_sum_cols', 'biz_daily_cols', 'biz_retail_cols', 'biz_exp_cols'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'biz_col_widths')
      const sumCols = data.find(d => d.setting_key === 'biz_sum_cols')
      const dalCols = data.find(d => d.setting_key === 'biz_daily_cols')
      const retCols = data.find(d => d.setting_key === 'biz_retail_cols')
      const expCols = data.find(d => d.setting_key === 'biz_exp_cols')
      
      if (widths?.setting_value) setColumnWidths(widths.setting_value)
      if (sumCols?.setting_value) setSummaryCols(sumCols.setting_value)
      if (dalCols?.setting_value) setDailyCols(dalCols.setting_value)
      if (retCols?.setting_value) setRetailCols(retCols.setting_value)
      if (expCols?.setting_value) setExpenseCols(expCols.setting_value)
    }
  }

  async function fetchData() {
    setIsLoading(true)
    
    const { data: summaryData } = await supabase.from('invoice_summaries').select('*')
    const { data: dailyData } = await supabase.from('sales').select('*')
    
    let retailData: any[] = []
    try {
      const { data, error } = await supabase.from('retail_sales').select('*')
      if (data && !error) retailData = data;
    } catch (e) {
      console.warn("Retail table not found or accessible yet. Defaulting to empty.", e)
    }

    let expensesData: any[] = []
    try {
      const { data, error } = await supabase.from('expenses').select('*')
      if (data && !error) expensesData = data;
    } catch (e) {
      console.warn("Expenses table not found or accessible yet. Defaulting to empty.", e)
    }

    const unified: UnifiedTransaction[] = []

    if (summaryData) {
      summaryData.forEach(s => {
        unified.push({
          id: `sum_${s.id}`,
          raw_db_id: s.id, // Keep exact DB reference for saving
          source: 'Wholesale Invoice Summary',
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
        const qty = Number(d.qty || 0);
        const price = Number(d.price_per_bag || 0);
        const cogs = Number(d.cogs_price || 0);
        
        unified.push({
          id: `daily_${d.id}`,
          raw_db_id: d.id, // Keep exact DB reference for saving
          source: 'Wholesale Day Invoice Item',
          created_at: d.created_at,
          invoice_id: d.invoice_id,
          customer_name: d.customer_name || 'Walk-in',
          owner: d.owner || '-',
          rice_type: d.custom_rice_type || d.rice_type,
          qty: qty,
          price_per_bag: price,
          cogs_price: cogs,
          total_sales: qty * price,
          total_cogs: qty * cogs,
          total_profit: (price - cogs) * qty
        })
      })
    }

    if (retailData) {
      retailData.forEach(r => {
        const qty = Number(r.qty || 0);
        const price = Number(r.price_per_bag || 0);
        const cogs = Number(r.cogs_price || 0);

        unified.push({
          id: `ret_${r.id}`,
          raw_db_id: r.id, // Keep exact DB reference for saving
          source: 'Retails only',
          created_at: r.created_at,
          transaction_id: r.transaction_id,
          rice_type: r.custom_rice_type || r.rice_type,
          qty: qty,
          price_per_bag: price,
          cogs_price: cogs,
          total_sales: qty * price,
          total_cogs: qty * cogs,
          total_profit: (price - cogs) * qty
        })
      })
    }

    if (expensesData && expensesData.length > 0) {
      expensesData.forEach(e => {
        const amtRiel = Number(e.amount_riel || 0);
        const amtUsd = Number(e.amount_usd || 0);
        const totalRielValue = amtRiel !== 0 ? Math.abs(amtRiel) : Math.abs(amtUsd) * EXCHANGE_RATE;

        unified.push({
          id: `exp_${e.id}`,
          raw_db_id: e.id, // Keep exact DB reference for saving
          source: 'Expense log',
          created_at: e.created_at,
          description: e.remarks || e.description || `Expense #${e.id}`,
          amount: totalRielValue,
          category: e.description || e.category || 'Uncategorized',
          status: e.payment_method || e.status || 'cleared',
          owner: e.spender || e.owner || '-'
        })
      })
    }

    // Default global sort (newest first) applied initially
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    setTransactions(unified)
    setIsLoading(false)
  }

  // --- SAVE EDIT LOGIC ---
  const handleSaveRecord = async (id: string) => {
    if (!edits[id]) {
      setEditingCell(null);
      return;
    }

    const payload = { ...edits[id] } as any;
    const baseTx = transactions.find(t => t.id === id);
    if (!baseTx) return;

    let targetTable = '';
    const dbPayload: any = {};

    // 1. Identify Target Table & Map Fields Back to DB schema
    if (baseTx.source === 'Wholesale Invoice Summary') {
      targetTable = 'invoice_summaries';
      if (payload.customer_name !== undefined) dbPayload.customer_name = payload.customer_name;
      if (payload.owner !== undefined) dbPayload.owner = payload.owner;
      if (payload.rice_types !== undefined) dbPayload.rice_types = payload.rice_types;
      if (payload.total_sales !== undefined) dbPayload.total_sales = payload.total_sales;
      if (payload.total_cogs !== undefined) dbPayload.total_cogs = payload.total_cogs;
      if (payload.total_profit !== undefined) dbPayload.total_profit = payload.total_profit;
    } 
    else if (baseTx.source === 'Wholesale Day Invoice Item') {
      targetTable = 'sales';
      if (payload.customer_name !== undefined) dbPayload.customer_name = payload.customer_name;
      if (payload.owner !== undefined) dbPayload.owner = payload.owner;
      if (payload.rice_type !== undefined) dbPayload.custom_rice_type = payload.rice_type; // Map back to custom_rice_type
      if (payload.qty !== undefined) dbPayload.qty = payload.qty;
      if (payload.price_per_bag !== undefined) dbPayload.price_per_bag = payload.price_per_bag;
      if (payload.cogs_price !== undefined) dbPayload.cogs_price = payload.cogs_price;
    }
    else if (baseTx.source === 'Retails only') {
      targetTable = 'retail_sales';
      if (payload.rice_type !== undefined) dbPayload.custom_rice_type = payload.rice_type; // Map back
      if (payload.qty !== undefined) dbPayload.qty = payload.qty;
      if (payload.price_per_bag !== undefined) dbPayload.price_per_bag = payload.price_per_bag;
      if (payload.cogs_price !== undefined) dbPayload.cogs_price = payload.cogs_price;
    }
    else if (baseTx.source === 'Expense log') {
      targetTable = 'expenses';
      if (payload.description !== undefined) dbPayload.remarks = payload.description; // Map back
      if (payload.category !== undefined) dbPayload.description = payload.category; // Map back
      if (payload.owner !== undefined) dbPayload.spender = payload.owner; // Map back
      if (payload.status !== undefined) dbPayload.payment_method = payload.status; // Map back
      if (payload.amount !== undefined) {
        // Safe assumption: If they edit amount on the riel side, we force update amount_riel
        dbPayload.amount_riel = payload.amount;
        dbPayload.amount_usd = 0; // Wipe USD to prevent double-counting if they switch
      }
    }

    if (Object.keys(dbPayload).length > 0) {
      const { error } = await supabase.from(targetTable).update(dbPayload).eq('id', baseTx.raw_db_id);
      if (error) {
        alert(`Error saving to database: ${error.message}`);
        return;
      }
    }

    // Safely clear the edit state and trigger a hard refresh to re-calculate everything perfectly
    setEdits(prev => { const n = { ...prev }; delete n[id]; return n });
    setEditingCell(null);
    fetchData(); 
  }

  // --- TIME FILTER LOGIC ---
  const isWithinTimeFilter = (dateString: string) => {
    if (timeFilter === 'All Time') return true;
    
    const d = new Date(dateString);
    const now = new Date();
    
    if (timeFilter === 'Today') {
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    
    if (timeFilter === 'This Month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    
    if (timeFilter === 'This Week') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = today.getDay(); // 0 is Sunday
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const startOfWeek = new Date(today.setDate(diff));
      return d >= startOfWeek;
    }
    
    return true;
  }

  // --- HEADER SORT LOGIC ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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

    if (activeTab === 'Wholesale Invoice Summary') {
      const updated = reorder(summaryCols)
      setSummaryCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_sum_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else if (activeTab === 'Wholesale Day Invoice Item') {
      const updated = reorder(dailyCols)
      setDailyCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_daily_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else if (activeTab === 'Retails only') {
      const updated = reorder(retailCols)
      setRetailCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_retail_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
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
      
      // 2. Time Filter
      if (!isWithinTimeFilter(t.created_at)) return false;

      // 3. Quick Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const searchableText = `${t.invoice_id || ''} ${t.transaction_id || ''} ${t.customer_name || ''} ${t.rice_types || ''} ${t.rice_type || ''} ${t.description || ''} ${t.category || ''}`.toLowerCase()
        if (!searchableText.includes(query)) return false
      }

      return true
    })
    .sort((a, b) => {
      // 4. Header Click Sorting
      if (!sortConfig) return 0; // Fallback to the initial fetch sort
      const { key, direction } = sortConfig;
      
      let valA = a[key];
      let valB = b[key];
      
      // Handle missing values
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    })

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
        <div className="header-left">
          <h1 className="page-title">🔐 Business Database</h1>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={fetchData}>
            {isLoading ? '🔄 Loading...' : '🔄 Refresh Data'}
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-container">
        
        {/* TOP ROW: TABS */}
        <div className="toolbar-tabs" style={{ width: '100%', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '4px' }}>
          <button className={activeTab === 'Wholesale Invoice Summary' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Wholesale Invoice Summary'); setSortConfig(null); setEditingCell(null)}}>
            🌾 Wholesale Invoice Summary
          </button>
          <button className={activeTab === 'Wholesale Day Invoice Item' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Wholesale Day Invoice Item'); setSortConfig(null); setEditingCell(null)}}>
            🌾 Wholesale Day Invoice Item
          </button>
          <button className={activeTab === 'Retails only' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Retails only'); setSortConfig(null); setEditingCell(null)}}>
            🛍️ Retails only
          </button>
          <button className={activeTab === 'Expense log' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Expense log'); setSortConfig(null); setEditingCell(null)}}>
            📉 Expense log
          </button>
        </div>

        {/* BOTTOM ROW: FILTERS & SEARCH */}
        <div style={{ display: 'flex', width: '100%', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* TIME PRE-FILTERS */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' }}>
            <button className={timeFilter === 'Today' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('Today')}>Today</button>
            <button className={timeFilter === 'This Week' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('This Week')}>This Week</button>
            <button className={timeFilter === 'This Month' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('This Month')}>This Month</button>
            <button className={timeFilter === 'All Time' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('All Time')}>All Time</button>
          </div>

          <input 
            className="toolbar-search" 
            placeholder="🔍 Search records..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
      </div>

      {/* RECORD COUNT BADGE */}
      <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>
        Showing {processedTransactions.length} records for {timeFilter}
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
                  onClick={() => handleSort(key)}
                  style={{ 
                    width: columnWidths[key] || 150, 
                    position: 'relative', 
                    padding: '14px 12px', 
                    textAlign: 'left', 
                    color: '#475569', 
                    fontSize: '13px', 
                    textTransform: 'uppercase', 
                    fontWeight: 'bold', 
                    borderRight: '1px solid #f1f5f9', 
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  title="Click to sort, Drag to reorder"
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
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s', background: edits[t.id] ? '#fefcf3' : 'transparent' }} onMouseEnter={e => { if(!edits[t.id]) e.currentTarget.style.backgroundColor = '#f8fafc' }} onMouseLeave={e => { if(!edits[t.id]) e.currentTarget.style.backgroundColor = 'transparent' }}>
                  {activeColumns.map(col => {
                    
                    // Core Data Resolvers
                    const isEditing = editingCell?.id === t.id && editingCell?.col === col;
                    const val = edits[t.id]?.[col] ?? t[col] ?? '';
                    
                    // Un-editable columns safety check
                    const isUneditable = ['created_at', 'invoice_id', 'transaction_id'].includes(col);

                    return (
                      <td 
                        key={col} 
                        className={isEditing ? 'cell-editing' : ''}
                        onClick={() => { if (!isUneditable) setEditingCell({ id: t.id, col: col }) }}
                        style={{ 
                          padding: 0, 
                          borderRight: '1px solid #f1f5f9', 
                          overflow: 'hidden', 
                          whiteSpace: 'nowrap', 
                          textOverflow: 'ellipsis', 
                          fontSize: '14px', 
                          color: '#334155',
                          position: 'relative'
                        }}
                      >
                        {isEditing ? (
                          // 🔥 RENDER INPUT FIELD WHEN EDITING
                          ['price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit', 'amount'].includes(col) ? (
                            <CurrencyInput 
                              autoFocus 
                              value={val} 
                              onChange={(v: any) => setEdits(prev => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [col]: v } }))} 
                              onEnter={() => handleSaveRecord(t.id)}
                            />
                          ) : (
                            <input 
                              autoFocus 
                              type={col === 'qty' ? 'number' : 'text'} 
                              className="cell-input no-spinners" 
                              value={val} 
                              onChange={(e) => {
                                const newVal = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                                setEdits(prev => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [col]: newVal } }))
                              }} 
                              onBlur={() => handleSaveRecord(t.id)} 
                              onKeyDown={(e) => { 
                                if (e.key === 'Enter') { e.currentTarget.blur(); handleSaveRecord(t.id); } 
                                if (e.key === 'Escape') { 
                                  setEdits(prev => { const n = { ...prev }; delete n[t.id]; return n }); 
                                  setEditingCell(null); 
                                } 
                              }} 
                            />
                          )
                        ) : (
                          // 🔥 NORMAL DISPLAY (Not Editing)
                          <div className="cell-display" style={{ cursor: isUneditable ? 'default' : 'text' }}>
                            {/* TEXT FIELDS */}
                            {['invoice_id', 'transaction_id', 'customer_name', 'rice_types', 'rice_type', 'description'].includes(col) && (
                              <span style={{ fontWeight: ['invoice_id', 'transaction_id'].includes(col) ? 'bold' : 'normal', color: ['invoice_id', 'transaction_id'].includes(col) ? '#1e293b' : 'inherit' }}>
                                {val || '-'}
                              </span>
                            )}
                            
                            {/* CAPS & BADGES */}
                            {col === 'owner' && <span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#64748b' }}>{val || '-'}</span>}
                            {col === 'category' && <span style={{ textTransform: 'capitalize', color: '#475569' }}>{val || '-'}</span>}
                            {col === 'status' && <span style={{ color: '#64748b', fontStyle: 'italic' }}>{val || '-'}</span>}
                            
                            {/* NUMBERS & DATES */}
                            {col === 'created_at' && formatDate(t.created_at)}
                            {col === 'qty' && formatNumber(val || 0)}

                            {/* CURRENCY FIELDS */}
                            {['price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit', 'amount'].includes(col) && (
                              <span style={{ 
                                fontWeight: 'bold', 
                                color: (col === 'total_profit' && val < 0) || col === 'total_cogs' || col === 'cogs_price' || col === 'amount' ? '#ef4444' : '#10b981' 
                              }}>
                                {formatRiel(val || 0)}
                              </span>
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

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        /* 🔥 DESKTOP/LAPTOP BASE STYLES */
        .main-wrapper {
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: #333;
          box-sizing: border-box;
          width: 100%;
        }

        .header-container { 
          display: flex;
          justify-content: space-between;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* 🔥 Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          height: 42px; /* 🔥 Strictly locked to match the hamburger perfectly */
          width: calc(100% - 60px); /* 🔥 Ensures right elements don't push off-screen */
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

        .header-actions {
          display: flex;
          align-items: center;
        }
        
        .refresh-btn {
          padding: 10px 16px;
          background: #e2e8f0;
          color: #475569;
          border: none;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
          margin: 0; /* Ensures no extra spacing shifts the header */
        }
        .refresh-btn:hover { background: #cbd5e1; }
        
        .toolbar-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
          background: #fff;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .toolbar-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tab {
          padding: 10px 16px;
          border-radius: 6px;
          border: none;
          background: transparent;
          font-weight: bold;
          font-size: 14px;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab.active {
          background: #10b981;
          color: #fff;
        }
        
        .time-btn {
          padding: 8px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          font-weight: bold;
          font-size: 13px;
          color: #64748b;
          cursor: pointer;
        }
        .time-btn.active {
          background: #fff;
          color: #b58a3d;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .toolbar-search {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          flex: 1;
          outline: none;
          min-width: 200px;
          font-size: 16px; /* Prevents iOS Zoom */
          color: #0f172a;
          background-color: #ffffff;
        }
        
        .table-wrapper {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }

        /* 🔥 NEW INTERACTIVE CELL STYLES */
        .cell-display {
          padding: 14px 12px;
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cell-input {
          width: 100%;
          height: 100%;
          padding: 14px 12px;
          font-size: 14px;
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
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }
        input[type="number"].no-spinners { -moz-appearance: textfield; }
        
        /* 📱 MOBILE OVERRIDES */
        @media (max-width: 1023px) {
          .main-wrapper {
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
          }

          .header-container { 
            margin-left: 54px !important; /* Clears the mobile hamburger button safely */
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important; 
            height: 44px !important;
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
            display: flex;
          }
          .refresh-btn {
            padding: 8px 12px !important;
            font-size: 13px !important;
          }
          
          .toolbar-container {
            padding: 12px;
          }
          .toolbar-tabs {
            gap: 4px;
          }
          .tab {
            flex: 1 1 45%;
            padding: 12px;
            font-size: 13px;
          }
          .time-btn {
            flex: 1;
            padding: 10px 4px;
            font-size: 12px;
            text-align: center;
          }
          .toolbar-search {
            width: 100%;
            box-sizing: border-box;
          }
        }
      `}</style>
    </div>
  )
}