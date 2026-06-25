'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setIsLoading(true)
    // Fetch sales that have a saved image, newest first
    const { data, error } = await supabase
      .from('sales')
      .select('id, created_at, invoice_url')
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
            <div key={inv.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              
              {/* Thumbnail Image */}
              <div style={{ width: '100%', height: '220px', overflow: 'hidden', background: '#f1f5f9' }}>
                <img 
                  src={inv.invoice_url} 
                  alt="Invoice" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              {/* Action Bar */}
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(inv.created_at)}</div>
                </div>
                <a 
                  href={inv.invoice_url} 
                  download={`Invoice-${inv.id}.jpg`}
                  target="_blank" 
                  style={{ 
                    padding: '8px 16px', 
                    background: '#b58a3d', 
                    color: '#fff', 
                    borderRadius: '6px', 
                    textDecoration: 'none', 
                    fontSize: '13px', 
                    fontWeight: 'bold' 
                  }}
                >
                  ⬇️ Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}