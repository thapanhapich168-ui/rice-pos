'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// --- TYPES ---
interface Product {
  id: number
  name: string
  price: number
  cost_price: number
  weight: number
  stock: number
}

interface MixHistory {
  id: string
  time: string
  rice1Name: string
  rice1Ratio: number
  rice2Name: string
  rice2Ratio: number
  rice3Name?: string
  rice3Ratio?: number
  mixedCogs: number
}

const formatRiel = (amount: number) => `${new Intl.NumberFormat('en-US').format(Math.round(amount))} ៛`;

// ==========================================
// ROBUST LIVE COMMA FORMATTER (No-Zoom Mobile Safe)
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
      style={{ 
        ...style, 
        color: '#0f172a', 
        fontSize: '16px', // Prevents iOS Zoom
        fontWeight: 'normal' 
      }}
    />
  )
}

export default function RiceMixCalculator() {
  const [products, setProducts] = useState<Product[]>([])
  
  // Selection States - Rice 1
  const [rice1Id, setRice1Id] = useState<string>('')
  const [search1, setSearch1] = useState('')
  const [isDropdown1Open, setIsDropdown1Open] = useState(false)
  const [rice1Ratio, setRice1Ratio] = useState<number | ''>('')
  
  // Selection States - Rice 2
  const [rice2Id, setRice2Id] = useState<string>('')
  const [search2, setSearch2] = useState('')
  const [isDropdown2Open, setIsDropdown2Open] = useState(false)
  const [rice2Ratio, setRice2Ratio] = useState<number | ''>('')

  // Selection States - Rice 3 (Optional)
  const [showThirdRice, setShowThirdRice] = useState(false)
  const [rice3Id, setRice3Id] = useState<string>('')
  const [search3, setSearch3] = useState('')
  const [isDropdown3Open, setIsDropdown3Open] = useState(false)
  const [rice3Ratio, setRice3Ratio] = useState<number | ''>('')

  // Auto-Calc Results & History
  const [calcResult, setCalcResult] = useState<{ cogs: number, totalRatio: number } | null>(null)
  const [history, setHistory] = useState<MixHistory[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Inline Sync Action States
  const [syncMode, setSyncMode] = useState<'none' | 'existing' | 'new'>('none')
  const [targetProductId, setTargetProductId] = useState<string>('')
  const [newMixName, setNewMixName] = useState('')
  const [newMixPrice, setNewMixPrice] = useState<number | ''>('')
  
  const [addStockQty, setAddStockQty] = useState<number | ''>('')
  const [deductRice1Qty, setDeductRice1Qty] = useState<number | ''>('')
  const [deductRice2Qty, setDeductRice2Qty] = useState<number | ''>('')
  const [deductRice3Qty, setDeductRice3Qty] = useState<number | ''>('')

  useEffect(() => {
    fetchProducts()
    fetchHistory()
  }, [])

  // Auto-Calculation Engine
  useEffect(() => {
    const r1 = Number(rice1Ratio) || 0;
    const r2 = Number(rice2Ratio) || 0;
    const r3 = showThirdRice ? (Number(rice3Ratio) || 0) : 0;
    const totalRatio = r1 + r2 + r3;

    const r1Data = products.find(p => p.id.toString() === rice1Id);
    const r2Data = products.find(p => p.id.toString() === rice2Id);
    const r3Data = showThirdRice ? products.find(p => p.id.toString() === rice3Id) : null;

    const hasValidThird = showThirdRice ? r3Data : true;

    if (r1Data && r2Data && hasValidThird && totalRatio > 0) {
      const cost1 = r1Data.cost_price * r1;
      const cost2 = r2Data.cost_price * r2;
      const cost3 = r3Data ? r3Data.cost_price * r3 : 0;

      const mixedCogs = (cost1 + cost2 + cost3) / totalRatio;
      setCalcResult({ cogs: mixedCogs, totalRatio });
      
      // Auto-fill deduction fields based on portions
      setDeductRice1Qty(r1);
      setDeductRice2Qty(r2);
      if (showThirdRice) setDeductRice3Qty(r3);
      setAddStockQty(totalRatio);
    } else {
      setCalcResult(null);
      setSyncMode('none');
    }
  }, [rice1Id, rice2Id, rice3Id, rice1Ratio, rice2Ratio, rice3Ratio, showThirdRice, products])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*').order('name', { ascending: true })
    if (data) setProducts(data)
  }

  async function fetchHistory() {
    const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'calculator_history').single()
    if (data && data.setting_value) {
      setHistory(data.setting_value)
    }
  }

  const rice1 = products.find(p => p.id.toString() === rice1Id)
  const rice2 = products.find(p => p.id.toString() === rice2Id)
  const rice3 = products.find(p => p.id.toString() === rice3Id)

  const filteredProducts1 = products.filter(p => p.name.toLowerCase().includes(search1.toLowerCase()))
  const filteredProducts2 = products.filter(p => p.name.toLowerCase().includes(search2.toLowerCase()))
  const filteredProducts3 = products.filter(p => p.name.toLowerCase().includes(search3.toLowerCase()))

  const handleReset = () => {
    setRice1Id('')
    setSearch1('')
    setRice1Ratio('')
    setRice2Id('')
    setSearch2('')
    setRice2Ratio('')
    setRice3Id('')
    setSearch3('')
    setRice3Ratio('')
    setShowThirdRice(false)
    setCalcResult(null)
    setSyncMode('none')
    setNewMixName('')
    setNewMixPrice('')
    setTargetProductId('')
  }

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all calculator history?')) return
    setHistory([])
    await supabase.from('app_settings').upsert({
      setting_key: 'calculator_history',
      setting_value: []
    }, { onConflict: 'setting_key' })
  }

  const handleExecuteInventorySync = async () => {
    if (!calcResult || !rice1 || !rice2) return;
    if (showThirdRice && !rice3) return alert('Please select the 3rd rice or remove it.');
    
    const qtyToAdd = Number(addStockQty) || 0;
    const qtyToDeduct1 = Number(deductRice1Qty) || 0;
    const qtyToDeduct2 = Number(deductRice2Qty) || 0;
    const qtyToDeduct3 = showThirdRice ? (Number(deductRice3Qty) || 0) : 0;

    if (syncMode === 'new' && (!newMixName || !newMixPrice)) {
      return alert('Please enter a name and selling price for the new mix.');
    }
    if (syncMode === 'existing' && !targetProductId) {
      return alert('Please select an existing product to update.');
    }

    setIsProcessing(true);

    try {
      // 1. Process Deductions from Source Rice
      if (qtyToDeduct1 > 0) {
        await supabase.from('products').update({ stock: rice1.stock - qtyToDeduct1 }).eq('id', rice1.id);
      }
      if (qtyToDeduct2 > 0) {
        await supabase.from('products').update({ stock: rice2.stock - qtyToDeduct2 }).eq('id', rice2.id);
      }
      if (showThirdRice && qtyToDeduct3 > 0 && rice3) {
        await supabase.from('products').update({ stock: rice3.stock - qtyToDeduct3 }).eq('id', rice3.id);
      }

      // 2. Process Target Addition
      if (syncMode === 'new') {
        const payload = {
          name: newMixName,
          price: Number(newMixPrice),
          cost_price: Math.round(calcResult.cogs),
          weight: 50, 
          stock: qtyToAdd
        }
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
      } else {
        const targetProd = products.find(p => p.id.toString() === targetProductId);
        if (targetProd) {
          const newStock = targetProd.stock + qtyToAdd;
          // Update both stock AND adjust the new blended COGS of the existing product
          const { error } = await supabase.from('products').update({ 
            stock: newStock, 
            cost_price: Math.round(calcResult.cogs) 
          }).eq('id', targetProd.id);
          if (error) throw error;
        }
      }

      // 3. Log History
      const newRecord: MixHistory = {
        id: Date.now().toString(),
        time: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        rice1Name: rice1.name,
        rice1Ratio: Number(rice1Ratio) || 0,
        rice2Name: rice2.name,
        rice2Ratio: Number(rice2Ratio) || 0,
        rice3Name: showThirdRice && rice3 ? rice3.name : undefined,
        rice3Ratio: showThirdRice ? (Number(rice3Ratio) || 0) : undefined,
        mixedCogs: calcResult.cogs
      }
      const updatedHistory = [newRecord, ...history].slice(0, 50) 
      setHistory(updatedHistory)
      await supabase.from('app_settings').upsert({ setting_key: 'calculator_history', setting_value: updatedHistory }, { onConflict: 'setting_key' })

      alert('Inventory successfully synced and updated!');
      handleReset();
      fetchProducts();

    } catch (err: any) {
      alert(`Error syncing inventory: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="main-wrapper">
      {/* HEADER */}
      <div className="header-container">
        <h1 className="page-title">🧮 Rice Mix Calculator</h1>
        <button className="action-btn" onClick={handleReset} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>↺ Reset</button>
      </div>

      {/* CALCULATOR WORKSPACE */}
      <div className="calculator-grid">
        
        {/* RICE 1 BOX */}
        <div className="calc-card fade-in">
          <h2 className="card-header">Base Rice A</h2>
          <div className="input-group" style={{ position: 'relative' }}>
            <label>Search & Select Rice</label>
            <input 
              type="text"
              placeholder="Search..."
              value={search1}
              onChange={(e) => { setSearch1(e.target.value); setIsDropdown1Open(true); setRice1Id(''); }}
              onFocus={() => setIsDropdown1Open(true)}
              onBlur={() => setTimeout(() => setIsDropdown1Open(false), 200)}
            />
            {isDropdown1Open && (
              <div className="dropdown-menu">
                {filteredProducts1.length === 0 ? (
                  <div style={{ padding: '12px', color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>No products found</div>
                ) : (
                  filteredProducts1.map(p => (
                    <div key={p.id} className="dropdown-item" onMouseDown={(e) => { e.preventDefault(); setRice1Id(p.id.toString()); setSearch1(p.name); setIsDropdown1Open(false); }}>
                      <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '2px', fontSize: '15px' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Cost: <span style={{ color: '#b58a3d', fontWeight: 'bold' }}>{formatRiel(p.cost_price)}</span> &nbsp;|&nbsp; Stock: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.stock}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          {rice1 && (
            <div className="price-display fade-in">
              <span className="label">Current Cost (COGS)</span>
              <span className="value">{formatRiel(rice1.cost_price)}</span>
            </div>
          )}

          <div className="input-group" style={{ marginTop: '16px' }}>
            <label>Portion (Kg / Bags)</label>
            <CurrencyInput 
              placeholder="0" 
              value={rice1Ratio} 
              onChange={(v: any) => setRice1Ratio(v)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* PLUS SIGN */}
        <div className="math-symbol">+</div>

        {/* RICE 2 BOX */}
        <div className="calc-card fade-in">
          <h2 className="card-header">Base Rice B</h2>
          <div className="input-group" style={{ position: 'relative' }}>
            <label>Search & Select Rice</label>
            <input 
              type="text"
              placeholder="Search..."
              value={search2}
              onChange={(e) => { setSearch2(e.target.value); setIsDropdown2Open(true); setRice2Id(''); }}
              onFocus={() => setIsDropdown2Open(true)}
              onBlur={() => setTimeout(() => setIsDropdown2Open(false), 200)}
            />
            {isDropdown2Open && (
              <div className="dropdown-menu">
                {filteredProducts2.length === 0 ? (
                  <div style={{ padding: '12px', color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>No products found</div>
                ) : (
                  filteredProducts2.map(p => (
                    <div key={p.id} className="dropdown-item" onMouseDown={(e) => { e.preventDefault(); setRice2Id(p.id.toString()); setSearch2(p.name); setIsDropdown2Open(false); }}>
                      <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '2px', fontSize: '15px' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Cost: <span style={{ color: '#b58a3d', fontWeight: 'bold' }}>{formatRiel(p.cost_price)}</span> &nbsp;|&nbsp; Stock: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.stock}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          {rice2 && (
            <div className="price-display fade-in">
              <span className="label">Current Cost (COGS)</span>
              <span className="value">{formatRiel(rice2.cost_price)}</span>
            </div>
          )}

          <div className="input-group" style={{ marginTop: '16px' }}>
            <label>Portion (Kg / Bags)</label>
            <CurrencyInput 
              placeholder="0" 
              value={rice2Ratio} 
              onChange={(v: any) => setRice2Ratio(v)} 
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* OPTIONAL RICE 3 BOX */}
        {showThirdRice && (
          <>
            <div className="math-symbol">+</div>
            <div className="calc-card fade-in" style={{ border: '2px dashed #cbd5e1' }}>
              <h2 className="card-header">Base Rice C</h2>
              <div className="input-group" style={{ position: 'relative' }}>
                <label>Search & Select Rice</label>
                <input 
                  type="text"
                  placeholder="Search..."
                  value={search3}
                  onChange={(e) => { setSearch3(e.target.value); setIsDropdown3Open(true); setRice3Id(''); }}
                  onFocus={() => setIsDropdown3Open(true)}
                  onBlur={() => setTimeout(() => setIsDropdown3Open(false), 200)}
                />
                {isDropdown3Open && (
                  <div className="dropdown-menu">
                    {filteredProducts3.length === 0 ? (
                      <div style={{ padding: '12px', color: '#94a3b8', fontSize: '14px', textAlign: 'center' }}>No products found</div>
                    ) : (
                      filteredProducts3.map(p => (
                        <div key={p.id} className="dropdown-item" onMouseDown={(e) => { e.preventDefault(); setRice3Id(p.id.toString()); setSearch3(p.name); setIsDropdown3Open(false); }}>
                          <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '2px', fontSize: '15px' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            Cost: <span style={{ color: '#b58a3d', fontWeight: 'bold' }}>{formatRiel(p.cost_price)}</span> &nbsp;|&nbsp; Stock: <span style={{ color: '#10b981', fontWeight: 'bold' }}>{p.stock}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              {rice3 && (
                <div className="price-display fade-in">
                  <span className="label">Current Cost (COGS)</span>
                  <span className="value">{formatRiel(rice3.cost_price)}</span>
                </div>
              )}

              <div className="input-group" style={{ marginTop: '16px' }}>
                <label>Portion (Kg / Bags)</label>
                <CurrencyInput 
                  placeholder="0" 
                  value={rice3Ratio} 
                  onChange={(v: any) => setRice3Ratio(v)} 
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* TOGGLE 3RD RICE BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        {!showThirdRice ? (
           <button onClick={() => setShowThirdRice(true)} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px 24px', borderRadius: '8px', color: '#64748b', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
             ➕ Add 3rd Rice to Mix
           </button>
        ) : (
           <button onClick={() => { setShowThirdRice(false); setRice3Id(''); setSearch3(''); setRice3Ratio(''); setDeductRice3Qty(''); }} style={{ background: '#fef2f2', border: '1px dashed #fca5a5', padding: '12px 24px', borderRadius: '8px', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
             ➖ Remove 3rd Rice
           </button>
        )}
      </div>

      {/* AUTO-CALCULATED RESULT PANEL */}
      {calcResult && (
        <div className="result-panel fade-in" style={{ marginTop: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-header" style={{ margin: 0 }}>Auto-Calculated Mixture</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setSyncMode('existing')} style={{ padding: '10px 16px', borderRadius: '8px', border: syncMode === 'existing' ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: syncMode === 'existing' ? '#eff6ff' : '#fff', color: syncMode === 'existing' ? '#1e40af' : '#475569', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                📦 Add to Existing Stock
              </button>
              <button onClick={() => setSyncMode('new')} style={{ padding: '10px 16px', borderRadius: '8px', border: syncMode === 'new' ? '2px solid #10b981' : '1px solid #cbd5e1', background: syncMode === 'new' ? '#f0fdf4' : '#fff', color: syncMode === 'new' ? '#166534' : '#475569', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                ✨ Create New Rice
              </button>
            </div>
          </div>
          
          <div className="result-stats" style={{ marginBottom: syncMode !== 'none' ? '24px' : '0' }}>
            <div className="stat-box">
              <span className="label">Total Output Portion</span>
              <span className="value">{calcResult.totalRatio}</span>
            </div>
            <div className="stat-box highlight">
              <span className="label">New Blended Cost (COGS)</span>
              <span className="value text-gold">{formatRiel(calcResult.cogs)}</span>
            </div>
          </div>

          {/* INLINE INVENTORY SYNC FORM */}
          {syncMode !== 'none' && (
            <div className="fade-in" style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
                {syncMode === 'new' ? 'Create & Sync New Product' : 'Sync to Existing Product'}
              </div>

              {syncMode === 'new' ? (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>New Product Name</label>
                    <input type="text" placeholder={`e.g. Mix ${rice1?.name.split(' ')[0]}-${rice2?.name.split(' ')[0]}`} value={newMixName} onChange={e => setNewMixName(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Target Selling Price (៛)</label>
                    <CurrencyInput value={newMixPrice} onChange={(v: any) => setNewMixPrice(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#0f172a' }} />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Select Target Product</label>
                  <select value={targetProductId} onChange={e => setTargetProductId(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '16px', color: '#0f172a', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}>
                    <option value="">-- Choose Existing Product --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current Cost: {formatRiel(p.cost_price)})</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: '20px' }}>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold' }}>➕ ADD Output Stock</label>
                  <CurrencyInput value={addStockQty} onChange={(v:any) => setAddStockQty(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #10b981', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>➖ DEDUCT: {rice1?.name}</label>
                  <CurrencyInput value={deductRice1Qty} onChange={(v:any) => setDeductRice1Qty(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ef4444', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>➖ DEDUCT: {rice2?.name}</label>
                  <CurrencyInput value={deductRice2Qty} onChange={(v:any) => setDeductRice2Qty(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ef4444', boxSizing: 'border-box' }} />
                </div>
                {showThirdRice && rice3 && (
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>➖ DEDUCT: {rice3?.name}</label>
                    <CurrencyInput value={deductRice3Qty} onChange={(v:any) => setDeductRice3Qty(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ef4444', boxSizing: 'border-box' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button onClick={handleExecuteInventorySync} disabled={isProcessing} style={{ padding: '14px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: (isProcessing) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)' }}>
                  {isProcessing ? 'Processing...' : '✅ Confirm & Sync Inventory'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* HISTORY LOG */}
      <div className="history-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: '#1e293b', margin: 0, fontSize: '16px' }}>Calculation History</h3>
          {history.length > 0 && (
             <button onClick={clearHistory} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Clear History</button>
          )}
        </div>
        
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Time</th>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Recipe Formula</th>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Mixed COGS</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No calculations logged yet.</td></tr>
              ) : (
                history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: '13px' }}>{h.time}</td>
                    <td style={{ padding: '14px 16px', color: '#334155', fontSize: '14px' }}>
                      ({h.rice1Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice1Name}</span>) 
                      + ({h.rice2Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice2Name}</span>)
                      {h.rice3Name && h.rice3Ratio ? (
                        <> + ({h.rice3Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice3Name}</span>)</>
                      ) : null}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#b58a3d', fontWeight: 'bold', fontSize: '14px' }}>{formatRiel(h.mixedCogs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- GLOBAL CSS --- */}
      <style jsx global>{`
        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        .main-wrapper {
          padding: 24px 24px 24px 75px;
          background: #f8fafc;
          min-height: 100vh;
          font-family: Arial, sans-serif;
          color: #333;
          box-sizing: border-box;
        }

        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .page-title {
          font-size: 24px !important;
          font-weight: bold;
          color: #4a3b1b !important;
          margin: 0;
          letter-spacing: -0.5px;
        }

        .action-btn {
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .calculator-grid {
          display: flex;
          align-items: flex-start;
          gap: 20px;
          flex-wrap: wrap;
        }
        .math-symbol {
          font-size: 32px;
          font-weight: bold;
          color: #cbd5e1;
          margin-top: 40px;
        }
        .calc-card {
          flex: 1;
          min-width: 250px;
          background: #fff;
          padding: 24px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .card-header {
          margin: 0 0 16px 0;
          font-size: 16px;
          color: #475569;
          text-transform: uppercase;
          font-weight: bold;
        }
        .input-group label {
          display: block;
          font-size: 12px;
          font-weight: bold;
          color: #64748b;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .input-group input {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #fff;
          font-size: 16px;
          outline: none;
          box-sizing: border-box;
          color: #0f172a;
        }
        .input-group input:focus {
          border-color: #3b82f6;
        }
        
        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          margin-top: 4px;
          max-height: 250px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        }
        .dropdown-item {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
        }
        .dropdown-item:hover {
          background: #f8fafc;
        }
        
        .price-display {
          margin-top: 16px;
          padding: 16px;
          background: #fefcf3;
          border: 1px solid #eadeca;
          border-radius: 8px;
        }
        .price-display .label {
          display: block;
          font-size: 11px;
          color: #8a7650;
          text-transform: uppercase;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .price-display .value {
          font-size: 18px;
          color: #b58a3d;
          font-weight: bold;
        }

        .result-panel {
          background: #fff;
          padding: 24px;
          border-radius: 12px;
          border: 2px solid #bbf7d0;
          margin-bottom: 30px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .result-stats {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        .stat-box {
          flex: 1;
          min-width: 200px;
          padding: 16px 24px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .stat-box.highlight {
          background: #fefcf3;
          border-color: #fde047;
        }
        .stat-box .label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 6px;
          text-transform: uppercase;
          font-weight: bold;
        }
        .stat-box .value {
          display: block;
          font-size: 24px;
          color: #1e293b;
          font-weight: bold;
        }
        .text-gold { color: #b58a3d !important; }

        .history-section {
          margin-top: 40px;
        }

        @media (max-width: 1023px) {
          .main-wrapper {
            /* Pulls the page up */
            padding: max(20px, env(safe-area-inset-top, 20px)) 16px 24px 16px !important;
          }
          .header-container {
            /* Pushes title to the right of the hamburger icon */
            margin-left: 54px !important;
            margin-bottom: 24px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
          }
          .page-title {
            font-size: 22px !important;
            margin: 0 !important;
          }
          .calculator-grid {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          .math-symbol {
            display: none;
          }
          .result-stats {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  )
}