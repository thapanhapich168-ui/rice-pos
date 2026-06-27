'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Define the shape of an Invoice item for TypeScript
interface Invoice {
  id: string;
  invoice_id: string;
  fileName: string;
  invoice_url: string;
  created_at: string;
  customer_name: string;
  total_sales: number;
}

export default function InvoiceGallery() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isDeviceMobile, setIsDeviceMobile] = useState<boolean>(false)
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [mounted, setMounted] = useState<boolean>(false)

  useEffect(() => {
    setMounted(true)
    const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsDeviceMobile(isMobile);
    fetchInvoices()
  }, [dateRange])

  async function fetchInvoices() {
    setIsLoading(true);
    
    try {
      // 1. Fetch images from Storage
      const { data: files, error: storageError } = await supabase.storage
        .from('invoices')
        .list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });

      if (storageError || !files || files.length === 0) {
        setInvoices([]);
        return;
      }

      const validFiles = files.filter(f => f.name.endsWith('.jpg') || f.name.endsWith('.png'));

      // 2. Prepare Storage Map
      const storageMap = new Map<string, { fileName: string; url: string; created_at: string }>();
      validFiles.forEach(file => {
        let invId = file.name.split('.')[0];
        const lastDashIndex = file.name.lastIndexOf('-');
        if (lastDashIndex !== -1) invId = file.name.substring(0, lastDashIndex);

        const { data } = supabase.storage.from('invoices').getPublicUrl(file.name);
        storageMap.set(invId, { fileName: file.name, url: data.publicUrl, created_at: file.created_at });
      });

      // 3. Fetch Database Metadata
      const { data: summaries } = await supabase
        .from('invoice_summaries')
        .select('invoice_id, customer_name, total_sales, created_at')
        .in('invoice_id', Array.from(storageMap.keys()));

      const summaryMap = new Map();
      summaries?.forEach(s => summaryMap.set(s.invoice_id, s));

      // 4. Combine
      let combined: Invoice[] = Array.from(storageMap.entries()).map(([invId, storageData]) => {
        const summary = summaryMap.get(invId) || {};
        return {
          id: invId,
          invoice_id: invId,
          fileName: storageData.fileName,
          invoice_url: storageData.url,
          created_at: summary.created_at || storageData.created_at,
          customer_name: summary.customer_name || 'Walk-in',
          total_sales: summary.total_sales || 0
        };
      });

      // 5. Date Filter & Sort
      if (dateRange.start || dateRange.end) {
        combined = combined.filter(inv => {
          const invDate = new Date(inv.created_at);
          if (dateRange.start && invDate < new Date(dateRange.start + 'T00:00:00')) return false;
          if (dateRange.end && invDate > new Date(dateRange.end + 'T23:59:59')) return false;
          return true;
        });
      }

      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setInvoices(combined);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedInvoices);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedInvoices(next);
  }

  const deleteSelected = async () => {
    if (!confirm(`Clear images for ${selectedInvoices.size} items?`)) return;
    const filesToDelete = invoices.filter(inv => selectedInvoices.has(inv.invoice_id)).map(inv => inv.fileName);
    await supabase.storage.from('invoices').remove(filesToDelete);
    setSelectedInvoices(new Set());
    fetchInvoices();
  }

  if (!mounted) return null;

  return (
    <div className="main-wrapper">
      <div className="header-container">
        <h1 className="page-title">🖼️ Invoice Image Gallery</h1>
      </div>

      {/* Toolbar */}
      <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input type="date" onChange={e => setDateRange({...dateRange, start: e.target.value})} style={{ padding: '6px', fontSize: '12px' }} />
        <input type="date" onChange={e => setDateRange({...dateRange, end: e.target.value})} style={{ padding: '6px', fontSize: '12px' }} />
        {selectedInvoices.size > 0 && (
          <button onClick={deleteSelected} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Clear ({selectedInvoices.size})</button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <p style={{ textAlign: 'center' }}>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {invoices.map((inv) => (
            <div key={inv.invoice_id} style={{ border: selectedInvoices.has(inv.invoice_id) ? '2px solid #b58a3d' : '1px solid #e2e8f0', borderRadius: '12px', padding: '10px', background: '#fff' }}>
              <input type="checkbox" checked={selectedInvoices.has(inv.invoice_id)} onChange={() => toggleSelect(inv.invoice_id)} />
              <img src={inv.invoice_url} alt="Invoice" style={{ width: '100%', height: '180px', objectFit: 'contain' }} />
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                <p style={{ fontWeight: 'bold' }}>{inv.invoice_id}</p>
                <p>👤 {inv.customer_name}</p>
                <p style={{ color: '#b58a3d' }}>💰 {inv.total_sales.toLocaleString()} ៛</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        .main-wrapper { padding: 24px 24px 24px 75px; background: #f8fafc; min-height: 100vh; box-sizing: border-box; }
        .page-title { font-size: 24px; font-weight: bold; color: #4a3b1b; }
      `}</style>
    </div>
  )
}