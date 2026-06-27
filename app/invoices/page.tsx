'use client'



import { useState, useEffect } from 'react'

import { supabase } from '@/lib/supabaseClient'



export default function InvoiceGallery() {

const [invoices, setInvoices] = useState<any[]>([])

const [isLoading, setIsLoading] = useState(true)

const [isDeviceMobile, setIsDeviceMobile] = useState(false)


const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())

const [dateRange, setDateRange] = useState({ start: '', end: '' })



useEffect(() => {

const isMobile = window.innerWidth < 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

setIsDeviceMobile(isMobile);

fetchInvoices()

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



// --- STORAGE-ONLY DELETE LOGIC ---

const deleteSelected = async () => {

if (!confirm(`Are you sure you want to delete the image files for ${selectedInvoices.size} invoice(s)? Your financial data will remain safely in the database.`)) return;


setIsLoading(true);

const idsToUpdate = Array.from(selectedInvoices);


// 1. Extract filenames to delete from Storage Bucket

const filesToDelete = invoices

.filter(inv => selectedInvoices.has(inv.invoice_id))

.map(inv => {

const parts = inv.invoice_url.split('/');

return parts[parts.length - 1]; // gets the exact filename at the end of the URL

});



try {

// 2. Delete Images from Supabase Storage Bucket ONLY

if (filesToDelete.length > 0) {

const { error: storageError } = await supabase.storage.from('invoices').remove(filesToDelete);

if (storageError) console.error("Storage deletion warning:", storageError);

}



// 3. Update Database Tables to remove the image link (Keeps the transaction data intact!)

const { error: salesError } = await supabase.from('sales').update({ invoice_url: null }).in('invoice_id', idsToUpdate);

const { error: summaryError } = await supabase.from('invoice_summaries').update({ invoice_url: null }).in('invoice_id', idsToUpdate);



if (salesError || summaryError) {

alert("Database Blocked the Update! Please go to Supabase -> Authentication/Policies and ensure 'UPDATE' is allowed for your tables.");

console.error(salesError || summaryError);

} else {

setSelectedInvoices(new Set());

await fetchInvoices(); // Will hide the cards because their invoice_url is now null

}

} catch (error: any) {

console.error("Deletion failed:", error);

alert("An error occurred while clearing images. Please check console.");

} finally {

setIsLoading(false);

}

}



const handleBulkAction = async () => {

const selectedData = invoices.filter(inv => selectedInvoices.has(inv.invoice_id));



if (isDeviceMobile) {

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

<div style={{ padding: '16px 20px 16px 75px', minHeight: '100vh', background: '#f8fafc', boxSizing: 'border-box' }}>


<h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#4a3b1b', margin: '0 0 16px 0' }}>Invoice Image Gallery</h1>



{/* FILTER & ACTION TOOLBAR */}

<div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>

<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>

<label style={{ fontWeight: 'bold', color: '#64748b' }}>From:</label>

<input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }} />

<label style={{ fontWeight: 'bold', color: '#64748b' }}>To:</label>

<input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', outline: 'none' }} />

</div>



<div style={{ borderLeft: '1px solid #e2e8f0', height: '20px', margin: '0 4px' }} />



<button

onClick={toggleSelectAll}

disabled={invoices.length === 0}

style={{ padding: '6px 12px', background: '#f4f1ea', color: '#4a3b1b', border: 'none', borderRadius: '4px', cursor: invoices.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '12px' }}

>

{selectedInvoices.size === invoices.length && invoices.length > 0 ? 'Deselect All' : 'Select All'}

</button>



{selectedInvoices.size > 0 && (

<>

<div style={{ borderLeft: '1px solid #e2e8f0', height: '20px', margin: '0 4px' }} />


<button

onClick={deleteSelected}

style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}

>

Clear Images ({selectedInvoices.size})

</button>



<button

onClick={handleBulkAction}

style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}

>

{isDeviceMobile ? `Share (${selectedInvoices.size})` : `Download (${selectedInvoices.size})`}

</button>

</>

)}

</div>



{/* GALLERY GRID */}

{isLoading ? (

<p style={{ color: '#64748b', fontSize: '13px' }}>Loading records...</p>

) : invoices.length === 0 ? (

<div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '13px' }}>

No records found.

</div>

) : (

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>

{invoices.map((inv) => {

const isSelected = selectedInvoices.has(inv.invoice_id);


return (

<div key={inv.id} style={{

background: isSelected ? '#fefcf3' : '#fff',

borderRadius: '8px',

border: isSelected ? '1px solid #b58a3d' : '1px solid #e2e8f0',

overflow: 'hidden',

boxShadow: isSelected ? '0 2px 8px rgba(181, 138, 61, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)',

display: 'flex',

flexDirection: 'column',

position: 'relative'

}}>


<input

type="checkbox"

checked={isSelected}

onChange={() => toggleSelect(inv.invoice_id)}

style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 10, cursor: 'pointer', accentColor: '#b58a3d' }}

/>



<div

onClick={() => toggleSelect(inv.invoice_id)}

style={{ width: '100%', height: '180px', overflow: 'hidden', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}

>

<img src={inv.invoice_url} alt="Invoice" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isSelected ? 0.8 : 1 }} />

</div>



<div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>

<div style={{ fontWeight: 'bold', color: '#333', fontSize: '12px' }}>{inv.invoice_id}</div>

<div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>👤 {inv.customer_name}</div>

<div style={{ fontSize: '12px', color: '#b58a3d', marginTop: '2px', fontWeight: 'bold' }}>💰 {new Intl.NumberFormat('en-US').format(inv.total_sales)} ៛</div>

</div>



<div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfbfa', marginTop: 'auto' }}>

<div style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(inv.created_at)}</div>


<div style={{ display: 'flex', gap: '6px' }}>

<button

onClick={() => window.location.href = `/pos?edit=${inv.invoice_id}`}

style={{ padding: '4px 10px', background: '#fef3c7', color: '#ca8a04', border: '1px solid #fde047', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}

>

Edit

</button>



{isDeviceMobile ? (

<button

onClick={() => handleMobileShare(inv.invoice_url, inv.invoice_id)}

style={{ padding: '4px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}

>

Share

</button>

) : (

<a

href={inv.invoice_url}

download={`Invoice-${inv.invoice_id}.jpg`}

target="_blank"

style={{ padding: '4px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', display: 'inline-block' }}

>

Download

</a>

)}

</div>

</div>

</div>

);

})}

</div>

)}


<style jsx global>{`

@media (max-width: 1023px) {

div[style*="padding: 16px 20px 16px 75px"] {

padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important;

}

}

`}</style>

</div>

)

} 

