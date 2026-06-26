'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'

// Constants
const EXCHANGE_RATE = 4000;
const RICE_CATEGORIES = ['All', 'មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប', 'ផ្សេងៗ'];
const MAIN_KEYWORDS = ['មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប'];

// Global helper function 
const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

// Translations Dictionary
const t = {
  en: {
    title: "Angkor Radiant Rice POS",
    retail: "🛍️ Retail (1kg)",
    wholesale: "🌾 Wholesale (50kg)",
    searchPlaceholder: "🔍 Search products...",
    selectCustomer: "🔍 Search Wholesale Customer...",
    noProducts: "No products match selection filter",
    stock: "Stock",
    cartTitle: "🛒 Shopping Cart",
    emptyCart: "Cart is empty",
    unitPrice: "Unit Price",
    quantity: "Quantity",
    subtotal: "Subtotal:",
    totalKhmer: "Total:",
    totalUsd: "Total in USD:",
    checkout: "Checkout",
    successTitle: "Invoice Ready",
    openInvoice: "💾 Download / Print Image",
    shareInvoice: "📤 Share / Save Photo",
    close: "Next Sale"
  },
  kh: {
    title: "អង្គរ រេឌឌៀន រ៉ាយស៍ ភីអូអេស",
    retail: "🛍️ លក់រាយ (1kg)",
    wholesale: "🌾 លក់ដុំ (50kg)",
    searchPlaceholder: "🔍 ស្វែងរកឈ្មោះទំនិញ...",
    selectCustomer: "🔍 ស្វែងរកអតិថិជនដុំ...",
    noProducts: "មិនមានទំនិញស្វែងរកឡើយ",
    stock: "ស្តុកសល់",
    cartTitle: "🛒 កន្ត្រកទំនិញ",
    emptyCart: "មិនមានទំនិញក្នុងកន្ត្រកឡើយ",
    unitPrice: "តម្លៃឯកតា",
    quantity: "បរិមាណ",
    subtotal: "តម្លៃសរុប:",
    totalKhmer: "សរុបរួម:",
    totalUsd: "សរុបជាដុល្លារ:",
    checkout: "ចាត់ចែងការទូទាត់",
    successTitle: "វិក្កយបត្រត្រូវបានបង្កើតជោគជ័យ!",
    openInvoice: "💾 ទាញយក / បោះពុម្ភវិក្កយបត្រ",
    shareInvoice: "📤 ចែករំលែកទៅកាន់រូបភាព",
    close: "លក់បន្ត"
  }
};

function CartInput({ value, onChange, isQty }: { value: number, onChange: (val: number) => void, isQty: boolean }) {
  const [focused, setFocused] = useState(false);
  const [temp, setTemp] = useState(String(value));

  useEffect(() => {
    if (!focused) setTemp(String(value));
  }, [value, focused]);

  return (
    <input 
      type="text"
      value={focused ? temp : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}
      onFocus={() => { setFocused(true); setTemp(String(value)); }}
      onBlur={() => {
        setFocused(false);
        let parsed = parseFloat(temp.replace(/,/g, ''));
        if (isNaN(parsed)) parsed = isQty ? 1 : 0; 
        onChange(parsed);
      }}
      onChange={(e) => setTemp(e.target.value)}
      style={{ 
        width: '100%', 
        padding: '8px', 
        borderRadius: '6px', 
        border: '1px solid #dcd7cc', 
        boxSizing: 'border-box', 
        fontSize: '13px',
        fontWeight: 'normal',
        color: '#333333',
        backgroundColor: '#ffffff',
        outline: 'none'
      }}
    />
  )
}

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [productOrder, setProductOrder] = useState<number[]>([])
  
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false)

  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null)
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [editCardForm, setEditCardForm] = useState({ name: '', price: '' })

  const [completedSale, setCompletedSale] = useState<any>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [hasAutoSaved, setHasAutoSaved] = useState(false)
  
  const invoiceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stabilizeConnection = async () => {
      try {
        await loadProductsAndSettings()
        await loadCustomers()
      } catch (err) {
        console.warn("Supabase network polling retrying silently...", err)
      }
    }
    
    stabilizeConnection()

    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setIsDeviceMobile(true);
    }
  }, [])

  useEffect(() => {
    if (completedSale && !hasAutoSaved && !isUploadingImage) {
      const timer = setTimeout(() => { executeAutoSaveOnly(); }, 800); 
      return () => clearTimeout(timer);
    }
  }, [completedSale, hasAutoSaved, isUploadingImage])

  async function loadProductsAndSettings() {
    const { data: prodData } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (prodData) setProducts(prodData)

    const { data: setObj } = await supabase.from('app_settings').select('*').eq('setting_key', 'pos_product_order').single()
    if (setObj && setObj.setting_value) {
      setProductOrder(setObj.setting_value)
    }
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers(data || [])
  }

  const formatRielSymbol = (amountInRiel: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  const formatRielFromNative = (rielAmount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(rielAmount))} ៛`;
  const formatUSD = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  function handleProductClick(product: any) {
    if (editingCardId === product.id) return;
    addToCartDirect(product);
  }

  function addToCartDirect(product: any) {
    const existing = cart.find((item) => item.id === product.id)
    const priceInRiel = Number(product.price); 
    if (existing) {
      setCart(cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      setCart([...cart, { ...product, quantity: 1, custom_name: product.name, custom_price_riel: priceInRiel }])
    }
  }

  function updateCartItem(id: number, field: string, value: any) {
    setCart(cart.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  function removeFromCart(id: number) {
    setCart(cart.filter(item => item.id !== id))
  }

  const handleProductDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
  }

  const handleProductDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  }

  const handleProductDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const sourceId = Number(e.dataTransfer.getData('text/plain'));
    if (!sourceId || sourceId === targetId) return;

    let currentOrder = [...productOrder];
    products.forEach(p => { if (!currentOrder.includes(p.id)) currentOrder.push(p.id); });

    const sIdx = currentOrder.indexOf(sourceId);
    const tIdx = currentOrder.indexOf(targetId);
    currentOrder.splice(sIdx, 1);
    currentOrder.splice(tIdx, 0, sourceId);

    setProductOrder(currentOrder);
    await supabase.from('app_settings').upsert({ setting_key: 'pos_product_order', setting_value: currentOrder }, { onConflict: 'setting_key' });
  }

  async function saveCardEdit(id: number) {
    const parsedPrice = parseFloat(editCardForm.price) || 0;
    const { error } = await supabase.from('products').update({ name: editCardForm.name, price: parsedPrice }).eq('id', id);
    if (!error) {
      setEditingCardId(null);
      loadProductsAndSettings();
    } else {
      alert("Error saving: " + error.message);
    }
  }

  const totalRiel = cart.reduce((sum, item) => sum + (Number(item.custom_price_riel) * Number(item.quantity)), 0)
  const totalUSD = totalRiel / EXCHANGE_RATE; 

  const orderedProducts = [...products].sort((a, b) => {
    const idxA = productOrder.indexOf(a.id);
    const idxB = productOrder.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return a.id - b.id;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const filteredProducts = orderedProducts.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    if (!matchesSearch) return false;

    const weightVal = parseFloat(p.weight || 0)
    if (activeTab === 'wholesale' && weightVal < 50) return false;
    if (activeTab === 'retail' && weightVal >= 50) return false;

    if (activeTab !== 'retail' && activeCategory !== 'All') {
      const name = p.name || '';
      if (activeCategory === 'ផ្សេងៗ') {
        if (MAIN_KEYWORDS.some(kw => name.includes(kw))) return false;
      } else {
        if (!name.includes(activeCategory)) return false;
      }
    }
    return true;
  })

  const filteredCustomers = customers.filter(c => 
    (c.name || '').toLowerCase().includes(customerSearchTerm.toLowerCase()) || (c.phone || '').includes(customerSearchTerm)
  )
  const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId.toString())

  const getCategorizedItems = (cartItems: any[]) => {
    let normalItems: any[] = [], specialItems: any[] = [], negativeItems: any[] = [], serviceItems: any[] = [];
    cartItems.forEach(item => {
      const desc = item.custom_name;
      const total = item.custom_price_riel * item.quantity;
      if (desc.includes('សេវាឡាន (អតិថិជន)')) serviceItems.push({ ...item, total: total });
      else if (desc.includes('សេវាឡាន')) { /* skip hidden */ }
      else if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) negativeItems.push({ ...item, total: -total });
      else if (desc.includes('ថ្លៃបាវ')) specialItems.push({ ...item, total: total });
      else normalItems.push({ ...item, total: total });
    });
    return [...normalItems, ...specialItems, ...negativeItems, ...serviceItems];
  }

  async function checkout() {
    if (cart.length === 0) return alert(lang === 'kh' ? 'សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក!' : 'Cart is empty');
    if (activeTab === 'wholesale' && !selectedCustomerId) return alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale');

    setIsProcessing(true);
    setHasAutoSaved(false);

    try {
      const displayInvoiceNo = `INV-${Date.now().toString().slice(-6)}`;
      const cName = selectedCustomer ? selectedCustomer.name : 'Walk-in';
      const finalOwner = activeTab === 'wholesale' ? (selectedCustomer?.owner || null) : null;

      const saleRows = cart.map(item => ({
        invoice_id: displayInvoiceNo,
        customer_name: cName,
        rice_type: item.custom_name,
        qty: item.quantity,
        price_per_bag: item.custom_price_riel,
        cogs_price: item.cost_price || 0,
        owner: finalOwner
      }));

      const combinedRiceTypes = cart.map(item => `${item.custom_name} (x${item.quantity})`).join(', ');
      const invoiceTotalSales = cart.reduce((sum, item) => sum + (Number(item.custom_price_riel) * Number(item.quantity)), 0);
      const invoiceTotalCogs = cart.reduce((sum, item) => sum + (Number(item.cost_price || 0) * Number(item.quantity)), 0);
      const invoiceTotalProfit = invoiceTotalSales - invoiceTotalCogs;

      const summaryRow = {
        invoice_id: displayInvoiceNo,
        customer_name: cName,
        owner: finalOwner,
        rice_types: combinedRiceTypes,
        total_sales: invoiceTotalSales,
        total_cogs: invoiceTotalCogs,
        total_profit: invoiceTotalProfit
      };

      await supabase.from('sales').insert(saleRows);
      await supabase.from('invoice_summaries').insert([summaryRow]);

      for (const item of cart) {
        await supabase.rpc('decrease_stock', { product_id_input: item.id, qty: item.quantity });
      }

      const currentDate = new Date();
      setCompletedSale({
        invoiceNo: displayInvoiceNo,
        cartSnapshot: [...cart],
        customer: selectedCustomer,
        dateObj: { 
          day: String(currentDate.getDate()).padStart(2, '0'), 
          month: String(currentDate.getMonth() + 1).padStart(2, '0'), 
          year: currentDate.getFullYear() 
        }
      });

      setCart([]);
      setIsMobileCartOpen(false);
      loadProductsAndSettings();

    } catch (err: any) {
      alert(`System Error: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // --- AUTOMATIC BACKGROUND SUPABASE SYNC (using html-to-image) ---
  async function executeAutoSaveOnly() {
    if (!invoiceRef.current || !completedSale) return;
    setIsUploadingImage(true);

    try {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));

      const dataUrl = await htmlToImage.toJpeg(invoiceRef.current, { quality: 0.8, pixelRatio: 2, backgroundColor: '#ffffff' });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      
      if (blob) {
        const fileName = `${completedSale.invoiceNo}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, blob, { contentType: 'image/jpeg' });
        
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
          await supabase.from('sales').update({ invoice_url: publicUrlData.publicUrl }).eq('invoice_id', completedSale.invoiceNo);
          await supabase.from('invoice_summaries').update({ invoice_url: publicUrlData.publicUrl }).eq('invoice_id', completedSale.invoiceNo);
        }
      }
    } catch (error: any) {
      console.error("Auto-capture failed:", error);
    } finally {
      setIsUploadingImage(false);
      setHasAutoSaved(true);
    }
  }

  // --- HTML-TO-IMAGE EXPORTS (100% Crisp & Straight Lines) ---
  const handleDesktopDownloadPNG = async () => {
    if (!invoiceRef.current || !completedSale) return;
    setIsDownloading(true);
    try {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const dataUrl = await htmlToImage.toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.download = `Invoice-${completedSale.invoiceNo}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  }

  const handleMobileShare = async () => {
    if (!invoiceRef.current || !completedSale) return;
    setIsDownloading(true);
    try {
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));

      const dataUrl = await htmlToImage.toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: '#ffffff' });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      
      if (blob) {
        const file = new File([blob], `Invoice-${completedSale.invoiceNo}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Invoice ${completedSale.invoiceNo}` });
        } else {
          const link = document.createElement('a');
          link.download = `Invoice-${completedSale.invoiceNo}.png`;
          link.href = dataUrl;
          link.click();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  }

  const handleNativePrint = () => {
    window.print();
  }

  const currentT = t[lang] || t['en'];

  return (
    <div className="pos-layout-wrapper" style={{ display: 'flex', height: '100vh', overflow: 'hidden', width: '100%', backgroundColor: '#ffffff', boxSizing: 'border-box' }}>
      
      {/* SELECTION ENGINE VIEW GRID PANEL */}
      <div className="pos-main-engine" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', minWidth: 0, height: '100%' }}>
        <header className="pos-header" style={{ display: 'flex', alignItems: 'center', padding: '12px 20px 12px 75px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#ffffff', justifyContent: 'space-between', flexShrink: 0 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#4a3b1b' }}>{currentT.title}</h1>
          <div style={{ backgroundColor: '#f4f1ea', borderRadius: '20px', padding: '2px' }}>
            <button onClick={() => setLang('en')} style={{ border: 'none', backgroundColor: lang === 'en' ? '#b58a3d' : 'transparent', color: lang === 'en' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>EN</button>
            <button onClick={() => setLang('kh')} style={{ border: 'none', backgroundColor: lang === 'kh' ? '#b58a3d' : 'transparent', color: lang === 'kh' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>KH</button>
          </div>
        </header>

        <div className="pos-tools-area" style={{ padding: '16px 20px 16px 75px', backgroundColor: '#ffffff', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button onClick={() => { setActiveTab('retail'); setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'retail' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'retail' ? '#ffffff' : '#6b582f', minWidth: '120px' }}>{currentT.retail}</button>
            <button onClick={() => setActiveTab('wholesale')} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'wholesale' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', minWidth: '120px' }}>{currentT.wholesale}</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <input type="text" placeholder={currentT.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '14px', color: '#333333', backgroundColor: '#ffffff' }} />
            
            {activeTab === 'wholesale' && (
              <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                {!selectedCustomer ? (
                  <>
                    <input type="text" placeholder={currentT.selectCustomer} value={customerSearchTerm} onChange={(e) => { setCustomerSearchTerm(e.target.value); setIsCustomerDropdownOpen(true); setSelectedCustomerId(''); }} onFocus={() => setIsCustomerDropdownOpen(true)} onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)} style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '14px', color: '#333333', backgroundColor: '#ffffff' }} />
                    {isCustomerDropdownOpen && (
                      <div style={{ position: 'absolute', top: '44px', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #dcd7cc', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                          <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0, zIndex: 2 }}>
                            <tr>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Phone</th>
                              <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Location</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCustomers.map(c => (
                              <tr key={c.id} onMouseDown={(e) => { e.preventDefault(); setSelectedCustomerId(c.id.toString()); setCustomerSearchTerm(''); setIsCustomerDropdownOpen(false); }} style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6', color: '#4a3b1b' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fefcf3'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{c.name}</td>
                                <td style={{ padding: '10px 12px' }}>{c.phone || '-'}</td>
                                <td style={{ padding: '10px 12px', color: '#64748b' }}>{c.location || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ width: '100%', padding: '12px', backgroundColor: '#fefcf3', border: '1px solid #eadeca', borderRadius: '6px', fontSize: '13px', color: '#4a3b1b', position: 'relative' }}>
                    <button onClick={() => { setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>❌</button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingRight: '20px' }}>
                      <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>👤 NAME</strong>{selectedCustomer.name}</div>
                      <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>📞 PHONE</strong>{selectedCustomer.phone || '-'}</div>
                      <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>📍 LOCATION</strong>{selectedCustomer.location || '-'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {activeTab !== 'retail' && (
            <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '4px', marginTop: '16px' }}>
              {RICE_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 14px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #dcd7cc', backgroundColor: activeCategory === cat ? '#b58a3d' : '#f4f1ea', color: activeCategory === cat ? '#fff' : '#6b582f', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>{cat === 'All' ? (lang === 'kh' ? 'ទាំងអស់' : 'All') : cat}</button>
              ))}
            </div>
          )}
        </div>

        <div className="pos-grid-area" style={{ flex: 1, padding: '20px 20px 20px 75px', overflowY: 'auto', backgroundColor: '#ffffff', paddingBottom: '100px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8a7650' }}>{currentT.noProducts}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {filteredProducts.map((p) => (
                <div key={p.id} draggable={editingCardId !== p.id} onDragStart={(e) => handleProductDragStart(e, p.id)} onDragOver={handleProductDragOver} onDrop={(e) => handleProductDrop(e, p.id)} onMouseEnter={() => setHoveredCardId(p.id)} onMouseLeave={() => setHoveredCardId(null)} onClick={() => handleProductClick(p)} style={{ border: '1px solid #eadeca', borderRadius: '10px', padding: '14px', cursor: editingCardId === p.id ? 'default' : 'pointer', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px', transition: 'transform 0.1s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onMouseDown={e => { if(editingCardId !== p.id) e.currentTarget.style.transform = 'scale(0.97)'; }} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  {editingCardId === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }} onClick={e => e.stopPropagation()}>
                      <input autoFocus value={editCardForm.name} onChange={e => setEditCardForm({...editCardForm, name: e.target.value})} style={{ padding: '4px 6px', border: '1px solid #b58a3d', borderRadius: '4px', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#333333', backgroundColor: '#ffffff', fontSize: '12px' }} />
                      <input type="number" value={editCardForm.price} onChange={e => setEditCardForm({...editCardForm, price: e.target.value})} style={{ padding: '4px 6px', border: '1px solid #b58a3d', borderRadius: '4px', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#333333', backgroundColor: '#ffffff', fontSize: '12px' }} />
                      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                        <button onClick={(e) => { e.stopPropagation(); saveCardEdit(p.id); }} style={{ flex: 1, backgroundColor: '#10b981', color: 'white', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingCardId(null); }} style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>❌</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '8px' }}>{p.name}</div>
                        {hoveredCardId === p.id && <button onClick={(e) => { e.stopPropagation(); setEditingCardId(p.id); setEditCardForm({ name: p.name, price: String(p.price) }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', margin: '-4px -4px 0 0' }} title="Edit Product">✏️</button>}
                      </div>
                      <div style={{ borderTop: '1px dashed #f4f1ea', paddingTop: '8px', marginTop: 'auto' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#b58a3d' }}>{formatRielSymbol(p.cost_price || 0)}</div>
                        {(activeTab === 'wholesale') && <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>📦 {currentT.stock}: {p.stock}</div>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DESKTOP SIDEBAR CART */}
      <div className="desktop-cart-panel" style={{ width: '380px', backgroundColor: '#ffffff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#fcfbfa', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#9c8a6c' }}>{currentT.emptyCart}</div>
          ) : (
            cart.map((item) => (
              <div key={item.id} style={{ backgroundColor: '#fcfbfa', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #f4f1ea', position: 'relative' }}>
                <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', zIndex: 5 }}>✕</button>

                {/* EDITABLE CART NAME WITH DOT LINE FIX */}
                <input 
                  type="text" 
                  value={item.custom_name} 
                  onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                  placeholder="Item Name"
                  style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px', 
                    color: '#333333', 
                    width: 'calc(100% - 24px)', 
                    border: 'none',
                    borderBottom: '1px dotted #9ca3af', 
                    background: 'transparent', 
                    outline: 'none',
                    marginBottom: '10px',
                    padding: '2px 0',
                    transition: 'border-color 0.2s'
                  }} 
                  onFocus={e => e.target.style.borderBottom = '1px dashed #b58a3d'}
                  onBlur={e => e.target.style.borderBottom = '1px dotted #9ca3af'}
                />
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.unitPrice} (៛)</span>
                    <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.quantity}</span>
                    <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} />
                  </div>
                </div>

                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #eadeca', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#8a7650' }}>{currentT.subtotal}</span>
                  <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '14px' }}>{formatRielFromNative(item.custom_price_riel * item.quantity)}</span>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div style={{ position: 'sticky', bottom: 0, padding: '16px 20px', borderTop: '1px solid #e5e7eb', backgroundColor: '#fcfbfa', flexShrink: 0, zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.totalKhmer}</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRielFromNative(totalRiel)}</span>
          </div>
          {/* RESTORED USD TOTAL */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', color: '#8a7650' }}>{currentT.totalUsd}</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{formatUSD(totalUSD)}</span>
          </div>
          
          {/* FIXED DISABLED BUTTON TEXT COLOR */}
          <button 
            onClick={checkout} 
            disabled={cart.length === 0 || isProcessing} 
            style={{ 
              width: '100%', 
              padding: '12px', 
              backgroundColor: (cart.length === 0 || isProcessing) ? '#e5e7eb' : '#10b981', 
              color: (cart.length === 0 || isProcessing) ? '#9ca3af' : '#ffffff', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer' 
            }}
          >
            {isProcessing ? 'Processing...' : currentT.checkout}
          </button>
        </div>
      </div>

      {/* MOBILE UI CART TRAY OVERLAY */}
      {cart.length > 0 && !isMobileCartOpen && !completedSale && (
        <div className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 View Cart ({cart.length})</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatRielFromNative(totalRiel)} &nbsp; ➔</div>
        </div>
      )}

      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: '360px', height: '100%', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fcfbfa', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '150px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ padding: '12px', backgroundColor: '#fcfbfa', border: '1px solid #f4f1ea', borderRadius: '8px', marginBottom: '12px', position: 'relative' }}>
                  <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', zIndex: 5 }}>✕</button>
                  
                  {/* EDITABLE CART NAME FOR MOBILE (WITH DOTTED LINE) */}
                  <input 
                    type="text" 
                    value={item.custom_name} 
                    onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                    placeholder="Item Name"
                    style={{ 
                      fontWeight: 'bold', 
                      fontSize: '14px', 
                      color: '#333333', 
                      width: 'calc(100% - 24px)', 
                      border: 'none',
                      borderBottom: '1px dotted #9ca3af', 
                      background: 'transparent', 
                      outline: 'none',
                      marginBottom: '10px',
                      padding: '2px 0',
                      transition: 'border-color 0.2s'
                    }} 
                    onFocus={e => e.target.style.borderBottom = '1px dashed #b58a3d'}
                    onBlur={e => e.target.style.borderBottom = '1px dotted #9ca3af'}
                  />

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '6px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.unitPrice}</span>
                      <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.quantity}</span>
                      <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#b58a3d', marginTop: '8px' }}>{formatRielFromNative(item.custom_price_riel * item.quantity)}</div>
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#fcfbfa', flexShrink: 0, zIndex: 1010, boxShadow: '0 -4px 10px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{currentT.totalKhmer}</span>
                <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '18px' }}>{formatRielFromNative(totalRiel)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', color: '#8a7650' }}>{currentT.totalUsd}</span>
                <span style={{ fontWeight: 'bold', color: '#4a3b1b', fontSize: '13px' }}>{formatUSD(totalUSD)}</span>
              </div>
              <button 
                onClick={checkout} 
                disabled={cart.length === 0 || isProcessing} 
                style={{ 
                  width: '100%', 
                  padding: '14px', 
                  backgroundColor: (cart.length === 0 || isProcessing) ? '#e5e7eb' : '#10b981', 
                  color: (cart.length === 0 || isProcessing) ? '#9ca3af' : '#ffffff', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontWeight: 'bold', 
                  fontSize: '15px', 
                  cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer' 
                }}
              >
                {isProcessing ? 'Processing...' : currentT.checkout}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTML INVOICE LAYOUT TO BE CAPTURED */}
      {completedSale && (
        <div className="invoice-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          <div className="invoice-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '16px', padding: '0 20px' }}>
            <button onClick={() => setCompletedSale(null)} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Close Window</button>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              {isDeviceMobile ? (
                <>
                  <button onClick={handleDesktopDownloadPNG} disabled={isDownloading} style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>{isDownloading ? '⏳...' : '⬇️ Save Photo'}</button>
                  <button onClick={handleMobileShare} disabled={isDownloading} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>{isDownloading ? '⏳...' : '📤 Share'}</button>
                </>
              ) : (
                <>
                  <button onClick={handleDesktopDownloadPNG} disabled={isDownloading} style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>{isDownloading ? '⏳...' : '⬇️ Download Image'}</button>
                  <button onClick={handleNativePrint} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ Print / PDF</button>
                </>
              )}
            </div>
          </div>

          <div className="invoice-preview-container" style={{ overflowY: 'auto', maxHeight: '80vh', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
            
            <div id="invoice-capture-area" ref={invoiceRef} style={{ width: '794px', height: '559px', backgroundColor: '#ffffff', position: 'relative', padding: '24px', boxSizing: 'border-box', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", color: '#000000', fontSize: '13px', lineHeight: '20px' }}>
              <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer&display=swap" rel="stylesheet" />
              
              <div className="invoice-watermark" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: "url('https://i.imgur.com/XUsrp9D.png')", backgroundRepeat: 'no-repeat', backgroundPosition: 'center center', backgroundSize: '40%', opacity: 0.14, zIndex: 0, pointerEvents: 'none' }}></div>

              <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '60px', height: '70px', zIndex: 2 }}><img src="https://i.imgur.com/s0hg3MQ.png" alt="Left Logo" style={{ width: '100%', height: '100%', display: 'block' }} crossOrigin="anonymous" /></div>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '85px', height: '75px', zIndex: 2 }}><img src="https://i.imgur.com/Guk0hVe.png" alt="Right Logo" style={{ width: '95%', height: '100%', display: 'block', filter: 'brightness(0)' }} crossOrigin="anonymous" /></div>

                <header style={{ textAlign: 'center', marginBottom: '14px' }}>
                  <h1 style={{ fontSize: '23px', lineHeight: '28px', margin: '0 0 2px 0', fontWeight: 'bold', color: 'green' }}>ដេប៉ូអង្ករ រ៉េឌៀន</h1>
                  <p style={{ margin: '1px 0', color: 'green' }}>មានបោះដុំ លក់រាយអង្ករដែលមានគុណភាពខ្ពស់គ្រប់ប្រភេទ និងមានទទួលវិចខ្ចប់អំណោយក្នុងតម្លៃសមរម្យ</p>
                  <p style={{ margin: '1px 0' }}>📲 077 797 798 / 📞 081 797 798 / 📞 088 97 97 798</p>
                  <p style={{ margin: '1px 0' }}>📍 ផ្ទះលេខ 72 ផ្លូវលំ សង្កាត់ស្ទឹងមានជ័យ1 ខណ្ឌមានជ័យ រាជធានីភ្នំពេញ</p>
                </header>

                <table style={{ width: '746px', borderCollapse: 'collapse', marginBottom: '6px', boxSizing: 'border-box' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0 4px', width: '33%', color: '#000000' }}>ឈ្មោះអតិថិជន: <strong style={{fontWeight: 'bold'}}>{completedSale.customer?.name || 'Walk-in'}</strong></td>
                      <td style={{ padding: '0 4px', width: '34%', color: '#000000' }}>ទីតាំង: <strong style={{fontWeight: 'bold'}}>{completedSale.customer?.location || 'N/A'}</strong></td>
                      <td style={{ padding: '0 4px', width: '33%', color: '#000000' }}>លេខទូរសព្ទ: <strong style={{fontWeight: 'bold'}}>{completedSale.customer?.phone || 'N/A'}</strong></td>
                    </tr>
                  </tbody>
                </table>

                <table style={{ width: '746px', borderCollapse: 'collapse', marginBottom: '4px', tableLayout: 'fixed', boxSizing: 'border-box' }}>
                  <colgroup>
                    <col style={{ width: '45px' }} />
                    <col style={{ width: '331px' }} />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '150px' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ backgroundColor: '#fffacd', height: '36px' }}>
                      <th style={{ border: '1px solid #000000', padding: '0', textAlign: 'center', fontWeight: 'bold', color: '#000000', verticalAlign: 'middle' }}>
                        <div style={{ lineHeight: '14px' }}>No.<br/>ល.រ</div>
                      </th>
                      <th style={{ border: '1px solid #000000', padding: '0', textAlign: 'center', fontWeight: 'bold', color: '#000000', verticalAlign: 'middle' }}>
                        <div style={{ lineHeight: '14px' }}>Item Descriptions<br/>រាយឈ្មោះទំនិញ</div>
                      </th>
                      <th style={{ border: '1px solid #000000', padding: '0', textAlign: 'center', fontWeight: 'bold', color: '#000000', verticalAlign: 'middle' }}>
                        <div style={{ lineHeight: '14px' }}>Quantity<br/>ចំនួន</div>
                      </th>
                      <th style={{ border: '1px solid #000000', padding: '0', textAlign: 'center', fontWeight: 'bold', color: '#000000', verticalAlign: 'middle' }}>
                        <div style={{ lineHeight: '14px' }}>Unit Price<br/>តម្លៃរាយ</div>
                      </th>
                      <th style={{ border: '1px solid #000000', padding: '0', textAlign: 'center', fontWeight: 'bold', color: '#000000', verticalAlign: 'middle' }}>
                        <div style={{ lineHeight: '14px' }}>Subtotal<br/>តម្លៃសរុប</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const displayItems = getCategorizedItems(completedSale.cartSnapshot);
                      const rows = [];
                      let grandTotal = 0;
                      let itemIndex = 0;
                      const maxRows = Math.max(10, displayItems.length);
                      
                      for (let i = 0; i < maxRows; i++) {
                        const item = displayItems[i];
                        if (item) {
                          itemIndex++;
                          let total = item.custom_price_riel * item.quantity;
                          const desc = item.custom_name;

                          if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) {
                            total = total * -1;
                          }
                          grandTotal += total;

                          const isCenter = desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់') || desc.includes('សេវាឡាន (អតិថិជន)');

                          rows.push(
                            <tr key={i} style={{ height: '24px' }}>
                              <td style={{ border: '1px solid #000000', padding: '0 4px', textAlign: 'center', verticalAlign: 'middle', color: '#000000' }}>{itemIndex}</td>
                              <td style={{ border: '1px solid #000000', padding: '0 4px', textAlign: isCenter ? 'center' : 'left', verticalAlign: 'middle', color: '#000000', wordWrap: 'break-word', overflow: 'hidden' }}>{desc}</td>
                              <td style={{ border: '1px solid #000000', padding: '0 4px', textAlign: 'center', verticalAlign: 'middle', color: '#000000' }}>{item.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                              <td style={{ border: '1px solid #000000', padding: '0 4px', textAlign: 'center', verticalAlign: 'middle', color: '#000000' }}>{item.custom_price_riel.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                              <td style={{ border: '1px solid #000000', padding: '0 4px', textAlign: 'center', verticalAlign: 'middle', color: total < 0 ? 'red' : '#000000' }}>{total.toLocaleString('en-US')}</td>
                            </tr>
                          );
                        } else {
                          rows.push(
                            <tr key={i} style={{ height: '24px' }}>
                              <td style={{ border: '1px solid #000000', padding: '0' }}>&nbsp;</td>
                              <td style={{ border: '1px solid #000000', padding: '0' }}>&nbsp;</td>
                              <td style={{ border: '1px solid #000000', padding: '0' }}>&nbsp;</td>
                              <td style={{ border: '1px solid #000000', padding: '0' }}>&nbsp;</td>
                              <td style={{ border: '1px solid #000000', padding: '0' }}>&nbsp;</td>
                            </tr>
                          );
                        }
                      }
                      return (
                        <>
                          {rows}
                          <tr style={{ height: '26px' }}>
                            <td colSpan={4} style={{ border: '1px solid #000000', padding: '0 6px', backgroundColor: '#fffacd', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#000000' }}>Total | សរុប</td>
                            <td style={{ border: '1px solid #000000', padding: '0 4px', backgroundColor: '#fffacd', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', color: '#000000' }}>{grandTotal.toLocaleString('en-US')}</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>

                {/* FIXED ALIGNMENT SIGNATURE FOOTER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 30px', marginTop: '30px', fontSize: '13px', color: '#000000' }}>
                   <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '35px' }}>ហត្ថលេខាអ្នកទិញ</div>
                      <div>..........................................</div>
                   </div>
                   <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '35px' }}>ហត្ថលេខាអ្នកលក់</div>
                      <div>..........................................</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      {/* Aligns text evenly with the 'ហត្ថលេខា' text layer */}
                      <div>ថ្ងៃទី {completedSale.dateObj.day} ខែ {completedSale.dateObj.month} ឆ្នាំ {completedSale.dateObj.year}</div>
                   </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-capture-area, #invoice-capture-area * { visibility: visible; }
          #invoice-capture-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important; 
            max-width: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 24px !important; 
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A5 landscape; margin: 5mm; }
          .invoice-controls { display: none !important; }
          .invoice-preview-container { overflow: visible !important; max-height: none !important; }
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .mobile-fab { display: none; }
        
        @media (max-width: 1023px) { 
          .desktop-cart-panel { display: none !important; }
          .pos-main-engine .pos-header { padding: 60px 16px 12px 16px !important; }
          .pos-tools-area { padding: 16px 16px 16px 16px !important; }
          .pos-grid-area { padding: 16px 16px 16px 16px !important; }
          .mobile-fab {
            display: flex !important; 
            justify-content: space-between; 
            align-items: center; 
            position: fixed; 
            bottom: 20px; 
            left: 20px; 
            right: 20px; 
            background: #10b981; 
            color: white; 
            padding: 16px 20px; 
            border-radius: 12px; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); 
            z-index: 998; 
            cursor: pointer;
          }
        }
      `}</style>
    </div>
  )
}