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
    successTitle: "Invoice Ready",
    openInvoice: "💾 Download Image",
    shareInvoice: "📤 Share / Save",
    close: "Close Window",
    mobileModalTitle: "Adjust Item Properties",
    cancel: "Cancel",
    add: "Add to Cart"
  },
  kh: {
    title: "អង្គរ រេឌឌៀន រ៉ាយស៍",
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
    totalKhmer: "សរុបរួម:",
    totalUsd: "សរុបជាដុល្លារ:",
    checkout: "ចាត់ចែងការទូទាត់",
    successTitle: "វិក្កយបត្រត្រូវបានបង្កើតជោគជ័យ!",
    openInvoice: "💾 ទាញយកវិក្កយបត្រ",
    shareInvoice: "📤 ចែករំលែក / រក្សាទុក",
    close: "បិទផ្ទាំង",
    mobileModalTitle: "កែសម្រួលព័ត៌មានទំនិញ",
    cancel: "បោះបង់",
    add: "បញ្ចូលទៅកន្ត្រក"
  }
};

// ==========================================
// ROBUST LIVE COMMA FORMATTER (Stateless Display)
// ==========================================
function CurrencyInput({ value, onChange, placeholder, style, autoFocus }: any) {
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
      autoFocus={autoFocus}
      style={{ ...style, color: '#0f172a' }}
    />
  )
}

function CartInput({ value, onChange, isQty }: { value: number, onChange: (val: number) => void, isQty: boolean }) {
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
      style={{ 
        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', 
        fontSize: '14px', fontWeight: 'normal', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none', textAlign: 'center'
      }}
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
  const [currentTime, setCurrentTime] = useState(new Date())

  // ==========================================
  // DYNAMIC PAYMENT ROWS
  // ==========================================
  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | ''}[]>([
    { id: Date.now(), method: 'Cash ៛', amount: '' }
  ]);

  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', location: '', owner: '', type: '' })

  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null)
  const [editingCardId, setEditingCardId] = useState<number | null>(null)
  const [editCardForm, setEditCardForm] = useState({ name: '', price: '' })

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

  // Live Date and Time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (completedSale && invoiceRef.current && !previewImageUrl && showInvoicePreview) {
      const timer = setTimeout(async () => {
        try {
          await document.fonts.ready;
          const isMobile = window.innerWidth < 1024;
          const dataUrl = await htmlToImage.toPng(invoiceRef.current!, { 
            pixelRatio: isMobile ? 1.5 : 3, 
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
    if (editingCardId === product.id) return;
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

  async function saveCardEdit(id: number) {
    const parsedPrice = parseFloat(editCardForm.price) || 0;
    const { error } = await supabase.from('products').update({ name: editCardForm.name, price: parsedPrice }).eq('id', id);
    if (!error) {
      setEditingCardId(null);
      loadProductsAndSettings();
    } else alert("Error saving: " + error.message);
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

  const totalRiel = cart.reduce((sum, item) => {
    const isReturn = item.custom_name.includes('ដូរ');
    const itemTotal = Number(item.custom_price_riel) * Number(item.quantity);
    return isReturn ? sum - Math.abs(itemTotal) : sum + itemTotal;
  }, 0)

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

  // Calculate live multi-currency totals
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

  // --- REWRITTEN CHECKOUT: DB MULTI-ROW SPLIT ENGINE & ASSET LOGGING ---
  async function confirmCheckout() {
    if (cart.length === 0) return alert(lang === 'kh' ? 'សូមជ្រើសរើសទំនិញក្នុងកន្ត្រក!' : 'Cart is empty');
    if (activeTab === 'wholesale' && !selectedCustomerId) return alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale');

    setIsProcessing(true);

    try {
      const currentCart = [...cart];
      const currentTotalRiel = totalRiel;
      const finalCustomerName = cartCustomerNameOverride.trim() || 'Walk-in';

      // Combine payment methods string
      const activePayments = paymentRows.filter(r => (Number(r.amount) || 0) > 0);
      let finalPaymentMethod = 'Pending';
      
      if (showPaymentSelector) {
        if (activePayments.length > 0) {
          finalPaymentMethod = activePayments.map(r => `${r.method}: ${r.amount}`).join(', ');
        } else if (isSimpleCustomer) {
           finalPaymentMethod = 'Cash ៛'; // Fallback for quick walkin
        }
      }

      if (activeTab === 'retail') {
        const retailTxId = `RET-${Date.now().toString().slice(-6)}`;
        const retailRows = currentCart.map(item => ({
          transaction_id: retailTxId,
          rice_type: item.name,
          custom_rice_type: item.custom_name !== item.name ? item.custom_name : null,
          qty: item.quantity,
          price_per_bag: item.custom_price_riel,
          cogs_price: item.cost_price || 0
        }));

        await supabase.from('retail_sales').insert(retailRows);

        for (const item of currentCart) {
          await supabase.from('products').update({ stock: item.stock - item.quantity }).eq('id', item.product_id);
        }

      } else {
        const displayInvoiceNo = editingInvoiceId ? editingInvoiceId : `INV-${Date.now().toString().slice(-6)}`;
        const finalOwner = selectedCustomer?.owner || null; 
        const finalLocation = selectedCustomer?.location || '';
        const finalPhone = selectedCustomer?.phone || '';
        
        const saleRows = [];
        let invoiceTotalSales = 0;
        let invoiceTotalCogs = 0;

        for (const item of currentCart) {
          const isReturn = item.custom_name.includes('ដូរ');
          const isCharge = item.custom_name.includes('បានប្រើ');
          const isBypass = item.bypass_stock || isCharge;
          const finalQty = isReturn ? -Math.abs(item.quantity) : item.quantity;
          
          if (isReturn || isBypass || editingInvoiceId) {
            let actualUnitCogs = item.cost_price || 0;
            let actualTotalCogs = actualUnitCogs * finalQty; 
            
            saleRows.push({
              invoice_id: displayInvoiceNo, product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: actualUnitCogs, owner: finalOwner
            });
            invoiceTotalSales += Number(item.custom_price_riel) * finalQty;
            invoiceTotalCogs += actualTotalCogs;

          } else if (item.selected_batch_id) {
            const specificBatch = activeBatches[item.product_id]?.find(b => b.id === item.selected_batch_id);
            let actualUnitCogs = specificBatch ? specificBatch.cost_price : (item.cost_price || 0);
            let actualTotalCogs = actualUnitCogs * finalQty;

            saleRows.push({
              invoice_id: displayInvoiceNo, product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: actualUnitCogs, owner: finalOwner
            });
            invoiceTotalSales += Number(item.custom_price_riel) * finalQty;
            invoiceTotalCogs += actualTotalCogs;

            if (specificBatch && !editingInvoiceId && !isBypass) {
              await supabase.from('price_history').update({ sold_qty: (specificBatch.sold_qty || 0) + finalQty }).eq('id', specificBatch.id);
            }
          } else {
            const splits = await getFIFOSplits(item.product_id, finalQty, item.cost_price || 0);
            for (const split of splits) {
              saleRows.push({
                invoice_id: displayInvoiceNo, product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
                custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: split.qty, price_per_bag: item.custom_price_riel,
                cogs_price: split.cogs_price, owner: finalOwner
              });
              invoiceTotalSales += Number(item.custom_price_riel) * split.qty;
              invoiceTotalCogs += split.cogs_price * split.qty;

              if (split.batch_id && !editingInvoiceId && !isBypass) {
                await supabase.from('price_history').update({ sold_qty: split.current_sold + split.qty }).eq('id', split.batch_id);
              }
            }
          }

          if (!editingInvoiceId && !isBypass) {
            await supabase.from('products').update({ stock: item.stock - finalQty }).eq('id', item.product_id);
          }
        }

        const combinedRiceTypes = currentCart.map(item => `${item.custom_name} (x${item.quantity})`).join(', ');
        const invoiceTotalProfit = invoiceTotalSales - invoiceTotalCogs;

        let calculatedBalanceDue = 0;
        if (liveTotalReceivedInRiel > 0) {
          calculatedBalanceDue = Math.max(0, invoiceTotalSales - liveTotalReceivedInRiel);
        } else {
          calculatedBalanceDue = isSimpleCustomer ? 0 : invoiceTotalSales; 
        }

        const summaryRow = {
          invoice_id: displayInvoiceNo, customer_name: finalCustomerName, owner: finalOwner, rice_types: combinedRiceTypes,
          total_sales: invoiceTotalSales, total_cogs: invoiceTotalCogs, total_profit: invoiceTotalProfit,
          delivery_status: isSimpleCustomer ? 'Delivered' : 'Pending', payment_method: finalPaymentMethod,
          balance_due: calculatedBalanceDue, customer_location: finalLocation
        };

        if (editingInvoiceId) {
          await supabase.from('sales').delete().eq('invoice_id', editingInvoiceId);
          await supabase.from('invoice_summaries').delete().eq('invoice_id', editingInvoiceId);
        }

        const { error: salesErr } = await supabase.from('sales').insert(saleRows);
        if (salesErr) throw new Error(`Failed to save to Sales table: ${salesErr.message}`);

        const { error: summaryErr } = await supabase.from('invoice_summaries').insert([summaryRow]);
        if (summaryErr) throw new Error(`Failed to save to Summaries table: ${summaryErr.message}`);

        const currentDate = new Date();
        setCompletedSale({
          invoiceNo: displayInvoiceNo, cartSnapshot: currentCart, customer: { name: finalCustomerName, phone: finalPhone, location: finalLocation },
          dateObj: { day: String(currentDate.getDate()).padStart(2, '0'), month: String(currentDate.getMonth() + 1).padStart(2, '0'), year: currentDate.getFullYear() }
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

      // Show Summary / Invoice logic
      if (liveTotalReceivedInRiel > 0 || (activeTab === 'retail' && liveTotalReceivedInRiel === 0)) {
        if (activeTab === 'wholesale' && !isSimpleCustomer) {
          setIsGeneratingPreview(true);
          setShowInvoicePreview(true); 
        }
        
        let cRiel = 0, qRiel = 0, cUsd = 0, qUsd = 0;
        activePayments.forEach(r => {
          if (r.method === 'Cash ៛') cRiel += Number(r.amount);
          if (r.method === 'QR ៛' || r.method === 'Mom QR ៛') qRiel += Number(r.amount);
          if (r.method === 'Cash $') cUsd += Number(r.amount);
          if (r.method === 'QR $' || r.method === 'Mom QR $') qUsd += Number(r.amount);
        });

        setSaleSummary({ 
          total: currentTotalRiel, 
          receivedRiel: cRiel + qRiel, 
          receivedUsd: cUsd + qUsd, 
          totalReceivedInRiel: liveTotalReceivedInRiel,
          change: liveRemaining < 0 ? Math.abs(liveRemaining) : 0, 
          type: activeTab, 
          isCashless: liveTotalReceivedInRiel === 0, 
          items: currentCart,
          isDebt: liveRemaining > 0
        });
      } else {
        if (activeTab === 'wholesale' && !isSimpleCustomer) {
          setIsGeneratingPreview(true);
          setShowInvoicePreview(true); 
        } else {
          setSaleSummary({ total: currentTotalRiel, receivedRiel: 0, receivedUsd: 0, totalReceivedInRiel: 0, change: 0, type: 'retail', isCashless: true, items: currentCart, isDebt: false });
        }
      }

    } catch (err: any) {
      alert(`System Error: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
      setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '' }]);
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

  // Payment Row UI Renderer (Used in Desktop sidebar and Mobile Tray)
  const renderPaymentSection = () => {
    if (!showPaymentSelector) return null;
    return (
      <div style={{ marginBottom: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount Received</label>
          <button onClick={() => setPaymentRows([...paymentRows, { id: Date.now(), method: 'Cash ៛', amount: '' }])} style={{ background: '#e0f2fe', color: '#0284c7', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', cursor: 'pointer' }}>+ Split</button>
        </div>
        
        {paymentRows.map((row, index) => (
          <div key={row.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <select 
              value={row.method} 
              onChange={e => {
                const newRows = [...paymentRows];
                newRows[index].method = e.target.value;
                setPaymentRows(newRows);
              }}
              style={{ width: '45%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'normal', outline: 'none', backgroundColor: '#fff', cursor: 'pointer', color: '#0f172a' }}
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
                onChange={(val: any) => {
                  const newRows = [...paymentRows];
                  newRows[index].amount = val;
                  setPaymentRows(newRows);
                }}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none', color: '#0f172a', fontWeight: 'normal', fontSize: '14px', textAlign: 'right' }}
              />
            </div>
            
            {paymentRows.length > 1 && (
              <button onClick={() => setPaymentRows(paymentRows.filter(r => r.id !== row.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '0 4px' }}>✕</button>
            )}
          </div>
        ))}

        {paymentRows.some(r => Number(r.amount) > 0) && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#64748b' }}>Total Received:</span>
              <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{formatRielFromNative(liveTotalReceivedInRiel)}</span>
            </div>
            {liveRemaining < 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Change Due:</span>
                <span style={{ fontWeight: 'bold', color: '#dc2626' }}>{formatRielFromNative(Math.abs(liveRemaining))}</span>
              </div>
            ) : liveRemaining > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#b45309', fontWeight: 'bold' }}>Owe / Debt:</span>
                <span style={{ fontWeight: 'bold', color: '#d97706' }}>{formatRielFromNative(liveRemaining)}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pos-layout-wrapper" style={{ display: 'flex', height: '100vh', overflow: 'hidden', width: '100%', backgroundColor: '#ffffff', boxSizing: 'border-box' }}>
      
      {/* SELECTION ENGINE VIEW GRID PANEL */}
      <div className="pos-main-engine hide-scrollbar" style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', minWidth: 0, height: '100%', overflowY: 'auto' }}>
        
        <div className="main-wrapper" style={{ paddingBottom: '100px', flex: 1 }}>
          <div className="header-container">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
              <h1 className="page-title">{editingInvoiceId ? `✏️ Editing: ${editingInvoiceId}` : `🛒 ${currentT.title}`}</h1>
              <span style={{ fontSize: '14px', color: '#64748b' }}>
                {currentTime.toLocaleDateString('en-GB')} {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ backgroundColor: '#f4f1ea', borderRadius: '20px', padding: '2px' }}>
              <button onClick={() => setLang('en')} style={{ border: 'none', backgroundColor: lang === 'en' ? '#b58a3d' : 'transparent', color: lang === 'en' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>EN</button>
              <button onClick={() => setLang('kh')} style={{ border: 'none', backgroundColor: lang === 'kh' ? '#b58a3d' : 'transparent', color: lang === 'kh' ? '#fff' : '#6b582f', padding: '6px 12px', borderRadius: '18px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>KH</button>
            </div>
          </div>

          <div className="pos-tools-area" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button onClick={() => { setActiveTab('retail'); setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'retail' ? '#b58a3d' : '#fff', color: activeTab === 'retail' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'retail' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.retail}</button>
              <button onClick={() => { 
                setActiveTab('wholesale');
                if (!selectedCustomerId) {
                  const walkInCust = customers.find(c => c.name.toLowerCase() === 'walk-in' || c.name.toLowerCase() === 'walk in');
                  if (walkInCust) setSelectedCustomerId(walkInCust.id.toString());
                }
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'wholesale' ? '#b58a3d' : '#fff', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'wholesale' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.wholesale}</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
              <input type="text" placeholder={currentT.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '16px', color: '#333333', backgroundColor: '#ffffff' }} />
              
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
              <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '4px', marginTop: '16px' }}>
                {RICE_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 14px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #dcd7cc', backgroundColor: activeCategory === cat ? '#b58a3d' : '#ffffff', color: activeCategory === cat ? '#fff' : '#6b582f', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>{cat === 'All' ? (lang === 'kh' ? 'ទាំងអស់' : 'All') : cat}</button>
                ))}
              </div>
            )}
          </div>

          <div className="pos-grid-area">
            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8a7650' }}>{currentT.noProducts}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                {filteredProducts.map((p) => (
                  <div key={p.id} draggable={editingCardId !== p.id} onDragStart={(e) => handleProductDragStart(e, p.id)} onDragOver={handleProductDragOver} onDrop={(e) => handleProductDrop(e, p.id)} onMouseEnter={() => setHoveredCardId(p.id)} onMouseLeave={() => setHoveredCardId(null)} onClick={() => handleProductClick(p)} style={{ border: '1px solid #eadeca', borderRadius: '10px', padding: '14px', cursor: editingCardId === p.id ? 'default' : 'pointer', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px', transition: 'transform 0.1s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative' }} onMouseDown={e => { if(editingCardId !== p.id) e.currentTarget.style.transform = 'scale(0.97)'; }} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                    {editingCardId === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }} onClick={e => e.stopPropagation()}>
                        <input autoFocus value={editCardForm.name} onChange={e => setEditCardForm({...editCardForm, name: e.target.value})} style={{ padding: '4px 6px', border: '1px solid #b58a3d', borderRadius: '4px', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#333333', backgroundColor: '#ffffff', fontSize: '16px' }} />
                        <input type="number" value={editCardForm.price} onChange={e => setEditCardForm({...editCardForm, price: e.target.value})} style={{ padding: '4px 6px', border: '1px solid #b58a3d', borderRadius: '4px', outline: 'none', width: '100%', boxSizing: 'border-box', color: '#333333', backgroundColor: '#ffffff', fontSize: '16px' }} />
                        <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                          <button onClick={(e) => { e.stopPropagation(); saveCardEdit(p.id); }} style={{ flex: 1, backgroundColor: '#10b981', color: 'white', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅</button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingCardId(null); }} style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>❌</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#4a3b1b', marginBottom: '8px' }}>{p.name}</div>
                          <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingCardId(p.id); setEditCardForm({ name: p.name, price: String(p.price) }); }} 
                            onTouchStart={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', margin: '-4px -4px 0 0', display: hoveredCardId === p.id || (typeof window !== 'undefined' && window.innerWidth < 1024) ? 'block' : 'none' }} 
                            title="Edit Product"
                          >✏️</button>
                        </div>
                        <div style={{ borderTop: '1px dashed #f4f1ea', paddingTop: '8px', marginTop: 'auto', position: 'relative', minHeight: activeTab === 'wholesale' ? '35px' : 'auto' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#b58a3d' }}>
                            {formatRielSymbol(activeTab === 'retail' ? (p.price || 0) : (p.cost_price || 0))}
                          </div>
                          {(activeTab === 'wholesale') && <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>📦 {currentT.stock}: {p.stock}</div>}
                          
                          {(activeTab === 'wholesale') && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); setExchangeModal({ isOpen: true, product: p, consumedKg: '' }); }}
                              style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
                              title="Exchange / Return"
                            >
                              🔄
                            </button>
                          )}
                        </div>
                      </>
                    )}
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
      <div className="desktop-cart-panel" style={{ width: '380px', backgroundColor: '#ffffff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
        <div style={{ paddingTop: '16px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#fcfbfa', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.cartTitle} ({cart.length})</h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px' }}>
          
          {activeTab === 'wholesale' && selectedCustomerId && (
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#8a7650', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📄 Invoice Customizer</div>
              <input type="text" placeholder="Invoice Name Override..." value={cartCustomerNameOverride} onChange={e => setCartCustomerNameOverride(e.target.value)} style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 'normal', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a' }} />
            </div>
          )}

          {sortedCart.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '40px', color: '#9c8a6c' }}>{currentT.emptyCart}</div>
          ) : (
            sortedCart.map((item) => {
              const isReturn = item.custom_name.includes('ដូរ');
              const isCharge = item.custom_name.includes('បានប្រើ');
              const isSpecial = isReturn || isCharge;

              return (
                <div key={item.id} style={{ backgroundColor: isReturn ? '#fef2f2' : isCharge ? '#fffbeb' : '#ffffff', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: `1px solid ${isReturn ? '#fecaca' : isCharge ? '#fde68a' : '#e2e8f0'}`, position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '8px', right: '8px', background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', width: '24px', height: '24px', borderRadius: '50%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>

                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', paddingRight: '28px' }}>
                    <input 
                      type="text" 
                      value={item.custom_name} 
                      onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                      placeholder="Item Name"
                      readOnly={isSpecial}
                      style={{ 
                        fontWeight: 'normal', fontSize: '14px', color: isReturn ? '#dc2626' : isCharge ? '#b45309' : '#0f172a', 
                        flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: 0
                      }} 
                    />
                    
                    {!isSpecial && activeTab === 'wholesale' && (
                      <select
                        value={item.selected_batch_id || 'AUTO'}
                        onChange={(e) => updateCartItem(item.id, 'selected_batch_id', e.target.value === 'AUTO' ? null : Number(e.target.value))}
                        style={{ marginLeft: '8px', padding: '2px 4px', background: '#fefcf3', border: '1px solid #eadeca', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: '#b58a3d', outline: 'none', cursor: 'pointer', maxWidth: '90px' }}
                      >
                        <option value="AUTO">▼ Auto</option>
                        {activeBatches[item.product_id]?.map((b: any) => {
                          const remaining = (b.imported_qty || 0) - (b.sold_qty || 0);
                          return <option key={b.id} value={b.id}>{formatRiel(b.cost_price)} ({remaining})</option>;
                        })}
                      </select>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{currentT.unitPrice}</span>
                      <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{currentT.quantity}</span>
                      <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        
        <div style={{ position: 'sticky', bottom: 0, paddingTop: '16px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderTop: '1px solid #e5e7eb', backgroundColor: '#fcfbfa', flexShrink: 0, zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{currentT.totalKhmer}</span>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: totalRiel < 0 ? '#ef4444' : '#b58a3d' }}>{formatRielFromNative(totalRiel)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
            <span style={{ fontSize: '11px', color: '#8a7650' }}>{currentT.totalUsd}</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a3b1b' }}>{formatUSD(totalUSD)}</span>
          </div>

          {renderPaymentSection()}
          
          <button 
            onClick={confirmCheckout} 
            disabled={cart.length === 0 || isProcessing} 
            style={{ 
              width: '100%', 
              padding: '16px', 
              backgroundColor: (cart.length === 0 || isProcessing) ? '#e5e7eb' : '#10b981', 
              color: (cart.length === 0 || isProcessing) ? '#9ca3af' : '#ffffff', 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 'bold', 
              fontSize: '16px',
              cursor: (cart.length === 0 || isProcessing) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'
            }}
          >
            {isProcessing ? 'Processing...' : currentT.checkout}
          </button>
        </div>
      </div>


      {/* ==============================================================================================
          MOBILE CART TRAY (CENTERED POPUP)
          ============================================================================================== */}
      {cart.length > 0 && !isMobileCartOpen && !completedSale && !saleSummary && (
        <div className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 View Cart ({cart.length})</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatRielFromNative(totalRiel)} &nbsp; ➔</div>
        </div>
      )}

      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setIsMobileCartOpen(false)}>
          
          <div style={{ width: '100%', maxWidth: '450px', maxHeight: '75vh', backgroundColor: '#ffffff', borderRadius: '20px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
            
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#4a3b1b', fontSize: '18px' }}>{currentT.cartTitle} ({cart.length})</h3>
              <button onClick={() => setIsMobileCartOpen(false)} style={{ background: '#f1f5f9', border: 'none', fontSize: '16px', width: '32px', height: '32px', borderRadius: '50%', color: '#475569', fontWeight: 'bold' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {activeTab === 'wholesale' && selectedCustomerId && (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#8a7650', textTransform: 'uppercase' }}>📄 Invoice Customizer</div>
                  <input 
                    type="text" 
                    placeholder="Invoice Name Override..." 
                    value={cartCustomerNameOverride} 
                    onChange={e => setCartCustomerNameOverride(e.target.value)} 
                    style={{ width: '100%', padding: '10px', fontSize: '14px', fontWeight: 'normal', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#0f172a' }} 
                  />
                </div>
              )}

              {sortedCart.map((item) => {
                const isReturn = item.custom_name.includes('ដូរ');
                const isCharge = item.custom_name.includes('បានប្រើ');
                const isSpecial = isReturn || isCharge;

                return (
                  <div key={item.id} style={{ backgroundColor: isReturn ? '#fef2f2' : isCharge ? '#fffbeb' : '#ffffff', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${isReturn ? '#fecaca' : isCharge ? '#fde68a' : '#e2e8f0'}`, position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <button onClick={() => removeFromCart(item.id)} style={{ position: 'absolute', top: '12px', right: '12px', background: '#fee2e2', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', width: '28px', height: '28px', borderRadius: '50%', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px', paddingRight: '30px' }}>
                      <input 
                        type="text" 
                        value={item.custom_name} 
                        onChange={(e) => updateCartItem(item.id, 'custom_name', e.target.value)}
                        placeholder="Item Name"
                        readOnly={isSpecial}
                        style={{ 
                          fontWeight: 'normal', 
                          fontSize: '14px', 
                          color: isReturn ? '#dc2626' : isCharge ? '#b45309' : '#0f172a', 
                          flex: 1, 
                          border: 'none',
                          background: 'transparent', 
                          outline: 'none',
                          padding: 0
                        }} 
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{currentT.unitPrice}</span>
                        <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} isQty={false} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{currentT.quantity}</span>
                        <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} isQty={true} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Mobile Footer Area inside Modal */}
            <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb', backgroundColor: '#ffffff', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#475569' }}>{currentT.totalKhmer}</span>
                <span style={{ fontWeight: 'bold', color: totalRiel < 0 ? '#ef4444' : '#b58a3d', fontSize: '22px' }}>{formatRielFromNative(totalRiel)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>{currentT.totalUsd}</span>
                <span style={{ fontWeight: 'bold', color: '#64748b', fontSize: '14px' }}>{formatUSD(totalUSD)}</span>
              </div>
              
              {renderPaymentSection()}

              <button 
                onClick={confirmCheckout} 
                disabled={cart.length === 0 || isProcessing} 
                style={{ 
                  width: '100%', 
                  padding: '16px', 
                  backgroundColor: (cart.length === 0 || isProcessing) ? '#e5e7eb' : '#10b981', 
                  color: (cart.length === 0 || isProcessing) ? '#9ca3af' : '#ffffff', 
                  border: 'none', 
                  borderRadius: '12px', 
                  fontWeight: 'bold', 
                  fontSize: '18px', 
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setIsCustomerModalOpen(false)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', maxHeight: '80vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', color: '#94a3b8' }}>🔍</span>
              <input 
                autoFocus
                type="text" 
                placeholder="Search for option..." 
                value={customerSearchTerm} 
                onChange={e => setCustomerSearchTerm(e.target.value)} 
                style={{ flex: 1, padding: '8px', border: 'none', fontSize: '16px', outline: 'none', color: '#0f172a' }} 
              />
              <button onClick={() => setIsCustomerModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f8fafc' }}>
              <button onClick={() => { setIsCreateCustomerModalOpen(true); setIsCustomerModalOpen(false); }} style={{ width: '100%', padding: '14px', backgroundColor: '#e0f2fe', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
                + Add New Customer
              </button>
              
              {filteredCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '14px' }}>No customers found</div>
              ) : (
                filteredCustomers.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => { setSelectedCustomerId(c.id.toString()); setCustomerSearchTerm(''); setIsCustomerModalOpen(false); }} 
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'background 0.2s', backgroundColor: '#fff' }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1e293b', marginBottom: '8px' }}>{c.name}</div>
                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Location: <span style={{ color: '#64748b' }}>{c.location || '-'}</span></div>
                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Phone Number: <span style={{ color: '#64748b' }}>{c.phone || '-'}</span></div>
                    <div style={{ fontSize: '13px', color: '#475569' }}>Types: <span style={{ color: '#64748b' }}>{c.type || '-'}</span></div>
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
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>Create New Customer</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Name</label>
              <input type="text" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({...newCustomerForm, name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '16px' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Account Owner</label>
              <select value={newCustomerForm.owner} onChange={(e) => setNewCustomerForm({...newCustomerForm, owner: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none', fontSize: '16px' }}>
                <option value="">-- Select --</option>
                <option value="Pich">Pich</option>
                <option value="Jing">Jing</option>
                <option value="Both">Both</option>
                <option value="Mom">Mom</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Customer Type</label>
              <select value={newCustomerForm.type} onChange={(e) => setNewCustomerForm({...newCustomerForm, type: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none', fontSize: '16px' }}>
                <option value="">-- Select --</option>
                <option value="ហូប">ហូប</option>
                <option value="លក់បាយ">លក់បាយ</option>
                <option value="លក់ត">លក់ត</option>
                <option value="អំណោយ">អំណោយ</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Location</label>
              <input type="text" value={newCustomerForm.location} onChange={(e) => setNewCustomerForm({...newCustomerForm, location: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '16px' }} />
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Phone Number</label>
              <input type="text" value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm({...newCustomerForm, phone: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '16px' }} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setIsCreateCustomerModalOpen(false)} style={{ padding: '10px 16px', backgroundColor: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6b582f', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleCreateCustomer} style={{ padding: '10px 16px', backgroundColor: '#10b981', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>Save Customer</button>
            </div>
          </div>
        </div>
      )}

      {/* RETURN & EXCHANGE MODAL */}
      {exchangeModal.isOpen && exchangeModal.product && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>🔄 Exchange / Return Bag</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Product to Return</label>
              <div style={{ padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', color: '#0f172a' }}>{exchangeModal.product.name}</div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>How many kg were consumed?</label>
              <CurrencyInput
                autoFocus
                placeholder="e.g. 15"
                value={exchangeModal.consumedKg}
                onChange={(v: any) => setExchangeModal({ ...exchangeModal, consumedKg: v })}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 'normal', fontSize: '14px' }}
              />
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', lineHeight: 1.4 }}>
                * Enter 0 if the bag is fully intact and unopened.<br/>
                * The consumed amount will be added to the cart and properly tracked for profit.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })} style={{ padding: '10px 16px', backgroundColor: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6b582f', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmExchange} style={{ padding: '10px 16px', backgroundColor: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>Confirm Return</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE PRODUCT ADD POPUP */}
      {selectedMobileProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#4a3b1b', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>{currentT.mobileModalTitle}</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#8a7650', marginBottom: '4px' }}>Product Identifier</label>
              <input type="text" value={mobileName} onChange={(e) => setMobileName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontSize: '14px', fontWeight: 'normal' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#8a7650', marginBottom: '4px' }}>Price (៛)</label>
                <CurrencyInput value={mobilePrice} onChange={(v: any) => setMobilePrice(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 'normal', fontSize: '14px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#8a7650', marginBottom: '4px' }}>Quantity</label>
                <CurrencyInput value={mobileQty} onChange={(v: any) => setMobileQty(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dcd7cc', boxSizing: 'border-box', color: '#0f172a', backgroundColor: '#ffffff', fontWeight: 'normal', fontSize: '14px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedMobileProduct(null)} style={{ padding: '10px 16px', backgroundColor: '#f4f1ea', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6b582f', fontSize: '14px' }}>{currentT.cancel}</button>
              <button onClick={handleAddMobileProductToCart} style={{ padding: '10px 16px', backgroundColor: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>{currentT.add}</button>
            </div>
          </div>
        </div>
      )}


      {/* SALE SUMMARY MODAL */}
      {saleSummary && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10005, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div className="modal-content" style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0, color: saleSummary.isDebt ? '#d97706' : '#10b981', fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>
              {saleSummary.isCashless ? 'Sale Recorded! ✅' : saleSummary.isDebt ? 'Partial Payment Logged ⏳' : 'Sale Complete! ✅'}
            </h2>
              
            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', margin: '20px 0', border: '1px solid #e2e8f0' }}>
              {saleSummary.isCashless ? (
                <>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>Items Description Formula</div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
                    {saleSummary.items?.map((item: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#334155' }}>
                        <span>{item.custom_name}</span>
                        <span style={{ fontWeight: 'bold' }}>x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '16px', marginTop: '16px', fontSize: '16px' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Total Sale:</span>
                    <span style={{ color: saleSummary.total < 0 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{formatRielFromNative(saleSummary.total)}</span>
                  </div>
                </>
              ) : (
                <>
                  {saleSummary.change > 0 && (
                    <>
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>Change Due</div>
                      <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ef4444', marginBottom: '16px', textAlign: 'center' }}>{formatRielFromNative(saleSummary.change)}</div>
                    </>
                  )}

                  {saleSummary.isDebt && (
                    <>
                      <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 'bold', textAlign: 'center' }}>Remaining Debt</div>
                      <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#d97706', marginBottom: '16px', textAlign: 'center' }}>{formatRielFromNative(saleSummary.total - saleSummary.totalReceivedInRiel)}</div>
                    </>
                  )}
                    
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '16px', fontSize: '14px' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Total Due:</span>
                    <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{formatRielFromNative(saleSummary.total)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '14px' }}>
                    <span style={{ color: '#64748b', fontWeight: 'bold' }}>Total Received:</span>
                    <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{formatRielFromNative(saleSummary.totalReceivedInRiel)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    <span>↳ Cash:</span>
                    <span>{formatRielFromNative(saleSummary.receivedRiel)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    <span>↳ QR:</span>
                    <span>{formatRielFromNative(saleSummary.receivedUsd)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { setSaleSummary(null); setCompletedSale(null); setPreviewImageUrl(null); setShowInvoicePreview(false); }} style={{ width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
                 ❌ Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL INVISIBLE DOM CAPTURE AREA - Positioned fixed to viewport to guarantee mobile HTML-to-Image rendering! */}
      {completedSale && showInvoicePreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -100, opacity: 0.01, pointerEvents: 'none' }}>
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

      {/* RENDERED INVOICE PREVIEW MODAL */}
      {showInvoicePreview && completedSale && (
        <div className="invoice-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10006, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          <div className="invoice-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '16px', padding: '0 20px' }}>
            <button onClick={() => { setShowInvoicePreview(false); setCompletedSale(null); setPreviewImageUrl(null); }} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>{currentT.close}</button>
            
            <div className="desktop-controls" style={{ display: 'none', gap: '10px' }}>
              <button onClick={handleDesktopDownloadPNG} disabled={!previewImageUrl} style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>{currentT.openInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ Print / PDF</button>
            </div>

            <div className="mobile-controls" style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleMobileShare} disabled={!previewImageUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>{currentT.shareInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ Print</button>
            </div>
          </div>

          <div className="invoice-preview-container" style={{ width: '100%', maxWidth: '850px', padding: '0 10px', display: 'flex', justifyContent: 'center' }}>
            {isGeneratingPreview || !previewImageUrl ? (
              <div style={{ padding: '40px', backgroundColor: '#fff', borderRadius: '8px', color: '#4a3b1b', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>⏳</span> Generating High-Resolution Invoice...
              </div>
            ) : (
              <img src={previewImageUrl} alt="Invoice Preview" style={{ width: '100%', maxWidth: '794px', borderRadius: '4px', objectFit: 'contain', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .main-wrapper { 
          padding: 24px 24px 24px 75px; 
          background: #f8fafc; 
          min-height: 100vh; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
        }
        .header-container { 
          margin-bottom: 24px; 
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
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
            padding: max(80px, env(safe-area-inset-top, 80px)) 16px 16px 16px !important; 
            min-height: auto;
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
        }
      `}} />
    </div>
  )
}