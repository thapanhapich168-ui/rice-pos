'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

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

type FilterTab = 'All' | 'Today' | 'This Week' | 'This Month';

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState<boolean>(false)
  const [mounted, setMounted] = useState<boolean>(false)
  
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [filterTab, setFilterTab] = useState<FilterTab>('All')
  const [searchQuery, setSearchQuery] = useState<string>('')
  
  // View & Sort State (Defaults to newest invoices first)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'created_at', direction: 'desc' })

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
      .not('invoice_url', 'is', null) // Only fetch records that still have an image attached

    // Dynamic Filter Range Calculations
    const now = new Date()
    if (filterTab === 'Today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      query = query.gte('created_at', todayStart)
    } else if (filterTab === 'This Week') {
      const currentDay = now.getDay()
      const dayDifference = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1) // Sets week start to Monday
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

  // --- SORTING TRIGGER ---
  const handleSort = (key: keyof Invoice) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  // --- CLIENT-SIDE SEARCH & SORT DYNAMICS ---
  const processedInvoices = invoices
    .filter(inv => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase().trim();
      return (
        inv.invoice_id?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      
      let valA = a[key];
      let valB = b[key];

      if (key === 'created_at') {
        return direction === 'asc' 
          ? new Date(valA).getTime() - new Date(valB).getTime()
          : new Date(valB).getTime() - new Date(valA).getTime();
      }

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
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

      {/* FILTER TABS & SEARCH CONTAINER */}
      <div className="toolbar-container">
        
        {/* Pre-Filter Tabs */}
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
                e.currentTarget.blur(); // Hides keyboard & forces iOS zoom-out reset
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

        {/* Global Action Modifiers (Strict high-contrast borders & text definitions) */}
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

      {/* Dynamic Sorting Status Bar for Grid Mode */}
      {viewMode === 'grid' && processedInvoices.length > 0 && (
        <div className="sort-status-bar">
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>Sorted By:</span>
          <button className="sort-toggle-pill" onClick={() => handleSort('created_at')}>
            📅 Date {sortConfig?.key === 'created_at' ? (sortConfig.direction === 'asc' ? '▲ Oldest First' : '▼ Newest First') : '↕'}
          </button>
          <button className="sort-toggle-pill" onClick={() => handleSort('invoice_id')}>
            🆔 Invoice ID {sortConfig?.key === 'invoice_id' ? (sortConfig.direction === 'asc' ? '▲ A-Z' : '▼ Z-A') : '↕'}
          </button>
        </div>
      )}

      {/* CONTENT AREA */}
      {isLoading ? (
        <p className="status-message">Loading records...</p>
      ) : processedInvoices.length === 0 ? (
        <div className="empty-message-box">
          No records found matching the chosen timeframe or search filters.
        </div>
      ) : viewMode === 'grid' ? (
        
        /* --- GRID VIEW --- */
        <div className="grid-layout">
          {processedInvoices.map((inv) => {
            const isSelected = selectedInvoices.has(inv.invoice_id);
            return (
              <div key={inv.id} className={`grid-card ${isSelected ? 'selected' : ''}`}>
                
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} className="card-checkbox" />

                <div onClick={() => toggleSelect(inv.invoice_id)} className="card-image-box">
                  <img src={inv.invoice_url} alt="Invoice Document File" className="card-img" style={{ opacity: isSelected ? 0.7 : 1 }} />
                </div>

                <div className="card-body">
                  <div className="card-id-title">{inv.invoice_id}</div>
                  <div className="card-customer-row">Customer: {inv.customer_name}</div>
                  <div className="card-amount-row">💰 {new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</div>
                </div>

                <div className="card-footer">
                  <div className="card-date-label">{formatDate(inv.created_at)}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="card-edit-btn">Edit</button>
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
                <th style={{ width: '50px', textAlign: 'center', padding: '16px' }}>
                  <input type="checkbox" checked={selectedInvoices.size === processedInvoices.length && processedInvoices.length > 0} onChange={toggleSelectAll} style={{ width: '18px', height: '18px', accentColor: '#b58a3d', cursor: 'pointer' }} />
                </th>
                <th onClick={() => handleSort('invoice_id')} className="sortable-header">
                  Invoice ID {sortConfig?.key === 'invoice_id' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('customer_name')} className="sortable-header">
                  Customer {sortConfig?.key === 'customer_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('total_sales')} className="sortable-header">
                  Total Amount {sortConfig?.key === 'total_sales' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th onClick={() => handleSort('created_at')} className="sortable-header">
                  Date {sortConfig?.key === 'created_at' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                </th>
                <th style={{ padding: '16px', color: '#0f172a', textAlign: 'center', fontWeight: 'bold' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedInvoices.map((inv) => {
                const isSelected = selectedInvoices.has(inv.invoice_id);
                return (
                  <tr key={inv.id} className={isSelected ? 'row-selected' : ''}>
                    <td style={{ textAlign: 'center', padding: '16px' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(inv.invoice_id)} style={{ width: '18px', height: '18px', accentColor: '#b58a3d', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: '#0f172a' }}>{inv.invoice_id}</td>
                    <td style={{ padding: '16px', color: '#334155', fontWeight: 'bold' }}>{inv.customer_name}</td>
                    <td style={{ padding: '16px', color: '#b58a3d', fontWeight: 'bold' }}>{new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</td>
                    <td style={{ padding: '16px', color: '#475569' }}>{formatDate(inv.created_at)}</td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`} className="table-edit-btn">Edit</button>
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
        .main-wrapper { 
          padding: 24px 24px 24px 85px; 
          background: #f8fafc; 
          min-height: 100vh; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #0f172a;
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
          font-size: 16px; /* Enforces absolute 16px minimum to avoid mobile browser auto-zoom */
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

        /* GRID SORT STATUS BAR */
        .sort-status-bar {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .sort-toggle-pill {
          padding: 6px 12px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          color: #475569;
          cursor: pointer;
        }
        .sort-toggle-pill:hover {
          border-color: #b58a3d;
          color: #b58a3d;
        }

        /* GRID VIEW ELEMENTS */
        .grid-layout {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
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
        .card-footer {
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
          margin-top: auto;
        }
        .card-date-label {
          font-size: 12px;
          color: #64748b;
        }
        .card-edit-btn {
          padding: 6px 12px;
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde047;
          border-radius: 6px;
          fontSize: 12px;
          font-weight: bold;
          cursor: pointer;
        }
        .card-download-btn {
          padding: 6px 12px;
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          fontSize: 12px;
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
          padding: 16px;
          font-weight: bold;
          color: #0f172a;
        }
        .sortable-header {
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
        }
        .sortable-header:hover {
          color: #b58a3d;
          background: #f1f5f9;
        }
        .data-table tr {
          border-bottom: 1px solid #e2e8f0;
          transition: background 0.2s;
        }
        .data-table tr.row-selected {
          background: #fefcf3;
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

        /* RESPONSIVE LAYOUT ADJUSTMENTS */
        @media (max-width: 1023px) { 
          .main-wrapper { 
            /* Extra top margin protection ensures burger menus/global app shell headers never clash */
            padding: max(100px, env(safe-area-inset-top, 100px)) 16px 16px 16px !important; 
          }
          .header-container {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 16px;
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