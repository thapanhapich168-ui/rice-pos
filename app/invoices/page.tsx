'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { useToast } from '@/components/ToastProvider'
import { formatRiel } from '@/utils/formatters'
import { useDebounce } from '@/lib/useDebounce'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'
import { useBranch } from '@/components/BranchContext' // 🔥 GLOBAL MEMORY IMPORTED

// --- TYPESCRIPT INTERFACES ---
interface Invoice {
  id: string;
  invoice_id: string;
  invoice_url: string;
  created_at: string;
  customer_name: string;
  total_sales: number;
  delivery_status: string;
  rice_types?: string;
  is_retail?: boolean;
}

type FilterTab = 'All' | 'Today' | 'This Week' | 'This Month';
type CategoryTab = 'All' | 'Wholesale' | 'WalkinWholesale' | 'WalkinRetail' | 'Voided';
type VoidSubTab = 'All' | 'Wholesale' | 'WalkinWholesale' | 'WalkinRetail';

export default function InvoiceGallery() {
  const { showToast } = useToast();
  const { activeBranchId } = useBranch(); // 🔥 TUNED INTO RADIO TOWER

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [isDeviceMobile, setIsDeviceMobile] = useState<boolean>(false)
  const [mounted, setMounted] = useState<boolean>(false)
  
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab] = useState<FilterTab>('All')
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('All')
  const [voidSubTab, setVoidSubTab] = useState<VoidSubTab>('All')
  
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedSearch = useDebounce(searchQuery, 300)

  // 🟢 DEFAULT TO TABLE VIEW
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')

  useEffect(() => {
    setMounted(true);
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices();
  }, [filterTab, categoryTab, voidSubTab, activeBranchId]) // 🔥 RE-RUNS ON BRANCH SWITCH

  // 🚀 Window Focus Auto-Refresh
  useFocusRefresh(fetchInvoices);

  async function fetchInvoices() {
    setIsLoading(true)
    const now = new Date()

    // --- 1. FETCH WHOLESALE & STANDARD INVOICES ---
    let query = supabase.from('invoice_summaries').select('*').eq('branch_id', activeBranchId) // 🔥 FILTERED BY BRANCH

    if (filterTab === 'Today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      query = query.gte('created_at', todayStart)
    } else if (filterTab === 'This Week') {
      const currentDay = now.getDay()
      const dayDifference = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1) 
      const weekStart = new Date(now.getFullYear(), now.getMonth(), dayDifference)
      weekStart.setHours(0, 0, 0, 0)
      query = query.gte('created_at', weekStart.toISOString())
    } else if (filterTab === 'This Month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      query = query.gte('created_at', monthStart)
    }

    const { data: summaryData, error: summaryError } = await query
    if (summaryError) {
      console.error("Error fetching invoice summaries:", summaryError.message)
    }

    // --- 2. FETCH WALK-IN RETAIL SALES (Grouped into single rows per transaction_id) ---
    let retailQuery = supabase.from('retail_sales').select('*').eq('branch_id', activeBranchId) // 🔥 FILTERED BY BRANCH
    
    if (filterTab === 'Today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      retailQuery = retailQuery.gte('created_at', todayStart)
    } else if (filterTab === 'This Week') {
      const currentDay = now.getDay()
      const dayDifference = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1) 
      const weekStart = new Date(now.getFullYear(), now.getMonth(), dayDifference)
      weekStart.setHours(0, 0, 0, 0)
      retailQuery = retailQuery.gte('created_at', weekStart.toISOString())
    } else if (filterTab === 'This Month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      retailQuery = retailQuery.gte('created_at', monthStart)
    }

    const { data: retailData, error: retailError } = await retailQuery
    if (retailError) {
      console.error("Error fetching retail sales:", retailError.message)
    }

    // 🟢 AGGREGATE RETAIL LINE ITEMS INTO SINGLE TRANSACTION ROWS
    const retailGrouped: Record<string, Invoice> = {};
    if (retailData) {
      retailData.forEach((row: any) => {
        const txId = row.transaction_id || `RET-${row.id}`;
        const itemSubtotal = Number(row.qty || 0) * Number(row.price_per_bag || 0);
        const itemDesc = `${row.custom_rice_type || row.rice_type || 'Rice'} (x${row.qty})`;

        if (!retailGrouped[txId]) {
          retailGrouped[txId] = {
            id: `ret-${row.id}`,
            invoice_id: txId,
            invoice_url: '',
            created_at: row.created_at,
            customer_name: 'Walk-in Retail',
            total_sales: itemSubtotal,
            delivery_status: row.status || 'Delivered',
            rice_types: itemDesc,
            is_retail: true
          };
        } else {
          retailGrouped[txId].total_sales += itemSubtotal;
          retailGrouped[txId].rice_types += `, ${itemDesc}`;
        }
      });
    }

    const wholesaleInvoices: Invoice[] = (summaryData || []).map((row: any) => ({
      id: String(row.id),
      invoice_id: row.invoice_id,
      invoice_url: row.invoice_url || '',
      created_at: row.created_at,
      customer_name: row.customer_name || 'Walk-in',
      total_sales: Number(row.total_sales || 0),
      delivery_status: row.delivery_status || 'Delivered',
      rice_types: row.rice_types || '-',
      is_retail: false
    }));

    const allCombined = [...wholesaleInvoices, ...Object.values(retailGrouped)];
    setInvoices(allCombined);
    setIsLoading(false);
  }

  // --- SAFE VOID AUTOMATION ---
  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm(`🚨 Are you sure you want to VOID transaction ${invoiceId}?\n\nThis will instantly:\n1. Restore bags/kg to your stock\n2. Reverse the profit/COGS math\n3. Delete all payment records\n4. Mark this transaction as voided permanently`)) return;

    setIsLoading(true);
    try {
      // 🟢 1. Detect if this is a retail sale using state fallback
      const targetInvoice = invoices.find(inv => inv.invoice_id === invoiceId);
      const isRetail = targetInvoice ? targetInvoice.is_retail : (invoiceId.startsWith('RET-') || invoiceId.startsWith('ret-'));

      // 🟢 2. Fetch ALL line items sharing this ID (even if there are 2+ rows!)
      const { data: items, error: fetchErr } = await supabase
        .from(isRetail ? 'retail_sales' : 'sales')
        .select('*')
        .eq(isRetail ? 'transaction_id' : 'invoice_id', invoiceId)
        .eq('branch_id', activeBranchId); // 🔥 STRICT BRANCH FILTER

      if (fetchErr) {
        throw new Error(`Failed to fetch items: ${fetchErr.message}`);
      }

      // 🟢 3. Restore Stock & Batches for EVERY row found
      if (items && items.length > 0) {
        for (const item of items) {
          // Skip if row is already voided to prevent double-restoring stock
          if (item.status === 'Voided' || item.delivery_status === 'Voided') continue;

          const qty = Number(item.qty) || 0;
          const riceName = (item.custom_rice_type || item.rice_type || '').trim();
          const isSpecial = riceName.includes('បានប្រើ') || riceName.includes('សេវាដឹក');
          
          if (qty !== 0 && !isSpecial) {
            // 🟢 ROBUST ID RESOLUTION: Match by product_id OR rice_type name (case-insensitive)
            let productId = item.product_id;
            if (!productId && riceName) {
              const { data: prodByName } = await supabase
                .from('products')
                .select('id')
                .eq('branch_id', activeBranchId)
                .ilike('name', riceName)
                .maybeSingle();
              if (prodByName) {
                productId = prodByName.id;
              }
            }

            if (productId) {
              // A. Restore Master Stock (Works for retail kg AND wholesale bags!)
              const { data: prod } = await supabase
                .from('products')
                .select('stock, cost_price')
                .eq('id', productId)
                .eq('branch_id', activeBranchId)
                .maybeSingle();

              if (prod) {
                // Atomically restores stock safely, bypassing frontend state
                await supabase.rpc('adjust_product_stock', { p_product_id: productId, p_quantity: qty });
              } else {
                console.warn(`Product not found for ID: ${productId}`);
              }

              // B. Restore Inventory Batch
              const { data: batchesInv } = await supabase.from('inventory_batches')
                .select('*')
                .eq('product_id', productId)
                .eq('branch_id', activeBranchId)
                .order('id', { ascending: false })
                .limit(1); 
              
              if (batchesInv && batchesInv.length > 0) {
                // Atomically restores batch stock safely
                await supabase.rpc('adjust_batch_stock', { p_batch_id: batchesInv[0].id, p_quantity: qty });
              } else {
                await supabase.from('inventory_batches').insert([{
                  product_id: productId,
                  product_name: riceName || 'Unknown Product',
                  cost_price: item.cogs_price || prod?.cost_price || 0,
                  remaining_qty: qty,
                  branch_id: activeBranchId // 🔥 STAMPED
                }]);
              }

              // C. Reverse FIFO Batches (Subtract from sold_qty in price_history)
              let remainingToReverse = qty;
              const { data: batches } = await supabase.from('price_history')
                .select('*')
                .eq('product_id', productId)
                .eq('branch_id', activeBranchId)
                .gt('sold_qty', 0)
                .order('created_at', { ascending: false }); 
              
              if (batches) {
                for (const b of batches) {
                  if (remainingToReverse <= 0) break;
                  const possibleToReverse = Math.min(b.sold_qty, remainingToReverse);
                  await supabase.from('price_history')
                    .update({ sold_qty: b.sold_qty - possibleToReverse })
                    .eq('id', b.id);
                  remainingToReverse -= possibleToReverse;
                }
              }
            } else {
              console.warn(`Could not resolve productId for item: ${riceName}`);
            }
          }
        }
      }

      // 🟢 4. Delete Line Items from Database (Wholesale & Retail)
      if (!isRetail) {
        await supabase.from('sales').delete().eq('invoice_id', invoiceId).eq('branch_id', activeBranchId);
      } else {
        // 🔥 FIX: Successfully delete retail rows from the database!
        await supabase.from('retail_sales').delete().eq('transaction_id', invoiceId).eq('branch_id', activeBranchId);
      }

      // 🟢 5. Delete Payments (Removes from Cash on Hand)
      await supabase.from('invoice_payments').delete().eq('invoice_id', invoiceId).eq('branch_id', activeBranchId);

      // 🟢 6. Update Master Status (Wholesale only, since retail rows are deleted)
      if (!isRetail) {
        await supabase.from('invoice_summaries').update({ 
          delivery_status: 'Voided',
          balance_due: 0,
          is_done: true
        }).eq('invoice_id', invoiceId).eq('branch_id', activeBranchId);
      }

      showToast('success', 'Transaction Voided', `Transaction ${invoiceId} was successfully voided!`);
      
      setSelectedInvoices(new Set());
      await fetchInvoices();

    } catch (error: any) {
      console.error("Void failed:", error);
      showToast('error', 'Void Failed', `Error voiding transaction: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  // --- SELECTION & BULK ACTIONS ---
  const toggleSelect = (invoiceId: string) => {
    const next = new Set(selectedInvoices)
    next.has(invoiceId) ? next.delete(invoiceId) : next.add(invoiceId)
    setSelectedInvoices(next)
  }

  const toggleSelectAll = () => {
    if (selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(processedInvoices.map(inv => inv.invoice_id)))
    }
  }

  const deleteSelected = async () => {
    if (!confirm(`Are you sure you want to permanently delete the image files for ${selectedInvoices.size} invoice(s)?`)) return;
    
    setIsLoading(true);
    const idsToUpdate = Array.from(selectedInvoices);
    
    const filesToDelete = invoices
      .filter(inv => selectedInvoices.has(inv.invoice_id) && inv.invoice_url)
      .map(inv => {
        const parts = inv.invoice_url.split('/');
        return parts[parts.length - 1]; 
      });

    try {
      if (filesToDelete.length > 0) {
        const { error: storageError } = await supabase.storage.from('invoices').remove(filesToDelete);
        if (storageError) console.error("Storage deletion warning:", storageError);
      }

      const { error: salesError } = await supabase.from('sales').update({ invoice_url: null }).in('invoice_id', idsToUpdate).eq('branch_id', activeBranchId);
      const { error: summaryError } = await supabase.from('invoice_summaries').update({ invoice_url: null }).in('invoice_id', idsToUpdate).eq('branch_id', activeBranchId);

      if (salesError || summaryError) {
        showToast('error', 'Deletion Failed', 'Database Blocked the Update!');
      } else {
        setSelectedInvoices(new Set());
        showToast('success', 'Images Cleared', 'Selected invoice images were successfully removed.');
        await fetchInvoices(); 
      }
    } catch (error: any) {
      console.error("Deletion failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const forceDownload = async (url: string, id: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Invoice-${id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download silently", err);
    }
  }

  const handleAction = async (url: string, id: string) => {
    if (!url) {
      showToast('error', 'No Image', 'No image exists for this walk-in transaction.');
      return;
    }
    if (isDeviceMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], `Invoice-${id}.jpg`, { type: 'image/jpeg' });
        
        await navigator.share({
          files: [file],
          title: `Invoice ${id}`
        });
      } catch (err) {
        forceDownload(url, id); 
      }
    } else {
      forceDownload(url, id); 
    }
  }

  const handleBulkAction = async () => {
    const selectedData = invoices.filter(inv => selectedInvoices.has(inv.invoice_id) && inv.invoice_url);

    if (isDeviceMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const files = await Promise.all(selectedData.map(async (inv) => {
          const res = await fetch(inv.invoice_url);
          const blob = await res.blob();
          return new File([blob], `Invoice-${inv.invoice_id}.jpg`, { type: 'image/jpeg' });
        }));

        await navigator.share({ 
          files, 
          title: `Saved Invoices (${files.length})` 
        });
      } catch (err) {
        console.error("Bulk share error:", err);
      }
    } else {
      selectedData.forEach((inv, index) => {
        setTimeout(() => forceDownload(inv.invoice_url, inv.invoice_id), index * 400);
      });
    }
  }

  // 🟢 HELPER: Classify invoice into 3 main buckets
  const getInvoiceCategory = (inv: Invoice): 'Wholesale' | 'WalkinWholesale' | 'WalkinRetail' => {
    if (inv.is_retail) return 'WalkinRetail';
    const name = (inv.customer_name || '').toLowerCase().trim();
    if (name === 'walk-in' || name === 'walk in') {
      return 'WalkinWholesale';
    }
    return 'Wholesale';
  };

  // --- CLIENT-SIDE SEARCH & FILTER DYNAMICS ---
  const processedInvoices = invoices
    .filter(inv => {
      const isVoided = inv.delivery_status === 'Voided';
      const cat = getInvoiceCategory(inv);

      // 1. Hide voided items when viewing active category tabs
      if (categoryTab !== 'Voided' && isVoided) return false;

      // 2. Filter by active category tab
      if (categoryTab === 'Wholesale' && cat !== 'Wholesale') return false;
      if (categoryTab === 'WalkinWholesale' && cat !== 'WalkinWholesale') return false;
      if (categoryTab === 'WalkinRetail' && cat !== 'WalkinRetail') return false;

      // 3. Filter by sub-tabs when inside the 'Voided' tab
      if (categoryTab === 'Voided') {
        if (!isVoided) return false;
        if (voidSubTab === 'Wholesale' && cat !== 'Wholesale') return false;
        if (voidSubTab === 'WalkinWholesale' && cat !== 'WalkinWholesale') return false;
        if (voidSubTab === 'WalkinRetail' && cat !== 'WalkinRetail') return false;
      }

      // 🚀 Debounced fast search
      if (!debouncedSearch) return true;
      const term = debouncedSearch.toLowerCase().trim();
      return (
        inv.invoice_id?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term) ||
        inv.rice_types?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (!mounted) return null;

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="saas-page-title">🖼️ Invoice Image Gallery</h1>
        </div>
      </div>

      {/* 🟢 TOP TABS: WHOLESALE, WALK-IN WHOLESALE, WALK-IN RETAIL, VOIDED */}
      <div className="saas-tab-container hide-scrollbar" style={{ width: 'fit-content', border: 'none', padding: 0, boxShadow: 'none', background: 'transparent', marginBottom: categoryTab === 'Voided' ? '8px' : '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => { setCategoryTab('All'); setSelectedInvoices(new Set()); setViewMode('table'); }} 
          className={`saas-tab ${categoryTab === 'All' ? 'active' : ''}`}
          style={categoryTab === 'All' ? { background: '#10b981', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          ✅ All Active
        </button>
        <button 
          onClick={() => { setCategoryTab('Wholesale'); setSelectedInvoices(new Set()); setViewMode('grid'); }} 
          className={`saas-tab ${categoryTab === 'Wholesale' ? 'active' : ''}`}
          style={categoryTab === 'Wholesale' ? { background: '#10b981', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          🌾 Wholesale
        </button>
        <button 
          onClick={() => { setCategoryTab('WalkinWholesale'); setSelectedInvoices(new Set()); setViewMode('table'); }} 
          className={`saas-tab ${categoryTab === 'WalkinWholesale' ? 'active' : ''}`}
          style={categoryTab === 'WalkinWholesale' ? { background: '#10b981', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          🏬 Walk-in Wholesale
        </button>
        <button 
          onClick={() => { setCategoryTab('WalkinRetail'); setSelectedInvoices(new Set()); setViewMode('table'); }} 
          className={`saas-tab ${categoryTab === 'WalkinRetail' ? 'active' : ''}`}
          style={categoryTab === 'WalkinRetail' ? { background: '#10b981', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          🛍️ Walk-in Retail
        </button>
        <button 
          onClick={() => { setCategoryTab('Voided'); setVoidSubTab('All'); setSelectedInvoices(new Set()); setViewMode('table'); }} 
          className={`saas-tab ${categoryTab === 'Voided' ? 'active' : ''}`}
          style={categoryTab === 'Voided' ? { background: '#ef4444', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          ❌ Voided
        </button>
      </div>

      {/* 🟢 3 SUB-TABS WHEN INSIDE 'VOIDED' TAB */}
      {categoryTab === 'Voided' && (
        <div className="saas-tab-container hide-scrollbar" style={{ width: 'fit-content', border: 'none', padding: '4px 6px', boxShadow: 'none', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setVoidSubTab('All')} 
            className={`saas-tab ${voidSubTab === 'All' ? 'active' : ''}`}
            style={voidSubTab === 'All' ? { background: '#dc2626', color: '#fff', fontSize: '12px', padding: '6px 12px' } : { background: 'transparent', color: '#991b1b', fontSize: '12px', padding: '6px 12px', border: 'none' }}
          >
            All Voided
          </button>
          <button 
            onClick={() => setVoidSubTab('Wholesale')} 
            className={`saas-tab ${voidSubTab === 'Wholesale' ? 'active' : ''}`}
            style={voidSubTab === 'Wholesale' ? { background: '#dc2626', color: '#fff', fontSize: '12px', padding: '6px 12px' } : { background: 'transparent', color: '#991b1b', fontSize: '12px', padding: '6px 12px', border: 'none' }}
          >
            Wholesale
          </button>
          <button 
            onClick={() => setVoidSubTab('WalkinWholesale')} 
            className={`saas-tab ${voidSubTab === 'WalkinWholesale' ? 'active' : ''}`}
            style={voidSubTab === 'WalkinWholesale' ? { background: '#dc2626', color: '#fff', fontSize: '12px', padding: '6px 12px' } : { background: 'transparent', color: '#991b1b', fontSize: '12px', padding: '6px 12px', border: 'none' }}
          >
            Walk-in Wholesale
          </button>
          <button 
            onClick={() => setVoidSubTab('WalkinRetail')} 
            className={`saas-tab ${voidSubTab === 'WalkinRetail' ? 'active' : ''}`}
            style={voidSubTab === 'WalkinRetail' ? { background: '#dc2626', color: '#fff', fontSize: '12px', padding: '6px 12px' } : { background: 'transparent', color: '#991b1b', fontSize: '12px', padding: '6px 12px', border: 'none' }}
          >
            Walk-in Retail
          </button>
        </div>
      )}

      {/* FILTER TABS & SEARCH CONTAINER */}
      <div className="saas-card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            <input 
              type="text"
              placeholder="🔍 Search ID, Customer, or Rice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              className="saas-input"
              style={{ minWidth: '200px', flex: 1 }}
            />
            
            <div className="saas-tab-container hide-scrollbar" style={{ margin: 0, padding: '4px', background: '#f1f5f9', border: 'none', boxShadow: 'none' }}>
              {(['All', 'Today', 'This Week', 'This Month'] as FilterTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`saas-tab ${filterTab === tab ? 'active' : ''}`}
                  style={filterTab === tab ? { background: '#0f172a', color: '#fff', padding: '8px 16px' } : { padding: '8px 16px' }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="saas-tab-container hide-scrollbar" style={{ margin: 0, padding: '4px', background: '#e2e8f0', border: 'none', boxShadow: 'none' }}>
            <button onClick={() => setViewMode('grid')} className={`saas-tab ${viewMode === 'grid' ? 'active' : ''}`} style={viewMode === 'grid' ? { background: '#10b981', color: '#fff', padding: '8px 16px' } : { padding: '8px 16px' }}>Grid</button>
            <button onClick={() => setViewMode('table')} className={`saas-tab ${viewMode === 'table' ? 'active' : ''}`} style={viewMode === 'table' ? { background: '#10b981', color: '#fff', padding: '8px 16px' } : { padding: '8px 16px' }}>Table</button>
          </div>
          
        </div>

        {/* Global Action Modifiers */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <button onClick={toggleSelectAll} disabled={processedInvoices.length === 0} className="saas-btn saas-btn-secondary">
            {selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0 ? 'Deselect All' : 'Select All'}
          </button>

          {selectedInvoices.size > 0 && (
            <>
              <button onClick={deleteSelected} className="saas-btn saas-btn-danger">
                Clear Images ({selectedInvoices.size})
              </button>
              <button onClick={handleBulkAction} className="saas-btn saas-btn-primary">
                {isDeviceMobile ? `Share (${selectedInvoices.size})` : `Download (${selectedInvoices.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* CONTENT AREA */}
      {isLoading ? (
        viewMode === 'table' ? (
          <div className="saas-table-wrapper">
            <div className="saas-table-responsive">
              <table className="saas-table">
                <tbody>
                  <TableSkeleton columns={7} rows={6} />
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading records...</div>
        )
      ) : processedInvoices.length === 0 ? (
        <EmptyState 
          icon="🖼️" 
          title="No records found" 
          message="Adjust your tabs, search term, or date ranges to see more results." 
        />
      ) : viewMode === 'grid' ? (
        
        /* --- GRID VIEW --- */
        <div className="grid-layout">
          {processedInvoices.map((inv) => {
            const isSelected = selectedInvoices.has(inv.invoice_id);
            const isVoided = inv.delivery_status === 'Voided';

            return (
              <div key={inv.id} className={`saas-card ${isSelected ? 'selected-grid-card' : ''} ${isVoided ? 'voided-grid-card' : ''}`} style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} className="card-checkbox" />

                <div onClick={() => toggleSelect(inv.invoice_id)} className="card-image-box">
                  {inv.invoice_url ? (
                    <img src={inv.invoice_url} alt="Invoice Document" className={`card-img ${isSelected ? 'img-selected' : ''}`} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '14px', background: '#f8fafc' }}>
                      No Image (Retail Sale)
                    </div>
                  )}
                  {isVoided && (
                    <div className="void-overlay">
                      <span className="void-stamp">VOID</span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div className={`saas-card-title ${isVoided ? 'voided-text' : ''}`} style={{ fontSize: '15px', color: '#0f172a', margin: 0 }}>{inv.invoice_id}</div>
                  <div style={{ fontSize: '14px', color: '#475569', marginTop: '6px', fontWeight: 'bold' }}>Customer: {inv.customer_name}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.rice_types}>
                    🌾 {inv.rice_types}
                  </div>
                  <div style={{ fontSize: '16px', color: '#b58a3d', marginTop: '8px', fontWeight: 'bold' }}>💰 {formatRiel(inv.total_sales)}</div>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', marginTop: 'auto' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', fontWeight: 'bold' }}>{formatDate(inv.created_at)}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* 🚨 VOID BUTTON FIRST IN ACTION GROUP */}
                    {!isVoided && (
                      <button onClick={() => handleVoidInvoice(inv.invoice_id)} disabled={isProcessing} className="saas-btn" style={{ flex: 1, padding: '8px 4px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 'bold' }}>
                        🚨 Void
                      </button>
                    )}
                    {!isVoided && !inv.is_retail && (
                      <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="saas-btn" style={{ flex: 1, padding: '8px 4px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde047' }}>
                        Edit
                      </button>
                    )}
                    {inv.invoice_url && (
                      <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="saas-btn saas-btn-secondary" style={{ flex: 1, padding: '8px 4px' }}>
                        {isDeviceMobile ? 'Share' : 'Download'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        /* --- TABLE VIEW --- */
        <div className="saas-table-wrapper">
          <div className="saas-table-responsive">
            <table className="saas-table">
              <thead>
                <tr>
                  <th className="saas-th" style={{ width: '40px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                  </th>
                  {/* 🚨 FIRST COLUMN: DEDICATED FOR VOID ONLY */}
                  <th className="saas-th" style={{ width: '80px', textAlign: 'center' }}>Void</th>
                  <th className="saas-th">Invoice ID</th>
                  <th className="saas-th">Customer</th>
                  <th className="saas-th">Items Sold</th>
                  <th className="saas-th" style={{ textAlign: 'right' }}>Total Amount</th>
                  <th className="saas-th">Date</th>
                  <th className="saas-th" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {processedInvoices.map((inv) => {
                  const isSelected = selectedInvoices.has(inv.invoice_id);
                  const isVoided = inv.delivery_status === 'Voided';

                  return (
                    <tr key={inv.id} className={`saas-tr ${isSelected ? 'selected' : ''} ${isVoided ? 'row-voided' : ''}`}>
                      <td className="saas-td" style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                      </td>
                      
                      {/* 🚨 FIRST COLUMN VOID BUTTON */}
                      <td className="saas-td" style={{ textAlign: 'center' }}>
                        {!isVoided ? (
                          <button onClick={() => handleVoidInvoice(inv.invoice_id)} disabled={isProcessing} className="saas-btn" style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 'bold', fontSize: '11px', borderRadius: '6px', cursor: 'pointer' }}>
                            🚨 Void
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#991b1b' }}>VOIDED</span>
                        )}
                      </td>

                      <td className={`saas-td ${isVoided ? 'voided-text' : ''}`} style={{ fontWeight: 'bold' }}>{inv.invoice_id}</td>
                      <td className="saas-td" style={{ fontWeight: 'bold' }}>{inv.customer_name}</td>
                      <td className="saas-td" style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }} title={inv.rice_types}>
                        {inv.rice_types}
                      </td>
                      <td className="saas-td" style={{ textAlign: 'right', fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(inv.total_sales)}</td>
                      <td className="saas-td" style={{ color: '#475569' }}>{formatDate(inv.created_at)}</td>
                      <td className="saas-td" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {!isVoided && !inv.is_retail && (
                            <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="saas-btn" style={{ padding: '6px 12px', background: '#fef3c7', color: '#b45309', border: 'none', fontSize: '12px' }}>Edit</button>
                          )}
                          {inv.invoice_url && (
                            <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="saas-btn saas-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                              {isDeviceMobile ? 'Share' : 'Download'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- PAGE SPECIFIC CSS --- */}
      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .img-selected { opacity: 0.7; }
        .voided-text { text-decoration: line-through; }
        .row-voided { background: #fef2f2 !important; opacity: 0.8; }
        .row-voided td { color: #991b1b !important; }

        .selected-grid-card {
          border: 2px solid #b58a3d !important;
          background: #fefcf3 !important;
          box-shadow: 0 4px 12px rgba(181, 138, 61, 0.15) !important;
        }
        .voided-grid-card {
          border-color: #fca5a5 !important;
          background: #fef2f2 !important;
        }

        .grid-layout {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }
        .card-checkbox {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 10;
          cursor: pointer;
          accent-color: #b58a3d;
          width: 22px;
          height: 22px;
        }
        .card-image-box {
          width: 100%;
          height: 220px;
          overflow: hidden;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          cursor: pointer;
          position: relative;
        }
        .card-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .void-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(239, 68, 68, 0.15);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }
        .void-stamp {
          color: #ef4444;
          font-weight: 900;
          font-size: 32px;
          border: 4px solid #ef4444;
          padding: 8px 16px;
          border-radius: 8px;
          transform: rotate(-30deg);
          background: rgba(255,255,255,0.85);
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px; 
          gap: 12px;
          min-height: 42px; 
          width: 100%;
          max-width: 1600px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        @media (max-width: 1023px) { 
          .header-container { 
            margin-left: 54px !important; 
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