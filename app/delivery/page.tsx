'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'delivery' | 'credit'>('delivery')
  
  // Unified Split Payment Modal State
  const [paymentModal, setPaymentModal] = useState<{ 
    isOpen: boolean, 
    mode: 'single' | 'batch', 
    record: any, 
    customerName: string, 
    totalDue: number, 
    invoices: any[] 
  }>({ 
    isOpen: false, mode: 'single', record: null, customerName: '', totalDue: 0, invoices: [] 
  })

  // Dynamic Payment Rows for the Modal
  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | ''}[]>([
    { id: Date.now(), method: 'Cash ៛', amount: '' }
  ]);

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

  // --- OPEN PAYMENT MODAL ---
  const handleOpenPayment = (mode: 'single' | 'batch', data: any) => {
    if (mode === 'single') {
      const balanceDue = Number(data.balance_due) || 0;
      setPaymentModal({ isOpen: true, mode: 'single', record: data, customerName: data.customer_name, totalDue: balanceDue, invoices: [data] });
    } else {
      setPaymentModal({ isOpen: true, mode: 'batch', record: null, customerName: data.name, totalDue: data.totalOwed, invoices: data.invoices });
    }
    setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
  }

  // --- PROCESS SPLIT PAYMENT ---
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
      alert('Payment cannot exceed the total remaining balance.');
      setIsProcessing(false);
      return;
    }

    const invoiceIds = paymentModal.invoices.map(inv => inv.invoice_id);
    const paymentMethodString = activePayments.map(r => `${r.method}: ${r.amount}`).join(', ');

    try {
      // 1. Log Financial Transactions (One row per payment method used)
      for (const row of activePayments) {
        let amountRiel = Number(row.amount);
        if (row.method.includes('$')) amountRiel = amountRiel * EXCHANGE_RATE;

        await supabase.from('expenses').insert([{
          expense_date: new Date().toISOString().split('T')[0],
          spender: 'Business',
          payment_method: row.method, // Cash ៛, QR $, etc.
          remarks: `Payment from ${paymentModal.customerName} (Inv: ${invoiceIds.length > 1 ? 'Multiple' : invoiceIds[0]})`,
          amount: 0,
          amount_riel: amountRiel,
          description: 'BUSINESS'
        }]);
      }

      // 2. Distribute payment across invoices (simplest logic: mark them paid if exact, or distribute if partial)
      // For simplicity in a batch scenario, we reduce the balance sequentially
      let remainingPaymentToDistribute = totalReceivedInRiel;
      
      for (const inv of paymentModal.invoices) {
        if (remainingPaymentToDistribute <= 0) break;
        
        let invBalance = Number(inv.balance_due) || 0;
        let amountToApply = Math.min(invBalance, remainingPaymentToDistribute);
        let newBalance = invBalance - amountToApply;

        let finalStatus = newBalance <= 0 ? 'Delivered' : 'Pending';

        await supabase.from('invoice_summaries')
          .update({ 
            balance_due: newBalance, 
            payment_method: paymentMethodString,
            delivery_status: paymentModal.mode === 'single' ? inv.delivery_status : finalStatus 
          })
          .eq('invoice_id', inv.invoice_id);

        remainingPaymentToDistribute -= amountToApply;
      }

      setPaymentModal({ isOpen: false, mode: 'single', record: null, customerName: '', totalDue: 0, invoices: [] });
      fetchDeliveries();

    } catch (error: any) {
      alert(`Error processing payment: ${error.message}`);
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

  // Group Debtors by Owner -> Customer
  const debtorsMap = deliveries.reduce((acc: any, curr: any) => {
    const balance = Number(curr.balance_due) || 0;
    if (balance > 0) {
      let owner = (curr.owner || '').trim();
      if (!owner) owner = 'Unassigned';
      owner = owner.charAt(0).toUpperCase() + owner.slice(1).toLowerCase();

      const key = `${owner}___${curr.customer_name}`; 
      
      if (!acc[key]) {
        acc[key] = { name: curr.customer_name, owner: owner, totalOwed: 0, invoices: [] };
      }
      acc[key].totalOwed += balance;
      acc[key].invoices.push(curr);
    }
    return acc;
  }, {});

  const debtorsList = Object.values(debtorsMap).sort((a: any, b: any) => b.totalOwed - a.totalOwed);

  const groupedDebtors = debtorsList.reduce((acc: any, curr: any) => {
    if (!acc[curr.owner]) acc[curr.owner] = [];
    acc[curr.owner].push(curr);
    return acc;
  }, {});

  const ownerOrder = ['Pich', 'Jing', 'Both', 'Mom', 'Unassigned'];
  const activeOwners = Object.keys(groupedDebtors).sort((a, b) => {
    let idxA = ownerOrder.indexOf(a);
    let idxB = ownerOrder.indexOf(b);
    if (idxA === -1) idxA = 99;
    if (idxB === -1) idxB = 99;
    return idxA - idxB;
  });


  // --- LIVE MATH FOR MODAL ---
  const liveTotalReceivedInRiel = paymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);

  const liveRemaining = paymentModal.totalDue - liveTotalReceivedInRiel;

  return (
    <div className="main-wrapper" style={{ padding: '24px 24px 24px 75px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '500', color: '#334155', margin: 0 }}>🚚 Delivery & Credit Hub</h1>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <button 
          onClick={() => setActiveTab('delivery')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', background: activeTab === 'delivery' ? '#3b82f6' : 'transparent', color: activeTab === 'delivery' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
        >
          📦 Delivery Queue
        </button>
        <button 
          onClick={() => setActiveTab('credit')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', background: activeTab === 'credit' ? '#ef4444' : 'transparent', color: activeTab === 'credit' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
        >
          💰 Accounts Receivable ({debtorsList.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading records...</div>
      ) : activeTab === 'delivery' ? (
        
        /* DELIVERY TAB VIEW */
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1000px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', width: '130px', fontWeight: '500' }}>Delivery Status</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: '500' }}>Date & INV</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569', fontWeight: '500' }}>Customer & Location</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569', width: '25%', fontWeight: '500' }}>Items Ordered</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#475569', fontWeight: '500' }}>Total Sale (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', fontWeight: '500' }}>Payment</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', width: '120px', fontWeight: '500' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeliveries.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No active wholesale deliveries.</td></tr>
                ) : (
                  sortedDeliveries.map((d: any) => {
                    const isDone = isFullyComplete(d);
                    const totalSale = Number(d.total_sales) || 0;
                    const balanceDue = Number(d.balance_due) || 0;
                    
                    return (
                      <tr key={d.invoice_id} style={{ borderBottom: '1px solid #f1f5f9', background: isDone ? '#f8fafc' : '#ffffff', opacity: isDone ? 0.7 : 1, transition: 'all 0.3s ease' }}>
                        
                        {/* 1. DELIVERY STATUS BUTTON */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'delivery_status', d.delivery_status === 'Pending' ? 'Delivered' : 'Pending')}
                            style={{
                              padding: '8px 0', width: '100%', borderRadius: '6px', border: '1px solid', fontSize: '13px', cursor: 'pointer',
                              background: d.delivery_status === 'Pending' ? '#fff5f5' : '#f0fdf4',
                              color: d.delivery_status === 'Pending' ? '#dc2626' : '#166534',
                              borderColor: d.delivery_status === 'Pending' ? '#fecaca' : '#bbf7d0',
                              transition: 'background 0.2s'
                            }}
                          >
                            {d.delivery_status === 'Pending' ? '🔴 Pending' : '🟢 Delivered'}
                          </button>
                        </td>

                        {/* 2. DATE & INV */}
                        <td style={{ padding: '16px', color: '#64748b', fontSize: '13px' }}>
                          <div style={{ color: '#334155', marginBottom: '4px' }}>{d.invoice_id}</div>
                          {new Date(d.created_at).toLocaleDateString('en-GB')}
                        </td>

                        {/* 3. CUSTOMER */}
                        <td style={{ padding: '16px' }}>
                          <div style={{ color: '#334155', fontSize: '15px', marginBottom: '4px' }}>{d.customer_name}</div>
                          <div style={{ color: '#64748b', fontSize: '12px' }}>📍 {d.customer_location || 'No location'}</div>
                        </td>

                        {/* 4. ITEMS */}
                        <td style={{ padding: '16px', color: '#475569', lineHeight: '1.6' }}>{d.rice_types}</td>
                        
                        {/* 5. TOTAL SALE */}
                        <td style={{ padding: '16px', textAlign: 'right', color: '#b58a3d', fontSize: '15px' }}>
                          {formatRiel(totalSale)}
                        </td>

                        {/* 6. PAYMENT / RECEIVE */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          {balanceDue > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                              <button 
                                onClick={() => handleOpenPayment('single', d)}
                                style={{ padding: '8px 12px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', width: '100%' }}
                              >
                                + Receive Payment
                              </button>
                              <div style={{ fontSize: '12px', color: '#ef4444' }}>Owes: {formatRiel(balanceDue)}</div>
                            </div>
                          ) : (
                            <div style={{ color: '#10b981', fontSize: '13px' }}>Paid in Full ✅</div>
                          )}
                        </td>

                        {/* 7. MANUAL DONE BUTTON */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'is_done', !d.is_done)}
                            style={{
                              padding: '8px 0', width: '100%', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
                              background: isDone ? '#e2e8f0' : '#10b981',
                              color: isDone ? '#475569' : '#ffffff',
                              transition: 'all 0.2s'
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

      ) : (

        /* ACCOUNTS RECEIVABLE (OWE) TAB VIEW */
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '700px' }}>
              <thead style={{ background: '#fff1f2', borderBottom: '1px solid #fecaca' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b', fontWeight: '500' }}>Customer Name</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#991b1b', fontWeight: '500' }}>Unpaid Invoices</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b', fontWeight: '500' }}>Total Debt (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#991b1b', fontWeight: '500' }}>Actions</th>
                </tr>
              </thead>
              
              {activeOwners.length === 0 ? (
                <tbody><tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#10b981', fontSize: '16px' }}>🎉 All customers are fully paid up!</td></tr></tbody>
              ) : (
                activeOwners.map(ownerName => {
                  const list = groupedDebtors[ownerName];
                  const ownerTotalOwed = list.reduce((sum: number, d: any) => sum + d.totalOwed, 0);

                  return (
                    <tbody key={ownerName}>
                      {/* Owner Sub-header Row */}
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={2} style={{ padding: '12px 16px', color: '#334155', fontSize: '14px', borderBottom: '1px solid #e2e8f0' }}>
                          👤 Owner: <b>{ownerName}</b>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ef4444', fontSize: '15px', borderBottom: '1px solid #e2e8f0' }}>
                          {formatRiel(ownerTotalOwed)}
                        </td>
                        <td style={{ borderBottom: '1px solid #e2e8f0' }}></td>
                      </tr>

                      {/* Customer Rows mapped underneath their Owner */}
                      {list.map((debtor: any) => (
                        <tr key={`${debtor.owner}_${debtor.name}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px', color: '#334155', fontSize: '16px', paddingLeft: '32px' }}>↳ {debtor.name}</td>
                          <td style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                            <span style={{ color: '#334155' }}>{debtor.invoices.length}</span> Invoices
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                              ({debtor.invoices.map((i: any) => String(i.invoice_id).split('-')[1] || i.invoice_id).join(', ')})
                            </div>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: '#ef4444', fontSize: '16px' }}>
                            {formatRiel(debtor.totalOwed)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center' }}>
                            <button 
                              onClick={() => handleOpenPayment('batch', debtor)}
                              style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}
                            >
                              💸 Settle Account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })
              )}
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================================================
          UNIFIED SPLIT PAYMENT MODAL
          ============================================================================================== */}
      {paymentModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setPaymentModal({ ...paymentModal, isOpen: false })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '450px', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#334155', fontSize: '18px', fontWeight: '500' }}>💸 Receive Payment</h3>
              <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569' }}>
              Customer: <b>{paymentModal.customerName}</b>
            </p>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount Due</div>
              <div style={{ fontSize: '28px', color: '#dc2626' }}>{formatRiel(paymentModal.totalDue)}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{formatUSD(paymentModal.totalDue / EXCHANGE_RATE)}</div>
            </div>

            {/* Split Payment Rows */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#475569' }}>Payment Method(s)</label>
                <button onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '6px 10px', cursor: 'pointer' }}>+ Split</button>
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
                  </select>
                  
                  <div style={{ flex: 1 }}>
                    <CurrencyInput 
                      placeholder="Amount..." 
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
                  <span style={{ color: '#64748b' }}>Total Received:</span>
                  <span style={{ color: '#334155' }}>{formatRiel(liveTotalReceivedInRiel)}</span>
                </div>
                {liveRemaining < 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ef4444' }}>Change to Return:</span>
                    <span style={{ color: '#dc2626' }}>{formatRiel(Math.abs(liveRemaining))}</span>
                  </div>
                ) : liveRemaining > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#d97706' }}>Still Owes:</span>
                    <span style={{ color: '#b45309' }}>{formatRiel(liveRemaining)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#166534' }}>Balance:</span>
                    <span style={{ color: '#15803d' }}>Perfectly Paid ✅</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontSize: '15px' }}>Cancel</button>
              <button onClick={handleProcessPayment} disabled={isProcessing} style={{ padding: '12px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '15px' }}>
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL CSS FOR INPUTS */}
      <style jsx global>{`
        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
    </div>
  )
}