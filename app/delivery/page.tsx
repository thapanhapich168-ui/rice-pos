'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const EXCHANGE_RATE = 4000;

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

type PaymentRow = { id: number, method: string, amount: number | '' };

// ==========================================
// ROBUST LIVE COMMA FORMATTER (With Enter Support)
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, onEnter, onBlurCustom }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === undefined) {
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
      onBlur={() => {
        if (onBlurCustom) onBlurCustom();
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }, 100);
      }}
      style={{ ...style, color: '#334155', fontWeight: 'normal' }}
      className="mobile-input-field"
    />
  )
}

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'delivery' | 'credit'>('delivery')
  
  // DYNAMIC SPLIT PAYMENT STATES
  const [inlinePayments, setInlinePayments] = useState<Record<string, PaymentRow[]>>({})
  const [creditPayments, setCreditPayments] = useState<Record<string, PaymentRow[]>>({})

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchDeliveries();

    // 🚀 NEW: True Realtime Live View for Delivery Queue!
    const deliveryChannel = supabase.channel('delivery-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_summaries' }, () => {
        fetchDeliveries();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(deliveryChannel);
    };
  }, [])

  async function fetchDeliveries() {
    setLoading(true);
    const { data, error } = await supabase
      .from('invoice_summaries')
      .select('*')
      .not('customer_name', 'ilike', '%Walk-in%')
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    else if (data) setDeliveries(data);
    
    setLoading(false);
  }

  // --- QUICK UPDATES ---
  async function updateInvoiceField(invoiceId: string, field: string, value: any) {
    setDeliveries(prev => prev.map((d: any) => d.invoice_id === invoiceId ? { ...d, [field]: value } : d));
    const { error } = await supabase.from('invoice_summaries').update({ [field]: value }).eq('invoice_id', invoiceId);
    if (error) {
      alert(`Error updating ${field}: ${error.message}`);
      fetchDeliveries();
    }
  }

  // --- SPLIT STATE MANAGERS (INLINE) ---
  const getInlinePaymentState = (invId: string, balanceDue: number) => {
    return inlinePayments[invId] || [{ id: 1, method: 'Cash ៛', amount: balanceDue }];
  }

  const updateInlineRow = (invId: string, rowId: number, field: string, value: any, balanceDue: number) => {
    setInlinePayments(prev => {
      const rows = prev[invId] ? [...prev[invId]] : [{ id: 1, method: 'Cash ៛', amount: balanceDue }];
      const newRows = rows.map(r => r.id === rowId ? { ...r, [field]: value } : r);
      return { ...prev, [invId]: newRows };
    });
  }

  const addInlineSplit = (invId: string, balanceDue: number) => {
    setInlinePayments(prev => {
      const rows = prev[invId] ? [...prev[invId]] : [{ id: 1, method: 'Cash ៛', amount: balanceDue }];
      return { ...prev, [invId]: [...rows, { id: Date.now(), method: 'Cash ៛', amount: '' }] };
    });
  }

  const removeInlineSplit = (invId: string, rowId: number, balanceDue: number) => {
    setInlinePayments(prev => {
      const rows = prev[invId] ? [...prev[invId]] : [{ id: 1, method: 'Cash ៛', amount: balanceDue }];
      return { ...prev, [invId]: rows.filter(r => r.id !== rowId) };
    });
  }

  // --- PROCESS INLINE DELIVERY PAYMENT ---
  async function handleInlineProcess(d: any, rows: PaymentRow[]) {
    if (isProcessing) return;

    let totalRielEq = 0;
    let methodStrings: string[] = [];
    const paymentRecordsToInsert: any[] = [];
    const validSpender = ['Pich', 'Jing'].includes(d.owner) ? d.owner : 'Both';

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      
      const isUsd = r.method.includes('$');
      let convertedAmt = isUsd ? amt * EXCHANGE_RATE : amt;
      
      totalRielEq += convertedAmt;
      methodStrings.push(`${r.method}: ${amt}`);

      paymentRecordsToInsert.push({
        invoice_id: d.invoice_id,
        amount_paid_riel: isUsd ? 0 : amt,
        amount_paid_usd: isUsd ? amt : 0,
        payment_method: r.method,
        recorded_by: validSpender,
        remarks: `Inline Delivery Settlement`
      });
    }

    if (totalRielEq <= 0) return;

    setIsProcessing(true);

    try {
      const { error: ledgerError } = await supabase.from('invoice_payments').insert(paymentRecordsToInsert);
      if (ledgerError) throw new Error("Failed to log payment ledger: " + ledgerError.message);

      const newBalance = d.balance_due - totalRielEq;
      let newPaymentMethodStr = d.payment_method;
      
      newPaymentMethodStr = d.payment_method && d.payment_method !== '-' && d.payment_method !== 'Unpaid / Debt'
          ? `${d.payment_method}, ${methodStrings.join(', ')}`
          : methodStrings.join(', ');

      const isDone = newBalance <= 0;

      // Update Local State. It always marks as delivered so it grays out and drops down!
      setDeliveries(prev => prev.map(inv => inv.invoice_id === d.invoice_id ? {
        ...inv,
        balance_due: newBalance,
        payment_method: newPaymentMethodStr,
        is_done: isDone,
        delivery_status: 'Delivered' 
      } : inv));
      
      setInlinePayments(prev => { const n = {...prev}; delete n[d.invoice_id]; return n; });

      await supabase.from('invoice_summaries')
        .update({
            balance_due: newBalance,
            payment_method: newPaymentMethodStr,
            is_done: isDone,
            delivery_status: 'Delivered'
        })
        .eq('invoice_id', d.invoice_id);

    } catch (error: any) {
      alert(`Error processing payment: ${error.message}`);
      fetchDeliveries(); 
    } finally {
      setIsProcessing(false);
    }
  }

  // --- REAL UNDO CAPABILITY ---
  async function handleUndoProcess(d: any) {
    if (!confirm('Are you sure you want to undo? This will permanently delete the collected payment records and revert your Dashboard Cash.')) return;
    
    setIsProcessing(true);
    try {
      const { error: delErr } = await supabase.from('invoice_payments').delete().eq('invoice_id', d.invoice_id);
      if (delErr) throw delErr;

      const { error: updErr } = await supabase.from('invoice_summaries').update({
          balance_due: d.total_sales, // Resets math to original total sale
          payment_method: '-',
          is_done: false,
          delivery_status: 'Pending'
      }).eq('invoice_id', d.invoice_id);
      if (updErr) throw updErr;

      fetchDeliveries();
    } catch (error: any) {
      alert(`Error undoing payment: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // --- SPLIT STATE MANAGERS (CREDIT) ---
  const getCreditPaymentState = (uniqueKey: string, totalOwed: number) => {
    return creditPayments[uniqueKey] || [{ id: 1, method: 'Cash ៛', amount: totalOwed }];
  }

  const updateCreditRow = (uniqueKey: string, rowId: number, field: string, value: any, totalOwed: number) => {
    setCreditPayments(prev => {
      const rows = prev[uniqueKey] ? [...prev[uniqueKey]] : [{ id: 1, method: 'Cash ៛', amount: totalOwed }];
      const newRows = rows.map(r => r.id === rowId ? { ...r, [field]: value } : r);
      return { ...prev, [uniqueKey]: newRows };
    });
  }

  const addCreditSplit = (uniqueKey: string, totalOwed: number) => {
    setCreditPayments(prev => {
      const rows = prev[uniqueKey] ? [...prev[uniqueKey]] : [{ id: 1, method: 'Cash ៛', amount: totalOwed }];
      return { ...prev, [uniqueKey]: [...rows, { id: Date.now(), method: 'Cash ៛', amount: '' }] };
    });
  }

  const removeCreditSplit = (uniqueKey: string, rowId: number, totalOwed: number) => {
    setCreditPayments(prev => {
      const rows = prev[uniqueKey] ? [...prev[uniqueKey]] : [{ id: 1, method: 'Cash ៛', amount: totalOwed }];
      return { ...prev, [uniqueKey]: rows.filter(r => r.id !== rowId) };
    });
  }

  // --- PROCESS CREDIT PAYMENT ---
  async function handleProcessCreditPayment(debtor: any, rows: PaymentRow[]) {
    if (isProcessing) return;

    let totalRielEq = 0;
    let methodStrings: string[] = [];
    let availableFunds: { method: string, isUsd: boolean, faceRemaining: number, eqRemaining: number }[] = [];

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      
      const isUsd = r.method.includes('$');
      let convertedAmt = isUsd ? amt * EXCHANGE_RATE : amt;
      
      totalRielEq += convertedAmt;
      methodStrings.push(`${r.method}: ${amt}`);
      
      availableFunds.push({
          method: r.method,
          isUsd: isUsd,
          faceRemaining: amt,
          eqRemaining: convertedAmt
      });
    }

    if (totalRielEq <= 0) return;

    setIsProcessing(true);

    try {
      const validSpender = ['Pich', 'Jing'].includes(debtor.owner) ? debtor.owner : 'Both';
      
      const updatedInvoices: any[] = [];
      const paymentRecordsToInsert: any[] = [];
      const combinedMethodStr = methodStrings.join(', ');
      
      for (const inv of debtor.invoices) {
        let invBalance = Number(inv.balance_due) || 0;
        if (invBalance <= 0) continue;
        
        let amountAppliedToThisInvoiceRielEq = 0;

        for (let fund of availableFunds) {
            if (fund.eqRemaining <= 0) continue;
            if (invBalance <= 0) break;

            let applyEq = Math.min(invBalance, fund.eqRemaining);
            let applyFace = fund.isUsd ? applyEq / EXCHANGE_RATE : applyEq;

            paymentRecordsToInsert.push({
                invoice_id: inv.invoice_id,
                amount_paid_riel: fund.isUsd ? 0 : applyFace,
                amount_paid_usd: fund.isUsd ? applyFace : 0,
                payment_method: fund.method,
                recorded_by: validSpender,
                remarks: `Bulk Credit Settlement`
            });

            fund.eqRemaining -= applyEq;
            fund.faceRemaining -= applyFace;
            invBalance -= applyEq;
            amountAppliedToThisInvoiceRielEq += applyEq;
        }
        
        if (amountAppliedToThisInvoiceRielEq > 0) {
            let newBalance = (Number(inv.balance_due) || 0) - amountAppliedToThisInvoiceRielEq;
            let newPaymentMethodStr = inv.payment_method;
            const appliedStr = `Paid: ${formatRiel(amountAppliedToThisInvoiceRielEq)} via [${combinedMethodStr}]`;

            if (inv.payment_method && inv.payment_method !== '-' && inv.payment_method !== 'Unpaid / Debt') {
               newPaymentMethodStr = `${inv.payment_method}, ${appliedStr}`;
            } else {
               newPaymentMethodStr = appliedStr;
            }

            updatedInvoices.push({
              invoice_id: inv.invoice_id,
              balance_due: newBalance,
              payment_method: newPaymentMethodStr,
              is_done: newBalance <= 0,
              delivery_status: newBalance <= 0 ? 'Delivered' : inv.delivery_status
            });
        }
      }

      if (paymentRecordsToInsert.length > 0) {
        const { error: ledgerError } = await supabase.from('invoice_payments').insert(paymentRecordsToInsert);
        if (ledgerError) throw new Error("Failed to log payment ledger: " + ledgerError.message);
      }

      const uniqueKey = `${debtor.owner}_${debtor.name}`;
      setDeliveries(prev => prev.map(d => {
        const matched = updatedInvoices.find(u => u.invoice_id === d.invoice_id);
        return matched ? { ...d, ...matched } : d;
      }));
      setCreditPayments(prev => { const n = {...prev}; delete n[uniqueKey]; return n; });

      for (const u of updatedInvoices) {
        await supabase.from('invoice_summaries').update({
          balance_due: u.balance_due,
          payment_method: u.payment_method,
          is_done: u.is_done,
          delivery_status: u.delivery_status
        }).eq('invoice_id', u.invoice_id);
      }

    } catch (error: any) {
      alert(`Error settling account: ${error.message}`);
      fetchDeliveries();
    } finally {
      setIsProcessing(false);
    }
  }

  // --- DATA PROCESSING & SORTING ---
  const isFullyComplete = (d: any) => d.is_done === true;
  const isDeliveredVisual = (d: any) => d.delivery_status === 'Delivered';

  // Rule: Sort Delivered invoices entirely to the bottom of the delivery tab.
  const sortedDeliveries = [...deliveries].sort((a: any, b: any) => {
    const aDone = isDeliveredVisual(a);
    const bDone = isDeliveredVisual(b);
    if (!aDone && bDone) return -1;
    if (aDone && !bDone) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const debtorsMap = deliveries.reduce((acc: any, curr: any) => {
    const balance = Number(curr.balance_due) || 0;
    
    // Credit tab logic: ONLY show if they owe money AND the physical delivery is finished!
    if (balance > 0 && curr.delivery_status === 'Delivered' && !isFullyComplete(curr)) {
      let owner = (curr.owner || '').trim();
      if (!owner) owner = 'Unassigned';
      owner = owner.charAt(0).toUpperCase() + owner.slice(1).toLowerCase();

      const key = `${owner}___${curr.customer_name}`; 
      
      if (!acc[key]) {
        acc[key] = { 
          name: curr.customer_name, 
          owner: owner, 
          totalOwed: 0, 
          invoices: [],
          oldestDate: curr.created_at 
        };
      }
      
      acc[key].totalOwed += balance;
      acc[key].invoices.push(curr);
      
      if (new Date(curr.created_at) < new Date(acc[key].oldestDate)) {
         acc[key].oldestDate = curr.created_at;
      }
    }
    return acc;
  }, {});

  const debtorsList = Object.values(debtorsMap).sort((a: any, b: any) => b.totalOwed - a.totalOwed);

  const groupedDebtors: Record<string, any[]> = debtorsList.reduce((acc: Record<string, any[]>, curr: any) => {
    if (!acc[curr.owner]) acc[curr.owner] = [];
    acc[curr.owner].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  const ownerOrder = ['Pich', 'Jing', 'Both', 'Mom', 'Unassigned'];
  const activeOwners = Object.keys(groupedDebtors).sort((a, b) => {
    let idxA = ownerOrder.indexOf(a);
    let idxB = ownerOrder.indexOf(b);
    if (idxA === -1) idxA = 99;
    if (idxB === -1) idxB = 99;
    return idxA - idxB;
  });

  function sidebarContent() {
    if (loading) {
      return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>Loading records...</div>;
    }
    
    if (activeTab === 'delivery') {
      return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1050px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Date & INV</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Customer</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '25%' }}>Items Ordered</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Total (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '160px' }}>Payment Method</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '180px' }}>Pay Amount</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '120px' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeliveries.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '15px' }}>No active wholesale deliveries.</td></tr>
                ) : (
                  sortedDeliveries.map((d: any) => {
                    const isDoneVisual = isDeliveredVisual(d);
                    const totalSale = Number(d.total_sales) || 0;
                    const balanceDue = Number(d.balance_due) || 0;
                    const paymentState = getInlinePaymentState(d.invoice_id, balanceDue);
                    
                    return (
                      <tr key={d.invoice_id} style={{ borderBottom: '1px solid #f1f5f9', background: isDoneVisual ? '#f8fafc' : '#ffffff', opacity: isDoneVisual ? 0.6 : 1, transition: 'all 0.3s ease' }}>
                        <td style={{ padding: '16px 20px', color: '#475569', fontSize: '14px', verticalAlign: 'top' }}>
                          <div style={{ color: '#3b82f6', marginBottom: '4px' }}>{d.invoice_id}</div>
                          <div style={{ fontSize: '12px' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'top' }}>
                          <div style={{ color: '#334155', fontSize: '15px', marginBottom: '4px' }}>{d.customer_name}</div>
                          <div style={{ color: '#64748b', fontSize: '12px' }}>📍 {d.customer_location || 'No location'}</div>
                        </td>
                        <td style={{ padding: '16px 20px', color: '#475569', lineHeight: '1.6', fontSize: '13px', verticalAlign: 'top' }}>{d.rice_types}</td>
                        
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#334155', fontSize: '15px', verticalAlign: 'top' }}>{formatRiel(totalSale)}</td>
                        
                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'delivery_status', d.delivery_status === 'Pending' ? 'Delivered' : 'Pending')}
                            style={{
                              padding: '6px 12px', borderRadius: '20px', border: 'none', fontSize: '13px', cursor: 'pointer',
                              background: d.delivery_status === 'Pending' ? '#fef3c7' : '#dcfce7',
                              color: d.delivery_status === 'Pending' ? '#d97706' : '#15803d',
                              transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px', width: '100px', justifyContent: 'center', margin: '0 auto'
                            }}
                          >
                            {d.delivery_status === 'Pending' ? '🟡 Pending' : '🟢 Delivered'}
                          </button>
                        </td>

                        {/* PAYMENT METHOD COLUMN */}
                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          {balanceDue > 0 && !isDoneVisual ? (
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               {paymentState.map((row) => (
                                 <select 
                                   key={row.id}
                                   value={row.method}
                                   onChange={(e) => updateInlineRow(d.invoice_id, row.id, 'method', e.target.value, balanceDue)}
                                   style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', backgroundColor: '#fff', color: '#334155', cursor: 'pointer', width: '100%', height: '40px', boxSizing: 'border-box' }}
                                 >
                                    <option value="Cash ៛">💵 Cash ៛</option>
                                    <option value="Cash $">💵 Cash $</option>
                                    <option value="QR ៛">📱 QR ៛</option>
                                    <option value="QR $">📱 QR $</option>
                                    <option value="Mom QR ៛">👩 Mom QR ៛</option>
                                    <option value="Mom QR $">👩 Mom QR $</option>
                                 </select>
                               ))}
                               <button onClick={() => addInlineSplit(d.invoice_id, balanceDue)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}>+ Add Split</button>
                             </div>
                          ) : (
                            <div style={{ color: '#475569', fontSize: '13px' }}>{d.payment_method}</div>
                          )}
                        </td>

                        {/* PAY AMOUNT COLUMN */}
                        <td style={{ padding: '16px 20px', textAlign: 'right', verticalAlign: 'top' }}>
                          {balanceDue > 0 && !isDoneVisual ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map((row) => (
                                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}>
                                  <CurrencyInput
                                    placeholder={formatRiel(balanceDue)}
                                    value={row.amount}
                                    onChange={(v: any) => updateInlineRow(d.invoice_id, row.id, 'amount', v, balanceDue)}
                                    onEnter={() => handleInlineProcess(d, paymentState)}
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', textAlign: 'right', outline: 'none', width: '100%', backgroundColor: '#fff', color: '#334155', height: '100%', boxSizing: 'border-box' }}
                                  />
                                  {paymentState.length > 1 && (
                                    <button onClick={() => removeInlineSplit(d.invoice_id, row.id, balanceDue)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>

                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button 
                            onClick={() => {
                              if (isDoneVisual) {
                                handleUndoProcess(d);
                              } else {
                                handleInlineProcess(d, paymentState);
                              }
                            }}
                            disabled={isProcessing}
                            style={{
                              padding: '8px 12px', width: '100%', borderRadius: '6px', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '13px',
                              background: isDoneVisual ? '#e2e8f0' : '#10b981',
                              color: isDoneVisual ? '#475569' : '#ffffff',
                              transition: 'all 0.2s', height: '40px'
                            }}
                          >
                            {isProcessing ? '...' : isDoneVisual ? 'Undo' : '✔ Done'}
                          </button>
                        </td>

                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '950px' }}>
            <thead style={{ background: '#fff1f2', borderBottom: '1px solid #ffe4e6' }}>
              <tr>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Date</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Owner</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Customer & Invoices</th>
                <th style={{ padding: '16px 20px', textAlign: 'right', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Total Debt (៛)</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '160px' }}>Method</th>
                <th style={{ padding: '16px 20px', textAlign: 'right', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '180px' }}>Pay Amount (៛)</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', color: '#be123c', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '120px' }}>Complete</th>
              </tr>
            </thead>
            {activeOwners.length === 0 ? (
              <tbody><tr><td colSpan={7} style={{ textAlign: 'center', padding: '60px', color: '#10b981', fontSize: '15px' }}>🎉 All customers are fully paid up!</td></tr></tbody>
            ) : (
              activeOwners.map(ownerName => {
                const list = groupedDebtors[ownerName];
                const ownerTotalOwed = list.reduce((sum: number, d: any) => sum + d.totalOwed, 0);
                return (
                  <tbody key={ownerName}>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td colSpan={3} style={{ padding: '14px 20px', color: '#334155', fontSize: '14px', borderBottom: '1px solid #e2e8f0' }}>
                        👤 Owner: {ownerName}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#334155', fontSize: '15px', borderBottom: '1px solid #e2e8f0' }}>
                        {formatRiel(ownerTotalOwed)}
                      </td>
                      <td colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}></td>
                    </tr>
                    {list.map((debtor: any) => {
                      const uniqueKey = `${debtor.owner}_${debtor.name}`;
                      const paymentState = getCreditPaymentState(uniqueKey, debtor.totalOwed);
                      
                      return (
                        <tr key={uniqueKey} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff', transition: 'background 0.2s ease' }}>
                          <td style={{ padding: '20px', color: '#64748b', fontSize: '14px', verticalAlign: 'top' }}>
                            {new Date(debtor.oldestDate).toLocaleDateString('en-GB')}
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', textTransform: 'uppercase' }}>Oldest Date</div>
                          </td>
                          <td style={{ padding: '20px', color: '#475569', fontSize: '15px', verticalAlign: 'top' }}>
                            {debtor.owner}
                          </td>

                          {/* BEAUTIFUL NESTED INVOICE LIST */}
                          <td style={{ padding: '20px', verticalAlign: 'top' }}>
                            <div style={{ color: '#334155', fontSize: '15px', marginBottom: '10px' }}>
                              {debtor.name}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {debtor.invoices.map((inv: any) => (
                                <div key={inv.invoice_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>#{inv.invoice_id.replace('INV-', '')}</span>
                                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <span style={{ color: '#64748b', fontSize: '11px' }}>Orig: {formatRiel(inv.total_sales)}</span>
                                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Debt: {formatRiel(inv.balance_due)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>

                          <td style={{ padding: '20px', textAlign: 'right', color: '#ef4444', fontSize: '16px', verticalAlign: 'top', fontWeight: 'bold' }}>
                            {formatRiel(debtor.totalOwed)}
                          </td>
                          
                          <td style={{ padding: '20px', textAlign: 'center', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map(row => (
                                <select 
                                  key={row.id}
                                  value={row.method}
                                  onChange={(e) => updateCreditRow(uniqueKey, row.id, 'method', e.target.value, debtor.totalOwed)}
                                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', backgroundColor: '#fff', color: '#334155', cursor: 'pointer', width: '100%', height: '40px', boxSizing: 'border-box' }}
                                >
                                   <option value="Cash ៛">💵 Cash ៛</option>
                                   <option value="Cash $">💵 Cash $</option>
                                   <option value="QR ៛">📱 QR ៛</option>
                                   <option value="QR $">📱 QR $</option>
                                   <option value="Mom QR ៛">👩 Mom QR ៛</option>
                                   <option value="Mom QR $">👩 Mom QR $</option>
                                </select>
                              ))}
                              <button onClick={() => addCreditSplit(uniqueKey, debtor.totalOwed)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '12px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}>+ Add Split</button>
                            </div>
                          </td>

                          <td style={{ padding: '20px', textAlign: 'right', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map(row => (
                                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}>
                                  <CurrencyInput
                                    placeholder={formatRiel(debtor.totalOwed)}
                                    value={row.amount}
                                    onChange={(v: any) => updateCreditRow(uniqueKey, row.id, 'amount', v, debtor.totalOwed)}
                                    onEnter={() => handleProcessCreditPayment(debtor, paymentState)}
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', textAlign: 'right', outline: 'none', width: '100%', backgroundColor: '#fff', color: '#334155', height: '100%', boxSizing: 'border-box' }}
                                  />
                                  {paymentState.length > 1 && (
                                    <button onClick={() => removeCreditSplit(uniqueKey, row.id, debtor.totalOwed)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>

                          <td style={{ padding: '20px', textAlign: 'center', verticalAlign: 'top' }}>
                            <button 
                              onClick={() => handleProcessCreditPayment(debtor, paymentState)}
                              disabled={isProcessing}
                              style={{
                                padding: '8px 12px', width: '100%', borderRadius: '8px', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '13px',
                                background: '#10b981', color: '#ffffff', transition: 'all 0.2s', height: '40px'
                              }}
                            >
                              {isProcessing ? '...' : '✔ Done'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                );
              })
            )}
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="main-wrapper">
        <div className="header-container">
          <div className="header-left">
            <h1 className="page-title">🚚 Delivery & Credit Hub</h1>
          </div>
        </div>

        <div className="tabs-container">
          <button onClick={() => setActiveTab('delivery')} className={`tab-toggle-button ${activeTab === 'delivery' ? 'active-tab' : ''}`}>📦 Delivery Queue</button>
          <button onClick={() => setActiveTab('credit')} className={`tab-toggle-button ${activeTab === 'credit' ? 'active-tab' : ''}`}>💰 Accounts Credit ({debtorsList.length})</button>
        </div>

        {sidebarContent()}
      </div>

      <style jsx global>{`
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }

        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

        /* 🔥 DESKTOP LAYOUT FIXES */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          min-height: 100vh;
          width: 100%;
        }

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* 🔥 Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          min-height: 42px; 
          width: 100%;
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

        .tabs-container {
          display: flex; 
          gap: 8px; 
          margin-bottom: 24px; 
          background: #fff; 
          padding: 6px; 
          border-radius: 12px; 
          border: 1px solid #f1f5f9;
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          flex-wrap: wrap;
          max-width: 500px;
        }

        .tab-toggle-button {
          flex: 1; 
          padding: 12px; 
          border-radius: 8px; 
          border: none; 
          cursor: pointer; 
          font-size: 14px;
          background: transparent;
          color: #64748b;
          transition: all 0.2s ease;
          white-space: nowrap;
          min-width: 120px;
        }

        .active-tab {
          background: #b58a3d !important;
          color: #ffffff !important;
          box-shadow: 0 4px 10px rgba(181, 138, 61, 0.2);
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .mobile-input-field:focus, .mobile-select-menu:focus {
          border-color: #b58a3d !important;
          box-shadow: 0 0 0 2px rgba(181, 138, 61, 0.2) !important;
        }

        /* 🔥 MOBILE LAYOUT FIXES */
        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
          }
          .header-container { 
            margin-left: 54px !important; /* Clears mobile hamburger button safely */
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
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

          .page-title {
            font-size: 21px !important; 
            line-height: normal !important; 
            white-space: nowrap !important; 
          }

          .tabs-container {
            padding: 4px !important;
            margin-bottom: 20px !important;
            max-width: 100%;
          }
          .tab-toggle-button {
            padding: 10px !important;
            font-size: 13px !important;
          }
          .mobile-select-menu, .mobile-input-field {
            font-size: 16px !important; 
          }
        }
      `}</style>
    </>
  );
}