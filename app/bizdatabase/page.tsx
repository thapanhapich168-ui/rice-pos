'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { formatRiel, formatNumber, EXCHANGE_RATE } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'

// Formats 'total_sales' into 'Total Sales', 'qty' to 'Quantity'
const formatHeader = (key: string) => {
  if (key === 'qty') return 'Quantity';
  if (key === 'cogs_price') return 'COGS Price';
  if (key === 'invoice_id') return 'Invoice ID';
  if (key === 'transaction_id') return 'Transaction ID';
  return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Helper to convert ISO dates to the local format needed by <input type="datetime-local">
const toLocalDatetimeString = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- UNIFIED TRANSACTION TYPE ---
type TabType = 'Wholesale Invoice Summary' | 'Walk-in Wholesale' | 'Non-Walk-in Wholesale' | 'Retails only' | 'Biz Expense' | 'Personal Expense' | 'Staff Debt';

interface UnifiedTransaction {
  [key: string]: any; 
  id: string;
  raw_db_id: string | number;
  product_id?: number | string; 
  invoice_id?: string;
  source: TabType;
  created_at: string;
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;

type TimeFilter = 'Today' | 'This Week' | 'This Month' | 'All Time';

// Standardized initial widths for all possible columns
const DEFAULT_WIDTHS: Record<string, number> = {
  invoice_id: 140, transaction_id: 140, created_at: 180, customer_name: 160, owner: 100,
  rice_types: 250, rice_type: 180, qty: 100, price_per_bag: 130, cogs_price: 130,
  total_sales: 140, total_cogs: 140, total_profit: 140, description: 200, amount: 140,
  category: 140, status: 120
}

const DEFAULT_SUMMARY_COLS = ['invoice_id', 'created_at', 'customer_name', 'owner', 'rice_types', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_DAILY_COLS = ['invoice_id', 'created_at', 'customer_name', 'owner', 'rice_type', 'qty', 'price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_RETAIL_COLS = ['transaction_id', 'created_at', 'rice_type', 'qty', 'price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit'];
const DEFAULT_EXPENSE_COLS = ['created_at', 'description', 'amount', 'category', 'status', 'owner'];

export default function BizDatabase() {
  const { showToast } = useToast();

  // --- CORE STATE ---
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('Wholesale Invoice Summary')
  const [searchQuery, setSearchQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('Today')
  const [isLoading, setIsLoading] = useState(true)

  // --- SELECTION & EDITING STATE ---
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell] = useState<{id: string, col: string} | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<UnifiedTransaction>>>({})
  
  // --- PREFERENCES ---
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [summaryCols, setSummaryCols] = useState<string[]>(DEFAULT_SUMMARY_COLS)
  const [dailyCols, setDailyCols] = useState<string[]>(DEFAULT_DAILY_COLS)
  const [retailCols, setRetailCols] = useState<string[]>(DEFAULT_RETAIL_COLS)
  const [expenseCols, setExpenseCols] = useState<string[]>(DEFAULT_EXPENSE_COLS)
  
  const widthsRef = useRef(columnWidths)
  widthsRef.current = columnWidths

  // --- SORT STATE ---
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // Dynamic active columns based on tab
  const activeColumns = activeTab === 'Wholesale Invoice Summary' ? summaryCols 
                      : (activeTab === 'Walk-in Wholesale' || activeTab === 'Non-Walk-in Wholesale') ? dailyCols 
                      : activeTab === 'Retails only' ? retailCols 
                      : expenseCols;

  // --- LIFECYCLE ---
  useEffect(() => { 
    fetchData(false)
    fetchSettings()
  }, [])

  useFocusRefresh(() => fetchData(true));

  // --- DATABASE OPERATIONS ---
  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*').in('setting_key', ['biz_col_widths', 'biz_sum_cols', 'biz_daily_cols', 'biz_retail_cols', 'biz_exp_cols'])
    if (data) {
      const widths = data.find(d => d.setting_key === 'biz_col_widths')
      const sumCols = data.find(d => d.setting_key === 'biz_sum_cols')
      const dalCols = data.find(d => d.setting_key === 'biz_daily_cols')
      const retCols = data.find(d => d.setting_key === 'biz_retail_cols')
      const expCols = data.find(d => d.setting_key === 'biz_exp_cols')
      
      if (widths?.setting_value) setColumnWidths(widths.setting_value)
      if (sumCols?.setting_value) setSummaryCols(sumCols.setting_value)
      if (dalCols?.setting_value) setDailyCols(dalCols.setting_value)
      if (retCols?.setting_value) setRetailCols(retCols.setting_value)
      if (expCols?.setting_value) setExpenseCols(expCols.setting_value)
    }
  }

  // 🚀 Fetch with precise Walk-in Isolation (HARD FETCH)
  async function fetchData(isSilent = false) {
    if (!isSilent) setIsLoading(true)
    
    // Removed is_archived logic, fetching purely raw records
    const { data: summaryData } = await supabase.from('invoice_summaries').select('*')
    const { data: dailyData } = await supabase.from('sales').select('*')
    
    let retailData: any[] = []
    try {
      const { data, error } = await supabase.from('retail_sales').select('*')
      if (data && !error) retailData = data;
    } catch (e) {
      console.warn("Retail table not found or accessible yet. Defaulting to empty.", e)
    }

    let bizExpensesData: any[] = []
    try {
      const { data, error } = await supabase.from('expenses').select('*')
      if (data && !error) bizExpensesData = data;
    } catch (e) {
      console.warn("Expenses table not found or accessible yet. Defaulting to empty.", e)
    }

    let personalExpensesData: any[] = []
    try {
      const { data, error } = await supabase.from('personal_expenses').select('*')
      if (data && !error) personalExpensesData = data;
    } catch (e) {
      console.warn("Personal expenses table not found or accessible yet. Defaulting to empty.", e)
    }

    let staffDebtData: any[] = []
    try {
      const { data, error } = await supabase.from('staff_debt').select('*')
      if (data && !error) staffDebtData = data;
    } catch (e) {
      console.warn("Staff debt table not found or accessible yet. Defaulting to empty.", e)
    }

    const unified: UnifiedTransaction[] = []
    
    // Dictionary to map parent invoice data to child line items
    const invoiceDict: Record<string, any> = {};

    if (summaryData) {
      summaryData.forEach(s => {
        if (s.invoice_id) invoiceDict[s.invoice_id] = s;

        const custName = s.customer_name || 'Walk-in';
        const isWalkIn = custName.trim().toLowerCase() === 'walk-in';

        // Do NOT push Walk-in sales to the Invoice Summary tab!
        if (isWalkIn) return;

        unified.push({
          id: `sum_${s.id}`,
          raw_db_id: s.id, 
          source: 'Wholesale Invoice Summary',
          created_at: s.created_at,
          invoice_id: s.invoice_id,
          customer_name: custName,
          owner: s.owner || '-',
          rice_types: s.rice_types,
          total_sales: Number(s.total_sales || 0),
          total_cogs: Number(s.total_cogs || 0),
          total_profit: Number(s.total_profit || 0)
        })
      })
    }

    if (dailyData) {
      dailyData.forEach(d => {
        const qty = Number(d.qty || 0);
        const price = Number(d.price_per_bag || 0);
        const cogs = Number(d.cogs_price || 0);
        
        // Borrow customer_name and owner from the parent invoice dictionary safely
        const parentInvoice = invoiceDict[d.invoice_id] || {};
        const custName = d.customer_name || parentInvoice.customer_name || 'Walk-in';
        const ownerName = d.owner || parentInvoice.owner || '-';

        const isWalkIn = !custName || custName.trim().toLowerCase() === 'walk-in';

        unified.push({
          id: `daily_${d.id}`,
          raw_db_id: d.id,
          product_id: d.product_id, // Attached for smart voiding
          invoice_id: d.invoice_id,
          source: isWalkIn ? 'Walk-in Wholesale' : 'Non-Walk-in Wholesale',
          created_at: d.created_at,
          customer_name: custName,
          owner: ownerName,
          rice_type: d.custom_rice_type || d.rice_type,
          qty: qty,
          price_per_bag: price,
          cogs_price: cogs,
          total_sales: qty * price,
          total_cogs: qty * cogs,
          total_profit: (price - cogs) * qty
        })
      })
    }

    if (retailData) {
      retailData.forEach(r => {
        const qty = Number(r.qty || 0);
        const price = Number(r.price_per_bag || 0);
        const cogs = Number(r.cogs_price || 0);

        unified.push({
          id: `ret_${r.id}`,
          raw_db_id: r.id, 
          product_id: r.product_id, // Attached for smart voiding
          source: 'Retails only',
          created_at: r.created_at,
          transaction_id: r.transaction_id,
          rice_type: r.custom_rice_type || r.rice_type,
          qty: qty,
          price_per_bag: price,
          cogs_price: cogs,
          total_sales: qty * price,
          total_cogs: qty * cogs,
          total_profit: (price - cogs) * qty
        })
      })
    }

    if (bizExpensesData && bizExpensesData.length > 0) {
      bizExpensesData.forEach(e => {
        const amtRiel = Number(e.amount_riel || 0);
        const amtUsd = Number(e.amount_usd || 0);
        const totalRielValue = amtRiel !== 0 ? Math.abs(amtRiel) : Math.abs(amtUsd) * EXCHANGE_RATE;

        unified.push({
          id: `biz_exp_${e.id}`,
          raw_db_id: e.id, 
          source: 'Biz Expense',
          created_at: e.created_at,
          description: e.remarks || e.description || `Biz Expense #${e.id}`,
          amount: totalRielValue,
          category: e.description || e.category || 'Uncategorized',
          status: e.payment_method || e.status || 'cleared',
          owner: e.spender || e.owner || '-'
        })
      })
    }

    if (personalExpensesData && personalExpensesData.length > 0) {
      personalExpensesData.forEach(e => {
        const amtRiel = Number(e.amount_riel || 0);
        const amtUsd = Number(e.amount_usd || 0);
        const totalRielValue = amtRiel !== 0 ? Math.abs(amtRiel) : Math.abs(amtUsd) * EXCHANGE_RATE;

        unified.push({
          id: `pers_exp_${e.id}`,
          raw_db_id: e.id, 
          source: 'Personal Expense',
          created_at: e.created_at,
          description: e.remarks || e.description || `Personal Expense #${e.id}`,
          amount: totalRielValue,
          category: e.description || e.category || 'Uncategorized',
          status: e.payment_method || e.status || 'cleared',
          owner: e.spender || e.owner || '-'
        })
      })
    }

    if (staffDebtData && staffDebtData.length > 0) {
      staffDebtData.forEach(e => {
        const amtRiel = Number(e.amount_riel || 0);
        const amtUsd = Number(e.amount_usd || 0);
        const totalRielValue = amtRiel !== 0 ? Math.abs(amtRiel) : Math.abs(amtUsd) * EXCHANGE_RATE;

        unified.push({
          id: `staff_debt_${e.id}`,
          raw_db_id: e.id, 
          source: 'Staff Debt',
          created_at: e.created_at,
          description: e.remarks || e.description || `Staff Debt #${e.id}`,
          amount: totalRielValue,
          category: e.description || e.category || 'Uncategorized',
          status: e.payment_method || e.status || 'cleared',
          owner: e.spender || e.owner || '-'
        })
      })
    }

    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setTransactions(unified)
    setIsLoading(false)
  }

  // --- RAW BULK DELETE WITH CASCADING FOREIGN KEY SAFETY ---
  const handleDelete = async () => {
    if (!confirm(`🚨 Are you sure you want to PERMANENTLY DELETE ${selectedToDelete.size} records?\n\nThis will completely erase the transaction and physically return the items to your inventory stock.`)) return;
    
    // Optimistic UI Removal
    setTransactions(prev => prev.filter(t => !selectedToDelete.has(t.id)));

    const sumIds: any[] = [];
    const dailyIds: any[] = [];
    const retIds: any[] = [];
    const bizExpIds: any[] = [];
    const persExpIds: any[] = [];
    const staffDebtIds: any[] = [];

    const itemsToRestore: UnifiedTransaction[] = [];
    const invoiceIdsToCascade = new Set<string>(); // If deleting summary, delete children
    const summaryIdsToCascade = new Set<string>(); // If deleting walk-in, delete parent

    transactions.forEach(t => {
      if (selectedToDelete.has(t.id)) {
        if (t.source === 'Wholesale Invoice Summary') {
          sumIds.push(t.raw_db_id);
          if (t.invoice_id) invoiceIdsToCascade.add(t.invoice_id);
        }
        else if (t.source === 'Walk-in Wholesale') {
          dailyIds.push(t.raw_db_id);
          itemsToRestore.push(t);
          if (t.invoice_id) summaryIdsToCascade.add(t.invoice_id);
        }
        else if (t.source === 'Non-Walk-in Wholesale') {
          dailyIds.push(t.raw_db_id);
          itemsToRestore.push(t);
        }
        else if (t.source === 'Retails only') {
          retIds.push(t.raw_db_id);
          itemsToRestore.push(t);
        }
        else if (t.source === 'Biz Expense') {
          bizExpIds.push(t.raw_db_id);
        }
        else if (t.source === 'Personal Expense') {
          persExpIds.push(t.raw_db_id);
        }
        else if (t.source === 'Staff Debt') {
          staffDebtIds.push(t.raw_db_id);
        }
      }
    });

    // Gather children of deleted summaries to restore their stock too
    if (invoiceIdsToCascade.size > 0) {
      const children = transactions.filter(t => (t.source === 'Non-Walk-in Wholesale' || t.source === 'Walk-in Wholesale') && t.invoice_id && invoiceIdsToCascade.has(t.invoice_id) && !selectedToDelete.has(t.id));
      children.forEach(c => {
        dailyIds.push(c.raw_db_id);
        itemsToRestore.push(c);
      });
    }

    try {
      // 1. SMART VOID: RESTORE STOCK & FIFO FOR SALES
      for (const item of itemsToRestore) {
        const qty = Number(item.qty) || 0;
        const isSpecial = (item.rice_type || '').includes('បានប្រើ') || (item.rice_type || '').includes('សេវាដឹក');
        
        if (qty !== 0 && !isSpecial && item.product_id) {
          const { data: prod } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
          if (prod) {
            await supabase.from('products').update({ stock: Number(prod.stock) + qty }).eq('id', item.product_id);
          }

          let remainingToReverse = qty;
          const { data: batches } = await supabase.from('price_history')
            .select('*')
            .eq('product_id', item.product_id)
            .gt('sold_qty', 0)
            .order('created_at', { ascending: false }); 
          
          if (batches) {
            for (const b of batches) {
              if (remainingToReverse <= 0) break;
              const possibleToReverse = Math.min(b.sold_qty, remainingToReverse);
              await supabase.from('price_history').update({ sold_qty: b.sold_qty - possibleToReverse }).eq('id', b.id);
              remainingToReverse -= possibleToReverse;
            }
          }
        }
      }

      // 2. HARD DELETE WITH FOREIGN KEY SAFETY
      const allInvoicesToDelete = new Set([...Array.from(invoiceIdsToCascade), ...Array.from(summaryIdsToCascade)]);
      
      if (allInvoicesToDelete.size > 0) {
        await supabase.from('invoice_payments').delete().in('invoice_id', Array.from(allInvoicesToDelete));
      }

      if (dailyIds.length > 0) await supabase.from('sales').delete().in('id', dailyIds);
      if (retIds.length > 0) await supabase.from('retail_sales').delete().in('id', retIds);
      if (bizExpIds.length > 0) await supabase.from('expenses').delete().in('id', bizExpIds);
      if (persExpIds.length > 0) await supabase.from('personal_expenses').delete().in('id', persExpIds);
      if (staffDebtIds.length > 0) await supabase.from('staff_debt').delete().in('id', staffDebtIds);
      
      if (sumIds.length > 0) await supabase.from('invoice_summaries').delete().in('id', sumIds);
      if (summaryIdsToCascade.size > 0) {
        await supabase.from('invoice_summaries').delete().in('invoice_id', Array.from(summaryIdsToCascade));
      }
      
      setSelectedToDelete(new Set());
      showToast('success', 'Deleted Successfully', 'Records and inventory restored.');
      fetchData(true);
    } catch (e: any) {
      showToast('error', 'Deletion Failed', e.message);
      fetchData(true);
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedToDelete);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedToDelete(next);
  }

  const toggleSelectAll = () => {
    if (selectedToDelete.size === processedTransactions.length && processedTransactions.length > 0) {
      setSelectedToDelete(new Set());
    } else {
      setSelectedToDelete(new Set(processedTransactions.map(t => t.id)));
    }
  }

  // --- SAVE EDIT LOGIC ---
  const handleSaveRecord = async (id: string) => {
    if (!edits[id]) {
      setEditingCell(null);
      return;
    }

    const payload = { ...edits[id] } as any;
    const baseTx = transactions.find(t => t.id === id);
    if (!baseTx) return;

    let targetTable = '';
    const dbPayload: any = {};

    if (payload.created_at !== undefined) dbPayload.created_at = payload.created_at;
    if (payload.invoice_id !== undefined) dbPayload.invoice_id = payload.invoice_id;
    if (payload.transaction_id !== undefined) dbPayload.transaction_id = payload.transaction_id;

    // Automatically calculate Totals if Qty or Price was edited!
    const newQty = payload.qty !== undefined ? Number(payload.qty) : Number(baseTx.qty || 0);
    const newPrice = payload.price_per_bag !== undefined ? Number(payload.price_per_bag) : Number(baseTx.price_per_bag || 0);
    const newCogs = payload.cogs_price !== undefined ? Number(payload.cogs_price) : Number(baseTx.cogs_price || 0);

    if (baseTx.source === 'Wholesale Invoice Summary') {
      targetTable = 'invoice_summaries';
      if (payload.customer_name !== undefined) dbPayload.customer_name = payload.customer_name;
      if (payload.owner !== undefined) dbPayload.owner = payload.owner;
      if (payload.rice_types !== undefined) dbPayload.rice_types = payload.rice_types;
      if (payload.total_sales !== undefined) dbPayload.total_sales = payload.total_sales;
      if (payload.total_cogs !== undefined) dbPayload.total_cogs = payload.total_cogs;
      if (payload.total_profit !== undefined) dbPayload.total_profit = payload.total_profit;
    } 
    else if (baseTx.source === 'Walk-in Wholesale' || baseTx.source === 'Non-Walk-in Wholesale') {
      targetTable = 'sales';
      if (payload.rice_type !== undefined) dbPayload.custom_rice_type = payload.rice_type; 
      
      dbPayload.qty = newQty;
      dbPayload.price_per_bag = newPrice;
      dbPayload.cogs_price = newCogs;
      dbPayload.total_sales = newQty * newPrice;
      dbPayload.total_cogs = newQty * newCogs;
      dbPayload.total_profit = (newPrice - newCogs) * newQty;
    }
    else if (baseTx.source === 'Retails only') {
      targetTable = 'retail_sales';
      if (payload.rice_type !== undefined) dbPayload.custom_rice_type = payload.rice_type; 
      
      dbPayload.qty = newQty;
      dbPayload.price_per_bag = newPrice;
      dbPayload.cogs_price = newCogs;
      dbPayload.total_sales = newQty * newPrice;
      dbPayload.total_cogs = newQty * newCogs;
      dbPayload.total_profit = (newPrice - newCogs) * newQty;
    }
    else if (baseTx.source === 'Biz Expense' || baseTx.source === 'Personal Expense' || baseTx.source === 'Staff Debt') {
      targetTable = baseTx.source === 'Biz Expense' ? 'expenses' : baseTx.source === 'Personal Expense' ? 'personal_expenses' : 'staff_debt';
      if (payload.description !== undefined) dbPayload.remarks = payload.description; 
      if (payload.category !== undefined) dbPayload.description = payload.category; 
      if (payload.owner !== undefined) dbPayload.spender = payload.owner; 
      if (payload.status !== undefined) dbPayload.payment_method = payload.status; 
      if (payload.amount !== undefined) {
        dbPayload.amount_riel = payload.amount;
        dbPayload.amount_usd = 0; 
      }
    }

    if (Object.keys(dbPayload).length > 0) {
      const { error } = await supabase.from(targetTable).update(dbPayload).eq('id', baseTx.raw_db_id);
      if (error) {
        showToast('error', 'Save Failed', error.message);
        return;
      }
    }

    setEdits(prev => { const n = { ...prev }; delete n[id]; return n });
    setEditingCell(null);
    showToast('success', 'Saved', 'Record updated successfully.');
    fetchData(true); 
  }

  // --- TIME FILTER LOGIC ---
  const isWithinTimeFilter = (dateString: string) => {
    if (timeFilter === 'All Time') return true;
    
    const d = new Date(dateString);
    const now = new Date();
    
    if (timeFilter === 'Today') {
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    
    if (timeFilter === 'This Month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    
    if (timeFilter === 'This Week') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = today.getDay(); 
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const startOfWeek = new Date(today.setDate(diff));
      return d >= startOfWeek;
    }
    
    return true;
  }

  // --- HEADER SORT LOGIC ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  // --- COLUMN DRAG & DROP LOGIC ---
  const handleDragStart = (e: React.DragEvent, col: string) => {
    e.dataTransfer.setData('text/plain', col)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault() 
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault()
    const sourceCol = e.dataTransfer.getData('text/plain')
    if (!sourceCol || sourceCol === targetCol) return

    const reorder = (prev: string[]) => {
      const newOrder = prev.filter(c => c !== sourceCol)
      const targetIdx = newOrder.indexOf(targetCol)
      newOrder.splice(targetIdx, 0, sourceCol)
      return newOrder
    }

    if (activeTab === 'Wholesale Invoice Summary') {
      const updated = reorder(summaryCols)
      setSummaryCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_sum_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else if (activeTab === 'Walk-in Wholesale' || activeTab === 'Non-Walk-in Wholesale') {
      const updated = reorder(dailyCols)
      setDailyCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_daily_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else if (activeTab === 'Retails only') {
      const updated = reorder(retailCols)
      setRetailCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_retail_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    } else {
      const updated = reorder(expenseCols)
      setExpenseCols(updated)
      supabase.from('app_settings').upsert({ setting_key: 'biz_exp_cols', setting_value: updated }, { onConflict: 'setting_key' }).then()
    }
  }

  // --- COLUMN RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, columnKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = 'touches' in e ? e.touches[0].pageX : e.pageX
    const startWidth = widthsRef.current[columnKey] || 150

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].pageX : moveEvent.pageX
      const newWidth = Math.max(60, startWidth + (currentX - startX))
      setColumnWidths(prev => ({ ...prev, [columnKey]: newWidth }))
    }

    const handleUp = async () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchmove', handleMove)
      document.removeEventListener('touchend', handleUp)
      
      await supabase.from('app_settings').upsert({ setting_key: 'biz_col_widths', setting_value: widthsRef.current }, { onConflict: 'setting_key' })
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchmove', handleMove, { passive: false })
    document.addEventListener('touchmove', handleUp)
  }

  // --- DATA PROCESSING & CALCULATIONS ---
  const processedTransactions = transactions
    .filter(t => {
      if (t.source !== activeTab) return false;
      if (!isWithinTimeFilter(t.created_at)) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const searchableText = `${t.invoice_id || ''} ${t.transaction_id || ''} ${t.customer_name || ''} ${t.rice_types || ''} ${t.rice_type || ''} ${t.description || ''} ${t.category || ''}`.toLowerCase()
        if (!searchableText.includes(query)) return false
      }

      return true
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      
      let valA = a[key];
      let valB = b[key];
      
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    })

  // --- HELPERS ---
  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    return d.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const Resizer = ({ columnKey }: { columnKey: string }) => (
    <div
      className="resizer-handle"
      onMouseDown={(e) => handleResizeStart(e, columnKey)}
      onTouchStart={(e) => handleResizeStart(e, columnKey)}
    />
  )

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">🔐 Business Database</h1>
        </div>
        <div className="header-actions">
          {selectedToDelete.size > 0 && (
            <button onClick={handleDelete} className="delete-btn">
              🗑️ Delete ({selectedToDelete.size})
            </button>
          )}
          <button className="refresh-btn" onClick={() => fetchData(false)}>
            {isLoading ? '🔄 Loading...' : '🔄 Refresh Data'}
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar-container">
        
        {/* TOP ROW: TABS */}
        <div className="toolbar-tabs" style={{ width: '100%', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '4px' }}>
          <button className={activeTab === 'Wholesale Invoice Summary' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Wholesale Invoice Summary'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            🌾 Wholesale Invoice Summary
          </button>
          <button className={activeTab === 'Walk-in Wholesale' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Walk-in Wholesale'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            🚶 Walk-in Wholesale
          </button>
          <button className={activeTab === 'Non-Walk-in Wholesale' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Non-Walk-in Wholesale'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            🚚 Non-Walk-in Wholesale
          </button>
          <button className={activeTab === 'Retails only' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Retails only'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            🛍️ Retails only
          </button>
          <button className={activeTab === 'Biz Expense' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Biz Expense'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            📉 Biz Expense
          </button>
          <button className={activeTab === 'Personal Expense' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Personal Expense'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            🍕 Personal Expense
          </button>
          <button className={activeTab === 'Staff Debt' ? 'tab active' : 'tab'} onClick={() => {setActiveTab('Staff Debt'); setSortConfig(null); setEditingCell(null); setSelectedToDelete(new Set());}}>
            💸 Staff Debt
          </button>
        </div>

        {/* BOTTOM ROW: FILTERS & SEARCH */}
        <div className="toolbar-bottom-row">
          
          {/* TIME PRE-FILTERS */}
          <div className="time-filters-wrapper">
            <button className={timeFilter === 'Today' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('Today')}>Today</button>
            <button className={timeFilter === 'This Week' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('This Week')}>This Week</button>
            <button className={timeFilter === 'This Month' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('This Month')}>This Month</button>
            <button className={timeFilter === 'All Time' ? 'time-btn active' : 'time-btn'} onClick={() => setTimeFilter('All Time')}>All Time</button>
          </div>

          <input 
            className="toolbar-search" 
            placeholder="🔍 Search records..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
      </div>

      {/* RECORD COUNT BADGE */}
      <div className="record-count-badge">
        Showing {processedTransactions.length} records for {timeFilter}
      </div>

      {/* MAIN SPREADSHEET */}
      <div className="table-wrapper">
        <table className="biz-table">
          <thead>
            <tr className="biz-thead-tr">
              <th className="biz-th-checkbox">
                <input 
                  type="checkbox" 
                  className="biz-checkbox"
                  checked={selectedToDelete.size === processedTransactions.length && processedTransactions.length > 0} 
                  onChange={toggleSelectAll} 
                />
              </th>

              {activeColumns.map(key => (
                <th 
                  key={key} 
                  className="biz-th"
                  draggable 
                  onDragStart={(e) => handleDragStart(e, key)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, key)}
                  onClick={() => handleSort(key)}
                  style={{ width: columnWidths[key] || 150 }}
                  title="Click to sort, Drag to reorder"
                >
                  {formatHeader(key)}
                  <span className="sort-icon" style={{ opacity: sortConfig?.key === key ? 1 : 0.3 }}>
                    {sortConfig?.key === key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                  <Resizer columnKey={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && transactions.length === 0 ? (
              <tr><td colSpan={activeColumns.length + 1} className="empty-table-cell">Loading database...</td></tr>
            ) : processedTransactions.length === 0 ? (
              <tr><td colSpan={activeColumns.length + 1} className="empty-table-cell">No records match your view.</td></tr>
            ) : (
              processedTransactions.map(t => {
                const isRowSelected = selectedToDelete.has(t.id);
                const isRowEditing = edits[t.id] ? true : false;
                
                return (
                  <tr key={t.id} className={`biz-tr ${isRowSelected ? 'selected' : ''} ${isRowEditing ? 'editing' : ''}`}>
                    <td className="biz-td-checkbox">
                      <input 
                        type="checkbox" 
                        className="biz-checkbox"
                        checked={isRowSelected} 
                        onChange={() => toggleSelect(t.id)} 
                      />
                    </td>

                    {activeColumns.map(col => {
                      const isEditing = editingCell?.id === t.id && editingCell?.col === col;
                      const val = edits[t.id]?.[col] ?? t[col] ?? '';

                      const isParentFieldOnChild = (t.source === 'Walk-in Wholesale' || t.source === 'Non-Walk-in Wholesale') && ['customer_name', 'owner'].includes(col);
                      const isUneditable = ['created_at', 'invoice_id', 'transaction_id'].includes(col) || isParentFieldOnChild;

                      return (
                        <td 
                          key={col} 
                          className={`biz-td ${isEditing ? 'cell-editing' : ''}`}
                          onClick={() => { if (!isUneditable) setEditingCell({ id: t.id, col: col }) }}
                        >
                          {isEditing ? (
                            ['price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit', 'amount'].includes(col) ? (
                              <CurrencyInput 
                                autoFocus 
                                value={val} 
                                onChange={(v: any) => setEdits(prev => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [col]: v } }))} 
                                onEnter={() => handleSaveRecord(t.id)}
                              />
                            ) : col === 'created_at' ? (
                              <input 
                                autoFocus
                                type="datetime-local"
                                className="cell-input"
                                value={toLocalDatetimeString(val)}
                                onChange={(e) => {
                                  const dateObj = new Date(e.target.value);
                                  if (!isNaN(dateObj.getTime())) {
                                    setEdits(prev => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [col]: dateObj.toISOString() } }));
                                  }
                                }}
                                onBlur={() => handleSaveRecord(t.id)}
                                onKeyDown={(e) => { 
                                  if (e.key === 'Enter') { e.currentTarget.blur(); handleSaveRecord(t.id); } 
                                  if (e.key === 'Escape') { 
                                    setEdits(prev => { const n = { ...prev }; delete n[t.id]; return n }); 
                                    setEditingCell(null); 
                                  } 
                                }}
                              />
                            ) : (
                              <input 
                                autoFocus 
                                type={col === 'qty' ? 'number' : 'text'} 
                                className="cell-input no-spinners" 
                                value={val} 
                                onChange={(e) => {
                                  const newVal = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                                  setEdits(prev => ({ ...prev, [t.id]: { ...(prev[t.id] || {}), [col]: newVal } }))
                                }} 
                                onBlur={() => handleSaveRecord(t.id)} 
                                onKeyDown={(e) => { 
                                  if (e.key === 'Enter') { e.currentTarget.blur(); handleSaveRecord(t.id); } 
                                  if (e.key === 'Escape') { 
                                    setEdits(prev => { const n = { ...prev }; delete n[t.id]; return n }); 
                                    setEditingCell(null); 
                                  } 
                                }} 
                              />
                            )
                          ) : (
                            <div className="cell-display" style={{ cursor: isUneditable ? 'default' : 'text' }}>
                              {['invoice_id', 'transaction_id', 'customer_name', 'rice_types', 'rice_type', 'description'].includes(col) && (
                                <span style={{ fontWeight: ['invoice_id', 'transaction_id'].includes(col) ? 'bold' : 'normal', color: ['invoice_id', 'transaction_id'].includes(col) ? '#1e293b' : 'inherit' }}>
                                  {val || '-'}
                                </span>
                              )}
                              
                              {col === 'owner' && <span className="badge-owner">{val || '-'}</span>}
                              {col === 'category' && <span className="badge-category">{val || '-'}</span>}
                              {col === 'status' && <span className="badge-status">{val || '-'}</span>}
                              
                              {col === 'created_at' && formatDate(t.created_at)}
                              {col === 'qty' && formatNumber(val || 0)}

                              {['price_per_bag', 'cogs_price', 'total_sales', 'total_cogs', 'total_profit', 'amount'].includes(col) && (
                                <span style={{ 
                                  fontWeight: 'bold', 
                                  color: (col === 'total_profit' && val < 0) || col === 'total_cogs' || col === 'cogs_price' || col === 'amount' ? '#ef4444' : '#10b981' 
                                }}>
                                  {formatRiel(val || 0)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* --- GLOBAL CSS EXCLUSIVELY DE-INLINED FROM ABOVE --- */}
      <style jsx global>{`
        /* DE-INLINED CORE STYLES */
        .toolbar-bottom-row {
          display: flex; width: 100%; gap: 12px; flex-wrap: wrap; align-items: center;
        }
        .time-filters-wrapper {
          display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 4px;
        }
        .record-count-badge {
          margin-bottom: 12px; color: #64748b; font-size: 13px; font-weight: bold;
        }
        .delete-btn {
          background: #ef4444; color: #fff; padding: 10px 16px; border-radius: 6px; border: none; font-weight: bold; cursor: pointer; margin-right: 12px; transition: background 0.2s;
        }
        .delete-btn:hover { background: #dc2626; }
        
        .biz-table { border-collapse: collapse; table-layout: fixed; width: max-content; min-width: 100%; }
        .biz-thead-tr { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
        .biz-th-checkbox { width: 50px; padding: 14px 12px; text-align: center; border-right: 1px solid #f1f5f9; }
        .biz-checkbox { width: 18px; height: 18px; cursor: pointer; accent-color: #b58a3d; }
        .biz-th {
          position: relative; padding: 14px 12px; text-align: left; color: #475569; font-size: 13px; text-transform: uppercase; font-weight: bold; border-right: 1px solid #f1f5f9; cursor: pointer; user-select: none;
        }
        .sort-icon { margin-left: 6px; font-size: 12px; }
        .resizer-handle {
          position: absolute; right: 0; top: 0; bottom: 0; width: 14px; cursor: col-resize; background: transparent; z-index: 10; transform: translateX(50%);
        }
        .empty-table-cell { padding: 40px; text-align: center; color: #94a3b8; }
        
        .biz-tr { border-bottom: 1px solid #f1f5f9; transition: background 0.2s; background: transparent; }
        .biz-tr:hover { background-color: #f8fafc; }
        .biz-tr.selected { background-color: #eff6ff !important; }
        .biz-tr.editing { background-color: #fefcf3 !important; }
        
        .biz-td-checkbox { text-align: center; border-right: 1px solid #f1f5f9; padding: 14px 12px; }
        .biz-td {
          padding: 0; border-right: 1px solid #f1f5f9; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; color: #334155; position: relative;
        }

        .badge-owner { text-transform: capitalize; font-weight: bold; color: #64748b; }
        .badge-category { text-transform: capitalize; color: #475569; }
        .badge-status { color: #64748b; font-style: italic; }

        /* ORIGINAL STYLES PRESERVED */
        .main-wrapper { padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; background: #f8fafc; min-height: 100vh; font-family: Arial, sans-serif; color: #333; box-sizing: border-box; width: 100%; }
        .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; margin-top: 0; margin-left: 60px; gap: 12px; height: 42px; width: calc(100% - 60px); max-width: 1600px; }
        .header-left { display: flex; align-items: center; gap: 12px; }
        .page-title { font-size: 24px !important; color: #4a3b1b !important; margin: 0 !important; font-weight: bold; letter-spacing: -0.5px; line-height: normal !important; display: flex; align-items: center; min-width: 0; white-space: nowrap !important; }
        .header-actions { display: flex; align-items: center; }
        .refresh-btn { padding: 10px 16px; background: #e2e8f0; color: #475569; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; white-space: nowrap; margin: 0; }
        .refresh-btn:hover { background: #cbd5e1; }
        .toolbar-container { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; background: #fff; padding: 16px 20px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .toolbar-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .tab { padding: 10px 16px; border-radius: 6px; border: none; background: transparent; font-weight: bold; font-size: 14px; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .tab.active { background: #10b981; color: #fff; }
        .time-btn { padding: 8px 12px; border-radius: 6px; border: none; background: transparent; font-weight: bold; font-size: 13px; color: #64748b; cursor: pointer; }
        .time-btn.active { background: #fff; color: #b58a3d; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .toolbar-search { padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; flex: 1; outline: none; min-width: 200px; font-size: 16px; color: #0f172a; background-color: #ffffff; }
        .table-wrapper { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .cell-display { padding: 14px 12px; width: 100%; height: 100%; box-sizing: border-box; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cell-input { width: 100%; height: 100%; padding: 14px 12px; font-size: 14px; border: none; outline: 2px solid #b58a3d; box-shadow: 0 0 5px rgba(181, 138, 61, 0.3); background: #fff; position: absolute; top: 0; left: 0; z-index: 20; box-sizing: border-box; color: #0f172a; }
        .cell-editing { z-index: 20; position: relative; }
        input[type="number"].no-spinners::-webkit-inner-spin-button, input[type="number"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"].no-spinners { -moz-appearance: textfield; }

        @media (max-width: 1023px) {
          .main-wrapper { padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; }
          .header-container { margin-left: 54px !important; margin-right: 0 !important; margin-bottom: 24px !important; margin-top: 0 !important; display: flex !important; flex-direction: row !important; justify-content: space-between !important; align-items: center !important; height: 44px !important; width: calc(100% - 54px) !important; }
          .header-left { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 12px !important; }
          .page-title { font-size: 21px !important; line-height: normal !important; white-space: nowrap !important; }
          .header-actions { display: flex; }
          .refresh-btn { padding: 8px 12px !important; font-size: 13px !important; }
          .toolbar-container { padding: 12px; }
          .toolbar-tabs { gap: 4px; }
          .tab { flex: 1 1 45%; padding: 12px; font-size: 13px; }
          .time-btn { flex: 1; padding: 10px 4px; font-size: 12px; text-align: center; }
          .toolbar-search { width: 100%; box-sizing: border-box; }
        }
      `}</style>
    </div>
  )
}