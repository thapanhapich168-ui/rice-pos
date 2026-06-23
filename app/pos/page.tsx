'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Constants
const EXCHANGE_RATE = 4000;
const PDFMONKEY_API_KEY = 'mxP6zZCbyNJb1x5t4-ft';
const PDFMONKEY_TEMPLATE_ID = '6CBCBF33-56C3-46E5-BCD2-D8B3EF6FFDD6';
const TELEGRAM_BOT_TOKEN = '8202595979:AAGTXa2EBD9Sr6btcdCpOHs2loAc_JCFZ1g'; // Replace with your bot token
const TELEGRAM_CHAT_ID = '-1001234567890';

// Helper for currency formatting
const formatRiel = (amountInUsd: number) => {
  const riel = Math.round(amountInUsd * EXCHANGE_RATE);
  return new Intl.NumberFormat('km-KH', { style: 'currency', currency: 'KHR', maximumFractionDigits: 0 }).format(riel);
};

const formatUSD = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  
  // UI Control States
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true) 
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)

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

  function addToCart(product: any) {
    const existing = cart.find((item) => item.id === product.id)
    if (existing) {
      setCart(cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      setCart([...cart, { ...product, quantity: 1, custom_name: product.name, custom_price: product.price }])
    }
  }

  // Handle manual inline updates inside the cart array dynamically
  function updateCartItem(id: number, field: string, value: any) {
    setCart(cart.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  function removeFromCart(id: number) {
    setCart(cart.filter(item => item.id !== id))
  }

  const totalUSD = cart.reduce((sum, item) => sum + (Number(item.custom_price) * Number(item.quantity)), 0)

  // Filter products based on Search and Tab criteria (Wholesale >= 50kg, Retail < 50kg)
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
    const weightVal = parseFloat(p.weight || 0)
    if (activeTab === 'wholesale') {
      return matchesSearch && weightVal >= 50
    }
    return matchesSearch && weightVal < 50
  })

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  async function checkout() {
    if (cart.length === 0) {
      alert('សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក! (Cart is empty)')
      return
    }
    if (activeTab === 'wholesale' && !selectedCustomerId) {
      alert('សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ! (Please select a customer for wholesale)')
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
          selling_price: item.custom_price,
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
            total_riel: formatRiel(totalUSD),
            items: cart.map(item => ({
              name: item.custom_name,
              qty: item.quantity,
              price_usd: formatUSD(item.custom_price),
              subtotal_usd: formatUSD(item.custom_price * item.quantity),
              subtotal_riel: formatRiel(item.custom_price * item.quantity)
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
                         `💰 *Total KHR:* ${formatRiel(totalUSD)}\n` +
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

      alert(`ការលក់បានជោគជ័យ! Invoice Created: ${invoiceNo}`)
      setCart([])
      setIsMobileCartOpen(false)
      loadProducts()

    } catch (err: any) {
      alert(`Checkout system fault: ${err.message || err}`)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', background: '#ffffff', overflow: 'hidden', position: 'relative' }}>
      
      {/* LEFT CONTENT AREA: PRODUCTS MANAGEMENT AND SELECTION */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        
        {/* APP BRAND BAR AND TOP NAVIGATION ACTIONS CONTAINER */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: '4px 8px', color: '#b58a3d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Toggle Checkout View"
            >
              ☰
            </button>
            <img src="https://imgur.com/s0hg3MQ.png" alt="Rice POS Logo" style={{ height: '40px', objectFit: 'contain' }} />
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#4a3b1b', letterSpacing: '0.5px' }}>សហគមន៍កសិកម្ម Rice POS</h1>
          </div>
          
          <button
            onClick={() => setIsMobileCartOpen(true)}
            style={{
              display: 'none',
              background: '#b58a3d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              padding: '8px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              position: 'relative'
            }}
            className="mobile-cart-trigger"
          >
            🛒 កន្ត្រក ({cart.length})
          </button>
        </header>

        {/* CONTROLS SUBHEAD FILTER BAR SECTION */}
        <div style={{ padding: '16px 20px', background: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button 
              onClick={() => { setActiveTab('retail'); if(activeTab !== 'retail') setSelectedCustomerId(''); }}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'retail' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'retail' ? '#ffffff' : '#6b582f', transition: 'all 0.2s' }}
            >
              🛍️ លក់រាយ (Retail &lt; 50kg)
            </button>
            <button 
              onClick={() => setActiveTab('wholesale')}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'wholesale' ? '#b58a3d' : '#f4f1ea', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', transition: 'all 0.2s' }}
            >
              🌾 លក់ដុំ (Wholesale ≥ 50kg)
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
              <input 
                type="text"
                placeholder="🔍 ស្វែងរកឈ្មោះអង្ករ... (Search products)"
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
                  <option value="">👤 -- ជ្រើសរើសអតិថិជនដុំ (Select Customer) --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.phone} ({c.location})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* GRID DISPLAY LAYOUT GRID COMPONENT WINDOW */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#ffffff' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8a7650' }}>មិនមានទំនិញស្វែងរកឡើយ (No items match selection filter)</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '16px'
            }}>
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => addToCart(p)}
                  style={{
                    border: '1px solid #eadeca',
                    borderRadius: '10px',
                    padding: '14px',
                    cursor: 'pointer',
                    background: '#ffffff',
                    boxShadow: '0 2px 4px rgba(181,138,61,0.04)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(181,138,61,0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(181,138,61,0.04)' }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#4a3b1b', marginBottom: '6px', lineHeight: '1.3' }}>{p.name}</div>
                    <div style={{ fontSize: '13px', color: '#8a7650', marginBottom: '8px' }}>⚖️ ទម្ងន់: {p.weight} kg</div>
                  </div>
                  <div style={{ borderTop: '1px dashed #f4f1ea', paddingTop: '8px', marginTop: '6px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#b58a3d' }}>{formatRiel(p.price)}</div>
                    <div style={{ fontSize: '12px', color: '#9c8a6c' }}>{formatUSD(p.price)}</div>
                    <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>
                      📦 ស្តុកសល់: {p.stock}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL: COMPLETE CART SLIDEOUT DRAWER INTERFACE */}
      <div 
        className={`checkout-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
        style={{
          width: isSidebarOpen ? '380px' : '0px',
          opacity: isSidebarOpen ? 1 : 0,
          visibility: isSidebarOpen ? 'visible' : 'hidden',
          background: '#ffffff',
          borderLeft: isSidebarOpen ? '1px solid #e5e7eb' : 'none',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', background: '#fcfbfa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold', color: '#4a3b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🛒 កន្ត្រកទំនិញ <span style={{ background: '#b58a3d', color: '#fff', fontSize: '12px', padding: '2px 8px', borderRadius: '10px' }}>{cart.length}</span>
          </h2>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#9c8a6c' }}
            className="desktop-sidebar-close"
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', marginTop: '40px', color: '#9c8a6c' }}>មិនមានទំនិញក្នុងកន្ត្រកឡើយ</div>
          ) : (
            cart.map((item) => (
              <div key={item.id} style={{ background: '#fcfbfa', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #f4f1ea', position: 'relative' }}>
                <button 
                  onClick={() => removeFromCart(item.id)}
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px' }}
                >
                  ✕
                </button>
                
                <input
                  type="text"
                  value={item.custom_name}
                  onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                  style={{ width: '85%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', padding: '2px 0', marginBottom: '8px', outline: 'none' }}
                  onFocus={(e) => e.target.style.borderBottom = '1px solid #b58a3d'}
                  onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '45%' }}>
                    <span style={{ fontSize: '11px', color: '#8a7650', marginBottom: '2px' }}>តម្លៃឯកតា ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.custom_price}
                      onChange={(e) => updateCartItem(item.id, 'custom_price', parseFloat(e.target.value) || 0)}
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #dcd7cc', fontSize: '13px', color: '#4a3b1b', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', width: '45%' }}>
                    <span style={{ fontSize: '11px', color: '#8a7650', marginBottom: '2px' }}>បរិមាណ (Qty)</span>
                    <input
                      type="number"
                      value={item.quantity}
                      min="1"
                      onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #dcd7cc', fontSize: '13px', color: '#4a3b1b', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* ✅ FIXED: Changed shorthand 'pt' to valid standard react property 'paddingTop' */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '6px', borderTop: '1px dashed #eadeca', fontSize: '12px' }}>
                  <span style={{ color: '#8a7650' }}>តម្លៃសរុប:</span>
                  <span style={{ fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(item.custom_price * item.quantity)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa' }}>
          <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>សរុបរួម (Khmer):</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#b58a3d' }}>{formatRiel(totalUSD)}</span>
          </div>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: '#8a7650' }}>Total in USD:</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{formatUSD(totalUSD)}</span>
          </div>

          <button
            onClick={checkout}
            disabled={cart.length === 0}
            style={{
              width: '100%',
              padding: '14px',
              background: cart.length === 0 ? '#dcd7cc' : '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(16,185,129,0.1)',
              transition: 'background 0.2s'
            }}
          >
            ចាត់ចែងការទូទាត់ (Checkout)
          </button>
        </div>
      </div>

      {/* FULL RESPONSIVE OVERLAY DRAWER FOR ACTIVE MOBILE VIEW CARTS */}
      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: '360px', height: '100%', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfbfa' }}>
              <h3 style={{ margin: 0, color: '#4a3b1b' }}>🛒 ទំនិញក្នុងកន្ត្រក ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#4a3b1b' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ padding: '12px', background: '#fcfbfa', border: '1px solid #f4f1ea', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '6px' }}>{item.custom_name}</div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={item.custom_price} 
                      onChange={(e) => updateCartItem(item.id, 'custom_price', parseFloat(e.target.value) || 0)}
                      style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #dcd7cc' }} 
                    />
                    <input 
                      type="number" 
                      value={item.quantity} 
                      onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      style={{ width: '50%', padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #dcd7cc' }} 
                    />
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#b58a3d' }}>
                    {formatRiel(item.custom_price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontWeight: 'bold', color: '#4a3b1b' }}>សរុប:</span>
                <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '18px' }}>{formatRiel(totalUSD)}</span>
              </div>
              <button 
                onClick={checkout}
                style={{ width: '100%', padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 1023px) {
          .checkout-sidebar.open {
            display: none !important;
          }
          .mobile-cart-trigger {
            display: block !important;
          }
        }
      `}</style>

    </div>
  )
}