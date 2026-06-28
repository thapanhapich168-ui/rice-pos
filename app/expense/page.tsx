'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
const EXCHANGE_RATE = 4000;

// ==========================================
// ROBUST LIVE COMMA FORMATTER (Stateless Display)
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus }: any) {
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
      style={{ ...style, color: '#334155', fontSize: '14px', fontWeight: 'normal' }}
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

  // Inline Editing State
  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  // Initialization
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setExpenseDate(today)
    fetchStaff()
  }, [])

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
      for (const row of activePayments) {
        let amountRiel = Number(row.amount);
        let amountUsd = 0;

        if (row.method.includes('$')) {
          amountUsd = amountRiel;
          amountRiel = amountRiel * EXCHANGE_RATE;
        }

        const { error } = await supabase.from('expenses').insert([{
          expense_date: expenseDate,
          spender: spender,
          payment_method: row.method,
          remarks: activePayments.length > 1 ? `${remarks} (Split Payment)` : remarks,                     
          amount: amountUsd,               
          amount_riel: amountRiel,         
          description: activeTab.toUpperCase(), 
        }]);

        if (error) throw error;
      }

      alert('Expense recorded successfully!')
      setRemarks('')
      setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);

    } catch (err: any) {
      alert(`Error saving entry: ${err.message}`)
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
        total_debt: 0,
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
    const amountToAdd = Number(debtAdditions[staff.id])
    if (!amountToAdd || amountToAdd === 0) return

    const method = debtMethods[staff.id] || 'Cash ៛'
    const newTotalDebt = Number(staff.total_debt || 0) + amountToAdd

    // Optimistic UI update
    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt: newTotalDebt } : s));
    setDebtAdditions(prev => ({ ...prev, [staff.id]: '' }))

    // 1. Update total debt
    const { error: staffErr } = await supabase.from('staff').update({ total_debt: newTotalDebt }).eq('id', staff.id)
    
    // 2. Log History
    await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: amountToAdd, payment_method: method }])

    // 3. Log as an Expense (since the business is giving them an advance)
    let amountRiel = amountToAdd;
    let amountUsd = 0;
    if (method.includes('$')) {
      amountUsd = amountToAdd;
      amountRiel = amountToAdd * EXCHANGE_RATE;
    }

    await supabase.from('expenses').insert([{
      expense_date: new Date().toISOString().split('T')[0],
      spender: 'Business',
      payment_method: method,
      remarks: `Staff Advance: ${staff.name}`,
      amount: amountUsd,
      amount_riel: amountRiel,
      description: 'STAFF'
    }])

    if (staffErr) {
      alert(`Error updating debt: ${staffErr.message}`)
      fetchStaff() // Revert
    }
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
    if (field === 'salary' || field === 'total_debt') {
      finalValue = Number(editValue.replace(/,/g, '')) || 0;
    }

    // Optimistic UI Update
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, [field]: finalValue } : s));
    setEditingCell(null);

    const { error } = await supabase.from('staff').update({ [field]: finalValue }).eq('id', id);
    if (error) {
      alert(`Failed to update ${field}: ${error.message}`);
      fetchStaff(); // Revert
    }
  }

  // --- Action: Delete Staff ---
  async function handleDeleteStaff(id: number, name: string) {
    if (!confirm(`Are you sure you want to remove ${name} from the payroll?`)) return;
    
    // Optimistic UI
    setStaffList(prev => prev.filter(s => s.id !== id));

    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) {
      alert(`Failed to delete: ${error.message}`);
      fetchStaff();
    }
  }

  // --- Helper: Calculate Month-to-Date Days Worked ---
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

  // Live Math for Expenses Tab
  const totalExpenseRiel = paymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);

  return (
    <div style={styles.pageContainer}>
      <div style={{
        ...styles.card,
        maxWidth: activeTab === 'staff' ? '1100px' : '550px', 
        transition: 'max-width 0.3s ease'
      }}>
        {/* HEADER BRANDING */}
        <div style={styles.brandHeader}>
          <h1 style={styles.mainTitle}>Daily Dashboard</h1>
          <p style={styles.subtitle}>Tracker, Ledger & Payroll Management</p>
        </div>

        {/* THREE TAB HEADER */}
        <div style={styles.tabContainer}>
          <button type="button" onClick={() => setActiveTab('personal')} style={{ ...styles.tabButton, ...(activeTab === 'personal' ? styles.activeTab : {}) }}>
            🏡 Personal
          </button>
          <button type="button" onClick={() => setActiveTab('business')} style={{ ...styles.tabButton, ...(activeTab === 'business' ? styles.activeTab : {}) }}>
            🏢 Business
          </button>
          <button type="button" onClick={() => setActiveTab('staff')} style={{ ...styles.tabButton, ...(activeTab === 'staff' ? styles.activeTab : {}) }}>
            👥 Staff Payroll
          </button>
        </div>

        {/* EXPENSE TRANSACTION FORM (Shown for Personal & Business) */}
        {activeTab !== 'staff' && (
          <form onSubmit={handleSubmit} style={styles.form}>
            
            <div style={styles.inputGroup}>
              <label style={styles.label}>Transaction Date</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} style={styles.inputField} required />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Who Paid? / Purchaser</label>
              <div style={styles.radioGrid}>
                {(['Pich', 'Jing', 'Both'] as const).map((person) => (
                  <label key={person} style={{ ...styles.radioLabel, ...(spender === person ? styles.radioLabelActive : {}) }}>
                    <input type="radio" name="spender" value={person} checked={spender === person} onChange={() => setSpender(person)} style={styles.hiddenRadio} />
                    <span style={styles.radioDot} />
                    {person}
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Remarks / What did you buy?</label>
              <input type="text" placeholder="e.g. Electricity Bill, Lunch..." value={remarks} onChange={(e) => setRemarks(e.target.value)} style={styles.inputField} required />
            </div>

            {/* DYNAMIC SPLIT PAYMENT METHOD FOR EXPENSES */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount Spent</label>
                <button type="button" onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', cursor: 'pointer' }}>+ Split</button>
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
                    style={{ width: '45%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#334155', fontWeight: 'normal' }}
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
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', color: '#334155', fontSize: '14px', textAlign: 'right', fontWeight: 'normal' }}
                    />
                  </div>
                  
                  {paymentRows.length > 1 && (
                    <button type="button" onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>
              ))}

              {paymentRows.some(r => Number(r.amount) > 0) && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#475569', fontSize: '13px', fontWeight: 'bold' }}>Total Expense:</span>
                  <span style={{ color: '#ef4444', fontSize: '16px', fontWeight: 'normal' }}>{formatRiel(totalExpenseRiel)}</span>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading || totalExpenseRiel === 0} style={{...styles.submitButton, opacity: (loading || totalExpenseRiel === 0) ? 0.7 : 1}}>
              {loading ? 'Processing Entry...' : `Securely Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
            </button>
          </form>
        )}

        {/* STAFF MANAGEMENT UI (Shown only when Staff tab is active) */}
        {activeTab === 'staff' && (
          <div>
            {/* Add New Staff Form */}
            <form onSubmit={handleAddStaff} style={{ ...styles.form, padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 'bold', color: '#1b4d3e', marginBottom: '8px', fontSize: '15px' }}>➕ Register New Staff</div>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Name</label>
                  <input type="text" placeholder="Staff Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} style={{...styles.inputField, fontSize: '14px'}} required />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Monthly Salary (៛)</label>
                  <CurrencyInput value={newStaffSalary} onChange={(v: any) => setNewStaffSalary(v)} style={{...styles.inputField, fontSize: '14px'}} placeholder="e.g. 1,200,000" />
                </div>
                <button type="submit" disabled={loading} style={{ ...styles.submitButton, marginTop: 0, padding: '12px 24px', height: '44px' }}>Add Staff</button>
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
                    <th style={{ padding: '12px', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Total Debt</th>
                    <th style={{ padding: '12px', color: '#3b82f6', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'right' }}>Net Payout</th>
                    <th style={{ padding: '12px', color: '#b59410', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', width: '280px' }}>➕ Add Advance/Debt</th>
                    <th style={{ padding: '12px', color: '#475569', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '14px', fontWeight: 'normal' }}>No staff recorded yet.</td></tr>
                  ) : (
                    staffList.map((staff) => {
                      const monthlySalary = Number(staff.salary) || 0;
                      const dailyRate = monthlySalary / 30; 
                      const daysWorked = calculateDaysWorked(staff.start_date);
                      const totalEarned = Math.round(dailyRate * daysWorked);
                      
                      const totalDebt = Number(staff.total_debt) || 0;
                      const netPayout = totalEarned - totalDebt;
                      const isNegativePayout = netPayout < 0;

                      return (
                        <tr key={staff.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff', transition: 'background 0.2s' }}>
                          
                          {/* 1. Name */}
                          <td 
                            style={{ padding: '12px', color: '#334155', cursor: 'text', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} style={styles.tableInput} />
                            ) : staff.name}
                          </td>

                          {/* 2. Start Date */}
                          <td 
                            style={{ padding: '12px', color: '#475569', cursor: 'text', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                              <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} style={styles.tableInput} />
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
                              <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onBlur={() => saveInlineEdit(staff.id, 'salary')} onKeyDown={(e:any) => e.key === 'Enter' && saveInlineEdit(staff.id, 'salary')} style={{...styles.tableInput, textAlign: 'right'}} />
                            ) : formatRiel(monthlySalary)}
                          </td>

                          {/* 4. Total Earned */}
                          <td style={{ padding: '12px', color: '#10b981', textAlign: 'right', fontSize: '14px', fontWeight: 'normal' }}>
                            {formatRiel(totalEarned)}
                          </td>

                          {/* 5. Total Debt */}
                          <td 
                            style={{ padding: '12px', color: '#ef4444', textAlign: 'right', cursor: 'text', fontSize: '14px', fontWeight: 'normal' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt' }); setEditValue(String(staff.total_debt || 0)); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'total_debt' ? (
                              <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onBlur={() => saveInlineEdit(staff.id, 'total_debt')} onKeyDown={(e:any) => e.key === 'Enter' && saveInlineEdit(staff.id, 'total_debt')} style={{...styles.tableInput, textAlign: 'right', color: '#ef4444'}} />
                            ) : formatRiel(totalDebt)}
                          </td>

                          {/* 6. Net Payout */}
                          <td style={{ padding: '12px', color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontSize: '14px', fontWeight: 'normal' }}>
                            {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                          </td>

                          {/* 7. Action: Add Debt & Method */}
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <select 
                                value={debtMethods[staff.id] || 'Cash ៛'} 
                                onChange={e => setDebtMethods({ ...debtMethods, [staff.id]: e.target.value })}
                                style={{ ...styles.tableInput, width: '85px', padding: '6px', fontSize: '13px', fontWeight: 'normal' }}
                              >
                                <option value="Cash ៛">Cash ៛</option>
                                <option value="Cash $">Cash $</option>
                                <option value="QR ៛">QR ៛</option>
                                <option value="QR $">QR $</option>
                              </select>
                              <CurrencyInput 
                                placeholder="0 ៛" 
                                value={debtAdditions[staff.id] || ''} 
                                onChange={(v:any) => setDebtAdditions({ ...debtAdditions, [staff.id]: v })} 
                                onKeyDown={(e:any) => e.key === 'Enter' && handleAddDebt(staff)}
                                style={{...styles.tableInput, flex: 1, padding: '6px', fontSize: '13px', fontWeight: 'normal'}} 
                              />
                              <button 
                                onClick={() => handleAddDebt(staff)}
                                disabled={!debtAdditions[staff.id]}
                                style={{ ...styles.actionBtn, background: debtAdditions[staff.id] ? '#b59410' : '#e2e8f0', color: debtAdditions[staff.id] ? '#fff' : '#94a3b8', cursor: debtAdditions[staff.id] ? 'pointer' : 'not-allowed', padding: '6px 12px' }}
                              >
                                Add
                              </button>
                            </div>
                          </td>

                          {/* 8. Actions: History & Delete */}
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
              💡 <b>Tip:</b> Click on any Name, Start Date, Monthly Salary, or Total Debt to edit it directly.
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
                      <th style={{ padding: '8px 0', textAlign: 'left', color: '#475569', fontWeight: 'bold', fontSize: '12px' }}>Payment Method</th>
                      <th style={{ padding: '8px 0', textAlign: 'right', color: '#475569', fontWeight: 'bold', fontSize: '12px' }}>Amount (៛)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModal.history.map((record) => (
                      <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 0', color: '#334155', fontWeight: 'normal' }}>{new Date(record.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 0', color: '#475569', fontWeight: 'normal' }}>{record.payment_method}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: '#ef4444', fontWeight: 'normal' }}>{formatRiel(record.amount)}</td>
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
      `}</style>
    </div>
  )
}

// --- CSS-IN-JS BRAND THEME STYLING ---
const styles = {
  pageContainer: {
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 20px 40px 65px', 
    fontFamily: 'Arial, sans-serif',
    flex: 1,
    overflowY: 'auto' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  card: {
    backgroundColor: '#ffffff',
    width: '100%',
    borderRadius: '16px',
    padding: '35px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
    borderColor: '#e2e8f0',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  brandHeader: {
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  mainTitle: {
    color: '#1e293b',
    fontSize: '26px',
    fontWeight: 'bold',
    letterSpacing: '-0.3px',
    margin: '0 0 6px 0',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '15px',
    margin: 0,
    fontWeight: 'normal',
  },
  tabContainer: {
    display: 'flex',
    gap: '8px',
    backgroundColor: '#f1f5f9',
    padding: '8px',
    borderRadius: '10px',
    marginBottom: '30px',
    flexWrap: 'wrap' as const,
  },
  tabButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: 'transparent', 
    borderWidth: '0px',             
    color: '#64748b',
    fontSize: '15px',
    fontWeight: 'bold',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '100px',
  },
  activeTab: {
    backgroundColor: '#1b4d3e',
    color: '#ffffff',
    boxShadow: '0 2px 8px rgba(27,77,62,0.15)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    flex: 1,
  },
  label: {
    color: '#475569',
    fontSize: '12px',
    fontWeight: 'bold',
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  inputField: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',         
    borderWidth: '1px',             
    borderStyle: 'solid',           
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#334155',
    fontSize: '14px', 
    fontWeight: 'normal',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  tableInput: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',         
    borderWidth: '1px',             
    borderStyle: 'solid',           
    borderRadius: '6px',
    padding: '8px 10px',
    color: '#334155',
    fontSize: '14px', 
    fontWeight: 'normal',
    outline: '2px solid #b58a3d',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  actionBtn: {
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    fontSize: '13px',
    transition: 'background 0.2s'
  },
  radioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '10px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#ffffff',
    borderWidth: '1px',             
    borderStyle: 'solid',           
    borderColor: '#cbd5e1',         
    padding: '12px',
    borderRadius: '8px',
    color: '#334155',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'normal',
    transition: 'all 0.2s ease',
  },
  radioLabelActive: {
    borderColor: '#b59410',
    color: '#334155',
    backgroundColor: '#fefcf3',
  },
  hiddenRadio: {
    display: 'none',
  },
  radioDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    borderColor: '#cbd5e1',
    borderWidth: '2px',
    borderStyle: 'solid',
    display: 'inline-block',
  },
  submitButton: {
    backgroundColor: '#b59410',
    color: '#ffffff',
    padding: '15px',
    borderWidth: '0px',             
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    marginTop: '10px',
  },
}