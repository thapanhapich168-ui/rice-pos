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
const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

// Translations Dictionary
const t = {
  en: {
    title: "Point of Sale",
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
    totalKhmer: "Total Due:",
    totalUsd: "Total in USD:",
    checkout: "Checkout",
    mobileModalTitle: "Adjust Item Properties",
    cancel: "Cancel",
    add: "Add to Cart"
  }
};

// ==========================================
// ROBUST LIVE COMMA FORMATTER (Stateless Display)
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus, className, onFocus }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === 0) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== value) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    let formatted = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : '';
    if (parts.length > 1) formatted += '.' + parts[1].substring(0, 2);
    if (raw === '') formatted = '';

    setInputValue(formatted);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? '' : num);
  };

  return (
    <input 
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      onFocus={onFocus}
      autoFocus={autoFocus}
      onBlur={() => {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }, 100);
      }}
      style={{ ...style, color: '#334155' }}
      className={className || "mobile-input-field"}
    />
  )
}

function CartInput({ value, onChange, isQty, fontSize = '14px' }: { value: number, onChange: (val: number) => void, isQty: boolean, fontSize?: string }) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === 0) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== value) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    
    let formatted = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : '';
    if (parts.length > 1) formatted += '.' + parts[1].substring(0, 2);
    if (raw === '') formatted = '';

    setInputValue(formatted);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? 0 : num);
  };

  return (
    <input 
      type="text"
      inputMode="decimal"
      value={inputValue}
      onChange={handleChange}
      onBlur={() => {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }, 100);
      }}
      style={{ 
        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', 
        fontSize: fontSize, fontWeight: 'normal', color: '#334155', backgroundColor: '#ffffff', outline: 'none', textAlign: 'center'
      }}
      className="mobile-input-field"
    />
  )
}

export default function POSPage() {
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [productOrder, setProductOrder] = useState<number[]>([])
  const [activeBatches, setActiveBatches] = useState<Record<number, any[]>>({})
  
  const [lang, setLang] = useState<'en' | 'kh'>('en')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDeviceMobile, setIsDeviceMobile] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false) 

  const [cartCustomerNameOverride, setCartCustomerNameOverride] = useState('')

  // ==========================================
  // DYNAMIC PAYMENT ROWS
  // ==========================================
  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | '', isAuto?: boolean}[]>([
    { id: Date.now(), method: 'Cash ៛', amount: '', isAuto: true }
  ]);

  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', location: '', owner: '', type: '' })

  const [selectedMobileProduct, setSelectedMobileProduct] = useState<any>(null)
  const [mobilePrice, setMobilePrice] = useState<number | ''>('')
  const [mobileQty, setMobileQty] = useState<number | ''>('')
  const [mobileName, setMobileName] = useState<string>('')

  const [exchangeModal, setExchangeModal] = useState<{ isOpen: boolean, product: any, consumedKg: string | number }>({
    isOpen: false, product: null, consumedKg: ''
  })

  const [saleSummary, setSaleSummary] = useState<{ total: number, receivedRiel: number, receivedUsd: number, totalReceivedInRiel: number, change: number, type?: 'retail' | 'wholesale', isCashless?: boolean, items?: any[], isDebt?: boolean } | null>(null)
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [completedSale, setCompletedSale] = useState<any>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  
  const invoiceRef = useRef<HTMLDivElement>(null)

  // IOS SAFARI SCROLL FIX
  const resetScroll = () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
    }, 50);
  };

  const totalRiel = cart.reduce((sum, item) => {
    const isReturn = item.custom_name.includes('ដូរ');
    const itemTotal = Number(item.custom_price_riel) * Number(item.quantity);
    return isReturn ? sum - Math.abs(itemTotal) : sum + itemTotal;
  }, 0);

  const totalUSD = totalRiel / EXCHANGE_RATE; 

  // Auto-sync the payment row with totalRiel if it is in Auto mode
  useEffect(() => {
    setPaymentRows(prev => {
      if (prev.length === 1 && prev[0].isAuto) {
        const newAmount = totalRiel === 0 ? '' : totalRiel;
        if (prev[0].amount !== newAmount) {
          return [{ ...prev[0], amount: newAmount }];
        }
      }
      return prev;
    });
  }, [totalRiel]);

  // 15-SECOND AUTO DISMISS FOR SALE SUMMARY POPUP
  useEffect(() => {
    if (saleSummary) {
      const timer = setTimeout(() => {
        setSaleSummary(null);
        setCompletedSale(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [saleSummary]);

  // 15-SECOND AUTO DISMISS FOR INVOICE PREVIEW
  useEffect(() => {
    if (showInvoicePreview) {
      const timer = setTimeout(() => {
        setShowInvoicePreview(false);
        setCompletedSale(null);
        setPreviewImageUrl(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [showInvoicePreview]);

  useEffect(() => {
    const checkDeviceType = () => {
      const isMobileBrowser = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 1024;
      setIsDeviceMobile(isMobileBrowser || isSmallScreen);
    };

    checkDeviceType();
    window.addEventListener('resize', checkDeviceType);

    const stabilizeConnection = async () => {
      try {
        await loadProductsAndSettings()
        await loadCustomers()
        await loadBatches()

        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
          setEditingInvoiceId(editId);
          setActiveTab('wholesale'); 
          
          const { data: saleRows } = await supabase.from('sales').select('*').eq('invoice_id', editId);
          if (saleRows && saleRows.length > 0) {
            const rebuiltCart = saleRows.map(row => {
              const isSpecialRow = (row.custom_rice_type || row.rice_type).includes('ដូរ') || (row.custom_rice_type || row.rice_type).includes('បានប្រើ');
              let sortOrder = 0;
              if ((row.custom_rice_type || row.rice_type).includes('ដូរ')) sortOrder = 1;
              if ((row.custom_rice_type || row.rice_type).includes('បានប្រើ')) sortOrder = 2;

              return {
                id: Math.random(), 
                product_id: row.product_id, 
                name: row.rice_type, 
                custom_name: row.custom_rice_type || row.rice_type, 
                custom_price_riel: row.price_per_bag,
                quantity: row.qty,
                cost_price: row.cogs_price,
                stock: 0, 
                isSpecial: isSpecialRow,
                bypass_stock: (row.custom_rice_type || row.rice_type).includes('បានប្រើ'),
                sortOrder: sortOrder,
                selected_batch_id: null
              };
            });
            setCart(rebuiltCart);

            const cName = saleRows[0].customer_name;
            if (cName && cName !== 'Walk-in') {
              const { data: custData } = await supabase.from('customers').select('id').eq('name', cName).single();
              if (custData) {
                setSelectedCustomerId(custData.id.toString());
              }
            }
          }
        }
      } catch (err) {
        console.warn("Supabase network polling retrying silently...", err)
      }
    }
    
    stabilizeConnection()

    return () => window.removeEventListener('resize', checkDeviceType);
  }, [])

  useEffect(() => {
    if (selectedCustomer) setCartCustomerNameOverride(selectedCustomer.name || '');
    else setCartCustomerNameOverride('Walk-in');
  }, [selectedCustomerId, customers])

  useEffect(() => {
    if (activeTab === 'wholesale' && !selectedCustomerId && customers.length > 0) {
      const walkInCust = customers.find(c => c.name.toLowerCase() === 'walk-in' || c.name.toLowerCase() === 'walk in');
      if (walkInCust) setSelectedCustomerId(walkInCust.id.toString());
    }
  }, [activeTab, customers]) 

  // Mobile Invoice Generation Engine (Waits to ensure HD logos load before capture)
  useEffect(() => {
    if (completedSale && invoiceRef.current && !previewImageUrl && showInvoicePreview) {
      const timer = setTimeout(async () => {
        try {
          await document.fonts.ready;
          // Wait 800ms to guarantee logos/qr are fetched completely in DOM
          await new Promise(r => setTimeout(r, 800));

          const isMobile = window.innerWidth < 1024;
          
          // Prime the canvas
          if (isMobile) {
            await htmlToImage.toPng(invoiceRef.current!, { pixelRatio: 1, backgroundColor: '#ffffff' });
          }
          
          // High-Res Capture
          const dataUrl = await htmlToImage.toPng(invoiceRef.current!, { 
            pixelRatio: 3, 
            backgroundColor: '#ffffff' 
          });
          
          setPreviewImageUrl(dataUrl);
          setIsGeneratingPreview(false);
          executeAutoSaveOnly(dataUrl, completedSale.invoiceNo);
        } catch (error) {
          console.error("Preview generation failed:", error);
          setIsGeneratingPreview(false);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [completedSale, previewImageUrl, showInvoicePreview])

  async function loadProductsAndSettings() {
    const { data: prodData } = await supabase.from('products').select('*').order('id', { ascending: true })
    if (prodData) setProducts(prodData)
    const { data: setObj } = await supabase.from('app_settings').select('*').eq('setting_key', 'pos_product_order').single()
    if (setObj && setObj.setting_value) setProductOrder(setObj.setting_value)
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers(data || [])
  }

  async function loadBatches() {
    const { data } = await supabase.from('price_history').select('*').order('created_at', { ascending: true });
    if (data) {
      const batchMap: Record<number, any[]> = {};
      data.forEach(b => {
        const remaining = (b.imported_qty || 0) - (b.sold_qty || 0);
        if (remaining > 0) {
          if (!batchMap[b.product_id]) batchMap[b.product_id] = [];
          batchMap[b.product_id].push(b);
        }
      });
      setActiveBatches(batchMap);
    }
  }

  const formatRielSymbol = (amountInRiel: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  const formatRielFromNative = (rielAmount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(rielAmount))} ៛`;

  function handleProductClick(product: any) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    const defaultQty = activeTab === 'wholesale' ? 0 : 1;
    if (isMobile) {
      setSelectedMobileProduct(product);
      setMobileName(product.name);
      setMobilePrice(Number(product.price));
      setMobileQty(defaultQty === 0 ? '' : defaultQty);
    } else {
      addToCartDirect(product, defaultQty);
    }
  }

  function addToCartDirect(product: any, qtyToAdd: number = 1) {
    const existing = cart.find((item) => item.product_id === product.id && !item.isSpecial)
    const priceInRiel = Number(product.price); 
    if (existing) {
      setCart(cart.map((item) => item.product_id === product.id && !item.isSpecial ? { ...item, quantity: item.quantity + qtyToAdd } : item))
    } else {
      setCart([...cart, { 
        ...product, product_id: product.id, id: Math.random(), quantity: qtyToAdd, custom_name: product.name, custom_price_riel: priceInRiel,
        cost_price: Number(product.cost_price || 0), isSpecial: false, selected_batch_id: null, sortOrder: 0
      }])
    }
  }

  function handleAddMobileProductToCart() {
    if (!selectedMobileProduct) return;
    const finalQty = typeof mobileQty === 'number' ? mobileQty : (parseFloat(mobileQty as string) || 0);
    const finalPrice = typeof mobilePrice === 'number' ? mobilePrice : (parseFloat(mobilePrice as string) || 0);
    
    const existing = cart.find((item) => item.product_id === selectedMobileProduct.id && !item.isSpecial);
    if (existing) {
      setCart(cart.map((item) => item.product_id === selectedMobileProduct.id && !item.isSpecial ? { 
        ...item, custom_name: mobileName, custom_price_riel: finalPrice, quantity: item.quantity + finalQty 
      } : item));
    } else {
      setCart([...cart, { 
        ...selectedMobileProduct, product_id: selectedMobileProduct.id, id: Math.random(), custom_name: mobileName, custom_price_riel: finalPrice, 
        cost_price: Number(selectedMobileProduct.cost_price || 0), quantity: finalQty, isSpecial: false, selected_batch_id: null, sortOrder: 0
      }]);
    }
    setSelectedMobileProduct(null);
  }

  function handleConfirmExchange() {
    if (!exchangeModal.product) return;
    const prod = exchangeModal.product;
    const consumedKg = Number(exchangeModal.consumedKg) || 0;
    const perKgPrice = Math.round(Number(prod.price) / 50);
    const perKgCogs = Math.round(Number(prod.cost_price || 0) / 50);

    const newItems = [{
      ...prod, id: Math.random(), product_id: prod.id, custom_name: `ដូរ ${prod.name}`, custom_price_riel: Number(prod.price),
      cost_price: Number(prod.cost_price || 0), quantity: 1, isSpecial: true, bypass_stock: false, sortOrder: 1
    }];

    if (consumedKg > 0) {
      newItems.push({
        ...prod, id: Math.random(), product_id: prod.id, custom_name: `បានប្រើ ${prod.name}`, custom_price_riel: perKgPrice,
        cost_price: perKgCogs, quantity: consumedKg, isSpecial: true, bypass_stock: true, sortOrder: 2
      });
    }

    setCart([...cart, ...newItems]);
    setExchangeModal({ isOpen: false, product: null, consumedKg: '' });
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

  const handleProductDragOver = (e: React.DragEvent) => { e.preventDefault(); }

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

  async function handleCreateCustomer() {
    const finalName = newCustomerForm.name.trim() || 'Walk-in';
    const { data, error } = await supabase.from('customers').insert([{
      name: finalName, phone: newCustomerForm.phone.trim(), location: newCustomerForm.location.trim(),
      owner: newCustomerForm.owner.trim() || null, type: newCustomerForm.type.trim()
    }]).select().single();

    if (!error && data) {
      setCustomers([...customers, data].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setSelectedCustomerId(data.id.toString());
      setIsCreateCustomerModalOpen(false);
      setNewCustomerForm({ name: '', phone: '', location: '', owner: '', type: '' });
      setCustomerSearchTerm('');
    } else alert(`Error creating customer: ${error?.message}`);
  }

  async function getFIFOSplits(productId: number, qtySold: number, fallbackCogs: number) {
    let remainingQty = qtySold;
    const splits: any[] = [];
    const { data: batches } = await supabase.from('price_history').select('*').eq('product_id', productId).gt('imported_qty', 0).order('created_at', { ascending: true });
    const availableBatches = (batches || []).filter(b => (b.sold_qty || 0) < (b.imported_qty || 0));

    for (const batch of availableBatches) {
      if (remainingQty <= 0) break;
      const availableInBatch = (batch.imported_qty || 0) - (batch.sold_qty || 0);
      const qtyTaken = Math.min(availableInBatch, remainingQty);
      splits.push({ qty: qtyTaken, cogs_price: batch.cost_price, batch_id: batch.id, current_sold: batch.sold_qty || 0 });
      remainingQty -= qtyTaken;
    }
    if (remainingQty > 0) splits.push({ qty: remainingQty, cogs_price: fallbackCogs, batch_id: null, current_sold: 0 });
    return splits;
  }

  const orderedProducts = [...products].sort((a, b) => {
    const idxA = productOrder.indexOf(a.id);
    const idxB = productOrder.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return a.id - b.id;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const filteredProducts = orderedProducts.filter(p => {
    if (searchQuery && !p.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const weightVal = parseFloat(p.weight || 0);
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

  const isSimpleCustomer = !selectedCustomer || ['walk-in', 'walk in', 'mom'].includes((selectedCustomer.name || '').toLowerCase());
  const showPaymentSelector = activeTab === 'retail' || isSimpleCustomer;

  const liveTotalReceivedInRiel = paymentRows.reduce((sum, row) => {
    const amt = Number(row.amount) || 0;
    if (row.method.includes('$')) return sum + (amt * EXCHANGE_RATE);
    return sum + amt;
  }, 0);

  const liveRemaining = totalRiel - liveTotalReceivedInRiel;

  const getCategorizedItems = (cartItems: any[]) => {
    let normalItems: any[] = [], specialItems: any[] = [], negativeItems: any[] = [], serviceItems: any[] = [];
    cartItems.forEach(item => {
      const desc = item.custom_name;
      const total = item.custom_price_riel * item.quantity;
      if (desc.includes('សេវាឡាន (អតិថិជន)')) serviceItems.push({ ...item, total: total });
      else if (desc.includes('សេវាឡាន')) { /* skip hidden */ }
      else if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) negativeItems.push({ ...item, total: -Math.abs(total) });
      else if (desc.includes('ថ្លៃបាវ') || desc.includes('បានប្រើ')) specialItems.push({ ...item, total: total });
      else normalItems.push({ ...item, total: total });
    });
    return [...normalItems, ...specialItems, ...negativeItems, ...serviceItems];
  }

  function cancelEditMode() {
    setEditingInvoiceId(null);
    setCart([]);
    setSelectedCustomerId('');
    setCartCustomerNameOverride('');
    setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '', isAuto: true }]);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // --- REWRITTEN CHECKOUT: DB MULTI-ROW SPLIT ENGINE & ASSET LOGGING ---
  async function confirmCheckout() {
    if (cart.length === 0) return alert(lang === 'kh' ? 'សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក!' : 'Cart is empty');
    if (activeTab === 'wholesale' && !selectedCustomerId) return alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale');

    setIsProcessing(true);

    try {
      const currentCart = [...cart];
      const currentTotalRiel = totalRiel;
      const finalCustomerName = cartCustomerNameOverride.trim() || 'Walk-in';

      const activePayments = showPaymentSelector ? paymentRows.filter(r => (Number(r.amount) || 0) > 0) : [];
      const actualTotalReceived = showPaymentSelector ? liveTotalReceivedInRiel : 0;
      const actualRemaining = currentTotalRiel - actualTotalReceived;

      let effectiveSplits: { method: string, amount: number, paid: number }[] = [];

      if (activePayments.length === 0) {
        if (!isSimpleCustomer) {
          effectiveSplits.push({ method: 'Unpaid / Debt', amount: currentTotalRiel, paid: 0 });
        } else {
          effectiveSplits.push({ method: 'Cash ៛', amount: currentTotalRiel, paid: 0 });
        }
      } else if (actualRemaining > 0) {
        activePayments.forEach(p => {
            let amt = Number(p.amount);
            if (p.method.includes('$')) amt *= EXCHANGE_RATE;
            effectiveSplits.push({ method: p.method, amount: amt, paid: amt });
        });
        effectiveSplits.push({ method: 'Unpaid / Debt', amount: actualRemaining, paid: 0 });
      } else {
        let totalPaidRiel = actualTotalReceived;
        activePayments.forEach(p => {
            let amt = Number(p.amount);
            if (p.method.includes('$')) amt *= EXCHANGE_RATE;
            const ratio = totalPaidRiel > 0 ? (amt / totalPaidRiel) : 0;
            effectiveSplits.push({ method: p.method, amount: currentTotalRiel * ratio, paid: amt });
        });
      }

      if (effectiveSplits.length === 0) effectiveSplits.push({ method: 'Cash ៛', amount: currentTotalRiel, paid: 0 });

      if (activeTab === 'retail') {
        const retailTxId = `RET-${Date.now().toString().slice(-6)}`;
        const retailRows = [];

        for (let sIdx = 0; sIdx < effectiveSplits.length; sIdx++) {
           const split = effectiveSplits[sIdx];
           const ratio = currentTotalRiel !== 0 ? (split.amount / currentTotalRiel) : (1 / effectiveSplits.length);
           const splitTxId = effectiveSplits.length > 1 ? `${retailTxId}-${sIdx + 1}` : retailTxId;

           for (const item of currentCart) {
              retailRows.push({
                 transaction_id: splitTxId,
                 rice_type: item.name,
                 custom_rice_type: item.custom_name !== item.name ? item.custom_name : null,
                 qty: item.quantity,
                 price_per_bag: Math.round(item.custom_price_riel * ratio),
                 cogs_price: Math.round((item.cost_price || 0) * ratio),
                 payment_method: split.method
              });
           }
        }

        const { error: retailErr } = await supabase.from('retail_sales').insert(retailRows);
        if (retailErr) throw new Error(`Retail Error: ${retailErr.message}`);

        const stockUpdates: Record<number, number> = {};
        for (const item of currentCart) {
            stockUpdates[item.product_id] = (stockUpdates[item.product_id] || item.stock) - item.quantity;
        }
        for (const [prodId, newStock] of Object.entries(stockUpdates)) {
            await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
        }

      } else {
        const displayInvoiceNo = editingInvoiceId ? editingInvoiceId : `INV-${Date.now().toString().slice(-6)}`;
        const finalOwner = selectedCustomer?.owner || null; 
        const finalLocation = selectedCustomer?.location || '';
        const finalPhone = selectedCustomer?.phone || '';
        
        const baseSaleRows = [];
        const stockUpdates: Record<number, number> = {}; 
        const fifoUpdates: Record<number, number> = {}; 

        for (const item of currentCart) {
          const isReturn = item.custom_name.includes('ដូរ');
          const isCharge = item.custom_name.includes('បានប្រើ');
          const isBypass = item.bypass_stock || isCharge;
          const finalQty = isReturn ? -Math.abs(item.quantity) : item.quantity;
          
          if (isReturn || isBypass || editingInvoiceId) {
            baseSaleRows.push({
              product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: item.cost_price || 0, owner: finalOwner
            });
          } else if (item.selected_batch_id) {
            const specificBatch = activeBatches[item.product_id]?.find(b => b.id === item.selected_batch_id);
            baseSaleRows.push({
              product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: specificBatch ? specificBatch.cost_price : (item.cost_price || 0), owner: finalOwner
            });
            if (specificBatch) {
                fifoUpdates[specificBatch.id] = (fifoUpdates[specificBatch.id] || specificBatch.sold_qty || 0) + finalQty;
            }
          } else {
            const splits = await getFIFOSplits(item.product_id, finalQty, item.cost_price || 0);
            for (const split of splits) {
              baseSaleRows.push({
                product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
                custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: split.qty, price_per_bag: item.custom_price_riel,
                cogs_price: split.cogs_price, owner: finalOwner
              });
              if (split.batch_id) {
                fifoUpdates[split.batch_id] = (fifoUpdates[split.batch_id] || split.current_sold) + split.qty;
              }
            }
          }

          if (!editingInvoiceId && !isBypass) {
            stockUpdates[item.product_id] = (stockUpdates[item.product_id] || item.stock) - finalQty;
          }
        }

        const finalSaleRows = [];
        const finalSummaries = [];
        const combinedRiceTypes = currentCart.map(item => `${item.custom_name} (x${item.quantity})`).join(', ');

        for (let sIdx = 0; sIdx < effectiveSplits.length; sIdx++) {
           const split = effectiveSplits[sIdx];
           const ratio = currentTotalRiel !== 0 ? (split.amount / currentTotalRiel) : (1 / effectiveSplits.length);
           const splitTxId = effectiveSplits.length > 1 ? `${displayInvoiceNo}-${sIdx + 1}` : displayInvoiceNo;

           let splitSalesSum = 0;
           let splitCogsSum = 0;

           for (const baseRow of baseSaleRows) {
              const proratedPrice = Math.round(baseRow.price_per_bag * ratio);
              const proratedCogs = Math.round(baseRow.cogs_price * ratio);

              finalSaleRows.push({
                 ...baseRow,
                 invoice_id: splitTxId,
                 price_per_bag: proratedPrice,
                 cogs_price: proratedCogs,
                 payment_method: split.method
              });
              splitSalesSum += proratedPrice * baseRow.qty;
              splitCogsSum += proratedCogs * baseRow.qty;
           }

           finalSummaries.push({
              invoice_id: splitTxId,
              customer_name: finalCustomerName,
              owner: finalOwner,
              rice_types: combinedRiceTypes,
              total_sales: splitSalesSum,
              total_cogs: splitCogsSum,
              total_profit: splitSalesSum - splitCogsSum,
              delivery_status: (split.method === 'Unpaid / Debt' && !isSimpleCustomer) ? 'Pending' : 'Delivered',
              payment_method: split.method,
              balance_due: split.method === 'Unpaid / Debt' ? splitSalesSum : 0,
              customer_location: finalLocation
           });
        }

        if (editingInvoiceId) {
          await supabase.from('sales').delete().like('invoice_id', `${editingInvoiceId}%`);
          await supabase.from('invoice_summaries').delete().like('invoice_id', `${editingInvoiceId}%`);
        }

        const { error: salesErr } = await supabase.from('sales').insert(finalSaleRows);
        if (salesErr) throw new Error(`Failed to save to Sales table: ${salesErr.message}`);

        const { error: summaryErr } = await supabase.from('invoice_summaries').insert(finalSummaries);
        if (summaryErr) throw new Error(`Failed to save to Summaries table: ${summaryErr.message}`);

        for (const [prodId, newStock] of Object.entries(stockUpdates)) {
           await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
        }
        for (const [batchId, newSold] of Object.entries(fifoUpdates)) {
           await supabase.from('price_history').update({ sold_qty: newSold }).eq('id', batchId);
        }

        const currentDate = new Date();
        setCompletedSale({
          invoiceNo: displayInvoiceNo, cartSnapshot: currentCart, customer: { name: finalCustomerName, phone: finalPhone, location: finalLocation },
          dateObj: { day: String(currentDate.getDate()).padStart(2, '0'), month: String(currentDate.getMonth() + 1).padStart(2, '0'), year: currentDate.getFullYear() }
        });
      }

      // Show Summary OR Invoice logic
      let cRiel = 0, qRiel = 0, cUsd = 0, qUsd = 0;
      activePayments.forEach(r => {
        if (r.method === 'Cash ៛') cRiel += Number(r.amount);
        if (r.method === 'QR ៛' || r.method === 'Mom QR ៛') qRiel += Number(r.amount);
        if (r.method === 'Cash $') cUsd += Number(r.amount);
        if (r.method === 'QR $' || r.method === 'Mom QR $') qUsd += Number(r.amount);
      });

      if (activeTab === 'wholesale' && !isSimpleCustomer) {
        // Wholesale, Not Walk-in: Show Invoice, NO Summary
        setIsGeneratingPreview(true);
        setShowInvoicePreview(true);
        setSaleSummary(null);
      } else {
        // Retail OR Wholesale Walk-in: Show Summary, NO Invoice
        setShowInvoicePreview(false);
        setSaleSummary({ 
          total: currentTotalRiel, 
          receivedRiel: cRiel + qRiel, 
          receivedUsd: cUsd + qUsd, 
          totalReceivedInRiel: actualTotalReceived,
          change: actualRemaining < 0 ? Math.abs(actualRemaining) : 0, 
          type: activeTab, 
          isCashless: actualTotalReceived === 0, 
          items: currentCart,
          isDebt: actualRemaining > 0
        });
      }

      setCart([]);
      setIsMobileCartOpen(false);
      setEditingInvoiceId(null);
      window.history.replaceState({}, document.title, window.location.pathname);
      loadProductsAndSettings();
      loadBatches();

      if (activeTab === 'wholesale') {
        const walkInCust = customers.find(c => c.name.toLowerCase() === 'walk-in' || c.name.toLowerCase() === 'walk in');
        if (walkInCust) setSelectedCustomerId(walkInCust.id.toString());
      } else {
        setSelectedCustomerId('');
      }

    } catch (err: any) {
      alert(`System Error: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '', isAuto: true }]);
    }
  }

  async function executeAutoSaveOnly(dataUrl: string, invoiceId: string) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `${invoiceId}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('invoices').upload(fileName, blob, { contentType: 'image/jpeg' });
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
        await supabase.from('sales').update({ invoice_url: publicUrlData.publicUrl }).eq('invoice_id', invoiceId);
        await supabase.from('invoice_summaries').update({ invoice_url: publicUrlData.publicUrl }).eq('invoice_id', invoiceId);
      }
    } catch (error: any) {
      console.error("Auto-capture cloud upload failed:", error);
    }
  }

  const handleDesktopDownloadPNG = () => {
    if (!previewImageUrl || !completedSale) return;
    const link = document.createElement('a');
    link.download = `Invoice-${completedSale.invoiceNo}.png`;
    link.href = previewImageUrl;
    link.click();
  }

  const handleMobileShare = async () => {
    if (!previewImageUrl || !completedSale) return;
    try {
      const res = await fetch(previewImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `Invoice-${completedSale.invoiceNo}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${completedSale.invoiceNo}` });
      } else {
        handleDesktopDownloadPNG();
      }
    } catch (err) { console.error(err); }
  }

  const handleNativePrint = () => { window.print(); }

  const currentT = t[lang] || t['en'];
  const sortedCart = [...cart].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // Payment Row UI Renderer
  const renderPaymentSection = (isMobileCart: boolean = false) => {
    if (!showPaymentSelector) return null;
    return (
      <div style={{ marginBottom: '8px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Receive</span>
            <button onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '', isAuto: false }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', cursor: 'pointer' }}>+ Split</button>
          </div>
        </div>
        
        {paymentRows.map((row, index) => (
          <div key={row.id} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <select 
              value={row.method} 
              onChange={e => {
                const newRows = [...paymentRows];
                newRows[index].method = e.target.value;
                setPaymentRows(newRows);
              }}
              style={{ width: '45%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: isMobileCart ? '16px' : '13px', fontWeight: 'normal', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#0f172a' }}
              className="mobile-select-menu"
            >
              <option value="Cash ៛">💵 Cash ៛</option>
              <option value="Cash $">💵 Cash $</option>
              <option value="QR ៛">📱 QR ៛</option>
              <option value="QR $">📱 QR $</option>
              <option value="Mom QR ៛">👩 Mom QR ៛</option>
              <option value="Mom QR $">👩 Mom QR $</option>
            </select>
            
            <div style={{ flex: 1 }}>
              <CurrencyInput 
                placeholder="" 
                value={row.amount}
                onFocus={() => {
                  if (row.isAuto) {
                    const newRows = [...paymentRows];
                    newRows[index].amount = '';
                    newRows[index].isAuto = false;
                    setPaymentRows(newRows);
                  }
                }}
                onChange={(val: any) => {
                  const newRows = [...paymentRows];
                  newRows[index].amount = val;
                  newRows[index].isAuto = false;
                  setPaymentRows(newRows);
                }}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', color: '#0f172a', fontWeight: 'normal', fontSize: isMobileCart ? '16px' : '14px', textAlign: 'right' }}
                className="mobile-input-field"
              />
            </div>
            
            {paymentRows.length > 1 && (
              <button onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="pos-layout-wrapper" style={{ display: 'flex', height: '100dvh', overflow: 'hidden', width: '100%', backgroundColor: '#ffffff', boxSizing: 'border-box' }}>
      
      {/* SELECTION ENGINE VIEW GRID PANEL */}
      <div className="pos-main-engine hide-scrollbar" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', minWidth: 0, height: '100%', overflowY: 'auto' }}>
        
        <div className="main-wrapper" style={{ flex: 1 }}>
          <div className="header-container">
            <div className="header-left">
              <h1 className="page-title">{editingInvoiceId ? `✏️ Editing: ${editingInvoiceId}` : `🛒 ${currentT.title}`}</h1>
            </div>
          </div>

          <div className="pos-tools-area" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', width: '100%' }}>
              <button onClick={() => { setActiveTab('retail'); setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'retail' ? '#b58a3d' : '#fff', color: activeTab === 'retail' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'retail' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.retail}</button>
              <button onClick={() => { 
                setActiveTab('wholesale');
                if (!selectedCustomerId) {
                  const walkInCust = customers.find(c => c.name.toLowerCase() === 'walk-in' || c.name.toLowerCase() === 'walk in');
                  if (walkInCust) setSelectedCustomerId(walkInCust.id.toString());
                }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'wholesale' ? '#b58a3d' : '#fff', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'wholesale' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.wholesale}</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
              <input type="text" placeholder={currentT.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '16px', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              
              {activeTab === 'wholesale' && (
                <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                  {!selectedCustomer ? (
                    <button 
                      onClick={() => setIsCustomerModalOpen(true)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '16px', color: '#94a3b8', backgroundColor: '#ffffff', textAlign: 'left', cursor: 'pointer' }}
                    >
                      {currentT.selectCustomer}
                    </button>
                  ) : (
                    <div style={{ width: '100%', padding: '12px', backgroundColor: '#fefcf3', border: '1px solid #eadeca', borderRadius: '6px', fontSize: '13px', color: '#4a3b1b', position: 'relative' }}>
                      <button onClick={() => { setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>❌</button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingRight: '20px' }}>
                        <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'normal' }}>👤 NAME</strong>{selectedCustomer.name}</div>
                        <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'normal' }}>📞 PHONE</strong>{selectedCustomer.phone || '-'}</div>
                        <div><strong style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'normal' }}>📍 LOCATION</strong>{selectedCustomer.location || '-'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeTab !== 'retail' && (
              <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '4px', marginTop: '16px', width: '100%' }}>
                {RICE_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 14px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #cbd5e1', backgroundColor: activeCategory === cat ? '#b58a3d' : '#ffffff', color: activeCategory === cat ? '#fff' : '#475569', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>{cat === 'All' ? (lang === 'kh' ? 'ទាំងអស់' : 'All') : cat}</button>
                ))}
              </div>
            )}
          </div>

          <div className="pos-grid-area">
            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>{currentT.noProducts}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                {filteredProducts.map((p) => (
                  <div 
                    key={p.id} 
                    draggable={true} 
                    onDragStart={(e) => handleProductDragStart(e, p.id)} 
                    onDragOver={handleProductDragOver} 
                    onDrop={(e) => handleProductDrop(e, p.id)} 
                    onClick={() => handleProductClick(p)} 
                    style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', cursor: 'pointer', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px', transition: 'transform 0.1s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative' }} 
                    onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }} 
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '14px', color: '#334155', marginBottom: '8px' }}>{p.name}</div>
                    </div>
                    <div style={{ borderTop: '1px dashed #f1f5f9', paddingTop: '8px', marginTop: 'auto', position: 'relative', minHeight: activeTab === 'wholesale' ? '35px' : 'auto' }}>
                      <div style={{ fontSize: '14px', color: '#b58a3d' }}>
                        {formatRielSymbol(activeTab === 'retail' ? (p.price || 0) : (p.cost_price || 0))}
                      </div>
                      {(activeTab === 'wholesale') && <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981' }}>📦 {currentT.stock}: {p.stock}</div>}
                      
                      {(activeTab === 'wholesale') && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setExchangeModal({ isOpen: true, product: p, consumedKg: '' }); }}
                          style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '14px', cursor: 'pointer' }}
                          title="Exchange / Return"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==============================================================================================
          DESKTOP SIDEBAR CART
          ============================================================================================== */}
      <div className="desktop-cart-panel" style={{ width: '400px', backgroundColor: '#ffffff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100dvh', position: 'sticky', top: 0 }}>
        <div style={{ paddingTop: '16px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#334155' }}>{currentT.cartTitle} ({cart.length})</h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px' }}>
          
          {activeTab === 'wholesale' && selectedCustomerId && (
            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input type="text" placeholder="Invoice Name Override..." value={cartCustomerNameOverride} onChange={e => setCartCustomerNameOverride(e.target.value)} style={{ width: '100%', padding: '8px 10px', fontSize: '13px', fontWeight: 'normal', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155' }} className="mobile-input-field" />
            </div>
          )}

          {sortedCart.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#94a3b8' }}>{currentT.emptyCart}</div>
          ) : (
            sortedCart.map((item) => {
              const isReturn = item.custom_name.includes('ដូរ');
              const isCharge = item.custom_name.includes('បានប្រើ');
              const isSpecial = isReturn || isCharge;

              return (
                <div key={item.id} style={{ backgroundColor: isReturn ? '#fef2f2' : isCharge ? '#fffbeb' : '#ffffff', borderRadius: '8px', padding: '10px', marginBottom: '10px', border: `1px solid ${isReturn ? '#fecaca' : isCharge ? '#fde68a' : '#e2e8f0'}`, position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', zIndex: 5 }}>✕</button>

                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', paddingRight: '20px' }}>
                    <input 
                      type="text" 
                      value={item.custom_name} 
                      onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                      placeholder="Item Name"
                      readOnly={isSpecial}
                      style={{ 
                        fontSize: '13px', color: isReturn ? '#dc2626' : isCharge ? '#b45309' : '#334155', 
                        flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '2px 0'
                      }} 
                      className="mobile-input-field"
                    />
                    
                    {!isSpecial && activeTab === 'wholesale' && (
                      <select
                        value={item.selected_batch_id || 'AUTO'}
                        onChange={(e) => updateCartItem(item.id, 'selected_batch_id', e.target.value === 'AUTO' ? null : Number(e.target.value))}
                        style={{ marginLeft: '8px', padding: '2px 4px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', color: '#b58a3d', outline: 'none', cursor: 'pointer', maxWidth: '90px' }}
                      >
                        <option value="AUTO">▼ Auto</option>
                        {activeBatches[item.product_id]?.map((b: any) => {
                          const remaining = (b.imported_qty || 0) - (b.sold_qty || 0);
                          return <option key={b.id} value={b.id}>{formatRiel(b.cost_price)} ({remaining})</option>;
                        })}
                      </select>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.unitPrice} (៛)</span>
                      <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} fontSize="13px" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.quantity}</span>
                      <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} fontSize="13px" />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        
        <div style={{ paddingTop: '12px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0, zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', color: '#334155' }}>{currentT.totalKhmer}</span>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: totalRiel < 0 ? '#ef4444' : '#b58a3d' }}>{formatRielFromNative(totalRiel)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{currentT.totalUsd}</span>
            <span style={{ fontSize: '13px', color: '#475569' }}>{formatUSD(totalUSD)}</span>
          </div>

          {renderPaymentSection(false)}
          
          <button 
            onClick={confirmCheckout} 
            disabled={cart.length === 0 || isProcessing} 
            style={{ 
              width: '100%', 
              padding: '14px', 
              backgroundColor: (cart.length === 0 || isProcessing) ? '#e2e8f0' : '#10b981', 
              color: (cart.length === 0 || isProcessing) ? '#64748b' : '#ffffff', 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 'bold', 
              fontSize: '15px',
              cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'
            }}
          >
            {isProcessing ? 'Processing...' : currentT.checkout}
          </button>
        </div>
      </div>


      {/* ==============================================================================================
          MOBILE CART TRAY (BOTTOM SHEET)
          ============================================================================================== */}
      {cart.length > 0 && !isMobileCartOpen && !completedSale && !saleSummary && (
        <div className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 View Cart ({cart.length})</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatRielFromNative(totalRiel)} &nbsp; ➔</div>
        </div>
      )}

      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ flex: 1 }} onClick={() => setIsMobileCartOpen(false)}></div>
          
          <div style={{ width: '100%', height: '85dvh', backgroundColor: '#ffffff', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 -10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: '12px', paddingBottom: '8px', flexShrink: 0 }}>
              <div style={{ width: '40px', height: '5px', backgroundColor: '#cbd5e1', borderRadius: '10px' }}></div>
            </div>

            <div style={{ paddingRight: '20px', paddingBottom: '12px', paddingLeft: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#334155', fontSize: '16px' }}>{currentT.cartTitle} ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: '#f1f5f9', border: 'none', fontSize: '14px', width: '28px', height: '28px', borderRadius: '50%', color: '#475569' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: '16px', paddingRight: '20px', paddingBottom: '20px', paddingLeft: '20px' }}>
              {activeTab === 'wholesale' && selectedCustomerId && (
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input 
                    type="text" 
                    placeholder="Invoice Name Override..." 
                    value={cartCustomerNameOverride} 
                    onChange={e => setCartCustomerNameOverride(e.target.value)} 
                    style={{ width: '100%', padding: '10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155' }} 
                    className="mobile-input-field"
                  />
                </div>
              )}

              {sortedCart.map((item) => {
                const isReturn = item.custom_name.includes('ដូរ');
                const isCharge = item.custom_name.includes('បានប្រើ');
                const isSpecial = isReturn || isCharge;

                return (
                  <div key={item.id} style={{ backgroundColor: isReturn ? '#fef2f2' : isCharge ? '#fffbeb' : '#ffffff', borderRadius: '12px', padding: '12px', marginBottom: '10px', border: `1px solid ${isReturn ? '#fecaca' : isCharge ? '#fde68a' : '#e2e8f0'}`, position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px', width: '24px', height: '24px', borderRadius: '50%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', paddingRight: '30px' }}>
                      <input 
                        type="text" 
                        value={item.custom_name} 
                        onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                        placeholder="Item Name"
                        readOnly={isSpecial}
                        style={{ 
                          fontSize: '14px', color: isReturn ? '#dc2626' : isCharge ? '#b45309' : '#334155', 
                          flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: 0
                        }} 
                        className="mobile-input-field"
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.unitPrice}</span>
                        <CartInput fontSize="16px" value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.quantity}</span>
                        <CartInput fontSize="16px" value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div style={{ padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 12px)) 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', color: '#475569' }}>{currentT.totalKhmer}</span>
                <span style={{ fontWeight: 'bold', color: totalRiel < 0 ? '#ef4444' : '#b58a3d', fontSize: '20px' }}>{formatRielFromNative(totalRiel)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{currentT.totalUsd}</span>
                <span style={{ color: '#64748b', fontSize: '13px' }}>{formatUSD(totalUSD)}</span>
              </div>
              
              {renderPaymentSection(true)}

              <button 
                onClick={confirmCheckout} 
                disabled={cart.length === 0 || isProcessing} 
                style={{ 
                  width: '100%', 
                  padding: '14px', 
                  backgroundColor: (cart.length === 0 || isProcessing) ? '#e2e8f0' : '#10b981', 
                  color: (cart.length === 0 || isProcessing) ? '#64748b' : '#ffffff', 
                  border: 'none', 
                  borderRadius: '10px', 
                  fontWeight: 'bold', 
                  fontSize: '16px', 
                  cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                {isProcessing ? 'Processing...' : currentT.checkout}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER SEARCH MODAL (No-Zoom, Pop-up Style) */}
      {isCustomerModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '80px', paddingLeft: '16px', paddingRight: '16px', boxSizing: 'border-box' }} onMouseDown={() => setIsCustomerModalOpen(false)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', maxHeight: '75vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', color: '#94a3b8' }}>🔍</span>
              <input 
                autoFocus
                type="text" 
                placeholder="Search for option..." 
                value={customerSearchTerm} 
                onChange={e => setCustomerSearchTerm(e.target.value)} 
                style={{ flex: 1, padding: '8px', border: '1px solid transparent', fontSize: '16px', outline: 'none', color: '#0f172a', backgroundColor: 'transparent' }} 
                className="mobile-input-field"
              />
              <button onClick={() => setIsCustomerModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer', padding: '0 8px' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#fcfcfc' }}>
              <button onClick={() => { setIsCreateCustomerModalOpen(true); setIsCustomerModalOpen(false); }} style={{ width: '100%', padding: '12px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px dashed #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>+</span> Add New Customer
              </button>
              
              {filteredCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '14px' }}>No customers found</div>
              ) : (
                filteredCustomers.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => { setSelectedCustomerId(c.id.toString()); setCustomerSearchTerm(''); setIsCustomerModalOpen(false); }} 
                    style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', cursor: 'pointer', backgroundColor: '#fff', position: 'relative' }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1e293b', marginBottom: '8px' }}>{c.name}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Location: <span style={{ color: '#0f172a' }}>{c.location || '-'}</span></div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Phone Number: <span style={{ color: '#0f172a' }}>{c.phone || '-'}</span></div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>Types: <span style={{ color: '#0f172a' }}>{c.type || '-'}</span></div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW CUSTOMER MODAL */}
      {isCreateCustomerModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', fontSize: '18px' }}>Create New Customer</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Name</label>
              <input type="text" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({...newCustomerForm, name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Account Owner</label>
              <select value={newCustomerForm.owner} onChange={(e) => setNewCustomerForm({...newCustomerForm, owner: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff', outline: 'none' }} className="mobile-select-menu">
                <option value="">-- Select --</option>
                <option value="Pich">Pich</option>
                <option value="Jing">Jing</option>
                <option value="Both">Both</option>
                <option value="Mom">Mom</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Customer Type</label>
              <select value={newCustomerForm.type} onChange={(e) => setNewCustomerForm({...newCustomerForm, type: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff', outline: 'none' }} className="mobile-select-menu">
                <option value="">-- Select --</option>
                <option value="ហូប">ហូប</option>
                <option value="លក់បាយ">លក់បាយ</option>
                <option value="លក់ត">លក់ត</option>
                <option value="អំណោយ">អំណោយ</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Location</label>
              <input type="text" value={newCustomerForm.location} onChange={(e) => setNewCustomerForm({...newCustomerForm, location: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Phone Number</label>
              <input type="text" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({...newCustomerForm, phone: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setIsCreateCustomerModalOpen(false)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreateCustomer} style={{ padding: '10px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>Save Customer</button>
            </div>
          </div>
        </div>
      )}

      {/* RETURN & EXCHANGE MODAL */}
      {exchangeModal.isOpen && exchangeModal.product && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', fontSize: '18px' }}>🔄 Exchange / Return Bag</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Product to Return</label>
              <div style={{ padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#334155' }}>{exchangeModal.product.name}</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>How many kg were consumed?</label>
              <CurrencyInput
                autoFocus
                placeholder="e.g. 15"
                value={exchangeModal.consumedKg}
                onChange={(v: any) => setExchangeModal({ ...exchangeModal, consumedKg: v })}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', backgroundColor: '#ffffff' }}
                className="mobile-input-field"
              />
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', lineHeight: 1.4 }}>
                * Enter 0 if the bag is fully intact and unopened.<br/>
                * The consumed amount will be added to the cart and properly tracked for profit.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmExchange} style={{ padding: '10px 16px', backgroundColor: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>Confirm Return</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE PRODUCT ADD POPUP */}
      {selectedMobileProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setSelectedMobileProduct(null)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', fontSize: '18px' }}>{currentT.mobileModalTitle}</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Product Identifier</label>
              <input type="text" value={mobileName} onChange={(e) => setMobileName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Price (៛)</label>
                <CurrencyInput value={mobilePrice} onChange={(v: any) => setMobilePrice(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quantity</label>
                <CurrencyInput value={mobileQty} onChange={(v: any) => setMobileQty(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedMobileProduct(null)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>{currentT.cancel}</button>
              <button onClick={handleAddMobileProductToCart} style={{ padding: '10px 16px', backgroundColor: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>{currentT.add}</button>
            </div>
          </div>
        </div>
      )}

      {/* SALE SUMMARY MODAL (AUTO-DISMISSES) */}
      {saleSummary && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10005, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div className="modal-content" style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0, color: saleSummary.isDebt ? '#d97706' : '#10b981', fontSize: '20px', marginBottom: '8px', textAlign: 'center' }}>
              {saleSummary.isCashless ? 'Sale Recorded! ✅' : saleSummary.isDebt ? 'Partial Payment Logged ⏳' : 'Sale Complete! ✅'}
            </h2>
              
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', margin: '20px 0', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', textAlign: 'center' }}>Items Description Formula</div>
              <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
                {saleSummary.items?.map((item: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: '#334155' }}>
                    <span>{item.custom_name}</span>
                    <span>x{item.quantity}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '16px', marginTop: '16px', fontSize: '14px' }}>
                <span style={{ color: '#64748b' }}>Total Sale:</span>
                <span style={{ color: saleSummary.total < 0 ? '#ef4444' : '#10b981' }}>{formatRielFromNative(saleSummary.total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { setSaleSummary(null); setCompletedSale(null); setPreviewImageUrl(null); }} style={{ width: '100%', padding: '16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                 Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL INVISIBLE DOM CAPTURE AREA (STRICTLY BACKGROUND) */}
      {completedSale && (
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', zIndex: -1 }}>
          <div id="invoice-capture-area" ref={invoiceRef} style={{ width: '794px', height: '559px', backgroundColor: '#ffffff', position: 'relative', margin: 0, padding: '19px', boxSizing: 'border-box', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontSize: '12.8px', color: '#000000', overflow: 'hidden' }}>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer&display=swap" rel="stylesheet" crossOrigin="anonymous" />
            
            <div className="invoice-watermark" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: "url('https://i.imgur.com/XUsrp9D.png')", backgroundRepeat: 'no-repeat', backgroundPosition: 'center center', backgroundSize: '40%', opacity: 0.14, zIndex: 0, pointerEvents: 'none' }}></div>

            <div className="content" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              <div style={{ position: 'absolute', top: 0, left: 0, width: '60px', height: '70px', zIndex: 2 }}><img src="https://i.imgur.com/s0hg3MQ.png" alt="Left Logo" style={{ width: '100%', height: '100%', display: 'block' }} crossOrigin="anonymous" /></div>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '85px', height: '75px', zIndex: 2 }}><img src="https://i.imgur.com/Guk0hVe.png" alt="Right Logo" style={{ width: '95%', height: '100%', display: 'block' }} crossOrigin="anonymous" /></div>

              <header style={{ textAlign: 'center', marginBottom: '14px', lineHeight: 1.2 }}>
                <h1 style={{ fontSize: '23px', margin: '0 0 2px 0', fontWeight: 'bold', color: 'green' }}>ដេប៉ូអង្ករ រ៉េឌៀន</h1>
                <p style={{ margin: '1px 0', fontSize: '12.5px', color: 'green' }}>មានបោះដុំ លក់រាយអង្ករដែលមានគុណភាពខ្ពស់គ្រប់ប្រភេទ និងមានទទួលវិចខ្ចប់អំណោយក្នុងតម្លៃសមរម្យ</p>
                <p style={{ margin: '1px 0', fontSize: '12.5px' }}>📲 077 797 798 / 📞 081 797 798 / 📞 088 97 97 798</p>
                <p style={{ margin: '1px 0', fontSize: '12.5px' }}>📍 ផ្ទះលេខ 72 ផ្លូវលំ សង្កាត់ស្ទឹងមានជ័យ1 ខណ្ឌមានជ័យ រាជធានីភ្នំពេញ</p>
              </header>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '33%', textAlign: 'left' }}>
                      ឈ្មោះអតិថិជន: <span>{completedSale.customer?.name || ''}</span>
                    </td>
                    <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '34%', textAlign: 'center' }}>
                      ទីតាំង: <span>{completedSale.customer?.location || ''}</span>
                    </td>
                    <td style={{ fontSize: '12.5px', padding: '2px 3px', width: '33%', textAlign: 'left' }}>
                      លេខទូរសព្ទ: <span>{completedSale.customer?.phone || ''}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px', fontSize: '12.5px', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px' }}>No.<br/>ល.រ</th>
                    <th style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px' }}>Item Descriptions<br/>រាយឈ្មោះទំនិញ</th>
                    <th style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px' }}>Quantity<br/>ចំនួន</th>
                    <th style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px' }}>Unit Price<br/>តម្លៃរាយ</th>
                    <th style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px' }}>Subtotal<br/>តម្លៃសរុប</th>
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
                          total = -Math.abs(total);
                        }
                        grandTotal += total;

                        const isCenter = desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់') || desc.includes('សេវាឡាន (អតិថិជន)');

                        rows.push(
                          <tr key={i} style={{ height: '16px' }}>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{itemIndex}</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: isCenter ? 'center' : 'left', wordWrap: 'break-word', overflow: 'hidden' }}>{desc}</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{item.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center' }}>{item.custom_price_riel.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', color: total < 0 ? 'red' : 'inherit' }}>{total.toLocaleString('en-US')}</td>
                          </tr>
                        );
                      } else {
                        rows.push(
                          <tr key={i} style={{ height: '16px' }}>
                            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000', padding: '2px 3px' }}>&nbsp;</td>
                          </tr>
                        );
                      }
                    }
                    return (
                      <>
                        {rows}
                        <tr>
                          <td colSpan={4} style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'right', fontWeight: 'bold', padding: '2px 3px' }}>Total | សរុប</td>
                          <td style={{ border: '1px solid #000', backgroundColor: '#fffacd', textAlign: 'center', fontWeight: 'bold', padding: '2px 3px', color: grandTotal < 0 ? 'red' : 'inherit' }}>{grandTotal.toLocaleString('en-US')}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>

              <div style={{ margin: 'auto 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12.5px', padding: '0 10px' }}>
                 <div style={{ display: 'flex', gap: '80px' }}>
                    <div style={{ textAlign: 'center' }}>
                       <p style={{ margin: 0 }}>ហត្ថលេខាអ្នកទិញ</p>
                       <div style={{ marginTop: '35px', marginBottom: '3px' }}>..........................................</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                       <p style={{ margin: 0 }}>ហត្ថលេខាអ្នកលក់</p>
                       <div style={{ marginTop: '35px', marginBottom: '3px' }}>..........................................</div>
                    </div>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0 }}>ថ្ងៃទី {completedSale.dateObj.day} ខែ {completedSale.dateObj.month} ឆ្នាំ {completedSale.dateObj.year}</p>
                 </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* RENDERED INVOICE PREVIEW MODAL (IF APPLICABLE) */}
      {showInvoicePreview && completedSale && (
        <div className="invoice-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10006, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          <div className="invoice-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '16px', padding: '0 20px' }}>
            <button onClick={() => { setShowInvoicePreview(false); setCompletedSale(null); setPreviewImageUrl(null); }} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>{currentT.close}</button>
            
            <div className="desktop-controls" style={{ display: 'none', gap: '10px' }}>
              <button onClick={handleDesktopDownloadPNG} disabled={!previewImageUrl} style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>{currentT.openInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>🖨️ Print / PDF</button>
            </div>

            <div className="mobile-controls" style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleMobileShare} disabled={!previewImageUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>{currentT.shareInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>🖨️ Print</button>
            </div>
          </div>

          <div className="invoice-preview-container" style={{ width: '100%', maxWidth: '850px', padding: '0 10px', display: 'flex', justifyContent: 'center' }}>
            {isGeneratingPreview || !previewImageUrl ? (
              <div style={{ padding: '40px', backgroundColor: '#fff', borderRadius: '8px', color: '#334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>⏳</span> Generating High-Resolution Invoice...
              </div>
            ) : (
              <img src={previewImageUrl} alt="Invoice Preview" style={{ width: '100%', maxWidth: '794px', borderRadius: '4px', objectFit: 'contain', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }
        
        body {
          font-variant-numeric: tabular-nums lining-nums;
        }

        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          min-height: 100dvh;
        }
        .header-container { 
          margin-bottom: 24px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap; 
          gap: 12px;
        }
        .header-left {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 16px;
        }

        /* UPDATED PAGE TITLE TO MATCH COGS REPORT */
        .page-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #4a3b1b; 
          margin: 0; 
        }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none; margin: 0;
        }

        @media print {
          body * { visibility: hidden; }
          #invoice-capture-area, #invoice-capture-area * { visibility: visible; }
          #invoice-capture-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important; 
            max-width: none !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A5 landscape; margin: 5mm; }
          .invoice-controls { display: none !important; }
          .invoice-modal-overlay { background: transparent !important; }
          .invoice-preview-container img { display: none !important; }
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .mobile-fab { display: none; }

        @media (min-width: 1024px) {
          .mobile-controls { display: none !important; }
          .desktop-controls { display: flex !important; }
        }
        
        @media (max-width: 1023px) { 
          .desktop-controls { display: none !important; }
          .desktop-cart-panel { display: none !important; }
          
          .main-wrapper { 
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 140px 16px !important; 
            min-height: auto;
          }
          .header-container {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
            margin-bottom: 24px !important;
          }
          .header-left {
            flex-direction: column !important;
            align-items: flex-start;
            text-align: left;
            gap: 6px;
          }
          .mobile-fab {
            display: flex !important; 
            justify-content: space-between; 
            align-items: center; 
            position: fixed; 
            bottom: max(40px, env(safe-area-inset-bottom, 40px)); 
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
          .mobile-input-field, .mobile-select-menu {
            font-size: 16px !important; /* Neutralizes Safari Zoom */
          }
        }
      `}</style>
    </div>
  )
}