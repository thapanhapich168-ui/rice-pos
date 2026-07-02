'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'

const EXCHANGE_RATE = 4000;
const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

type PaymentRow = { id: number, method: string, amount: number | '' };

// ==========================================
// ROBUST LIVE COMMA FORMATTER 
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, onEnter }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === 0) {
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
      style={{ ...style, color: '#334155', fontWeight: 'normal' }}
    />
  )
}

export default function CogsReportPage() {
  const [sales, setSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [cogsSettlements, setCogsSettlements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // App Settings (Liability to Mom)
  const [persOweRiel, setPersOweRiel] = useState<number>(0)
  const [persOweUsd, setPersOweUsd] = useState<number>(0)

  // Navigation States
  const [activeMainTab, setActiveMainTab] = useState<'report' | 'pending' | 'history'>('report')
  const [activeOwnerTab, setActiveOwnerTab] = useState<'mom' | 'others'>('mom')
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('month')
  
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  
  const reportRef = useRef<HTMLDivElement>(null)

  // Report Specific Dates
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Bulk Settlement States
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkPaymentRows, setBulkPaymentRows] = useState<PaymentRow[]>([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
  const [isProcessing, setIsProcessing] = useState(false)

  // Inline History States
  const [inlinePayments, setInlinePayments] = useState<Record<string, PaymentRow[]>>({})

  useEffect(() => {
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);

    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    setFromDate(localISOTime);
    setToDate(localISOTime);
  }, [])

  useEffect(() => {
    fetchReportData();
  }, [])

  async function fetchReportData() {
    setLoading(true)
    
    // Fetch all for accurate lifetime balances
    const { data: sData } = await supabase.from('sales').select('*')
    const { data: rData } = await supabase.from('retail_sales').select('*')
    const { data: cData } = await supabase.from('cogs_settlements').select('*')
    const { data: aData } = await supabase.from('app_settings').select('*').in('setting_key', ['personal_owe_riel', 'personal_owe_usd'])

    setSales(sData || [])
    setRetailSales(rData || [])
    setCogsSettlements(cData || [])

    if (aData) {
      aData.forEach(s => {
        if (s.setting_key === 'personal_owe_riel') setPersOweRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'personal_owe_usd') setPersOweUsd(Number(s.setting_value) || 0)
      })
    }
    
    setLoading(false)
  }

  // 🚀 FIXED: Added missing updateSetting function
  async function updateSetting(key: string, val: number) {
    await supabase.from('app_settings').upsert({ setting_key: key, setting_value: val }, { onConflict: 'setting_key' })
  }

  // --- IMAGE EXPORT LOGIC ---
  const handleDownload = async () => {
    if (!reportRef.current) return;
    setIsCapturing(true);
    try {
      await document.fonts.ready;
      const dataUrl = await htmlToImage.toPng(reportRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `COGS-Report-${fromDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download image', err);
    } finally {
      setIsCapturing(false);
    }
  }

  const handleMobileShare = async () => {
    if (!reportRef.current) return;
    setIsCapturing(true);
    try {
      await document.fonts.ready;
      const dataUrl = await htmlToImage.toPng(reportRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `COGS-Report-${fromDate}.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `COGS Report` });
      } else {
        const link = document.createElement('a');
        link.download = `COGS-Report-${fromDate}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Failed to share image', err);
    } finally {
      setIsCapturing(false);
    }
  }

  const handleNativePrint = () => { window.print(); }

  // --- TIME HELPERS ---
  const now = new Date()
  const isWithinTimeFilter = (dateStr: string, filter: string) => {
    if (filter === 'all') return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
    
    if (filter === 'today') return d.getTime() === today.getTime();
    if (filter === 'week') {
      const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
      return d >= lastWeek && d <= today;
    }
    if (filter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    return true;
  }

  // ==========================================
  // DATA PROCESSORS
  // ==========================================

  // 1. Report Processor (A4 View)
  const reportSales = [...sales, ...retailSales].filter(s => {
    const d = s.created_at.split('T')[0];
    return d >= fromDate && d <= toDate;
  }).filter(s => {
    const owner = (s.owner || '').toLowerCase().trim();
    if (activeOwnerTab === 'mom') return owner === 'mom' || owner === '' || owner === 'none' || owner === 'null';
    else return owner === 'pich' || owner === 'jing' || owner === 'both';
  });

  const groupedBySeller: Record<string, any[]> = {};
  reportSales.forEach(s => {
    const seller = s.owner || 'Mom';
    if (!groupedBySeller[seller]) groupedBySeller[seller] = [];
    groupedBySeller[seller].push(s);
  });

  const processSellerData = (sellerSales: any[]) => {
    const customerGroups: Record<string, any[]> = {};
    
    sellerSales.forEach(row => {
      const customer = row.customer_name || 'Walk-in';
      if (!customerGroups[customer]) customerGroups[customer] = [];
      customerGroups[customer].push(row);
    });

    const finalRows: any[] = [];
    let sellerGrandTotal = 0;

    Object.keys(customerGroups).forEach(customer => {
      const group = customerGroups[customer];
      let normalRows: any[] = [];
      let douRows: any[] = [];
      let consumedRows: any[] = [];
      let specialRows: any[] = [];

      group.forEach(item => {
        const desc = item.custom_rice_type || item.rice_type || '';
        const price = Number(item.cogs_price || 0);

        if (desc.includes('សេវាដឹក')) return;
        if (desc.includes('បាវ') && price === 0) return;

        if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) douRows.push(item);
        else if (desc.includes('បានប្រើ') || desc.includes('អង្ករខ្វះ')) consumedRows.push(item);
        else if (desc.includes('ថ្លៃបាវ')) specialRows.push(item);
        else normalRows.push(item);
      });

      specialRows.sort((a, b) => (a.rice_type || '').localeCompare(b.rice_type || ''));
      const sortedGroup = [...normalRows, ...specialRows, ...douRows, ...consumedRows];

      sortedGroup.forEach((item, index) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.cogs_price || 0);
        let amount = qty * price;

        const descForMath = item.custom_rice_type || item.rice_type || '';
        const isNegative = descForMath.includes('ដូរ') || descForMath.includes('បញ្ចុះតម្លៃ') || descForMath.includes('កក់');
        
        if (isNegative) amount = -Math.abs(amount);
        else amount = Math.abs(amount);

        sellerGrandTotal += amount;

        finalRows.push({
          ...item,
          calculatedAmount: amount,
          isNegative,
          isFirstOfCustomer: index === 0,
          rowSpan: index === 0 ? sortedGroup.length : 0
        });
      });
    });

    return { rows: finalRows, sellerGrandTotal };
  };

  // 2. Daily Ledger Processor (Pending & History)
  const dailyMap: Record<string, any> = {};
  
  [...sales, ...retailSales].forEach(s => {
    const owner = (s.owner || 'Mom').trim();
    const isMomTab = activeOwnerTab === 'mom';
    const isMomOwner = owner.toLowerCase() === 'mom' || owner === '';
    
    if (isMomTab !== isMomOwner) return;

    const date = s.created_at.split('T')[0];
    const key = `${date}_${owner}`;

    if (!dailyMap[key]) {
      dailyMap[key] = { key, date, owner, totalCogs: 0, totalPaid: 0, methods: new Set<string>() };
    }

    let qty = Number(s.qty || 0);
    let price = Number(s.cogs_price || 0);
    let amount = qty * price;
    let desc = s.custom_rice_type || s.rice_type || '';
    
    if (desc.includes('សេវាដឹក')) return;
    if (desc.includes('បាវ') && price === 0) return;
    if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) amount = -Math.abs(amount);
    else amount = Math.abs(amount);

    dailyMap[key].totalCogs += amount;
  });

  cogsSettlements.forEach(c => {
    const key = `${c.settlement_date}_${c.owner_name}`;
    if (dailyMap[key]) {
      dailyMap[key].totalPaid += Number(c.paid_amount || 0);
      if (c.payment_method) dailyMap[key].methods.add(c.payment_method);
    }
  });

  const allDays = Object.values(dailyMap).sort((a,b) => b.date.localeCompare(a.date));
  const filteredDays = allDays.filter(d => isWithinTimeFilter(d.date, timeFilter));
  
  const pendingDays = filteredDays.filter(d => d.totalCogs > d.totalPaid + 0.1);
  const historyDays = filteredDays.filter(d => d.totalPaid > 0);

  // Selection Logic
  const handleSelectDay = (key: string) => {
    if (selectedDays.includes(key)) setSelectedDays(selectedDays.filter(k => k !== key));
    else setSelectedDays([...selectedDays, key]);
  }
  const handleSelectAll = () => {
    if (selectedDays.length === pendingDays.length) setSelectedDays([]);
    else setSelectedDays(pendingDays.map(d => d.key));
  }

  // ==========================================
  // PAYMENT PROCESSING ENGINE
  // ==========================================
  async function processPayments(rows: PaymentRow[], targetDays: any[], isBulk: boolean) {
    if (isProcessing) return;

    let totalAppliedRiel = 0;
    let liabilityUsedRiel = 0;
    let liabilityUsedUsd = 0;
    let cashToLogUsd = 0;
    let cashToLogRiel = 0;
    let methodStrings: string[] = [];

    const totalDue = targetDays.reduce((sum, d) => sum + (d.totalCogs - d.totalPaid), 0);

    for (const r of rows) {
       const amt = Number(r.amount);
       if (amt <= 0) continue;
       methodStrings.push(`${r.method}: ${amt}`);

       if (r.method === 'Mom Liability ៛') {
         liabilityUsedRiel += amt;
         totalAppliedRiel += amt;
       } else if (r.method === 'Mom Liability $') {
         liabilityUsedUsd += amt;
         totalAppliedRiel += (amt * EXCHANGE_RATE);
       } else if (r.method.includes('$')) {
         cashToLogUsd += amt;
         totalAppliedRiel += (amt * EXCHANGE_RATE);
       } else {
         cashToLogRiel += amt;
         totalAppliedRiel += amt;
       }
    }

    if (totalAppliedRiel <= 0) return;
    if (totalAppliedRiel > totalDue + 0.1) return alert("Cannot pay more than the total COGS balance.");
    if (liabilityUsedRiel > persOweRiel || liabilityUsedUsd > persOweUsd) return alert("Not enough Mom Liability available!");

    setIsProcessing(true);

    try {
      // 1. Update Liability (if used)
      if (liabilityUsedRiel > 0 || liabilityUsedUsd > 0) {
        await updateSetting('personal_owe_riel', persOweRiel - liabilityUsedRiel);
        await updateSetting('personal_owe_usd', persOweUsd - liabilityUsedUsd);
      }

      // 2. Log Cash Income (Negative Expense adds to Dashboard Cash)
      if (cashToLogRiel > 0 || cashToLogUsd > 0) {
        await supabase.from('expenses').insert([{
           expense_date: new Date().toISOString().split('T')[0],
           spender: 'Both',
           payment_method: methodStrings.join(', '),
           remarks: isBulk ? `Bulk COGS Settlement` : `Inline COGS Settlement`,
           amount: cashToLogUsd > 0 ? -Math.abs(cashToLogUsd) : 0,
           amount_riel: cashToLogRiel > 0 ? -Math.abs(cashToLogRiel) : 0,
           description: 'BUSINESS'
        }]);
      }

      // 3. Distribute across Target Days (Oldest to Newest)
      let remainingToDistribute = totalAppliedRiel;
      const settlesToInsert = [];
      const daysToSettle = [...targetDays].sort((a,b) => a.date.localeCompare(b.date));

      for (const day of daysToSettle) {
         if (remainingToDistribute <= 0) break;
         const owed = day.totalCogs - day.totalPaid;
         const apply = Math.min(owed, remainingToDistribute);

         settlesToInsert.push({
           settlement_date: day.date,
           owner_name: day.owner,
           source_type: 'Batch',
           paid_amount: apply,
           payment_method: methodStrings.join(', '),
           status: apply >= owed ? 'Settled' : 'Partial',
           remarks: isBulk ? `Bulk via COGS Dashboard` : `Inline via COGS Dashboard`
         });

         remainingToDistribute -= apply;
      }

      await supabase.from('cogs_settlements').insert(settlesToInsert);
      
      // Cleanup UI
      if (isBulk) {
        setBulkModalOpen(false);
        setSelectedDays([]);
        setBulkPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
      } else {
        setInlinePayments(prev => { const n = {...prev}; delete n[targetDays[0].key]; return n; });
      }

      fetchReportData(); 

    } catch (err: any) {
      alert("Error processing: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  // --- Inline Payment Wrapper ---
  async function handleProcessCreditPayment(day: any, paymentRows: PaymentRow[]) {
    await processPayments(paymentRows, [day], false);
  }

  // --- BULK MODAL LIVE MATH ---
  const bulkTotalDue = selectedDays.reduce((sum, k) => sum + (dailyMap[k].totalCogs - dailyMap[k].totalPaid), 0);
  const liveBulkReceived = bulkPaymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method === 'Mom Liability $') return sum + (amt * EXCHANGE_RATE);
    if (row.method === 'Mom Liability ៛') return sum + amt;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);
  const liveBulkRemaining = bulkTotalDue - liveBulkReceived;

  // --- INLINE HISTORY MANAGERS ---
  const getInlinePaymentState = (key: string, owed: number) => {
    return inlinePayments[key] || [{ id: 1, method: 'Cash ៛', amount: owed }];
  }
  const updateInlineRow = (key: string, rowId: number, field: string, value: any, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Cash ៛', amount: owed }];
      const newRows = rows.map(r => r.id === rowId ? { ...r, [field]: value } : r);
      return { ...prev, [key]: newRows };
    });
  }
  const addInlineSplit = (key: string, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Cash ៛', amount: owed }];
      return { ...prev, [key]: [...rows, { id: Date.now(), method: 'Cash ៛', amount: '' }] };
    });
  }
  const removeInlineSplit = (key: string, rowId: number, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Cash ៛', amount: owed }];
      return { ...prev, [key]: rows.filter(r => r.id !== rowId) };
    });
  }

  let combinedGrandTotal = 0;

  return (
    <div className="main-wrapper">
      
      {/* HEADER & GLOBAL CONTROLS */}
      <div className="header-container" style={{ paddingRight: '20px' }}>
        <h1 className="page-title">🌾 COGS Accounting</h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeMainTab === 'report' && (
            <>
              {isDeviceMobile ? (
                <button onClick={handleMobileShare} disabled={isCapturing} className="action-btn share-btn">
                  {isCapturing ? '⏳...' : '📤 Share Report'}
                </button>
              ) : (
                <button onClick={handleDownload} disabled={isCapturing} className="action-btn download-btn">
                  {isCapturing ? '⏳ Saving...' : '⬇️ Download A4'}
                </button>
              )}
              <button onClick={handleNativePrint} className="action-btn print-btn">
                🖨️ Print
              </button>
            </>
          )}
        </div>
      </div>

      {/* MAIN NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveMainTab('report')} 
          style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeMainTab === 'report' ? '#b58a3d' : 'transparent', color: activeMainTab === 'report' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '14px' }}
        >
          📊 COGS Report
        </button>
        <button 
          onClick={() => setActiveMainTab('pending')} 
          style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeMainTab === 'pending' ? '#ef4444' : 'transparent', color: activeMainTab === 'pending' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '14px' }}
        >
          ⏳ Pending Settlements
        </button>
        <button 
          onClick={() => setActiveMainTab('history')} 
          style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeMainTab === 'history' ? '#10b981' : 'transparent', color: activeMainTab === 'history' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '14px' }}
        >
          📚 Settlement History
        </button>
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        
        {activeMainTab === 'report' ? (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>From:</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>To:</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
            {['today', 'week', 'month', 'all'].map(f => (
              <button 
                key={f} onClick={() => setTimeFilter(f as any)} 
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textTransform: 'capitalize', background: timeFilter === f ? '#0f172a' : 'transparent', color: timeFilter === f ? '#fff' : '#475569' }}
              >
                {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'all' ? 'All Time' : f}
              </button>
            ))}
          </div>
        )}
        
        <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 5px' }} />
        <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button onClick={() => setActiveOwnerTab('mom')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeOwnerTab === 'mom' ? '#b58a3d' : 'transparent', color: activeOwnerTab === 'mom' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Mom COGS
          </button>
          <button onClick={() => setActiveOwnerTab('others')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeOwnerTab === 'others' ? '#b58a3d' : 'transparent', color: activeOwnerTab === 'others' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Pich / Jing / Both
          </button>
        </div>
      </div>

      {/* ==================================================================================== */}
      {/* TAB 1: COGS REPORT (Original A4 View) */}
      {/* ==================================================================================== */}
      {activeMainTab === 'report' && (
        <div className="a4-paper-container" ref={reportRef}>
          <img className="center-logo" src="https://i.imgur.com/s0hg3MQ.png" alt="Logo" crossOrigin="anonymous" />
          
          <div className="a4-content">
            <h1 style={{ textAlign: 'center', fontSize: '22px', color: 'green', margin: '0 0 20px 0', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontWeight: 'bold' }}>
              🌾 អង្ករត្រូវទូទាត់ 🧾
            </h1>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Loading records...</p>
            ) : reportSales.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>No sales records found for this date range.</p>
            ) : (
              <>
                {Object.keys(groupedBySeller).map((seller) => {
                  const { rows, sellerGrandTotal } = processSellerData(groupedBySeller[seller]);
                  combinedGrandTotal += sellerGrandTotal;

                  return (
                    <div key={seller} style={{ marginBottom: '30px' }}>
                      <h2 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#333', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontWeight: 'bold' }}>
                        ថៅកែ {seller.toUpperCase()}
                      </h2>
                      <table className="report-table">
                        <thead>
                          <tr style={{ backgroundColor: '#fffacd' }}>
                            <th style={{ width: '10%' }}>INV</th>
                            <th style={{ width: '20%' }}>អតិថិជន</th>
                            <th style={{ width: '20%' }}>ប្រភេទអង្ករ</th>
                            <th style={{ width: '20%' }}>ឈ្មោះក្នុងប៊ុង</th>
                            <th style={{ width: '10%' }}>ចំនួន</th>
                            <th style={{ width: '10%' }}>តម្លៃ</th>
                            <th style={{ width: '10%' }}>សរុប</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={idx}>
                              <td style={{ textAlign: 'center' }}>
                                {row.invoice_id ? String(row.invoice_id).replace(/\D/g, '') : ''}
                              </td>
                              {row.isFirstOfCustomer && (
                                <td rowSpan={row.rowSpan} style={{ verticalAlign: 'middle' }}>
                                  {row.customer_name}
                                </td>
                              )}
                              <td>
                                <div style={{ color: '#0f172a' }}>{row.rice_type}</div>
                              </td>
                              <td>{row.custom_rice_type || ''}</td>
                              <td style={{ textAlign: 'center' }}>{row.qty.toLocaleString('en-US')}</td>
                              <td style={{ textAlign: 'center' }}>{Number(row.cogs_price).toLocaleString('en-US')}</td>
                              <td style={{ textAlign: 'center', color: row.isNegative ? 'red' : 'inherit' }}>
                                {Math.round(row.calculatedAmount).toLocaleString('en-US')}
                              </td>
                            </tr>
                          ))}
                          
                          <tr style={{ backgroundColor: '#fffacd', fontWeight: 'bold' }}>
                            <td colSpan={6} style={{ textAlign: 'right', paddingRight: '15px' }}>សរុប</td>
                            <td style={{ textAlign: 'center', fontSize: '14px' }}>
                              {Math.round(sellerGrandTotal).toLocaleString('en-US')}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                <div style={{ marginTop: '40px' }}>
                  <table className="combined-summary-table" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000' }}>
                    <tbody>
                      <tr style={{ backgroundColor: '#fffacd' }}>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', width: '80%', padding: '12px', border: '1px solid #000', fontSize: '16px' }}>
                          សរុបរួមទាំងអស់
                        </td>
                        <td style={{ width: '20%', fontSize: '18px', fontWeight: 'bold', textAlign: 'center', border: '1px solid #000', padding: '12px', color: '#b58a3d' }}>
                          {Math.round(combinedGrandTotal).toLocaleString('en-US')} ៛
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ textAlign: 'right', marginTop: '20px', fontSize: '12px', color: '#64748b' }}>
                  Generated on: {new Date().toLocaleString('en-GB')}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================================== */}
      {/* TAB 2: PENDING SETTLEMENTS */}
      {/* ==================================================================================== */}
      {activeMainTab === 'pending' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', paddingBottom: '80px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '800px' }}>
              <thead style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'center', width: '50px' }}>
                    <input type="checkbox" onChange={handleSelectAll} checked={selectedDays.length > 0 && selectedDays.length === pendingDays.length} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                  </th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>COGS Date</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Owner</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Total COGS (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Remaining Debt (៛)</th>
                </tr>
              </thead>
              <tbody>
                {pendingDays.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: '#10b981', fontSize: '15px' }}>🎉 No pending COGS! You are all settled up!</td></tr>
                ) : (
                  pendingDays.map((d: any) => {
                    const remaining = d.totalCogs - d.totalPaid;
                    const isSelected = selectedDays.includes(d.key);
                    
                    return (
                      <tr key={d.key} onClick={() => handleSelectDay(d.key)} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#fff1f2' : '#ffffff', cursor: 'pointer', transition: 'all 0.2s ease' }}>
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} readOnly style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '16px', color: '#334155', fontWeight: 'bold' }}>
                          {new Date(d.date).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '16px', color: '#475569', fontWeight: 'normal' }}>{d.owner}</td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: 'normal' }}>{formatRiel(d.totalCogs)}</td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold', fontSize: '16px' }}>{formatRiel(remaining)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* FLOATING ACTION BAR FOR BULK SETTLE */}
          {selectedDays.length > 0 && (
            <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#1e293b', padding: '16px 32px', borderRadius: '50px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', gap: '24px', alignItems: 'center', zIndex: 100 }}>
              <div style={{ color: '#fff', fontSize: '15px' }}>
                <span style={{ color: '#94a3b8' }}>Selected: </span> <b>{selectedDays.length} Days</b>
              </div>
              <div style={{ color: '#fff', fontSize: '15px' }}>
                <span style={{ color: '#94a3b8' }}>Total COGS Due: </span> 
                <b style={{ color: '#f87171', fontSize: '18px' }}>
                  {formatRiel(selectedDays.reduce((sum, k) => sum + (dailyMap[k].totalCogs - dailyMap[k].totalPaid), 0))}
                </b>
              </div>
              <button 
                onClick={() => setBulkModalOpen(true)}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 10px rgba(16,185,129,0.3)' }}
              >
                Settle Selected
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================================== */}
      {/* TAB 3: SETTLEMENT HISTORY (Inline Settling) */}
      {/* ==================================================================================== */}
      {activeMainTab === 'history' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1050px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>COGS Date & Owner</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Total COGS (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Methods Applied</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Paid Amount (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px' }}>Remaining Debt (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', width: '200px' }}>Settle Remaining</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', width: '120px' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {historyDays.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No settled records found.</td></tr>
                ) : (
                  historyDays.map((d: any) => {
                    const remaining = d.totalCogs - d.totalPaid;
                    const isDone = remaining <= 0;
                    const paymentState = getInlinePaymentState(d.key, remaining);
                    
                    return (
                      <tr key={d.key} style={{ borderBottom: '1px solid #f1f5f9', background: isDone ? '#f8fafc' : '#ffffff', opacity: isDone ? 0.7 : 1, transition: 'all 0.3s ease' }}>
                        <td style={{ padding: '16px 20px', color: '#334155', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{new Date(d.date).toLocaleDateString('en-GB')}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Owner: <span style={{color: '#0f172a'}}>{d.owner}</span></div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#475569', fontWeight: 'normal', verticalAlign: 'top' }}>{formatRiel(d.totalCogs)}</td>
                        <td style={{ padding: '16px 20px', textAlign: 'center', color: '#3b82f6', fontWeight: 'bold', verticalAlign: 'top', fontSize: '12px' }}>
                          {Array.from(d.methods).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#10b981', fontWeight: 'bold', verticalAlign: 'top' }}>{formatRiel(d.totalPaid)}</td>
                        
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold', fontSize: '15px', verticalAlign: 'top' }}>
                          {remaining > 0 ? formatRiel(remaining) : ''}
                        </td>

                        <td style={{ padding: '16px 20px', textAlign: 'right', verticalAlign: 'top' }}>
                          {remaining > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map(row => (
                                <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <select 
                                      value={row.method}
                                      onChange={(e) => updateInlineRow(d.key, row.id, 'method', e.target.value, remaining)}
                                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', background: '#fff', color: '#475569', cursor: 'pointer', flex: 1 }}
                                    >
                                      <option value="Cash ៛">💵 Cash ៛</option>
                                      <option value="Cash $">💵 Cash $</option>
                                      <option value="QR ៛">📱 QR ៛</option>
                                      <option value="QR $">📱 QR $</option>
                                      {activeOwnerTab === 'mom' && <option value="Mom Liability ៛">📉 Mom Liability ៛</option>}
                                      {activeOwnerTab === 'mom' && <option value="Mom Liability $">📉 Mom Liability $</option>}
                                    </select>
                                    {paymentState.length > 1 && (
                                      <button onClick={() => removeInlineSplit(d.key, row.id, remaining)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                                    )}
                                  </div>
                                  <CurrencyInput
                                    placeholder={formatRiel(remaining)}
                                    value={row.amount}
                                    onChange={(v: any) => updateInlineRow(d.key, row.id, 'amount', v, remaining)}
                                    onEnter={() => handleProcessCreditPayment(d, paymentState)}
                                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', textAlign: 'right', outline: 'none', width: '100%', background: '#fff', color: '#000000', boxSizing: 'border-box' }}
                                  />
                                </div>
                              ))}
                              <button onClick={() => addInlineSplit(d.key, remaining)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'right', fontWeight: 'bold' }}>+ Add Split</button>
                            </div>
                          ) : (
                            <div style={{ color: '#10b981', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>Fully Settled</div>
                          )}
                        </td>

                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          {!isDone && (
                            <button 
                              onClick={() => handleProcessCreditPayment(d, paymentState)}
                              style={{ padding: '8px 12px', width: '100%', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', background: '#10b981', color: '#ffffff', transition: 'all 0.2s', fontWeight: 'bold' }}
                            >
                              ✔ Done
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================================================
          UNIFIED BULK SETTLEMENT MODAL (With Liability Feature)
          ============================================================================================== */}
      {bulkModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setBulkModalOpen(false)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '450px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#334155', fontSize: '18px', fontWeight: 'bold' }}>💸 Bulk Settle COGS</h3>
              <button onClick={() => setBulkModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', color: '#475569' }}>
              <span>Settling: <b>{selectedDays.length} Days</b></span>
            </div>

            <div style={{ background: '#fff1f2', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #fecaca', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#be123c', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Total COGS Due</div>
              <div style={{ fontSize: '28px', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(bulkTotalDue)}</div>
            </div>

            {/* Split Payment Rows */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold' }}>Payment Method(s)</label>
                <button onClick={() => setBulkPaymentRows([...bulkPaymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>+ Split</button>
              </div>

              {bulkPaymentRows.map((row, index) => (
                <div key={row.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                  <select 
                    value={row.method} 
                    onChange={e => {
                      const newRows = [...bulkPaymentRows];
                      newRows[index].method = e.target.value;
                      setBulkPaymentRows(newRows);
                    }}
                    style={{ width: '50%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#334155' }}
                  >
                    <option value="Cash ៛">💵 Cash ៛</option>
                    <option value="Cash $">💵 Cash $</option>
                    <option value="QR ៛">📱 QR ៛</option>
                    <option value="QR $">📱 QR $</option>
                    {activeOwnerTab === 'mom' && <option value="Mom Liability ៛">📉 Mom Liability ៛</option>}
                    {activeOwnerTab === 'mom' && <option value="Mom Liability $">📉 Mom Liability $</option>}
                  </select>
                  
                  <div style={{ flex: 1 }}>
                    <CurrencyInput 
                      placeholder="" 
                      value={row.amount} 
                      onChange={(val: any) => {
                        const newRows = [...bulkPaymentRows];
                        newRows[index].amount = val;
                        setBulkPaymentRows(newRows);
                      }}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', textAlign: 'right' }}
                    />
                  </div>
                  
                  {bulkPaymentRows.length > 1 && (
                    <button onClick={() => setBulkPaymentRows(bulkPaymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  )}
                </div>
              ))}

              {activeOwnerTab === 'mom' && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                  <b>💡 Tip:</b> Select <i>"Mom Liability ៛"</i> to pay this COGS using the money you collected from Mom's deliveries. 
                  <br/><br/>
                  <b>Available Liability:</b> <span style={{color: '#b58a3d', fontWeight: 'bold'}}>{formatRiel(persOweRiel)}</span> / <span style={{color: '#b58a3d', fontWeight: 'bold'}}>{formatUSD(persOweUsd)}</span>
                </div>
              )}
            </div>

            {/* Live Calculation Footer */}
            {bulkPaymentRows.some(r => Number(r.amount) > 0) && (
              <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Total Processed:</span>
                  <span style={{ color: '#334155', fontWeight: 'bold' }}>{formatRiel(liveBulkReceived)}</span>
                </div>
                {liveBulkRemaining < 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ef4444' }}>Overpaid By:</span>
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatRiel(Math.abs(liveBulkRemaining))}</span>
                  </div>
                ) : liveBulkRemaining > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#d97706' }}>Still Owes:</span>
                    <span style={{ color: '#b45309', fontWeight: 'bold' }}>{formatRiel(liveBulkRemaining)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#166534' }}>Balance:</span>
                    <span style={{ color: '#15803d', fontWeight: 'bold' }}>Perfectly Cleared ✅</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setBulkModalOpen(false)} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontSize: '15px', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={() => processPayments(bulkPaymentRows, selectedDays.map(k => dailyMap[k]), true)} disabled={isProcessing} style={{ padding: '12px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>
                {isProcessing ? 'Processing...' : 'Confirm Bulk Settle'}
              </button>
            </div>
          </div>
        </div>
      )}

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

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }

        /* --- ACTION BUTTONS --- */
        .action-btn {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          color: #fff;
          transition: background 0.2s;
        }
        .download-btn { background: #b58a3d; }
        .share-btn { background: #3b82f6; }
        .print-btn { background: #10b981; }

        /* --- A4 PAPER STYLING --- */
        .a4-paper-container {
          width: 100%;
          max-width: 794px; /* A4 Width at 96 PPI */
          min-height: 1123px; /* A4 Height */
          margin: 0 auto;
          background: #ffffff;
          padding: 40px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }
        .center-logo {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          opacity: 0.05;
          z-index: 0;
          pointer-events: none;
        }
        .a4-content {
          position: relative;
          z-index: 1;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Noto Sans Khmer', Arial, sans-serif;
          font-size: 13px;
        }
        .report-table th, .report-table td {
          border: 1px solid #000;
          padding: 8px 10px;
        }
        .report-table th {
          font-weight: bold;
          text-align: center;
        }
        .report-table td {
          font-weight: normal; 
        }

        @media print {
          body * { visibility: hidden; }
          .a4-paper-container, .a4-paper-container * { visibility: visible; }
          .a4-paper-container {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            padding: 20px;
            box-shadow: none;
            width: 100%;
          }
          @page { size: A4 portrait; margin: 10mm; }
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
          .a4-paper-container {
            padding: 16px;
            min-height: auto;
          }
        }
      `}</style>
    </div>
  )
}