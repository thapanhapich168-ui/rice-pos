'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
const formatUSD = (v: number) => `$${Number(v).toFixed(2)}`;
const formatUSDEquiv = (vRiel: number) => `$${(vRiel / EXCHANGE_RATE).toFixed(2)}`;

export default function DashboardPage() {
  const [wholesaleSales, setWholesaleSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [invoiceSummaries, setInvoiceSummaries] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([]) 

  // --- MANUAL ASSET STATES (Now tracking Riel and USD separately) ---
  const [baseCapital, setBaseCapital] = useState<number>(0)
  const [initCashRiel, setInitCashRiel] = useState<number>(0)
  const [initCashUsd, setInitCashUsd] = useState<number>(0)
  const [initQrRiel, setInitQrRiel] = useState<number>(0)
  const [initQrUsd, setInitQrUsd] = useState<number>(0)
  const [persOweRiel, setPersOweRiel] = useState<number>(0)
  const [persOweUsd, setPersOweUsd] = useState<number>(0)

  const [activeTab, setActiveTab] = useState<'wholesale' | 'retail' | 'asset'>('wholesale')
  const [assetFilter, setAssetFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('month')

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // -------------------------
  // LOAD DATA
  // -------------------------
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: salesData } = await supabase.from('sales').select('*')
    setWholesaleSales(salesData || [])

    const { data: summariesData } = await supabase.from('invoice_summaries').select('*')
    setInvoiceSummaries(summariesData || [])

    try {
      const { data: retailData } = await supabase.from('retail_sales').select('*')
      setRetailSales(retailData || [])
    } catch (e) { setRetailSales([]) }

    try {
      const { data: expensesData } = await supabase.from('expenses').select('*')
      setExpenses(expensesData || [])
    } catch (e) { setExpenses([]) }

    try {
      const { data: staffData } = await supabase.from('staff').select('*')
      setStaffList(staffData || [])
    } catch (e) { setStaffList([]) }

    try {
      const keys = ['base_capital', 'initial_cash_riel', 'initial_cash_usd', 'initial_qr_riel', 'initial_qr_usd', 'personal_owe_riel', 'personal_owe_usd'];
      const { data: capData } = await supabase.from('app_settings').select('*').in('setting_key', keys)
      if (capData) {
        capData.forEach(s => {
          if (s.setting_key === 'base_capital') setBaseCapital(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_cash_riel') setInitCashRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_cash_usd') setInitCashUsd(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_qr_riel') setInitQrRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_qr_usd') setInitQrUsd(Number(s.setting_value) || 0)
          if (s.setting_key === 'personal_owe_riel') setPersOweRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'personal_owe_usd') setPersOweUsd(Number(s.setting_value) || 0)
        })
      }
    } catch (e) { console.warn("App settings missing.") }
  }

  async function updateSetting(key: string, val: number) {
    await supabase.from('app_settings').upsert({ setting_key: key, setting_value: val }, { onConflict: 'setting_key' })
  }

  // -------------------------
  // TIME HELPERS
  // -------------------------
  const now = new Date()

  const isToday = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  const isMTD = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  const isLastMonth = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
  }

  const getDayOfMonth = (dateStr: string) => {
    if (!dateStr) return 1;
    return new Date(dateStr).getDate();
  }

  const isAssetMatch = (dateStr: string, filter: string) => {
    if (filter === 'all') return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    d.setHours(0,0,0,0);
    
    if (filter === 'today') return d.getTime() === today.getTime();
    if (filter === 'yesterday') {
      const yest = new Date(today); yest.setDate(yest.getDate() - 1);
      return d.getTime() === yest.getTime();
    }
    if (filter === 'week') {
      const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
      return d >= lastWeek && d <= today;
    }
    if (filter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    return true;
  }

  function calculateDaysWorked(startDateStr: string, filter: string) {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr); start.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    
    if (filter === 'today' || filter === 'yesterday') return 1;
    if (filter === 'week') return 7; 
    
    if (filter === 'month') {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const actualStart = start > firstOfMonth ? start : firstOfMonth;
      const diffTime = today.getTime() - actualStart.getTime();
      return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }
    
    if (filter === 'all') {
      const diffTime = today.getTime() - start.getTime();
      return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }
    return 0;
  }

  // -------------------------
  // CORE CALCULATION ENGINE
  // -------------------------
  const activeSalesData = activeTab === 'wholesale' ? wholesaleSales : retailSales;

  function calculateMetrics(dataSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = dataSet.filter(s => timeFilter(s.created_at))
    let totalSales = 0, pichSales = 0, jingSales = 0, bothSales = 0, momSales = 0
    let totalProfit = 0, pichProfit = 0, jingProfit = 0, bothProfit = 0, momProfit = 0

    filtered.forEach(sale => {
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);
      const revenue = qty * price;
      const profit = (price - cogs) * qty;

      const owner = (sale.owner || '').toLowerCase()
      
      // Isolate Mom's metrics
      if (owner === 'mom') { 
        momSales += revenue; momProfit += profit 
      } else {
        totalSales += revenue; totalProfit += profit;
        if (owner === 'pich') { pichSales += revenue; pichProfit += profit }
        else if (owner === 'jing') { jingSales += revenue; jingProfit += profit }
        else if (owner === 'both') { bothSales += revenue; bothProfit += profit }
      }
    })
    return { totalSales, pichSales, jingSales, bothSales, momSales, totalProfit, pichProfit, jingProfit, bothProfit, momProfit }
  }

  function calculateExpenses(expSet: any[], timeFilter: (d: string) => boolean, period: 'today' | 'mtd' | 'lastMonth') {
    const filtered = expSet.filter(e => timeFilter(e.created_at))
    
    let bizCashRiel = 0, bizCashUsd = 0, bizQrRiel = 0, bizQrUsd = 0;
    let persCashRiel = 0, persCashUsd = 0, persQrRiel = 0, persQrUsd = 0;

    filtered.forEach(exp => {
      const owner = (exp.spender || '').toLowerCase()
      
      // Isolate Mom entirely from Expenses
      if (owner === 'mom') return; 

      let rawAmt = Number(exp.amount || exp.amount_riel || 0);
      let isUsd = (exp.currency || '').toLowerCase() === 'usd';
      
      // Safety auto-detection for USD if user forgot to flip the currency dropdown
      if (!isUsd && rawAmt > 0 && rawAmt < 10000) isUsd = true;

      const method = (exp.payment_method || '').toLowerCase();
      const isQr = method.includes('qr');
      const type = (exp.description || '').toLowerCase()
      const isBiz = type === 'business' || type === 'biz' || type === 'staff';

      if (isBiz) {
        if (isUsd) { isQr ? bizQrUsd += rawAmt : bizCashUsd += rawAmt; }
        else       { isQr ? bizQrRiel += rawAmt : bizCashRiel += rawAmt; }
      } else {
        if (isUsd) { isQr ? persQrUsd += rawAmt : persCashUsd += rawAmt; }
        else       { isQr ? persQrRiel += rawAmt : persCashRiel += rawAmt; }
      }
    })

    let payrollTotal = 0;
    staffList.forEach(staff => {
      const dailyRate = (Number(staff.salary) || 0) / 30;
      if (period === 'today') payrollTotal += dailyRate;
      else if (period === 'mtd') payrollTotal += (dailyRate * calculateDaysWorked(staff.start_date, 'month'));
      else if (period === 'lastMonth') payrollTotal += (Number(staff.salary) || 0); 
    });
    
    // Payroll defaults to Cash Riel
    bizCashRiel += Math.round(payrollTotal);

    return { bizCashRiel, bizCashUsd, bizQrRiel, bizQrUsd, persCashRiel, persCashUsd, persQrRiel, persQrUsd }
  }

  // --- ASSET ENGINE (SPLIT BUCKETS + MOM ISOLATION) ---
  function calculateAssets() {
    let liveCashRiel = initCashRiel, liveCashUsd = initCashUsd;
    let liveQrRiel = initQrRiel, liveQrUsd = initQrUsd;
    let bizCredit = 0;

    const fRetail = retailSales.filter(s => isAssetMatch(s.created_at, assetFilter));
    const fWhole = invoiceSummaries.filter(s => isAssetMatch(s.created_at, assetFilter));
    const fExp = expenses.filter(e => isAssetMatch(e.created_at, assetFilter));

    // Process Retail (Defaults to Cash Riel)
    fRetail.forEach(r => { 
      if ((r.owner || '').toLowerCase() === 'mom') return; // Exclude Mom
      const profit = (Number(r.price_per_bag || 0) - Number(r.cogs_price || 0)) * Number(r.qty || 0);
      liveCashRiel += profit; 
    });

    // Process Wholesale
    fWhole.forEach(inv => {
      if ((inv.owner || '').toLowerCase() === 'mom') return; // Exclude Mom
      bizCredit += Number(inv.balance_due || 0);
      
      const profit = Number(inv.total_profit || 0);
      const paymentMethod = inv.payment_method || 'Cash ៛';

      if (paymentMethod.includes(':')) {
        // Detailed Split Parsing (e.g. "Cash ៛: 1000, QR $: 10")
        const parts = paymentMethod.split(', ');
        let totalPaidRiel = 0;
        let cRiel = 0, cUsd = 0, qRiel = 0, qUsd = 0;

        parts.forEach((p: string) => {
          const [method, amtStr] = p.split(': ');
          const amt = Number(amtStr) || 0;
          if (method.includes('Cash ៛')) { cRiel += amt; totalPaidRiel += amt; }
          if (method.includes('Cash $')) { cUsd += amt; totalPaidRiel += amt * EXCHANGE_RATE; }
          if (method.includes('QR ៛'))   { qRiel += amt; totalPaidRiel += amt; }
          if (method.includes('QR $'))   { qUsd += amt; totalPaidRiel += amt * EXCHANGE_RATE; }
        });

        if (totalPaidRiel > 0) {
          liveCashRiel += profit * (cRiel / totalPaidRiel);
          liveCashUsd  += (profit * ((cUsd * EXCHANGE_RATE) / totalPaidRiel)) / EXCHANGE_RATE;
          liveQrRiel   += profit * (qRiel / totalPaidRiel);
          liveQrUsd    += (profit * ((qUsd * EXCHANGE_RATE) / totalPaidRiel)) / EXCHANGE_RATE;
        }

      } else {
        // Legacy Dropdown Parsing
        if (paymentMethod.includes('QR $')) liveQrUsd += (profit / EXCHANGE_RATE);
        else if (paymentMethod.includes('QR')) liveQrRiel += profit;
        else if (paymentMethod.includes('Cash $')) liveCashUsd += (profit / EXCHANGE_RATE);
        else liveCashRiel += profit; 
      }
    });

    // Process Expenses (Deduct from Assets)
    fExp.forEach(e => { 
      if ((e.spender || '').toLowerCase() === 'mom') return;
      
      let rawAmt = Number(e.amount || e.amount_riel || 0);
      let isUsd = (e.currency || '').toLowerCase() === 'usd';
      if (!isUsd && rawAmt > 0 && rawAmt < 10000) isUsd = true;

      const method = (e.payment_method || '').toLowerCase();
      const isQr = method.includes('qr');
      
      if (isUsd) { isQr ? liveQrUsd -= rawAmt : liveCashUsd -= rawAmt; }
      else       { isQr ? liveQrRiel -= rawAmt : liveCashRiel -= rawAmt; }
    });

    // Deduct Payroll from Cash Riel
    let payroll = 0;
    staffList.forEach(staff => {
      const daily = (Number(staff.salary) || 0) / 30;
      payroll += (daily * calculateDaysWorked(staff.start_date, assetFilter));
    });
    liveCashRiel -= payroll;

    const personalCreditRielEq = persOweRiel + (persOweUsd * EXCHANGE_RATE);
    const liveCashRielEq = liveCashRiel + (liveCashUsd * EXCHANGE_RATE);
    const liveQrRielEq = liveQrRiel + (liveQrUsd * EXCHANGE_RATE);
    
    const totalAsset = baseCapital + liveCashRielEq + liveQrRielEq + bizCredit + personalCreditRielEq;
    
    return { 
      liveCashRiel, liveCashUsd, liveQrRiel, liveQrUsd,
      bizCredit, persOweRiel, persOweUsd, totalAsset 
    };
  }

  // -------------------------
  // RENDER VARIABLES
  // -------------------------
  const todayM = calculateMetrics(activeSalesData, isToday)
  const mtdM = calculateMetrics(activeSalesData, isMTD)
  const lastMonthM = calculateMetrics(activeSalesData, isLastMonth)

  const todayE = calculateExpenses(expenses, isToday, 'today')
  const mtdE = calculateExpenses(expenses, isMTD, 'mtd')
  const lastMonthE = calculateExpenses(expenses, isLastMonth, 'lastMonth')

  const assetData = calculateAssets();

  // Graph Data (Mom is completely ignored)
  const generateDailyArray = (dataSet: any[], isTargetMonth: (d: string) => boolean) => {
    const dailySales = new Array(31).fill(0)
    const dailyProfit = new Array(31).fill(0)
    dataSet.filter(s => isTargetMonth(s.created_at) && (s.owner || '').toLowerCase() !== 'mom').forEach(sale => {
      const dayIdx = getDayOfMonth(sale.created_at) - 1
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);
      if (dayIdx >= 0 && dayIdx < 31) {
        dailySales[dayIdx] += (qty * price);
        dailyProfit[dayIdx] += ((price - cogs) * qty);
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
        <h1 className="page-title" style={{ fontWeight: 'bold', color: '#1e293b' }}>📊 Business Dashboard</h1>
        
        {activeTab !== 'asset' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a', backgroundColor: '#ffffff' }} />
            <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 'bold' }}>To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', color: '#0f172a', backgroundColor: '#ffffff' }} />
            <button onClick={loadData} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s', fontWeight: 'bold' }}>🔄 Refresh</button>
          </div>
        )}
      </div>

      {/* TAB SELECTOR */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#ffffff', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', width: 'fit-content', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('wholesale')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'wholesale' ? '#b58a3d' : 'transparent', color: activeTab === 'wholesale' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>🌾 Wholesale Data</button>
        <button onClick={() => setActiveTab('retail')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'retail' ? '#b58a3d' : 'transparent', color: activeTab === 'retail' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>🛍️ Retail Data</button>
        <button onClick={() => setActiveTab('asset')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'asset' ? '#10b981' : 'transparent', color: activeTab === 'asset' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>💰 Business Asset</button>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div>
        
        {/* ASSET TAB RENDER */}
        {activeTab === 'asset' && (
          <div className="fade-in">
            {/* ASSET FILTERS */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {['today', 'yesterday', 'week', 'month', 'all'].map(f => (
                <button 
                  key={f} onClick={() => setAssetFilter(f as any)} 
                  style={{ padding: '8px 16px', borderRadius: '20px', border: assetFilter === f ? 'none' : '1px solid #cbd5e1', background: assetFilter === f ? '#0f172a' : '#fff', color: assetFilter === f ? '#fff' : '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textTransform: 'capitalize' }}
                >
                  {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'all' ? 'All Time' : f}
                </button>
              ))}
            </div>

            {/* MANUAL INITIALIZATIONS (Row 1) */}
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>⚙️ Manual Starting Balances & Owe</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Base Capital (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={baseCapital === 0 ? '' : baseCapital} onChange={(e) => setBaseCapital(Number(e.target.value))} onBlur={(e) => updateSetting('base_capital', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial Cash (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={initCashRiel === 0 ? '' : initCashRiel} onChange={(e) => setInitCashRiel(Number(e.target.value))} onBlur={(e) => updateSetting('initial_cash_riel', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial Cash ($)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={initCashUsd === 0 ? '' : initCashUsd} onChange={(e) => setInitCashUsd(Number(e.target.value))} onBlur={(e) => updateSetting('initial_cash_usd', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial QR (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={initQrRiel === 0 ? '' : initQrRiel} onChange={(e) => setInitQrRiel(Number(e.target.value))} onBlur={(e) => updateSetting('initial_qr_riel', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial QR ($)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={initQrUsd === 0 ? '' : initQrUsd} onChange={(e) => setInitQrUsd(Number(e.target.value))} onBlur={(e) => updateSetting('initial_qr_usd', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Personal Owe (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={persOweRiel === 0 ? '' : persOweRiel} onChange={(e) => setPersOweRiel(Number(e.target.value))} onBlur={(e) => updateSetting('personal_owe_riel', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Personal Owe ($)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={persOweUsd === 0 ? '' : persOweUsd} onChange={(e) => setPersOweUsd(Number(e.target.value))} onBlur={(e) => updateSetting('personal_owe_usd', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>

              </div>
            </div>

            {/* LIVE ASSET CARDS (Row 2) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              
              <div style={{ background: '#10b981', padding: '24px', borderRadius: '16px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.9, letterSpacing: '0.5px' }}>Total Net Worth</div>
                <div style={{ fontSize: '32px', margin: '8px 0', fontWeight: 'normal' }}>{formatRiel(assetData.totalAsset)}</div>
                <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: 'normal' }}>{formatUSDEquiv(assetData.totalAsset)}</div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>💵 Cash on Hand</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Riel (៛)</span>
                    <div style={{ fontSize: '20px', color: '#334155', fontWeight: 'normal', marginTop: '4px' }}>{formatRiel(assetData.liveCashRiel)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>USD ($)</span>
                    <div style={{ fontSize: '20px', color: '#334155', fontWeight: 'normal', marginTop: '4px' }}>{formatUSD(assetData.liveCashUsd)}</div>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📱 Bank (QR Payments)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Riel (៛)</span>
                    <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'normal', marginTop: '4px' }}>{formatRiel(assetData.liveQrRiel)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>USD ($)</span>
                    <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'normal', marginTop: '4px' }}>{formatUSD(assetData.liveQrUsd)}</div>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📒 Accounts Receivable</div>
                <div style={{ fontSize: '24px', margin: '8px 0', color: '#f59e0b', fontWeight: 'normal' }}>{formatRiel(assetData.bizCredit + assetData.persOweRiel + (assetData.persOweUsd * EXCHANGE_RATE))}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: '1.4' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 'normal' }}>{formatRiel(assetData.bizCredit)}</span> <span style={{fontWeight: 'bold'}}>(Biz Debt)</span><br/>
                  <span style={{ color: '#b58a3d', fontWeight: 'normal' }}>{formatRiel(assetData.persOweRiel)} / {formatUSD(assetData.persOweUsd)}</span> <span style={{fontWeight: 'bold'}}>(Pers Debt)</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* WHOLESALE / RETAIL TAB RENDER */}
        {activeTab !== 'asset' && (
          <div className="fade-in">
            {/* ROW 1: TODAY'S METRICS */}
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📅 TODAY'S PERFORMANCE</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="Today Sales" total={todayM.totalSales} pich={todayM.pichSales} jing={todayM.jingSales} both={todayM.bothSales} mom={todayM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              <ComplexCard title="Today Profit" total={todayM.totalProfit} pich={todayM.pichProfit} jing={todayM.jingProfit} both={todayM.bothProfit} mom={todayM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="Today Biz Expenses" cR={todayE.bizCashRiel} cU={todayE.bizCashUsd} qR={todayE.bizQrRiel} qU={todayE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="Today Personal Exp" cR={todayE.persCashRiel} cU={todayE.persCashUsd} qR={todayE.persQrRiel} qU={todayE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

            {/* ROW 2: MONTH TO DATE METRICS */}
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📈 MONTH TO DATE (MTD)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="MTD Sales" total={mtdM.totalSales} pich={mtdM.pichSales} jing={mtdM.jingSales} both={mtdM.bothSales} mom={mtdM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              <ComplexCard title="MTD Profit" total={mtdM.totalProfit} pich={mtdM.pichProfit} jing={mtdM.jingProfit} both={mtdM.bothProfit} mom={mtdM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="MTD Biz Expenses" cR={mtdE.bizCashRiel} cU={mtdE.bizCashUsd} qR={mtdE.bizQrRiel} qU={mtdE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="MTD Personal Exp" cR={mtdE.persCashRiel} cU={mtdE.persCashUsd} qR={mtdE.persQrRiel} qU={mtdE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

            {/* ROW 3: HEALTH BARS (COMPARE VS LAST MONTH) */}
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>⚖️ COMPARE MTD VS LAST MONTH</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
              <HealthBar title="Sales" current={mtdM.totalSales} target={lastMonthM.totalSales} color="#2563eb" />
              <HealthBar title="Profit" current={mtdM.totalProfit} target={lastMonthM.totalProfit} color="#10b981" />
              
              {activeTab === 'wholesale' && (
                <>
                  <HealthBar title="Biz Expenses" current={mtdE.bizCashRiel + mtdE.bizQrRiel + (mtdE.bizCashUsd*EXCHANGE_RATE) + (mtdE.bizQrUsd*EXCHANGE_RATE)} target={lastMonthE.bizCashRiel + lastMonthE.bizQrRiel + (lastMonthE.bizCashUsd*EXCHANGE_RATE) + (lastMonthE.bizQrUsd*EXCHANGE_RATE)} color="#b91c1c" reverseLogic />
                  <HealthBar title="Personal Expenses" current={mtdE.persCashRiel + mtdE.persQrRiel + (mtdE.persCashUsd*EXCHANGE_RATE) + (mtdE.persQrUsd*EXCHANGE_RATE)} target={lastMonthE.persCashRiel + lastMonthE.persQrRiel + (lastMonthE.persCashUsd*EXCHANGE_RATE) + (lastMonthE.persQrUsd*EXCHANGE_RATE)} color="#f59e0b" reverseLogic />
                </>
              )}
            </div>

            {/* ROW 4: GRAPHS (Pure SVG) */}
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📉 TREND ANALYSIS (Day 1 - 31)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '40px' }}>
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Sales: This Month vs Last Month`} dataCurrent={thisMonthData.dailySales} dataLast={lastMonthData.dailySales} color="#2563eb" />
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Profit: This Month vs Last Month`} dataCurrent={thisMonthData.dailyProfit} dataLast={lastMonthData.dailyProfit} color="#10b981" />
            </div>
          </div>
        )}

      </div>

      {/* GLOBAL STYLES */}
      <style jsx global>{`
        /* Force inherit font for all inputs and enable tabular numbers for exact matching height */
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }
        
        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

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
        .section-divider {
          font-size: 15px; 
          color: #475569; 
          margin-bottom: 16px; 
          border-bottom: 1px solid #e2e8f0; 
          padding-bottom: 6px;
        }
        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
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
      <h3 style={{ margin: 0, fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{ margin: '8px 0 4px 0', fontSize: '22px', color: color, fontWeight: 'normal' }}>{formatRiel(total)}</h2>
      </div>
      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', fontWeight: 'normal' }}>{formatUSDEquiv(total)}</div>
      
      {!hideSubboxes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Pich</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(pich)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Jing</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(jing)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Both</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(both)}</div>
          </div>
          <div style={{ background: '#fefcf3', padding: '6px', borderRadius: '6px', textAlign: 'center', border: '1px solid #fde047' }}>
            <div style={{ fontSize: '10px', color: '#ca8a04', textTransform: 'uppercase', fontWeight: 'bold' }}>Mom</div>
            <div style={{ fontSize: '12px', color: '#854d0e', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(mom)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExpenseBreakdownCard({ title, cR = 0, cU = 0, qR = 0, qU = 0, color = '#1e293b' }: any) {
  const totalRielEquiv = cR + qR + (cU * 4000) + (qU * 4000);
  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: 0, fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{title}</h3>
      <div style={{ margin: '8px 0 16px 0', fontSize: '22px', color: color, fontWeight: 'normal' }}>
        {formatRiel(totalRielEquiv)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>RIEL (៛)</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>Cash: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatRiel(cR)}</span></div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>QR: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatRiel(qR)}</span></div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>USD ($)</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>Cash: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatUSD(cU)}</span></div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>QR: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatUSD(qU)}</span></div>
        </div>
      </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: '#334155', fontWeight: 'bold' }}>
        <span>{title}</span>
        <span style={{ color: barColor }}>{displayPct}%</span>
      </div>
      
      <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.5s ease-in-out' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>This MTD</span>
          <span style={{ fontSize: '13px', color: '#334155', fontWeight: 'normal' }}>{formatRiel(current)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Last Month</span>
          <span style={{ fontSize: '13px', color: '#334155', fontWeight: 'normal' }}>{formatRiel(target)}</span>
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
        <h3 style={{ margin: 0, fontSize: '14px', color: '#475569', fontWeight: 'bold' }}>{title}</h3>
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