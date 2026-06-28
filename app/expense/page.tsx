'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

export default function ExpenseDashboard() {
  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<'personal' | 'business' | 'staff'>('personal')

  // --- Expense Form States ---
  const [expenseDate, setExpenseDate] = useState('')
  const [spender, setSpender] = useState<'Pich' | 'Jing' | 'Both'>('Pich')
  const [paymentMethod, setPaymentMethod] = useState<'QR Payment' | 'Cash'>('QR Payment')
  const [remarks, setRemarks] = useState('')
  const [amountUsd, setAmountUsd] = useState('')
  const [amountRiel, setAmountRiel] = useState('')
  const [loading, setLoading] = useState(false)

  // --- Staff Management States ---
  const [staffList, setStaffList] = useState<any[]>([])
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffSalary, setNewStaffSalary] = useState('')
  const [debtAdditions, setDebtAdditions] = useState<Record<number, string>>({})
  
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
    if (!amountUsd && !amountRiel) return alert('Please enter an amount in either USD ($) or Riel (៛)')

    setLoading(true)

    const finalAmountUsd = amountUsd ? Number(amountUsd) : 0
    const finalAmountRiel = amountRiel ? Number(amountRiel) : 0
    
    const { error } = await supabase.from('expenses').insert([
      {
        expense_date: expenseDate,
        spender: spender,
        payment_method: paymentMethod, // <-- Added here
        remarks: remarks,                     
        amount: finalAmountUsd,               
        amount_riel: finalAmountRiel,         
        description: activeTab.toUpperCase(), 
      },
    ])

    setLoading(false)

    if (error) {
      alert(`Error saving entry: ${error.message}`)
    } else {
      alert('Expense recorded successfully!')
      setRemarks('')
      setAmountUsd('')
      setAmountRiel('')
      setPaymentMethod('QR Payment') // Reset to default
    }
  }

  // --- Action: Add New Staff ---
  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!newStaffName) return alert('Staff name is required')

    setLoading(true)
    // Default to the 1st of the current month if not specified
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    const { error } = await supabase.from('staff').insert([
      { 
        name: newStaffName, 
        salary: Number(newStaffSalary) || 0, // Using Monthly Salary
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

    const newTotalDebt = Number(staff.total_debt || 0) + amountToAdd

    // Optimistic UI update
    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt: newTotalDebt } : s));
    setDebtAdditions(prev => ({ ...prev, [staff.id]: '' }))

    const { error } = await supabase.from('staff').update({ total_debt: newTotalDebt }).eq('id', staff.id)
    if (error) {
      alert(`Error updating debt: ${error.message}`)
      fetchStaff() // Revert on error
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
      finalValue = Number(editValue) || 0;
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
    today.setHours(0, 0, 0, 0); // Lock to midnight to avoid timezone shifts

    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    
    // If they started in a previous month, reset their start date to the 1st of THIS month
    let effectiveStartDate = startDate;
    if (startDate.getMonth() !== currentMonth || startDate.getFullYear() !== currentYear) {
      effectiveStartDate = new Date(currentYear, currentMonth, 1);
      effectiveStartDate.setHours(0, 0, 0, 0);
    }

    // Calculate difference in days (+1 to include today)
    const diffTime = today.getTime() - effectiveStartDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    
    return diffDays > 0 ? diffDays : 0;
  }

  return (
    <div style={styles.pageContainer}>
      <div style={{
        ...styles.card,
        maxWidth: activeTab === 'staff' ? '1000px' : '550px', // Wider for the big table
        transition: 'max-width 0.3s ease'
      }}>
        {/* HEADER BRANDING */}
        <div style={styles.brandHeader}>
          <h1 style={styles.mainTitle}>Daily Dashboard</h1>
          <p style={styles.subtitle}>Tracker, Ledger & Payroll Management</p>
        </div>

        {/* THREE TAB HEADER */}
        <div style={styles.tabContainer}>
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            style={{ ...styles.tabButton, ...(activeTab === 'personal' ? styles.activeTab : {}) }}
          >
            🏡 Personal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            style={{ ...styles.tabButton, ...(activeTab === 'business' ? styles.activeTab : {}) }}
          >
            🏢 Business
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            style={{ ...styles.tabButton, ...(activeTab === 'staff' ? styles.activeTab : {}) }}
          >
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

            <div style={styles.currencyRow}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Amount in Khmer Riel (៛)</label>
                <div style={styles.currencyWrapper}>
                  <span style={styles.currencyPrefix}>៛</span>
                  <input type="number" step="100" placeholder="0" value={amountRiel} onChange={(e) => setAmountRiel(e.target.value)} style={{ ...styles.inputField, paddingLeft: '30px' }} className="no-spinners" />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Amount in USD ($)</label>
                <div style={styles.currencyWrapper}>
                  <span style={styles.currencyPrefix}>$</span>
                  <input type="number" step="0.01" placeholder="0.00" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} style={{ ...styles.inputField, paddingLeft: '30px' }} className="no-spinners" />
                </div>
              </div>
            </div>

            {/* NEW: PAYMENT METHOD */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'QR Payment' | 'Cash')}
                style={{ ...styles.inputField, cursor: 'pointer' }}
                required
              >
                <option value="QR Payment">📱 QR Payment</option>
                <option value="Cash">💵 Cash</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Remarks</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} style={styles.inputField} required />
            </div>

            <button type="submit" disabled={loading} style={styles.submitButton}>
              {loading ? 'Processing Entry...' : `Securely Log ${activeTab === 'business' ? 'Business' : 'Personal'} Expense`}
            </button>
          </form>
        )}

        {/* STAFF MANAGEMENT UI (Shown only when Staff tab is active) */}
        {activeTab === 'staff' && (
          <div>
            {/* Add New Staff Form */}
            <form onSubmit={handleAddStaff} style={{ ...styles.form, padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 'bold', color: '#1b4d3e', marginBottom: '4px' }}>➕ Register New Staff</div>
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Name</label>
                  <input type="text" placeholder="Staff Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} style={styles.inputField} required />
                </div>
                <div style={{ flex: '1 1 150px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Monthly Salary (៛)</label>
                  <input type="number" placeholder="e.g. 1200000" value={newStaffSalary} onChange={e => setNewStaffSalary(e.target.value)} style={styles.inputField} className="no-spinners" required />
                </div>
                <button type="submit" disabled={loading} style={{ ...styles.submitButton, marginTop: 0, padding: '12px 24px', height: '45px' }}>Add Staff</button>
              </div>
            </form>

            {/* Editable Staff Payroll Table */}
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
                <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <tr>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>Start Date</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right' }}>Monthly Salary</th>
                    <th style={{ padding: '12px 16px', color: '#10b981', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right' }}>Earned MTD</th>
                    <th style={{ padding: '12px 16px', color: '#ef4444', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right' }}>Total Debt</th>
                    <th style={{ padding: '12px 16px', color: '#3b82f6', fontSize: '12px', textTransform: 'uppercase', textAlign: 'right' }}>Net Payout</th>
                    <th style={{ padding: '12px 16px', color: '#b59410', fontSize: '12px', textTransform: 'uppercase', textAlign: 'center', width: '180px' }}>➕ Add Debt</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', textAlign: 'center', width: '50px' }}>Del</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>No staff recorded yet.</td></tr>
                  ) : (
                    staffList.map((staff) => {
                      // Math Logic
                      const monthlySalary = Number(staff.salary) || 0;
                      const dailyRate = monthlySalary / 30; // Standard 30 day divisor
                      const daysWorked = calculateDaysWorked(staff.start_date);
                      const totalEarned = Math.round(dailyRate * daysWorked);
                      
                      const totalDebt = Number(staff.total_debt) || 0;
                      const netPayout = totalEarned - totalDebt;
                      const isNegativePayout = netPayout < 0;

                      return (
                        <tr key={staff.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff', transition: 'background 0.2s' }}>
                          
                          {/* 1. Name */}
                          <td 
                            style={{ padding: '12px 16px', fontWeight: 'bold', color: '#0f172a', cursor: 'text' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                              <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} style={styles.tableInput} />
                            ) : staff.name}
                          </td>

                          {/* 2. Start Date */}
                          <td 
                            style={{ padding: '12px 16px', color: '#475569', cursor: 'text', fontSize: '13px' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                              <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} style={styles.tableInput} />
                            ) : (
                              <div>
                                {staff.start_date || 'N/A'}
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{daysWorked} days</div>
                              </div>
                            )}
                          </td>

                          {/* 3. Monthly Salary */}
                          <td 
                            style={{ padding: '12px 16px', color: '#475569', cursor: 'text', textAlign: 'right' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'salary' }); setEditValue(String(staff.salary || 0)); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'salary' ? (
                              <input type="number" autoFocus className="no-spinners" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'salary')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'salary')} style={{...styles.tableInput, textAlign: 'right'}} />
                            ) : formatRiel(monthlySalary)}
                          </td>

                          {/* 4. Total Earned (Calculated MTD) */}
                          <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#10b981', textAlign: 'right' }}>
                            {formatRiel(totalEarned)}
                          </td>

                          {/* 5. Total Debt (Editable) */}
                          <td 
                            style={{ padding: '12px 16px', fontWeight: 'bold', color: '#ef4444', textAlign: 'right', cursor: 'text' }}
                            onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt' }); setEditValue(String(staff.total_debt || 0)); }}
                          >
                            {editingCell?.id === staff.id && editingCell?.field === 'total_debt' ? (
                              <input type="number" autoFocus className="no-spinners" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'total_debt')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'total_debt')} style={{...styles.tableInput, textAlign: 'right', color: '#ef4444', fontWeight: 'bold'}} />
                            ) : formatRiel(totalDebt)}
                          </td>

                          {/* 6. Net Payout (Calculated) */}
                          <td style={{ padding: '12px 16px', fontWeight: 'bold', color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontSize: '15px' }}>
                            {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                          </td>

                          {/* 7. Action: Add Debt */}
                          <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input 
                                type="number" 
                                placeholder="0 ៛" 
                                value={debtAdditions[staff.id] || ''} 
                                onChange={e => setDebtAdditions({ ...debtAdditions, [staff.id]: e.target.value })} 
                                onKeyDown={e => e.key === 'Enter' && handleAddDebt(staff)}
                                className="no-spinners"
                                style={{...styles.tableInput, flex: 1, padding: '6px 8px'}} 
                              />
                              <button 
                                onClick={() => handleAddDebt(staff)}
                                disabled={!debtAdditions[staff.id]}
                                style={{ ...styles.actionBtn, background: debtAdditions[staff.id] ? '#b59410' : '#e2e8f0', color: debtAdditions[staff.id] ? '#fff' : '#94a3b8', cursor: debtAdditions[staff.id] ? 'pointer' : 'not-allowed', padding: '6px 10px' }}
                              >
                                Add
                              </button>
                            </div>
                          </td>

                          {/* 8. Action: Delete */}
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button 
                              onClick={() => handleDeleteStaff(staff.id, staff.name)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.6, transition: 'opacity 0.2s' }}
                              title="Delete Staff"
                              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                            >
                              🗑️
                            </button>
                          </td>

                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>
              💡 <b>Tip:</b> Click on any Name, Start Date, Monthly Salary, or Total Debt to edit it directly.
            </p>
          </div>
        )}

      </div>

      {/* --- GLOBAL CSS --- */}
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

// --- CSS-IN-JS BRAND THEME STYLING ---
const styles = {
  pageContainer: {
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start', // Allows scrolling nicely if table gets long
    justifyContent: 'center',
    padding: '40px 20px 40px 65px', 
    fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02)',
    borderColor: '#e2e8f0',
    borderWidth: '1px',
    borderStyle: 'solid',
  },
  brandHeader: {
    textAlign: 'center' as const,
    marginBottom: '30px',
  },
  mainTitle: {
    color: '#b59410',
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: '0 0 4px 0',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '14px',
    margin: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: '6px',
    backgroundColor: '#f1f5f9',
    padding: '6px',
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
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    minWidth: '100px',
  },
  activeTab: {
    backgroundColor: '#1b4d3e',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(27,77,62,0.15)',
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
    color: '#b59410',
    fontSize: '13px',
    fontWeight: '600',
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
    color: '#0f172a',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.2s ease',
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
    color: '#0f172a',
    fontSize: '14px',
    outline: '2px solid #b58a3d',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  actionBtn: {
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    fontSize: '12px',
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
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },
  radioLabelActive: {
    borderColor: '#b59410',
    color: '#0f172a',
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
  currencyRow: {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap' as const,
  },
  currencyWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  currencyPrefix: {
    position: 'absolute' as const,
    left: '12px',
    color: '#b59410',
    fontWeight: '600',
    fontSize: '16px',
  },
  submitButton: {
    backgroundColor: '#b59410',
    color: '#ffffff',
    padding: '15px',
    borderWidth: '0px',             
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 6px 18px rgba(181,148,16,0.15)',
    marginTop: '10px',
  },
}