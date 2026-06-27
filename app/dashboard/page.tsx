'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
const formatUSD = (v: number) => `$${(v / EXCHANGE_RATE).toFixed(2)}`;

// Smart Converter: Safely converts any database value to Riel (mainly used for Expenses)
const parseToRiel = (amount: any, currency?: string) => {
  const val = Number(amount || 0);
  if (val === 0) return 0;
  
  if (currency === 'USD' || currency === 'usd') return val * EXCHANGE_RATE;
  if (currency === 'KHR' || currency === 'khr' || currency === 'riel') return val;
  
  return (Math.abs(val) < 10000) ? val * EXCHANGE_RATE : val;
}

export default function DashboardPage() {
  const [wholesaleSales, setWholesaleSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<'wholesale' | 'retail'>('wholesale')

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // -------------------------
  // LOAD DATA (WITH FAILSAFES)
  // -------------------------
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // 1. Fetch Wholesale Sales
    const { data: salesData } = await supabase.from('sales').select('*')
    setWholesaleSales(salesData || [])

    // 2. Fetch Retail Sales
    try {
      const { data: retailData, error: retailError } = await supabase.from('retail_sales').select('*')
      if (!retailError && retailData) {
        setRetailSales(retailData)
      } else {
        setRetailSales([])
      }
    } catch (e) {
      console.warn("Retail table missing, defaulting to empty.", e)
      setRetailSales([])
    }

    // 3. Fetch Expenses 
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

  const activeSalesData = activeTab === 'wholesale' ? wholesaleSales : retailSales;
  const filteredSales = filterByDate(activeSalesData)

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
  // CORE CALCULATION ENGINE
  // -------------------------
  function calculateMetrics(dataSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = dataSet.filter(s => timeFilter(s.created_at))
    
    let totalSales = 0, pichSales = 0, jingSales = 0, bothSales = 0, momSales = 0
    let totalProfit = 0, pichProfit = 0, jingProfit = 0, bothProfit = 0, momProfit = 0

    filtered.forEach(sale => {
      // Calculate from raw row data (qty * price)
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);

      const revenue = qty * price;
      const profit = (price - cogs) * qty;

      totalSales += revenue
      totalProfit += profit

      const owner = (sale.owner || '').toLowerCase()
      if (owner === 'pich') { pichSales += revenue; pichProfit += profit }
      else if (owner === 'jing') { jingSales += revenue; jingProfit += profit }
      else if (owner === 'both') { bothSales += revenue; bothProfit += profit }
      else if (owner === 'mom') { momSales += revenue; momProfit += profit }
    })

    return { totalSales, pichSales, jingSales, bothSales, momSales, totalProfit, pichProfit, jingProfit, bothProfit, momProfit }
  }

  function calculateExpenses(expSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = expSet.filter(e => timeFilter(e.created_at))
    
    let bizTotal = 0
    let personalTotal = 0, pichPers = 0, jingPers = 0, bothPers = 0, momPers = 0

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
        else if (owner === 'mom') momPers += amt
      }
    })

    return { bizTotal, personalTotal, pichPers, jingPers, bothPers, momPers }
  }

  const todayM = calculateMetrics(activeSalesData, isToday)
  const mtdM = calculateMetrics(activeSalesData, isMTD)
  const lastMonthM = calculateMetrics(activeSalesData, isLastMonth)

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
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);

      const revenue = qty * price;
      const profit = (price - cogs) * qty;

      if (dayIdx >= 0 && dayIdx < 31) {
        dailySales[dayIdx] += revenue
        dailyProfit[dayIdx] += profit
      }
    })
    return { dailySales, dailyProfit }
  }

  const thisMonthData = generateDailyArray(activeSalesData, isMTD)
  const lastMonthData = generateDailyArray(activeSalesData, isLastMonth)

  // -------------------------
  // UI COMPONENTS
  // -------------------------
  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <h1 className="page-title">📊 Business Dashboard</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Ensure input text is dark and 16px to prevent iOS Zoom */}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }}
          />
          <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 'bold' }}>To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '16px', color: '#0f172a', backgroundColor: '#ffffff' }}
          />
          <button 
            onClick={loadData} 
            style={{ padding: '10px 16px', background: '#b59410', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', transition: 'background 0.2s' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* TAB SELECTOR */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#ffffff', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
        <button 
          onClick={() => setActiveTab('wholesale')} 
          style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', background: activeTab === 'wholesale' ? '#b58a3d' : 'transparent', color: activeTab === 'wholesale' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >
          🌾 Wholesale Data
        </button>
        <button 
          onClick={() => setActiveTab('retail')} 
          style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', background: activeTab === 'retail' ? '#b58a3d' : 'transparent', color: activeTab === 'retail' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >
          🛍️ Retail Data
        </button>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div>
        
        {/* ROW 1: TODAY'S METRICS */}
        <h2 className="section-divider">📅 TODAY'S PERFORMANCE</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <ComplexCard title="Today Sales" total={todayM.totalSales} pich={todayM.pichSales} jing={todayM.jingSales} both={todayM.bothSales} mom={todayM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
          <ComplexCard title="Today Profit" total={todayM.totalProfit} pich={todayM.pichProfit} jing={todayM.jingProfit} both={todayM.bothProfit} mom={todayM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
          
          {/* Expenses are usually company-wide, but we'll show them on Wholesale, and hide on Retail to keep Retail pure */}
          {activeTab === 'wholesale' && (
            <>
              <ComplexCard title="Today Biz Expenses" total={todayE.bizTotal} hideSubboxes color="#b91c1c" />
              <ComplexCard title="Today Personal Exp" total={todayE.personalTotal} pich={todayE.pichPers} jing={todayE.jingPers} both={todayE.bothPers} mom={todayE.momPers} color="#f59e0b" />
            </>
          )}
        </div>

        {/* ROW 2: MONTH TO DATE METRICS */}
        <h2 className="section-divider">📈 MONTH TO DATE (MTD)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <ComplexCard title="MTD Sales" total={mtdM.totalSales} pich={mtdM.pichSales} jing={mtdM.jingSales} both={mtdM.bothSales} mom={mtdM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
          <ComplexCard title="MTD Profit" total={mtdM.totalProfit} pich={mtdM.pichProfit} jing={mtdM.jingProfit} both={mtdM.bothProfit} mom={mtdM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
          
          {activeTab === 'wholesale' && (
            <>
              <ComplexCard title="MTD Biz Expenses" total={mtdE.bizTotal} hideSubboxes color="#b91c1c" />
              <ComplexCard title="MTD Personal Exp" total={mtdE.personalTotal} pich={mtdE.pichPers} jing={mtdE.jingPers} both={mtdE.bothPers} mom={mtdE.momPers} color="#f59e0b" />
            </>
          )}
        </div>

        {/* ROW 3: HEALTH BARS (COMPARE VS LAST MONTH) */}
        <h2 className="section-divider">⚖️ COMPARE MTD VS LAST MONTH</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
          <HealthBar title="Sales" current={mtdM.totalSales} target={lastMonthM.totalSales} color="#2563eb" />
          <HealthBar title="Profit" current={mtdM.totalProfit} target={lastMonthM.totalProfit} color="#10b981" />
          
          {activeTab === 'wholesale' && (
            <>
              <HealthBar title="Biz Expenses" current={mtdE.bizTotal} target={lastMonthE.bizTotal} color="#b91c1c" reverseLogic />
              <HealthBar title="Personal Expenses" current={mtdE.personalTotal} target={lastMonthE.personalTotal} color="#f59e0b" reverseLogic />
            </>
          )}
        </div>

        {/* ROW 4: GRAPHS (Pure SVG) */}
        <h2 className="section-divider">📉 TREND ANALYSIS (Day 1 - 31)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '40px' }}>
          <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Sales: This Month vs Last Month`} dataCurrent={thisMonthData.dailySales} dataLast={lastMonthData.dailySales} color="#2563eb" />
          <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Profit: This Month vs Last Month`} dataCurrent={thisMonthData.dailyProfit} dataLast={lastMonthData.dailyProfit} color="#10b981" />
        </div>

      </div>

      {/* GLOBAL STYLES */}
      <style jsx global>{`
        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          min-height: 100vh; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
        }
        .header-container { 
          margin-bottom: 24px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .page-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #4a3b1b; 
          margin: 0; 
        }
        .section-divider {
          font-size: 16px; 
          color: #475569; 
          margin-bottom: 16px; 
          border-bottom: 2px solid #e2e8f0; 
          padding-bottom: 6px;
        }

        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
          }
          .header-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
        }
      `}</style>
    </div>
  )
}

// -------------------------
// REUSABLE DASHBOARD COMPONENTS
// -------------------------

function ComplexCard({ title, total, pich = 0, jing = 0, both = 0, mom = 0, hideSubboxes = false, color = '#1e293b' }: any) {
  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{ margin: '8px 0 4px 0', fontSize: '24px', fontWeight: 'bold', color: color }}>{formatRiel(total)}</h2>
      </div>
      <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '16px' }}>{formatUSD(total)}</div>
      
      {!hideSubboxes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Pich</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(pich)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Jing</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(jing)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Both</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', marginTop: '2px' }}>{formatRiel(both)}</div>
          </div>
          <div style={{ background: '#fefcf3', padding: '6px', borderRadius: '6px', textAlign: 'center', border: '1px solid #fde047' }}>
            <div style={{ fontSize: '10px', color: '#ca8a04', fontWeight: 'bold', textTransform: 'uppercase' }}>Mom</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#854d0e', marginTop: '2px' }}>{formatRiel(mom)}</div>
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
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
          <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Last Month</span>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>{formatRiel(target)}</span>
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
    <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#475569' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 'bold' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', background: color, borderRadius: '2px' }}></div> <span style={{ color: '#334155' }}>This Mth</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', borderBottom: '2px dashed #cbd5e1' }}></div> <span style={{ color: '#94a3b8' }}>Last Mth</span>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}>
          <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>31</span>
        </div>
      </div>
    </div>
  )
}