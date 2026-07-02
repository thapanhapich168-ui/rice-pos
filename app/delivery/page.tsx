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
      style={{ ...style, color: '#000000', fontWeight: 'normal' }}
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
    let totalUsdFace = 0;
    let totalRielFace = 0;
    let methodStrings: string[] = [];

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      
      if (r.method.includes('$')) {
        totalRielEq += (amt * EXCHANGE_RATE);
        totalUsdFace += amt;
      } else {
        totalRielEq += amt;
        totalRielFace += amt;
      }
      methodStrings.push(`${r.method}: ${amt}`);
    }

    if (totalRielEq <= 0) return;
    if (totalRielEq > d.balance_due + 0.1) return alert('Cannot pay more than the balance due.');

    setIsProcessing(true);

    try {
      const validSpender = ['Pich', 'Jing'].includes(d.owner) ? d.owner : 'Both';

      const { error: expError } = await supabase.from('expenses').insert([{
        expense_date: new Date().toISOString().split('T')[0],
        spender: validSpender,
        payment_method: methodStrings.join(', '),
        remarks: `Payment from ${d.customer_name} (Inv: ${d.invoice_id})`,
        amount: totalUsdFace > 0 ? -Math.abs(totalUsdFace) : 0,
        amount_riel: totalRielFace > 0 ? -Math.abs(totalRielFace) : 0,
        description: 'BUSINESS'
      }]);

      if (expError) throw new Error("Failed to log income: " + expError.message);

      const newBalance = d.balance_due - totalRielEq;
      let newPaymentMethodStr = d.payment_method;
      
      newPaymentMethodStr = d.payment_method && d.payment_method !== '-' && d.payment_method !== 'Unpaid / Debt'
          ? `${d.payment_method}, ${methodStrings.join(', ')}`
          : methodStrings.join(', ');

      const isDone = newBalance <= 0;

      setDeliveries(prev => prev.map(inv => inv.invoice_id === d.invoice_id ? {
        ...inv,
        balance_due: newBalance,
        payment_method: newPaymentMethodStr,
        is_done: isDone,
        delivery_status: isDone ? 'Delivered' : d.delivery_status
      } : inv));
      
      setInlinePayments(prev => { const n = {...prev}; delete n[d.invoice_id]; return n; });

      await supabase.from('invoice_summaries')
        .update({
            balance_due: newBalance,
            payment_method: newPaymentMethodStr,
            is_done: isDone,
            delivery_status: isDone ? 'Delivered' : d.delivery_status
        })
        .eq('invoice_id', d.invoice_id);

    } catch (error: any) {
      alert(`Error processing payment: ${error.message}`);
      fetchDeliveries(); 
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
    let totalUsdFace = 0;
    let totalRielFace = 0;
    let methodStrings: string[] = [];

    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      
      if (r.method.includes('$')) {
        totalRielEq += (amt * EXCHANGE_RATE);
        totalUsdFace += amt;
      } else {
        totalRielEq += amt;
        totalRielFace += amt;
      }
      methodStrings.push(`${r.method}: ${amt}`);
    }

    if (totalRielEq <= 0) return;
    if (totalRielEq > debtor.totalOwed + 0.1) return alert('Cannot pay more than the total remaining debt.');

    setIsProcessing(true);

    try {
      const validSpender = ['Pich', 'Jing'].includes(debtor.owner) ? debtor.owner : 'Both';

      const { error: expError } = await supabase.from('expenses').insert([{
        expense_date: new Date().toISOString().split('T')[0],
        spender: validSpender,
        payment_method: methodStrings.join(', '),
        remarks: `Payment from ${debtor.name} (${debtor.invoices.length} Invoices)`,
        amount: totalUsdFace > 0 ? -Math.abs(totalUsdFace) : 0,
        amount_riel: totalRielFace > 0 ? -Math.abs(totalRielFace) : 0,
        description: 'BUSINESS'
      }]);

      if (expError) throw new Error("Failed to log income: " + expError.message);

      let remainingToDistribute = totalRielEq;
      // 🚀 FIX: Explicitly typed to any[] to satisfy Vercel's strict compiler
      const updatedInvoices: any[] = [];
      
      for (const inv of debtor.invoices) {
        if (remainingToDistribute <= 0) break;
        
        let invBalance = Number(inv.balance_due) || 0;
        let amountToApply = Math.min(invBalance, remainingToDistribute);
        let newBalance = invBalance - amountToApply;

        let newPaymentMethodStr = inv.payment_method;
        const appliedStr = methodStrings.length === 1 ? `${rows[0].method}: ${amountToApply}` : `Split Payment applied: ${amountToApply}`;

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

        remainingToDistribute -= amountToApply;
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

  const sortedDeliveries = [...deliveries].sort((a: any, b: any) => {
    const aDone = isFullyComplete(a);
    const bDone = isFullyComplete(b);
    if (!aDone && bDone) return -1;
    if (aDone && !bDone) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const debtorsMap = deliveries.reduce((acc: any, curr: any) => {
    const balance = Number(curr.balance_due) || 0;
    if (balance > 0) {
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
      return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>Loading records...</div>;
    }
    
    if (activeTab === 'delivery') {
      return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1050px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Date & INV</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Customer</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '25%' }}>Items Ordered</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Total (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '160px' }}>Payment Method</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '180px' }}>Pay Amount (៛)</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '120px' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeliveries.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '15px' }}>No active wholesale deliveries.</td></tr>
                ) : (
                  sortedDeliveries.map((d: any) => {
                    const isDone = isFullyComplete(d);
                    const totalSale = Number(d.total_sales) || 0;
                    const balanceDue = Number(d.balance_due) || 0;
                    const paymentState = getInlinePaymentState(d.invoice_id, balanceDue);
                    
                    return (
                      <tr key={d.invoice_id} style={{ borderBottom: '1px solid #f1f5f9', background: isDone ? '#f8fafc' : '#ffffff', opacity: isDone ? 0.6 : 1, transition: 'all 0.3s ease' }}>
                        <td style={{ padding: '16px 20px', color: '#475569', fontSize: '14px', verticalAlign: 'top', fontWeight: 'normal' }}>
                          <div style={{ color: '#3b82f6', marginBottom: '4px' }}>{d.invoice_id}</div>
                          <div style={{ fontSize: '12px' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'top', fontWeight: 'normal' }}>
                          <div style={{ color: '#334155', fontSize: '15px', marginBottom: '4px' }}>{d.customer_name}</div>
                          <div style={{ color: '#64748b', fontSize: '12px' }}>📍 {d.customer_location || 'No location'}</div>
                        </td>
                        <td style={{ padding: '16px 20px', color: '#475569', lineHeight: '1.6', fontSize: '13px', verticalAlign: 'top', fontWeight: 'normal' }}>{d.rice_types}</td>
                        
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#000000', fontSize: '15px', verticalAlign: 'top', fontWeight: 'normal' }}>{formatRiel(totalSale)}</td>
                        
                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'delivery_status', d.delivery_status === 'Pending' ? 'Delivered' : 'Pending')}
                            style={{
                              padding: '6px 12px', borderRadius: '20px', border: 'none', fontSize: '13px', fontWeight: 'normal', cursor: 'pointer',
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
                          {balanceDue > 0 ? (
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                               {paymentState.map((row) => (
                                 <select 
                                   key={row.id}
                                   value={row.method}
                                   onChange={(e) => updateInlineRow(d.invoice_id, row.id, 'method', e.target.value, balanceDue)}
                                   style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', backgroundColor: '#fff', color: '#475569', cursor: 'pointer', width: '100%', fontWeight: 'normal', height: '40px', boxSizing: 'border-box' }}
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
                            <div style={{ color: '#475569', fontSize: '13px', fontWeight: 'normal' }}>{d.payment_method}</div>
                          )}
                        </td>

                        {/* PAY AMOUNT COLUMN */}
                        <td style={{ padding: '16px 20px', textAlign: 'right', verticalAlign: 'top' }}>
                          {balanceDue > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map((row) => (
                                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}>
                                  <CurrencyInput
                                    placeholder={formatRiel(balanceDue)}
                                    value={row.amount}
                                    onChange={(v: any) => updateInlineRow(d.invoice_id, row.id, 'amount', v, balanceDue)}
                                    onEnter={() => handleInlineProcess(d, paymentState)}
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', textAlign: 'right', outline: 'none', width: '100%', backgroundColor: '#fff', color: '#000000', fontWeight: 'normal', height: '100%', boxSizing: 'border-box' }}
                                  />
                                  {paymentState.length > 1 && (
                                    <button onClick={() => removeInlineSplit(d.invoice_id, row.id, balanceDue)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: '#10b981', fontSize: '14px', fontWeight: 'normal' }}>Paid & Done ✅</div>
                          )}
                        </td>

                        <td style={{ padding: '16px 20px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button 
                            onClick={() => {
                              if (balanceDue > 0) {
                                handleInlineProcess(d, paymentState);
                              } else {
                                updateInvoiceField(d.invoice_id, 'is_done', !d.is_done);
                              }
                            }}
                            style={{
                              padding: '8px 12px', width: '100%', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
                              background: isDone ? '#e2e8f0' : '#10b981',
                              color: isDone ? '#475569' : '#ffffff',
                              transition: 'all 0.2s', fontWeight: 'normal', height: '40px'
                            }}
                          >
                            {isDone ? 'Undo' : '✔ Done'}
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
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '950px' }}>
            <thead style={{ background: '#fff1f2', borderBottom: '1px solid #ffe4e6' }}>
              <tr>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Date</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Owner</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Customer Name</th>
                <th style={{ padding: '16px 20px', textAlign: 'right', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px' }}>Remaining Debt (៛)</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '160px' }}>Method</th>
                <th style={{ padding: '16px 20px', textAlign: 'right', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '180px' }}>Pay Amount (៛)</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', color: '#be123c', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', width: '120px' }}>Complete</th>
              </tr>
            </thead>
            {activeOwners.length === 0 ? (
              <tbody><tr><td colSpan={7} style={{ textAlign: 'center', padding: '60px', color: '#10b981', fontSize: '15px', fontWeight: 'normal' }}>🎉 All customers are fully paid up!</td></tr></tbody>
            ) : (
              activeOwners.map(ownerName => {
                const list = groupedDebtors[ownerName];
                const ownerTotalOwed = list.reduce((sum: number, d: any) => sum + d.totalOwed, 0);
                return (
                  <tbody key={ownerName}>
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={3} style={{ padding: '14px 20px', color: '#334155', fontSize: '14px', borderBottom: '1px solid #e2e8f0', fontWeight: 'normal' }}>
                        👤 Owner: {ownerName}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#000000', fontSize: '15px', borderBottom: '1px solid #e2e8f0', fontWeight: 'normal' }}>
                        {formatRiel(ownerTotalOwed)}
                      </td>
                      <td colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}></td>
                    </tr>
                    {list.map((debtor: any) => {
                      const uniqueKey = `${debtor.owner}_${debtor.name}`;
                      const paymentState = getCreditPaymentState(uniqueKey, debtor.totalOwed);
                      
                      return (
                        <tr key={uniqueKey} style={{ borderBottom: '1px solid #f1f5f9', background: '#ffffff', transition: 'background 0.2s ease' }}>
                          <td style={{ padding: '20px', color: '#64748b', fontSize: '14px', verticalAlign: 'top', fontWeight: 'normal' }}>
                            {new Date(debtor.oldestDate).toLocaleDateString('en-GB')}
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Oldest Invoice</div>
                          </td>
                          <td style={{ padding: '20px', color: '#475569', fontSize: '15px', verticalAlign: 'top', fontWeight: 'normal' }}>
                            {debtor.owner}
                          </td>
                          <td style={{ padding: '20px', color: '#334155', fontSize: '15px', verticalAlign: 'top', fontWeight: 'normal' }}>
                            {debtor.name}
                            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                              {debtor.invoices.length} Unpaid Invoice(s)
                            </div>
                          </td>
                          <td style={{ padding: '20px', textAlign: 'right', color: '#000000', fontSize: '16px', verticalAlign: 'top', fontWeight: 'normal' }}>
                            {formatRiel(debtor.totalOwed)}
                          </td>
                          
                          <td style={{ padding: '20px', textAlign: 'center', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {paymentState.map(row => (
                                <select 
                                  key={row.id}
                                  value={row.method}
                                  onChange={(e) => updateCreditRow(uniqueKey, row.id, 'method', e.target.value, debtor.totalOwed)}
                                  style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', backgroundColor: '#fff', color: '#475569', cursor: 'pointer', width: '100%', fontWeight: 'normal', height: '40px', boxSizing: 'border-box' }}
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
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px', textAlign: 'right', outline: 'none', width: '100%', backgroundColor: '#fff', color: '#000000', fontWeight: 'normal', height: '100%', boxSizing: 'border-box' }}
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
                              style={{
                                padding: '8px 12px', width: '100%', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
                                background: '#10b981', color: '#ffffff', transition: 'all 0.2s', fontWeight: 'normal', height: '40px'
                              }}
                            >
                              ✔ Done
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
          <h1 className="page-title">🚚 Delivery & Credit Hub</h1>
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

        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          min-height: 100dvh;
        }

        .header-container { 
          margin-bottom: 24px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }

        .page-title { 
          font-size: 24px; 
          color: #334155; 
          margin: 0; 
          font-weight: 600;
          letter-spacing: -0.5px;
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
          font-weight: 500; 
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
          font-weight: 600 !important;
          box-shadow: 0 4px 10px rgba(181, 138, 61, 0.2);
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .mobile-input-field:focus, .mobile-select-menu:focus {
          border-color: #94a3b8 !important;
          box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.2);
        }

        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 24px 16px !important; 
          }
          .header-container {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
            margin-bottom: 20px !important;
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