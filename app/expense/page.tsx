'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatRiel, formatUSD, EXCHANGE_RATE } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'
import Modal from '@/components/Modal'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'

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
  const [isFetchingStaff, setIsFetchingStaff] = useState(true)
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
    setIsFetchingStaff(true)
    const { data, error } = await supabase.from('staff').select('*').order('id', { ascending: true })
    if (data) setStaffList(data)
    setIsFetchingStaff(false)
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
          <h1 className="saas-page-title">💸 Daily Expense & Payroll</h1>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: activeTab === 'staff' ? '1200px' : '550px', margin: '0 auto' }}>
        
        {/* THREE TAB HEADER */}
        <div className="saas-tab-container" style={{ width: '100%', padding: '6px', background: '#fff', border: '1px solid #e2e8f0' }}>
          <button type="button" onClick={() => setActiveTab('personal')} className={`saas-tab ${activeTab === 'personal' ? 'active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
            🏡 Personal
          </button>
          <button type="button" onClick={() => setActiveTab('business')} className={`saas-tab ${activeTab === 'business' ? 'active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
            🏢 Business
          </button>
          <button type="button" onClick={() => setActiveTab('staff')} className={`saas-tab ${activeTab === 'staff' ? 'active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
            👥 Staff Payroll
          </button>
        </div>

        {/* EXPENSE TRANSACTION FORM (Shown for Personal & Business) */}
        {activeTab !== 'staff' && (
          <form onSubmit={handleSubmit} className="saas-card" style={{ padding: '30px' }}>
            
            <div style={{ marginBottom: '20px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Transaction Date</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required className="saas-input" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Who Paid? / Purchaser</label>
              <div className="saas-tab-container" style={{ margin: 0, padding: '4px', background: '#f1f5f9', border: 'none', boxShadow: 'none' }}>
                {(['Pich', 'Jing', 'Both'] as const).map(person => (
                  <button
                    type="button"
                    key={person}
                    onClick={() => setSpender(person)}
                    className={`saas-tab ${spender === person ? 'active' : ''}`}
                    style={spender === person ? { background: '#0f172a', color: '#fff', flex: 1 } : { flex: 1 }}
                  >
                    {person}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Remarks / What did you buy?</label>
              <input type="text" placeholder="Electricity Bill, Lunch..." value={remarks} onChange={(e) => setRemarks(e.target.value)} required className="saas-input" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} />
            </div>

            {/* DYNAMIC SPLIT PAYMENT METHOD FOR EXPENSES */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label className="saas-card-title" style={{ margin: 0 }}>Payment Split</label>
                <button type="button" onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} className="saas-btn saas-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                  + Add Split
                </button>
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
                    className="saas-input"
                    style={{ width: '45%', cursor: 'pointer' }}
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
                      className="saas-input"
                      style={{ textAlign: 'right' }}
                    />
                  </div>
                  
                  {paymentRows.length > 1 && (
                    <button type="button" onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '20px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <button 
              type="submit" 
              disabled={loading || !hasPayments} 
              className={`saas-btn ${loading || !hasPayments ? 'saas-btn-secondary' : 'saas-btn-primary'}`}
              style={{ width: '100%', marginTop: '24px', padding: '16px', fontSize: '16px', opacity: (loading || !hasPayments) ? 0.7 : 1 }}
            >
              {loading ? 'Processing...' : `Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
            </button>
          </form>
        )}

        {/* STAFF MANAGEMENT UI (Shown only when Staff tab is active) */}
        {activeTab === 'staff' && (
          <div>
            {/* Add New Staff Form */}
            <div className="saas-card" style={{ marginBottom: '24px', padding: '20px' }}>
              <div className="saas-card-title" style={{ marginBottom: '16px' }}>➕ Register New Staff</div>
              <form onSubmit={handleAddStaff} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Name</label>
                  <input type="text" placeholder="Staff Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} className="saas-input" onBlur={() => { setTimeout(() => { window.scrollTo(0, 0); document.body.scrollTop = 0; }, 100); }} required />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Monthly Salary (៛)</label>
                  <CurrencyInput value={newStaffSalary} onChange={(v: any) => setNewStaffSalary(v)} className="saas-input" placeholder="1,200,000" />
                </div>
                <button type="submit" disabled={loading} className="saas-btn saas-btn-primary" style={{ padding: '12px 24px' }}>Add Staff</button>
              </form>
            </div>

            {/* Editable Staff Payroll Table */}
            <div className="saas-table-wrapper">
              <div className="saas-table-responsive">
                <table className="saas-table" style={{ minWidth: '1050px' }}>
                  <thead>
                    <tr>
                      <th className="saas-th">Name</th>
                      <th className="saas-th">Start Date</th>
                      <th className="saas-th" style={{ textAlign: 'right' }}>Monthly Salary</th>
                      <th className="saas-th" style={{ textAlign: 'right', color: '#10b981' }}>Earned MTD</th>
                      <th className="saas-th" style={{ textAlign: 'right', color: '#ef4444' }}>Debt (៛)</th>
                      <th className="saas-th" style={{ textAlign: 'right', color: '#ef4444' }}>Debt ($)</th>
                      <th className="saas-th" style={{ textAlign: 'right', color: '#3b82f6' }}>Net Payout</th>
                      <th className="saas-th" style={{ textAlign: 'center', color: '#b58a3d', width: '280px' }}>➕ Add Advance</th>
                      <th className="saas-th" style={{ textAlign: 'center', width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isFetchingStaff ? (
                      <TableSkeleton columns={9} rows={3} />
                    ) : staffList.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <EmptyState 
                            icon="👥" 
                            title="No staff found" 
                            message="Register your first staff member above." 
                          />
                        </td>
                      </tr>
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
                          <tr key={staff.id} className="saas-tr">
                            
                            {/* 1. Name */}
                            <td 
                              className="saas-td"
                              style={{ cursor: 'text', fontWeight: 'bold' }}
                              onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}
                            >
                              {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} className="saas-input" />
                              ) : staff.name}
                            </td>

                            {/* 2. Start Date */}
                            <td 
                              className="saas-td"
                              style={{ cursor: 'text' }}
                              onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}
                            >
                              {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                                <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} className="saas-input" />
                              ) : (
                                <div>
                                  {staff.start_date || 'N/A'}
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 'bold' }}>{daysWorked} days</div>
                                </div>
                              )}
                            </td>

                            {/* 3. Monthly Salary */}
                            <td 
                              className="saas-td"
                              style={{ cursor: 'text', textAlign: 'right' }}
                              onClick={() => { setEditingCell({ id: staff.id, field: 'salary' }); setEditValue(String(staff.salary || 0)); }}
                            >
                              {editingCell?.id === staff.id && editingCell?.field === 'salary' ? (
                                <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'salary')} className="saas-input" style={{ textAlign: 'right' }} />
                              ) : formatRiel(monthlySalary)}
                            </td>

                            {/* 4. Total Earned */}
                            <td className="saas-td" style={{ color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>
                              {formatRiel(totalEarned)}
                            </td>

                            {/* 5. Total Debt RIEL */}
                            <td className="saas-td" style={{ textAlign: 'right' }}>
                               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <div 
                                      style={{ cursor: 'text', fontWeight: 'bold', color: '#ef4444' }}
                                      onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_riel' }); setEditValue(String(staff.total_debt_riel || 0)); }}
                                  >
                                    {editingCell?.id === staff.id && editingCell?.field === 'total_debt_riel' ? (
                                      <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_riel')} className="saas-input" style={{ textAlign: 'right', color: '#ef4444', width: '100px' }} />
                                    ) : formatRiel(totalDebtRiel)}
                                  </div>
                               </div>
                            </td>

                            {/* 6. Total Debt USD */}
                            <td className="saas-td" style={{ textAlign: 'right' }}>
                               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <div 
                                      style={{ cursor: 'text', fontWeight: 'bold', color: '#ef4444' }}
                                      onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_usd' }); setEditValue(String(staff.total_debt_usd || 0)); }}
                                  >
                                    {editingCell?.id === staff.id && editingCell?.field === 'total_debt_usd' ? (
                                      <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_usd')} className="saas-input" style={{ textAlign: 'right', color: '#ef4444', width: '80px' }} />
                                    ) : formatUSD(totalDebtUsd)}
                                  </div>
                               </div>
                            </td>

                            {/* 7. Net Payout */}
                            <td className="saas-td" style={{ color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}>
                              {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                            </td>

                            {/* 8. Action: Add Debt & Method */}
                            <td className="saas-td" style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <select 
                                    value={debtMethods[staff.id] || 'Cash ៛'} 
                                    onChange={e => setDebtMethods({ ...debtMethods, [staff.id]: e.target.value })}
                                    className="saas-input"
                                    style={{ width: '85px', padding: '6px' }}
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
                                    className="saas-input"
                                    style={{ flex: 1, padding: '6px', textAlign: 'right' }}
                                  />
                                  <button 
                                    onClick={() => handleAddDebt(staff)}
                                    disabled={!debtAdditions[staff.id]}
                                    className={`saas-btn ${debtAdditions[staff.id] ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
                                    style={{ padding: '6px 12px' }}
                                  >
                                    Add
                                  </button>
                                </div>
                                
                                {/* Settle Action Buttons Directly Below */}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                  {(totalDebtRiel > 0 || totalDebtUsd > 0) && (
                                    <button 
                                      onClick={() => setSettleModal({ isOpen: true, staff: staff, amount: '', method: 'Cash ៛' })}
                                      className="saas-btn"
                                      style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      ✅ Settle
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 9. Actions: History & Delete */}
                            <td className="saas-td" style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                <button onClick={() => handleViewHistory(staff)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="View Debt History">🕒</button>
                                <button onClick={() => handleDeleteStaff(staff.id, staff.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }} title="Delete Staff">🗑️</button>
                              </div>
                            </td>

                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {staffList.length > 0 && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  💡 <b>Tip:</b> Click on any Name, Start Date, Monthly Salary, or Debt to edit it directly. Press Enter to save.
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* STAFF DEBT HISTORY MODAL */}
      <Modal isOpen={historyModal.isOpen} onClose={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} title={`Debt History: ${historyModal.staff?.name}`} icon="🕒" maxWidth="500px">
        {historyModal.history.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '20px' }}>No debt history found.</p>
        ) : (
          <table className="saas-table" style={{ minWidth: '100%', marginBottom: '20px' }}>
            <thead>
              <tr>
                <th className="saas-th" style={{ padding: '8px', fontSize: '11px' }}>Date</th>
                <th className="saas-th" style={{ padding: '8px', fontSize: '11px' }}>Action Type</th>
                <th className="saas-th" style={{ padding: '8px', fontSize: '11px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {historyModal.history.map((record) => (
                <tr key={record.id} className="saas-tr">
                  <td className="saas-td" style={{ padding: '10px 8px', fontSize: '13px' }}>{new Date(record.created_at).toLocaleDateString()}</td>
                  <td className="saas-td" style={{ padding: '10px 8px', fontSize: '13px' }}>{record.payment_method}</td>
                  <td className="saas-td" style={{ padding: '10px 8px', fontSize: '13px', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>
                    {record.payment_method.includes('$') ? formatUSD(record.amount) : formatRiel(record.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setHistoryModal({ isOpen: false, staff: null, history: [] })} className="saas-btn saas-btn-secondary">Close</button>
        </div>
      </Modal>

      {/* STAFF SETTLEMENT MODAL */}
      <Modal isOpen={settleModal.isOpen} onClose={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })} title={`Settle Debt: ${settleModal.staff?.name}`} icon="✅" maxWidth="400px">
        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Current Debt (៛): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatRiel(settleModal.staff?.total_debt_riel || 0)}</b></div>
        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Current Debt ($): <b style={{ color: '#ef4444', fontSize: '16px' }}>{formatUSD(settleModal.staff?.total_debt_usd || 0)}</b></div>

        <div style={{ marginBottom: '16px' }}>
          <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Settlement Amount</label>
          <CurrencyInput autoFocus value={settleModal.amount} onChange={(v:any) => setSettleModal({...settleModal, amount: v})} className="saas-input" />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>Payment Received Into</label>
          <select value={settleModal.method} onChange={e => setSettleModal({...settleModal, method: e.target.value})} className="saas-input" style={{ cursor: 'pointer' }}>
            <option value="Cash ៛">💵 Cash ៛</option>
            <option value="Cash $">💵 Cash $</option>
            <option value="QR ៛">📱 QR ៛</option>
            <option value="QR $">📱 QR $</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={() => setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' })} className="saas-btn saas-btn-secondary">Cancel</button>
          <button onClick={handleSettleSubmit} className="saas-btn saas-btn-primary">Confirm Settlement</button>
        </div>
      </Modal>

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }

        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

        .header-container { 
          width: calc(100% - 60px);
          max-width: 1600px;
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; /* Clears the burger menu icon for horizontal alignment */
          gap: 12px;
          min-height: 42px; 
        }

        .header-left {
          display: flex;
          align-items: center; 
          gap: 12px;
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }

        /* 🔥 MOBILE CSS OVERRIDES */
        @media (max-width: 1023px) { 
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
        }
      `}</style>
    </div>
  )
}