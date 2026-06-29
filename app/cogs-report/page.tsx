'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'

const EXCHANGE_RATE = 4000;
const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

// ==========================================
// ROBUST LIVE COMMA FORMATTER 
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus }: any) {
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
      style={{ ...style, color: '#334155', fontWeight: 'normal', fontSize: '16px' }}
    />
  )
}

export default function CogsReportPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Navigation States
  const [activeMainTab, setActiveMainTab] = useState<'report' | 'settlement'>('report')
  const [activeTab, setActiveTab] = useState<'mom' | 'others'>('mom')
  
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  
  const reportRef = useRef<HTMLDivElement>(null)

  // Date filtering (Defaults to Today)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  // Settlement Modal States
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean, date: string, owner: string, totalDue: number, rows: any[] }>({ isOpen: false, date: '', owner: '', totalDue: 0, rows: [] })
  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | ''}[]>([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);

    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    setFromDate(localISOTime);
    setToDate(localISOTime);
  }, [])

  useEffect(() => {
    if (fromDate && toDate) fetchReportData();
  }, [fromDate, toDate])

  async function fetchReportData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', `${fromDate}T00:00:00`)
      .lte('created_at', `${toDate}T23:59:59`)
      .order('invoice_id', { ascending: true })

    if (error) console.error(error)
    else setSales(data || [])
    
    setLoading(false)
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

  // --- SETTLEMENT PAYMENT LOGIC ---
  const handleOpenPayment = (data: any) => {
    const balanceDue = data.totalCogs - data.totalPaid;
    setPaymentModal({ isOpen: true, date: data.date, owner: data.owner, totalDue: balanceDue, rows: data.rows });
    setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
  }

  async function handleProcessPayment() {
    setIsProcessing(true);

    const activePayments = paymentRows.filter(r => (Number(r.amount) || 0) > 0);
    if (activePayments.length === 0) {
      alert('Please enter at least one payment amount.');
      setIsProcessing(false);
      return;
    }

    const totalReceivedInRiel = activePayments.reduce((sum, row) => {
      const amt = Number(row.amount) || 0;
      return row.method.includes('$') ? sum + (amt * EXCHANGE_RATE) : sum + amt;
    }, 0);

    if (totalReceivedInRiel > paymentModal.totalDue) {
      alert('Payment cannot exceed the total remaining COGS balance.');
      setIsProcessing(false);
      return;
    }

    try {
      // 1. Log Financial Transactions (Adds full COGS amount to assets directly)
      for (const row of activePayments) {
        let amountRiel = Number(row.amount);
        if (row.method.includes('$')) amountRiel = amountRiel * EXCHANGE_RATE;

        // Force negative to act as an Income in an Expense table
        amountRiel = -Math.abs(amountRiel); 

        await supabase.from('expenses').insert([{
          expense_date: new Date().toISOString().split('T')[0],
          spender: 'Business',
          payment_method: row.method,
          remarks: `COGS Settlement: ${paymentModal.owner} for ${paymentModal.date}`,
          amount: 0,
          amount_riel: amountRiel,
          description: 'COGS'
        }]);
      }

      // 2. Distribute payment across the daily sales rows
      const paymentMethodString = activePayments.map(r => r.method).join(', ');
      let remainingToDistribute = totalReceivedInRiel;
      
      for (const s of paymentModal.rows) {
        if (remainingToDistribute <= 0) break;
        
        let qty = Number(s.qty || 0);
        let price = Number(s.cogs_price || 0);
        let amount = qty * price;
        let desc = s.custom_rice_type || s.rice_type || '';
        
        if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) {
          amount = -Math.abs(amount);
        } else {
          amount = Math.abs(amount);
        }

        if (amount <= 0) continue; 

        let paidSoFar = Number(s.cogs_paid_amount || 0);
        let owe = amount - paidSoFar;

        if (owe > 0) {
          let apply = Math.min(owe, remainingToDistribute);
          let newPaid = paidSoFar + apply;
          let newStatus = newPaid >= amount ? 'Paid' : 'Pending';

          let updatedMethods = s.cogs_payment_method ? `${s.cogs_payment_method}, ${paymentMethodString}` : paymentMethodString;
          let uniqueMethods = Array.from(new Set(updatedMethods.split(',').map(m => m.trim()))).join(', ');

          const { error } = await supabase.from('sales').update({
            cogs_paid_amount: newPaid,
            cogs_status: newStatus,
            cogs_payment_method: uniqueMethods
          }).eq('id', s.id);

          if (error) throw new Error("Failed to update sales row: ensure 'cogs_paid_amount', 'cogs_status', and 'cogs_payment_method' exist.");

          remainingToDistribute -= apply;
        }
      }

      setPaymentModal({ isOpen: false, date: '', owner: '', totalDue: 0, rows: [] });
      fetchReportData();

    } catch (error: any) {
      alert(`Error processing payment: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }


  // --- FILTERING LOGIC FOR BOTH TABS ---
  const filteredSales = sales.filter(s => {
    const owner = (s.owner || '').toLowerCase().trim();
    if (activeTab === 'mom') {
      return owner === 'mom' || owner === '' || owner === 'none' || owner === 'null';
    } else {
      return owner === 'pich' || owner === 'jing' || owner === 'both';
    }
  });

  // --- REPORT TAB PROCESSOR ---
  const groupedBySeller: Record<string, any[]> = {};
  filteredSales.forEach(s => {
    const seller = s.owner || 'Mom (Retail)';
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

  // --- SETTLEMENT TAB PROCESSOR ---
  const dailyMap: Record<string, any> = {};
  filteredSales.forEach(s => {
    const date = s.created_at.split('T')[0];
    const owner = s.owner || 'Mom';
    const key = `${date}_${owner}`;
    
    if (!dailyMap[key]) {
      dailyMap[key] = { date, owner, totalCogs: 0, totalPaid: 0, methods: new Set<string>(), rows: [] };
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
    dailyMap[key].totalPaid += Number(s.cogs_paid_amount || 0);
    
    if (s.cogs_payment_method) {
      s.cogs_payment_method.split(',').forEach((m: string) => dailyMap[key].methods.add(m.trim()));
    }
    
    dailyMap[key].rows.push(s);
  });

  const settlements = Object.values(dailyMap).sort((a: any, b: any) => {
    const aDone = (a.totalCogs - a.totalPaid) <= 0;
    const bDone = (b.totalCogs - b.totalPaid) <= 0;
    if (aDone && !bDone) return 1;
    if (!aDone && bDone) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  let combinedGrandTotal = 0;

  // Live Math for Modal
  const liveTotalReceivedInRiel = paymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);
  const liveRemaining = paymentModal.totalDue - liveTotalReceivedInRiel;

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
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <button 
          onClick={() => setActiveMainTab('report')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', background: activeMainTab === 'report' ? '#b58a3d' : 'transparent', color: activeMainTab === 'report' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
        >
          📊 COGS Report
        </button>
        <button 
          onClick={() => setActiveMainTab('settlement')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', background: activeMainTab === 'settlement' ? '#10b981' : 'transparent', color: activeMainTab === 'settlement' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
        >
          💰 COGS Settlements
        </button>
      </div>

      {/* FILTER TOOLBAR */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>From:</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>To:</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a', fontSize: '13px' }} />
        </div>
        
        <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 5px' }} />
        <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button onClick={() => setActiveTab('mom')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeTab === 'mom' ? '#10b981' : 'transparent', color: activeTab === 'mom' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Mom COGS (Retail)
          </button>
          <button onClick={() => setActiveTab('others')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', background: activeTab === 'others' ? '#b58a3d' : 'transparent', color: activeTab === 'others' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            Pich / Jing / Both COGS
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
            ) : filteredSales.length === 0 ? (
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
      {/* TAB 2: COGS SETTLEMENTS (Tracking Payments) */}
      {/* ==================================================================================== */}
      {activeMainTab === 'settlement' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '800px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: '500' }}>Date & Owner</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: '500' }}>Total COGS (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: '500' }}>Payment Method</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: '500' }}>Paid Amount (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: '500' }}>Remaining (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: '500' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: '500' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No COGS records found.</td></tr>
                ) : (
                  settlements.map((s: any) => {
                    const remaining = s.totalCogs - s.totalPaid;
                    const isDone = remaining <= 0;
                    
                    return (
                      <tr key={`${s.date}_${s.owner}`} style={{ borderBottom: '1px solid #f1f5f9', background: isDone ? '#f8fafc' : '#ffffff', opacity: isDone ? 0.7 : 1, transition: 'all 0.3s ease' }}>
                        <td style={{ padding: '16px', color: '#334155' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{new Date(s.date).toLocaleDateString('en-GB')}</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>Owner: <span style={{color: '#0f172a'}}>{s.owner}</span></div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: 'bold' }}>{formatRiel(s.totalCogs)}</td>
                        <td style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: 'bold' }}>
                          {Array.from(s.methods).join(', ') || '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>{formatRiel(s.totalPaid)}</td>
                        <td style={{ padding: '16px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold', fontSize: '15px' }}>
                          {remaining > 0 ? formatRiel(remaining) : ''}
                        </td>
                        
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {isDone ? (
                            <span style={{ padding: '6px 12px', background: '#dcfce7', color: '#166534', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>✅ Paid</span>
                          ) : (
                            <span style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>⏳ Pending</span>
                          )}
                        </td>

                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {!isDone && (
                            <button 
                              onClick={() => handleOpenPayment(s)}
                              style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                            >
                              💸 Settle COGS
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
          UNIFIED SPLIT PAYMENT MODAL FOR COGS
          ============================================================================================== */}
      {paymentModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setPaymentModal({ ...paymentModal, isOpen: false })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '450px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#334155', fontSize: '18px', fontWeight: '500' }}>💸 Settle COGS</h3>
              <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', color: '#475569' }}>
              <span>Owner: <b>{paymentModal.owner}</b></span>
              <span>Date: <b>{new Date(paymentModal.date).toLocaleDateString('en-GB')}</b></span>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Remaining COGS Due</div>
              <div style={{ fontSize: '28px', color: '#dc2626' }}>{formatRiel(paymentModal.totalDue)}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{formatUSD(paymentModal.totalDue / EXCHANGE_RATE)}</div>
            </div>

            {/* Split Payment Rows */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold' }}>Payment Method(s)</label>
                <button onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>+ Split</button>
              </div>

              {paymentRows.map((row, index) => (
                <div key={row.id} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                  <select 
                    value={row.method} 
                    onChange={e => {
                      const newRows = [...paymentRows];
                      newRows[index].method = e.target.value;
                      setPaymentRows(newRows);
                    }}
                    style={{ width: '45%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#334155' }}
                  >
                    <option value="Cash ៛">💵 Cash ៛</option>
                    <option value="Cash $">💵 Cash $</option>
                    <option value="QR ៛">📱 QR ៛</option>
                    <option value="QR $">📱 QR $</option>
                    <option value="Mom QR ៛">👩 Mom QR ៛</option>
                    <option value="Mom QR $">👩 Mom QR $</option>
                  </select>
                  
                  <div style={{ flex: 1 }}>
                    <CurrencyInput 
                      placeholder="" 
                      value={row.amount} 
                      onChange={(val: any) => {
                        const newRows = [...paymentRows];
                        newRows[index].amount = val;
                        setPaymentRows(newRows);
                      }}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', textAlign: 'right' }}
                    />
                  </div>
                  
                  {paymentRows.length > 1 && (
                    <button onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Live Calculation Footer */}
            {paymentRows.some(r => Number(r.amount) > 0) && (
              <div style={{ marginBottom: '24px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Total Processed:</span>
                  <span style={{ color: '#334155', fontWeight: 'bold' }}>{formatRiel(liveTotalReceivedInRiel)}</span>
                </div>
                {liveRemaining < 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ef4444' }}>Overpaid By:</span>
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatRiel(Math.abs(liveRemaining))}</span>
                  </div>
                ) : liveRemaining > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#d97706' }}>Still Owes:</span>
                    <span style={{ color: '#b45309', fontWeight: 'bold' }}>{formatRiel(liveRemaining)}</span>
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
              <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontSize: '15px', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={handleProcessPayment} disabled={isProcessing} style={{ padding: '12px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>
                {isProcessing ? 'Processing...' : 'Confirm Settle'}
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