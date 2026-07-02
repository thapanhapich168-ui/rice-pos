'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- CONSTANTS & FORMATTERS ---
const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
const formatUSD = (v: number) => `$${Number(v).toFixed(2)}`;
const formatUSDEquiv = (vRiel: number) => `$${(vRiel / EXCHANGE_RATE).toFixed(2)}`;
const formatNumber = (v: number) => new Intl.NumberFormat('en-US').format(v);

export default function DashboardPage() {
  const [wholesaleSales, setWholesaleSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [invoiceSummaries, setInvoiceSummaries] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([]) 
  const [inventoryList, setInventoryList] = useState<any[]>([]) 
  const [accountsPayable, setAccountsPayable] = useState<any[]>([]) 
  const [cogsSettlements, setCogsSettlements] = useState<any[]>([]) 

  // --- MANUAL ASSET STATES ---
  const [baseCapital, setBaseCapital] = useState<number>(0)
  const [initCashRiel, setInitCashRiel] = useState<number>(0)
  const [initCashUsd, setInitCashUsd] = useState<number>(0)
  const [initQrRiel, setInitQrRiel] = useState<number>(0)
  const [initQrUsd, setInitQrUsd] = useState<number>(0)
  
  // AR & AP Trackers
  const [familyOweRiel, setFamilyOweRiel] = useState<number>(0)
  const [familyOweUsd, setFamilyOweUsd] = useState<number>(0)
  const [persOweRiel, setPersOweRiel] = useState<number>(0) // Owe to Mom

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
      const { data: prodData } = await supabase.from('products').select('*').order('id')
      setInventoryList(prodData || [])
    } catch (e) { setInventoryList([]) }

    try {
      const { data: apData } = await supabase.from('accounts_payable').select('*').order('created_at', { ascending: false })
      setAccountsPayable(apData || [])
    } catch (e) { setAccountsPayable([]) }

    try {
      const { data: cogsData } = await supabase.from('cogs_settlements').select('*')
      setCogsSettlements(cogsData || [])
    } catch (e) { setCogsSettlements([]) }

    try {
      const keys = ['base_capital', 'initial_cash_riel', 'initial_cash_usd', 'initial_qr_riel', 'initial_qr_usd', 'personal_owe_riel', 'family_owe_riel', 'family_owe_usd'];
      const { data: capData } = await supabase.from('app_settings').select('*').in('setting_key', keys)
      if (capData) {
        capData.forEach(s => {
          if (s.setting_key === 'base_capital') setBaseCapital(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_cash_riel') setInitCashRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_cash_usd') setInitCashUsd(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_qr_riel') setInitQrRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'initial_qr_usd') setInitQrUsd(Number(s.setting_value) || 0)
          if (s.setting_key === 'personal_owe_riel') setPersOweRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'family_owe_riel') setFamilyOweRiel(Number(s.setting_value) || 0)
          if (s.setting_key === 'family_owe_usd') setFamilyOweUsd(Number(s.setting_value) || 0)
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
    
    let cR = 0, cU = 0, qR = 0, qU = 0

    filtered.forEach(sale => {
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);
      const revenue = qty * price;
      const profit = (price - cogs) * qty;

      const owner = (sale.owner || '').toLowerCase()
      const methodStr = (sale.payment_method || 'Cash ៛')

      if (activeTab === 'retail') {
        if (methodStr.includes(':')) {
           const parts = methodStr.split(',');
           parts.forEach((p: string) => {
             const [m, amtStr] = p.split(':');
             const pAmt = Number(amtStr) || 0;
             if (m.includes('Cash ៛')) cR += pAmt;
             else if (m.includes('Cash $')) cU += pAmt; 
             else if (m.includes('QR ៛') || m.includes('Mom QR ៛')) qR += pAmt;
             else if (m.includes('QR $') || m.includes('Mom QR $')) qU += pAmt;
             else cR += pAmt;
           });
        } else {
           if (methodStr.includes('Cash ៛')) cR += revenue;
           else if (methodStr.includes('Cash $')) cU += (revenue / EXCHANGE_RATE);
           else if (methodStr.includes('QR ៛') || methodStr.includes('Mom QR ៛')) qR += revenue;
           else if (methodStr.includes('QR $') || methodStr.includes('Mom QR $')) qU += (revenue / EXCHANGE_RATE);
           else cR += revenue; 
        }
      }

      if (owner === 'mom') { 
        momSales += revenue; momProfit += profit 
      } else {
        totalSales += revenue; totalProfit += profit;
        if (owner === 'pich') { pichSales += revenue; pichProfit += profit }
        else if (owner === 'jing') { jingSales += revenue; jingProfit += profit }
        else if (owner === 'both') { bothSales += revenue; bothProfit += profit }
      }
    })
    return { totalSales, pichSales, jingSales, bothSales, momSales, totalProfit, pichProfit, jingProfit, bothProfit, momProfit, cR, cU, qR, qU }
  }

  function calculateExpenses(expSet: any[], timeFilter: (d: string) => boolean, period: 'today' | 'mtd' | 'lastMonth') {
    const filtered = expSet.filter(e => timeFilter(e.created_at))
    
    let bizCashRiel = 0, bizCashUsd = 0, bizQrRiel = 0, bizQrUsd = 0;
    let persCashRiel = 0, persCashUsd = 0, persQrRiel = 0, persQrUsd = 0;

    filtered.forEach(exp => {
      const owner = (exp.spender || '').toLowerCase()
      if (owner === 'mom') return; 

      let amtRiel = Number(exp.amount_riel || 0);
      let amtUsd = Number(exp.amount || 0);
      if (amtRiel < 0) return;

      const methodStr = (exp.payment_method || '').toLowerCase();
      const type = (exp.description || '').toLowerCase()
      const isBiz = type === 'business' || type === 'biz' || type === 'staff';

      const processSplit = (m: string, aRiel: number, aUsd: number) => {
        const isQr = m.includes('qr');
        if (isBiz) {
          if (aUsd > 0) { isQr ? bizQrUsd += aUsd : bizCashUsd += aUsd; }
          else          { isQr ? bizQrRiel += aRiel : bizCashRiel += aRiel; }
        } else {
          if (aUsd > 0) { isQr ? persQrUsd += aUsd : persCashUsd += aUsd; }
          else          { isQr ? persQrRiel += aRiel : persCashRiel += aRiel; }
        }
      };

      if (methodStr.includes(':')) {
         const parts = methodStr.split(',');
         parts.forEach((p: string) => {
           const [m, amtString] = p.split(':');
           let pAmt = Number(amtString) || 0;
           let pUsd = 0; let pRiel = pAmt;
           if (m.includes('$')) {
             pUsd = pAmt;
             pRiel = pAmt * EXCHANGE_RATE;
           }
           processSplit(m.trim(), Math.abs(pRiel), Math.abs(pUsd));
         });
      } else {
         processSplit(methodStr, Math.abs(amtRiel), Math.abs(amtUsd));
      }
    })

    let payrollTotal = 0;
    staffList.forEach(staff => {
      const dailyRate = (Number(staff.salary) || 0) / 30;
      if (period === 'today') payrollTotal += dailyRate;
      else if (period === 'mtd') payrollTotal += (dailyRate * calculateDaysWorked(staff.start_date, 'month'));
      else if (period === 'lastMonth') payrollTotal += (Number(staff.salary) || 0); 
    });
    bizCashRiel += Math.round(payrollTotal);

    return { bizCashRiel, bizCashUsd, bizQrRiel, bizQrUsd, persCashRiel, persCashUsd, persQrRiel, persQrUsd }
  }

  // --- ASSET ENGINE (STRICT MATHEMATICAL RULES) ---
  function calculateAssets() {
    let liveCashRiel = initCashRiel, liveCashUsd = initCashUsd;
    let liveQrRiel = initQrRiel, liveQrUsd = initQrUsd;
    let bizCredit = 0;
    let totalSupplierAP = 0;
    let momCollected = 0; 
    let momPaidOut = 0;   
    let riceStockValue = 0;

    inventoryList.forEach(p => {
      riceStockValue += (Number(p.stock || 0) * Number(p.cost_price || 0));
    });

    accountsPayable.forEach(ap => {
      if (ap.status === 'Unpaid') totalSupplierAP += Number(ap.amount_riel || 0);
    });

    const fRetail = retailSales.filter(s => isAssetMatch(s.created_at, assetFilter));
    const fWhole = invoiceSummaries.filter(s => isAssetMatch(s.created_at, assetFilter));
    const fExp = expenses.filter(e => isAssetMatch(e.created_at, assetFilter));

    const addFunds = (amtRiel: number, method: string) => {
      const m = method || 'Cash ៛';
      if (m.includes('Cash ៛')) liveCashRiel += amtRiel;
      else if (m.includes('Cash $')) liveCashUsd += (amtRiel / EXCHANGE_RATE);
      else if (m.includes('QR ៛') || m.includes('Mom QR ៛')) liveQrRiel += amtRiel;
      else if (m.includes('QR $') || m.includes('Mom QR $')) liveQrUsd += (amtRiel / EXCHANGE_RATE);
      else liveCashRiel += amtRiel;
    }

    const subFunds = (amtRiel: number, method: string) => {
      const m = method || 'Cash ៛';
      if (m.includes('Cash ៛')) liveCashRiel -= amtRiel;
      else if (m.includes('Cash $')) liveCashUsd -= (amtRiel / EXCHANGE_RATE);
      else if (m.includes('QR ៛') || m.includes('Mom QR ៛')) liveQrRiel -= amtRiel;
      else if (m.includes('QR $') || m.includes('Mom QR $')) liveQrUsd -= (amtRiel / EXCHANGE_RATE);
      else liveCashRiel -= amtRiel;
    }

    // --- MOM AR (COGS) CALCULATION ---
    let momTotalCogs = 0;
    let momTotalPaid = 0;

    retailSales.forEach(r => {
      if ((r.owner || '').toLowerCase() === 'mom') {
        let qty = Number(r.qty || 0);
        let price = Number(r.cogs_price || 0);
        let amt = qty * price;
        let desc = r.custom_rice_type || r.rice_type || '';
        if (!desc.includes('សេវាដឹក') && !(desc.includes('បាវ') && price === 0)) {
           if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) amt = -Math.abs(amt);
           else amt = Math.abs(amt);
           momTotalCogs += amt;
        }
      }
    });

    wholesaleSales.forEach(w => {
      if ((w.owner || '').toLowerCase() === 'mom') {
        let qty = Number(w.qty || 0);
        let price = Number(w.cogs_price || 0);
        let amt = qty * price;
        let desc = w.custom_rice_type || w.rice_type || '';
        if (!desc.includes('សេវាដឹក') && !(desc.includes('បាវ') && price === 0)) {
           if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) amt = -Math.abs(amt);
           else amt = Math.abs(amt);
           momTotalCogs += amt;
        }
      }
    });

    cogsSettlements.forEach(c => {
      if ((c.owner_name || '').toLowerCase() === 'mom') momTotalPaid += Number(c.paid_amount || 0);
    });

    const momCogsAr = Math.max(0, momTotalCogs - momTotalPaid);
    // --------------------------

    fRetail.forEach(r => { 
      const isMom = (r.owner || '').toLowerCase() === 'mom';
      const totalSale = Number(r.qty || 0) * Number(r.price_per_bag || 0);
      
      if (isMom) momCollected += totalSale;
      addFunds(totalSale, r.payment_method);
    });

    fWhole.forEach(inv => {
      const isMom = (inv.owner || '').toLowerCase() === 'mom';
      const owed = Number(inv.balance_due || 0);
      
      if (!isMom) bizCredit += owed; 
      
      const totalSale = Number(inv.total_sales || 0);
      const actuallyPaid = totalSale - owed;

      if (actuallyPaid > 0) {
        if (isMom) momCollected += actuallyPaid; 

        const paymentMethod = inv.payment_method || 'Cash ៛';
        if (paymentMethod.includes(':')) {
          const parts = paymentMethod.split(',');
          parts.forEach((p: string) => {
            const [m, amtStr] = p.split(':');
            let amtRiel = Number(amtStr) || 0;
            if (m.includes('$')) amtRiel *= EXCHANGE_RATE;
            addFunds(amtRiel, m.trim());
          });
        } else {
          addFunds(actuallyPaid, paymentMethod);
        }
      }
    });

    let totalOpExp = 0;

    fExp.forEach(e => { 
      const owner = (e.spender || '').toLowerCase();
      if (owner === 'mom') return; 

      let amtRiel = Number(e.amount_riel || 0);

      if (amtRiel < 0) { 
        const remarks = (e.remarks || '').toLowerCase();
        if (remarks.includes('payment from') && !remarks.includes('cogs')) return;
        if (remarks.includes('account settled') && !remarks.includes('cogs')) return;
        
        if (e.payment_method?.includes(':')) {
          const parts = e.payment_method.split(',');
          parts.forEach((p: string) => {
            const [m, amtStr] = p.split(':');
            let bucketAmt = Number(amtStr) || 0;
            if (m.includes('$')) bucketAmt *= EXCHANGE_RATE;
            addFunds(Math.abs(bucketAmt), m.trim());
          });
        } else {
          addFunds(Math.abs(amtRiel), e.payment_method || 'Cash ៛');
        }

      } else { 
        const remarks = (e.remarks || '').toLowerCase();
        if (remarks.includes("settled mom's account liability")) {
          momPaidOut += Math.abs(amtRiel); 
        }

        if (e.payment_method?.includes(':')) {
          const parts = e.payment_method.split(',');
          parts.forEach((p: string) => {
            const [m, amtStr] = p.split(':');
            let bucketAmt = Number(amtStr) || 0;
            if (m.includes('$')) bucketAmt *= EXCHANGE_RATE;
            subFunds(Math.abs(bucketAmt), m.trim());
          });
        } else {
          subFunds(Math.abs(amtRiel), e.payment_method || 'Cash ៛');
        }

        const desc = (e.description || '').toUpperCase();
        if (!desc.includes('COGS')) totalOpExp += Math.abs(amtRiel); 
      }
    });

    let payroll = 0;
    staffList.forEach(staff => {
      const daily = (Number(staff.salary) || 0) / 30;
      payroll += (daily * calculateDaysWorked(staff.start_date, assetFilter));
    });
    liveCashRiel -= payroll;

    const liveMomLiability = Math.max(0, persOweRiel + momCollected - momPaidOut); 
    const familyArRielEq = familyOweRiel + (familyOweUsd * EXCHANGE_RATE);
    
    const liquidAssets = baseCapital + (liveCashRiel + (liveCashUsd * EXCHANGE_RATE)) + (liveQrRiel + (liveQrUsd * EXCHANGE_RATE));
    const netWorth = liquidAssets + bizCredit + familyArRielEq + momCogsAr - totalSupplierAP - liveMomLiability;
    
    return { 
      liveCashRiel, liveCashUsd, liveQrRiel, liveQrUsd,
      bizCredit, familyArRielEq, momCogsAr, liveMomLiability, totalSupplierAP,
      netWorth, totalOpExp, riceStockValue
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
              <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>⚙️ Manual Starting Balances</h3>
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
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Family Owes Me (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={familyOweRiel === 0 ? '' : familyOweRiel} onChange={(e) => setFamilyOweRiel(Number(e.target.value))} onBlur={(e) => updateSetting('family_owe_riel', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Family Owes Me ($)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={familyOweUsd === 0 ? '' : familyOweUsd} onChange={(e) => setFamilyOweUsd(Number(e.target.value))} onBlur={(e) => updateSetting('family_owe_usd', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Mom Starting Owe (៛)</label>
                  <input type="text" inputMode="decimal" className="no-spinners" value={persOweRiel === 0 ? '' : persOweRiel} onChange={(e) => setPersOweRiel(Number(e.target.value))} onBlur={(e) => updateSetting('personal_owe_riel', Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px', fontWeight: 'normal' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: '#10b981', padding: '24px', borderRadius: '16px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.9, letterSpacing: '0.5px' }}>Total Net Worth</div>
                <div style={{ fontSize: '32px', margin: '8px 0 0 0', fontWeight: 'normal' }}>{formatRiel(assetData.netWorth)}</div>
              </div>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📦 Total Rice Stock Asset</div>
                <div style={{ fontSize: '32px', margin: '8px 0 0 0', color: '#b58a3d', fontWeight: 'normal' }}>{formatRiel(assetData.riceStockValue)}</div>
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
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📒 Accounts Receivable (AR)</div>
                <div style={{ fontSize: '24px', margin: '8px 0', color: '#f59e0b', fontWeight: 'bold' }}>{formatRiel(assetData.bizCredit + assetData.familyArRielEq + assetData.momCogsAr)}</div>
                
                {/* 🚀 FIXED 3-COLUMN LAYOUT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Biz AR</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.bizCredit)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Personal AR</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.familyArRielEq)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Mom AR (COGS)</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.momCogsAr)}</div>
                  </div>
                </div>
                {/* END FIX */}

              </div>
              
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📉 Accounts Payable (Suppliers)</div>
                <div style={{ fontSize: '24px', margin: '8px 0 0 0', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(assetData.totalSupplierAP)}</div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📉 Personal Liability (Owe Mom)</div>
                <div style={{ fontSize: '24px', margin: '8px 0 0 0', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(assetData.liveMomLiability)}</div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold', marginBottom: '8px' }}>📉 Total Operating Expenses</div>
                <div style={{ fontSize: '24px', margin: '8px 0 0 0', color: '#ef4444', fontWeight: 'bold' }}>{formatRiel(assetData.totalOpExp)}</div>
              </div>
            </div>

            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1e293b', textTransform: 'uppercase' }}>🌾 Detailed Inventory Valuation</h3>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '32px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '600px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold' }}>Product Name</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>Stock Qty</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold' }}>Cost Price (៛)</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold' }}>Total Value (៛)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryList.map(item => {
                      const qty = Number(item.stock || 0);
                      const cost = Number(item.cost_price || 0);
                      const total = qty * cost;
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 'normal' }}>{item.name}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: qty < 10 ? '#ef4444' : '#334155', fontWeight: 'normal' }}>{formatNumber(qty)}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#334155', fontWeight: 'normal' }}>{formatRiel(cost)}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#10b981', fontWeight: 'normal' }}>{formatRiel(total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={3} style={{ padding: '16px 20px', textAlign: 'right', color: '#334155', fontWeight: 'bold' }}>Total Inventory Asset Value</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#b58a3d', fontWeight: 'bold', fontSize: '16px' }}>{formatRiel(assetData.riceStockValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WHOLESALE / RETAIL TAB RENDER */}
        {activeTab !== 'asset' && (
          <div className="fade-in">
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📅 TODAY'S PERFORMANCE</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="Today Sales" total={todayM.totalSales} pich={todayM.pichSales} jing={todayM.jingSales} both={todayM.bothSales} mom={todayM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              {activeTab === 'retail' && <ExpenseBreakdownCard title="Retail Payments" cR={todayM.cR} cU={todayM.cU} qR={todayM.qR} qU={todayM.qU} color="#3b82f6" />}
              <ComplexCard title="Today Profit" total={todayM.totalProfit} pich={todayM.pichProfit} jing={todayM.jingProfit} both={todayM.bothProfit} mom={todayM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="Today Biz Expenses" cR={todayE.bizCashRiel} cU={todayE.bizCashUsd} qR={todayE.bizQrRiel} qU={todayE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="Today Personal Exp" cR={todayE.persCashRiel} cU={todayE.persCashUsd} qR={todayE.persQrRiel} qU={todayE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📈 MONTH TO DATE (MTD)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="MTD Sales" total={mtdM.totalSales} pich={mtdM.pichSales} jing={mtdM.jingSales} both={mtdM.bothSales} mom={mtdM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              {activeTab === 'retail' && <ExpenseBreakdownCard title="Retail Payments" cR={mtdM.cR} cU={mtdM.cU} qR={mtdM.qR} qU={mtdM.qU} color="#3b82f6" />}
              <ComplexCard title="MTD Profit" total={mtdM.totalProfit} pich={mtdM.pichProfit} jing={mtdM.jingProfit} both={mtdM.bothProfit} mom={mtdM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="MTD Biz Expenses" cR={mtdE.bizCashRiel} cU={mtdE.bizCashUsd} qR={mtdE.bizQrRiel} qU={mtdE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="MTD Personal Exp" cR={mtdE.persCashRiel} cU={mtdE.persCashUsd} qR={mtdE.persQrRiel} qU={mtdE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

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

            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📉 TREND ANALYSIS (Day 1 - 31)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '40px' }}>
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Sales: This Month vs Last Month`} dataCurrent={thisMonthData.dailySales} dataLast={lastMonthData.dailySales} color="#2563eb" />
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Profit: This Month vs Last Month`} dataCurrent={thisMonthData.dailyProfit} dataLast={lastMonthData.dailyProfit} color="#10b981" />
            </div>
          </div>
        )}

      </div>

      <style jsx global>{`
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }
        body { font-variant-numeric: tabular-nums lining-nums; }
        .main-wrapper { padding: 24px 24px 24px 75px; background: #f8fafc; min-height: 100vh; font-family: Arial, sans-serif; box-sizing: border-box; color: #333; }
        .header-container { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
        .section-divider { font-size: 15px; color: #475569; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        input[type="text"].no-spinners::-webkit-inner-spin-button, input[type="text"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @media (max-width: 1023px) { 
          .main-wrapper { padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; }
          .header-container { flex-direction: column; align-items: flex-start; gap: 16px; }
        }
      `}</style>
    </div>
  )
}

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
    if (pct < 50) barColor = '#ef4444'; else if (pct >= 100) barColor = '#10b981'; 
  } else {
    if (pct > 100) barColor = '#ef4444'; else if (pct < 80) barColor = '#10b981'; 
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: '#334155', fontWeight: 'bold' }}>
        <span>{title}</span><span style={{ color: barColor }}>{displayPct}%</span>
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
      const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200); return `${x},${y}`;
    }).join(' ');
  }
  const currentPoints = formatPoints(dataCurrent); const lastPoints = formatPoints(dataLast);
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
            const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200);
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