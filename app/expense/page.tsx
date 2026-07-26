'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatRiel, formatUSD, EXCHANGE_RATE } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'
import Modal from '@/components/Modal'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'

// --- Interfaces ---
interface PaymentSplit {
  id: number;
  method: string;
  amount: number | '';
}

interface PendingExpense {
  id: string;
  remarks: string;
  spender: 'Pich' | 'Jing' | 'Both';
  payments: PaymentSplit[];
}

export default function ExpenseDashboard() {
  const { showToast } = useToast();
  const [isMounted, setIsMounted] = useState(false);

  // --- Active Tab State ---
  const [activeTab, setActiveTab] = useState<'personal' | 'business' | 'staff' | 'database'>('personal')

  // --- Expense Ledger States (Auto-saved) ---
  const [expenseDate, setExpenseDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState(false)

  const createNewExpense = (): PendingExpense => ({
    id: Date.now().toString() + Math.random().toString().slice(2, 6),
    remarks: '',
    spender: 'Pich',
    payments: [{ id: Date.now(), method: 'Cash ៛', amount: '' }]
  });

  const [pendingPersonal, setPendingPersonal] = useState<PendingExpense[]>([])
  const [pendingBusiness, setPendingBusiness] = useState<PendingExpense[]>([])

  // --- Staff Management States ---
  const [staffList, setStaffList] = useState<any[]>([])
  const [isFetchingStaff, setIsFetchingStaff] = useState(true)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffSalary, setNewStaffSalary] = useState<number | ''>('')
  
  const [debtAdditions, setDebtAdditions] = useState<Record<number, number | ''>>({})
  const [debtMethods, setDebtMethods] = useState<Record<number, string>>({})
  
  const [historyModal, setHistoryModal] = useState<{ isOpen: boolean, staff: any, history: any[] }>({
    isOpen: false, staff: null, history: []
  })

  const [settleModal, setSettleModal] = useState<{ isOpen: boolean, staff: any, amount: number | '', method: string }>({
    isOpen: false, staff: null, amount: '', method: 'Cash ៛'
  })

  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  // --- Database Tab States ---
  const [dbExpenses, setDbExpenses] = useState<any[]>([])
  const [dbStaffDebt, setDbStaffDebt] = useState<any[]>([])
  
  // 🔥 Set 'insight' as the default active tab, and put it first in the array
  const [dbTab, setDbTab] = useState<'personal' | 'business' | 'staff_debt' | 'insight'>('insight')
  const [dbTabOrder, setDbTabOrder] = useState(['insight', 'personal', 'business', 'staff_debt'])
  
  const [dbSortConfig, setDbSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null)
  const [isFetchingDb, setIsFetchingDb] = useState(false)

  // Insights State
  const [insightFilter, setInsightFilter] = useState<'today'|'week'|'month'|'custom'>('month')
  const [insightFrom, setInsightFrom] = useState('')
  const [insightTo, setInsightTo] = useState('')

  // --- Initialization & Local Storage Sync ---
  useEffect(() => {
    setIsMounted(true);
    const today = new Date().toISOString().split('T')[0]
    setExpenseDate(today)
    setInsightFrom(today)
    setInsightTo(today)
    fetchStaff()
    fetchDatabase()

    const savedPers = localStorage.getItem('expense_ledger_personal');
    const savedBiz = localStorage.getItem('expense_ledger_business');
    const savedDbTabOrder = localStorage.getItem('expense_db_tab_order');
    
    if (savedPers) setPendingPersonal(JSON.parse(savedPers));
    else setPendingPersonal([createNewExpense()]);
    
    if (savedBiz) setPendingBusiness(JSON.parse(savedBiz));
    else setPendingBusiness([createNewExpense()]);

    if (savedDbTabOrder) {
      try { setDbTabOrder(JSON.parse(savedDbTabOrder)); } catch(e){}
    }
  }, [])

  useEffect(() => {
    if (isMounted) localStorage.setItem('expense_ledger_personal', JSON.stringify(pendingPersonal));
  }, [pendingPersonal, isMounted])

  useEffect(() => {
    if (isMounted) localStorage.setItem('expense_ledger_business', JSON.stringify(pendingBusiness));
  }, [pendingBusiness, isMounted])

  useEffect(() => {
    if (isMounted) localStorage.setItem('expense_db_tab_order', JSON.stringify(dbTabOrder));
  }, [dbTabOrder, isMounted])


  // --- Helper: Dynamic Ledger Handlers ---
  const getActiveList = () => activeTab === 'personal' ? pendingPersonal : pendingBusiness;
  const setActiveList = (newList: PendingExpense[]) => activeTab === 'personal' ? setPendingPersonal(newList) : setPendingBusiness(newList);

  const updateExpense = (id: string, field: keyof PendingExpense, value: any) => {
    setActiveList(getActiveList().map(exp => exp.id === id ? { ...exp, [field]: value } : exp));
  }

  // Prepend new payment split so it appears at top
  const addPaymentSplit = (expId: string) => {
    setActiveList(getActiveList().map(exp => {
      if (exp.id === expId) {
        return { ...exp, payments: [{ id: Date.now(), method: 'Cash ៛', amount: '' }, ...exp.payments] }
      }
      return exp;
    }));
  }

  const updatePaymentSplit = (expId: string, payId: number, field: string, value: any) => {
    setActiveList(getActiveList().map(exp => {
      if (exp.id === expId) {
        return {
          ...exp,
          payments: exp.payments.map(p => p.id === payId ? { ...p, [field]: value } : p)
        }
      }
      return exp;
    }));
  }

  const removePaymentSplit = (expId: string, payId: number) => {
    setActiveList(getActiveList().map(exp => {
      if (exp.id === expId) {
        return { ...exp, payments: exp.payments.filter(p => p.id !== payId) }
      }
      return exp;
    }));
  }

  const removeExpense = (id: string) => {
    setActiveList(getActiveList().filter(exp => exp.id !== id));
  }

  // Prepend new expense so it appears at top
  const addNewExpense = () => {
    setActiveList([createNewExpense(), ...getActiveList()]);
  }

  // --- API: Fetch Staff ---
  async function fetchStaff() {
    setIsFetchingStaff(true)
    const { data, error } = await supabase.from('staff').select('*').order('id', { ascending: true })
    if (data) setStaffList(data)
    setIsFetchingStaff(false)
  }

  // --- API: Fetch Database Tab ---
  async function fetchDatabase() {
    setIsFetchingDb(true)
    const [ {data: exp}, {data: debt} ] = await Promise.all([
       supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(2000),
       supabase.from('staff_debt_history').select('*, staff:staff_id(name)').order('created_at', { ascending: false }).limit(2000)
    ])
    setDbExpenses(exp || []);
    setDbStaffDebt(debt || []);
    setIsFetchingDb(false)
  }

  // --- Action: Submit Bulk Expenses ---
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setConfirmModal(false)

    const list = getActiveList();
    const validExpenses = list.filter(exp => exp.remarks.trim() !== '' && exp.payments.some(p => Number(p.amount) > 0));

    if (validExpenses.length === 0) {
      showToast('error', 'Missing Info', 'Please add at least one valid expense with remarks and a payment amount.');
      return;
    }

    setLoading(true)

    try {
      const payloadArray = validExpenses.map(exp => {
        const activePayments = exp.payments.filter(r => (Number(r.amount) || 0) > 0);
        
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

        return {
          expense_date: expenseDate,
          spender: exp.spender,
          payment_method: combinedMethod,
          remarks: exp.remarks,                     
          amount_usd: totalUsd,              
          amount_riel: totalRiel,         
          description: activeTab.toUpperCase(), 
        };
      });

      const { error } = await supabase.from('expenses').insert(payloadArray.reverse()); 

      if (error) throw error;

      showToast('success', 'Success', `${validExpenses.length} expense(s) recorded successfully!`);
      setActiveList([createNewExpense()]);
      fetchDatabase(); 

    } catch (err: any) {
      showToast('error', 'Save Failed', `Error saving entry: ${err.message}`);
    } finally {
      setLoading(false)
    }
  }

  // --- Staff Methods ---
  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!newStaffName) { showToast('error', 'Validation Error', 'Staff name is required'); return; }
    setLoading(true)
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const { error } = await supabase.from('staff').insert([{ name: newStaffName, salary: Number(newStaffSalary) || 0, total_debt_riel: 0, total_debt_usd: 0, start_date: firstOfMonth }])
    setLoading(false)
    if (error) { showToast('error', 'Error', `Error adding staff: ${error.message}`); } else {
      showToast('success', 'Staff Added', `${newStaffName} has been registered.`);
      setNewStaffName(''); setNewStaffSalary(''); fetchStaff();
    }
  }

  async function handleAddDebt(staff: any) {
    const rawAmount = Number(debtAdditions[staff.id])
    if (!rawAmount || rawAmount === 0) return
    const method = debtMethods[staff.id] || 'Cash ៛'
    let saveRiel = 0, saveUsd = 0;
    let newTotalRiel = Number(staff.total_debt_riel || 0); let newTotalUsd = Number(staff.total_debt_usd || 0);

    if (method.includes('$')) { saveUsd = rawAmount; newTotalUsd += rawAmount; } else { saveRiel = rawAmount; newTotalRiel += rawAmount; }

    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd } : s));
    setDebtAdditions(prev => ({ ...prev, [staff.id]: '' }))

    const { error: staffErr } = await supabase.from('staff').update({ total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd }).eq('id', staff.id)
    if (staffErr) { showToast('error', 'Update Failed', `Error updating debt: ${staffErr.message}`); fetchStaff(); return; }

    await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: rawAmount, payment_method: method }])
    await supabase.from('expenses').insert([{ expense_date: new Date().toISOString().split('T')[0], spender: 'Both', payment_method: method, remarks: `Staff Advance: ${staff.name}`, amount_usd: saveUsd, amount_riel: saveRiel, description: 'STAFF_ADVANCE' }])
    showToast('success', 'Advance Added', `Advance added for ${staff.name}`);
    fetchDatabase();
  }

  async function handleSettleSubmit() {
    const staff = settleModal.staff;
    const rawAmount = Number(settleModal.amount);
    if (!rawAmount || rawAmount <= 0) { showToast('error', 'Invalid Amount', 'Enter a valid settlement amount.'); return; }
    
    let saveRiel = 0, saveUsd = 0;
    let newTotalRiel = Number(staff.total_debt_riel || 0); let newTotalUsd = Number(staff.total_debt_usd || 0);

    if (settleModal.method.includes('$')) {
      if (rawAmount > newTotalUsd) { showToast('error', 'Overpayment', 'Cannot settle more USD than they owe.'); return; }
      saveUsd = -Math.abs(rawAmount); newTotalUsd -= rawAmount;
    } else {
      if (rawAmount > newTotalRiel) { showToast('error', 'Overpayment', 'Cannot settle more Riel than they owe.'); return; }
      saveRiel = -Math.abs(rawAmount); newTotalRiel -= rawAmount;
    }

    setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd } : s));
    setSettleModal({ isOpen: false, staff: null, amount: '', method: 'Cash ៛' });

    await supabase.from('staff').update({ total_debt_riel: newTotalRiel, total_debt_usd: newTotalUsd }).eq('id', staff.id);
    await supabase.from('staff_debt_history').insert([{ staff_id: staff.id, amount: rawAmount, payment_method: `Settled: ${settleModal.method}` }]);
    await supabase.from('expenses').insert([{ expense_date: new Date().toISOString().split('T')[0], spender: 'Both', payment_method: settleModal.method, remarks: `Staff Debt Settlement: ${staff.name}`, amount_usd: saveUsd, amount_riel: saveRiel, description: 'STAFF_SETTLEMENT' }]);
    
    showToast('success', 'Settled', `Settlement recorded for ${staff.name}`);
    fetchDatabase();
  }

  async function handleViewHistory(staff: any) {
    const { data, error } = await supabase.from('staff_debt_history').select('*').eq('staff_id', staff.id).order('created_at', { ascending: false })
    if (!error) setHistoryModal({ isOpen: true, staff: staff, history: data || [] })
  }

  async function saveInlineEdit(id: number, field: string) {
    if (!editValue && editValue !== '0' && field !== 'name') { setEditingCell(null); return; }
    let finalValue: any = editValue;
    if (field === 'salary' || field === 'total_debt_riel' || field === 'total_debt_usd') { finalValue = Number(editValue.replace(/,/g, '')) || 0; }
    const staff = staffList.find(s => s.id === id);
    setStaffList(prev => prev.map(s => s.id === id ? { ...s, [field]: finalValue } : s));
    setEditingCell(null);

    const { error } = await supabase.from('staff').update({ [field]: finalValue }).eq('id', id);
    if (!error && (field === 'total_debt_riel' || field === 'total_debt_usd') && staff) {
        const difference = finalValue - (Number(staff[field]) || 0);
        if (difference !== 0) {
            await supabase.from('staff_debt_history').insert([{ staff_id: id, amount: Math.abs(difference), payment_method: difference > 0 ? `Manual Increase ${field.includes('usd') ? '$' : '៛'}` : `Manual Reduction ${field.includes('usd') ? '$' : '៛'}` }]);
            fetchDatabase();
        }
    }
    if (error) { showToast('error', 'Update Failed', error.message); fetchStaff(); }
  }

  async function handleDeleteStaff(id: number, name: string) {
    if (!confirm(`Are you sure you want to remove ${name} from the payroll?`)) return;
    setStaffList(prev => prev.filter(s => s.id !== id));
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) { showToast('error', 'Deletion Failed', error.message); fetchStaff(); } else showToast('success', 'Deleted', `${name} has been removed.`);
  }

  function calculateDaysWorked(startDateStr: string) {
    if (!startDateStr) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0); 
    const currentMonth = today.getMonth(); const currentYear = today.getFullYear();
    const startDate = new Date(startDateStr); startDate.setHours(0, 0, 0, 0);
    let effectiveStartDate = startDate;
    if (startDate.getMonth() !== currentMonth || startDate.getFullYear() !== currentYear) {
      effectiveStartDate = new Date(currentYear, currentMonth, 1); effectiveStartDate.setHours(0, 0, 0, 0);
    }
    const diffTime = today.getTime() - effectiveStartDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    return diffDays > 0 ? diffDays : 0;
  }

  // --- Database Tab Sorting & Filtering ---
  const filteredAndSortedDb = useMemo(() => {
    let baseData: any[] = [];
    if (dbTab === 'staff_debt') baseData = dbStaffDebt;
    else if (dbTab === 'insight') return []; // Insight uses its own rendering
    else baseData = dbExpenses.filter(e => e.description === dbTab.toUpperCase());

    if (!dbSortConfig) return baseData;

    return [...baseData].sort((a, b) => {
        const { key, direction } = dbSortConfig;
        let valA = a[key], valB = b[key];
        
        if (key === 'staff_name') { valA = a.staff?.name || ''; valB = b.staff?.name || ''; }
        if (key === 'expense_date') { valA = new Date(a.expense_date || a.created_at).getTime(); valB = new Date(b.expense_date || b.created_at).getTime(); }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [dbTab, dbExpenses, dbStaffDebt, dbSortConfig]);

  // --- Insights Calculation Logic ---
  const insightsData = useMemo(() => {
    if (dbTab !== 'insight') return null;

    const filterDate = (dateStr: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr); d.setHours(0,0,0,0);
      const today = new Date(); today.setHours(0,0,0,0);
      
      if (insightFilter === 'today') return d.getTime() === today.getTime();
      if (insightFilter === 'week') {
        const lw = new Date(today); lw.setDate(lw.getDate() - 7);
        return d >= lw && d <= today;
      }
      if (insightFilter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      if (insightFilter === 'custom') {
        const f = new Date(insightFrom); f.setHours(0,0,0,0);
        const t = new Date(insightTo); t.setHours(23,59,59,999);
        return d >= f && d <= t;
      }
      return true;
    };

    const validExp = dbExpenses.filter(e => filterDate(e.expense_date || e.created_at));
    const validDebt = dbStaffDebt.filter(d => filterDate(d.created_at));

    let totalPersRiel = 0, totalPersUsd = 0;
    let totalBizRiel = 0, totalBizUsd = 0;
    let totalDebtRiel = 0, totalDebtUsd = 0;

    validExp.forEach(e => {
      const amtRiel = Number(e.amount_riel) || 0;
      const amtUsd = Number(e.amount_usd) || 0;
      
      if (e.description === 'PERSONAL') {
        totalPersRiel += amtRiel;
        totalPersUsd += amtUsd;
      }
      if (e.description === 'BUSINESS') {
        totalBizRiel += amtRiel;
        totalBizUsd += amtUsd;
      }
    });

    validDebt.forEach(d => {
      let amt = Number(d.amount);
      if (!(d.payment_method || '').includes('Settled')) {
        if ((d.payment_method || '').includes('$')) totalDebtUsd += amt;
        else totalDebtRiel += amt;
      }
    });

    const totalExpRiel = totalPersRiel + totalBizRiel;
    const totalExpUsd = totalPersUsd + totalBizUsd;

    const topPers = validExp.filter(e => e.description === 'PERSONAL').sort((a,b) => ((Number(b.amount_riel)||0) + (Number(b.amount_usd)||0)*EXCHANGE_RATE) - ((Number(a.amount_riel)||0) + (Number(a.amount_usd)||0)*EXCHANGE_RATE)).slice(0, 5);
    const topBiz = validExp.filter(e => e.description === 'BUSINESS').sort((a,b) => ((Number(b.amount_riel)||0) + (Number(b.amount_usd)||0)*EXCHANGE_RATE) - ((Number(a.amount_riel)||0) + (Number(a.amount_usd)||0)*EXCHANGE_RATE)).slice(0, 5);

    // Chart Data (31 days)
    const thisMonthData = new Array(31).fill(0);
    const lastMonthData = new Array(31).fill(0);

    const isThisMonth = (dateStr: string) => {
       const d = new Date(dateStr); const now = new Date();
       return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    const isLastMonth = (dateStr: string) => {
       const d = new Date(dateStr); const now = new Date();
       const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
       return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }

    dbExpenses.forEach(e => {
       if (e.description !== 'PERSONAL' && e.description !== 'BUSINESS') return;
       const d = new Date(e.expense_date || e.created_at);
       const dayIdx = d.getDate() - 1;
       const amt = Number(e.amount_riel) + (Number(e.amount_usd) * EXCHANGE_RATE);
       
       if (isThisMonth(e.expense_date || e.created_at) && dayIdx >= 0 && dayIdx < 31) {
          thisMonthData[dayIdx] += amt;
       } else if (isLastMonth(e.expense_date || e.created_at) && dayIdx >= 0 && dayIdx < 31) {
          lastMonthData[dayIdx] += amt;
       }
    });

    return { totalPersRiel, totalPersUsd, totalBizRiel, totalBizUsd, totalExpRiel, totalExpUsd, totalDebtRiel, totalDebtUsd, topPers, topBiz, thisMonthData, lastMonthData };
  }, [dbTab, dbExpenses, dbStaffDebt, insightFilter, insightFrom, insightTo]);


  if (!isMounted) return null; 

  return (
    <div className="main-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', backgroundColor: '#f8fafc' }}>

      {/* 🔥 STICKY FROZEN HEADER & TABS */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#f8fafc', flexShrink: 0, width: '100%', paddingBottom: '16px' }}>
        <div className="header-container" style={{ margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', minHeight: '48px' }}>
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <h1 className="saas-page-title" style={{ margin: 0, padding: 0, display: 'flex', alignItems: 'center' }}>💸 Daily Expense & Payroll</h1>
          </div>
        </div>

        <div className="content-container">
          {/* Clean White Flex Container for Tabs with Border */}
          <div className="hide-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px' }}>
            <button type="button" onClick={() => setActiveTab('personal')} className={`saas-tab ${activeTab === 'personal' ? 'active' : ''}`} style={{ flexShrink: 0, padding: '10px 24px' }}>
              🏡 Personal
            </button>
            <button type="button" onClick={() => setActiveTab('business')} className={`saas-tab ${activeTab === 'business' ? 'active' : ''}`} style={{ flexShrink: 0, padding: '10px 24px' }}>
              🏢 Business
            </button>
            <button type="button" onClick={() => setActiveTab('staff')} className={`saas-tab ${activeTab === 'staff' ? 'active' : ''}`} style={{ flexShrink: 0, padding: '10px 24px' }}>
              👥 Staff Payroll
            </button>
            <button type="button" onClick={() => setActiveTab('database')} className={`saas-tab ${activeTab === 'database' ? 'active' : ''}`} style={activeTab === 'database' ? { background: '#10b981', color: '#fff', flexShrink: 0, padding: '10px 24px' } : { flexShrink: 0, padding: '10px 24px' }}>
              🗄️ Expense Database
            </button>
          </div>
        </div>
      </div>

      {/* SCROLLING CONTENT AREA */}
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: '60px', paddingTop: '8px' }}>
        <div className="content-container">

          {/* --- DYNAMIC EXPENSE LEDGER (Personal & Business) --- */}
          {(activeTab === 'personal' || activeTab === 'business') && (
            <form onSubmit={handleSubmit} className="saas-card" style={{ padding: '30px', margin: 0, width: '100%' }}>
              
              {/* Top Action Row (Date, Add, Submit) */}
              <div className="top-action-row" style={{ marginBottom: '32px' }}>
                <div className="date-wrapper">
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>Date</label>
                  <input 
                    type="date" 
                    value={expenseDate} 
                    onChange={(e) => setExpenseDate(e.target.value)} 
                    required 
                    className="saas-input" 
                    style={{ width: '100%', margin: 0, height: '42px', boxSizing: 'border-box' }} 
                  />
                </div>
                
                <div className="button-wrapper">
                  <button 
                    type="button" 
                    onClick={addNewExpense}
                    className="saas-btn" 
                    style={{ padding: '0 16px', fontWeight: 'bold', whiteSpace: 'nowrap', margin: 0, height: '42px', background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd', borderRadius: '8px' }}
                  >
                    + Add
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setConfirmModal(true)}
                    disabled={loading} 
                    className={`saas-btn ${loading ? 'saas-btn-secondary' : 'saas-btn-primary'}`}
                    style={{ padding: '0 24px', fontWeight: 'bold', whiteSpace: 'nowrap', margin: 0, height: '42px', opacity: loading ? 0.7 : 1, borderRadius: '8px' }}
                  >
                    <span className="hide-on-mobile">{loading ? 'Processing...' : `Submit ${getActiveList().length} Expense(s)`}</span>
                    <span className="show-on-mobile">Submit</span>
                  </button>
                </div>
              </div>

              {/* List of Pending Expenses */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {getActiveList().map((exp, index) => (
                  <div key={exp.id} className="expense-entry-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', position: 'relative', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)' }}>
                    
                    {/* 🔥 3-COLUMN GRID SETUP */}
                    <div className="expense-grid">

                      {/* Col 1: Remarks (Desktop: Boxed Label, Mobile: Inline Underline) */}
                      <>
                        {/* Desktop Remarks */}
                        <div className="expense-col desktop-only-flex" style={{ flexDirection: 'column', gap: '8px' }}>
                          <label style={{ height: '16px', lineHeight: '16px', fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>Remarks</label>
                          <input 
                            type="text" 
                            placeholder="Remarks"
                            value={exp.remarks} 
                            onChange={(e) => updateExpense(exp.id, 'remarks', e.target.value)} 
                            required 
                            className="saas-input" 
                            style={{ width: '100%', height: '42px', margin: 0, boxSizing: 'border-box' }}
                          />
                        </div>

                        {/* Mobile Remarks */}
                        <div className="expense-col mobile-only-flex" style={{ flexDirection: 'column', justifyContent: 'flex-end', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px' }}>
                            <span style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '16px', marginRight: '8px' }}>
                              {getActiveList().length - index}.
                            </span>
                            <input 
                              type="text" 
                              placeholder="Remarks"
                              value={exp.remarks} 
                              onChange={(e) => updateExpense(exp.id, 'remarks', e.target.value)} 
                              required 
                              style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '16px', color: '#0f172a' }}
                            />
                            {/* 🔥 Mobile Red X aligned middle with remark row */}
                            {getActiveList().length > 1 && (
                              <button type="button" onClick={() => removeExpense(exp.id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', fontWeight: 'bold', padding: '0 0 0 12px', lineHeight: 1 }} title="Remove">
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </>

                      {/* Col 2: Spender (Refined Light Colors, Rounded Pill) */}
                      <div className="expense-col" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ height: '16px', lineHeight: '16px', fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>Spender</label>
                        <div className="saas-tab-container" style={{ margin: 0, padding: 0, background: '#f1f5f9', border: 'none', boxShadow: 'none', height: '42px', display: 'flex', boxSizing: 'border-box', borderRadius: '8px', overflow: 'hidden' }}>
                          {(['Pich', 'Jing', 'Both'] as const).map(person => (
                            <button
                              type="button"
                              key={person}
                              onClick={() => updateExpense(exp.id, 'spender', person)}
                              style={exp.spender === person ? { background: '#e0f2fe', color: '#0284c7', fontWeight: 'bold', flex: 1, padding: 0, borderRadius: 0, border: 'none', height: '100%', fontSize: '14px', cursor: 'pointer' } : { flex: 1, padding: 0, fontWeight: '500', color: '#94a3b8', background: 'transparent', border: 'none', height: '100%', fontSize: '14px', cursor: 'pointer' }}
                            >
                              {person}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Col 3: Payments */}
                      <div className="expense-col" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ height: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          
                          {/* 🔥 Left Side: Label and + Split button tightly grouped */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ lineHeight: '16px', fontSize: '11px', color: '#64748b', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>Payment Method(s)</label>
                            <button type="button" onClick={() => addPaymentSplit(exp.id)} className="saas-btn" style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', padding: '0 8px', fontSize: '11px', fontWeight: 'bold', height: '20px', display: 'flex', alignItems: 'center', borderRadius: '4px' }}>
                              + Split
                            </button>
                          </div>

                          {/* 🔥 Right Side: Desktop Red X moved to far right where Split used to be */}
                          {getActiveList().length > 1 && (
                            <button type="button" onClick={() => removeExpense(exp.id)} className="desktop-only-flex" style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold', padding: 0, lineHeight: 1 }} title="Remove Expense">
                              ✕
                            </button>
                          )}
                        </div>

                        {exp.payments.map((row) => (
                          <div key={row.id} className="payment-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select 
                              value={row.method} 
                              onChange={e => updatePaymentSplit(exp.id, row.id, 'method', e.target.value)}
                              className="saas-input"
                              style={{ flex: '0 0 110px', cursor: 'pointer', fontSize: '14px', margin: 0, height: '42px', padding: '0 8px', boxSizing: 'border-box' }}
                            >
                              <option value="Cash ៛">💵 Cash ៛</option>
                              <option value="Cash $">💵 Cash $</option>
                              <option value="QR ៛">📱 QR ៛</option>
                              <option value="QR $">📱 QR $</option>
                            </select>
                            
                            <div style={{ flex: 1 }}>
                              <CurrencyInput 
                                placeholder="0" 
                                value={row.amount} 
                                onChange={(val: any) => updatePaymentSplit(exp.id, row.id, 'amount', val)}
                                className="saas-input"
                                style={{ textAlign: 'right', height: '42px', margin: 0, boxSizing: 'border-box' }}
                              />
                            </div>
                            
                            {exp.payments.length > 1 && (
                              <button type="button" onClick={() => removePaymentSplit(exp.id, row.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold', height: '42px' }}>✕</button>
                            )}
                          </div>
                        ))}
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            </form>
          )}

          {/* --- STAFF MANAGEMENT UI --- */}
          {activeTab === 'staff' && (
            <div>
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
                            <EmptyState icon="👥" title="No staff found" message="Register your first staff member above." />
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

                          const netPayout = totalEarned - totalDebtRiel - (totalDebtUsd * EXCHANGE_RATE);
                          const isNegativePayout = netPayout < 0;

                          return (
                            <tr key={staff.id} className="saas-tr">
                              <td className="saas-td" style={{ cursor: 'text', fontWeight: 'bold' }} onClick={() => { setEditingCell({ id: staff.id, field: 'name' }); setEditValue(staff.name); }}>
                                {editingCell?.id === staff.id && editingCell?.field === 'name' ? (
                                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'name')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'name')} className="saas-input" />
                                ) : staff.name}
                              </td>
                              <td className="saas-td" style={{ cursor: 'text' }} onClick={() => { setEditingCell({ id: staff.id, field: 'start_date' }); setEditValue(staff.start_date || ''); }}>
                                {editingCell?.id === staff.id && editingCell?.field === 'start_date' ? (
                                  <input type="date" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveInlineEdit(staff.id, 'start_date')} onKeyDown={e => e.key === 'Enter' && saveInlineEdit(staff.id, 'start_date')} className="saas-input" />
                                ) : (
                                  <div>{staff.start_date || 'N/A'}<div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 'bold' }}>{daysWorked} days</div></div>
                                )}
                              </td>
                              <td className="saas-td" style={{ cursor: 'text', textAlign: 'right' }} onClick={() => { setEditingCell({ id: staff.id, field: 'salary' }); setEditValue(String(staff.salary || 0)); }}>
                                {editingCell?.id === staff.id && editingCell?.field === 'salary' ? (
                                  <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'salary')} className="saas-input" style={{ textAlign: 'right' }} />
                                ) : formatRiel(monthlySalary)}
                              </td>
                              <td className="saas-td" style={{ color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>{formatRiel(totalEarned)}</td>
                              <td className="saas-td" style={{ textAlign: 'right' }}>
                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <div style={{ cursor: 'text', fontWeight: 'bold', color: '#ef4444' }} onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_riel' }); setEditValue(String(staff.total_debt_riel || 0)); }}>
                                      {editingCell?.id === staff.id && editingCell?.field === 'total_debt_riel' ? (
                                        <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_riel')} className="saas-input" style={{ textAlign: 'right', color: '#ef4444', width: '100px' }} />
                                      ) : formatRiel(totalDebtRiel)}
                                    </div>
                                 </div>
                              </td>
                              <td className="saas-td" style={{ textAlign: 'right' }}>
                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <div style={{ cursor: 'text', fontWeight: 'bold', color: '#ef4444' }} onClick={() => { setEditingCell({ id: staff.id, field: 'total_debt_usd' }); setEditValue(String(staff.total_debt_usd || 0)); }}>
                                      {editingCell?.id === staff.id && editingCell?.field === 'total_debt_usd' ? (
                                        <CurrencyInput autoFocus value={Number(editValue)} onChange={(v:any) => setEditValue(String(v))} onEnter={() => saveInlineEdit(staff.id, 'total_debt_usd')} className="saas-input" style={{ textAlign: 'right', color: '#ef4444', width: '80px' }} />
                                      ) : formatUSD(totalDebtUsd)}
                                    </div>
                                 </div>
                              </td>
                              <td className="saas-td" style={{ color: isNegativePayout ? '#ef4444' : '#3b82f6', textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}>
                                {isNegativePayout ? '-' : ''}{formatRiel(Math.abs(netPayout))}
                              </td>
                              <td className="saas-td" style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <select value={debtMethods[staff.id] || 'Cash ៛'} onChange={e => setDebtMethods({ ...debtMethods, [staff.id]: e.target.value })} className="saas-input" style={{ width: '85px', padding: '6px' }}>
                                      <option value="Cash ៛">Cash ៛</option><option value="Cash $">Cash $</option><option value="QR ៛">QR ៛</option><option value="QR $">QR $</option>
                                    </select>
                                    <CurrencyInput placeholder="0" value={debtAdditions[staff.id] || ''} onChange={(v:any) => setDebtAdditions({ ...debtAdditions, [staff.id]: v })} onEnter={() => handleAddDebt(staff)} className="saas-input" style={{ flex: 1, padding: '6px', textAlign: 'right' }} />
                                    <button onClick={() => handleAddDebt(staff)} disabled={!debtAdditions[staff.id]} className={`saas-btn ${debtAdditions[staff.id] ? 'saas-btn-primary' : 'saas-btn-secondary'}`} style={{ padding: '6px 12px' }}>Add</button>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                    {(totalDebtRiel > 0 || totalDebtUsd > 0) && (
                                      <button onClick={() => setSettleModal({ isOpen: true, staff: staff, amount: '', method: 'Cash ៛' })} className="saas-btn" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '6px 12px', fontSize: '12px' }}>✅ Settle</button>
                                    )}
                                  </div>
                                </div>
                              </td>
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
              </div>
            </div>
          )}

          {/* --- EXPENSE DATABASE UI --- */}
          {activeTab === 'database' && (
            <div>
              <div className="saas-tab-container hide-scrollbar" style={{ border: 'none', padding: '4px', background: '#f1f5f9', margin: '0 0 24px 0', flexWrap: 'nowrap', overflowX: 'auto', borderRadius: '12px' }}>
                {dbTabOrder.map(tab => {
                  const labels: any = { personal: '🏡 Personal Expenses', business: '🏢 Business Expenses', staff_debt: '💸 Staff Debt Log', insight: '📊 Expense Insight' };
                  return (
                    <button
                      key={tab} draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/dbtab', tab); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault(); const sourceTab = e.dataTransfer.getData('text/dbtab');
                        if (!sourceTab || sourceTab === tab) return;
                        setDbTabOrder(prev => { const newOrder = prev.filter(t => t !== sourceTab); newOrder.splice(newOrder.indexOf(tab), 0, sourceTab); return newOrder; });
                      }}
                      onClick={() => setDbTab(tab as any)}
                      className={`saas-tab ${dbTab === tab ? 'active' : ''}`}
                      style={dbTab === tab && tab === 'insight' ? { cursor: 'grab', background: '#3b82f6', color: '#fff', padding: '10px 20px' } : { cursor: 'grab', padding: '10px 20px' }}
                    >
                      {labels[tab]}
                    </button>
                  )
                })}
              </div>

              {dbTab === 'insight' ? (
                // --- INSIGHTS VIEW ---
                <div className="fade-in">
                  
                  {/* Filters */}
                  <div className="saas-tab-container hide-scrollbar" style={{ margin: '0 0 24px 0', padding: '4px', background: '#f1f5f9', display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', border: 'none' }}>
                    {['today', 'week', 'month', 'custom'].map(f => (
                      <button 
                        key={f} onClick={() => setInsightFilter(f as any)} 
                        className={`saas-tab ${insightFilter === f ? 'active' : ''}`} 
                        style={insightFilter === f ? { background: '#0f172a', color: '#fff', padding: '8px 16px' } : { padding: '8px 16px' }}
                      >
                        {f === 'custom' ? 'Custom Range' : f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : 'Today'}
                      </button>
                    ))}
                  </div>

                  {insightFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>From:</label>
                        <input type="date" value={insightFrom} onChange={e => setInsightFrom(e.target.value)} className="saas-input" style={{ width: '135px', padding: '8px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#64748b' }}>To:</label>
                        <input type="date" value={insightTo} onChange={e => setInsightTo(e.target.value)} className="saas-input" style={{ width: '135px', padding: '8px' }} />
                      </div>
                    </div>
                  )}

                  {/* Core Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                    
                    <div className="saas-card">
                      <div className="saas-card-title">📉 Total Expenses</div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{formatRiel(insightsData?.totalExpRiel || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Total Riel</div>
                        </div>
                        <div style={{ width: '1px', background: '#e2e8f0' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{formatUSD(insightsData?.totalExpUsd || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Total USD</div>
                        </div>
                      </div>
                    </div>

                    <div className="saas-card">
                      <div className="saas-card-title">🏢 Business Expenses</div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#b91c1c', fontWeight: 'bold' }}>{formatRiel(insightsData?.totalBizRiel || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Biz Riel</div>
                        </div>
                        <div style={{ width: '1px', background: '#e2e8f0' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#b91c1c', fontWeight: 'bold' }}>{formatUSD(insightsData?.totalBizUsd || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Biz USD</div>
                        </div>
                      </div>
                    </div>

                    <div className="saas-card">
                      <div className="saas-card-title">🏡 Personal Expenses</div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#f59e0b', fontWeight: 'bold' }}>{formatRiel(insightsData?.totalPersRiel || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Pers Riel</div>
                        </div>
                        <div style={{ width: '1px', background: '#e2e8f0' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#f59e0b', fontWeight: 'bold' }}>{formatUSD(insightsData?.totalPersUsd || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Pers USD</div>
                        </div>
                      </div>
                    </div>

                    <div className="saas-card">
                      <div className="saas-card-title" style={{ color: '#64748b' }}>ℹ️ Total Staff Debt Logged</div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#64748b', fontWeight: 'bold' }}>{formatRiel(insightsData?.totalDebtRiel || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Debt Riel</div>
                        </div>
                        <div style={{ width: '1px', background: '#e2e8f0' }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '20px', color: '#64748b', fontWeight: 'bold' }}>{formatUSD(insightsData?.totalDebtUsd || 0)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>Debt USD</div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Top 5 Lists */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
                    <div className="saas-card">
                      <h3 className="saas-card-title">🏆 Top 5 Personal Expenses</h3>
                      {insightsData?.topPers.length === 0 ? <div style={{ fontSize: '13px', color: '#94a3b8' }}>No data available.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {insightsData?.topPers.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                              <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{idx + 1}. {item.remarks}</div>
                              <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }}>
                                {Number(item.amount_riel) > 0 && <div style={{ color: '#f59e0b' }}>{formatRiel(Number(item.amount_riel))}</div>}
                                {Number(item.amount_usd) > 0 && <div style={{ color: '#f59e0b' }}>{formatUSD(Number(item.amount_usd))}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="saas-card">
                      <h3 className="saas-card-title">🏆 Top 5 Business Expenses</h3>
                      {insightsData?.topBiz.length === 0 ? <div style={{ fontSize: '13px', color: '#94a3b8' }}>No data available.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {insightsData?.topBiz.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                              <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{idx + 1}. {item.remarks}</div>
                              <div style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }}>
                                {Number(item.amount_riel) > 0 && <div style={{ color: '#b91c1c' }}>{formatRiel(Number(item.amount_riel))}</div>}
                                {Number(item.amount_usd) > 0 && <div style={{ color: '#b91c1c' }}>{formatUSD(Number(item.amount_usd))}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chart */}
                  <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📉 EXPENSE TREND (Day 1 - 31)</h2>
                  <div style={{ marginBottom: '40px' }}>
                    <LineChartCard title="Total Expenses: This Month vs Last Month" dataCurrent={insightsData?.thisMonthData || []} dataLast={insightsData?.lastMonthData || []} color="#ef4444" />
                  </div>

                </div>
              ) : (
                // --- REGULAR DATABASE TABLE VIEW ---
                <div className="saas-table-wrapper" style={{ marginBottom: '32px' }}>
                  <div className="saas-table-responsive">
                    <table className="saas-table">
                      <thead>
                        <tr>
                          {[
                            { key: dbTab === 'staff_debt' ? 'created_at' : 'expense_date', label: 'Date', align: 'left' },
                            { key: dbTab === 'staff_debt' ? 'staff_name' : 'remarks', label: dbTab === 'staff_debt' ? 'Staff Name' : 'Description', align: 'left' },
                            ...(dbTab !== 'staff_debt' ? [{ key: 'spender', label: 'Spender', align: 'center' }] : []),
                            { key: 'payment_method', label: 'Payment Method', align: 'left' },
                            { key: dbTab === 'staff_debt' ? 'amount' : 'amount_riel', label: 'Amount (៛)', align: 'right' },
                            ...(dbTab !== 'staff_debt' ? [{ key: 'amount_usd', label: 'Amount ($)', align: 'right' }] : [])
                          ].map((col: any) => (
                            <th 
                              key={col.key} className="saas-th"
                              onClick={() => {
                                let direction: 'asc' | 'desc' = 'desc';
                                if (dbSortConfig && dbSortConfig.key === col.key && dbSortConfig.direction === 'desc') direction = 'asc';
                                setDbSortConfig({ key: col.key, direction });
                              }}
                              style={{ textAlign: col.align as any, cursor: 'pointer', userSelect: 'none' }}
                            >
                              {col.label}
                              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: dbSortConfig?.key === col.key ? 1 : 0.3 }}>
                                {dbSortConfig?.key === col.key ? (dbSortConfig?.direction === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {isFetchingDb ? (
                          <TableSkeleton columns={dbTab === 'staff_debt' ? 4 : 6} rows={6} />
                        ) : filteredAndSortedDb.length === 0 ? (
                          <tr>
                            <td colSpan={dbTab === 'staff_debt' ? 4 : 6} style={{ padding: 0 }}>
                              <EmptyState icon="📭" title="No Records" message="No data found in this category." />
                            </td>
                          </tr>
                        ) : (
                          filteredAndSortedDb.map((row: any) => (
                            <tr key={row.id} className="saas-tr">
                              <td className="saas-td" style={{ fontSize: '14px', color: '#334155' }}>
                                {new Date(dbTab === 'staff_debt' ? row.created_at : row.expense_date).toLocaleDateString('en-GB')}
                              </td>
                              <td className="saas-td" style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                                {dbTab === 'staff_debt' ? row.staff?.name : row.remarks}
                              </td>
                              {dbTab !== 'staff_debt' && (
                                <td className="saas-td" style={{ fontSize: '14px', textAlign: 'center', color: '#64748b' }}>
                                  {row.spender}
                                </td>
                              )}
                              <td className="saas-td" style={{ fontSize: '14px', color: '#3b82f6', fontWeight: 'bold' }}>
                                {row.payment_method}
                              </td>
                              <td className="saas-td" style={{ fontSize: '14px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>
                                {dbTab === 'staff_debt' ? 
                                  (row.payment_method.includes('$') ? '-' : formatRiel(row.amount)) : 
                                  formatRiel(row.amount_riel)}
                              </td>
                              {dbTab !== 'staff_debt' && (
                                <td className="saas-td" style={{ fontSize: '14px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>
                                  {formatUSD(row.amount_usd)}
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
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

      {/* EXPENSE CONFIRMATION MODAL */}
      <Modal isOpen={confirmModal} onClose={() => setConfirmModal(false)} title="Confirm Expenses" icon="✅" maxWidth="400px">
        <div style={{ fontSize: '15px', color: '#475569', marginBottom: '24px', lineHeight: '1.5' }}>
          Are you sure you want to log <b>{getActiveList().length} expense(s)</b> for <b>{new Date(expenseDate).toLocaleDateString('en-GB')}</b>?
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={() => setConfirmModal(false)} className="saas-btn saas-btn-secondary">Cancel</button>
          <button onClick={() => handleSubmit()} className="saas-btn saas-btn-primary">Yes, Log Expenses</button>
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

        .section-divider { font-size: 15px; color: #475569; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* 🔥 ALIGNMENT CONTAINERS 🔥 */
        .hide-on-mobile { display: inline; }
        .show-on-mobile { display: none; }
        .desktop-only-flex { display: flex; }
        .mobile-only-flex { display: none; }

        .content-container {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding-left: 0px; 
          padding-right: 0px; 
          box-sizing: border-box;
        }
        
        .header-container { 
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 24px auto;
          padding-left: 60px; 
          padding-right: 0px;
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          gap: 12px;
          min-height: 42px; 
          box-sizing: border-box;
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

        /* 🔥 DESKTOP LAYOUT FOR TOP ACTION ROW */
        .top-action-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
        }
        .top-action-row .date-wrapper {
          flex: 1;
          max-width: 200px;
        }
        .top-action-row .button-wrapper {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        /* 🔥 RESPONSIVE EXPENSE GRID FOR DESKTOP 🔥 */
        .expense-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }

        @media (min-width: 1024px) {
          .expense-grid {
             grid-template-columns: 1.5fr 1.2fr 1.5fr; 
             gap: 24px;
             align-items: flex-end; 
          }
        }

        /* 🔥 MOBILE CSS OVERRIDES */
        @media (max-width: 1023px) { 
          .hide-on-mobile { display: none !important; }
          .show-on-mobile { display: inline !important; }
          .desktop-only-flex { display: none !important; }
          .mobile-only-flex { display: flex !important; }

          /* 🔥 Mobile Layout: Date on top, Buttons side-by-side underneath */
          .top-action-row {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
            width: 100% !important;
          }
          .top-action-row .date-wrapper {
            width: 100% !important;
            max-width: none !important;
            display: block !important;
          }
          /* 🔥 Fix for iPhone Safari: Force the date input to span full width */
          .top-action-row .date-wrapper input {
            width: 100% !important;
            min-width: 100% !important;
            display: block !important;
            -webkit-appearance: none !important; 
            appearance: none !important;
          }
          .top-action-row .button-wrapper {
            width: 100% !important;
            display: flex !important;
            flex-direction: row !important;
            gap: 12px !important;
            justify-content: space-between !important;
          }
          .top-action-row .button-wrapper button {
            flex: 1 !important; 
            padding: 0 !important;
            text-align: center !important;
            justify-content: center !important;
            display: flex !important;
            align-items: center !important;
          }

          .content-container {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }

          .header-container { 
            padding-left: 54px !important; 
            padding-right: 16px !important;
            margin-bottom: 24px !important; 
            display: flex !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            align-items: center !important; 
            min-height: 44px !important;
          }
        }
      `}</style>
    </div>
  )
}

function LineChartCard({ title, dataCurrent, dataLast, color }: any) {
  const maxVal = Math.max(...dataCurrent, ...dataLast, 1) 
  const formatPoints = (arr: any[]) => {
    return arr.map((val: any, idx: number) => {
      const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200); return `${x},${y}`;
    }).join(' ');
  }
  const currentPoints = formatPoints(dataCurrent); const lastPoints = formatPoints(dataLast);
  return (
    <div className="saas-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#475569', fontWeight: 'bold' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 'bold' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', background: color, borderRadius: '2px' }}></div> <span style={{ color: '#334155' }}>This Mth</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', borderBottom: '2px dashed #cbd5e1' }}></div> <span style={{ color: '#94a3b8' }}>Last Mth</span>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', height: '220px', position: 'relative' }}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="100" x2="1000" y2="100" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="150" x2="1000" y2="150" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeWidth="2" />
          <polyline points={lastPoints} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
          <polyline points={currentPoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {dataCurrent.map((val: any, idx: number) => {
            const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200);
            return val > 0 ? <circle key={idx} cx={x} cy={y} r="4" fill="#ffffff" stroke={color} strokeWidth="2" /> : null;
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}>
          <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>31</span>
        </div>
      </div>
    </div>
  )
}