'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatRiel, formatUSD, EXCHANGE_RATE } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'

export default function ExpenseDashboard() {
  const { showToast } = useToast();

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

  // --- API: Fetch Staff ---
  async function fetchStaff() {
    const { data, error } = await supabase.from('staff').select('*').order('id', { ascending: true })
    if (data) setStaffList(data)
  }

  // --- Action: Submit Expense ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!remarks) {
      showToast('error', 'Missing Info', 'Please add remarks/item detail');
      return;
    }
    
    const activePayments = paymentRows.filter(r => (Number(r.amount) || 0) > 0);
    if (activePayments.length === 0) {
      showToast('error', 'Missing Info', 'Please enter at least one payment amount.');
      return;
    }

    setLoading(true)

    try {
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

      showToast('success', 'Success', 'Expense recorded successfully!');
      setRemarks('')
      setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);

    } catch (err: any) {
      showToast('error', 'Save Failed', `Error saving entry: ${err.message}`);
    } finally {
      setLoading(false)
    }
  }

  // --- Action: Add New Staff ---
  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!newStaffName) {
      showToast('error', 'Validation Error', 'Staff name is required');
      return;
    }

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
      showToast('error', 'Error', `Error adding staff: ${error.message}`);
    } else {
      showToast('success', 'Staff Added', `${newStaffName} has been registered.`);
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
      showToast('error', 'Update Failed', `Error updating debt: ${staffErr.message}`);
      fetchStaff() 
      return;
    }

    const { error: histErr } = await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: rawAmount, payment_method: method }])
    if (histErr) showToast('info', 'Warning', `Debt updated, but history log failed: ${histErr.message}`);

    await supabase.from('expenses').insert([{
      expense_date: new Date().toISOString().split('T')[0],
      spender: 'Both', 
      payment_method: method,
      remarks: `Staff Advance: ${staff.name}`,
      amount_usd: saveUsd, 
      amount_riel: saveRiel,
      description: 'STAFF_ADVANCE' 
    }])
    showToast('success', 'Advance Added', `Advance added for ${staff.name}`);
  }

  // --- Action: Settle/Pay Back Debt ---
  async function handleSettleSubmit() {
    const staff = settleModal.staff;
    const rawAmount = Number(settleModal.amount);
    
    if (!rawAmount || rawAmount <= 0) {
      showToast('error', 'Invalid Amount', 'Enter a valid settlement amount.');
      return;
    }
    
    let saveRiel = 0, saveUsd = 0;
    let newTotalRiel = Number(staff.total_debt_riel || 0);
    let newTotalUsd = Number(staff.total_debt_usd || 0);

    if (settleModal.method.includes('$')) {
      if (rawAmount > newTotalUsd) {
        showToast('error', 'Overpayment', 'Cannot settle more USD than they owe.');
        return;
      }
      saveUsd = -Math.abs(rawAmount);
      newTotalUsd -= rawAmount;
    } else {
      if (rawAmount > newTotalRiel) {
        showToast('error', 'Overpayment', 'Cannot settle more Riel than they owe.');
        return;
      }
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
    
    showToast('success', 'Settled', `Settlement recorded for ${staff.name}`);
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
      showToast('error', 'Update Failed', error.message);
      fetchStaff();
    }
  }

  // --- Action: Delete Staff ---
  async function handleDeleteStaff(id: number, name: string) {
    if (!confirm(`Are you sure you want to remove ${name} from the payroll?`)) return;
    
    setStaffList(prev => prev.filter(s => s.id !== id));

    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) {
      showToast('error', 'Deletion Failed', error.message);
      fetchStaff();
    } else {
      showToast('success', 'Deleted', `${name} has been removed.`);
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

      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">💸 Daily Expense & Payroll</h1>
        </div>
      </div>

      <div className="content-card" style={{ maxWidth: activeTab === 'staff' ? '1200px' : '550px' }}>
        
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
          <form onSubmit={handleSubmit} className="exp-form">
            
            <div className="exp-form-group">
              <label className="exp-label">Transaction Date</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="exp-input mobile-input-field" />
            </div>

            <div className="exp-form-group">
              <label className="exp-label">Who Paid? / Purchaser</label>
              <div className="exp-radio-grid">
                {(['Pich', 'Jing', 'Both'] as const).map((person) => (
                  <label key={person} className={`exp-radio-label ${spender === person ? 'active' : ''}`}>
                    <input type="radio" name="spender" value={person} checked={spender === person} onChange={() => setSpender(person)} style={{ display: 'none' }} />
                    <span className="exp-radio-circle" />
                    {person}
                  </label>
                ))}
              </div>
            </div>

            <div className="exp-form-group">
              <label className="exp-label">Remarks / What did you buy?</label>
              <input type="text" placeholder="Electricity Bill, Lunch..." value={remarks} onChange={(e) => setRemarks(e.target.value)} required className="exp-input mobile-input-field" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} />
            </div>

            {/* DYNAMIC SPLIT PAYMENT METHOD FOR EXPENSES */}
            <div className="exp-split-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label className="exp-label" style={{ marginBottom: 0 }}>Amount Spent</label>
                <button type="button" onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} className="exp-add-split-btn">+ Split</button>
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
                    className="exp-select mobile-select-menu"
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
                      className="exp-input"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                  
                  {paymentRows.length > 1 && (
                    <button type="button" onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} className="exp-remove-btn">✕</button>
                  )}
                </div>
              ))}
            </div>

            <button type="submit" disabled={loading || !hasPayments} className={`exp-submit-btn ${(loading || !hasPayments) ? 'disabled' : ''}`}>
              {loading ? 'Processing...' : `Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
            </button>
          </form>
        )}

        {/* STAFF MANAGEMENT UI (Shown only when Staff tab is active) */}
        {activeTab === 'staff' && (
          <div>
            {/* Add New Staff Form */}
            <form onSubmit={handleAddStaff} className="staff-add-form">
              <div className="staff-add-title">➕ Register New Staff</div>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="staff-add-col">
                  <label className="exp-label">Name</label>
                  <input type="text" placeholder="Staff Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="exp-input mobile-input-field" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} required />
                </div>
                <div className="staff-add-col-small">
                  <label className="exp-label">Monthly Salary (៛)</label>
                  <CurrencyInput value={newStaffSalary} onChange={(v: any) => setNewStaffSalary(v)} className="exp-input" placeholder="1,200,000" />
                </div>
                <button type="submit" disabled={loading} className="staff-add-btn">Add Staff</button>
              </div>
            </form>

            {/* Editable Staff Payroll Table */}
            <div className="staff-table-wrapper">
              <table className="staff-table">
                <thead className="staff-thead">
                  <tr>
                    <th className="staff-th">Name</th>
                    <th className="staff-th">Start Date</th>
                    <th className="staff-th" style={{ textAlign: 'right' }}>Monthly Salary</th>
                    <th className="staff-th" style={{ textAlign: 'right', color: '#10b981' }}>Earned MTD</th>
                    <th className="staff-th" style={{ textAlign: 'right', color: '#ef4444' }}>Debt (៛)</th>
                    <th className="staff-th" style={{ textAlign: 'right', color: '#ef4444' }}>Debt ($)</th>
                    <th className="staff-th" style={{ textAlign: 'right', color: '#3b82f6' }}>Net Payout</th>
                    <th className="staff-th" style={{ textAlign: 'center', color: '#b59410', width: '280px' }}>➕ Add Advance</th>
                    <th className="staff-th" style={{ textAlign: 'center', width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr><td colSpan={9} className="staff-empty-cell">No staff recorded yet.</td></tr>
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
                        <tr key={staff.id} className="staff-tr">
                          
                          {/* 1. Name */}
                          <td 
                            className="staff-td"
                            style={{ cursor: 'text' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} className="staff-inline-input mobile-input-field" />
                            ) : staff.name}
                          </td>

                          {/* 2. Start Date */}
                          <td 
                            className="staff-td"
                            style={{ cursor: 'text' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                              <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} className="staff-inline-input mobile-input-field" />
                            ) : (
                              <div>
                                {staff.start_date || 'N/A'}
                                <div className="staff-days-worked">{daysWorked} days</div>
                              </div>
                            )}
                          </td>

                          {/* 3. Monthly Salary */}
                          <td 
                            className="staff-td"
                            style={{ cursor: 'text', textAlign: 'right' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'salary' }); setEditValue(String(staff.salary || 0)); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'salary' ? (
                              <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'salary')} className="staff-inline-input" style={{ textAlign: 'right' }} />
                            ) : formatRiel(monthlySalary)}
                          </td>

                          {/* 4. Total Earned */}
                          <td className="staff-td" style={{ color: '#10b981', textAlign: 'right' }}>
                            {formatRiel(totalEarned)}
                          </td>

                          {/* 5. Total Debt RIEL */}
                          <td className="staff-td" style={{ textAlign: 'right' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <div 
                                    className="staff-debt-value"
                                    onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_riel' }); setEditValue(String(staff.total_debt_riel || 0)); }}
                                >
                                  {editingCell?.id === staff.id && editingCell?.field === 'total_debt_riel' ? (
                                    <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_riel')} className="staff-inline-input" style={{ textAlign: 'right', color: '#ef4444' }} />
                                  ) : formatRiel(totalDebtRiel)}
                                </div>
                             </div>
                          </td>

                          {/* 6. Total Debt USD */}
                          <td className="staff-td" style={{ textAlign: 'right' }}>
                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <div 
                                    className="staff-debt-value"
                                    onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_usd' }); setEditValue(String(staff.total_debt_usd || 0)); }}
                                >
                                  {editingCell?.id === staff.id && editingCell?.field === 'total_debt_usd' ? (
                                    <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_usd')} className="staff-inline-input" style={{ textAlign: 'right', color: '#ef4444' }} />
                                  ) : formatUSD(totalDebtUsd)}
                                </div>
                             </div>
                          </td>

                          {/* 7. Net Payout */}
                          <td className="staff-td" style={{ color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontWeight: 'bold' }}>
                            {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                          </td>

                          {/* 8. Action: Add Debt & Method */}
                          <td className="staff-td" style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <select 
                                  value={debtMethods[staff.id] || 'Cash ៛'} 
                                  onChange={e => setDebtMethods({ ...debtMethods, [staff.id]: e.target.value })}
                                  className="staff-action-select mobile-select-menu"
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
                                  className="staff-action-input"
                                />
                                <button 
                                  onClick={() => handleAddDebt(staff)}
                                  disabled={!debtAdditions[staff.id]}
                                  className={`staff-action-add-btn ${debtAdditions[staff.id] ? 'active' : ''}`}
                                >
                                  Add
                                </button>
                              </div>
                              
                              {/* Settle Action Buttons Directly Below */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                {(totalDebtRiel > 0 || totalDebtUsd > 0) && (
                                  <button 
                                    onClick={() => setSettleModal({ isOpen: true, staff: staff, amount: '', method: 'Cash ៛' })}
                                    className="staff-action-settle-btn"
                                  >
                                    ✅ Settle
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 9. Actions: History & Delete */}
                          <td className="staff-td" style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                              <button onClick={() => handleViewHistory(staff)} className="staff-icon-btn" title="View Debt History">🕒</button>
                              <button onClick={() => handleDeleteStaff(staff.id, staff.name)} className="staff-icon-btn" title="Delete Staff">🗑️</button>
                            </div>
                          </td>

                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="staff-tip-text">
              💡 <b>Tip:</b> Click on any Name, Start Date, Monthly Salary, or Debt to edit it directly. Press Enter to save.
            </p>
          </div>
        )}

      </div>

      {/* STAFF DEBT HISTORY MODAL */}
      {historyModal.isOpen && historyModal.staff && (
        <div className="exp-modal-overlay" onMouseDown={() => setHistoryModal({ isOpen: false, staff: null, history: [] })}>
          <div className="exp-modal-content" style={{ maxWidth: '500px' }} onMouseDown={e => e.stopPropagation()}>
            <div className="exp-modal-header">
              <h3 className="exp-modal-title">🕒 Debt History: {historyModal.staff.name}</h3>
              <button onClick={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} className="exp-modal-close-btn">✕</button>
            </div>
            
            <div className="exp-modal-body">
              {historyModal.history.length === 0 ? (
                <p className="exp-modal-empty">No debt history found.</p>
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
                        <td style={{ padding: '12px 0', color: '#334155' }}>{new Date(record.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 0', color: '#475569' }}>{record.payment_method}</td>
                        <td style={{ padding: '12px 0', textAlign: 'right', color: '#ef4444' }}>
                          {record.payment_method.includes('$') ? formatUSD(record.amount) : formatRiel(record.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="exp-modal-footer">
              <button onClick={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} className="exp-btn-cancel">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF SETTLEMENT MODAL */}
      {settleModal.isOpen && settleModal.staff && (
        <div className="exp-modal-overlay" onMouseDown={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })}>
          <div className="exp-modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h3 className="exp-modal-title" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '16px' }}>✅ Settle Debt: {settleModal.staff.name}</h3>
            
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Current Debt (៛): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatRiel(settleModal.staff.total_debt_riel || 0)}</b></div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Current Debt ($): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatUSD(settleModal.staff.total_debt_usd || 0)}</b></div>

            <div style={{ marginBottom: '16px' }}>
              <label className="exp-label">Settlement Amount</label>
              <CurrencyInput autoFocus value={settleModal.amount} onChange={(v:any) => setSettleModal({...settleModal, amount: v})} className="exp-input" />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="exp-label">Payment Received Into</label>
              <select value={settleModal.method} onChange={e => setSettleModal({...settleModal, method: e.target.value})} className="exp-select" style={{ width: '100%', cursor: 'pointer' }}>
                <option value="Cash ៛">💵 Cash ៛</option>
                <option value="Cash $">💵 Cash $</option>
                <option value="QR ៛">📱 QR ៛</option>
                <option value="QR $">📱 QR $</option>
              </select>
            </div>

            <div className="exp-modal-footer">
              <button onClick={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })} className="exp-btn-cancel">Cancel</button>
              <button onClick={handleSettleSubmit} className="exp-btn-save">Confirm Settlement</button>
            </div>
          </div>
        </div>
      )}

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        /* --- DE-INLINED CSS CLASSES --- */
        
        /* FORM INPUTS */
        .exp-form { display: flex; flex-direction: column; gap: 20px; }
        .exp-form-group { display: flex; flex-direction: column; gap: 8px; }
        .exp-input {
          background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px;
          color: #334155; outline: none; width: 100%; box-sizing: border-box; font-size: 16px;
        }
        .exp-input:focus { border-color: #b58a3d; box-shadow: 0 0 0 2px rgba(181, 138, 61, 0.2); }
        .exp-label { color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 6px; }
        .exp-select {
          width: 45%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; background-color: #fff; cursor: pointer; color: #334155; font-size: 16px;
        }

        /* RADIO BUTTONS */
        .exp-radio-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        .exp-radio-label {
          display: flex; align-items: center; gap: 10px; background-color: #ffffff; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; color: #64748b; cursor: pointer; font-size: 14px; transition: all 0.2s ease;
        }
        .exp-radio-label.active { background-color: #fefcf3; border-color: #b59410; color: #334155; }
        .exp-radio-circle { width: 8px; height: 8px; border-radius: 50%; background-color: transparent; border: 2px solid #cbd5e1; display: inline-block; }
        .exp-radio-label.active .exp-radio-circle { border-color: #b59410; background-color: #b59410; }

        /* SPLIT PAYMENTS */
        .exp-split-container { background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 8px; }
        .exp-add-split-btn { background: #e0f2fe; color: #0369a1; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; padding: 6px 12px; cursor: pointer; }
        .exp-remove-btn { background: none; border: none; color: #ef4444; font-size: 18px; cursor: pointer; padding: 0 4px; font-weight: bold; }
        
        /* SUBMIT BUTTON */
        .exp-submit-btn {
          background-color: #b59410; color: #ffffff; padding: 15px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; transition: background 0.2s ease; margin-top: 10px; width: 100%;
        }
        .exp-submit-btn.disabled { opacity: 0.7; cursor: not-allowed; }

        /* STAFF TABLE */
        .staff-add-form { padding: 16px; background-color: #f8fafc; border-radius: 12px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
        .staff-add-title { font-weight: bold; color: #1b4d3e; margin-bottom: 8px; font-size: 15px; }
        .staff-add-col { flex: 1 1 200px; }
        .staff-add-col-small { flex: 1 1 150px; }
        .staff-add-btn { background-color: #b59410; color: #ffffff; padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; height: 44px; }
        
        .staff-table-wrapper { overflow-x: auto; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .staff-table { width: 100%; border-collapse: collapse; text-align: left; min-width: 1050px; }
        .staff-thead { background-color: #f8fafc; border-bottom: 1px solid #cbd5e1; }
        .staff-th { padding: 12px; color: #475569; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .staff-tr { border-bottom: 1px solid #f1f5f9; background-color: #ffffff; transition: background 0.2s; }
        .staff-tr:hover { background-color: #f8fafc; }
        .staff-td { padding: 12px; font-size: 14px; color: #334155; }
        .staff-empty-cell { text-align: center; padding: 30px; color: #94a3b8; font-size: 14px; }
        
        .staff-inline-input { background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; color: #334155; outline: 2px solid #b58a3d; width: 100%; box-sizing: border-box; font-size: 14px; }
        .staff-days-worked { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .staff-debt-value { cursor: text; font-size: 14px; font-weight: bold; color: #ef4444; }
        
        .staff-action-select { background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; outline: none; width: 85px; padding: 6px; font-size: 13px; }
        .staff-action-input { background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; outline: none; box-sizing: border-box; flex: 1; padding: 6px; font-size: 13px; text-align: right; }
        .staff-action-add-btn { border: none; border-radius: 6px; font-size: 13px; transition: background 0.2s; font-weight: bold; background: #e2e8f0; color: #94a3b8; cursor: not-allowed; padding: 6px 12px; }
        .staff-action-add-btn.active { background: #10b981; color: #fff; cursor: pointer; }
        .staff-action-settle-btn { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: bold; }
        .staff-icon-btn { background: none; border: none; cursor: pointer; font-size: 16px; opacity: 0.7; }
        .staff-tip-text { font-size: 12px; color: #94a3b8; margin-top: 16px; text-align: center; }

        /* MODALS */
        .exp-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.5); z-index: 10000; display: flex; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; }
        .exp-modal-content { background-color: #ffffff; width: 100%; border-radius: 12px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
        .exp-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 16px; }
        .exp-modal-title { margin: 0; color: #1e293b; font-size: 18px; font-weight: bold; }
        .exp-modal-close-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #94a3b8; font-weight: bold; }
        .exp-modal-body { max-height: 400px; overflow-y: auto; padding-right: 8px; }
        .exp-modal-empty { text-align: center; color: #94a3b8; font-size: 14px; padding: 20px; }
        .exp-modal-footer { display: flex; justify-content: flex-end; margin-top: 20px; gap: 12px; }
        .exp-btn-cancel { padding: 12px 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; }
        .exp-btn-save { padding: 12px 16px; background: #10b981; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; }

        /* ORIGINAL BASE STYLES PRESERVED */
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }

        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

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

        input[type="number"].no-spinners::-webkit-inner-spin-button,
        input[type="number"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinners {
          -moz-appearance: textfield;
        }

        .content-card {
          background-color: #ffffff;
          width: 100%;
          border-radius: 16px;
          padding: 35px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-color: #e2e8f0;
          border-width: 1px;
          border-style: solid;
          transition: max-width 0.3s ease;
          box-sizing: border-box;
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