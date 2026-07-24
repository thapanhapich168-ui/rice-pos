'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { useToast } from '@/components/ToastProvider'
import { formatRiel } from '@/utils/formatters'
import { useDebounce } from '@/lib/useDebounce'
import TableSkeleton from '@/components/TableSkeleton'
import EmptyState from '@/components/EmptyState'

// --- TYPESCRIPT INTERFACES ---
interface Invoice {
  id: string;
  invoice_id: string;
  fileName: string;
  invoice_url: string;
  created_at: string;
  customer_name: string;
  total_sales: number;
  delivery_status: string;
}

type FilterTab = 'All' | 'Today' | 'This Week' | 'This Month';
type StatusTab = 'Active' | 'Voided';

export default function InvoiceGallery() {
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState<boolean>(false)
  const [mounted, setMounted] = useState<boolean>(false)
  
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab] = useState<FilterTab>('All')
  const [statusFilter, setStatusFilter] = useState<StatusTab>('Active')
  
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedSearch = useDebounce(searchQuery, 300) // 🚀 Lightning fast mobile search

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  useEffect(() => {
    setMounted(true);
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices();
  }, [filterTab])

  // 🚀 NEW: Window Focus Auto-Refresh
  useFocusRefresh(fetchInvoices);

  async function fetchInvoices() {
    setIsLoading(true)
    let query = supabase
      .from('invoice_summaries')
      .select('*')
      .not('invoice_url', 'is', null)

    const now = new Date()
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

    const { data, error } = await query
    if (error) {
      console.error("Error fetching data from Supabase:", error.message)
    }
    setInvoices(data || [])
    setIsLoading(false)
  }

  // --- SAFE VOID AUTOMATION ---
  const handleVoidInvoice = async (invoiceId: string) => {
    if (!confirm(`🚨 Are you sure you want to VOID invoice ${invoiceId}?\n\nThis will instantly:\n1. Restore bags to your stock\n2. Reverse the profit/COGS math\n3. Delete all payment records\n4. Mark this invoice as voided permanently`)) return;

    setIsLoading(true);
    try {
      const isRetail = invoiceId.startsWith('RET-');

      // 1. Fetch Line Items
      const { data: items } = await supabase
        .from(isRetail ? 'retail_sales' : 'sales')
        .select('*')
        .eq(isRetail ? 'transaction_id' : 'invoice_id', invoiceId);

      // 2. Restore Stock & Batches
      if (items && items.length > 0) {
        for (const item of items) {
          const qty = Number(item.qty) || 0;
          const isSpecial = (item.custom_rice_type || item.rice_type || '').includes('បានប្រើ') || 
                            (item.custom_rice_type || item.rice_type || '').includes('សេវាដឹក');
          
          if (qty !== 0 && !isSpecial && item.product_id) {
            // A. Restore Master Stock
            const { data: prod } = await supabase.from('products').select('stock, cost_price').eq('id', item.product_id).single();
            if (prod) {
              await supabase.from('products').update({ stock: Number(prod.stock) + qty }).eq('id', item.product_id);
            }

            // B. Restore Inventory Batch
            const { data: batchesInv } = await supabase.from('inventory_batches')
              .select('*')
              .eq('product_id', item.product_id)
              .order('id', { ascending: false })
              .limit(1); 
            
            if (batchesInv && batchesInv.length > 0) {
              await supabase.from('inventory_batches')
                .update({ remaining_qty: Number(batchesInv[0].remaining_qty) + qty })
                .eq('id', batchesInv[0].id);
            } else {
              await supabase.from('inventory_batches').insert([{
                product_id: item.product_id,
                product_name: item.rice_type || item.custom_rice_type || 'Unknown Product',
                cost_price: item.cogs_price || prod?.cost_price || 0,
                remaining_qty: qty
              }]);
            }

            // C. Reverse FIFO Batches (Subtract from sold_qty in price_history)
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
                await supabase.from('price_history')
                  .update({ sold_qty: b.sold_qty - possibleToReverse })
                  .eq('id', b.id);
                remainingToReverse -= possibleToReverse;
              }
            }
          }
        }
      }

      // 3. Delete Line Items
      await supabase.from(isRetail ? 'retail_sales' : 'sales').delete().eq(isRetail ? 'transaction_id' : 'invoice_id', invoiceId);

      // 4. Delete Payments (Removes from Cash on Hand)
      await supabase.from('invoice_payments').delete().eq('invoice_id', invoiceId);

      // 5. Update Master Invoice to Voided Status AND is_done: true
      await supabase.from('invoice_summaries').update({ 
        delivery_status: 'Voided',
        balance_due: 0,
        is_done: true
      }).eq('invoice_id', invoiceId);

      showToast('success', 'Invoice Voided', `Invoice ${invoiceId} was successfully voided!`);
      
      setSelectedInvoices(new Set());
      await fetchInvoices();

    } catch (error: any) {
      console.error("Void failed:", error);
      showToast('error', 'Void Failed', `Error voiding invoice: ${error.message}`);
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
      .filter(inv => selectedInvoices.has(inv.invoice_id))
      .map(inv => {
        const parts = inv.invoice_url.split('/');
        return parts[parts.length - 1]; 
      });

    try {
      if (filesToDelete.length > 0) {
        const { error: storageError } = await supabase.storage.from('invoices').remove(filesToDelete);
        if (storageError) console.error("Storage deletion warning:", storageError);
      }

      const { error: salesError } = await supabase.from('sales').update({ invoice_url: null }).in('invoice_id', idsToUpdate);
      const { error: summaryError } = await supabase.from('invoice_summaries').update({ invoice_url: null }).in('invoice_id', idsToUpdate);

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
    const selectedData = invoices.filter(inv => selectedInvoices.has(inv.invoice_id));

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

  // --- CLIENT-SIDE SEARCH & FILTER DYNAMICS ---
  const processedInvoices = invoices
    .filter(inv => {
      const isVoided = inv.delivery_status === 'Voided';
      if (statusFilter === 'Active' && isVoided) return false;
      if (statusFilter === 'Voided' && !isVoided) return false;

      // 🚀 Debounced fast search
      if (!debouncedSearch) return true;
      const term = debouncedSearch.toLowerCase().trim();
      return (
        inv.invoice_id?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term)
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

      {/* NEW: STATUS FILTER TABS */}
      <div className="saas-tab-container hide-scrollbar" style={{ width: 'fit-content', border: 'none', padding: 0, boxShadow: 'none', background: 'transparent', marginBottom: '16px' }}>
        <button 
          onClick={() => { setStatusFilter('Active'); setSelectedInvoices(new Set()); }} 
          className={`saas-tab ${statusFilter === 'Active' ? 'active' : ''}`}
          style={statusFilter === 'Active' ? { background: '#10b981', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          ✅ Valid Invoices
        </button>
        <button 
          onClick={() => { setStatusFilter('Voided'); setSelectedInvoices(new Set()); }} 
          className={`saas-tab ${statusFilter === 'Voided' ? 'active' : ''}`}
          style={statusFilter === 'Voided' ? { background: '#ef4444', color: '#fff' } : { border: '1px solid #cbd5e1', background: '#fff' }}
        >
          ❌ Voided Invoices
        </button>
      </div>

      {/* FILTER TABS & SEARCH CONTAINER */}
      <div className="saas-card" style={{ marginBottom: '24px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            <input 
              type="text"
              placeholder="🔍 Search ID or Customer..."
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
                Clear ({selectedInvoices.size})
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
          <TableSkeleton columns={6} rows={6} />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading records...</div>
        )
      ) : processedInvoices.length === 0 ? (
        <EmptyState 
          icon="🖼️" 
          title="No invoices found" 
          message="Adjust your filters or date ranges to see more results." 
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
                  <img src={inv.invoice_url} alt="Invoice Document" className={`card-img ${isSelected ? 'img-selected' : ''}`} />
                  {isVoided && (
                    <div className="void-overlay">
                      <span className="void-stamp">VOID</span>
                    </div>
                  )}
                </div>

                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                  <div className={`saas-card-title ${isVoided ? 'voided-text' : ''}`} style={{ fontSize: '15px', color: '#0f172a', margin: 0 }}>{inv.invoice_id}</div>
                  <div style={{ fontSize: '14px', color: '#475569', marginTop: '6px', fontWeight: 'bold' }}>Customer: {inv.customer_name}</div>
                  <div style={{ fontSize: '16px', color: '#b58a3d', marginTop: '6px', fontWeight: 'bold' }}>💰 {formatRiel(inv.total_sales)}</div>
                </div>

                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', marginTop: 'auto' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', fontWeight: 'bold' }}>{formatDate(inv.created_at)}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!isVoided && <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="saas-btn" style={{ flex: 1, padding: '8px 4px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde047' }}>Edit</button>}
                    {!isVoided && <button onClick={() => handleVoidInvoice(inv.invoice_id)} className="saas-btn" style={{ flex: 1, padding: '8px 4px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}>Void</button>}
                    <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="saas-btn saas-btn-secondary" style={{ flex: 1, padding: '8px 4px' }}>
                      {isDeviceMobile ? 'Share' : 'Download'}
                    </button>
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
                  <th className="saas-th" style={{ width: '50px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                  </th>
                  <th className="saas-th">Invoice ID</th>
                  <th className="saas-th">Customer</th>
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
                      <td className={`saas-td ${isVoided ? 'voided-text' : ''}`} style={{ fontWeight: 'bold' }}>{inv.invoice_id}</td>
                      <td className="saas-td" style={{ fontWeight: 'bold' }}>{inv.customer_name}</td>
                      <td className="saas-td" style={{ textAlign: 'right', fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(inv.total_sales)}</td>
                      <td className="saas-td" style={{ color: '#475569' }}>{formatDate(inv.created_at)}</td>
                      <td className="saas-td" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {!isVoided && <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="saas-btn" style={{ padding: '6px 12px', background: '#fef3c7', color: '#b45309', border: 'none', fontSize: '12px' }}>Edit</button>}
                          {!isVoided && <button onClick={() => handleVoidInvoice(inv.invoice_id)} className="saas-btn" style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', fontSize: '12px' }}>Void</button>}
                          <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="saas-btn saas-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            {isDeviceMobile ? 'Share' : 'Download'}
                          </button>
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