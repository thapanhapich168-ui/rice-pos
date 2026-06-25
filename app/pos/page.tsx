'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import html2canvas from 'html2canvas'

// Constants
const EXCHANGE_RATE = 4000;

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
    mobileModalTitle: "Adjust Item Properties",
    cancel: "Cancel",
    add: "Add to Cart"
  },
  kh: {
    title: "អង្គរ រេឌឌៀន រ៉ាយស៍ ភីអូអេស",
    retail: "🛍️ លក់រាយ (1kg)",
    wholesale: "🌾 លក់ដុំ (50kg)",
    searchPlaceholder: "🔍 ស្វែងរកឈ្មោះអង្ករ...",
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
    mobileModalTitle: "កែសម្រួលព័ត៌មានទំនិញ",
    cancel: "បោះបង់",
    add: "បញ្ចូលទៅកន្ត្រក"
  }
};

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false)

  const [selectedMobileProduct, setSelectedMobileProduct] = useState<any>(null)
  const [mobilePrice, setMobilePrice] = useState<number>(0)
  const [mobileQty, setMobileQty] = useState<number>(1)
  const [mobileName, setMobileName] = useState<string>('')

  // INVOICE MODAL STATE
  const [completedSale, setCompletedSale] = useState<any>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false) 
  const [hasAutoSaved, setHasAutoSaved] = useState(false)
  const invoiceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProducts()
    loadCustomers()
  }, [])

  useEffect(() => {
    if (completedSale && !hasAutoSaved && !isUploadingImage) {
      const timer = setTimeout(() => { executeAutoSaveOnly(); }, 800); 
      return () => clearTimeout(timer);
    }
  }, [completedSale, hasAutoSaved, isUploadingImage])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true })
    setProducts(data || [])
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })
    setCustomers(data || [])
  }

  const formatRielSymbol = (amountInRiel: number) => {
    return `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  }
  
  const formatRielFromNative = (rielAmount: number) => {
    return `${new Intl.NumberFormat('en-US').format(Math.round(rielAmount))} ៛`;
  }

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  function handleProductClick(product: any) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1023;
    if (isMobile) {
      setSelectedMobileProduct(product);
      setMobileName(product.name);
      setMobilePrice(Number(product.price)); 
      setMobileQty(1);
    } else {
      addToCartDirect(product);
    }
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

  const totalRiel = cart.reduce((sum, item) => sum + (Number(item.custom_price_riel) * Number(item.quantity)), 0)
  const totalUSD = totalRiel / EXCHANGE_RATE; 

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    const weightVal = parseFloat(p.weight || 0)
    return activeTab === 'wholesale' ? (matchesSearch && weightVal >= 50) : (matchesSearch && weightVal < 50)
  })

  const filteredCustomers = customers.filter(c => 
    (c.name || '').toLowerCase().includes(customerSearchTerm.toLowerCase()) || 
    (c.phone || '').includes(customerSearchTerm)
  )

  const selectedCustomer = customers.find(c => c.id.toString() === selectedCustomerId.toString())

  // --- CHECKOUT: WRITES TO BOTH FLAT TABLE AND SUMMARY TABLE ---
  async function checkout() {
    if (cart.length === 0) {
      return alert(lang === 'kh' ? 'សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក!' : 'Cart is empty');
    }
    if (activeTab === 'wholesale' && !selectedCustomerId) {
      return alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale');
    }

    setIsProcessing(true);
    setHasAutoSaved(false);

    try {
      const displayInvoiceNo = `INV-${Date.now().toString().slice(-6)}`;
      const cName = selectedCustomer ? selectedCustomer.name : 'Walk-in';
      const finalOwner = activeTab === 'wholesale' ? (selectedCustomer?.owner || null) : null;

      // 1. Prepare Individual Flat Rows for 'sales' table
      const saleRows = cart.map(item => ({
        invoice_id: displayInvoiceNo,
        customer_name: cName,
        rice_type: item.custom_name,
        qty: item.quantity,
        price_per_bag: item.custom_price_riel,
        cogs_price: item.cost_price || 0,
        owner: finalOwner
      }));

      // 2. Prepare Single Aggregated Row for 'invoice_summaries' table
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

      // 3. Execute Inserts
      const { error: saleError } = await supabase.from('sales').insert(saleRows);
      if (saleError) throw saleError;

      const { error: summaryError } = await supabase.from('invoice_summaries').insert([summaryRow]);
      if (summaryError) throw summaryError;

      // 4. Decrease Inventory
      for (const item of cart) {
        await supabase.rpc('decrease_stock', { 
          product_id_input: item.id, 
          qty: item.quantity 
        });
      }

      // 5. Trigger Capture Overlay
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
      loadProducts(); 

    } catch (err: any) {
      alert(`System Error during checkout: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // --- AUTO SAVE URL ---
  async function executeAutoSaveOnly() {
    if (!invoiceRef.current || !completedSale) return;
    setIsUploadingImage(true);

    try {
      const canvas = await html2canvas(invoiceRef.current, { 
        scale: 4, 
        useCORS: true, 
        allowTaint: true, 
        backgroundColor: '#ffffff',
        windowWidth: invoiceRef.current.scrollWidth,
        windowHeight: invoiceRef.current.scrollHeight
      });

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 1.0)); 
      if (blob) {
        const fileName = `${completedSale.invoiceNo}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, blob, { contentType: 'image/jpeg' });
        
        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
          
          // Apply URL to BOTH tables
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

  // --- MANUAL DOWNLOAD ---
  async function handleManualDownload() {
    if (!invoiceRef.current || !completedSale) return;
    setIsDownloading(true);

    try {
      const canvas = await html2canvas(invoiceRef.current, { 
        scale: 4, 
        useCORS: true, 
        allowTaint: true, 
        backgroundColor: '#ffffff' 
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
      const link = document.createElement('a');
      link.download = `${completedSale.invoiceNo}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error: any) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  }

  const currentT = t[lang];

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

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      overflow: 'hidden', 
      width: '100%', 
      fontFamily: 'Arial, sans-serif', 
      background: '#ffffff', 
      boxSizing: 'border-box', 
      position: 'relative' 
    }}>
      
      {/* MIDDLE GRID SELECTION ENGINE AREA */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        background: '#ffffff', 
        minWidth: 0, 
        height: '100%' 
      }}>
        <header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          padding: '12px 20px 12px 75px', 
          borderBottom: '1px solid #f3f4f6', 
          background: '#ffffff', 
          justifyContent: 'space-between', 
          flexShrink: 0 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#4a3b1b' }}>{currentT.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: '#f4f1ea', borderRadius: '20px', padding: '2px' }}>
              <button 
                onClick={() => setLang('en')} 
                style={{ 
                  border: 'none', 
                  background: lang === 'en' ? '#b58a3d' : 'transparent', 
                  color: lang === 'en' ? '#fff' : '#6b582f', 
                  padding: '6px 12px', 
                  borderRadius: '18px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  fontSize: '12px' 
                }}
              >
                EN
              </button>
              <button 
                onClick={() => setLang('kh')} 
                style={{ 
                  border: 'none', 
                  background: lang === 'kh' ? '#b58a3d' : 'transparent', 
                  color: lang === 'kh' ? '#fff' : '#6b582f', 
                  padding: '6px 12px', 
                  borderRadius: '18px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  fontSize: '12px' 
                }}
              >
                KH
              </button>
            </div>
          </div>
        </header>

        <div style={{ padding: '16px 20px 16px 75px', background: '#ffffff', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button 
              onClick={() => { 
                setActiveTab('retail'); 
                if(activeTab !== 'retail') { 
                  setSelectedCustomerId(''); 
                  setCustomerSearchTerm(''); 
                } 
              }} 
              style={{ 
                flex: 1, 
                padding: '12px', 
                borderRadius: '8px', 
                border: 'none', 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                background: activeTab === 'retail' ? '#b58a3d' : '#f4f1ea', 
                color: activeTab === 'retail' ? '#ffffff' : '#6b582f', 
                transition: '0.2s' 
              }}
            >
              {currentT.retail}
            </button>
            <button 
              onClick={() => setActiveTab('wholesale')} 
              style={{ 
                flex: 1, 
                padding: '12px', 
                borderRadius: '8px', 
                border: 'none', 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                background: activeTab === 'wholesale' ? '#b58a3d' : '#f4f1ea', 
                color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', 
                transition: '0.2s' 
              }}
            >
              {currentT.wholesale}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <input 
                type="text" 
                placeholder={currentT.searchPlaceholder} 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  borderRadius: '6px', 
                  border: '1px solid #dcd7cc', 
                  outline: 'none', 
                  fontSize: '14px', 
                  color: '#4a3b1b', 
                  boxSizing: 'border-box' 
                }} 
              />
            </div>
            
            {/* NEW SEARCHABLE CUSTOMER DROPDOWN */}
            {activeTab === 'wholesale' && (
              <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                <input 
                  type="text" 
                  placeholder={currentT.selectCustomer} 
                  value={customerSearchTerm} 
                  onChange={(e) => { 
                    setCustomerSearchTerm(e.target.value); 
                    setIsCustomerDropdownOpen(true); 
                    setSelectedCustomerId(''); 
                  }} 
                  onFocus={() => setIsCustomerDropdownOpen(true)} 
                  onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)} 
                  style={{ 
                    width: '100%', 
                    padding: '10px 14px', 
                    borderRadius: '6px', 
                    border: '1px solid #dcd7cc', 
                    outline: 'none', 
                    fontSize: '14px', 
                    color: '#4a3b1b', 
                    boxSizing: 'border-box', 
                    background: '#fff' 
                  }} 
                />
                
                {selectedCustomer && !isCustomerDropdownOpen && (
                  <div style={{ 
                    width: '100%', 
                    marginTop: '10px', 
                    padding: '12px', 
                    background: '#fefcf3', 
                    border: '1px solid #eadeca', 
                    borderRadius: '6px', 
                    fontSize: '13px', 
                    color: '#4a3b1b', 
                    position: 'relative' 
                  }}>
                    <button 
                      onClick={() => { 
                        setSelectedCustomerId(''); 
                        setCustomerSearchTerm(''); 
                      }} 
                      style={{ 
                        position: 'absolute', 
                        top: '6px', 
                        right: '6px', 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer', 
                        fontSize: '14px' 
                      }} 
                      title="Clear Customer"
                    >
                      ❌
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingRight: '20px' }}>
                      <div>
                        <strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>👤 NAME</strong>
                        {selectedCustomer.name}
                      </div>
                      <div>
                        <strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>📞 PHONE</strong>
                        {selectedCustomer.phone || '-'}
                      </div>
                      <div>
                        <strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px' }}>📍 LOCATION</strong>
                        {selectedCustomer.location || '-'}
                      </div>
                    </div>
                  </div>
                )}
                
                {isCustomerDropdownOpen && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '44px', 
                    left: 0, 
                    right: 0, 
                    background: '#fff', 
                    border: '1px solid #dcd7cc', 
                    borderRadius: '6px', 
                    maxHeight: '300px', 
                    overflowY: 'auto', 
                    zIndex: 100, 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Phone</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomers.map(c => (
                          <tr 
                            key={c.id} 
                            onMouseDown={(e) => { 
                              e.preventDefault(); 
                              setSelectedCustomerId(c.id.toString()); 
                              setCustomerSearchTerm(c.name); 
                              setIsCustomerDropdownOpen(false); 
                            }} 
                            style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6', color: '#4a3b1b' }} 
                            onMouseEnter={e => e.currentTarget.style.background = '#fefcf3'} 
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{c.name}</td>
                            <td style={{ padding: '10px 12px' }}>{c.phone || '-'}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b' }}>{c.location || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '20px 20px 20px 75px', overflowY: 'auto', background: '#ffffff', paddingBottom: '100px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8a7650' }}>{currentT.noProducts}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {filteredProducts.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => handleProductClick(p)} 
                  style={{ 
                    border: '1px solid #eadeca', 
                    borderRadius: '10px', 
                    padding: '14px', 
                    cursor: 'pointer', 
                    background: '#ffffff', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between', 
                    minHeight: '100px', 
                    transition: 'transform 0.1s', 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)' 
                  }} 
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'} 
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'} 
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '8px' }}>
                    {p.name}
                  </div>
                  <div style={{ borderTop: '1px dashed #f4f1ea', paddingTop: '8px', marginTop: 'auto' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#b58a3d' }}>
                      {formatRielSymbol(p.price)}
                    </div>
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

      {/* DESKTOP SIDEBAR */}
      <div 
        className="desktop-cart-panel" 
        style={{ 
          width: '380px', 
          background: '#ffffff', 
          borderLeft: '1px solid #e5e7eb', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh', 
          position: 'sticky', 
          top: 0 
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', background: '#fcfbfa', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#4a3b1b' }}>
            {currentT.cartTitle} ({cart.length})
          </h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#9c8a6c' }}>{currentT.emptyCart}</div>
          ) : (
            cart.map((item) => (
              <div 
                key={item.id} 
                style={{ 
                  background: '#fcfbfa', 
                  borderRadius: '8px', 
                  padding: '12px', 
                  marginBottom: '12px', 
                  border: '1px solid #f4f1ea', 
                  position: 'relative' 
                }}
              >
                <button 
                  onClick={() => removeFromCart(item.id)} 
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}
                >
                  ✕
                </button>
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '10px', paddingRight: '20px' }}>
                  {item.custom_name}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b', marginBottom: '4px' }}>
                      {currentT.unitPrice} (៛)
                    </span>
                    <input 
                      type="text" 
                      value={item.custom_price_riel} 
                      onChange={(e) => { 
                        const cleanVal = parseFloat(e.target.value.replace(/,/g, '')) || 0; 
                        updateCartItem(item.id, 'custom_price_riel', cleanVal); 
                      }} 
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #b58a3d', fontSize: '13px', background: '#ffffff', color: '#000000', outline: 'none', boxSizing: 'border-box' }} 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '11px', fontWeight: 'normal', color: '#4a3b1b', marginBottom: '4px' }}>
                      {currentT.quantity}
                    </span>
                    <input 
                      type="number" 
                      value={item.quantity} 
                      min="1" 
                      onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)} 
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #b58a3d', fontSize: '13px', background: '#ffffff', color: '#000000', outline: 'none', boxSizing: 'border-box' }} 
                    />
                  </div>
                </div>
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #eadeca', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#8a7650' }}>{currentT.subtotal}</span>
                  <span style={{ fontWeight: 'bold', color: '#b58a3d', fontSize: '14px' }}>
                    {formatRielFromNative(item.custom_price_riel * item.quantity)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div style={{ position: 'sticky', bottom: 0, padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa', flexShrink: 0, zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.02)' }}>
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
            disabled={cart.length === 0 || isProcessing} 
            style={{ width: '100%', padding: '12px', background: (cart.length === 0 || isProcessing) ? '#dcd7cc' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer' }}
          >
            {isProcessing ? 'Processing...' : currentT.checkout}
          </button>
        </div>
      </div>

      {/* MOBILE UI COMPONENTS */}
      {cart.length > 0 && !isMobileCartOpen && !completedSale && (
        <div className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 View Cart ({cart.length})</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatRielFromNative(totalRiel)} &nbsp; ➔</div>
        </div>
      )}

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
                <input type="number" value={mobilePrice} onChange={(e) => setMobilePrice(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#8a7650', marginBottom: '4px' }}>Quantity</label>
                <input type="number" min="1" value={mobileQty} onChange={(e) => setMobileQty(parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedMobileProduct(null)} style={{ padding: '10px 16px', background: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6b582f' }}>{currentT.cancel}</button>
              <button onClick={handleAddMobileProductToCart} style={{ padding: '10px 16px', background: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}>{currentT.add}</button>
            </div>
          </div>
        </div>
      )}

      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '85%', maxWidth: '360px', height: '100%', background: '#ffffff', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfbfa', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '150px' }}>
              {cart.map(item => (
                <div key={item.id} style={{ padding: '12px', background: '#fcfbfa', border: '1px solid #f4f1ea', borderRadius: '8px', marginBottom: '12px', position: 'relative' }}>
                  <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '10px', paddingRight: '20px' }}>{item.custom_name}</div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '6px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.unitPrice}</span>
                      <input type="number" value={item.custom_price_riel} onChange={(e) => updateCartItem(item.id, 'custom_price_riel', parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#4a3b1b', marginBottom: '4px' }}>{currentT.quantity}</span>
                      <input type="number" value={item.quantity} onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: '#b58a3d', marginTop: '8px' }}>
                    {formatRielFromNative(item.custom_price_riel * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', borderTop: '1px solid #e5e7eb', background: '#fcfbfa', flexShrink: 0, zIndex: 1010, boxShadow: '0 -4px 10px rgba(0,0,0,0.05)' }}>
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
                style={{ width: '100%', padding: '14px', background: (cart.length === 0 || isProcessing) ? '#dcd7cc' : '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
              >
                {isProcessing ? 'Processing...' : currentT.checkout}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOCKED INVOICE CAPTURE */}
      {completedSale && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '16px', padding: '0 20px' }}>
            <button onClick={() => setCompletedSale(null)} style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Close Window</button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleManualDownload} 
                disabled={isDownloading} 
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isDownloading ? '⏳ Compiling...' : '⬇️ Download / Save to Photo'}
              </button>
              <div style={{ background: '#10b981', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isUploadingImage ? '⏳ Auto-Saving...' : '✅ Saved to Gallery!'}
              </div>
            </div>
          </div>

          <div style={{ overflowY: 'auto', maxHeight: '80vh', padding: '10px' }}>
            <div id="invoice-capture-area" ref={invoiceRef} style={{ width: '794px', minHeight: '559px', background: '#ffffff', position: 'relative', padding: '20px', boxSizing: 'border-box', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", color: '#000', lineHeight: '1.5' }}>
              <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer&display=swap" rel="stylesheet" />
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: "url('https://i.imgur.com/XUsrp9D.png')", backgroundRepeat: 'no-repeat', backgroundPosition: 'center center', backgroundSize: '40%', opacity: 0.14, zIndex: 0, pointerEvents: 'none' }}></div>

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '60px', height: '70px' }}>
                  <img src="https://i.imgur.com/s0hg3MQ.png" style={{ width: '100%', height: '100%', display: 'block' }} crossOrigin="anonymous" />
                </div>
                <div style={{ position: 'absolute', top: 0, right: 0, width: '85px', height: '75px' }}>
                  <img src="https://i.imgur.com/Guk0hVe.png" style={{ width: '95%', height: '100%', display: 'block' }} crossOrigin="anonymous" />
                </div>

                <header style={{ textAlign: 'center', marginBottom: '14px', lineHeight: '1.2' }}>
                  <h1 style={{ fontSize: '23px', margin: '0 0 2px 0', fontWeight: 'bold', color: 'green' }}>ដេប៉ូអង្ករ រ៉េឌៀន</h1>
                  <p style={{ margin: '1px 0', fontSize: '12.5px', color: 'green' }}>មានបោះដុំ លក់រាយអង្ករដែលមានគុណភាពខ្ពស់គ្រប់ប្រភេទ និងមានទទួលវិចខ្ចប់អំណោយក្នុងតម្លៃសមរម្យ</p>
                  <p style={{ margin: '1px 0', fontSize: '12.5px' }}>📲 077 797 798 / 📞 081 797 798 / 📞 088 97 97 798</p>
                  <p style={{ margin: '1px 0', fontSize: '12.5px' }}>📍 ផ្ទះលេខ 72 ផ្លូវលំ សង្កាត់ស្ទឹងមានជ័យ1 ខណ្ឌមានជ័យ រាជធានីភ្នំពេញ</p>
                </header>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '33%' }}>ឈ្មោះអតិថិជន: <strong>{completedSale.customer?.name || 'Walk-in'}</strong></td>
                      <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '34%' }}>ទីតាំង: <strong>{completedSale.customer?.location || 'N/A'}</strong></td>
                      <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '33%' }}>លេខទូរសព្ទ: <strong>{completedSale.customer?.phone || 'N/A'}</strong></td>
                    </tr>
                  </tbody>
                </table>

                {/* FORCED ALIGNMENT HEADERS AND ROWS */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px', fontSize: '12.5px', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ height: '35px' }}>
                      <th style={{ border: '1px solid #000', padding: 0, background: '#fffacd', width: '5%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold', lineHeight: '1.2' }}>
                          <span>No.</span>
                          <span>ល.រ</span>
                        </div>
                      </th>
                      <th style={{ border: '1px solid #000', padding: 0, background: '#fffacd', width: '40%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold', lineHeight: '1.2' }}>
                          <span>Item Descriptions</span>
                          <span>រាយឈ្មោះទំនិញ</span>
                        </div>
                      </th>
                      <th style={{ border: '1px solid #000', padding: 0, background: '#fffacd', width: '15%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold', lineHeight: '1.2' }}>
                          <span>Quantity</span>
                          <span>ចំនួន</span>
                        </div>
                      </th>
                      <th style={{ border: '1px solid #000', padding: 0, background: '#fffacd', width: '15%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold', lineHeight: '1.2' }}>
                          <span>Unit Price</span>
                          <span>តម្លៃរាយ</span>
                        </div>
                      </th>
                      <th style={{ border: '1px solid #000', padding: 0, background: '#fffacd', width: '25%' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold', lineHeight: '1.2' }}>
                          <span>Subtotal</span>
                          <span>តម្លៃសរុប</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const displayItems = getCategorizedItems(completedSale.cartSnapshot);
                      const rows = [];
                      let grandTotal = 0;
                      const maxRows = Math.max(10, displayItems.length);
                      
                      for (let i = 0; i < maxRows; i++) {
                        const item = displayItems[i];
                        if (item) {
                          grandTotal += item.total;
                          const isCenter = item.custom_name.includes('ដូរ') || item.custom_name.includes('បញ្ចុះតម្លៃ') || item.custom_name.includes('កក់') || item.custom_name.includes('សេវាឡាន (អតិថិជន)');
                          rows.push(
                            <tr key={i} style={{ height: '28px' }}>
                              <td style={{ border: '1px solid #000', padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{i + 1}</div>
                              </td>
                              <td style={{ border: '1px solid #000', padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCenter ? 'center' : 'flex-start', height: '100%', paddingLeft: isCenter ? '0' : '6px' }}>{item.custom_name}</div>
                              </td>
                              <td style={{ border: '1px solid #000', padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{item.quantity.toLocaleString('en-US')}</div>
                              </td>
                              <td style={{ border: '1px solid #000', padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>{item.custom_price_riel.toLocaleString('en-US')}</div>
                              </td>
                              <td style={{ border: '1px solid #000', padding: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: item.total < 0 ? 'red' : 'inherit' }}>{item.total.toLocaleString('en-US')}</div>
                              </td>
                            </tr>
                          );
                        } else {
                          rows.push(
                            <tr key={i} style={{ height: '28px' }}>
                              <td style={{ border: '1px solid #000', padding: 0 }}><div style={{ height: '100%' }}></div></td>
                              <td style={{ border: '1px solid #000', padding: 0 }}><div style={{ height: '100%' }}></div></td>
                              <td style={{ border: '1px solid #000', padding: 0 }}><div style={{ height: '100%' }}></div></td>
                              <td style={{ border: '1px solid #000', padding: 0 }}><div style={{ height: '100%' }}></div></td>
                              <td style={{ border: '1px solid #000', padding: 0 }}><div style={{ height: '100%' }}></div></td>
                            </tr>
                          );
                        }
                      }
                      return (
                        <>
                          {rows}
                          <tr style={{ height: '30px' }}>
                            <td colSpan={4} style={{ border: '1px solid #000', padding: 0, background: '#fffacd' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingRight: '10px', fontWeight: 'bold' }}>Total | សរុប</div>
                            </td>
                            <td style={{ border: '1px solid #000', padding: 0, background: '#fffacd' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontWeight: 'bold' }}>{grandTotal.toLocaleString('en-US')}</div>
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '16px', fontSize: '12.5px' }}>
                  <div style={{ textAlign: 'center', width: '30%' }}>
                    <p style={{ margin: 0 }}>ហត្ថលេខាអ្នកទិញ</p>
                    <div style={{ marginTop: '30px' }}>...............................</div>
                  </div>
                  <div style={{ textAlign: 'center', width: '30%' }}>
                    <p style={{ margin: 0 }}>ហត្ថលេខាអ្នកលក់</p>
                    <div style={{ marginTop: '30px' }}>...............................</div>
                  </div>
                  <div style={{ width: '30%', position: 'relative', height: '60px' }}>
                    <span style={{ position: 'absolute', bottom: 0, right: 0, fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                      ថ្ងៃទី {completedSale.dateObj.day} ខែ {completedSale.dateObj.month} ឆ្នាំ {completedSale.dateObj.year}
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .mobile-fab { 
          display: none; 
        }
        @media (max-width: 1023px) { 
          .desktop-cart-panel { 
            display: none !important; 
          } 
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