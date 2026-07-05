'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const EXCHANGE_RATE = 4000;

const formatRiel = (v: number) => `${new Intl.NumberFormat('en-US').format(Math.round(v))} ៛`;
const formatUSD = (v: number) => `$${Number(v).toFixed(2)}`;
const formatUSDEquiv = (vRiel: number) => `$${(vRiel / EXCHANGE_RATE).toFixed(2)}`;
const formatNumber = (v: number) => new Intl.NumberFormat('en-US').format(v);

const parseOwner = (ownerStr: any) => {
  const o = (ownerStr || '').toLowerCase().trim();
  if (o === 'mom') return 'mom';
  if (o === 'pich') return 'pich';
  if (o === 'jing') return 'jing';
  return 'both'; 
};

function CurrencyInput({ value, onChange, onBlur, placeholder, style, autoFocus, className }: any) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (value === '' || value === 0) setInputValue('');
    else {
      const parsed = parseFloat(inputValue.replace(/,/g, ''));
      if (parsed !== value) setInputValue(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    let formatted = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : '';
    if (parts.length > 1) formatted += '.' + parts[1].substring(0, 2);
    setInputValue(formatted === '' ? '' : formatted);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? '' : num);
  };

  return <input type="text" inputMode="decimal" placeholder={placeholder} value={inputValue} onChange={handleChange} onBlur={onBlur} autoFocus={autoFocus} style={{ ...style, color: '#334155' }} className={className || "mobile-input-field"} />
}

export default function DashboardPage() {
  const [wholesaleSales, setWholesaleSales] = useState<any[]>([])
  const [retailSales, setRetailSales] = useState<any[]>([])
  const [invoiceSummaries, setInvoiceSummaries] = useState<any[]>([])
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]) 
  const [expenses, setExpenses] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([]) 
  const [inventoryList, setInventoryList] = useState<any[]>([]) 
  const [accountsPayable, setAccountsPayable] = useState<any[]>([]) 
  const [cogsSettlements, setCogsSettlements] = useState<any[]>([]) 
  const [priceHistory, setPriceHistory] = useState<any[]>([]) 

  const [showStartingBalance, setShowStartingBalance] = useState(false)
  const [baseCapital, setBaseCapital] = useState<number>(0)
  const [initCashRiel, setInitCashRiel] = useState<number>(0)
  const [initCashUsd, setInitCashUsd] = useState<number>(0)
  const [initQrRiel, setInitQrRiel] = useState<number>(0)
  const [initQrUsd, setInitQrUsd] = useState<number>(0)
  const [familyOweRiel, setFamilyOweRiel] = useState<number>(0)
  const [familyOweUsd, setFamilyOweUsd] = useState<number>(0)
  const [persOweRiel, setPersOweRiel] = useState<number>(0) 

  const [activeTab, setActiveTab] = useState<'wholesale' | 'retail' | 'asset'>('wholesale')
  const [assetFilter, setAssetFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('month')

  useEffect(() => {
    loadData();
    const channel = supabase.channel('dashboard-channel').on('postgres_changes', { event: '*', schema: 'public' }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [])

  async function loadData() {
    const [{data: salesData}, {data: sumData}, {data: retData}, {data: expData}, {data: staffData}, {data: prodData}, {data: apData}, {data: cogsData}, {data: batchData}, {data: invPayData}] = await Promise.all([
      supabase.from('sales').select('*'),
      supabase.from('invoice_summaries').select('*'),
      supabase.from('retail_sales').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('staff').select('*'),
      supabase.from('products').select('*').order('id'),
      supabase.from('accounts_payable').select('*').order('created_at', { ascending: false }),
      supabase.from('cogs_settlements').select('*'),
      supabase.from('price_history').select('*'),
      supabase.from('invoice_payments').select('*')
    ]);

    setWholesaleSales(salesData || []); setInvoiceSummaries(sumData || []); setRetailSales(retData || []); setExpenses(expData || []); setStaffList(staffData || []); setInventoryList(prodData || []); setAccountsPayable(apData || []); setCogsSettlements(cogsData || []); setPriceHistory(batchData || []); setInvoicePayments(invPayData || []);

    const keys = ['base_capital', 'initial_cash_riel', 'initial_cash_usd', 'initial_qr_riel', 'initial_qr_usd', 'personal_owe_riel', 'family_owe_riel', 'family_owe_usd'];
    const { data: capData } = await supabase.from('app_settings').select('*').in('setting_key', keys)
    if (capData) {
      capData.forEach(s => {
        if (s.setting_key === 'base_capital') setBaseCapital(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_cash_riel') setInitCashRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_cash_usd') setInitCashUsd(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_qr_riel') setInitQrRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'initial_qr_usd') setInitQrUsd(Number(s.setting_value) || 0)
        if (s.setting_key === 'personal_owe_riel') setPersOweRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'family_owe_riel') setFamilyOweRiel(Number(s.setting_value) || 0)
        if (s.setting_key === 'family_owe_usd') setFamilyOweUsd(Number(s.setting_value) || 0)
      })
    }
  }

  async function updateSetting(key: string, val: number) {
    await supabase.from('app_settings').upsert({ setting_key: key, setting_value: val }, { onConflict: 'setting_key' })
  }

  const now = new Date()
  const isToday = (dateStr: string) => { if (!dateStr) return false; const d = new Date(dateStr); return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }
  const isMTD = (dateStr: string) => { if (!dateStr) return false; const d = new Date(dateStr); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }
  const isLastMonth = (dateStr: string) => { if (!dateStr) return false; const d = new Date(dateStr); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); }
  const getDayOfMonth = (dateStr: string) => { if (!dateStr) return 1; return new Date(dateStr).getDate(); }
  
  const isAssetMatch = (dateStr: string, filter: string) => {
    if (filter === 'all') return true;
    if (!dateStr) return false;
    const d = new Date(dateStr); const today = new Date();
    today.setHours(0,0,0,0); d.setHours(0,0,0,0);
    if (filter === 'today') return d.getTime() === today.getTime();
    if (filter === 'yesterday') { const yest = new Date(today); yest.setDate(yest.getDate() - 1); return d.getTime() === yest.getTime(); }
    if (filter === 'week') { const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7); return d >= lastWeek && d <= today; }
    if (filter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    return true;
  }

  const activeSalesData = activeTab === 'wholesale' ? wholesaleSales : retailSales;

  function calculateMetrics(dataSet: any[], timeFilter: (d: string) => boolean) {
    const filtered = dataSet.filter(s => timeFilter(s.created_at));
    let totalSales = 0, pichSales = 0, jingSales = 0, bothSales = 0, momSales = 0;
    let totalProfit = 0, pichProfit = 0, jingProfit = 0, bothProfit = 0, momProfit = 0;
    let cR = 0, cU = 0, qR = 0, qU = 0;

    filtered.forEach(sale => {
      const qty = Number(sale.qty || 0); const price = Number(sale.price_per_bag || 0); const cogs = Number(sale.cogs_price || 0);
      const revenue = qty * price; const profit = (price - cogs) * qty;
      const owner = parseOwner(sale.owner); const methodStr = (sale.payment_method || 'Cash ៛');

      if (activeTab === 'retail') {
        if (methodStr.includes(':')) {
           methodStr.split(',').forEach((p: string) => {
             const [m, amtStr] = p.split(':'); const pAmt = Number(amtStr) || 0;
             if (m.includes('Cash ៛')) cR += pAmt; else if (m.includes('Cash $')) cU += pAmt; else if (m.includes('QR ៛') || m.includes('Mom QR ៛')) qR += pAmt; else if (m.includes('QR $') || m.includes('Mom QR $')) qU += pAmt; else cR += pAmt;
           });
        } else {
           if (methodStr.includes('Cash ៛')) cR += revenue; else if (methodStr.includes('Cash $')) cU += (revenue / EXCHANGE_RATE); else if (methodStr.includes('QR ៛') || methodStr.includes('Mom QR ៛')) qR += revenue; else if (methodStr.includes('QR $') || methodStr.includes('Mom QR $')) qU += (revenue / EXCHANGE_RATE); else cR += revenue; 
        }
      }

      if (owner === 'mom') { momSales += revenue; momProfit += profit } 
      else {
        totalSales += revenue; totalProfit += profit;
        if (owner === 'pich') { pichSales += revenue; pichProfit += profit } else if (owner === 'jing') { jingSales += revenue; jingProfit += profit } else { bothSales += revenue; bothProfit += profit }
      }
    })
    return { totalSales, pichSales, jingSales, bothSales, momSales, totalProfit, pichProfit, jingProfit, bothProfit, momProfit, cR, cU, qR, qU }
  }

  function calculateExpenses(expSet: any[], timeFilter: (d: string) => boolean, period: 'today' | 'mtd' | 'lastMonth') {
    const filtered = expSet.filter(e => timeFilter(e.created_at))
    let bizCashRiel = 0, bizCashUsd = 0, bizQrRiel = 0, bizQrUsd = 0;
    let persCashRiel = 0, persCashUsd = 0, persQrRiel = 0, persQrUsd = 0;

    filtered.forEach(exp => {
      if (parseOwner(exp.spender) === 'mom') return; 
      let amtRiel = Number(exp.amount_riel || 0); let amtUsd = Number(exp.amount || 0);
      if (amtRiel < 0) return;

      const methodStr = (exp.payment_method || '').toLowerCase();
      const type = (exp.description || '').toLowerCase()
      // Advance payouts are recorded as STAFF in expenses, which we categorise as Business Cash Outflow
      const isBiz = type === 'business' || type === 'biz' || type === 'staff';

      const processSplit = (m: string, aRiel: number, aUsd: number) => {
        const isQr = m.includes('qr');
        if (isBiz) {
          if (aUsd > 0) { isQr ? bizQrUsd += aUsd : bizCashUsd += aUsd; } else { isQr ? bizQrRiel += aRiel : bizCashRiel += aRiel; }
        } else {
          if (aUsd > 0) { isQr ? persQrUsd += aUsd : persCashUsd += aUsd; } else { isQr ? persQrRiel += aRiel : persCashRiel += aRiel; }
        }
      };

      if (methodStr.includes(':')) {
         methodStr.split(',').forEach((p: string) => {
           const [m, amtString] = p.split(':');
           let pAmt = Number(amtString) || 0; let pUsd = 0; let pRiel = pAmt;
           if (m.includes('$')) { pUsd = pAmt; pRiel = pAmt * EXCHANGE_RATE; }
           processSplit(m.trim(), Math.abs(pRiel), Math.abs(pUsd));
         });
      } else { processSplit(methodStr, Math.abs(amtRiel), Math.abs(amtUsd)); }
    })

    // Auto-salary deduction has been removed here.

    return { bizCashRiel, bizCashUsd, bizQrRiel, bizQrUsd, persCashRiel, persCashUsd, persQrRiel, persQrUsd }
  }

  // --- STRICT ALL-TIME ASSET ENGINE WITH LIABILITY SHIELDS ---
  function calculateAssets() {
    let liveCashRiel = initCashRiel, liveCashUsd = initCashUsd;
    let liveQrRiel = initQrRiel, liveQrUsd = initQrUsd;
    
    let bizCredit = 0;
    let totalSupplierAP = 0;
    let momTotalCogs = 0;
    let momTotalPaid = 0;
    let momCollected = 0;
    let momPaidOut = 0;
    let liabilityOffsetUsed = 0; 
    let riceStockValue = 0;
    let staffDebtRiel = 0; // Asset (Money owed to Business)

    // Calculate total money staff owes the business
    staffList.forEach(staff => {
      staffDebtRiel += Number(staff.total_debt) || 0;
    });

    const productValuations: Record<number, { qty: number, totalValue: number, avgCost: number }> = {};
    inventoryList.forEach(p => {
      let pStock = Number(p.stock || 0); let pValue = 0; let accountedStock = 0;
      const activeBatches = priceHistory.filter(b => b.product_id === p.id && ((b.imported_qty || 0) - (b.sold_qty || 0)) > 0);
      activeBatches.forEach(b => {
        const rem = (b.imported_qty || 0) - (b.sold_qty || 0);
        pValue += (rem * Number(b.cost_price || 0)); accountedStock += rem;
      });

      if (pStock > accountedStock) pValue += (pStock - accountedStock) * Number(p.cost_price || 0);
      else if (pStock < accountedStock && accountedStock > 0) pValue = pStock * (pValue / accountedStock);

      riceStockValue += pValue;
      productValuations[p.id] = { qty: pStock, totalValue: pValue, avgCost: pStock > 0 ? pValue / pStock : Number(p.cost_price || 0) };
    });

    accountsPayable.forEach(ap => { if (ap.status === 'Unpaid') totalSupplierAP += Number(ap.amount_riel || 0); });

    const isBusinessMethod = (m: string) => {
        const lowerM = m.toLowerCase();
        if (lowerM.includes('mom qr')) return false; 
        return true; 
    };

    // ONLY modifies the drawer if the money is actually business cash
    const addFunds = (amtRiel: number, method: string) => {
      const m = method || 'Cash ៛';
      const lowerM = m.toLowerCase();
      if (lowerM.includes('liability') || lowerM.includes('mom qr')) return; 
      
      if (m.includes('Cash ៛')) liveCashRiel += amtRiel;
      else if (m.includes('Cash $')) liveCashUsd += (amtRiel / EXCHANGE_RATE);
      else if (m.includes('QR ៛')) liveQrRiel += amtRiel;
      else if (m.includes('QR $')) liveQrUsd += (amtRiel / EXCHANGE_RATE);
      else liveCashRiel += amtRiel;
    }

    const subFunds = (amtRiel: number, method: string) => {
      const m = method || 'Cash ៛';
      const lowerM = m.toLowerCase();
      if (lowerM.includes('liability') || lowerM.includes('mom qr')) return; 

      if (m.includes('Cash ៛')) liveCashRiel -= amtRiel;
      else if (m.includes('Cash $')) liveCashUsd -= (amtRiel / EXCHANGE_RATE);
      else if (m.includes('QR ៛')) liveQrRiel -= amtRiel;
      else if (m.includes('QR $')) liveQrUsd -= (amtRiel / EXCHANGE_RATE);
      else liveCashRiel -= amtRiel;
    }

    // 1. RETAIL
    retailSales.forEach(r => {
      const owner = parseOwner(r.owner);
      const methodStr = r.payment_method || 'Cash ៛';

      if (methodStr.includes(':')) {
          methodStr.split(',').forEach((pStr: string) => {
              const [mName, amtStr] = pStr.split(':');
              let bAmt = Number(amtStr) || 0;
              if (mName.includes('$')) bAmt *= EXCHANGE_RATE;

              if (isBusinessMethod(mName.trim())) {
                  addFunds(bAmt, mName.trim());
                  if (owner === 'mom') momCollected += bAmt; 
              }
          });
      } else {
          if (isBusinessMethod(methodStr)) {
              addFunds(Number(r.qty || 0) * Number(r.price_per_bag || 0), methodStr);
              if (owner === 'mom') momCollected += Number(r.qty || 0) * Number(r.price_per_bag || 0);
          }
      }

      if (owner === 'mom') {
        let cogsAmt = Number(r.qty || 0) * Number(r.cogs_price || 0);
        let desc = r.custom_rice_type || r.rice_type || '';
        if (!desc.includes('សេវាដឹក') && !(desc.includes('បាវ') && cogsAmt === 0)) {
           if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) cogsAmt = -Math.abs(cogsAmt);
           else cogsAmt = Math.abs(cogsAmt);
           momTotalCogs += cogsAmt;
        }
      }
    });

    // 2. WHOLESALE
    wholesaleSales.forEach(w => {
      const owner = parseOwner(w.owner);
      if (owner === 'mom') {
        let cogsAmt = Number(w.qty || 0) * Number(w.cogs_price || 0);
        let desc = w.custom_rice_type || w.rice_type || '';
        if (!desc.includes('សេវាដឹក') && !(desc.includes('បាវ') && cogsAmt === 0)) {
           if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) cogsAmt = -Math.abs(cogsAmt);
           else cogsAmt = Math.abs(cogsAmt);
           momTotalCogs += cogsAmt;
        }
      }
    });

    // 3. INVOICE PAYMENTS
    invoicePayments.forEach(p => {
       const amt = Number(p.amount_paid || 0);
       const methodStr = p.payment_method || 'Cash ៛';
       
       if (methodStr.includes(':')) {
           methodStr.split(',').forEach((pStr: string) => {
              const [mName, amtStr] = pStr.split(':');
              let bAmt = Number(amtStr) || 0;
              if (mName.includes('$')) bAmt *= EXCHANGE_RATE;
              
              if (isBusinessMethod(mName.trim())) {
                  addFunds(bAmt, mName.trim());
                  const parentInv = invoiceSummaries.find(i => i.invoice_id === p.invoice_id);
                  if (parentInv && parseOwner(parentInv.owner) === 'mom') momCollected += bAmt;
              }
           });
       } else {
           if (isBusinessMethod(methodStr)) {
               addFunds(amt, methodStr);
               const parentInv = invoiceSummaries.find(i => i.invoice_id === p.invoice_id);
               if (parentInv && parseOwner(parentInv.owner) === 'mom') momCollected += amt;
           }
       }
    });

    // 4. INVOICE SUMMARIES
    invoiceSummaries.forEach(inv => {
       const owner = parseOwner(inv.owner);
       if (owner !== 'mom') bizCredit += Number(inv.balance_due || 0);
    });

    // 5. COGS SETTLEMENTS (Syncs correctly with COGS Page Liability Engine)
    cogsSettlements.forEach(c => {
       const owner = parseOwner(c.owner_name);
       const methodStr = (c.payment_method || '').toLowerCase();
       const totalAmt = Number(c.paid_amount || 0);

       if (owner === 'mom') momTotalPaid += totalAmt;

       if (methodStr.includes(':')) {
          methodStr.split(',').forEach((p: string) => {
             const [mName, amtStr] = p.split(':');
             const lowerM = mName.trim().toLowerCase();
             let bAmt = Number(amtStr) || 0;
             if (mName.includes('$')) bAmt *= EXCHANGE_RATE;

             if (lowerM.includes('liability')) {
                 if (owner === 'mom') liabilityOffsetUsed += bAmt;
             } else {
                 subFunds(bAmt, mName.trim()); // Safely subtracts actual business cash
             }
          });
       } else {
           if (methodStr.includes('liability')) {
               if (owner === 'mom') liabilityOffsetUsed += totalAmt;
           } else {
               subFunds(totalAmt, c.payment_method);
           }
       }
    });

    // 6. EXPENSES
    expenses.forEach(e => {
      const owner = parseOwner(e.spender);
      if (owner === 'mom') return;

      let amtRiel = Number(e.amount_riel || 0);
      const paymentMethod = e.payment_method || 'Cash ៛';

      if (amtRiel < 0) {
         const remarks = (e.remarks || '').toLowerCase();
         if (remarks.includes('payment from') && !remarks.includes('cogs')) return;
         if (remarks.includes('account settled') && !remarks.includes('cogs')) return;

         if (paymentMethod.includes(':')) {
            paymentMethod.split(',').forEach((p: string) => {
              const [m, amtStr] = p.split(':');
              let bucketAmt = Number(amtStr) || 0;
              if (m.includes('$')) bucketAmt *= EXCHANGE_RATE;
              addFunds(Math.abs(bucketAmt), m.trim());
            });
         } else addFunds(Math.abs(amtRiel), paymentMethod);
      } else {
         const remarks = (e.remarks || '').toLowerCase();
         if (remarks.includes("settled mom's account liability")) {
             momPaidOut += Math.abs(amtRiel) + (Math.abs(Number(e.amount_usd || 0)) * EXCHANGE_RATE);
         }

         if (paymentMethod.includes(':')) {
            paymentMethod.split(',').forEach((p: string) => {
              const [m, amtStr] = p.split(':');
              let bucketAmt = Number(amtStr) || 0;
              if (m.includes('$')) bucketAmt *= EXCHANGE_RATE;
              subFunds(Math.abs(bucketAmt), m.trim());
            });
         } else subFunds(Math.abs(amtRiel), paymentMethod);
      }
    });

    // Auto-salary deduction has been removed here. Staff debt (advances) already deducts cash when logged as an expense.

    // 7. TIME-FILTERED EXPENSES 
    let bizExpRiel = 0, bizExpUsd = 0;
    let persExpRiel = 0, persExpUsd = 0;
    let riceExpRiel = 0, riceExpUsd = 0;

    expenses.filter(e => isAssetMatch(e.created_at, assetFilter)).forEach(e => {
        const owner = parseOwner(e.spender);
        if (owner === 'mom') return;

        let amtRiel = Number(e.amount_riel || 0);
        if (amtRiel < 0) return;
        
        const methodStr = (e.payment_method || '').toLowerCase();
        const remarks = (e.remarks || '').toLowerCase();
        const desc = (e.description || '').toUpperCase();
        
        let isRice = false, isBiz = false;
        if (remarks.includes('stock import') || remarks.includes('rice') || desc.includes('RICE') || desc.includes('COGS')) isRice = true;
        else if (desc === 'BUSINESS' || desc === 'BIZ' || desc === 'STAFF') isBiz = true;

        const distributeToBuckets = (m: string, partRiel: number) => {
           let r = 0, u = 0;
           if (m.includes('$')) u = partRiel / EXCHANGE_RATE; else r = partRiel;
           if (isRice) { riceExpRiel += r; riceExpUsd += u; } else if (isBiz) { bizExpRiel += r; bizExpUsd += u; } else { persExpRiel += r; persExpUsd += u; }
        };

        if (methodStr.includes(':')) {
           methodStr.split(',').forEach((p: string) => {
              const [m, amtStr] = p.split(':');
              let bucketAmt = Number(amtStr) || 0;
              if (m.includes('$')) bucketAmt *= EXCHANGE_RATE;
              distributeToBuckets(m.trim(), Math.abs(bucketAmt));
           });
        } else distributeToBuckets(methodStr, Math.abs(amtRiel));
    });

    // --- FINAL MATH ---
    const momCogsAr = Math.max(0, momTotalCogs - momTotalPaid);
    
    // The exact synced calculation
    const liveMomLiability = Math.max(0, persOweRiel + momCollected - momPaidOut - liabilityOffsetUsed);
    
    const familyArRielEq = familyOweRiel + (familyOweUsd * EXCHANGE_RATE);

    const liquidAssets = baseCapital + (liveCashRiel + (liveCashUsd * EXCHANGE_RATE)) + (liveQrRiel + (liveQrUsd * EXCHANGE_RATE));
    // Added staffDebtRiel as an Asset
    const netWorth = liquidAssets + bizCredit + familyArRielEq + momCogsAr + staffDebtRiel - totalSupplierAP - liveMomLiability;

    return {
      liveCashRiel, liveCashUsd, liveQrRiel, liveQrUsd,
      bizCredit, familyArRielEq, momCogsAr, liveMomLiability, totalSupplierAP, staffDebtRiel,
      netWorth, riceStockValue, productValuations,
      bizExpRiel, bizExpUsd, persExpRiel, persExpUsd, riceExpRiel, riceExpUsd
    };
  }

  const todayM = calculateMetrics(activeSalesData, isToday)
  const mtdM = calculateMetrics(activeSalesData, isMTD)
  const lastMonthM = calculateMetrics(activeSalesData, isLastMonth)

  const todayE = calculateExpenses(expenses, isToday, 'today')
  const mtdE = calculateExpenses(expenses, isMTD, 'mtd')
  const lastMonthE = calculateExpenses(expenses, isLastMonth, 'lastMonth')

  const assetData = calculateAssets();

  const generateDailyArray = (dataSet: any[], isTargetMonth: (d: string) => boolean) => {
    const dailySales = new Array(31).fill(0)
    const dailyProfit = new Array(31).fill(0)
    dataSet.filter(s => isTargetMonth(s.created_at) && parseOwner(s.owner) !== 'mom').forEach(sale => {
      const dayIdx = getDayOfMonth(sale.created_at) - 1
      const qty = Number(sale.qty || 0);
      const price = Number(sale.price_per_bag || 0);
      const cogs = Number(sale.cogs_price || 0);
      if (dayIdx >= 0 && dayIdx < 31) {
        dailySales[dayIdx] += (qty * price);
        dailyProfit[dayIdx] += ((price - cogs) * qty);
      }
    })
    return { dailySales, dailyProfit }
  }

  const thisMonthData = generateDailyArray(activeSalesData, isMTD)
  const lastMonthData = generateDailyArray(activeSalesData, isLastMonth)

  return (
    <div className="main-wrapper">
      
      <div className="header-container">
        <div className="header-left">
          <h1 className="page-title">📊 Business Dashboard</h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#ffffff', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', width: 'fit-content', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('wholesale')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'wholesale' ? '#b58a3d' : 'transparent', color: activeTab === 'wholesale' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>🌾 Wholesale Data</button>
        <button onClick={() => setActiveTab('retail')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'retail' ? '#b58a3d' : 'transparent', color: activeTab === 'retail' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>🛍️ Retail Data</button>
        <button onClick={() => setActiveTab('asset')} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'asset' ? '#10b981' : 'transparent', color: activeTab === 'asset' ? '#fff' : '#64748b', transition: 'all 0.2s' }}>💰 Business Asset</button>
      </div>

      <div>
        
        {activeTab === 'asset' && (
          <div className="fade-in">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {['today', 'yesterday', 'week', 'month', 'all'].map(f => (
                <button 
                  key={f} onClick={() => setAssetFilter(f as any)} 
                  style={{ padding: '8px 16px', borderRadius: '20px', border: assetFilter === f ? 'none' : '1px solid #cbd5e1', background: assetFilter === f ? '#0f172a' : '#fff', color: assetFilter === f ? '#fff' : '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textTransform: 'capitalize' }}
                >
                  {f === 'week' ? 'This Week' : f === 'month' ? 'This Month' : f === 'all' ? 'All Time' : f}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <button 
                onClick={() => setShowStartingBalance(!showStartingBalance)}
                style={{ width: '100%', padding: '16px 24px', background: '#f8fafc', border: 'none', textAlign: 'left', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️</span> Manual Starting Balances
                </span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{showStartingBalance ? '▲ CLOSE' : '▼ OPEN TO EDIT'}</span>
              </button>
              
              {showStartingBalance && (
                <div style={{ padding: '24px', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: '#ffffff' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Base Capital (៛)</label>
                    <CurrencyInput value={baseCapital} onChange={(v: number) => setBaseCapital(v)} onBlur={() => updateSetting('base_capital', baseCapital)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial Cash (៛)</label>
                    <CurrencyInput value={initCashRiel} onChange={(v: number) => setInitCashRiel(v)} onBlur={() => updateSetting('initial_cash_riel', initCashRiel)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial Cash ($)</label>
                    <CurrencyInput value={initCashUsd} onChange={(v: number) => setInitCashUsd(v)} onBlur={() => updateSetting('initial_cash_usd', initCashUsd)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial QR (៛)</label>
                    <CurrencyInput value={initQrRiel} onChange={(v: number) => setInitQrRiel(v)} onBlur={() => updateSetting('initial_qr_riel', initQrRiel)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Initial QR ($)</label>
                    <CurrencyInput value={initQrUsd} onChange={(v: number) => setInitQrUsd(v)} onBlur={() => updateSetting('initial_qr_usd', initQrUsd)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Family Owes Me (៛)</label>
                    <CurrencyInput value={familyOweRiel} onChange={(v: number) => setFamilyOweRiel(v)} onBlur={() => updateSetting('family_owe_riel', familyOweRiel)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Family Owes Me ($)</label>
                    <CurrencyInput value={familyOweUsd} onChange={(v: number) => setFamilyOweUsd(v)} onBlur={() => updateSetting('family_owe_usd', familyOweUsd)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>Mom Starting Owe (៛)</label>
                    <CurrencyInput value={persOweRiel} onChange={(v: number) => setPersOweRiel(v)} onBlur={() => updateSetting('personal_owe_riel', persOweRiel)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', color: '#334155', boxSizing: 'border-box', fontSize: '14px' }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: '#10b981', padding: '24px', borderRadius: '16px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.9, letterSpacing: '0.5px' }}>Total Net Worth</div>
                <div style={{ fontSize: '32px', margin: '8px 0 0 0', fontWeight: 'normal' }}>{formatRiel(assetData.netWorth)}</div>
              </div>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📦 Total Rice Stock Asset</div>
                <div style={{ fontSize: '32px', margin: '8px 0 0 0', color: '#b58a3d', fontWeight: 'normal' }}>{formatRiel(assetData.riceStockValue)}</div>
              </div>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>💵 Cash on Hand</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Riel (៛)</span>
                    <div style={{ fontSize: '20px', color: '#334155', fontWeight: 'normal', marginTop: '4px' }}>{formatRiel(assetData.liveCashRiel)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>USD ($)</span>
                    <div style={{ fontSize: '20px', color: '#334155', fontWeight: 'normal', marginTop: '4px' }}>{formatUSD(assetData.liveCashUsd)}</div>
                  </div>
                </div>
              </div>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📱 Bank (QR Payments)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Riel (៛)</span>
                    <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'normal', marginTop: '4px' }}>{formatRiel(assetData.liveQrRiel)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>USD ($)</span>
                    <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'normal', marginTop: '4px' }}>{formatUSD(assetData.liveQrUsd)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📒 Accounts Receivable (AR)</div>
                <div style={{ fontSize: '24px', margin: '8px 0', color: '#f59e0b', fontWeight: 'bold' }}>{formatRiel(assetData.bizCredit + assetData.familyArRielEq + assetData.momCogsAr + assetData.staffDebtRiel)}</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Biz AR</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.bizCredit)}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{formatUSD(assetData.bizCredit / EXCHANGE_RATE)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Pers. AR</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.familyArRielEq)}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{formatUSD(assetData.familyArRielEq / EXCHANGE_RATE)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Mom AR (COGS)</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.momCogsAr)}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{formatUSD(assetData.momCogsAr / EXCHANGE_RATE)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>Staff Debt</span>
                    <div style={{ fontSize: '14px', color: '#334155', fontWeight: 'bold' }}>{formatRiel(assetData.staffDebtRiel)}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{formatUSD(assetData.staffDebtRiel / EXCHANGE_RATE)}</div>
                  </div>
                </div>
              </div>
              
              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📉 Accounts Payable (Suppliers)</div>
                <div style={{ fontSize: '24px', margin: '8px 0 4px 0', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(assetData.totalSupplierAP)}</div>
                <div style={{ fontSize: '14px', color: '#be123c' }}>{formatUSD(assetData.totalSupplierAP / EXCHANGE_RATE)}</div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #fecaca', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '13px', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>📉 Personal Liability (Owe Mom)</div>
                <div style={{ fontSize: '24px', margin: '8px 0 4px 0', color: '#e11d48', fontWeight: 'bold' }}>{formatRiel(assetData.liveMomLiability)}</div>
                <div style={{ fontSize: '14px', color: '#be123c' }}>{formatUSD(assetData.liveMomLiability / EXCHANGE_RATE)}</div>
              </div>

              <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold', marginBottom: '16px' }}>📉 Operating & Capital Expenses</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px' }}>BUSINESS EXPENSES</div>
                    <div style={{ fontSize: '20px', color: '#ef4444', fontWeight: 'bold' }}>{formatRiel(assetData.bizExpRiel + (assetData.bizExpUsd * EXCHANGE_RATE))}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', lineHeight: '1.4' }}>
                      Riel: {formatRiel(assetData.bizExpRiel)} <br/> USD: {formatUSD(assetData.bizExpUsd)}
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px' }}>PERSONAL EXPENSES</div>
                    <div style={{ fontSize: '20px', color: '#f59e0b', fontWeight: 'bold' }}>{formatRiel(assetData.persExpRiel + (assetData.persExpUsd * EXCHANGE_RATE))}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', lineHeight: '1.4' }}>
                      Riel: {formatRiel(assetData.persExpRiel)} <br/> USD: {formatUSD(assetData.persExpUsd)}
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '8px' }}>RICE / STOCK PURCHASES</div>
                    <div style={{ fontSize: '20px', color: '#3b82f6', fontWeight: 'bold' }}>{formatRiel(assetData.riceExpRiel + (assetData.riceExpUsd * EXCHANGE_RATE))}</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', lineHeight: '1.4' }}>
                      Riel: {formatRiel(assetData.riceExpRiel)} <br/> USD: {formatUSD(assetData.riceExpUsd)}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#1e293b', textTransform: 'uppercase' }}>🌾 Detailed Inventory Valuation</h3>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '32px' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '600px' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#64748b', fontWeight: 'bold' }}>Product Name</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>Stock Qty</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold' }}>Avg. Cost Price (៛)</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#64748b', fontWeight: 'bold' }}>Total Value (៛)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryList.map(item => {
                      const valData = assetData.productValuations[item.id] || { qty: Number(item.stock || 0), totalValue: Number(item.stock || 0) * Number(item.cost_price || 0), avgCost: Number(item.cost_price || 0) };
                      
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '14px 20px', color: '#334155', fontWeight: 'normal' }}>{item.name}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'center', color: valData.qty < 10 ? '#ef4444' : '#334155', fontWeight: 'normal' }}>{formatNumber(valData.qty)}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#334155', fontWeight: 'normal' }}>{formatRiel(valData.avgCost)}</td>
                          <td style={{ padding: '14px 20px', textAlign: 'right', color: '#10b981', fontWeight: 'normal' }}>{formatRiel(valData.totalValue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={3} style={{ padding: '16px 20px', textAlign: 'right', color: '#334155', fontWeight: 'bold' }}>Total Inventory Asset Value</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', color: '#b58a3d', fontWeight: 'bold', fontSize: '16px' }}>{formatRiel(assetData.riceStockValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        )}

        {activeTab !== 'asset' && (
          <div className="fade-in">
            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📅 TODAY'S PERFORMANCE</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="Today Sales" total={todayM.totalSales} pich={todayM.pichSales} jing={todayM.jingSales} both={todayM.bothSales} mom={todayM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              {activeTab === 'retail' && <ExpenseBreakdownCard title="Retail Payments" cR={todayM.cR} cU={todayM.cU} qR={todayM.qR} qU={todayM.qU} color="#3b82f6" />}
              <ComplexCard title="Today Profit" total={todayM.totalProfit} pich={todayM.pichProfit} jing={todayM.jingProfit} both={todayM.bothProfit} mom={todayM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="Today Biz Expenses" cR={todayE.bizCashRiel} cU={todayE.bizCashUsd} qR={todayE.bizQrRiel} qU={todayE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="Today Personal Exp" cR={todayE.persCashRiel} cU={todayE.persCashUsd} qR={todayE.persQrRiel} qU={todayE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📈 MONTH TO DATE (MTD)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <ComplexCard title="MTD Sales" total={mtdM.totalSales} pich={mtdM.pichSales} jing={mtdM.jingSales} both={mtdM.bothSales} mom={mtdM.momSales} hideSubboxes={activeTab === 'retail'} color="#2563eb" />
              {activeTab === 'retail' && <ExpenseBreakdownCard title="Retail Payments" cR={mtdM.cR} cU={mtdM.cU} qR={mtdM.qR} qU={mtdM.qU} color="#3b82f6" />}
              <ComplexCard title="MTD Profit" total={mtdM.totalProfit} pich={mtdM.pichProfit} jing={mtdM.jingProfit} both={mtdM.bothProfit} mom={mtdM.momProfit} hideSubboxes={activeTab === 'retail'} color="#10b981" />
              {activeTab === 'wholesale' && (
                <>
                  <ExpenseBreakdownCard title="MTD Biz Expenses" cR={mtdE.bizCashRiel} cU={mtdE.bizCashUsd} qR={mtdE.bizQrRiel} qU={mtdE.bizQrUsd} color="#b91c1c" />
                  <ExpenseBreakdownCard title="MTD Personal Exp" cR={mtdE.persCashRiel} cU={mtdE.persCashUsd} qR={mtdE.persQrRiel} qU={mtdE.persQrUsd} color="#f59e0b" />
                </>
              )}
            </div>

            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>⚖️ COMPARE MTD VS LAST MONTH</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '32px' }}>
              <HealthBar title="Sales" current={mtdM.totalSales} target={lastMonthM.totalSales} color="#2563eb" />
              <HealthBar title="Profit" current={mtdM.totalProfit} target={lastMonthM.totalProfit} color="#10b981" />
              {activeTab === 'wholesale' && (
                <>
                  <HealthBar title="Biz Expenses" current={mtdE.bizCashRiel + mtdE.bizQrRiel + (mtdE.bizCashUsd*EXCHANGE_RATE) + (mtdE.bizQrUsd*EXCHANGE_RATE)} target={lastMonthE.bizCashRiel + lastMonthE.bizQrRiel + (lastMonthE.bizCashUsd*EXCHANGE_RATE) + (lastMonthE.bizQrUsd*EXCHANGE_RATE)} color="#b91c1c" reverseLogic />
                  <HealthBar title="Personal Expenses" current={mtdE.persCashRiel + mtdE.persQrRiel + (mtdE.persCashUsd*EXCHANGE_RATE) + (mtdE.persQrUsd*EXCHANGE_RATE)} target={lastMonthE.persCashRiel + lastMonthE.persQrRiel + (lastMonthE.persCashUsd*EXCHANGE_RATE) + (lastMonthE.persQrUsd*EXCHANGE_RATE)} color="#f59e0b" reverseLogic />
                </>
              )}
            </div>

            <h2 className="section-divider" style={{ fontWeight: 'bold' }}>📉 TREND ANALYSIS (Day 1 - 31)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '40px' }}>
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Sales: This Month vs Last Month`} dataCurrent={thisMonthData.dailySales} dataLast={lastMonthData.dailySales} color="#2563eb" />
              <LineChartCard title={`${activeTab === 'wholesale' ? 'Wholesale' : 'Retail'} Profit: This Month vs Last Month`} dataCurrent={thisMonthData.dailyProfit} dataLast={lastMonthData.dailyProfit} color="#10b981" />
            </div>
          </div>
        )}

      </div>

      <style jsx global>{`
        input, select, button, textarea {
          font-family: inherit;
          font-variant-numeric: tabular-nums lining-nums;
        }
        body { font-variant-numeric: tabular-nums lining-nums; }
        .main-wrapper { padding: 24px 24px 24px 75px; background: #f8fafc; min-height: 100vh; font-family: Arial, sans-serif; box-sizing: border-box; color: #333; }
        
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
        .page-title { 
          font-size: 24px !important; 
          color: #4a3b1b !important; 
          margin: 0; 
          font-weight: bold;
          letter-spacing: -0.5px;
          min-width: 0;
          white-space: normal;
          word-break: break-word;
          line-height: 1.2;
        }

        .section-divider { font-size: 15px; color: #475569; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        input[type="text"].no-spinners::-webkit-inner-spin-button, input[type="text"].no-spinners::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        
        @media (max-width: 1023px) { 
          .main-wrapper { padding: 90px 16px 140px 16px !important; min-height: auto; }
          .header-container { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; margin-top: 0 !important; margin-bottom: 24px !important; }
          .header-left { flex-direction: column !important; align-items: flex-start !important; text-align: left !important; gap: 6px !important; }
        }
      `}</style>
    </div>
  )
}

function ComplexCard({ title, total, pich = 0, jing = 0, both = 0, mom = 0, hideSubboxes = false, color = '#1e293b' }: any) {
  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: 0, fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{ margin: '8px 0 4px 0', fontSize: '22px', color: color, fontWeight: 'normal' }}>{formatRiel(total)}</h2>
      </div>
      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', fontWeight: 'normal' }}>{formatUSDEquiv(total)}</div>
      {!hideSubboxes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Pich</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(pich)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Jing</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(jing)}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold' }}>Both</div>
            <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(both)}</div>
          </div>
          <div style={{ background: '#fefcf3', padding: '6px', borderRadius: '6px', textAlign: 'center', border: '1px solid #fde047' }}>
            <div style={{ fontSize: '10px', color: '#ca8a04', textTransform: 'uppercase', fontWeight: 'bold' }}>Mom</div>
            <div style={{ fontSize: '12px', color: '#854d0e', marginTop: '2px', fontWeight: 'normal' }}>{formatRiel(mom)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExpenseBreakdownCard({ title, cR = 0, cU = 0, qR = 0, qU = 0, color = '#1e293b' }: any) {
  const totalRielEquiv = cR + qR + (cU * 4000) + (qU * 4000);
  return (
    <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: 0, fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>{title}</h3>
      <div style={{ margin: '8px 0 16px 0', fontSize: '22px', color: color, fontWeight: 'normal' }}>
        {formatRiel(totalRielEquiv)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>RIEL (៛)</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>Cash: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatRiel(cR)}</span></div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>QR: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatRiel(qR)}</span></div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', marginBottom: '6px' }}>USD ($)</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>Cash: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatUSD(cU)}</span></div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>QR: <span style={{fontWeight: 'normal', color: '#334155'}}>{formatUSD(qU)}</span></div>
        </div>
      </div>
    </div>
  )
}

function HealthBar({ title, current, target, color, reverseLogic = false }: any) {
  let pct = target > 0 ? (current / target) * 100 : (current > 0 ? 100 : 0);
  let displayPct = pct.toFixed(1);
  let barWidth = Math.min(100, Math.max(0, pct));
  let barColor = color;
  if (!reverseLogic) {
    if (pct < 50) barColor = '#ef4444'; else if (pct >= 100) barColor = '#10b981'; 
  } else {
    if (pct > 100) barColor = '#ef4444'; else if (pct < 80) barColor = '#10b981'; 
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: '#334155', fontWeight: 'bold' }}>
        <span>{title}</span><span style={{ color: barColor }}>{displayPct}%</span>
      </div>
      <div style={{ height: '10px', background: '#f1f5f9', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${barWidth}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.5s ease-in-out' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>This MTD</span>
          <span style={{ fontSize: '13px', color: '#334155', fontWeight: 'normal' }}>{formatRiel(current)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Last Month</span>
          <span style={{ fontSize: '13px', color: '#334155', fontWeight: 'normal' }}>{formatRiel(target)}</span>
        </div>
      </div>
    </div>
  )
}

function LineChartCard({ title, dataCurrent, dataLast, color }: any) {
  const maxVal = Math.max(...dataCurrent, ...dataLast, 1) 
  const formatPoints = (arr: number[]) => {
    return arr.map((val, idx) => {
      const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200); return `${x},${y}`;
    }).join(' ');
  }
  const currentPoints = formatPoints(dataCurrent); const lastPoints = formatPoints(dataLast);
  return (
    <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#475569', fontWeight: 'bold' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 'bold' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', background: color, borderRadius: '2px' }}></div> <span style={{ color: '#334155' }}>This Mth</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '14px', height: '4px', borderBottom: '2px dashed #cbd5e1' }}></div> <span style={{ color: '#94a3b8' }}>Last Mth</span>
          </div>
        </div>
      </div>
      <div style={{ width: '100%', height: '220px', position: 'relative' }}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <line x1="0" y1="50" x2="1000" y2="50" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="100" x2="1000" y2="100" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="150" x2="1000" y2="150" stroke="#f1f5f9" strokeWidth="1" />
          <line x1="0" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeWidth="2" />
          <polyline points={lastPoints} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
          <polyline points={currentPoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {dataCurrent.map((val: number, idx: number) => {
            const x = (idx / 30) * 1000; const y = 200 - ((val / maxVal) * 200);
            return val > 0 ? <circle key={idx} cx={x} cy={y} r="4" fill="#ffffff" stroke={color} strokeWidth="2" /> : null;
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}>
          <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>31</span>
        </div>
      </div>
    </div>
  )
}