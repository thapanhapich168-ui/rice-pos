'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)
  
  // NEW: State to track which invoices are selected
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())

  useEffect(() => {
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('invoice_summaries')
      .select('*')
      .not('invoice_url', 'is', null)
      .order('created_at', { ascending: false })
      
    if (data) {
      setInvoices(data)
    } else {
      console.error("Error fetching invoices:", error)
    }
    setIsLoading(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', { 
      day: '2-digit', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    })
  }

  const handleMobileShare = async (url: string, id: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `Invoice-${id}.jpg`, { type: 'image/jpeg' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${id}` });
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      window.open(url, '_blank');
    }
  }

  // --- NEW: MULTI-SELECT LOGIC ---
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

  // --- NEW: DATABASE DELETE LOGIC ---
  const deleteSelected = async () => {
    if (!confirm(`Are you sure you want to permanently delete ${selectedInvoices.size} selected invoice(s) from the database?`)) return;
    
    setIsLoading(true);
    const idsToDelete = Array.from(selectedInvoices);

    try {
      // 1. Delete the line items from the 'sales' table
      const { error: salesError } = await supabase.from('sales').delete().in('invoice_id', idsToDelete);
      if (salesError) throw salesError;

      // 2. Delete the summary from 'invoice_summaries' table
      const { error: summaryError } = await supabase.from('invoice_summaries').delete().in('invoice_id', idsToDelete);
      if (summaryError) throw summaryError;

      // 3. Reset selection and refresh UI
      setSelectedInvoices(new Set());
      await fetchInvoices();
    } catch (error: any) {
      console.error("Failed to delete from database:", error);
      alert("Error deleting invoices. Please check console.");
      setIsLoading(false);
    }
  }

  // --- NEW: BULK SAVE / DOWNLOAD LOGIC ---
  const handleBulkAction = async () => {
    const selectedData = invoices.filter(inv => selectedInvoices.has(inv.invoice_id));

    if (isDeviceMobile) {
      // Bulk Share for iPhone/Mobile (Bundles multiple images to save to photos)
      try {
        const files = await Promise.all(selectedData.map(async (inv) => {
          const res = await fetch(inv.invoice_url);
          const blob = await res.blob();
          return new File([blob], `Invoice-${inv.invoice_id}.jpg`, { type: 'image/jpeg' });
        }));

        if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({ files, title: `Saved Invoices (${files.length})` });
        } else {
          alert('Bulk share is not fully supported on this browser.');
        }
      } catch (err) {
        console.error("Bulk share error:", err);
      }
    } else {
      // Bulk Download for Laptop (Staggers downloads slightly to prevent browser blocking)
      selectedData.forEach((inv, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = inv.invoice_url;
          link.download = `Invoice-${inv.invoice_id}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, index * 300);
      });
    }
  }

  return (
    <div style={{ padding: '24px 24px 24px 75px', minHeight: '100vh', background: '#f8fafc', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#4a3b1b', marginBottom: '24px' }}>🖼️ Invoice Image Gallery</h1>

      {/* NEW ACTION TOOLBAR */}
      <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button 
          onClick={toggleSelectAll} 
          disabled={invoices.length === 0}
          style={{ padding: '8px 16px', background: '#f4f1ea', color: '#4a3b1b', border: 'none', borderRadius: '6px', cursor: invoices.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          {selectedInvoices.size === invoices.length && invoices.length > 0 ? 'Deselect All' : 'Select All'}
        </button>

        {selectedInvoices.size > 0 && (
          <>
            <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 5px' }} />
            
            <button 
              onClick={deleteSelected} 
              style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🗑️ Delete Selected ({selectedInvoices.size})
            </button>

            <button 
              onClick={handleBulkAction} 
              style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isDeviceMobile ? `📤 Share/Save (${selectedInvoices.size})` : `⬇️ Download (${selectedInvoices.size})`}
            </button>
          </>
        )}
      </div>

      {isLoading ? (
        <p style={{ color: '#64748b', fontWeight: 'bold' }}>Loading gallery...</p>
      ) : invoices.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          No saved invoices found. Check out on the POS and click "Save to Gallery" to see them here!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {invoices.map((inv) => {
            const isSelected = selectedInvoices.has(inv.invoice_id);
            
            return (
              <div key={inv.id} style={{ 
                background: isSelected ? '#fefcf3' : '#fff', 
                borderRadius: '12px', 
                border: isSelected ? '2px solid #b58a3d' : '1px solid #e2e8f0', 
                overflow: 'hidden', 
                boxShadow: isSelected ? '0 4px 12px rgba(181, 138, 61, 0.2)' : '0 4px 6px rgba(0,0,0,0.05)', 
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative',
                transition: 'all 0.2s ease-in-out'
              }}>
                
                {/* NEW CHECKBOX OVERLAY */}
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  onChange={() => toggleSelect(inv.invoice_id)}
                  style={{ 
                    position: 'absolute', 
                    top: '12px', 
                    left: '12px', 
                    zIndex: 10, 
                    width: '22px', 
                    height: '22px', 
                    cursor: 'pointer',
                    accentColor: '#b58a3d'
                  }} 
                />

                {/* Clickable Image Area (Also toggles selection) */}
                <div 
                  onClick={() => toggleSelect(inv.invoice_id)}
                  style={{ width: '100%', height: '220px', overflow: 'hidden', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  <img 
                    src={inv.invoice_url} 
                    alt="Invoice" 
                    style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isSelected ? 0.9 : 1 }}
                  />
                </div>

                {/* Invoice Meta Info */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{inv.invoice_id}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>👤 {inv.customer_name}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>💰 {new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</div>
                </div>

                {/* Action Bar */}
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', marginTop: 'auto' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(inv.created_at)}</div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`}
                      style={{ padding: '6px 12px', background: '#fef3c7', color: '#ca8a04', border: '1px solid #fde047', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      ✏️ Edit
                    </button>

                    {isDeviceMobile ? (
                      <button 
                        onClick={() => handleMobileShare(inv.invoice_url, inv.invoice_id)}
                        style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        📤 Share
                      </button>
                    ) : (
                      <a 
                        href={inv.invoice_url} 
                        download={`Invoice-${inv.invoice_id}.jpg`}
                        target="_blank" 
                        style={{ padding: '6px 12px', background: '#10b981', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold', display: 'inline-block' }}
                      >
                        ⬇️ Download
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  )
}