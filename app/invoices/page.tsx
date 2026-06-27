'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- TYPESCRIPT INTERFACES ---
interface Invoice {
  id: string;
  invoice_id: string;
  fileName: string;
  invoice_url: string;
  created_at: string;
  customer_name: string;
  total_sales: number;
}

type SortConfig = {
  key: keyof Invoice;
  direction: 'asc' | 'desc';
} | null;

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState<boolean>(false)
  const [mounted, setMounted] = useState<boolean>(false)
  
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  
  // View & Sort State
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  useEffect(() => {
    setMounted(true);
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices();
  }, [dateRange])

  async function fetchInvoices() {
    setIsLoading(true)
    let query = supabase
      .from('invoice_summaries')
      .select('*')
      .not('invoice_url', 'is', null) // Only fetch records that still have an image attached
      .order('created_at', { ascending: false })

    if (dateRange.start) query = query.gte('created_at', dateRange.start)
    if (dateRange.end) query = query.lte('created_at', dateRange.end + 'T23:59:59')

    const { data } = await query
    setInvoices(data || [])
    setIsLoading(false)
  }

  // --- SELECTION & BULK ACTIONS ---
  const toggleSelect = (invoiceId: string) => {
    const next = new Set(selectedInvoices)
    next.has(invoiceId) ? next.delete(invoiceId) : next.add(invoiceId)
    setSelectedInvoices(next)
  }

  const toggleSelectAll = () => {
    if (selectedInvoices.size === invoices.length && invoices.length > 0) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(invoices.map(inv => inv.invoice_id)))
    }
  }

  const deleteSelected = async () => {
    if (!confirm(`Are you sure you want to delete the image files for ${selectedInvoices.size} invoice(s)? Your financial data will remain safely in the database.`)) return;
    
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
        alert("Database Blocked the Update!");
      } else {
        setSelectedInvoices(new Set());
        await fetchInvoices(); 
      }
    } catch (error: any) {
      console.error("Deletion failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  // --- SILENT FORCED DOWNLOAD LOGIC (NO PREVIEWS) ---
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
      URL.revokeObjectURL(blobUrl); // Clean up memory
    } catch (err) {
      console.error("Failed to download silently", err);
    }
  }

  // VERCEL FIX: Used strict typeof check and removed .canShare completely
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
        // If user cancels share or error occurs, fallback to silent download
        forceDownload(url, id); 
      }
    } else {
      // Laptop / PC directly saves the file (no preview tab)
      forceDownload(url, id); 
    }
  }

  // VERCEL FIX: Used strict typeof check and removed .canShare completely
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
        console.error("Bulk share error or user cancelled:", err);
      }
    } else {
      // Sequential silent downloads for PC
      selectedData.forEach((inv, index) => {
        setTimeout(() => forceDownload(inv.invoice_url, inv.invoice_id), index * 400);
      });
    }
  }

  // --- TABLE SORTING LOGIC ---
  const handleSort = (key: keyof Invoice) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  const sortedInvoices = [...invoices].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (!mounted) return null;

  return (
    <div className="main-wrapper">
      
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">🖼️ Invoice Image Gallery</h1>
      </div>

      {/* TOOLBAR */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '14px' }}>From:</label>
          <input 
            type="date" 
            value={dateRange.start} 
            onChange={e => setDateRange({...dateRange, start: e.target.value})} 
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', color: '#0f172a', backgroundColor: '#ffffff' }} 
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontWeight: 'bold', color: '#64748b', fontSize: '14px' }}>To:</label>
          <input 
            type="date" 
            value={dateRange.end} 
            onChange={e => setDateRange({...dateRange, end: e.target.value})} 
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', color: '#0f172a', backgroundColor: '#ffffff' }} 
          />
        </div>

        <div style={{ borderLeft: '1px solid #e2e8f0', height: '30px', margin: '0 8px' }} />

        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button onClick={() => setViewMode('grid')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', background: viewMode === 'grid' ? '#10b981' : 'transparent', color: viewMode === 'grid' ? '#fff' : '#64748b' }}>Grid</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', background: viewMode === 'table' ? '#10b981' : 'transparent', color: viewMode === 'table' ? '#fff' : '#64748b' }}>Table</button>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={toggleSelectAll} disabled={invoices.length === 0} style={{ padding: '10px 16px', background: '#f8fafc', color: '#4a3b1b', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: invoices.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
            {selectedInvoices.size === invoices.length && invoices.length > 0 ? 'Deselect All' : 'Select All'}
          </button>

          {selectedInvoices.size > 0 && (
            <>
              <button onClick={deleteSelected} style={{ padding: '10px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                Clear ({selectedInvoices.size})
              </button>
              <button onClick={handleBulkAction} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                {isDeviceMobile ? `Share (${selectedInvoices.size})` : `Download (${selectedInvoices.size})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* CONTENT AREA */}
      {isLoading ? (
        <p style={{ color: '#64748b', fontSize: '16px', textAlign: 'center', padding: '40px' }}>Loading records...</p>
      ) : sortedInvoices.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1', fontSize: '16px' }}>
          No records found.
        </div>
      ) : viewMode === 'grid' ? (
        
        /* --- GRID VIEW --- */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {sortedInvoices.map((inv) => {
            const isSelected = selectedInvoices.has(inv.invoice_id);
            return (
              <div key={inv.id} style={{ background: isSelected ? '#fefcf3' : '#fff', borderRadius: '12px', border: isSelected ? '2px solid #b58a3d' : '1px solid #e2e8f0', overflow: 'hidden', boxShadow: isSelected ? '0 4px 12px rgba(181, 138, 61, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', transition: 'all 0.2s' }}>
                
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, cursor: 'pointer', accentColor: '#b58a3d', width: '20px', height: '20px' }} />

                <div onClick={() => toggleSelect(inv.invoice_id)} style={{ width: '100%', height: '220px', overflow: 'hidden', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                  <img src={inv.invoice_url} alt="Invoice" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isSelected ? 0.8 : 1 }} />
                </div>

                <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '14px' }}>{inv.invoice_id}</div>
                  <div style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>👤 {inv.customer_name}</div>
                  <div style={{ fontSize: '16px', color: '#b58a3d', marginTop: '6px', fontWeight: 'bold' }}>💰 {new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</div>
                </div>

                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfbfa', marginTop: 'auto' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{formatDate(inv.created_at)}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} style={{ padding: '6px 12px', background: '#fef3c7', color: '#ca8a04', border: '1px solid #fde047', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
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
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '16px', width: '50px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedInvoices.size === invoices.length && invoices.length > 0} onChange={toggleSelectAll} style={{ width: '18px', height: '18px', accentColor: '#b58a3d', cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '16px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('invoice_id')}>
                  Invoice ID {sortConfig?.key === 'invoice_id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('customer_name')}>
                  Customer {sortConfig?.key === 'customer_name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('total_sales')}>
                  Total Amount {sortConfig?.key === 'total_sales' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('created_at')}>
                  Date {sortConfig?.key === 'created_at' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                </th>
                <th style={{ padding: '16px', color: '#475569', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map((inv) => {
                const isSelected = selectedInvoices.has(inv.invoice_id);
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#fefcf3' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} style={{ width: '18px', height: '18px', accentColor: '#b58a3d', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: '#1e293b' }}>{inv.invoice_id}</td>
                    <td style={{ padding: '16px', color: '#334155', fontWeight: 'bold' }}>{inv.customer_name}</td>
                    <td style={{ padding: '16px', color: '#b58a3d', fontWeight: 'bold' }}>{new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</td>
                    <td style={{ padding: '16px', color: '#64748b' }}>{formatDate(inv.created_at)}</td>
                    <td style={{ padding: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} style={{ padding: '8px 14px', background: '#fef3c7', color: '#ca8a04', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => handleAction(inv.invoice_url, inv.invoice_id)} style={{ padding: '8px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                        {isDeviceMobile ? 'Share' : 'Download'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx global>{`
        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          min-height: 100vh; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
        }
        .header-container { 
          margin-bottom: 24px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .page-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #4a3b1b; 
          margin: 0; 
        }

        @media (max-width: 1023px) { 
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
          }
          .header-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
        }
      `}</style>
    </div>
  )
}