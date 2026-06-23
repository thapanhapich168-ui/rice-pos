'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

// Constants
const EXCHANGE_RATE = 4000;
const PDFMONKEY_API_KEY = 'mxP6zZCbyNJb1x5t4-ft';
const PDFMONKEY_TEMPLATE_ID = '6CBCBF33-56C3-46E5-BCD2-D8B3EF6FFDD6';
const TELEGRAM_BOT_TOKEN = '8202595979:AAGTXa2EBD9Sr6btcdCpOHs2loAc_JCFZ1g';
const TELEGRAM_CHAT_ID = '-1003821903426';

// Translations Dictionary
const t = {
  en: {
    title: "Angkor Radiant Rice POS",
    retail: "🛍️ Retail (1kg)",
    wholesale: "🌾 Wholesale (50kg)",
    searchPlaceholder: "🔍 Search products...",
    selectCustomer: "👤 -- Select Wholesale Customer --",
    noProducts: "No products match selection filter",
    stock: "Stock",
    weight: "Weight",
    cartTitle: "🛒 Shopping Cart",
    emptyCart: "Cart is empty",
    unitPrice: "Unit Price",
    quantity: "Quantity",
    subtotal: "Subtotal:",
    totalKhmer: "Total:",
    totalUsd: "Total in USD:",
    checkout: "Checkout",
    dashboard: "📊 Dashboard",
    posSystem: "🛒 POS System",
    productsAdmin: "📦 Products Admin",
    detailedReports: "📈 Detailed Reports",
    riceControl: "🌾 Rice Control",
    logout: "Logout",
    mobileModalTitle: "Adjust Item Properties",
    cancel: "Cancel",
    add: "Add to Cart"
  },
  kh: {
    title: "អង្គរ រេឌឌៀន រ៉ាយស៍ ភីអូអេស",
    retail: "🛍️ លក់រាយ (1kg)",
    wholesale: "🌾 លក់ដុំ (50kg)",
    searchPlaceholder: "🔍 ស្វែងរកឈ្មោះអង្ករ...",
    selectCustomer: "👤 -- ជ្រើសរើសអតិថិជនដុំ --",
    noProducts: "មិនមានទំនិញស្វែងរកឡើយ",
    stock: "ស្តុកសល់",
    weight: "ទម្ងន់",
    cartTitle: "🛒 កន្ត្រកទំនិញ",
    emptyCart: "មិនមានទំនិញក្នុងកន្ត្រកឡើយ",
    unitPrice: "តម្លៃឯកតា",
    quantity: "បរិមាណ",
    subtotal: "តម្លៃសរុប:",
    totalKhmer: "សរុបរួម:",
    totalUsd: "សរុបជាដុល្លារ:",
    checkout: "ចាត់ចែងការទូទាត់",
    dashboard: "📊 ផ្ទាំងគ្រប់គ្រង",
    posSystem: "🛒 ប្រព័ន្ធលក់ POS",
    productsAdmin: "📦 គ្រប់គ្រងទំនិញ",
    detailedReports: "📈 របាយការណ៍លម្អិត",
    riceControl: "🌾 គ្រប់គ្រងតម្លៃអង្ករ",
    logout: "ចាកចេញ",
    mobileModalTitle: "កែសម្រួលព័ត៌មានទំនិញ",
    cancel: "បោះបង់",
    add: "បញ្ចូលទៅកន្ត្រក"
  }
};

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  
  // UI Control States
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) 
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)

  // Mobile Product Setup Dialog Modal States
  const [selectedMobileProduct, setSelectedMobileProduct] = useState<any>(null)
  const [mobilePrice, setMobilePrice] = useState<number>(0)
  const [mobileQty, setMobileQty] = useState<number>(1)
  const [mobileName, setMobileName] = useState<string>('')

  useEffect(() => {
    loadProducts()
    loadCustomers()
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false)
    }
  }, [])

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*')
    setProducts(data || [])
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*')
    setCustomers(data || [])
  }

  // FIXED: Simply reads the raw database value because it is already in Riel
  const formatRielSymbol = (amountInRiel: number) => {
    return `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  };

  const formatRielFromNative = (rielAmount: number) => {
    return `${new Intl.NumberFormat('en-US').format(Math.round(rielAmount))} ៛`;
  };

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // Click action intercept handler
  function handleProductClick(product: any) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1023;
    if (isMobile) {
      setSelectedMobileProduct(product);
      setMobileName(product.name);
      setMobilePrice(Number(product.price)); // FIXED: Directly pass native Riel price
      setMobileQty(1);
    } else {
      addToCartDirect(product);
    }
  }

  function addToCartDirect(product: any) {
    const existing = cart.find((item) => item.id === product.id)
    const priceInRiel = Number(product.price); // FIXED: No multiplication needed
    if (existing) {
      setCart(cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      setCart([...cart, { ...product, quantity: 1, custom_name: product.name, custom_price_riel: priceInRiel }])
    }
  }

  function handleAddMobileProductToCart() {
    if (!selectedMobileProduct) return;
    const existing = cart.find((item) => item.id === selectedMobileProduct.id);
    if (existing) {
      setCart(cart.map((item) => item.id === selectedMobileProduct.id ? { 
        ...item, 
        custom_name: mobileName,
        custom_price_riel: mobilePrice,
        quantity: item.quantity + mobileQty 
      } : item));
    } else {
      setCart([...cart, { 
        ...selectedMobileProduct, 
        id: selectedMobileProduct.id,
        custom_name: mobileName, 
        custom_price_riel: mobilePrice, 
        quantity: mobileQty 
      }]);
    }
    setSelectedMobileProduct(null);
  }

  function updateCartItem(id: number, field: string, value: any) {
    setCart(cart.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  function removeFromCart(id: number) {
    setCart(cart.filter(item => item.id !== id))
  }

  // Calculate totals natively from Riel
  const totalRiel = cart.reduce((sum, item) => sum + (Number(item.custom_price_riel) * Number(item.quantity)), 0)
  const totalUSD = totalRiel / EXCHANGE_RATE; // Divides correctly to display USD conversion 

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    const weightVal = parseFloat(p.weight || 0)
    if (activeTab === 'wholesale') {
      return matchesSearch && weightVal >= 50
    }
    return matchesSearch && weightVal < 50
  })

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  async function checkout() {
    if (cart.length === 0) {
      alert(lang === 'kh' ? 'សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក!' : 'Cart is empty')
      return
    }
    if (activeTab === 'wholesale' && !selectedCustomerId) {
      alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale')
      return
    }

    try {
      const { data: invoiceNo, error: invoiceError } = await supabase.rpc('generate_invoice_no')
      if (invoiceError) throw invoiceError

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          invoice_no: invoiceNo,
          total_amount: totalUSD,
          payment_method: 'cash',
          payment_status: 'paid',
          customer_id: activeTab === 'wholesale' ? selectedCustomerId : null
        }])
        .select().single()

      if (saleError) throw saleError

      for (const item of cart) {
        await supabase.from('sale_items').insert([{
          sale_id: sale.id,
          product_id: item.id,
          quantity: item.quantity,
          selling_price: item.custom_price_riel / EXCHANGE_RATE, // Formats back to standard $ for schema storage
          cost_price: item.cost_price || 0
        }])

        await supabase.rpc('decrease_stock', {
          product_id_input: item.id,
          qty: item.quantity
        })
      }

      const currentDate = new Date()
      const formattedDate = `${String(currentDate.getDate()).padStart(2, '0')}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${currentDate.getFullYear()}`

      const pdfMonkeyPayload = {
        document: {
          document_template_id: PDFMONKEY_TEMPLATE_ID,
          payload: {
            invoice_number: invoiceNo,
            date: formattedDate,
            customer_name: activeTab === 'wholesale' && selectedCustomer ? selectedCustomer.name : 'General Retail Customer',
            customer_phone: activeTab === 'wholesale' && selectedCustomer ? selectedCustomer.phone : 'N/A',
            customer_location: activeTab === 'wholesale' && selectedCustomer ? selectedCustomer.location : 'Store Walk-in',
            total_usd: formatUSD(totalUSD),
            total_riel: formatRielFromNative(totalRiel),
            items: cart.map(item => ({
              name: item.custom_name,
              qty: item.quantity,
              price_usd: formatUSD(item.custom_price_riel / EXCHANGE_RATE),
              subtotal_usd: formatUSD((item.custom_price_riel * item.quantity) / EXCHANGE_RATE),
              subtotal_riel: formatRielFromNative(item.custom_price_riel * item.quantity)
            }))
          },
          status: 'pending'
        }
      }

      const pdfResponse = await fetch('https://api.pdfmonkey.io/api/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PDFMONKEY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pdfMonkeyPayload)
      })
      const pdfData = await pdfResponse.json()
      const downloadUrl = pdfData?.document?.download_url

      let telegramText = `🌾 *NEW SALE INVOICE OUTFLOW* 🌾\n\n` +
                         `🆔 *Invoice:* ${invoiceNo}\n` +
                         `📅 *Date:* ${formattedDate}\n` +
                         `👤 *Client:* ${pdfMonkeyPayload.document.payload.customer_name}\n` +
                         `💰 *Total:* ${formatRielFromNative(totalRiel)}\n` +
                         `💵 *Total USD:* ${formatUSD(totalUSD)}\n\n`;
      
      if (downloadUrl) {
        telegramText += `📄 [Download PDF Invoice Document](${downloadUrl})`;
      }

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramText,
          parse_mode: 'Markdown'
        })
      })

      alert(lang === 'kh' ? `ការលក់បានជោគជ័យ! លេខវិក្កយបត្រ: ${invoiceNo}` : `Sale completed successfully! Invoice: ${invoiceNo}`)
      setCart([])
      setIsMobileCartOpen(false)
      loadProducts()

    } catch (err: any) {
      alert(`System Fault: ${err.message || err}`)
    }
  }

  const currentT = t[lang];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', background: '#ffffff', overflow: 'hidden' }}>
      
      {/* 1. APP CORE SIDEBAR SHELL PANEL */}
      <div style={{
        width: isSidebarOpen ? '240px' : '0px',
        opacity: isSidebarOpen ? 1 : 0,
        visibility: isSidebarOpen ? 'visible' : 'hidden',
        background: '#111827',
        color: 'white',
        padding: isSidebarOpen ? '20px' : '0px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 100
      }}>
        <div>
          <h2 style={{ marginBottom: 30, color: '#fff', fontSize: '20px', whiteSpace: 'nowrap' }}>🌾 Rice POS</h2>
          <p style={{ marginBottom: 20 }}><Link href="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.dashboard}</Link></p>
          <p style={{ marginBottom: 20, fontWeight: 'bold' }}><Link href="/pos" style={{ color: '#38bdf8', textDecoration: 'none' }}>{currentT.posSystem}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/admin" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.productsAdmin}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/dashboard" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.detailedReports}</Link></p>
          <p style={{ marginBottom: 20 }}><Link href="/rice" style={{ color: '#9ca3af', textDecoration: 'none' }}>{currentT.riceControl}</Link></p>
        </div>
        <button 
          onClick={() => supabase.auth.signOut()} 
          style={{ background: 'transparent', color: 'red', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          🚪 {currentT.logout}
        </button>
      </div>

      {/* 2. MIDDLE GRID SELECTION ENGINE AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff' }}>
        
        {/* TOP OPERATIONS ACTION BAR */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px', color: '#b58a3d', display: 'flex', alignItems: 'center' }}
            >
              ☰
            </button>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#4a3b1b' }}>Angkor Radiant Rice POS</h1>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#f4f1ea', borderRadius: '20px', padding: '2px' }}>
              <button onClick={() => setLang('en')} style={{ border: 'none', background: lang === 'en' ? '#b58a3d' : 'transparent', color: lang === 'en' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>EN</button>
              <button onClick={() => setLang('kh')} style={{ border: 'none', background: lang === 'kh' ? '#b58a3d' : 'transparent', color: lang === 'kh' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>KH</button>
            </div>

            <button
              onClick={() => setIsMobileCartOpen(true)}
              style={{ display: 'none', background: '#b58a3d', color: '#ffffff', border: 'none', borderRadius: '20px', padding: '8px 14px', fontWeight: 'bold', cursor: 'pointer' }}
              className="mobile-cart-badge-trigger"
            >
              🛒 ({cart.length})
            </button>
          </div>
        </header>

        {/* OPERATIONS MODE TAB SUBHEADERS */}
        <div style={{ padding: '16px 20px', background: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button 
              onClick={() => { setActiveTab('retail'); if(activeTab !== 'retail') setSelectedCustomerId(''); }}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'retail' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'retail' ? '#ffffff' : '#6b582f' }}
            >
              {currentT.retail}
            </button>
            <button 
              onClick={() => setActiveTab('wholesale')}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'wholesale' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f' }}
            >
              {currentT.wholesale}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <input 
                type="text"
                placeholder={currentT.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '14px', color: '#4a3b1b', boxSizing: 'border-box' }}
              />
            </div>

            {activeTab === 'wholesale' && (
              <div style={{ flex: 1, minWidth: '240px' }}>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dcd7cc', background: '#fff', fontSize: '14px', color: '#4a3b1b', outline: 'none' }}
                >
                  <option value="">{currentT.selectCustomer}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* TILES RENDER ELEMENT CONTAINER VIEWPORT */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#ffffff' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8a7650' }}>{currentT.noProducts}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  style={{ border: '1px solid #eadeca', borderRadius: '10px', padding: '14px', cursor: 'pointer', background: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '120px' }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '4px' }}>{p.name}</div>
                    <div style={{ fontSize: '12px', color: '#8a7650' }}>⚖️ {currentT.weight}: {activeTab === 'retail' ? '1kg' : '50kg'}</div>
                  </div>
                  <div style={{ borderTop: '1px dashed #f4f1ea', paddingTop: '8px', marginTop: '6px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#b58a3d' }}>{formatRielSymbol(p.price)}</div>
                    {activeTab === 'wholesale' && (
                      <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>
                        📦 {currentT.stock}: {p.stock}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. DESKTOP SYSTEM SIDEBAR SHOPPING CART */}
      <div 
        className="desktop-cart-panel"
        style={{ width: '380px', background: '#ffffff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', background: '#fcfbfa' }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#9c8a6c' }}>{currentT.emptyCart}</div>
          ) : (
            cart.map((item) => (
              <div key={item.id} style={{ background: '#fcfbfa', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #f4f1ea', position: 'relative' }}>
                <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '8px' }}>{item.custom_name}</div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ width: '60%' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b' }}>{currentT.unitPrice} (៛)</span>
                    <input
                      type="text"
                      value={item.custom_price_riel}
                      onChange={(e) => {
                        const cleanVal = parseFloat(e.target.value.replace(/,/g, '')) || 0;
                        updateCartItem(item.id, 'custom_price_riel', cleanVal);
                      }}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #b58a3d', fontSize: '13px', background: '#ffffff', color: '#000000', fontWeight: 'normal', outline: 'none', marginTop: '2px' }}
                    />
                  </div>
                  <div style={{ width: '40%' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b' }}>{currentT.quantity}</span>
                    <input
                      type="number"
                      value={item.quantity}
                      min="1"
                      onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #b58a3d', fontSize: '13px', background: '#ffffff', color: '#000000', fontWeight: 'normal', outline: 'none', marginTop: '2px' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '10px', paddingTop: '6px', borderTop: '1px dashed #eadeca', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#8a7650' }}>{currentT.subtotal}</span>
                  <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '14px' }}>{formatRielFromNative(item.custom_price_riel * item.quantity)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* CHECKOUT CALCULATORS CONSOLE BLOCK */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.totalKhmer}</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRielFromNative(totalRiel)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', color: '#8a7650' }}>{currentT.totalUsd}</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{formatUSD(totalUSD)}</span>
          </div>
          <button
            onClick={checkout}
            disabled={cart.length === 0}
            style={{ width: '100%', padding: '12px', background: cart.length === 0 ? '#dcd7cc' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            {currentT.checkout}
          </button>
        </div>
      </div>

      {/* 4. SMARTPHONE OVERLAY MODAL: ADJUST ON CLICK QUANTITIES */}
      {selectedMobileProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>{currentT.mobileModalTitle}</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Product Identifier</label>
              <input type="text" value={mobileName} onChange={(e) => setMobileName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#8a7650', marginBottom: '4px' }}>Price (៛)</label>
                <input type="number" value={mobilePrice} onChange={(e) => setMobilePrice(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', fontWeight: 'normal' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#8a7650', marginBottom: '4px' }}>Quantity</label>
                <input type="number" min="1" value={mobileQty} onChange={(e) => setMobileQty(parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', fontWeight: 'normal' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedMobileProduct(null)} style={{ padding: '10px 16px', background: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6b582f' }}>{currentT.cancel}</button>
              <button onClick={handleAddMobileProductToCart} style={{ padding: '10px 16px', background: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}>{currentT.add}</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SMARTPHONE CORE OVERLAY DRAWER PANEL FOR INTERNAL VIEW LISTINGS */}
      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: '360px', height: '100%', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfbfa' }}>
              <h3 style={{ margin: 0, color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ padding: '12px', background: '#fcfbfa', border: '1px solid #f4f1ea', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '6px' }}>{item.custom_name}</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input type="number" value={item.custom_price_riel} onChange={(e) => updateCartItem(item.id, 'custom_price_riel', parseFloat(e.target.value) || 0)} style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #dcd7cc', color: '#000000', fontWeight: 'normal' }} />
                    <input type="number" value={item.quantity} onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)} style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #dcd7cc', color: '#000000', fontWeight: 'normal' }} />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRielFromNative(item.custom_price_riel * item.quantity)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 'bold' }}>{currentT.totalKhmer}</span>
                <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '18px' }}>{formatRielFromNative(totalRiel)}</span>
              </div>
              <button onClick={checkout} style={{ width: '100%', padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>{currentT.checkout}</button>
            </div>
          </div>
        </div>
      )}

      {/* DISPATCH CSS INTERFACE TARGET LAYER */}
      <style jsx global>{`
        @media (max-width: 1023px) {
          .desktop-cart-panel {
            display: none !important;
          }
          .mobile-cart-badge-trigger {
            display: block !important;
          }
        }
      `}</style>

    </div>
  )
}