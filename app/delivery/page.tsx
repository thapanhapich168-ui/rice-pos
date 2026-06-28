'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

// Helper component to handle inline input of "Amount Received"
function AmountReceivedInput({ invoiceTotal, balanceDue, onSave }: { invoiceTotal: number, balanceDue: number, onSave: (newBalance: number) => void }) {
  const received = invoiceTotal - balanceDue;
  const [temp, setTemp] = useState(String(received));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setTemp(String(invoiceTotal - balanceDue));
  }, [invoiceTotal, balanceDue, focused]);

  return (
    <input
      value={focused ? temp : formatRiel(invoiceTotal - balanceDue)}
      onFocus={() => { setFocused(true); setTemp(String(invoiceTotal - balanceDue)); }}
      onBlur={() => {
        setFocused(false);
        let val = parseFloat(temp.replace(/,/g, ''));
        if (isNaN(val) || val < 0) val = 0;
        if (val > invoiceTotal) val = invoiceTotal;
        onSave(invoiceTotal - val);
      }}
      onChange={(e) => setTemp(e.target.value)}
      className="no-spinners"
      style={{
        width: '130px', 
        padding: '10px', 
        borderRadius: '6px', 
        border: '2px solid #cbd5e1', 
        outline: 'none', 
        color: '#0f172a', 
        backgroundColor: '#ffffff', 
        fontWeight: 'bold', 
        textAlign: 'center',
        fontSize: '14px'
      }}
      title="Enter amount collected from customer"
    />
  );
}

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'delivery' | 'credit'>('delivery')
  
  // Modal for settling debt
  const [clearDebtModal, setClearDebtModal] = useState<{ isOpen: boolean, customerName: string, totalOwed: number, invoices: any[], method: string }>({ 
    isOpen: false, customerName: '', totalOwed: 0, invoices: [], method: 'Cash' 
  })

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

    if (error) {
      console.error(error);
    } else if (data) {
      setDeliveries(data);
    }
    setLoading(false);
  }

  // --- QUICK UPDATES ---
  async function updateInvoiceField(invoiceId: string, field: string, value: any) {
    // Optimistic UI Update for maximum speed
    setDeliveries(prev => prev.map((d: any) => d.invoice_id === invoiceId ? { ...d, [field]: value } : d));
    
    const { error } = await supabase.from('invoice_summaries').update({ [field]: value }).eq('invoice_id', invoiceId);
    if (error) {
      alert(`Error updating ${field}: ${error.message}`);
      fetchDeliveries(); // Revert on failure
    }
  }

  // --- CREDIT UPDATES ---
  async function handleClearCustomerDebt() {
    if (!clearDebtModal.customerName || clearDebtModal.invoices.length === 0) return;
    
    const invoiceIds = clearDebtModal.invoices.map((inv: any) => inv.invoice_id);
    
    const { error } = await supabase
      .from('invoice_summaries')
      .update({ balance_due: 0, payment_method: clearDebtModal.method }) 
      .in('invoice_id', invoiceIds);

    if (!error) {
      setClearDebtModal({ isOpen: false, customerName: '', totalOwed: 0, invoices: [], method: 'Cash' });
      fetchDeliveries();
    } else {
      alert(`Error clearing debt: ${error.message}`);
    }
  }

  // --- DATA PROCESSING & SORTING ---
  
  // MANUAL DONE BUTTON OVERRIDE: 
  const isFullyComplete = (d: any) => d.is_done === true;

  const sortedDeliveries = [...deliveries].sort((a: any, b: any) => {
    const aDone = isFullyComplete(a);
    const bDone = isFullyComplete(b);
    
    if (!aDone && bDone) return -1;
    if (aDone && !bDone) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Group Debtors for the "Owe" Tab
  const debtorsMap = deliveries.reduce((acc: any, curr: any) => {
    const balance = Number(curr.balance_due) || 0;
    if (balance > 0) {
      if (!acc[curr.customer_name]) {
        acc[curr.customer_name] = { totalOwed: 0, invoices: [] };
      }
      acc[curr.customer_name].totalOwed += balance;
      acc[curr.customer_name].invoices.push(curr);
    }
    return acc;
  }, {} as Record<string, { totalOwed: number, invoices: any[] }>);

  const debtorsList = Object.keys(debtorsMap).map((name: string) => ({
    name,
    totalOwed: debtorsMap[name].totalOwed,
    invoices: debtorsMap[name].invoices
  })).sort((a: any, b: any) => b.totalOwed - a.totalOwed);

  return (
    <div className="main-wrapper" style={{ padding: '24px 24px 24px 75px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#4a3b1b', margin: 0 }}>🚚 Delivery & Credit Hub</h1>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <button 
          onClick={() => setActiveTab('delivery')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'delivery' ? '#3b82f6' : 'transparent', color: activeTab === 'delivery' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
        >
          📦 Delivery Queue
        </button>
        <button 
          onClick={() => setActiveTab('credit')} 
          style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'credit' ? '#ef4444' : 'transparent', color: activeTab === 'credit' ? '#fff' : '#64748b', transition: 'all 0.2s', fontSize: '15px' }}
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
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', width: '130px' }}>Delivery Status</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569' }}>Date & INV</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569' }}>Customer & Location</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#475569', width: '25%' }}>Items Ordered</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#475569' }}>Total Sale (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569' }}>Payment Method</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569' }}>Amount Received (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#475569', width: '120px' }}>Complete</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeliveries.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No active wholesale deliveries.</td></tr>
                ) : (
                  sortedDeliveries.map((d: any) => {
                    const isDone = isFullyComplete(d);
                    const totalSale = Number(d.total_sales) || 0;
                    const balanceDue = Number(d.balance_due) || 0;
                    
                    return (
                      <tr key={d.invoice_id} style={{ borderBottom: '1px solid #f1f5f9', background: isDone ? '#f8fafc' : '#ffffff', opacity: isDone ? 0.6 : 1, transition: 'all 0.3s ease' }}>
                        
                        {/* 1. DELIVERY STATUS BUTTON */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'delivery_status', d.delivery_status === 'Pending' ? 'Delivered' : 'Pending')}
                            style={{
                              padding: '10px 0', width: '100%', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px',
                              background: d.delivery_status === 'Pending' ? '#fee2e2' : '#dcfce7',
                              color: d.delivery_status === 'Pending' ? '#ef4444' : '#15803d',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background 0.2s'
                            }}
                          >
                            {d.delivery_status === 'Pending' ? '🔴 Pending' : '🟢 Delivered'}
                          </button>
                        </td>

                        {/* 2. DATE & INV */}
                        <td style={{ padding: '16px', color: '#64748b', fontSize: '13px' }}>
                          <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>{d.invoice_id}</div>
                          {new Date(d.created_at).toLocaleDateString('en-GB')}
                        </td>

                        {/* 3. CUSTOMER */}
                        <td style={{ padding: '16px' }}>
                          <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '15px', marginBottom: '4px' }}>{d.customer_name}</div>
                          <div style={{ color: '#64748b', fontSize: '12px' }}>📍 {d.customer_location || 'No location'}</div>
                        </td>

                        {/* 4. ITEMS */}
                        <td style={{ padding: '16px', color: '#334155', lineHeight: '1.6' }}>{d.rice_types}</td>
                        
                        {/* 5. TOTAL SALE */}
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: '#b58a3d', fontSize: '15px' }}>
                          {formatRiel(totalSale)}
                        </td>

                        {/* 6. PAYMENT METHOD */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <select 
                            value={d.payment_method || 'Cash'} 
                            onChange={(e) => updateInvoiceField(d.invoice_id, 'payment_method', e.target.value)} 
                            style={{ padding: '10px', borderRadius: '6px', border: '2px solid #e2e8f0', outline: 'none', background: '#ffffff', color: '#0f172a', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                          >
                            <option value="Cash">💵 Cash</option>
                            <option value="QR Payment">📱 QR Payment</option>
                          </select>
                        </td>

                        {/* 7. AMOUNT RECEIVED */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <AmountReceivedInput 
                            invoiceTotal={totalSale} 
                            balanceDue={balanceDue} 
                            onSave={(newBalance: number) => updateInvoiceField(d.invoice_id, 'balance_due', newBalance)} 
                          />
                          {balanceDue > 0 && (
                            <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', fontWeight: 'bold' }}>
                              Owes: {formatRiel(balanceDue)}
                            </div>
                          )}
                        </td>

                        {/* 8. MANUAL DONE BUTTON */}
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <button 
                            onClick={() => updateInvoiceField(d.invoice_id, 'is_done', !d.is_done)}
                            style={{
                              padding: '10px 0', width: '100%', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px',
                              background: isDone ? '#e2e8f0' : '#10b981',
                              color: isDone ? '#64748b' : '#ffffff',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s'
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
              <thead style={{ background: '#fff1f2', borderBottom: '2px solid #fecaca' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#991b1b' }}>Customer Name</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#991b1b' }}>Unpaid Invoices</th>
                  <th style={{ padding: '16px', textAlign: 'right', color: '#991b1b' }}>Total Debt (៛)</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#991b1b' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {debtorsList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#10b981', fontWeight: 'bold', fontSize: '16px' }}>🎉 All customers are fully paid up!</td></tr>
                ) : (
                  debtorsList.map((debtor: any) => (
                    <tr key={debtor.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px', fontWeight: 'bold', color: '#0f172a', fontSize: '16px' }}>{debtor.name}</td>
                      <td style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                        <span style={{ fontWeight: 'bold', color: '#334155' }}>{debtor.invoices.length}</span> Invoices
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          ({debtor.invoices.map((i: any) => String(i.invoice_id).split('-')[1] || i.invoice_id).join(', ')})
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444', fontSize: '18px' }}>
                        {formatRiel(debtor.totalOwed)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center' }}>
                        <button 
                          onClick={() => setClearDebtModal({ isOpen: true, customerName: debtor.name, totalOwed: debtor.totalOwed, invoices: debtor.invoices, method: 'Cash' })}
                          style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
                        >
                          💸 Settle Account
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CLEAR ALL CUSTOMER DEBT */}
      {clearDebtModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setClearDebtModal({ isOpen: false, customerName: '', totalOwed: 0, invoices: [], method: 'Cash' })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#10b981', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>💸 Settle Account</h3>
            
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
              You are clearing all debt for <b>{clearDebtModal.customerName}</b>.
            </p>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Total Amount Clearing</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{formatRiel(clearDebtModal.totalOwed)}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Across {clearDebtModal.invoices.length} invoice(s)</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Payment Method</label>
              <select 
                value={clearDebtModal.method} 
                onChange={(e) => setClearDebtModal({...clearDebtModal, method: e.target.value})}
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '2px solid #cbd5e1', outline: 'none', background: '#ffffff', color: '#0f172a', fontWeight: 'bold', fontSize: '14px' }}
              >
                <option value="Cash">💵 Paid in Cash</option>
                <option value="QR Payment">📱 Paid via QR</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setClearDebtModal({ isOpen: false, customerName: '', totalOwed: 0, invoices: [], method: 'Cash' })} style={{ padding: '12px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}>Cancel</button>
              <button onClick={handleClearCustomerDebt} style={{ padding: '12px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL CSS FOR INPUTS */}
      <style jsx global>{`
        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  )
}