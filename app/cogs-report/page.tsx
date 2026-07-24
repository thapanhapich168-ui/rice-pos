'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { useToast } from '@/components/ToastProvider'
import { formatRiel, parseOwner, EXCHANGE_RATE } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { PaymentRow } from '@/types'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'

export default function CogsReportPage() {
  const { showToast } = useToast();

  const [sales, setSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [cogsSettlements, setCogsSettlements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // App Settings (Liability to Mom)
  const [persOweRiel, setPersOweRiel] = useState<number>(0)
  const [persOweUsd, setPersOweUsd] = useState<number>(0)
  const [liveMomLiability, setLiveMomLiability] = useState<number>(0) 

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
  const [bulkPaymentRows, setBulkPaymentRows] = useState<PaymentRow[]>([{ id: Date.now(), method: 'Mom Liability ៛', amount: '' }]);
  const [isProcessing, setIsProcessing] = useState(false)

  // Inline History States
  const [inlinePayments, setInlinePayments] = useState<Record<string, PaymentRow[]>>({})

  // Pagination state to prevent browser freezing
  const [loadLimit, setLoadLimit] = useState(3000);

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
  }, [loadLimit]) 

  useFocusRefresh(fetchReportData);

  async function fetchReportData() {
    setLoading(true)
    
    const [{data: sData}, {data: rData}, {data: cData}, {data: aData}, {data: invData}, {data: expData}, {data: payData}] = await Promise.all([
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(loadLimit),
        supabase.from('retail_sales').select('*').order('created_at', { ascending: false }).limit(loadLimit),
        supabase.from('cogs_settlements').select('*').order('created_at', { ascending: false }).limit(loadLimit),
        supabase.from('app_settings').select('*').in('setting_key', ['personal_owe_riel', 'personal_owe_usd']),
        supabase.from('invoice_summaries').select('*').order('created_at', { ascending: false }).limit(loadLimit),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(loadLimit),
        supabase.from('invoice_payments').select('*').order('created_at', { ascending: false }).limit(loadLimit)
    ]);

    setSales(sData || [])
    setRetailSales(rData || [])
    setCogsSettlements(cData || [])

    const isBusinessMethod = (m: string) => {
        const lowerM = m.toLowerCase();
        if (lowerM.includes('mom qr')) return false; 
        return true; 
    };

    let momCollectedRiel = 0;
    
    (rData || []).forEach((r: any) => {
      const owner = parseOwner(r.owner);
      const methodStr = r.payment_method || 'Cash ៛';
      const totalSale = Number(r.qty || 0) * Number(r.price_per_bag || 0);

      if (owner === 'mom') {
          if (methodStr.includes(':')) {
              methodStr.split(',').forEach((pStr: string) => {
                  const [mName, amtStr] = pStr.split(':');
                  let bAmt = Number(amtStr) || 0;
                  if (mName.includes('$')) bAmt *= EXCHANGE_RATE;
                  if (isBusinessMethod(mName.trim())) momCollectedRiel += bAmt; 
              });
          } else {
              if (isBusinessMethod(methodStr)) momCollectedRiel += totalSale;
          }
      }
    });

    (payData || []).forEach((p: any) => {
       const amtUsd = Number(p.amount_paid_usd || 0);
       const amtRiel = Number(p.amount_paid_riel || 0);
       const amtRielEq = amtRiel + (amtUsd * EXCHANGE_RATE);
       
       const methodStr = p.payment_method || 'Cash ៛';
       const parentInv = (invData || []).find((i: any) => i.invoice_id === p.invoice_id);
       
       if (parentInv && parseOwner(parentInv.owner) === 'mom') {
           if (methodStr.includes(':')) {
               methodStr.split(',').forEach((pStr: string) => {
                  const [mName, amtStr] = pStr.split(':');
                  let bAmt = Number(amtStr) || 0;
                  if (mName.includes('$')) bAmt *= EXCHANGE_RATE;
                  if (isBusinessMethod(mName.trim())) momCollectedRiel += bAmt;
               });
           } else {
               if (isBusinessMethod(methodStr)) momCollectedRiel += amtRielEq;
           }
       }
    });

    let momPaidOutRiel = 0;
    (expData || []).forEach((e: any) => {
      const amtRiel = Number(e.amount_riel || 0);
      const amtUsd = Number(e.amount_usd || 0);
      if ((e.remarks || '').toLowerCase().includes("settled mom's account liability")) {
         momPaidOutRiel += Math.abs(amtRiel) + (Math.abs(amtUsd) * EXCHANGE_RATE);
      }
    });

    let momCogsSettledRiel = 0;
    (cData || []).forEach((c: any) => {
      if (parseOwner(c.owner_name) === 'mom') {
          const method = (c.payment_method || '').toLowerCase();
          if (method.includes(':')) {
              method.split(',').forEach((pStr: string) => {
                 const [mName, amtStr] = pStr.split(':');
                 let bAmt = Number(amtStr) || 0;
                 if (mName.includes('$')) bAmt *= EXCHANGE_RATE;
                 if (!mName.toLowerCase().includes('mom qr')) momCogsSettledRiel += bAmt;
              });
          } else {
              const rielPaid = Number(c.paid_amount_riel || 0);
              const usdPaid = Number(c.paid_amount_usd || 0) * EXCHANGE_RATE;
              if (!method.includes('mom qr')) momCogsSettledRiel += (rielPaid + usdPaid);
          }
      }
    });

    let baseOweRiel = 0;
    let baseOweUsd = 0;
    if (aData) {
      aData.forEach(s => {
        if (s.setting_key === 'personal_owe_riel') baseOweRiel = Number(s.setting_value) || 0;
        if (s.setting_key === 'personal_owe_usd') baseOweUsd = Number(s.setting_value) || 0;
      });
    }

    const liveLiabilityRiel = Math.max(0, baseOweRiel + (baseOweUsd * EXCHANGE_RATE) + momCollectedRiel - momPaidOutRiel - momCogsSettledRiel);
    setLiveMomLiability(liveLiabilityRiel);
    
    setLoading(false)
  }

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

  const reportSales = [...sales, ...retailSales].filter(s => {
    const d = s.created_at.split('T')[0];
    return d >= fromDate && d <= toDate;
  }).filter(s => {
    const owner = parseOwner(s.owner);
    if (activeOwnerTab === 'mom') return owner === 'mom';
    else return owner !== 'mom';
  });

  const groupedBySeller: Record<string, any[]> = {};
  reportSales.forEach(s => {
    let seller = parseOwner(s.owner);
    seller = seller.charAt(0).toUpperCase() + seller.slice(1);
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

  const dailyMap: Record<string, any> = {};
  
  [...sales, ...retailSales].forEach(s => {
    const owner = parseOwner(s.owner);
    const isMomTab = activeOwnerTab === 'mom';
    const isMomOwner = owner === 'mom';
    
    if (isMomTab !== isMomOwner) return;

    const date = s.created_at.split('T')[0];
    const displayOwner = owner.charAt(0).toUpperCase() + owner.slice(1);
    const key = `${date}_${displayOwner}`;

    if (!dailyMap[key]) {
      dailyMap[key] = { key, date, owner: displayOwner, totalCogs: 0, totalPaid: 0, methods: new Set<string>() };
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
    const owner = parseOwner(c.owner_name);
    const displayOwner = owner.charAt(0).toUpperCase() + owner.slice(1);
    const key = `${c.settlement_date}_${displayOwner}`;
    if (dailyMap[key]) {
      const rielPaid = Number(c.paid_amount_riel || 0);
      const usdPaid = Number(c.paid_amount_usd || 0) * EXCHANGE_RATE;
      dailyMap[key].totalPaid += (rielPaid + usdPaid);
      
      if (c.payment_method) dailyMap[key].methods.add(c.payment_method);
    }
  });

  const allDays = Object.values(dailyMap).sort((a,b) => b.date.localeCompare(a.date));
  const filteredDays = allDays.filter(d => isWithinTimeFilter(d.date, timeFilter));
  
  const pendingDays = filteredDays.filter(d => d.totalCogs > d.totalPaid + 0.1);
  const historyDays = filteredDays.filter(d => d.totalPaid > 0);

  const handleSelectDay = (key: string) => {
    if (selectedDays.includes(key)) setSelectedDays(selectedDays.filter(k => k !== key));
    else setSelectedDays([...selectedDays, key]);
  }
  const handleSelectAll = () => {
    if (selectedDays.length === pendingDays.length) setSelectedDays([]);
    else setSelectedDays(pendingDays.map(d => d.key));
  }

  // =========================================================
  // CLEAN ARCHITECTURE: PAYMENT PROCESSOR
  // =========================================================
  async function processPayments(rows: PaymentRow[], targetDays: any[], isBulk: boolean) {
    if (isProcessing) return;

    let totalAppliedRielEq = 0;
    let liabilityUsedRiel = 0;
    let liabilityUsedUsd = 0;
    let methodStrings: string[] = [];

    let totalUsdFace = 0;
    let totalRielFace = 0;

    const totalDue = targetDays.reduce((sum, d) => sum + (d.totalCogs - d.totalPaid), 0);

    for (const r of rows) {
       const amt = Number(r.amount);
       if (amt <= 0) continue;
       methodStrings.push(`${r.method}: ${amt}`);

       if (r.method === 'Mom Liability ៛') {
         liabilityUsedRiel += amt;
         totalAppliedRielEq += amt;
         totalRielFace += amt;
       } else if (r.method === 'Mom Liability $') {
         liabilityUsedUsd += amt;
         totalAppliedRielEq += (amt * EXCHANGE_RATE);
         totalUsdFace += amt;
       } else if (r.method.includes('$')) {
         totalAppliedRielEq += (amt * EXCHANGE_RATE);
         totalUsdFace += amt;
       } else {
         totalAppliedRielEq += amt;
         totalRielFace += amt;
       }
    }

    if (totalAppliedRielEq <= 0) return;
    if (totalAppliedRielEq > totalDue + 0.1) {
      showToast('error', 'Overpayment', 'Cannot pay more than the total COGS balance.');
      return;
    }
    
    const liabilityUsedRielEqSum = liabilityUsedRiel + (liabilityUsedUsd * EXCHANGE_RATE);
    if (liabilityUsedRielEqSum > liveMomLiability + 0.1) {
        showToast('error', 'Insufficient Liability', `Not enough Mom Liability available! You only have ${formatRiel(liveMomLiability)}`);
        setIsProcessing(false);
        return; 
    }

    setIsProcessing(true);

    try {
      let remainingToDistribute = totalAppliedRielEq;
      const settlesToInsert = [];
      const daysToSettle = [...targetDays].sort((a,b) => a.date.localeCompare(b.date));

      for (const day of daysToSettle) {
         if (remainingToDistribute <= 0) break;
         const owed = day.totalCogs - day.totalPaid;
         const apply = Math.min(owed, remainingToDistribute);

         const pctOfTotal = apply / totalAppliedRielEq;
         const allocatedUsd = totalUsdFace * pctOfTotal;
         const allocatedRiel = totalRielFace * pctOfTotal;

         settlesToInsert.push({
           settlement_date: day.date,
           owner_name: day.owner,
           source_type: 'Batch',
           paid_amount_usd: allocatedUsd,
           paid_amount_riel: allocatedRiel,
           payment_method: methodStrings.join(', '),
           status: apply >= owed ? 'Settled' : 'Partial',
           remarks: isBulk ? `Bulk via COGS Dashboard` : `Inline via COGS Dashboard`
         });

         remainingToDistribute -= apply;
      }

      const { error } = await supabase.from('cogs_settlements').insert(settlesToInsert);
      if (error) throw error;
      
      if (isBulk) {
        setBulkModalOpen(false);
        setSelectedDays([]);
        setBulkPaymentRows([{ id: Date.now(), method: 'Mom Liability ៛', amount: '' }]);
      } else {
        setInlinePayments(prev => { const n = {...prev}; delete n[targetDays[0].key]; return n; });
      }

      showToast('success', 'Payment Logged', 'The COGS payment has been settled successfully.');
      fetchReportData(); 

    } catch (err: any) {
      showToast('error', 'Processing Error', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleProcessCreditPayment(day: any, paymentRows: PaymentRow[]) {
    await processPayments(paymentRows, [day], false);
  }

  const bulkTotalDue = selectedDays.reduce((sum, k) => sum + (dailyMap[k].totalCogs - dailyMap[k].totalPaid), 0);
  const liveBulkReceived = bulkPaymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method === 'Mom Liability $') return sum + (amt * EXCHANGE_RATE);
    if (row.method === 'Mom Liability ៛') return sum + amt;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);
  const liveBulkRemaining = bulkTotalDue - liveBulkReceived;

  const getInlinePaymentState = (key: string, owed: number) => {
    return inlinePayments[key] || [{ id: 1, method: 'Mom Liability ៛', amount: owed }];
  }
  const updateInlineRow = (key: string, rowId: number, field: string, value: any, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Mom Liability ៛', amount: owed }];
      const newRows = rows.map(r => r.id === rowId ? { ...r, [field]: value } : r);
      return { ...prev, [key]: newRows };
    });
  }
  const addInlineSplit = (key: string, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Mom Liability ៛', amount: owed }];
      return { ...prev, [key]: [...rows, { id: Date.now(), method: 'Mom Liability ៛', amount: '' }] };
    });
  }
  const removeInlineSplit = (key: string, rowId: number, owed: number) => {
    setInlinePayments(prev => {
      const rows = prev[key] ? [...prev[key]] : [{ id: 1, method: 'Mom Liability ៛', amount: owed }];
      return { ...prev, [key]: rows.filter(r => r.id !== rowId) };
    });
  }

  let combinedGrandTotal = 0;

  return (
    <div className="main-wrapper">
      
      {/* HEADER CONTAINER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="saas-page-title">🌾 COGS Accounting</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeMainTab === 'report' && (
            <>
              {isDeviceMobile ? (
                <button onClick={handleMobileShare} disabled={isCapturing} className="saas-btn" style={{ background: '#3b82f6', color: '#fff' }}>
                  {isCapturing ? '⏳...' : '📤 Share'}
                </button>
              ) : (
                <button onClick={handleDownload} disabled={isCapturing} className="saas-btn" style={{ background: '#b58a3d', color: '#fff' }}>
                  {isCapturing ? '⏳ Saving...' : '⬇️ Download A4'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* MAIN SAAS TABS */}
      <div className="saas-tab-container" style={{ padding: '8px', border: '1px solid #e2e8f0', background: '#fff' }}>
        <button 
          onClick={() => setActiveMainTab('report')} 
          className={`saas-tab ${activeMainTab === 'report' ? 'active' : ''}`}
          style={{ flex: 1, textAlign: 'center' }}
        >
          📊 COGS Report
        </button>
        <button 
          onClick={() => setActiveMainTab('pending')} 
          className={`saas-tab ${activeMainTab === 'pending' ? 'active' : ''}`}
          style={activeMainTab === 'pending' ? { background: '#ef4444', color: '#fff', flex: 1, textAlign: 'center' } : { flex: 1, textAlign: 'center' }}
        >
          ⏳ Pending Settlements
        </button>
        <button 
          onClick={() => setActiveMainTab('history')} 
          className={`saas-tab ${activeMainTab === 'history' ? 'active' : ''}`}
          style={activeMainTab === 'history' ? { background: '#10b981', color: '#fff', flex: 1, textAlign: 'center' } : { flex: 1, textAlign: 'center' }}
        >
          📚 Settlement History
        </button>
      </div>

      {/* FILTERS CARD */}
      <div className="saas-card" style={{ padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        
        {activeMainTab === 'report' ? (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>From:</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="saas-input" style={{ width: 'auto', padding: '8px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>To:</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="saas-input" style={{ width: 'auto', padding: '8px' }} />
            </div>
          </>
        ) : (
          <div className="saas-tab-container" style={{ margin: 0, padding: '4px', border: 'none', boxShadow: 'none', background: '#f1f5f9' }}>
            {['today', 'week', 'month', 'all'].map(f => (
              <button 
                key={f} onClick={() => setTimeFilter(f as any)} 
                className={`saas-tab ${timeFilter === f ? 'active' : ''}`}
                style={timeFilter === f ? { background: '#0f172a', color: '#fff', padding: '8px 16px' } : { padding: '8px 16px' }}
              >
                {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'all' ? 'All Time' : f}
              </button>
            ))}
          </div>
        )}
        
        <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 5px' }} />
        
        <div className="saas-tab-container" style={{ margin: 0, padding: '4px', border: 'none', boxShadow: 'none', background: '#f1f5f9' }}>
          <button 
            onClick={() => setActiveOwnerTab('mom')} 
            className={`saas-tab ${activeOwnerTab === 'mom' ? 'active' : ''}`}
            style={{ padding: '8px 16px' }}
          >
            Mom COGS
          </button>
          <button 
            onClick={() => setActiveOwnerTab('others')} 
            className={`saas-tab ${activeOwnerTab === 'others' ? 'active' : ''}`}
            style={{ padding: '8px 16px' }}
          >
            Pich / Jing / Both
          </button>
        </div>
      </div>

      {/* A4 REPORT TAB (Inner Table Intentionally Untouched for Print Quality) */}
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
                              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                                {row.invoice_id ? String(row.invoice_id).replace(/\D/g, '') : ''}
                              </td>
                              {row.isFirstOfCustomer && (
                                <td rowSpan={row.rowSpan} style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>
                                  {row.customer_name}
                                </td>
                              )}
                              <td style={{ fontWeight: 'bold' }}>
                                <div style={{ color: '#0f172a' }}>{row.rice_type}</div>
                              </td>
                              <td style={{ fontWeight: 'bold' }}>{row.custom_rice_type || ''}</td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.qty.toLocaleString('en-US')}</td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{Number(row.cogs_price).toLocaleString('en-US')}</td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', color: row.isNegative ? 'red' : 'inherit' }}>
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

                <div style={{ textAlign: 'right', marginTop: '20px', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
                  Generated on: {new Date().toLocaleString('en-GB')}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PENDING SETTLEMENTS TAB */}
      {activeMainTab === 'pending' && (
        <div className="saas-table-wrapper" style={{ paddingBottom: selectedDays.length > 0 ? '80px' : '0' }}>
          <div className="saas-table-responsive">
            <table className="saas-table" style={{ minWidth: '100%', tableLayout: 'auto' }}>
              <thead style={{ background: '#fef2f2' }}>
                <tr>
                  <th className="saas-th" style={{ textAlign: 'center', width: '50px', color: '#991b1b', borderBottom: '1px solid #fecaca' }}>
                    <input type="checkbox" onChange={handleSelectAll} checked={selectedDays.length > 0 && selectedDays.length === pendingDays.length} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                  </th>
                  <th className="saas-th" style={{ color: '#991b1b', borderBottom: '1px solid #fecaca' }}>COGS Date</th>
                  <th className="saas-th" style={{ color: '#991b1b', borderBottom: '1px solid #fecaca' }}>Owner</th>
                  <th className="saas-th" style={{ textAlign: 'right', color: '#991b1b', borderBottom: '1px solid #fecaca' }}>Total COGS (៛)</th>
                  <th className="saas-th" style={{ textAlign: 'right', color: '#991b1b', borderBottom: '1px solid #fecaca' }}>Remaining Debt (៛)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                   <TableSkeleton columns={5} rows={5} />
                ) : pendingDays.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <EmptyState 
                        icon="🎉" 
                        title="All caught up!" 
                        message="No pending COGS! You are all settled up!" 
                      />
                    </td>
                  </tr>
                ) : (
                  pendingDays.map((d: any) => {
                    const remaining = d.totalCogs - d.totalPaid;
                    const isSelected = selectedDays.includes(d.key);
                    
                    return (
                      <tr key={d.key} className={`saas-tr ${isSelected ? 'selected' : ''}`} onClick={() => handleSelectDay(d.key)} style={{ cursor: 'pointer' }}>
                        <td className="saas-td" style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} readOnly style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        </td>
                        <td className="saas-td" style={{ fontWeight: 'bold' }}>
                          {new Date(d.date).toLocaleDateString('en-GB')}
                        </td>
                        <td className="saas-td" style={{ fontWeight: 'bold' }}>{d.owner}</td>
                        <td className="saas-td" style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatRiel(d.totalCogs)}</td>
                        <td className="saas-td" style={{ textAlign: 'right', color: '#ef4444', fontWeight: 'bold', fontSize: '16px' }}>{formatRiel(remaining)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

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
                className="saas-btn saas-btn-primary"
                style={{ borderRadius: '30px', boxShadow: '0 4px 10px rgba(16,185,129,0.3)', padding: '12px 24px', fontSize: '15px' }}
              >
                Settle Selected
              </button>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeMainTab === 'history' && (
        <div className="saas-table-wrapper">
          <div className="saas-table-responsive">
            <table className="saas-table" style={{ minWidth: '1050px', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th className="saas-th">COGS Date & Owner</th>
                  <th className="saas-th" style={{ textAlign: 'right' }}>Total COGS (៛)</th>
                  <th className="saas-th" style={{ textAlign: 'center' }}>Methods Applied</th>
                  <th className="saas-th" style={{ textAlign: 'right' }}>Paid Amount (៛)</th>
                  <th className="saas-th" style={{ textAlign: 'right' }}>Remaining Debt (៛)</th>
                  <th className="saas-th" style={{ textAlign: 'center', width: '200px' }}>Settle Remaining</th>
                  <th className="saas-th" style={{ textAlign: 'center', width: '120px' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                   <TableSkeleton columns={7} rows={5} />
                ) : historyDays.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <EmptyState 
                        icon="📚" 
                        title="No history found" 
                        message="No settled records found for this view." 
                      />
                    </td>
                  </tr>
                ) : (
                  historyDays.map((d: any) => {
                    const remaining = d.totalCogs - d.totalPaid;
                    const isDone = remaining <= 0;
                    const paymentState = getInlinePaymentState(d.key, remaining);
                    
                    return (
                      <tr key={d.key} className="saas-tr" style={{ opacity: isDone ? 0.7 : 1 }}>
                        <td className="saas-td">
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{new Date(d.date).toLocaleDateString('en-GB')}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Owner: <span style={{color: '#0f172a'}}>{d.owner}</span></div>
                        </td>
                        <td className="saas-td" style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatRiel(d.totalCogs)}</td>
                        <td className="saas-td" style={{ textAlign: 'center', color: '#3b82f6', fontWeight: 'bold', fontSize: '12px' }}>
                          {Array.from(d.methods).join(', ') || '-'}
                        </td>
                        <td className="saas-td" style={{ textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>{formatRiel(d.totalPaid)}</td>
                        
                        <td className="saas-td" style={{ textAlign: 'right', color: '#ef4444', fontWeight: 'bold', fontSize: '15px' }}>
                          {remaining > 0 ? formatRiel(remaining) : ''}
                        </td>

                        <td className="saas-td" style={{ textAlign: 'right' }}>
                          {remaining > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map(row => (
                                <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <select 
                                      value={row.method}
                                      onChange={(e) => updateInlineRow(d.key, row.id, 'method', e.target.value, remaining)}
                                      className="saas-input"
                                      style={{ padding: '8px', flex: 1, fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                      <option value="Mom Liability ៛">📉 Mom Liability ៛</option>
                                      <option value="Mom Liability $">📉 Mom Liability $</option>
                                      <option value="Cash ៛">💵 Cash ៛</option>
                                      <option value="Cash $">💵 Cash $</option>
                                      <option value="QR ៛">📱 QR ៛</option>
                                      <option value="QR $">📱 QR $</option>
                                    </select>
                                    {paymentState.length > 1 && (
                                      <button onClick={() => removeInlineSplit(d.key, row.id, remaining)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>✕</button>
                                    )}
                                  </div>
                                  <CurrencyInput
                                    placeholder={formatRiel(remaining)}
                                    value={row.amount}
                                    onChange={(v: any) => updateInlineRow(d.key, row.id, 'amount', v, remaining)}
                                    onEnter={() => handleProcessCreditPayment(d, paymentState)}
                                    className="saas-input"
                                    style={{ padding: '8px', textAlign: 'right' }}
                                  />
                                </div>
                              ))}
                              <button onClick={() => addInlineSplit(d.key, remaining)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'right', fontWeight: 'bold' }}>+ Add Split</button>
                            </div>
                          ) : (
                            <div style={{ color: '#10b981', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>Fully Settled</div>
                          )}
                        </td>

                        <td className="saas-td" style={{ textAlign: 'center' }}>
                          {!isDone && (
                            <button 
                              onClick={() => handleProcessCreditPayment(d, paymentState)}
                              className="saas-btn saas-btn-primary"
                              style={{ width: '100%', padding: '8px 12px' }}
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

      {/* BULK SETTLE MODAL */}
      {bulkModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setBulkModalOpen(false)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '450px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#334155', fontSize: '18px', fontWeight: 'bold' }}>💸 Bulk Settle COGS</h3>
              <button onClick={() => setBulkModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', color: '#475569', fontWeight: 'bold' }}>
              <span>Settling: <b>{selectedDays.length} Days</b></span>
            </div>

            <div style={{ background: '#fff1f2', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #fecaca', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#be123c', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Total COGS Due</div>
              <div style={{ fontSize: '28px', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(bulkTotalDue)}</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold' }}>Payment Method(s)</label>
                <button onClick={() => setBulkPaymentRows([...bulkPaymentRows, { id: Date.now(), method: 'Mom Liability ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>+ Split</button>
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
                    className="saas-input"
                    style={{ width: '50%', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    <option value="Mom Liability ៛">📉 Mom Liability ៛</option>
                    <option value="Mom Liability $">📉 Mom Liability $</option>
                    <option value="Cash ៛">💵 Cash ៛</option>
                    <option value="Cash $">💵 Cash $</option>
                    <option value="QR ៛">📱 QR ៛</option>
                    <option value="QR $">📱 QR $</option>
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
                      className="saas-input"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                  
                  {bulkPaymentRows.length > 1 && (
                    <button onClick={() => setBulkPaymentRows(bulkPaymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>
              ))}

              {activeOwnerTab === 'mom' && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '12px', padding: '8px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1', fontWeight: 'bold' }}>
                  <b>💡 Tip:</b> Select <i>"Mom Liability"</i> to pay this COGS using the money you collected from Mom's deliveries. 
                  <br/><br/>
                  <b>Available Liability:</b> <span style={{color: '#b58a3d', fontWeight: 'bold'}}>{formatRiel(liveMomLiability)}</span>
                </div>
              )}
            </div>

            {bulkPaymentRows.some(r => Number(r.amount) > 0) && (
              <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 'bold' }}>
                  <span style={{ color: '#64748b' }}>Total Processed:</span>
                  <span style={{ color: '#334155' }}>{formatRiel(liveBulkReceived)}</span>
                </div>
                {liveBulkRemaining < 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span style={{ color: '#ef4444' }}>Overpaid By:</span>
                    <span style={{ color: '#dc2626' }}>{formatRiel(Math.abs(liveBulkRemaining))}</span>
                  </div>
                ) : liveBulkRemaining > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span style={{ color: '#d97706' }}>Still Owes:</span>
                    <span style={{ color: '#b45309' }}>{formatRiel(liveBulkRemaining)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span style={{ color: '#166534' }}>Balance:</span>
                    <span style={{ color: '#15803d' }}>Perfectly Cleared ✅</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setBulkModalOpen(false)} className="saas-btn saas-btn-secondary" style={{ padding: '12px 16px', fontSize: '15px' }}>Cancel</button>
              <button onClick={() => processPayments(bulkPaymentRows, selectedDays.map(k => dailyMap[k]), true)} disabled={isProcessing} className="saas-btn saas-btn-primary" style={{ padding: '12px 16px', fontSize: '15px' }}>
                {isProcessing ? 'Processing...' : 'Confirm Bulk Settle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 LOAD MORE BUTTON */}
      <div style={{ textAlign: 'center', padding: '20px', marginTop: '20px' }}>
        <button 
          onClick={() => setLoadLimit(prev => prev + 2000)}
          className="saas-btn saas-btn-secondary"
          style={{ borderRadius: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
        >
          ⬇️ Load Older Records (Current Limit: {loadLimit})
        </button>
      </div>

      {/* --- PAGE-SPECIFIC CSS (A4 REPORT) --- */}
      <style jsx global>{`
        .a4-paper-container {
          width: 100%;
          max-width: 794px; 
          min-height: 1123px; 
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

        .header-container {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; margin-top: 0; margin-left: 60px; gap: 12px; min-height: 42px; width: calc(100% - 60px); max-width: 1600px;
        }
        .header-left {
          display: flex; align-items: center; gap: 12px;
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }

        @media print {
          body * { visibility: hidden; }
          .a4-paper-container, .a4-paper-container * { visibility: visible; }
          .a4-paper-container {
            position: absolute; left: 0; top: 0; margin: 0; padding: 20px; box-shadow: none; width: 100%;
          }
          @page { size: A4 portrait; margin: 10mm; }
        }

        @media (max-width: 1023px) { 
          .header-container {
            margin-left: 54px !important; 
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
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
          .a4-paper-container {
            padding: 16px; min-height: auto;
          }
        }
      `}</style>
    </div>
  )
}