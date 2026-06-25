'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
const formatUSD = (v: number) => `$${(v / EXCHANGE_RATE).toFixed(2)}`;

// Smart Converter: Safely converts any database value to Riel (mainly used for Expenses now)
const parseToRiel = (amount: any, currency?: string) => {
  const val = Number(amount || 0);
  if (val === 0) return 0;
  
  if (currency === 'USD' || currency === 'usd') return val * EXCHANGE_RATE;
  if (currency === 'KHR' || currency === 'khr' || currency === 'riel') return val;
  
  return (Math.abs(val) < 10000) ? val * EXCHANGE_RATE : val;
}

export default function DashboardPage() {
  const [sales, setSales] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // -------------------------
  // LOAD DATA (FIXED FAILSAFE)
  // -------------------------
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // 1. Fetch Sales
    const { data: salesData } = await supabase.from('sales').select('*')
    setSales(salesData || [])

    // 2. Fetch Expenses with a safe Try-Catch block to prevent crashes if table is missing
    try {
      const { data: expensesData, error } = await supabase.from('expenses').select('*')
      if (!error && expensesData) {
        setExpenses(expensesData)
      } else {
        setExpenses([])
      }
    } catch (e) {
      console.warn("Expenses table not found or accessible yet. Defaulting to 0.", e)
      setExpenses([])
    }
  }

  // -------------------------
  // DATE FILTER LOGIC
  // -------------------------
  function filterByDate(data: any[]) {
    if (!fromDate && !toDate) return data
    return data.filter((item) => {
      const date = item.created_at?.split('T')[0]
      if (fromDate && date < fromDate) return false
      if (toDate && date > toDate) return false
      return true
    })
  }

  const filteredSales = filterByDate(sales)

  // -------------------------
  // TIME HELPERS FOR DASHBOARD
  // -------------------------
  const now = new Date()

  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getDate() === now.getDate() && 
           d.getMonth() === now.getMonth() && 
           d.getFullYear() === now.getFullYear();
  }

  const isMTD = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && 
           d.getFullYear() === now.getFullYear();
  }

  const isLastMonth = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === lm.getMonth() && 
           d.getFullYear() === lm.getFullYear();
  }

  const getDayOfMonth = (dateStr: string) => {
    if (!dateStr) return 1;
    return new Date(dateStr).getDate();
  }

  // -------------------------
  // CORE CALCULATION ENGINE (UPDATED FOR FLAT TABLE)
  // -------------------------
  function calculateMetrics(dataSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = dataSet.filter(s => timeFilter(s.created_at))
    
    let totalSales = 0, pichSales = 0, jingSales = 0, bothSales = 0
    let totalProfit = 0, pichProfit = 0, jingProfit = 0, bothProfit = 0

    filtered.forEach(sale => {
      // The new flat table already calculates total_sales and total_profit in Riel for us!
      const revenue = Number(sale.total_sales || 0)
      const profit = Number(sale.total_profit || 0)

      totalSales += revenue
      totalProfit += profit

      const owner = (sale.owner || '').toLowerCase()
      if (owner === 'pich') { pichSales += revenue; pichProfit += profit }
      else if (owner === 'jing') { jingSales += revenue; jingProfit += profit }
      else if (owner === 'both') { bothSales += revenue; bothProfit += profit }
    })

    return { totalSales, pichSales, jingSales, bothSales, totalProfit, pichProfit, jingProfit, bothProfit }
  }

  function calculateExpenses(expSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = expSet.filter(e => timeFilter(e.created_at))
    
    let bizTotal = 0
    let personalTotal = 0, pichPers = 0, jingPers = 0, bothPers = 0

    filtered.forEach(exp => {
      const amt = parseToRiel(exp.amount, exp.currency)
      const type = (exp.type || '').toLowerCase()
      const owner = (exp.owner || '').toLowerCase()

      if (type === 'business' || type === 'biz') {
        bizTotal += amt
      } else {
        personalTotal += amt
        if (owner === 'pich') pichPers += amt
        else if (owner === 'jing') jingPers += amt
        else if (owner === 'both') bothPers += amt
      }
    })

    return { bizTotal, personalTotal, pichPers, jingPers, bothPers }
  }

  const todayM = calculateMetrics(sales, isToday)
  const mtdM = calculateMetrics(sales, isMTD)
  const lastMonthM = calculateMetrics(sales, isLastMonth)

  const todayE = calculateExpenses(expenses, isToday)
  const mtdE = calculateExpenses(expenses, isMTD)
  const lastMonthE = calculateExpenses(expenses, isLastMonth)

  // -------------------------
  // GRAPH DATA PREPARATION
  // -------------------------
  const generateDailyArray = (dataSet: any[], isTargetMonth: (d: string) => boolean) => {
    const dailySales = new Array(31).fill(0)
    const dailyProfit = new Array(31).fill(0)

    const filtered = dataSet.filter(s => isTargetMonth(s.created_at))
    filtered.forEach(sale => {
      const dayIdx = getDayOfMonth(sale.created_at) - 1
      const revenue = Number(sale.total_sales || 0)
      const profit = Number(sale.total_profit || 0)

      if (dayIdx >= 0 && dayIdx < 31) {
        dailySales[dayIdx] += revenue
        dailyProfit[dayIdx] += profit
      }
    })
    return { dailySales, dailyProfit }
  }

  const thisMonthData = generateDailyArray(sales, isMTD)
  const lastMonthData = generateDailyArray(sales, isLastMonth)

  // -------------------------
  // UI COMPONENTS
  // -------------------------
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#f8fafc', overflowX: 'hidden' }}>
      
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 12px 65px', borderBottom: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#111827', fontFamily: 'sans-serif' }}>📊 Business Dashboard</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a' }}
          />
          <span style={{ color: '#64748b', fontSize: '14px' }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a' }}
          />
          <button 
            onClick={loadData} 
            style={{ padding: '8px 14px', background: '#b59410', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s' }}
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 24px 65px' }}>
        
        {/* ROW 1: TODAY'S METRICS */}
        <h2 style={{ fontSize: '16px', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>📅 TODAY'S PERFORMANCE</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <ComplexCard title="Today Sales" total={todayM.totalSales} pich={todayM.pichSales} jing={todayM.jingSales} both={todayM.bothSales} color="#2563eb" />
          <ComplexCard title="Today Profit" total={todayM.totalProfit} pich={todayM.pichProfit} jing={todayM.jingProfit} both={todayM.bothProfit} color="#10b981" />
          <ComplexCard title="Today Biz Expenses" total={todayE.bizTotal} hideSubboxes color="#b91c1c" />
          <ComplexCard title="Today Personal Exp" total={todayE.personalTotal} pich={todayE.pichPers} jing={todayE.jingPers} both={todayE.bothPers} color="#f59e0b" />
        </div>

        {/* ROW 2: MONTH TO DATE METRICS */}
        <h2 style={{ fontSize: '16px', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>📈 MONTH TO DATE (MTD)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <ComplexCard title="MTD Sales" total={mtdM.totalSales} pich={mtdM.pichSales} jing={mtdM.jingSales} both={mtdM.bothSales} color="#2563eb" />
          <ComplexCard title="MTD Profit" total={mtdM.totalProfit} pich={mtdM.pichProfit} jing={mtdM.jingProfit} both={mtdM.bothProfit} color="#10b981" />
          <ComplexCard title="MTD Biz Expenses" total={mtdE.bizTotal} hideSubboxes color="#b91c1c" />
          <ComplexCard title="MTD Personal Exp" total={mtdE.personalTotal} pich={mtdE.pichPers} jing={mtdE.jingPers} both={mtdE.bothPers} color="#f59e0b" />
        </div>

        {/* ROW 3: HEALTH BARS (COMPARE VS LAST MONTH) */}
        <h2 style={{ fontSize: '16px', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>⚖️ COMPARE MTD VS LAST MONTH</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
          <HealthBar title="Sales" current={mtdM.totalSales} target={lastMonthM.totalSales} color="#2563eb" />
          <HealthBar title="Profit" current={mtdM.totalProfit} target={lastMonthM.totalProfit} color="#10b981" />
          <HealthBar title="Biz Expenses" current={mtdE.bizTotal} target={lastMonthE.bizTotal} color="#b91c1c" reverseLogic />
          <HealthBar title="Personal Expenses" current={mtdE.personalTotal} target={lastMonthE.personalTotal} color="#f59e0b" reverseLogic />
        </div>

        {/* ROW 4 & 5: GRAPHS (Pure SVG) */}
        <h2 style={{ fontSize: '16px', color: '#475569', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px' }}>📉 TREND ANALYSIS (Day 1 - 31)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '40px' }}>
          <LineChartCard title="Sales: This Month vs Last Month" dataCurrent={thisMonthData.dailySales} dataLast={lastMonthData.dailySales} color="#2563eb" />
          <LineChartCard title="Profit: This Month vs Last Month" dataCurrent={thisMonthData.dailyProfit} dataLast={lastMonthData.dailyProfit} color="#10b981" />
        </div>

        {/* RECENT SALES LOG (UPDATED FOR FLAT TABLE) */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#0f172a', fontFamily: 'sans-serif', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>🧾 Itemized Sales Log</h2>
          
          {filteredSales.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '20px', margin: 0 }}>No items match the specified date filter boundaries.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredSales.map((s) => {
                const rielAmount = Number(s.total_sales || 0);
                return (
                  <div 
                    key={s.id} 
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#f8fafc',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontFamily: 'sans-serif'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px' }}>{s.invoice_id}</span>
                      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                        📦 Item: <span style={{ fontWeight: '600', color: '#334155' }}>{s.rice_type} (x{s.qty})</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', textTransform: 'uppercase' }}>
                        Owner: {s.owner || 'N/A'} | Customer: {s.customer_name || 'Walk-in'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: '#1b4d3e', fontSize: '16px' }}>{formatRiel(rielAmount)}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontWeight: 'bold' }}>
                        {formatUSD(rielAmount)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// -------------------------
// REUSABLE DASHBOARD COMPONENTS
// -------------------------

function ComplexCard({ title, total, pich = 0, jing = 0, both = 0, hideSubboxes = false, color = '#1e293b' }: any) {
  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{ margin: '8px 0 12px 0', fontSize: '24px', fontWeight: 'bold', color: color }}>{formatRiel(total)}</h2>
      </div>
      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '12px' }}>{formatUSD(total)}</div>
      
      {!hideSubboxes && (
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
          <div style={{ flex: 1, background: '#f8fafc', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Pich</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(pich)}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>{formatUSD(pich)}</div>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Jing</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(jing)}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>{formatUSD(jing)}</div>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Both</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(both)}</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>{formatUSD(both)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function HealthBar({ title, current, target, color, reverseLogic = false }: any) {
  let pct = target > 0 ? (current / target) * 100 : (current > 0 ? 100 : 0);
  let displayPct = pct.toFixed(1);
  
  let barWidth = Math.min(100, Math.max(0, pct));
  
  let barColor = color;
  if (!reverseLogic) {
    if (pct < 50) barColor = '#ef4444'; 
    else if (pct >= 100) barColor = '#10b981'; 
  } else {
    if (pct > 100) barColor = '#ef4444'; 
    else if (pct < 80) barColor = '#10b981'; 
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: '#334155' }}>
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span style={{ fontWeight: 'bold', color: barColor }}>{displayPct}%</span>
      </div>
      
      <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.5s ease-in-out' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>This MTD</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>{formatRiel(current)}</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>{formatUSD(current)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Last Month</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>{formatRiel(target)}</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>{formatUSD(target)}</span>
        </div>
      </div>
    </div>
  )
}

function LineChartCard({ title, dataCurrent, dataLast, color }: any) {
  const maxVal = Math.max(...dataCurrent, ...dataLast, 1) 
  
  const formatPoints = (arr: number[]) => {
    return arr.map((val, idx) => {
      const x = (idx / 30) * 1000;
      const y = 200 - ((val / maxVal) * 200);
      return `${x},${y}`;
    }).join(' ');
  }

  const currentPoints = formatPoints(dataCurrent);
  const lastPoints = formatPoints(dataLast);

  return (
    <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#475569' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 'bold' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', background: color }}></div> <span style={{ color: '#334155' }}>This Mth</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '3px', borderBottom: '2px dashed #cbd5e1' }}></div> <span style={{ color: '#94a3b8' }}>Last Mth</span>
          </div>
        </div>
      </div>
      
      <div style={{ width: '100%', height: '220px', position: 'relative' }}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="100" x2="1000" y2="100" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="150" x2="1000" y2="150" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeWidth="2" />

          <polyline points={lastPoints} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
          <polyline points={currentPoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          
          {dataCurrent.map((val: number, idx: number) => {
            const x = (idx / 30) * 1000;
            const y = 200 - ((val / maxVal) * 200);
            return val > 0 ? <circle key={idx} cx={x} cy={y} r="4" fill="#ffffff" stroke={color} strokeWidth="2" /> : null;
          })}
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#94a3b8', fontSize: '10px' }}>
          <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>31</span>
        </div>
      </div>
    </div>
  )
}