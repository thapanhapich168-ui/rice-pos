'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)

  useEffect(() => {
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setIsLoading(true)
    // Fetch from invoice_summaries to avoid duplicate images from multiple sale rows
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

  return (
    <div style={{ padding: '24px 24px 24px 75px', minHeight: '100vh', background: '#f8fafc', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#4a3b1b', marginBottom: '24px' }}>🖼️ Invoice Image Gallery</h1>

      {isLoading ? (
        <p style={{ color: '#64748b' }}>Loading gallery...</p>
      ) : invoices.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          No saved invoices found. Check out on the POS and click "Save to Gallery" to see them here!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {invoices.map((inv) => (
            <div key={inv.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              
              {/* Thumbnail Image - Changed to contain so A5 doesn't get cut off */}
              <div style={{ width: '100%', height: '220px', overflow: 'hidden', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                <img 
                  src={inv.invoice_url} 
                  alt="Invoice" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
          ))}
        </div>
      )}
    </div>
  )
}