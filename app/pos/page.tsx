'use client'

import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import * as htmlToImage from 'html-to-image'

// --- TYPES & INTERFACES ---
interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
  linked_wholesale_id?: number | null
  min_stock_level?: number
  is_archived?: boolean
  bags_needed?: number
}

interface InventoryBatch {
  id: number
  product_id: number
  cost_price: number
  remaining_qty: number
  created_at?: string
}

interface Customer {
  id: number
  name: string
  phone?: string
  location?: string
  owner?: string
  type?: string
}

interface CartItem extends Product {
  product_id: number
  quantity: number | ''
  custom_name: string
  custom_price_riel: number | ''
  isSpecial?: boolean
  isReturnFullBag?: boolean
  bypass_stock?: boolean
  add_loose_kg?: number
  loose_retail_id?: number | null
  sortOrder?: number
  selected_batch_id?: number | null
  db_row_id?: number
}

// ==========================================
// SAFARI IOS IMAGE FIX
// ==========================================
const LOGO_LEFT_SRC = "/logo-left.png";
const LOGO_RIGHT_SRC = "/logo-right.png";
const WATERMARK_SRC = "/watermark.png";

const fetchImageAsBase64 = async (path: string): Promise<string> => {
  try {
    const absoluteUrl = new URL(path, window.location.origin).href;
    const res = await fetch(absoluteUrl);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    console.warn(`Base64 conversion failed for ${path}, using raw URL`);
    return path; 
  }
};

const EXCHANGE_RATE = 4000;
const RICE_CATEGORIES = ['🔥 Hot', 'All', 'មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប', 'ផ្សេងៗ', '❌ Out of Stock'];
const MAIN_KEYWORDS = ['មិញ', 'ខុន', 'ខ្ញី', 'ម្លិះ', 'រំដួល', 'បីកំណាត់', 'ដំណើប', 'សម្រូប'];

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;
const formatUSD = (amount: number) => `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

const t: Record<'en' | 'kh', any> = {
  en: {
    title: "Point of Sale",
    retail: "🛍️ Retail (1kg)",
    wholesale: "🌾 Wholesale (50kg)",
    searchPlaceholder: "🔍 Search products...",
    selectCustomer: "🔍 Search Customer...",
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

function CurrencyInput({ value, onChange, placeholder, style, autoFocus, className, onFocus }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === undefined) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== Number(value)) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value)));
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
      style={{ ...style, color: '#334155' }}
      className={className || "mobile-input-field"}
    />
  )
}

function CartInput({ value, onChange, isQty, fontSize = '14px', onFocus }: { value: number | '', onChange: (val: number | '') => void, isQty: boolean, fontSize?: string, onFocus?: () => void }) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === undefined) {
      setInputValue('');
    } else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== Number(value)) {
        setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value)));
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
      value={inputValue}
      onChange={handleChange}
      onFocus={onFocus}
      style={{ 
        width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', 
        fontSize: fontSize, fontWeight: 'normal', color: '#334155', backgroundColor: '#ffffff', outline: 'none', textAlign: 'center'
      }}
      className="mobile-input-field"
    />
  )
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [productOrder, setProductOrder] = useState<number[]>([])
  const [activeBatches, setActiveBatches] = useState<Record<number, InventoryBatch[]>>({})
  const [mtdSalesStats, setMtdSalesStats] = useState<Record<number, number>>({})
  
  // 🟢 Active vs Non-Active Retail Tab States
  const [retailSubTab, setRetailSubTab] = useState<'active' | 'inactive'>('active')
  const [hiddenRetailIds, setHiddenRetailIds] = useState<number[]>([])

  const [invoiceImages, setInvoiceImages] = useState({ left: LOGO_LEFT_SRC, right: LOGO_RIGHT_SRC, watermark: WATERMARK_SRC });

  const [lang] = useState<'en' | 'kh'>('en')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'retail' | 'wholesale'>('retail')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [, setIsDeviceMobile] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false) 

  const [cartCustomerNameOverride, setCartCustomerNameOverride] = useState('')

  const [paymentRows, setPaymentRows] = useState<{id: number, method: string, amount: number | '', isAuto?: boolean}[]>([
    { id: Date.now(), method: 'Cash ៛', amount: '', isAuto: true }
  ]);

  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', location: '', owner: '', type: '' })

  const [selectedMobileProduct, setSelectedMobileProduct] = useState<any>(null)
  const [mobilePrice, setMobilePrice] = useState<number | ''>('')
  const [mobileQty, setMobileQty] = useState<number | ''>('')
  const [mobileName, setMobileName] = useState<string>('')

  const [exchangeModal, setExchangeModal] = useState<{ isOpen: boolean, product: Product | null, consumedKg: string | number }>({
    isOpen: false, product: null, consumedKg: ''
  })
  
  const [autoOpenModal, setAutoOpenModal] = useState<{ isOpen: boolean, items: (Product & { bags_needed: number })[] }>({ isOpen: false, items: [] });

  const [saleSummary, setSaleSummary] = useState<{ total: number, receivedRiel: number, receivedUsd: number, totalReceivedInRiel: number, change: number, type?: 'retail' | 'wholesale', isCashless?: boolean, items?: any[], isDebt?: boolean } | null>(null)
  const [showInvoicePreview, setShowInvoicePreview] = useState(false)
  const [completedSale, setCompletedSale] = useState<any>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  
  const invoiceRef = useRef<HTMLDivElement>(null)

  const totalRiel = cart.reduce((sum, item) => {
    const isReturn = item.custom_name.includes('ដូរ');
    const price = Number(item.custom_price_riel) || 0;
    const qty = Number(item.quantity) || 0;
    const itemTotal = price * qty;
    return isReturn ? sum - Math.abs(itemTotal) : sum + itemTotal;
  }, 0);

  const totalUSD = totalRiel / EXCHANGE_RATE; 

  const isCartValid = cart.length > 0 && cart.every(item => 
    item.quantity !== '' && Number(item.quantity) > 0 && 
    item.custom_price_riel !== '' && Number(item.custom_price_riel) >= 0
  );

  useEffect(() => {
    const loadImages = async () => {
      const leftB64 = await fetchImageAsBase64(LOGO_LEFT_SRC);
      const rightB64 = await fetchImageAsBase64(LOGO_RIGHT_SRC);
      const waterB64 = await fetchImageAsBase64(WATERMARK_SRC);
      setInvoiceImages({ left: leftB64, right: rightB64, watermark: waterB64 });
    };
    loadImages();
  }, []);

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

  useEffect(() => {
    if (saleSummary) {
      const timer = setTimeout(() => {
        setSaleSummary(null);
        setCompletedSale(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [saleSummary]);

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
        await loadMtdSales()

        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
          setEditingInvoiceId(editId);
          setActiveTab('wholesale'); 
          
          const { data: saleRows } = await supabase.from('sales').select('*').eq('invoice_id', editId);
          if (saleRows && saleRows.length > 0) {
            const rebuiltCart = saleRows.map((row: any) => {
              const isSpecialRow = (row.custom_rice_type || row.rice_type).includes('ដូរ') || (row.custom_rice_type || row.rice_type).includes('បានប្រើ');
              let sortOrder = 0;
              if ((row.custom_rice_type || row.rice_type).includes('ដូរ')) sortOrder = 1;
              if ((row.custom_rice_type || row.rice_type).includes('បានប្រើ')) sortOrder = 2;

              return {
                id: row.id,
                db_row_id: row.id,
                product_id: row.product_id, 
                name: row.rice_type, 
                custom_name: row.custom_rice_type || row.rice_type, 
                custom_price_riel: Number(row.price_per_bag || 0),
                quantity: Number(row.qty),
                cost_price: Number(row.cogs_price || 0),
                stock: 0, 
                price: Number(row.price_per_bag || 0),
                weight: 50,
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

    const posProductsChannel = supabase.channel('pos-products-update')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadProductsAndSettings())
      .subscribe();

    const posBatchesChannel = supabase.channel('pos-batches-update')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, () => loadBatches())
      .subscribe();

    return () => {
      window.removeEventListener('resize', checkDeviceType);
      supabase.removeChannel(posProductsChannel);
      supabase.removeChannel(posBatchesChannel);
    };
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
    const handleVisibilityAndResize = () => {
      if (document.visibilityState === 'visible') {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        document.body.style.transform = 'scale(1)';
      }
    };

    window.addEventListener('resize', handleVisibilityAndResize);
    window.addEventListener('visibilitychange', handleVisibilityAndResize);
    window.addEventListener('orientationchange', handleVisibilityAndResize);
    window.addEventListener('pageshow', handleVisibilityAndResize);
    
    handleVisibilityAndResize();

    return () => {
      window.removeEventListener('resize', handleVisibilityAndResize);
      window.removeEventListener('visibilitychange', handleVisibilityAndResize);
      window.removeEventListener('orientationchange', handleVisibilityAndResize);
      window.removeEventListener('pageshow', handleVisibilityAndResize);
    };
  }, []);

  useEffect(() => {
    if (completedSale && invoiceRef.current && !previewImageUrl && showInvoicePreview) {
      const nodeToCapture = invoiceRef.current;

      const timer = setTimeout(async () => {
        if (!nodeToCapture) return;

        try {
          await document.fonts.ready;
          await new Promise(r => setTimeout(r, 800));

          const isMobile = window.innerWidth < 1024;
          
          if (isMobile) {
            await htmlToImage.toPng(nodeToCapture, { 
              pixelRatio: 1, 
              backgroundColor: '#ffffff', 
              skipAutoScale: true, 
              cacheBust: true 
            });
          }
          
          const dataUrl = await htmlToImage.toPng(nodeToCapture, { 
            pixelRatio: 3, 
            backgroundColor: '#ffffff',
            skipAutoScale: true,
            cacheBust: true
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

    const { data: hiddenSet } = await supabase.from('app_settings').select('*').eq('setting_key', 'hidden_retail_ids').single()
    if (hiddenSet && hiddenSet.setting_value) setHiddenRetailIds(hiddenSet.setting_value)
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers(data || [])
  }

  async function loadBatches() {
    const { data } = await supabase.from('inventory_batches').select('*').order('created_at', { ascending: true });
    if (data) {
      const batchMap: Record<number, InventoryBatch[]> = {};
      data.forEach((b: any) => {
        const remaining = b.remaining_qty || 0;
        if (remaining > 0) {
          if (!batchMap[b.product_id]) batchMap[b.product_id] = [];
          batchMap[b.product_id].push(b);
        }
      });
      setActiveBatches(batchMap);
    }
  }

  async function loadMtdSales() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const { data } = await supabase.from('sales').select('product_id, qty').gte('created_at', firstDay);
    if (data) {
      const stats: Record<number, number> = {};
      data.forEach((s: any) => {
        stats[s.product_id] = (stats[s.product_id] || 0) + Number(s.qty);
      });
      setMtdSalesStats(stats);
    }
  }

  const formatRielSymbol = (amountInRiel: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amountInRiel))} ៛`;
  const formatRielFromNative = (rielAmount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(rielAmount))} ៛`;

  // 🟢 Move Retail Rice Cards between Active and Non-Active Tabs
  const toggleProductActiveStatus = async (productId: number, targetStatus: 'active' | 'inactive') => {
    let newHidden: number[];
    if (targetStatus === 'inactive') {
      newHidden = Array.from(new Set([...hiddenRetailIds, productId]));
    } else {
      newHidden = hiddenRetailIds.filter(id => id !== productId);
    }
    setHiddenRetailIds(newHidden);
    await supabase.from('app_settings').upsert(
      { setting_key: 'hidden_retail_ids', setting_value: newHidden },
      { onConflict: 'setting_key' }
    );
  }

  function handleProductClick(product: Product) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    const defaultQty = 1; 
    if (isMobile) {
      setSelectedMobileProduct(product);
      setMobileName(product.name);
      setMobilePrice(activeTab === 'wholesale' ? 0 : Number(product.price));
      setMobileQty(defaultQty);
    } else {
      addToCartDirect(product, defaultQty);
    }
  }

  function addToCartDirect(product: Product, qtyToAdd: number | '' = 1) {
    const existing = cart.find((item) => item.product_id === product.id && !item.isSpecial)
    const priceInRiel = activeTab === 'wholesale' ? 0 : Number(product.price); 
    if (existing) {
      setCart(cart.map((item) => item.product_id === product.id && !item.isSpecial ? { ...item, quantity: (Number(item.quantity) || 0) + (Number(qtyToAdd) || 0) } : item))
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
    
    if (finalQty <= 0) return alert("Please enter a valid quantity.");

    const existing = cart.find((item) => item.product_id === selectedMobileProduct.id && !item.isSpecial);
    if (existing) {
      setCart(cart.map((item) => item.product_id === selectedMobileProduct.id && !item.isSpecial ? { 
        ...item, custom_name: mobileName, custom_price_riel: finalPrice, quantity: (Number(item.quantity) || 0) + finalQty 
      } : item));
    } else {
      setCart([...cart, { 
        ...selectedMobileProduct, product_id: selectedMobileProduct.id, id: Math.random(), custom_name: mobileName, custom_price_riel: finalPrice, 
        cost_price: Number(selectedMobileProduct.cost_price || 0), quantity: finalQty, isSpecial: false, selected_batch_id: null, sortOrder: 0
      }]);
    }
    setSelectedMobileProduct(null);
  }

  // 🔥 CORE FIX: Reverted to 2-Row UI (ដូរ and បានប្រើ) but keeps the Retail Restock Magic!
  async function handleConfirmExchange() {
    if (!exchangeModal.product) return;
    const prod = exchangeModal.product;
    const consumedKg = Number(exchangeModal.consumedKg) || 0;
    let linkedRetail = products.find(p => p.linked_wholesale_id === prod.id);

    if (consumedKg >= 50) {
       return alert("Consumed amount cannot be 50kg or more for a single bag return.");
    }

    setIsProcessing(true);

    try {
      if (consumedKg > 0 && !linkedRetail) {
         // Auto-Create Missing Retail 1kg Rice for this Wholesale Bag!
         const newRetailName = prod.name; // <--- 🔥 FIX: Removed (សល់/Loose)
         const perKgPrice = Math.round(Number(prod.price || 0) / 50);
         const perKgCogs = Math.round(Number(prod.cost_price || 0) / 50);

         const { data: newProd, error } = await supabase.from('products').insert([{
           name: newRetailName,
           price: perKgPrice,
           cost_price: perKgCogs,
           weight: 1,
           stock: 0,
           min_stock_level: 10,
           linked_wholesale_id: prod.id,
           is_archived: false
         }]).select().single();

         if (error) throw new Error("Failed to auto-create retail product: " + error.message);
         
         linkedRetail = newProd as Product;
         setProducts(prev => [...prev, newProd]);

         // Auto-drop the new 1kg retail product into Non-Active tab so it doesn't clutter main screen!
         const newHidden = Array.from(new Set([...hiddenRetailIds, newProd.id]));
         setHiddenRetailIds(newHidden);
         await supabase.from('app_settings').upsert(
           { setting_key: 'hidden_retail_ids', setting_value: newHidden },
           { onConflict: 'setting_key' }
         );
      }

      const newItems: any[] = [];

      if (consumedKg === 0) {
        // 100% Bag returned (0kg consumed) - Returns 1 Wholesale Bag
        newItems.push({
          ...prod, product_id: prod.id, id: Math.random(), custom_name: `ដូរ ${prod.name}`, custom_price_riel: prod.price,
          cost_price: Number(prod.cost_price || 0), quantity: 1, isSpecial: true, isReturnFullBag: true, bypass_stock: false, sortOrder: 1
        });
      } else {
        // Partial Return 
        const returnedKg = 50 - consumedKg;
        const perKgPrice = Math.round(Number(prod.price || 0) / 50);
        const perKgCogs = Math.round(Number(prod.cost_price || 0) / 50);

        // Row 1: Full Bag Refund (UI Shows full bag returned. Backend adds remainder to retail bin)
        newItems.push({
          ...prod, 
          id: Math.random(), 
          product_id: prod.id, 
          custom_name: `ដូរ ${prod.name}`, 
          custom_price_riel: prod.price,
          cost_price: Number(prod.cost_price || 0), 
          quantity: 1, 
          isSpecial: true, 
          bypass_stock: true, // Skips wholesale stock math so it doesn't give a full bag back!
          add_loose_kg: returnedKg, // Tells checkout to add the leftovers (+40kg) to Retail stock!
          loose_retail_id: linkedRetail?.id, 
          sortOrder: 1
        });

        // Row 2: Charge for consumed Kg
        newItems.push({
          ...(linkedRetail || prod), 
          id: Math.random(), 
          product_id: linkedRetail ? linkedRetail.id : prod.id, 
          custom_name: `បានប្រើ ${prod.name}`, 
          custom_price_riel: perKgPrice,
          cost_price: perKgCogs, 
          quantity: consumedKg, 
          isSpecial: true, 
          bypass_stock: true, 
          sortOrder: 2
        });
      }

      setCart([...cart, ...newItems]);
      setExchangeModal({ isOpen: false, product: null, consumedKg: '' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  function updateCartItem(id: number, field: string, value: any) {
    let updatedCart = cart.map((item) => item.id === id ? { ...item, [field]: value } : item);

    if (field === 'custom_price_riel') {
      const editedItem = updatedCart.find(i => i.id === id);
      if (editedItem && editedItem.custom_name.startsWith('ដូរ ')) {
        const baseName = editedItem.custom_name.replace('ដូរ ', '');
        const consumedName = `បានប្រើ ${baseName}`;
        const newPerKgPrice = Math.round(Number(value) / 50) || 0;

        updatedCart = updatedCart.map(item => {
          // 🔥 FIX: Removed product_id matching because the consumed item uses the Retail ID, 
          // while the returned bag uses the Wholesale ID. Matching perfectly by name instead!
          if (item.custom_name === consumedName) {
            return { ...item, custom_price_riel: newPerKgPrice };
          }
          return item;
        });
      }
    }

    setCart(updatedCart);
  }

  function removeFromCart(id: number) {
    setCart(cart.filter(item => item.id !== id))
  }

  const handleProductDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.setData('product_id', String(id));
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
    let remainingQtyToFulfill = qtySold;
    const splits: any[] = [];
    const { data: batches } = await supabase.from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('remaining_qty', 0)
      .order('created_at', { ascending: true });
      
    const availableBatches = batches || [];

    for (const batch of availableBatches) {
      if (remainingQtyToFulfill <= 0) break;
      const availableInBatch = batch.remaining_qty || 0;
      const qtyTaken = Math.min(availableInBatch, remainingQtyToFulfill);
      splits.push({ qty: qtyTaken, cogs_price: batch.cost_price, batch_id: batch.id, current_remaining: availableInBatch });
      remainingQtyToFulfill -= qtyTaken;
    }
    if (remainingQtyToFulfill > 0) splits.push({ qty: remainingQtyToFulfill, cogs_price: fallbackCogs, batch_id: null, current_remaining: 0 });
    return splits;
  }

  function cancelEditMode() {
    setEditingInvoiceId(null);
    setCart([]);
    setSelectedCustomerId('');
    setCartCustomerNameOverride('');
    setPaymentRows([{ id: Date.now(), method: 'Cash ៛', amount: '', isAuto: true }]);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // 🔥 CHECKOUT INTERCEPTOR: Warns if Retail Stock < 0 before finishing checkout
  async function initiateCheckout() {
    if (!isCartValid) return alert("Please ensure all items have a valid quantity and price.");
    if (activeTab === 'wholesale' && !selectedCustomerId) return alert(lang === 'kh' ? 'សូមជ្រើសរើសអតិថិជនសម្រាប់ដុំ!' : 'Please select a customer for wholesale');
    if (showPaymentSelector && liveTotalReceivedInRiel < totalRiel && !editingInvoiceId) return alert("Amount received must be equal to or greater than the total due.");

    const simulatedStockUpdates: Record<number, number> = {};
    
    for (const item of cart) {
         const isReturn = item.custom_name.includes('ដូរ');
         const isCharge = item.custom_name.includes('បានប្រើ');
         const isBypass = item.bypass_stock || isCharge;
         const finalQty = isReturn ? -Math.abs(Number(item.quantity)) : Number(item.quantity);
         
         if (!editingInvoiceId && !isBypass) {
             simulatedStockUpdates[item.product_id] = (simulatedStockUpdates[item.product_id] ?? products.find(p=>p.id===item.product_id)?.stock ?? 0) - finalQty;
         }
         if (item.add_loose_kg && item.loose_retail_id && !editingInvoiceId) {
             simulatedStockUpdates[item.loose_retail_id] = (simulatedStockUpdates[item.loose_retail_id] ?? products.find(p=>p.id===item.loose_retail_id)?.stock ?? 0) + item.add_loose_kg;
         }
    }

    const itemsNeedingBags: (Product & { bags_needed: number })[] = [];
    for (const [prodId, finalStock] of Object.entries(simulatedStockUpdates)) {
        if (finalStock < 0) {
            const p = products.find(x => x.id === Number(prodId));
            if (p && p.weight < 50 && p.linked_wholesale_id) {
                const bagsNeeded = Math.ceil(Math.abs(finalStock) / 50);
                itemsNeedingBags.push({ ...p, bags_needed: bagsNeeded });
            } else if (p && p.weight < 50 && !p.linked_wholesale_id) {
                return alert(`Not enough stock for ${p.name} and no linked wholesale bag to open!`);
            } else if (p && p.weight >= 50) {
                return alert(`Not enough stock for wholesale bag ${p.name}!`);
            }
        }
    }

    if (itemsNeedingBags.length > 0) {
        for (const p of itemsNeedingBags) {
            const wProd = products.find(w => w.id === p.linked_wholesale_id);
            if (!wProd || wProd.stock < p.bags_needed) {
                return alert(`Cannot open a bag for ${p.name} because its wholesale bag (${wProd?.name || 'Unknown'}) is out of stock!`);
            }
        }
        setAutoOpenModal({ isOpen: true, items: itemsNeedingBags });
        return;
    }

    executeCheckout(products);
  }

  async function handleConfirmAutoOpen() {
    setIsProcessing(true);
    try {
        for (const p of autoOpenModal.items) {
            const wholesaleProd = products.find(w => w.id === p.linked_wholesale_id);
            if (wholesaleProd && wholesaleProd.stock >= p.bags_needed) {
                const { error } = await supabase.rpc('pull_wholesale_bags', {
                    p_retail_id: p.id,
                    p_wholesale_id: wholesaleProd.id,
                    p_bags_needed: p.bags_needed
                });
                if (error) throw error;
            }
        }
        
        setAutoOpenModal({ isOpen: false, items: [] });
        
        const { data: prodData } = await supabase.from('products').select('*').eq('is_archived', false).order('id', { ascending: true });
        if (prodData) {
            setProducts(prodData);
            await loadBatches(); 
            await executeCheckout(prodData);
        }
    } catch (err: any) {
        alert('Auto-Open Failed: ' + err.message);
        setIsProcessing(false);
    }
  }

  // MAIN CHECKOUT ENGINE
  async function executeCheckout(latestProducts: Product[]) {
    setIsProcessing(true);

    try {
      const currentCart = [...cart];
      const currentTotalRiel = totalRiel;
      
      const finalCustomerName = cartCustomerNameOverride.trim() || 'Walk-in';
      const finalOwner = selectedCustomer?.owner || null; 
      const finalLocation = selectedCustomer?.location || '';
      const finalPhone = selectedCustomer?.phone || '';

      const activePayments = showPaymentSelector ? paymentRows.filter(r => (Number(r.amount) || 0) > 0) : [];
      const actualTotalReceived = showPaymentSelector ? liveTotalReceivedInRiel : 0;
      const actualRemaining = currentTotalRiel - actualTotalReceived;

      let effectiveSplits: { method: string, amount_usd: number, amount_riel: number, face_amount: number }[] = [];

      if (activePayments.length === 0) {
        if (!isSimpleCustomer) {
          effectiveSplits.push({ method: 'Unpaid / Debt', amount_usd: 0, amount_riel: currentTotalRiel, face_amount: currentTotalRiel });
        } else {
          effectiveSplits.push({ method: 'Cash ៛', amount_usd: 0, amount_riel: currentTotalRiel, face_amount: currentTotalRiel });
        }
      } else {
        activePayments.forEach(p => {
            let amtFace = Number(p.amount);
            if (p.method.includes('$')) {
               effectiveSplits.push({ method: p.method, amount_usd: amtFace, amount_riel: 0, face_amount: amtFace });
            } else {
               effectiveSplits.push({ method: p.method, amount_usd: 0, amount_riel: amtFace, face_amount: amtFace });
            }
        });

        if (actualRemaining > 0 && !isSimpleCustomer) {
            effectiveSplits.push({ method: 'Unpaid / Debt', amount_usd: 0, amount_riel: actualRemaining, face_amount: actualRemaining });
        }

        if (actualRemaining < 0) {
           const changeAmountRiel = Math.abs(actualRemaining);
           effectiveSplits.push({ method: 'Cash ៛', amount_usd: 0, amount_riel: -changeAmountRiel, face_amount: -changeAmountRiel });
        }
      }

      const activeTxId = activeTab === 'retail' 
          ? `RET-${Date.now().toString().slice(-6)}` 
          : (editingInvoiceId ? editingInvoiceId : `INV-${Date.now().toString().slice(-6)}`);

      let primaryMethodStr = effectiveSplits.map(s => {
        if (s.method === 'Unpaid / Debt') return s.method;
        return `${s.method}: ${s.face_amount}`;
      }).join(', ');

      if (activeTab === 'retail') {
        const retailRows = [];
        const stockUpdates: Record<number, number> = {};

        for (const item of currentCart) {
           const dbProduct = latestProducts.find(p => p.id === item.product_id);
           let retailCogsPerKg = Number(item.cost_price || 0);

           if (dbProduct && dbProduct.linked_wholesale_id) {
              const wholesaleProd = latestProducts.find(wp => wp.id === dbProduct.linked_wholesale_id);
              if (wholesaleProd) {
                 const wBatches = activeBatches[wholesaleProd.id] || [];
                 const currentBatch = wBatches.length > 0 ? [...wBatches].sort((a,b) => a.id - b.id)[0] : null;
                 const wholesaleBagCogs = currentBatch ? Number(currentBatch.cost_price) : Number(wholesaleProd.cost_price || 0);
                 const wholesaleWeight = Number(wholesaleProd.weight) || 50;
                 
                 retailCogsPerKg = wholesaleBagCogs / wholesaleWeight;
              }
           }

           retailRows.push({
             transaction_id: activeTxId,
             rice_type: item.name,
             custom_rice_type: item.custom_name !== item.name ? item.custom_name : null,
             qty: item.quantity,
             price_per_bag: item.custom_price_riel,
             cogs_price: retailCogsPerKg,
             payment_method: primaryMethodStr
           });
           
           stockUpdates[item.product_id] = (stockUpdates[item.product_id] ?? latestProducts.find(p=>p.id === item.product_id)?.stock ?? 0) - Number(item.quantity);
        }

        const { error: retailErr } = await supabase.from('retail_sales').insert(retailRows);
        if (retailErr) throw new Error(`Retail Error: ${retailErr.message}`);

        for (const [prodIdStr, newStock] of Object.entries(stockUpdates)) {
            await supabase.from('products').update({ stock: newStock }).eq('id', Number(prodIdStr));
        }

      } else {
        const combinedRiceTypes = currentCart.map(item => `${item.custom_name} (x${item.quantity})`).join(', ');
        const baseSaleRows: any[] = [];
        const stockUpdates: Record<number, number> = {}; 
        const fifoUpdates: Record<number, number> = {}; 

        for (const item of currentCart) {
          const isReturn = item.custom_name.includes('ដូរ');
          const isCharge = item.custom_name.includes('បានប្រើ');
          const isBypass = item.bypass_stock || isCharge;
          const finalQty = isReturn ? -Math.abs(Number(item.quantity)) : Number(item.quantity);

          // Full Wholesale Bag Refund (+1 active batch)
          if (item.isReturnFullBag && !editingInvoiceId) {
             const wBatches = activeBatches[item.product_id] || [];
             if (wBatches.length > 0) {
                 const latestBatch = [...wBatches].sort((a,b) => b.id - a.id)[0];
                 fifoUpdates[latestBatch.id] = (fifoUpdates[latestBatch.id] !== undefined ? fifoUpdates[latestBatch.id] : latestBatch.remaining_qty) + 1;
             } else {
                 const returnedProd = latestProducts.find(p => p.id === item.product_id);
                 await supabase.from('inventory_batches').insert([{
                     product_id: item.product_id,
                     cost_price: returnedProd ? returnedProd.cost_price : item.cost_price,
                     remaining_qty: 1
                 }]);
             }
          }

          // Partial Return - Add to Loose Retail Bin (+40kg etc)
          if (item.add_loose_kg && item.loose_retail_id && !editingInvoiceId) {
             stockUpdates[item.loose_retail_id] = (stockUpdates[item.loose_retail_id] ?? latestProducts.find(p => p.id === item.loose_retail_id)?.stock ?? 0) + item.add_loose_kg;
          }
          
          if (isReturn || isBypass || editingInvoiceId) {
            const newRow: any = {
              product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: item.cost_price || 0, owner: finalOwner
            };
            if (item.db_row_id) newRow.id = item.db_row_id;
            baseSaleRows.push(newRow);
          } else if (item.selected_batch_id) {
            const specificBatch = activeBatches[item.product_id]?.find(b => b.id === item.selected_batch_id);
            baseSaleRows.push({
              product_id: item.product_id, customer_name: finalCustomerName, rice_type: item.name,
              custom_rice_type: item.custom_name !== item.name ? item.custom_name : null, qty: finalQty, price_per_bag: item.custom_price_riel,
              cogs_price: specificBatch ? specificBatch.cost_price : (item.cost_price || 0), owner: finalOwner
            });
            if (specificBatch) {
                fifoUpdates[specificBatch.id] = (fifoUpdates[specificBatch.id] !== undefined ? fifoUpdates[specificBatch.id] : specificBatch.remaining_qty) - finalQty;
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
                fifoUpdates[split.batch_id] = (fifoUpdates[split.batch_id] !== undefined ? fifoUpdates[split.batch_id] : split.current_remaining) - split.qty;
              }
            }
          }

          // Normal Sales Deduction
          if (!editingInvoiceId && !isBypass && !item.isReturnFullBag) {
            stockUpdates[item.product_id] = (stockUpdates[item.product_id] ?? latestProducts.find(p => p.id === item.product_id)?.stock ?? 0) - finalQty;
          }
        }

        if (editingInvoiceId) {
          const { data: existingSales } = await supabase.from('sales').select('id').eq('invoice_id', editingInvoiceId);
          if (existingSales) {
            const cartIds = currentCart.map(c => c.db_row_id).filter(Boolean);
            const idsToDelete = existingSales.map(s => s.id).filter(id => !cartIds.includes(id));
            if (idsToDelete.length > 0) {
              await supabase.from('sales').delete().in('id', idsToDelete);
            }
          }
          await supabase.from('invoice_payments').delete().eq('invoice_id', editingInvoiceId);
        }

        const finalSaleRows = baseSaleRows.map(r => ({ ...r, invoice_id: activeTxId, payment_method: primaryMethodStr }));
        let splitCogsSum = baseSaleRows.reduce((sum, r) => sum + (r.cogs_price * r.qty), 0);

        const summaryRow = {
          invoice_id: activeTxId,
          customer_name: finalCustomerName,
          owner: finalOwner,
          rice_types: combinedRiceTypes,
          total_sales: currentTotalRiel,
          total_cogs: splitCogsSum,
          total_profit: currentTotalRiel - splitCogsSum,
          delivery_status: actualRemaining > 0 ? 'Pending' : 'Delivered',
          payment_method: primaryMethodStr,
          balance_due: actualRemaining > 0 ? actualRemaining : 0,
          customer_location: finalLocation,
          is_done: actualRemaining <= 0 
        };

        const { error: summaryErr } = await supabase.from('invoice_summaries').upsert([summaryRow], { onConflict: 'invoice_id' });
        if (summaryErr) throw new Error(`Failed to save to Summaries table: ${summaryErr.message}`);

        const { error: salesErr } = await supabase.from('sales').upsert(finalSaleRows, { onConflict: 'id' });
        if (salesErr) throw new Error(`Failed to save to Sales table: ${salesErr.message}`);

        for (const [prodIdStr, newStock] of Object.entries(stockUpdates)) {
           await supabase.from('products').update({ stock: newStock }).eq('id', Number(prodIdStr));
        }
        for (const [batchIdStr, newRemaining] of Object.entries(fifoUpdates)) {
           await supabase.from('inventory_batches').update({ remaining_qty: newRemaining }).eq('id', Number(batchIdStr));
        }
      }

      if (showPaymentSelector || !isSimpleCustomer) {
         for (const split of effectiveSplits) {
            if (split.method === 'Unpaid / Debt') continue;
            await supabase.from('invoice_payments').insert([{
              invoice_id: activeTxId,
              amount_paid_usd: split.amount_usd, 
              amount_paid_riel: split.amount_riel, 
              payment_method: split.method,
              recorded_by: finalOwner || 'System'
            }]);
         }
      }

      const currentDate = new Date();
      setCompletedSale({
        invoiceNo: activeTxId, 
        cartSnapshot: currentCart, 
        customer: { name: finalCustomerName, phone: finalPhone, location: finalLocation },
        dateObj: { day: String(currentDate.getDate()).padStart(2, '0'), month: String(currentDate.getMonth() + 1).padStart(2, '0'), year: currentDate.getFullYear() },
        changeDue: actualRemaining < 0 ? Math.abs(actualRemaining) : 0,
        amountReceived: actualTotalReceived
      });

      if (activeTab === 'wholesale' && !isSimpleCustomer) {
        setIsGeneratingPreview(true);
        setShowInvoicePreview(true);
        setSaleSummary(null);
      } else {
        setShowInvoicePreview(false);
        setSaleSummary({ 
          total: currentTotalRiel, 
          receivedRiel: 0, 
          receivedUsd: 0, 
          totalReceivedInRiel: actualTotalReceived,
          change: actualRemaining < 0 ? Math.abs(actualRemaining) : 0, 
          type: activeTab, 
          isCashless: actualTotalReceived === 0, 
          items: currentCart,
          isDebt: actualRemaining > 0 && !isSimpleCustomer
        });
      }

      setCart([]);
      setIsMobileCartOpen(false);
      setEditingInvoiceId(null);
      window.history.replaceState({}, document.title, window.location.pathname);
      loadProductsAndSettings();
      loadBatches();
      loadMtdSales();

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

  const orderedProducts = [...products].sort((a, b) => {
    const idxA = productOrder.indexOf(a.id);
    const idxB = productOrder.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return a.id - b.id;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  // 🟢 Filter items for Active and Non-Active Retail tabs
  const filteredProducts = orderedProducts.filter(p => {
    if (searchQuery && !p.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const weightVal = parseFloat(String(p.weight) || '0');
    if (activeTab === 'wholesale' && weightVal < 50) return false;
    if (activeTab === 'retail' && weightVal >= 50) return false;

    if (activeTab === 'retail') {
      const isHidden = hiddenRetailIds.includes(p.id);
      if (retailSubTab === 'active' && isHidden) return false;
      if (retailSubTab === 'inactive' && !isHidden) return false;
    }
    
    if (activeTab === 'wholesale') {
      if (activeCategory === '❌ Out of Stock') return Number(p.stock) <= 0;
      if (Number(p.stock) <= 0) return false; 
    }

    if (activeTab !== 'retail' && activeCategory !== 'All' && activeCategory !== '❌ Out of Stock') {
      if (activeCategory === '🔥 Hot') {
        const top10Ids = Object.entries(mtdSalesStats).sort(([,a], [,b]) => b - a).slice(0, 10).map(([id]) => Number(id));
        return top10Ids.includes(p.id);
      }
      
      const name = p.name || '';
      if (activeCategory === 'ផ្សេងៗ') {
        if (MAIN_KEYWORDS.some(kw => name.includes(kw))) return false;
      } else {
        if (!name.includes(activeCategory)) return false;
      }
    }
    return true;
  });

  if (activeCategory === '🔥 Hot' && activeTab === 'wholesale') {
    filteredProducts.sort((a, b) => (mtdSalesStats[b.id] || 0) - (mtdSalesStats[a.id] || 0));
  }

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

  const hasValidPayment = !showPaymentSelector || liveTotalReceivedInRiel >= totalRiel;

  const getCategorizedItemsForInvoice = (cartItems: any[]) => {
    let normalItems: any[] = [], specialItems: any[] = [], negativeItems: any[] = [], serviceItems: any[] = [];
    cartItems.forEach(item => {
      if (Number(item.custom_price_riel) === 0) return;

      const desc = item.custom_name;
      const total = item.custom_price_riel * item.quantity;
      if (desc.includes('សេវាឡាន (អតិថិជន)')) serviceItems.push({ ...item, total: total });
      else if (desc.includes('សេវាឡាន')) {  }
      else if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) negativeItems.push({ ...item, total: -Math.abs(total) });
      else if (desc.includes('ថ្លៃបាវ') || desc.includes('បានប្រើ')) specialItems.push({ ...item, total: total });
      else normalItems.push({ ...item, total: total });
    });
    return [...normalItems, ...specialItems, ...negativeItems, ...serviceItems];
  }

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
    <div className="pos-layout-wrapper" style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden', backgroundColor: '#ffffff', boxSizing: 'border-box' }}>
      
      {/* SELECTION ENGINE VIEW GRID PANEL */}
      <div className="pos-main-engine hide-scrollbar" style={{ flex: 1, height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        
        <div className="main-wrapper">
          <div className="header-container">
            <div className="header-left">
              <h1 className="page-title">{editingInvoiceId ? `✏️ Editing: ${editingInvoiceId}` : `🛒 ${currentT.title}`}</h1>
              {editingInvoiceId && (
                <button 
                  onClick={cancelEditMode} 
                  style={{ marginLeft: '16px', padding: '6px 12px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ❌ Cancel
                </button>
              )}
            </div>
          </div>

          <div className="pos-tools-area" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', width: '100%' }}>
              <button onClick={() => { 
                setActiveTab('retail'); 
                setSelectedCustomerId(''); 
                setCustomerSearchTerm(''); 
                loadProductsAndSettings();
                loadBatches();
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'retail' ? '#b58a3d' : '#fff', color: activeTab === 'retail' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'retail' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.retail}</button>
              
              <button onClick={() => { 
                setActiveTab('wholesale');
                if (!selectedCustomerId) {
                  const walkInCust = customers.find(c => c.name.toLowerCase() === 'walk-in' || c.name.toLowerCase() === 'walk in');
                  if (walkInCust) setSelectedCustomerId(walkInCust.id.toString());
                }
                loadProductsAndSettings();
                loadBatches();
              }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === 'wholesale' ? '#b58a3d' : '#fff', color: activeTab === 'wholesale' ? '#ffffff' : '#6b582f', borderBottom: activeTab === 'wholesale' ? 'none' : '1px solid #e2e8f0', minWidth: '120px' }}>{currentT.wholesale}</button>
            </div>

            {/* 🟢 Active vs Non-Active Drag-and-Drop Sub-tabs for Retail View */}
            {activeTab === 'retail' && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setRetailSubTab('active')} 
                  onDragOver={(e) => e.preventDefault()} 
                  onDrop={(e) => {
                    e.preventDefault();
                    const pid = Number(e.dataTransfer.getData('product_id'));
                    if (pid) toggleProductActiveStatus(pid, 'active');
                  }}
                  style={{ 
                    padding: '6px 16px', borderRadius: '20px', 
                    border: retailSubTab === 'active' ? 'none' : '1px solid #cbd5e1', 
                    backgroundColor: retailSubTab === 'active' ? '#10b981' : '#ffffff', 
                    color: retailSubTab === 'active' ? '#fff' : '#475569', 
                    fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' 
                  }}
                >
                  Active ({products.filter(p => parseFloat(String(p.weight)) < 50 && !hiddenRetailIds.includes(p.id)).length})
                </button>
                
                <button 
                  onClick={() => setRetailSubTab('inactive')} 
                  onDragOver={(e) => e.preventDefault()} 
                  onDrop={(e) => {
                    e.preventDefault();
                    const pid = Number(e.dataTransfer.getData('product_id'));
                    if (pid) toggleProductActiveStatus(pid, 'inactive');
                  }}
                  style={{ 
                    padding: '6px 16px', borderRadius: '20px', 
                    border: retailSubTab === 'inactive' ? 'none' : '1px solid #cbd5e1', 
                    backgroundColor: retailSubTab === 'inactive' ? '#ef4444' : '#ffffff', 
                    color: retailSubTab === 'inactive' ? '#fff' : '#475569', 
                    fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' 
                  }}
                >
                  Non-Active ({products.filter(p => parseFloat(String(p.weight)) < 50 && hiddenRetailIds.includes(p.id)).length})
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', width: '100%' }}>
              <input type="text" placeholder={currentT.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: '240px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '16px', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              
              {activeTab === 'wholesale' && (
                <div style={{ flex: 1, minWidth: '300px', position: 'relative', zIndex: isCustomerModalOpen ? 100 : 2 }}>
                  {!selectedCustomer ? (
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text"
                        placeholder={currentT.selectCustomer}
                        value={customerSearchTerm}
                        onChange={e => setCustomerSearchTerm(e.target.value)}
                        onFocus={() => setIsCustomerModalOpen(true)}
                        onBlur={() => setTimeout(() => setIsCustomerModalOpen(false), 200)}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', border: '1px solid #dcd7cc', outline: 'none', fontSize: '16px', color: '#334155', backgroundColor: '#ffffff', boxSizing: 'border-box' }}
                        className="mobile-input-field"
                      />
                      
                      {isCustomerModalOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: '350px', overflowY: 'auto', zIndex: 1000, display: 'flex', flexDirection: 'column', padding: '8px' }}>
                          <button 
                            onMouseDown={(e) => { e.preventDefault(); setIsCreateCustomerModalOpen(true); setIsCustomerModalOpen(false); }} 
                            style={{ width: '100%', padding: '10px', backgroundColor: '#f8fafc', color: '#3b82f6', border: '1px dashed #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'normal', fontSize: '15px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                          >
                            <span style={{ fontSize: '16px' }}>+</span> Add New Customer
                          </button>
                          
                          {filteredCustomers.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '14px' }}>No customers found</div>
                          ) : (
                            filteredCustomers.map(c => (
                              <div 
                                key={c.id} 
                                onMouseDown={(e) => { e.preventDefault(); setSelectedCustomerId(c.id.toString()); setCustomerSearchTerm(''); setIsCustomerModalOpen(false); }} 
                                style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: '#fff' }}
                              >
                                {/* Changed to normal font weight and softened the text color */}
                                <div style={{ fontWeight: 'normal', fontSize: '14px', color: '#334155', marginBottom: '4px' }}>{c.name}</div>
                                <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                  <span>📞 {c.phone || '-'}</span>
                                  <span>📍 {c.location || '-'}</span>
                                  <span>🏷️ {c.type || '-'}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ width: '100%', padding: '12px', backgroundColor: '#fefcf3', border: '1px solid #eadeca', borderRadius: '6px', fontSize: '14px', color: '#4a3b1b', position: 'relative' }}>
                      <button onClick={() => { setSelectedCustomerId(''); setCustomerSearchTerm(''); }} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>❌</button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', paddingRight: '20px' }}>
                        <div><span style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'regular' }}>👤 NAME</span>{selectedCustomer.name}</div>
                        <div><span style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'regular' }}>📞 PHONE</span>{selectedCustomer.phone || '-'}</div>
                        <div><span style={{ color: '#8a7650', fontSize: '11px', display: 'block', marginBottom: '2px', fontWeight: 'regular' }}>📍 LOCATION</span>{selectedCustomer.location || '-'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SCROLLABLE CATEGORY TABS */}
            {activeTab !== 'retail' && (
              <div className="hide-scrollbar" style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '8px', marginTop: '16px', width: '100%', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}>
                {RICE_CATEGORIES.map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setActiveCategory(cat)} 
                    style={{ 
                      scrollSnapAlign: 'start',
                      padding: '6px 14px', 
                      borderRadius: '20px', 
                      border: activeCategory === cat ? 'none' : '1px solid #cbd5e1', 
                      backgroundColor: activeCategory === cat ? '#b58a3d' : '#ffffff', 
                      color: activeCategory === cat ? '#fff' : '#475569', 
                      cursor: 'pointer', 
                      fontSize: '13px', 
                      whiteSpace: 'nowrap',
                      fontWeight: activeCategory === cat ? 'bold' : 'normal',
                      boxShadow: activeCategory === cat ? '0 2px 4px rgba(181, 138, 61, 0.3)' : 'none'
                    }}
                  >
                    {cat === 'All' ? (lang === 'kh' ? 'ទាំងអស់' : 'All') : cat}
                  </button>
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
                      <div style={{ fontSize: '14px', color: '#334155', marginBottom: '8px', fontWeight: 'bold' }}>{p.name}</div>
                    </div>

                    <div style={{ borderTop: '1px dashed #f1f5f9', paddingTop: '8px', marginTop: 'auto', position: 'relative', minHeight: activeTab === 'wholesale' ? '35px' : 'auto' }}>
                      <div style={{ fontSize: '14px', color: '#b58a3d', fontWeight: 'bold' }}>
                        {formatRielSymbol(activeTab === 'retail' ? (p.price || 0) : (p.cost_price || 0))}
                      </div>
                      
                      {activeTab === 'retail' && (
                        <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 15 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>
                          📦 {p.stock} kg left
                        </div>
                      )}

                      {activeTab === 'wholesale' && (
                        <div style={{ fontSize: '11px', marginTop: '4px', color: Number(p.stock) < 5 ? '#dc2626' : '#10b981', fontWeight: 'bold' }}>
                          📦 {currentT.stock}: {p.stock}
                        </div>
                      )}
                      
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

      {/* DESKTOP SIDEBAR CART */}
      <div className="desktop-cart-panel" style={{ width: '400px', backgroundColor: '#ffffff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ paddingTop: '16px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', flexShrink: 0 }}>
          <h2 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: '#334155' }}>{currentT.cartTitle} ({cart.length})</h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px' }}>
          
          {activeTab === 'wholesale' && selectedCustomerId && (
            <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input type="text" placeholder="Invoice Name Override..." value={cartCustomerNameOverride} onChange={e => setCartCustomerNameOverride(e.target.value)} style={{ width: '100%', padding: '8px 10px', fontSize: '14px', fontWeight: 'normal', borderRadius: '4px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155' }} className="mobile-input-field" />
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
                        fontSize: '14px', color: isReturn ? '#dc2626' : isCharge ? '#b45309' : '#334155', 
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
                        {activeBatches[item.product_id]?.map((b: InventoryBatch) => {
                          const remaining = b.remaining_qty || 0;
                          return <option key={b.id} value={b.id}>{formatRiel(b.cost_price)} ({remaining})</option>;
                        })}
                      </select>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.quantity}</span>
                      <CartInput value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} onFocus={() => updateCartItem(item.id, 'quantity', '')} isQty={true} fontSize="14px" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.unitPrice} (៛)</span>
                      <CartInput value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} onFocus={() => updateCartItem(item.id, 'custom_price_riel', '')} isQty={false} fontSize="14px" />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
        
        <div style={{ position: 'sticky', bottom: 0, paddingTop: '12px', paddingRight: '20px', paddingBottom: '16px', paddingLeft: '20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', flexShrink: 0, zIndex: 10, boxShadow: '0 -4px 10px rgba(0,0,0,0.02)' }}>
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
            onClick={initiateCheckout} 
            disabled={!isCartValid || !hasValidPayment || isProcessing} 
            style={{ 
              width: '100%', 
              padding: '14px', 
              backgroundColor: (!isCartValid || !hasValidPayment || isProcessing) ? '#e2e8f0' : '#10b981', 
              color: (!isCartValid || !hasValidPayment || isProcessing) ? '#64748b' : '#ffffff', 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 'bold', 
              fontSize: '15px',
              cursor: (!isCartValid || !hasValidPayment || isProcessing) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)'
            }}
          >
            {isProcessing ? 'Processing...' : currentT.checkout}
          </button>
        </div>
      </div>

      {/* MOBILE CART TRAY */}
      {cart.length > 0 && !isMobileCartOpen && !completedSale && !saleSummary && (
        <div className="mobile-fab" onClick={() => setIsMobileCartOpen(true)}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>🛒 View Cart ({cart.length})</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatRielFromNative(totalRiel)} &nbsp; ➔</div>
        </div>
      )}

      {isMobileCartOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ flex: 1 }} onClick={() => setIsMobileCartOpen(false)}></div>
          
          <div style={{ width: '100%', maxHeight: '85dvh', backgroundColor: '#ffffff', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 -10px 25px rgba(0,0,0,0.1)' }}>
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
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.quantity}</span>
                        <CartInput fontSize="16px" value={item.quantity} onChange={(v) => updateCartItem(item.id, 'quantity', v)} onFocus={() => updateCartItem(item.id, 'quantity', '')} isQty={true} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{currentT.unitPrice}</span>
                        <CartInput fontSize="16px" value={item.custom_price_riel} onChange={(v) => updateCartItem(item.id, 'custom_price_riel', v)} onFocus={() => updateCartItem(item.id, 'custom_price_riel', '')} isQty={false} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div style={{ padding: '12px 20px calc(24px + env(safe-area-inset-bottom, 12px)) 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)', flexShrink: 0 }}>
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
                onClick={initiateCheckout} 
                disabled={!isCartValid || !hasValidPayment || isProcessing} 
                style={{ 
                  width: '100%', 
                  padding: '14px', 
                  backgroundColor: (!isCartValid || !hasValidPayment || isProcessing) ? '#e2e8f0' : '#10b981', 
                  color: (!isCartValid || !hasValidPayment || isProcessing) ? '#64748b' : '#ffffff', 
                  border: 'none', 
                  borderRadius: '10px', 
                  fontWeight: 'bold', 
                  fontSize: '16px', 
                  cursor: (!isCartValid || !hasValidPayment || isProcessing) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                {isProcessing ? 'Processing...' : currentT.checkout}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTO OPEN BAG MODAL */}
      {autoOpenModal.isOpen && (
        <div className="modal-overlay" onMouseDown={() => setAutoOpenModal({ isOpen: false, items: [] })}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: '#1e293b' }}>⚠️ Auto-Open Bag Required</h3>
            <p style={{ color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
              You do not have enough loose retail rice for this sale. Proceeding will automatically open a wholesale bag to restock the loose bin.
            </p>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '16px', fontSize: '13px', color: '#64748b' }}>
              Items needing restocking:
              <ul style={{ paddingLeft: '20px', marginTop: '8px', marginBottom: 0 }}>
                {autoOpenModal.items.map((p) => (
                    <li key={p.id}>{p.name} (Needs {p.bags_needed} bag)</li>
                ))}
              </ul>
            </div>
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setAutoOpenModal({ isOpen: false, items: [] })} style={{ padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmAutoOpen} disabled={isProcessing} style={{ padding: '10px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>{isProcessing ? 'Processing...' : 'Yes, Open Bag'}</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW CUSTOMER MODAL */}
      {isCreateCustomerModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '10vh', padding: '20px', boxSizing: 'border-box' }}>
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '15vh', paddingLeft: '20px', paddingRight: '20px', boxSizing: 'border-box' }} onMouseDown={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })}>
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
                * Partial returns add leftover rice to 1kg Retail pool automatically.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setExchangeModal({ isOpen: false, product: null, consumedKg: '' })} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleConfirmExchange} disabled={isProcessing} style={{ padding: '10px 16px', backgroundColor: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>{isProcessing ? 'Processing...' : 'Confirm Return'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE PRODUCT ADD POPUP */}
      {selectedMobileProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '15vh', paddingLeft: '20px', paddingRight: '20px', boxSizing: 'border-box' }} onMouseDown={() => setSelectedMobileProduct(null)}>
          <div style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }} onMouseDown={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', fontSize: '18px' }}>{currentT.mobileModalTitle}</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Product Identifier</label>
              <input type="text" value={mobileName} onChange={(e) => setMobileName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quantity</label>
                <CurrencyInput value={mobileQty} onChange={(v: any) => setMobileQty(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Price (៛)</label>
                <CurrencyInput value={mobilePrice} onChange={(v: any) => setMobilePrice(v)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#334155', backgroundColor: '#ffffff' }} className="mobile-input-field" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setSelectedMobileProduct(null)} style={{ padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>{currentT.cancel}</button>
              <button onClick={handleAddMobileProductToCart} style={{ padding: '10px 16px', backgroundColor: '#b58a3d', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>{currentT.add}</button>
            </div>
          </div>
        </div>
      )}

      {/* 💰 SALE SUMMARY MODAL */}
      {saleSummary && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10005, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }} onMouseDown={() => setSaleSummary(null)}>
          <div className="modal-content" style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: '400px', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onMouseDown={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: saleSummary.isDebt ? '#d97706' : '#10b981', fontSize: '20px', marginBottom: '16px', textAlign: 'center' }}>
              {saleSummary.isCashless ? 'Sale Recorded! ✅' : saleSummary.isDebt ? 'Partial Payment Logged ⏳' : 'Sale Complete! ✅'}
            </h2>
              
            {saleSummary.change > 0 && (
              <div style={{ background: '#ecfdf5', padding: '20px', borderRadius: '12px', border: '2px dashed #10b981', marginBottom: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: '#047857', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Change to Return</div>
                <div style={{ fontSize: '38px', color: '#047857', fontWeight: 'bold', margin: '4px 0' }}>{formatRielFromNative(saleSummary.change)}</div>
                <div style={{ fontSize: '13px', color: '#059669', marginTop: '4px' }}>Out of {formatRielFromNative(saleSummary.totalReceivedInRiel)} received</div>
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
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
                <span style={{ color: saleSummary.total < 0 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{formatRielFromNative(saleSummary.total)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => { setSaleSummary(null); setCompletedSale(null); setPreviewImageUrl(null); }} style={{ width: '100%', padding: '16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
                 Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL INVISIBLE DOM CAPTURE AREA */}
      {completedSale && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          zIndex: -9999, 
          opacity: 0.01,
          pointerEvents: 'none' 
        }}>
          <div id="invoice-capture-area" ref={invoiceRef} style={{ width: '794px', height: '559px', backgroundColor: '#ffffff', position: 'relative', margin: 0, padding: '19px', boxSizing: 'border-box', fontFamily: "'Noto Sans Khmer', Arial, sans-serif", fontSize: '12.8px', color: '#000000', overflow: 'hidden' }}>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer&display=swap" rel="stylesheet" crossOrigin="anonymous" />
            
            <img 
              src={invoiceImages.watermark} 
              className="invoice-watermark" 
              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: 'auto', opacity: 0.14, zIndex: 0, pointerEvents: 'none', objectFit: 'contain' }} 
              alt="Watermark" 
              decoding="sync"
            />

            <div className="content" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              <div style={{ position: 'absolute', top: 0, left: 0, width: '60px', height: '70px', zIndex: 2 }}>
                <img src={invoiceImages.left} alt="Left Logo" style={{ width: '100%', height: '100%', display: 'block' }} decoding="sync" />
              </div>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '85px', height: '75px', zIndex: 2 }}>
                <img src={invoiceImages.right} alt="Right Logo" style={{ width: '95%', height: '100%', display: 'block' }} decoding="sync" />
              </div>

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
                    const displayItems = getCategorizedItemsForInvoice(completedSale.cartSnapshot);
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
        <div className="invoice-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10006, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          {completedSale.changeDue > 0 && (
            <div style={{ width: '100%', maxWidth: '850px', background: '#ecfdf5', border: '2px dashed #10b981', borderRadius: '12px', padding: '16px 24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold', textTransform: 'uppercase' }}>Amount Received</div>
                <div style={{ fontSize: '18px', color: '#047857', fontWeight: 'bold' }}>{formatRielFromNative(completedSale.amountReceived)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', color: '#047857', fontWeight: 'bold', textTransform: 'uppercase' }}>Change Due ➔</div>
                <div style={{ fontSize: '32px', color: '#047857', fontWeight: 'bold' }}>{formatRielFromNative(completedSale.changeDue)}</div>
              </div>
            </div>
          )}

          <div className="invoice-controls" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '850px', marginBottom: '16px', padding: '0 20px' }}>
            <button onClick={() => { setShowInvoicePreview(false); setCompletedSale(null); setPreviewImageUrl(null); }} style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>❌ {currentT.close}</button>
            
            <div className="desktop-controls" style={{ display: 'none', gap: '10px' }}>
              <button onClick={handleDesktopDownloadPNG} disabled={!previewImageUrl} style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>💾 {currentT.openInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>🖨️ Print / PDF</button>
            </div>

            <div className="mobile-controls" style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleMobileShare} disabled={!previewImageUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>📤 {currentT.shareInvoice}</button>
              <button onClick={handleNativePrint} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>🖨️ Print</button>
            </div>
          </div>

          <div className="invoice-preview-container" style={{ width: '100%', maxWidth: '850px', padding: '0 10px', display: 'flex', justifyContent: 'center', flexShrink: 1, minHeight: 0 }}>
            {isGeneratingPreview || !previewImageUrl ? (
              <div style={{ padding: '40px', backgroundColor: '#fff', borderRadius: '8px', color: '#334155', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>⏳</span> Generating High-Resolution Invoice...
              </div>
            ) : (
              <img src={previewImageUrl} alt="Invoice Preview" style={{ width: '100%', maxWidth: '794px', maxHeight: '60vh', borderRadius: '4px', objectFit: 'contain', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
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
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px; 
          font-family: Arial, sans-serif; 
          box-sizing: border-box; 
          color: #333;
          width: 100%;
          min-height: 100%;
        }

        .header-container { 
          display: flex;
          justify-content: flex-start;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px;
          gap: 12px;
          min-height: 48px; 
          width: 100%;
        }
        
        .header-left {
          display: flex;
          align-items: center; 
          gap: 12px;
        }

        .page-title { 
          font-size: 24px !important; 
          color: #4a3b1b !important; 
          margin: 0 !important; 
          font-weight: bold;
          letter-spacing: -0.5px;
          line-height: normal !important; 
          display: flex;
          align-items: center;
          min-width: 0;
          white-space: nowrap !important; 
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
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 140px 16px !important; 
          }
          
          .header-container { 
            margin-left: 54px !important; 
            margin-right: 0 !important;
            margin-bottom: 24px !important; 
            margin-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            align-items: center !important; 
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
          }

          .header-left {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .page-title {
            font-size: 22px !important;
            line-height: normal !important; 
            white-space: nowrap !important; 
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
            font-size: 16px !important; 
          }
        }
      `}</style>
    </div>
  )
}