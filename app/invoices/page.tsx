'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { useToast } from '@/components/ToastProvider'
import { formatRiel } from '@/utils/formatters'

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

      // 5. 🔥 FIX: Update Master Invoice to Voided Status AND is_done: true (Hides from Delivery Page)
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

      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        inv.invoice_id?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Always newest first naturally

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (!mounted) return null;

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">🖼️ Invoice Image Gallery</h1>
        </div>
      </div>

      {/* NEW: STATUS FILTER TABS */}
      <div className="status-tabs-container">
        <button 
          onClick={() => { setStatusFilter('Active'); setSelectedInvoices(new Set()); }} 
          className={`status-tab ${statusFilter === 'Active' ? 'active' : ''}`}
        >
          ✅ Valid Invoices
        </button>
        <button 
          onClick={() => { setStatusFilter('Voided'); setSelectedInvoices(new Set()); }} 
          className={`status-tab void-tab ${statusFilter === 'Voided' ? 'active' : ''}`}
        >
          ❌ Voided Invoices
        </button>
      </div>

      {/* FILTER TABS & SEARCH CONTAINER */}
      <div className="toolbar-container">
        
        {/* Time Filter Tabs */}
        <div className="tab-group">
          {(['All', 'Today', 'This Week', 'This Month'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`tab-btn ${filterTab === tab ? 'active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Live Text Search Field */}
        <div className="search-box-wrapper">
          <input 
            type="text"
            placeholder="🔍 Search ID or Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur(); 
              }
            }}
            className="search-input"
          />
        </div>

        {/* Layout Toggle Buttons */}
        <div className="view-toggle-container">
          <button onClick={() => setViewMode('grid')} className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}>Grid</button>
          <button onClick={() => setViewMode('table')} className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}>Table</button>
        </div>

        {/* Global Action Modifiers */}
        <div className="actions-wrapper">
          <button onClick={toggleSelectAll} disabled={processedInvoices.length === 0} className="secondary-action-btn">
            {selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0 ? 'Deselect All' : 'Select All'}
          </button>

          {selectedInvoices.size > 0 && (
            <>
              <button onClick={deleteSelected} className="danger-action-btn">
                Clear ({selectedInvoices.size})
              </button>
              <button onClick={handleBulkAction} className="primary-action-btn">
                {isDeviceMobile ? `Share (${selectedInvoices.size})` : `Download (${selectedInvoices.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* CONTENT AREA */}
      {isLoading ? (
        <p className="status-message">Loading records...</p>
      ) : processedInvoices.length === 0 ? (
        <div className="empty-message-box">
          No records found matching the chosen filters.
        </div>
      ) : viewMode === 'grid' ? (
        
        /* --- GRID VIEW --- */
        <div className="grid-layout">
          {processedInvoices.map((inv) => {
            const isSelected = selectedInvoices.has(inv.invoice_id);
            const isVoided = inv.delivery_status === 'Voided';

            return (
              <div key={inv.id} className={`grid-card ${isSelected ? 'selected' : ''} ${isVoided ? 'voided-card' : ''}`}>
                
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} className="card-checkbox" />

                <div onClick={() => toggleSelect(inv.invoice_id)} className="card-image-box">
                  <img src={inv.invoice_url} alt="Invoice Document File" className={`card-img ${isSelected ? 'img-selected' : ''}`} />
                  {isVoided && (
                    <div className="void-overlay">
                      <span className="void-stamp">VOID</span>
                    </div>
                  )}
                </div>

                <div className="card-body">
                  <div className={`card-id-title ${isVoided ? 'voided-text' : ''}`}>{inv.invoice_id}</div>
                  <div className="card-customer-row">Customer: {inv.customer_name}</div>
                  <div className="card-amount-row">💰 {formatRiel(inv.total_sales)}</div>
                </div>

                <div className="card-footer">
                  <div className="card-date-label">{formatDate(inv.created_at)}</div>
                  
                  <div className="card-action-buttons">
                    {!isVoided && <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="card-edit-btn">Edit</button>}
                    {!isVoided && <button onClick={() => handleVoidInvoice(inv.invoice_id)} className="card-void-btn">Void</button>}
                    <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="card-download-btn">
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
        <div className="table-responsive-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="gallery-th-check">
                  <input type="checkbox" checked={selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0} onChange={toggleSelectAll} className="gallery-checkbox" />
                </th>
                <th className="gallery-th">Invoice ID</th>
                <th className="gallery-th">Customer</th>
                <th className="gallery-th">Total Amount</th>
                <th className="gallery-th">Date</th>
                <th className="gallery-th-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedInvoices.map((inv) => {
                const isSelected = selectedInvoices.has(inv.invoice_id);
                const isVoided = inv.delivery_status === 'Voided';

                return (
                  <tr key={inv.id} className={`${isSelected ? 'row-selected' : ''} ${isVoided ? 'row-voided' : ''}`}>
                    <td className="gallery-td-check">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} className="gallery-checkbox" />
                    </td>
                    <td className={`gallery-td-bold ${isVoided ? 'voided-text' : ''}`}>{inv.invoice_id}</td>
                    <td className="gallery-td-bold text-slate">{inv.customer_name}</td>
                    <td className="gallery-td-bold text-gold">{formatRiel(inv.total_sales)}</td>
                    <td className="gallery-td text-slate-light">{formatDate(inv.created_at)}</td>
                    <td className="gallery-td">
                      <div className="gallery-action-group">
                        {!isVoided && <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="table-edit-btn">Edit</button>}
                        {!isVoided && <button onClick={() => handleVoidInvoice(inv.invoice_id)} className="table-void-btn">Void</button>}
                        <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} className="table-download-btn">
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
      )}

      {/* --- REINFORCED STYLING FOR RESPONSIVENESS --- */}
      <style jsx global>{`
        /* DE-INLINED CSS CLASSES */
        .img-selected { opacity: 0.7; }
        .voided-text { text-decoration: line-through; }
        
        .gallery-th { padding: 16px; color: #0f172a; text-align: left; }
        .gallery-th-center { padding: 16px; color: #0f172a; text-align: center; }
        .gallery-th-check { width: 50px; text-align: center; padding: 16px; }
        
        .gallery-td { padding: 16px; }
        .gallery-td-bold { padding: 16px; font-weight: bold; }
        .gallery-td-check { text-align: center; padding: 16px; }
        
        .text-slate { color: #334155; }
        .text-slate-light { color: #475569; }
        .text-gold { color: #b58a3d; }
        
        .gallery-checkbox { width: 18px; height: 18px; accent-color: #b58a3d; cursor: pointer; }
        .gallery-action-group { display: flex; gap: 8px; justify-content: center; }

        /* 🔥 DESKTOP LAYOUT */
        .main-wrapper { 
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #0f172a;
          width: 100%;
          
          /* 👇 DESKTOP SCROLL FIX 👇 */
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
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

        /* NEW STATUS TABS */
        .status-tabs-container {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .status-tab {
          padding: 10px 20px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          font-weight: bold;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .status-tab.active {
          background: #10b981;
          color: #ffffff;
          border-color: #10b981;
        }
        .status-tab.void-tab.active {
          background: #ef4444;
          border-color: #ef4444;
        }

        /* TOOLBAR CONFIGURATION */
        .toolbar-container {
          background: #ffffff; 
          padding: 16px 20px; 
          border-radius: 12px; 
          border: 1px solid #cbd5e1; 
          margin-bottom: 20px; 
          display: flex; 
          gap: 16px; 
          align-items: center; 
          flex-wrap: wrap; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }

        /* FILTER TABS */
        .tab-group {
          display: flex;
          background: #f1f5f9;
          padding: 4px;
          border-radius: 8px;
          gap: 2px;
        }
        .tab-btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          font-weight: bold;
          cursor: pointer;
          font-size: 14px;
          background: transparent;
          color: #475569;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: #b58a3d;
          color: #ffffff;
        }

        /* LIVE SEARCH FIELD */
        .search-box-wrapper {
          flex: 1;
          min-width: 200px;
        }
        .search-input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 16px; 
          outline: none;
          color: #0f172a;
          background-color: #ffffff;
          box-sizing: border-box;
        }
        .search-input:focus {
          border-color: #b58a3d;
          box-shadow: 0 0 0 2px rgba(181, 138, 61, 0.2);
        }

        /* VIEW TOGGLE LAYOUT BUTTONS */
        .view-toggle-container {
          display: flex;
          background: #e2e8f0;
          padding: 4px;
          border-radius: 8px;
          gap: 2px;
        }
        .toggle-btn {
          padding: 8px 14px;
          border-radius: 6px;
          border: none;
          font-weight: bold;
          cursor: pointer;
          font-size: 13px;
          background: transparent;
          color: #475569;
        }
        .toggle-btn.active {
          background: #10b981;
          color: #ffffff;
        }

        /* GLOBAL BUTTONS WITH HIGH-CONTRAST LABELS */
        .actions-wrapper {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .secondary-action-btn {
          padding: 10px 16px;
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #94a3b8;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
        }
        .secondary-action-btn:disabled {
          background: #f1f5f9;
          color: #94a3b8;
          border-color: #cbd5e1;
          cursor: not-allowed;
        }
        .primary-action-btn {
          padding: 10px 16px;
          background: #3b82f6;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
        }
        .danger-action-btn {
          padding: 10px 16px;
          background: #ef4444;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
        }

        /* GRID VIEW ELEMENTS */
        .grid-layout {
          display: grid;
          /* 🔥 FIX: Wider 340px minimum width so buttons fit perfectly */
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }
        .grid-card {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .grid-card.selected {
          border: 2px solid #b58a3d;
          background: #fefcf3;
          box-shadow: 0 4px 12px rgba(181, 138, 61, 0.15);
        }
        
        /* VOIDED CARD STYLES */
        .voided-card {
          border-color: #fca5a5 !important;
          background: #fef2f2 !important;
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

        .card-checkbox {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 10;
          cursor: pointer;
          accentColor: #b58a3d;
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
        .card-body {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .card-id-title {
          font-weight: bold;
          color: #0f172a;
          font-size: 15px;
        }
        .card-customer-row {
          font-size: 14px;
          color: #475569;
          margin-top: 6px;
          font-weight: bold;
        }
        .card-amount-row {
          font-size: 16px;
          color: #b58a3d;
          margin-top: 6px;
          font-weight: bold;
        }

        /* 🔥 FIX: Vertically stacked footer for perfect button alignment */
        .card-footer {
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
          background: #f8fafc;
          margin-top: auto;
        }
        .card-date-label {
          font-size: 13px;
          color: #64748b;
          text-align: center;
          font-weight: 500;
        }
        .card-action-buttons {
          display: flex;
          gap: 8px;
        }
        .card-edit-btn {
          flex: 1;
          padding: 8px 4px;
          text-align: center;
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde047;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }
        .card-void-btn {
          flex: 1;
          padding: 8px 4px;
          text-align: center;
          background: #fee2e2;
          color: #dc2626;
          border: 1px solid #fca5a5;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }
        .card-download-btn {
          flex: 1;
          padding: 8px 4px;
          text-align: center;
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }

        /* TABLE VIEW ELEMENTS */
        .table-responsive-wrapper {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          overflow-x: auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          textAlign: left;
          font-size: 14px;
        }
        .data-table th {
          background: #f8fafc;
          border-bottom: 2px solid #cbd5e1;
          font-weight: bold;
        }
        .data-table tr {
          border-bottom: 1px solid #e2e8f0;
          transition: background 0.2s;
        }
        .data-table tr.row-selected {
          background: #fefcf3;
        }
        .row-voided {
          background: #fef2f2 !important;
          opacity: 0.8;
        }
        .row-voided td {
          color: #991b1b !important;
        }
        .table-edit-btn {
          padding: 8px 14px;
          background: #fef3c7;
          color: #b45309;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }
        .table-void-btn {
          padding: 8px 14px;
          background: #fee2e2;
          color: #dc2626;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }
        .table-download-btn {
          padding: 8px 14px;
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
        }

        .status-message {
          color: #475569;
          font-size: 16px;
          text-align: center;
          padding: 40px;
        }
        .empty-message-box {
          padding: 40px;
          text-align: center;
          color: #475569;
          background: #ffffff;
          border-radius: 12px;
          border: 2px dashed #cbd5e1;
          font-size: 16px;
          font-weight: bold;
        }

        /* MATCHED MOBILE OVERRIDES */
        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 16px 16px !important; 
            height: 100dvh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }
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
          .page-title {
            font-size: 21px !important; 
            line-height: normal !important; 
            white-space: nowrap !important; 
          }
          
          .toolbar-container {
            flex-direction: column;
            align-items: stretch;
            padding: 14px;
            gap: 12px;
          }
          .tab-group, .view-toggle-container, .search-box-wrapper, .actions-wrapper {
            width: 100%;
          }
          .tab-group {
            justify-content: space-between;
          }
          .tab-btn {
            flex: 1;
            text-align: center;
            padding: 10px 4px;
            font-size: 13px;
          }
          .actions-wrapper {
            flex-direction: column;
          }
          .secondary-action-btn, .primary-action-btn, .danger-action-btn {
            width: 100%;
            text-align: center;
            padding: 12px;
          }
        }
      `}</style>
    </div>
  )
}