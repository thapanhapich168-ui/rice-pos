'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
const EXCHANGE_RATE = 4000;

// ==========================================
// ROBUST LIVE COMMA FORMATTER (Stateless Display)
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, onEnter }: any) {
  const [inputValue, setInputValue] = useState('');

  // Sync state when parent value changes externally
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
        if (e.key === 'Enter' && onEnter) {
          onEnter();
        }
      }}
      onBlur={() => {
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

export default function ExpenseDashboard() {
  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<'personal' | 'business' | 'staff'>('personal')

  // --- Expense Form States ---
  const [expenseDate, setExpenseDate] = useState('')
  const [spender, setSpender] = useState<'Pich' | 'Jing' | 'Both'>('Pich')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)

  // Top Notification Popup State
  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success'|'error'}>({ show: false, message: '', type: 'success' })

  // Split Payment Tracking
  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | ''}[]>([
    { id: Date.now(), method: 'Cash ៛', amount: '' }
  ]);

  // --- Staff Management States ---
  const [staffList, setStaffList] = useState<any[]>([])
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffSalary, setNewStaffSalary] = useState<number | ''>('')
  
  // Debt Addition States
  const [debtAdditions, setDebtAdditions] = useState<Record<number, number | ''>>({})
  const [debtMethods, setDebtMethods] = useState<Record<number, string>>({})
  
  // Debt History Modal State
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, staff: any, history: any[] }>({
    isOpen: false, staff: null, history: []
  })

  // Settle Debt Modal State
  const [settleModal, setSettleModal] = useState<{ isOpen: boolean, staff: any, amount: number | '', method: string }>({
    isOpen: false, staff: null, amount: '', method: 'Cash ៛'
  })

  // Inline Editing State
  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  // Initialization
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setExpenseDate(today)
    fetchStaff()
  }, [])

  // Notification Helper
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  }

  // --- API: Fetch Staff ---
  async function fetchStaff() {
    const { data, error } = await supabase.from('staff').select('*').order('id', { ascending: true })
    if (data) setStaffList(data)
  }

  // --- Action: Submit Expense ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!remarks) return alert('Please add remarks/item detail')
    
    const activePayments = paymentRows.filter(r => (Number(r.amount) || 0) > 0);
    if (activePayments.length === 0) return alert('Please enter at least one payment amount.');

    setLoading(true)

    try {
      // 🚀 FIXED: Combine multiple split payments into ONE single record for the dashboard to parse properly
      let combinedMethod = activePayments[0].method;
      if (activePayments.length > 1) {
        combinedMethod = activePayments.map(r => `${r.method}:${r.amount}`).join(',');
      }

      let totalUsd = 0;
      let totalRiel = 0;

      for (const row of activePayments) {
        let rawAmount = Number(row.amount);
        if (row.method.includes('$')) {
          totalUsd += rawAmount;
        } else {
          totalRiel += rawAmount;
        }
      }

      const { error } = await supabase.from('expenses').insert([{
        expense_date: expenseDate,
        spender: spender,
        payment_method: combinedMethod,
        remarks: remarks,                     
        amount_usd: totalUsd,              
        amount_riel: totalRiel,         
        description: activeTab.toUpperCase(), 
      }]);

      if (error) throw error;

      showNotification('Expense recorded successfully!', 'success');
      setRemarks('')
      setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);

    } catch (err: any) {
      showNotification(`Error saving entry: ${err.message}`, 'error');
    } finally {
      setLoading(false)
    }
  }

  // --- Action: Add New Staff ---
  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!newStaffName) return alert('Staff name is required')

    setLoading(true)
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    const { error } = await supabase.from('staff').insert([
      { 
        name: newStaffName, 
        salary: Number(newStaffSalary) || 0,
        total_debt_riel: 0, 
        total_debt_usd: 0,  
        start_date: firstOfMonth
      }
    ])
    setLoading(false)

    if (error) {
      alert(`Error adding staff: ${error.message}`)
    } else {
      setNewStaffName('')
      setNewStaffSalary('')
      fetchStaff()
    }
  }

  // --- Action: Add Debt to Staff ---
  async function handleAddDebt(staff: any) {
    const rawAmount = Number(debtAdditions[staff.id])
    if (!rawAmount || rawAmount === 0) return

    const method = debtMethods[staff.id] || 'Cash ៛'
    
    let saveRiel = 0, saveUsd = 0;
    let newTotalRiel = Number(staff.total_debt_riel || 0);
    let newTotalUsd = Number(staff.total_debt_usd || 0);

    if (method.includes('$')) {
      saveUsd = rawAmount;
      newTotalUsd += rawAmount;
    } else {
      saveRiel = rawAmount;
      newTotalRiel += rawAmount;
    }

    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd } : s));
    setDebtAdditions(prev => ({ ...prev, [staff.id]: '' }))

    const { error: staffErr } = await supabase.from('staff').update({ total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd }).eq('id', staff.id)
    if (staffErr) {
      alert(`Error updating debt: ${staffErr.message}`)
      fetchStaff() 
      return;
    }

    const { error: histErr } = await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: rawAmount, payment_method: method }])
    if (histErr) alert(`Debt updated, but history log failed: ${histErr.message}`);

    await supabase.from('expenses').insert([{
      expense_date: new Date().toISOString().split('T')[0],
      spender: 'Both', 
      payment_method: method,
      remarks: `Staff Advance: ${staff.name}`,
      amount_usd: saveUsd, 
      amount_riel: saveRiel,
      description: 'STAFF_ADVANCE' 
    }])
    showNotification(`Advance added for ${staff.name}`, 'success');
  }

  // --- Action: Settle/Pay Back Debt ---
  async function handleSettleSubmit() {
    const staff = settleModal.staff;
    const rawAmount = Number(settleModal.amount);
    if (!rawAmount || rawAmount <= 0) return alert('Enter a valid settlement amount.');
    
    let saveRiel = 0, saveUsd = 0;
    let newTotalRiel = Number(staff.total_debt_riel || 0);
    let newTotalUsd = Number(staff.total_debt_usd || 0);

    if (settleModal.method.includes('$')) {
      if (rawAmount > newTotalUsd) return alert("Cannot settle more USD than they owe.");
      saveUsd = -Math.abs(rawAmount);
      newTotalUsd -= rawAmount;
    } else {
      if (rawAmount > newTotalRiel) return alert("Cannot settle more Riel than they owe.");
      saveRiel = -Math.abs(rawAmount);
      newTotalRiel -= rawAmount;
    }

    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd } : s));
    setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' });

    await supabase.from('staff').update({ total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd }).eq('id', staff.id);
    await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: rawAmount, payment_method: `Settled: ${settleModal.method}` }]);

    await supabase.from('expenses').insert([{
      expense_date: new Date().toISOString().split('T')[0],
      spender: 'Both', 
      payment_method: settleModal.method,
      remarks: `Staff Debt Settlement: ${staff.name}`,
      amount_usd: saveUsd, 
      amount_riel: saveRiel,
      description: 'STAFF_SETTLEMENT' 
    }]);
    
    showNotification(`Settlement recorded for ${staff.name}`, 'success');
  }

  // --- Action: View Staff History ---
  async function handleViewHistory(staff: any) {
    const { data, error } = await supabase.from('staff_debt_history').select('*').eq('staff_id', staff.id).order('created_at', { ascending: false })
    if (!error) {
      setHistoryModal({ isOpen: true, staff: staff, history: data || [] })
    }
  }

  // --- Action: Save Inline Edit ---
  async function saveInlineEdit(id: number, field: string) {
    if (!editValue && editValue !== '0' && field !== 'name') {
      setEditingCell(null);
      return;
    }

    let finalValue: any = editValue;
    if (field === 'salary' || field === 'total_debt_riel' || field === 'total_debt_usd') {
      finalValue = Number(editValue.replace(/,/g, '')) || 0;
    }

    const staff = staffList.find(s => s.id === id);

    setStaffList(prev => prev.map(s => s.id === id ? { ...s, [field]: finalValue } : s));
    setEditingCell(null);

    const { error } = await supabase.from('staff').update({ [field]: finalValue }).eq('id', id);
    
    if (!error && (field === 'total_debt_riel' || field === 'total_debt_usd') && staff) {
        const difference = finalValue - (Number(staff[field]) || 0);
        if (difference !== 0) {
            await supabase.from('staff_debt_history').insert([{ 
                staff_id: id, 
                amount: Math.abs(difference), 
                payment_method: difference > 0 
                  ? `Manual Increase ${field.includes('usd') ? '$' : '៛'}` 
                  : `Manual Reduction ${field.includes('usd') ? '$' : '៛'}` 
            }]);
        }
    }

    if (error) {
      alert(`Failed to update ${field}: ${error.message}`);
      fetchStaff();
    }
  }

  // --- Action: Delete Staff ---
  async function handleDeleteStaff(id: number, name: string) {
    if (!confirm(`Are you sure you want to remove ${name} from the payroll?`)) return;
    
    setStaffList(prev => prev.filter(s => s.id !== id));

    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) {
      alert(`Failed to delete: ${error.message}`);
      fetchStaff();
    }
  }

  function calculateDaysWorked(startDateStr: string) {
    if (!startDateStr) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    
    let effectiveStartDate = startDate;
    if (startDate.getMonth() !== currentMonth || startDate.getFullYear() !== currentYear) {
      effectiveStartDate = new Date(currentYear, currentMonth, 1);
      effectiveStartDate.setHours(0, 0, 0, 0);
    }

    const diffTime = today.getTime() - effectiveStartDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    
    return diffDays > 0 ? diffDays : 0;
  }

  const hasPayments = paymentRows.some(r => Number(r.amount) > 0);

  return (
    <div className="main-wrapper">

      {/* 🚀 TOP NOTIFICATION POPUP */}
      {notification.show && (
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: notification.type === 'success' ? '#10b981' : '#ef4444',
          color: '#ffffff', padding: '14px 24px', borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 999999,
          fontWeight: 'bold', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'slideDown 0.3s ease-out'
        }}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.message}
        </div>
      )}

      {/* 🔥 EXTRACTED HEADER: Perfectly aligns left with POS & other pages */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">💸 Daily Expense & Payroll</h1>
        </div>
      </div>

      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        borderRadius: '16px',
        padding: '35px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        borderColor: '#e2e8f0',
        borderWidth: '1px',
        borderStyle: 'solid',
        maxWidth: activeTab === 'staff' ? '1200px' : '550px', 
        transition: 'max-width 0.3s ease',
        boxSizing: 'border-box'
      }} className="content-card">
        
        {/* THREE TAB HEADER */}
        <div className="tabs-container">
          <button type="button" onClick={() => setActiveTab('personal')} className={`tab-toggle-button ${activeTab === 'personal' ? 'active-tab' : ''}`}>
            🏡 Personal
          </button>
          <button type="button" onClick={() => setActiveTab('business')} className={`tab-toggle-button ${activeTab === 'business' ? 'active-tab' : ''}`}>
            🏢 Business
          </button>
          <button type="button" onClick={() => setActiveTab('staff')} className={`tab-toggle-button ${activeTab === 'staff' ? 'active-tab' : ''}`}>
            👥 Staff Payroll
          </button>
        </div>

        {/* EXPENSE TRANSACTION FORM (Shown for Personal & Business) */}
        {activeTab !== 'staff' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Transaction Date</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '8px', padding: '12px 14px', color: '#334155', outline: 'none', width: '100%', maxWidth: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} className="mobile-input-field" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Who Paid? / Purchaser</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                {(['Pich', 'Jing', 'Both'] as const).map((person) => (
                  <label key={person} style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: spender === person ? '#fefcf3' : '#ffffff', borderWidth: '1px', borderStyle: 'solid', borderColor: spender === person ? '#b59410' : '#cbd5e1', padding: '12px', borderRadius: '8px', color: spender === person ? '#334155' : '#64748b', cursor: 'pointer', fontSize: '14px', fontWeight: 'normal', transition: 'all 0.2s ease' }}>
                    <input type="radio" name="spender" value={person} checked={spender === person} onChange={() => setSpender(person)} style={{ display: 'none' }} />
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'transparent', borderColor: '#cbd5e1', borderWidth: '2px', borderStyle: 'solid', display: 'inline-block' }} />
                    {person}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Remarks / What did you buy?</label>
              <input type="text" placeholder="Electricity Bill, Lunch..." value={remarks} onChange={(e) => setRemarks(e.target.value)} required style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '8px', padding: '12px 14px', color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} className="mobile-input-field" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} />
            </div>

            {/* DYNAMIC SPLIT PAYMENT METHOD FOR EXPENSES */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount Spent</label>
                <button type="button" onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', cursor: 'pointer' }}>+ Split</button>
              </div>
              
              {paymentRows.map((row, index) => (
                <div key={row.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select 
                    value={row.method} 
                    onChange={e => {
                      const newRows = [...paymentRows];
                      newRows[index].method = e.target.value;
                      setPaymentRows(newRows);
                    }}
                    style={{ width: '45%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#334155', fontWeight: 'normal' }}
                    className="mobile-select-menu"
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
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', color: '#334155', textAlign: 'right', fontWeight: 'normal' }}
                    />
                  </div>
                  
                  {paymentRows.length > 1 && (
                    <button type="button" onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading || !hasPayments} style={{ backgroundColor: '#b59410', color: '#ffffff', padding: '15px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s ease', marginTop: '10px', opacity: (loading || !hasPayments) ? 0.7 : 1 }}>
              {loading ? 'Processing...' : `Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
            </button>
          </form>
        )}

        {/* STAFF MANAGEMENT UI (Shown only when Staff tab is active) */}
        {activeTab === 'staff' && (
          <div>
            {/* Add New Staff Form */}
            <form onSubmit={handleAddStaff} style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 'bold', color: '#1b4d3e', marginBottom: '8px', fontSize: '15px' }}>➕ Register New Staff</div>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Name</label>
                  <input type="text" placeholder="Staff Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '8px', padding: '12px 14px', color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} className="mobile-input-field" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} required />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Monthly Salary (៛)</label>
                  <CurrencyInput value={newStaffSalary} onChange={(v: any) => setNewStaffSalary(v)} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '8px', padding: '12px 14px', color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} placeholder="1,200,000" />
                </div>
                <button type="submit" disabled={loading} style={{ backgroundColor: '#b59410', color: '#ffffff', padding: '12px 24px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', height: '44px' }}>Add Staff</button>
              </div>
            </form>

            {/* Editable Staff Payroll Table */}
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1050px' }}>
                <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '12px', color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '12px', color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Start Date</th>
                    <th style={{ padding: '12px', color: '#475569', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Monthly Salary</th>
                    <th style={{ padding: '12px', color: '#10b981', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Earned MTD</th>
                    <th style={{ padding: '12px', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Debt (៛)</th>
                    <th style={{ padding: '12px', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Debt ($)</th>
                    <th style={{ padding: '12px', color: '#3b82f6', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Net Payout</th>
                    <th style={{ padding: '12px', color: '#b59410', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', width: '280px' }}>➕ Add Advance</th>
                    <th style={{ padding: '12px', color: '#475569', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '14px', fontWeight: 'normal' }}>No staff recorded yet.</td></tr>
                  ) : (
                    staffList.map((staff) => {
                      const monthlySalary = Number(staff.salary) || 0;
                      const dailyRate = monthlySalary / 30; 
                      const daysWorked = calculateDaysWorked(staff.start_date);
                      const totalEarned = Math.round(dailyRate * daysWorked);
                      
                      const totalDebtRiel = Number(staff.total_debt_riel) || 0;
                      const totalDebtUsd = Number(staff.total_debt_usd) || 0;

                      // Net Payout Calculation securely checks both buckets
                      const netPayout = totalEarned - totalDebtRiel - (totalDebtUsd * EXCHANGE_RATE);
                      const isNegativePayout = netPayout < 0;

                      return (
                        <tr key={staff.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff', transition: 'background 0.2s' }}>
                          
                          {/* 1. Name */}
                          <td 
                            style={{ padding: '12px', color: '#334155', cursor: 'text', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', padding: '8px 10px', color: '#334155', outline: '2px solid #b58a3d', width: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} className="mobile-input-field" />
                            ) : staff.name}
                          </td>

                          {/* 2. Start Date */}
                          <td 
                            style={{ padding: '12px', color: '#475569', cursor: 'text', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                              <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', padding: '8px 10px', color: '#334155', outline: '2px solid #b58a3d', width: '100%', boxSizing: 'border-box', fontWeight: 'normal' }} className="mobile-input-field" />
                            ) : (
                              <div>
                                {staff.start_date || 'N/A'}
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 'normal' }}>{daysWorked} days</div>
                              </div>
                            )}
                          </td>

                          {/* 3. Monthly Salary */}
                          <td 
                            style={{ padding: '12px', color: '#475569', cursor: 'text', textAlign: 'right', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'salary' }); setEditValue(String(staff.salary || 0)); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'salary' ? (
                              <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'salary')} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', padding: '8px 10px', color: '#334155', outline: '2px solid #b58a3d', width: '100%', boxSizing: 'border-box', fontWeight: 'normal', textAlign: 'right' }} />
                            ) : formatRiel(monthlySalary)}
                          </td>

                          {/* 4. Total Earned */}
                          <td style={{ padding: '12px', color: '#10b981', textAlign: 'right', fontSize: '14px', fontWeight: 'normal' }}>
                            {formatRiel(totalEarned)}
                          </td>

                          {/* 5. Total Debt RIEL */}
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <div 
                                    style={{ color: '#ef4444', cursor: 'text', fontSize: '14px', fontWeight: 'bold' }}
                                    onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_riel' }); setEditValue(String(staff.total_debt_riel || 0)); }}
                                >
                                  {editingCell?.id === staff.id && editingCell?.field === 'total_debt_riel' ? (
                                    <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_riel')} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', padding: '8px 10px', outline: '2px solid #b58a3d', width: '100%', boxSizing: 'border-box', textAlign: 'right', color: '#ef4444', fontWeight: 'normal' }} />
                                  ) : formatRiel(totalDebtRiel)}
                                </div>
                             </div>
                          </td>

                          {/* 6. Total Debt USD */}
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <div 
                                    style={{ color: '#ef4444', cursor: 'text', fontSize: '14px', fontWeight: 'bold' }}
                                    onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_usd' }); setEditValue(String(staff.total_debt_usd || 0)); }}
                                >
                                  {editingCell?.id === staff.id && editingCell?.field === 'total_debt_usd' ? (
                                    <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_usd')} style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', padding: '8px 10px', outline: '2px solid #b58a3d', width: '100%', boxSizing: 'border-box', textAlign: 'right', color: '#ef4444', fontWeight: 'normal' }} />
                                  ) : formatUSD(totalDebtUsd)}
                                </div>
                             </div>
                          </td>

                          {/* 7. Net Payout */}
                          <td style={{ padding: '12px', color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontSize: '14px', fontWeight: 'bold' }}>
                            {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                          </td>

                          {/* 8. Action: Add Debt & Method */}
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <select 
                                  value={debtMethods[staff.id] || 'Cash ៛'} 
                                  onChange={e => setDebtMethods({ ...debtMethods, [staff.id]: e.target.value })}
                                  style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', color: '#334155', outline: 'none', width: '85px', padding: '6px', fontSize: '13px', fontWeight: 'normal' }}
                                  className="mobile-select-menu"
                                >
                                  <option value="Cash ៛">Cash ៛</option>
                                  <option value="Cash $">Cash $</option>
                                  <option value="QR ៛">QR ៛</option>
                                  <option value="QR $">QR $</option>
                                </select>
                                <CurrencyInput 
                                  placeholder="0" 
                                  value={debtAdditions[staff.id] || ''} 
                                  onChange={(v:any) => setDebtAdditions({ ...debtAdditions, [staff.id]: v })} 
                                  onEnter={() => handleAddDebt(staff)}
                                  style={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderWidth: '1px', borderStyle: 'solid', borderRadius: '6px', color: '#334155', outline: 'none', boxSizing: 'border-box', fontWeight: 'normal', flex: 1, padding: '6px', fontSize: '13px', textAlign: 'right' }} 
                                />
                                <button 
                                  onClick={() => handleAddDebt(staff)}
                                  disabled={!debtAdditions[staff.id]}
                                  style={{ border: 'none', borderRadius: '6px', fontSize: '13px', transition: 'background 0.2s', fontWeight: 'bold', background: debtAdditions[staff.id] ? '#10b981' : '#e2e8f0', color: debtAdditions[staff.id] ? '#fff' : '#94a3b8', cursor: debtAdditions[staff.id] ? 'pointer' : 'not-allowed', padding: '6px 12px' }}
                                >
                                  Add
                                </button>
                              </div>
                              
                              {/* Settle Action Buttons Directly Below */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                {(totalDebtRiel > 0 || totalDebtUsd > 0) && (
                                  <button 
                                    onClick={() => setSettleModal({ isOpen: true, staff: staff, amount: '', method: 'Cash ៛' })}
                                    style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                                  >
                                    ✅ Settle
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 9. Actions: History & Delete */}
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                              <button 
                                onClick={() => handleViewHistory(staff)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.7 }}
                                title="View Debt History"
                              >
                                🕒
                              </button>
                              <button 
                                onClick={() => handleDeleteStaff(staff.id, staff.name)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.7 }}
                                title="Delete Staff"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>

                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '16px', textAlign: 'center', fontWeight: 'normal' }}>
              💡 <b>Tip:</b> Click on any Name, Start Date, Monthly Salary, or Debt to edit it directly. Press Enter to save.
            </p>
          </div>
        )}

      </div>

      {/* STAFF DEBT HISTORY MODAL */}
      {historyModal.isOpen && historyModal.staff && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setHistoryModal({ isOpen: false, staff: null, history: [] })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '500px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: 'bold' }}>🕒 Debt History: {historyModal.staff.name}</h3>
              <button onClick={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', fontWeight: 'bold' }}>✕</button>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
              {historyModal.history.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '20px', fontWeight: 'normal' }}>No debt history found.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '8px 0', textAlign: 'left', color: '#475569', fontWeight: 'bold', fontSize: '12px' }}>Date</th>
                      <th style={{ padding: '8px 0', textAlign: 'left', color: '#475569', fontWeight: 'bold', fontSize: '12px' }}>Action Type</th>
                      <th style={{ padding: '8px 0', textAlign: 'right', color: '#475569', fontWeight: 'bold', fontSize: '12px' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModal.history.map((record) => (
                      <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 0', color: '#334155', fontWeight: 'normal' }}>{new Date(record.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 0', color: '#475569', fontWeight: 'normal' }}>{record.payment_method}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: '#ef4444', fontWeight: 'normal' }}>
                          {record.payment_method.includes('$') ? formatUSD(record.amount) : formatRiel(record.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontSize: '14px', fontWeight: 'bold' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF SETTLEMENT MODAL */}
      {settleModal.isOpen && settleModal.staff && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', fontSize: '18px', fontWeight: 'bold' }}>✅ Settle Debt: {settleModal.staff.name}</h3>
            
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Current Debt (៛): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatRiel(settleModal.staff.total_debt_riel || 0)}</b></div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Current Debt ($): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatUSD(settleModal.staff.total_debt_usd || 0)}</b></div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>Settlement Amount</label>
              <CurrencyInput autoFocus value={settleModal.amount} onChange={(v:any) => setSettleModal({...settleModal, amount: v})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box', backgroundColor: '#fff', color: '#0f172a' }} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: 'bold' }}>Payment Received Into</label>
              <select value={settleModal.method} onChange={e => setSettleModal({...settleModal, method: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>
                <option value="Cash ៛">💵 Cash ៛</option>
                <option value="Cash $">💵 Cash $</option>
                <option value="QR ៛">📱 QR ៛</option>
                <option value="QR $">📱 QR $</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })} style={{ padding: '12px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSettleSubmit} style={{ padding: '12px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Confirm Settlement</button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        /* Force inherit font for all inputs and enable tabular numbers for exact matching height */
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }
        
        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }

        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }

        /* 🔥 GLOBAL (Laptop/Desktop) RULES */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          display: flex;
          flex-direction: column;
          align-items: center; /* Safely centers the white form card */
          width: 100%;

          /* 👇 SCROLL FIX 👇 */
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* 🔥 Extracted header now perfectly aligns horizontally with the Hamburger icon */
        .header-container { 
          width: calc(100% - 60px);
          max-width: 1600px;
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* 🔥 Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          min-height: 42px; 
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
          margin-bottom: 30px; 
          background: #f1f5f9; 
          padding: 8px; 
          border-radius: 10px; 
          flex-wrap: wrap;
        }

        .tab-toggle-button {
          flex: 1; 
          padding: 12px; 
          border-radius: 8px; 
          border: none; 
          cursor: pointer; 
          font-size: 15px;
          background: transparent;
          color: #64748b;
          transition: all 0.2s ease;
          min-width: 100px;
          font-weight: bold;
        }

        .active-tab {
          background: #1b4d3e !important;
          color: #ffffff !important;
          box-shadow: 0 2px 8px rgba(27,77,62,0.15) !important;
        }

        /* 🔥 MOBILE CSS OVERRIDES */
        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
            
            /* 👇 MOBILE SCROLL FIX 👇 */
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
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
          .content-card {
            padding: 20px !important;
          }
          .tabs-container {
            padding: 6px !important;
            margin-bottom: 20px !important;
            border-radius: 8px !important;
          }
          .tab-toggle-button {
            padding: 10px !important;
            font-size: 14px !important;
          }
          .mobile-select-menu, .mobile-input-field {
            font-size: 16px !important; /* Disables Mobile Safari Auto-Zoom physics shifts */
          }
        }
      `}</style>
    </div>
  )
}