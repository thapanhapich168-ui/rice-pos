'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'
import { formatRiel } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'
import EmptyState from '@/components/EmptyState'

// --- LOCAL TYPES ---
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
  yieldStr: string
}

export default function RiceMixCalculator() {
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([])
  
  // Selection States
  const [rice1Id, setRice1Id] = useState<string>('')
  const [rice1Qty, setRice1Qty] = useState<number | ''>('')
  
  const [rice2Id, setRice2Id] = useState<string>('')
  const [rice2Qty, setRice2Qty] = useState<number | ''>('')

  const [showThirdRice, setShowThirdRice] = useState(false)
  const [rice3Id, setRice3Id] = useState<string>('')
  const [rice3Qty, setRice3Qty] = useState<number | ''>('')

  // 🟢 INLINE DROPDOWN STATES
  const [activeDropdown, setActiveDropdown] = useState<'rice1' | 'rice2' | 'rice3' | 'target' | null>(null)
  const [dropdownSearch, setDropdownSearch] = useState('')
  const [dropdownTab, setDropdownTab] = useState<'wholesale' | 'retail'>('wholesale')

  // Auto-Calc Results & History
  const [calcResult, setCalcResult] = useState<{ blendedCogsPerKg: number, totalYieldKg: number, totalCost: number } | null>(null)
  const [history, setHistory] = useState<MixHistory[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Inline Sync Action States
  const [syncMode, setSyncMode] = useState<'none' | 'existing' | 'new'>('none')
  const [targetProductId, setTargetProductId] = useState<string>('')
  
  const [newMixName, setNewMixName] = useState('')
  const [newMixPrice, setNewMixPrice] = useState<number | ''>('')
  const [newMixType, setNewMixType] = useState<'wholesale' | 'retail'>('wholesale')

  useEffect(() => {
    fetchProducts()
    fetchHistory()
  }, [])

  const rice1 = products.find(p => p.id.toString() === rice1Id)
  const rice2 = products.find(p => p.id.toString() === rice2Id)
  const rice3 = products.find(p => p.id.toString() === rice3Id)
  const targetProd = products.find(p => p.id.toString() === targetProductId)

  // 🧠 SMART MATH ENGINE
  useEffect(() => {
    const q1 = Number(rice1Qty) || 0;
    const q2 = Number(rice2Qty) || 0;
    const q3 = showThirdRice ? (Number(rice3Qty) || 0) : 0;

    const hasValidThird = showThirdRice ? rice3 : true;

    if (rice1 && rice2 && hasValidThird && (q1 + q2 + q3) > 0) {
      const w1 = Number(rice1.weight) >= 50 ? 50 : 1;
      const w2 = Number(rice2.weight) >= 50 ? 50 : 1;
      const w3 = rice3 ? (Number(rice3.weight) >= 50 ? 50 : 1) : 1;

      // Convert all inputs to raw Kg to find true blend
      const kg1 = q1 * w1;
      const kg2 = q2 * w2;
      const kg3 = q3 * w3;
      const totalYieldKg = kg1 + kg2 + kg3;

      // Calculate total physical cost of the mixture
      const cost1 = q1 * rice1.cost_price;
      const cost2 = q2 * rice2.cost_price;
      const cost3 = rice3 ? (q3 * rice3.cost_price) : 0;
      const totalCost = cost1 + cost2 + cost3;

      const blendedCogsPerKg = totalYieldKg > 0 ? (totalCost / totalYieldKg) : 0;
      
      setCalcResult({ blendedCogsPerKg, totalYieldKg, totalCost });
    } else {
      setCalcResult(null);
      setSyncMode('none');
    }
  }, [rice1Id, rice2Id, rice3Id, rice1Qty, rice2Qty, rice3Qty, showThirdRice, products, rice1, rice2, rice3])

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

  const handleReset = () => {
    setRice1Id(''); setRice1Qty('');
    setRice2Id(''); setRice2Qty('');
    setRice3Id(''); setRice3Qty('');
    setShowThirdRice(false);
    setCalcResult(null);
    setSyncMode('none');
    setNewMixName(''); setNewMixPrice(''); setTargetProductId('');
    setActiveDropdown(null);
  }

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all calculator history?')) return
    setHistory([])
    await supabase.from('app_settings').upsert({
      setting_key: 'calculator_history',
      setting_value: []
    }, { onConflict: 'setting_key' })
  }

  // 🟢 Filter Products for the active Dropdown Box
  const dropdownFilteredProducts = products.filter(p => {
    if (dropdownSearch && !p.name.toLowerCase().includes(dropdownSearch.toLowerCase())) return false;
    const isWholesale = Number(p.weight) >= 50;
    if (dropdownTab === 'wholesale' && !isWholesale) return false;
    if (dropdownTab === 'retail' && isWholesale) return false;
    return true;
  });

  const handleSelectProduct = (p: Product, target: string) => {
    if (target === 'rice1') setRice1Id(p.id.toString());
    if (target === 'rice2') setRice2Id(p.id.toString());
    if (target === 'rice3') setRice3Id(p.id.toString());
    if (target === 'target') setTargetProductId(p.id.toString());
    setActiveDropdown(null);
  }

  // 🧮 DYNAMIC OUTPUT YIELD CALCULATION
  let outputUnit = 'Kg';
  let outputMultiplier = 1;
  let finalYield = 0;
  let finalCogs = 0;

  if (calcResult) {
    if (syncMode === 'new') {
      outputMultiplier = newMixType === 'wholesale' ? 50 : 1;
      outputUnit = newMixType === 'wholesale' ? 'Bags' : 'Kg';
    } else if (syncMode === 'existing' && targetProd) {
      outputMultiplier = Number(targetProd.weight) >= 50 ? 50 : 1;
      outputUnit = Number(targetProd.weight) >= 50 ? 'Bags' : 'Kg';
    } else {
      // Default generic display
      outputMultiplier = 50;
      outputUnit = 'Bags';
    }
    
    finalYield = calcResult.totalYieldKg / outputMultiplier;
    finalCogs = calcResult.blendedCogsPerKg * outputMultiplier;
  }

  const handleExecuteInventorySync = async () => {
    if (!calcResult || !rice1 || !rice2) return;
    if (showThirdRice && !rice3) {
      showToast('error', 'Missing Information', 'Please select the 3rd rice or remove it.');
      return;
    }
    
    const qtyToDeduct1 = Number(rice1Qty) || 0;
    const qtyToDeduct2 = Number(rice2Qty) || 0;
    const qtyToDeduct3 = showThirdRice ? (Number(rice3Qty) || 0) : 0;

    if (syncMode === 'new' && (!newMixName || !newMixPrice)) {
      showToast('error', 'Missing Information', 'Please enter a name and selling price for the new mix.');
      return;
    }
    if (syncMode === 'existing' && !targetProductId) {
      showToast('error', 'Missing Information', 'Please select an existing product to update.');
      return;
    }

    setIsProcessing(true);

    try {
      // 1. DEDUCT: Take ingredients out of stock
      if (qtyToDeduct1 > 0) await supabase.from('products').update({ stock: rice1.stock - qtyToDeduct1 }).eq('id', rice1.id);
      if (qtyToDeduct2 > 0) await supabase.from('products').update({ stock: rice2.stock - qtyToDeduct2 }).eq('id', rice2.id);
      if (showThirdRice && qtyToDeduct3 > 0 && rice3) {
        await supabase.from('products').update({ stock: rice3.stock - qtyToDeduct3 }).eq('id', rice3.id);
      }

      // 2. ADD: Put mixed result into target
      if (syncMode === 'new') {
        const payload = {
          name: newMixName,
          price: Number(newMixPrice),
          cost_price: Math.round(finalCogs),
          weight: newMixType === 'wholesale' ? 50 : 1, 
          stock: finalYield
        }
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
      } else if (targetProd) {
        const newStock = targetProd.stock + finalYield;
        const { error } = await supabase.from('products').update({ 
          stock: newStock, 
          cost_price: Math.round(finalCogs) 
        }).eq('id', targetProd.id);
        if (error) throw error;
      }

      // 3. LOG HISTORY
      const yieldStr = `${finalYield.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${outputUnit}`;
      const newRecord: MixHistory = {
        id: Date.now().toString(),
        time: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        rice1Name: rice1.name,
        rice1Ratio: qtyToDeduct1,
        rice2Name: rice2.name,
        rice2Ratio: qtyToDeduct2,
        rice3Name: showThirdRice && rice3 ? rice3.name : undefined,
        rice3Ratio: showThirdRice ? qtyToDeduct3 : undefined,
        mixedCogs: finalCogs,
        yieldStr: yieldStr
      }
      const updatedHistory = [newRecord, ...history].slice(0, 50) 
      setHistory(updatedHistory)
      await supabase.from('app_settings').upsert({ setting_key: 'calculator_history', setting_value: updatedHistory }, { onConflict: 'setting_key' })

      showToast('success', 'Sync Successful', 'Inventory successfully synced and updated!');
      handleReset();
      fetchProducts();

    } catch (err: any) {
      showToast('error', 'Sync Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  // 🟢 REUSABLE DROPDOWN COMPONENT
  const renderDropdownMenu = (target: string) => {
    if (activeDropdown !== target) return null;
    return (
      <div className="dropdown-menu-container">
        
        {/* Category Tabs using Global SaaS Classes */}
        <div className="saas-tab-container" style={{ margin: '8px', marginBottom: 0, padding: '4px', border: 'none', boxShadow: 'none', background: '#f1f5f9' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setDropdownTab('wholesale'); }} 
            className={`saas-tab ${dropdownTab === 'wholesale' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '8px' }}
          >
            🌾 Wholesale
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setDropdownTab('retail'); }} 
            className={`saas-tab ${dropdownTab === 'retail' ? 'active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '8px' }}
          >
            🛍️ Retail
          </button>
        </div>
        
        {/* Scrollable Results */}
        <div className="dropdown-results-container hide-scrollbar">
          {dropdownFilteredProducts.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No products found</div>
          ) : (
            dropdownFilteredProducts.map(p => (
              <div 
                key={p.id} 
                onClick={(e) => { e.stopPropagation(); handleSelectProduct(p, target); }} 
                className="dropdown-result-item"
              >
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>{p.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                  <span>Cost: <b style={{ color: '#b58a3d' }}>{formatRiel(p.cost_price)}</b></span>
                  <span>Stock: <b style={{ color: p.stock > 0 ? '#10b981' : '#ef4444' }}>{p.stock}</b></span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // 🟢 RICE INGREDIENT CARD GENERATOR
  const renderRiceCard = (label: string, riceData: Product | undefined, qty: number | '', setQty: any, target: 'rice1' | 'rice2' | 'rice3') => {
    const isWholesale = riceData ? Number(riceData.weight) >= 50 : true;
    const unitLabel = isWholesale ? 'Bags' : 'Kg';

    return (
      <div className="saas-card fade-in" style={{ flex: 1, minWidth: '250px' }}>
        <h2 className="saas-card-title">{label}</h2>
        <div className="input-group" style={{ position: 'relative' }}>
          <label className="saas-card-title" style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}>Select Rice Ingredient</label>
          
          {/* Invisible Overlay to catch outside clicks and close the dropdown */}
          {activeDropdown === target && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} onClick={() => setActiveDropdown(null)}></div>
          )}

          {/* Trigger Box - NOW ACTS AS THE SEARCH INPUT */}
          <div style={{ position: 'relative', zIndex: activeDropdown === target ? 100 : 1 }}>
            <input 
              type="text"
              placeholder="🔍 Search rice..."
              value={activeDropdown === target ? dropdownSearch : (riceData ? riceData.name : '')}
              onClick={() => {
                if (activeDropdown !== target) {
                  setActiveDropdown(target);
                  setDropdownSearch('');
                  setDropdownTab('wholesale');
                }
              }}
              onChange={(e) => {
                setActiveDropdown(target);
                setDropdownSearch(e.target.value);
              }}
              className="saas-input"
              style={{ 
                paddingRight: '30px', 
                borderColor: activeDropdown === target ? '#b58a3d' : undefined,
                boxShadow: activeDropdown === target ? '0 0 0 2px rgba(181, 138, 61, 0.2)' : undefined 
              }}
            />
            <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', fontSize: '12px' }}>▼</span>
          </div>

          {/* Dropdown Menu */}
          {renderDropdownMenu(target)}
        </div>
        
        {riceData && (
          <div className="price-display fade-in">
            <span className="label">Current Cost (COGS)</span>
            <span className="value">{formatRiel(riceData.cost_price)}</span>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              Current Stock: <b style={{ color: riceData.stock > 0 ? '#10b981' : '#ef4444'}}>{riceData.stock} {unitLabel}</b>
            </div>
          </div>
        )}

        <div className="input-group" style={{ marginTop: '16px' }}>
          <label className="saas-card-title" style={{ fontSize: '11px', marginBottom: '6px', display: 'block' }}>Portion / Quantity ({unitLabel})</label>
          <CurrencyInput 
            placeholder="0" 
            value={qty} 
            onChange={(v: any) => setQty(v)} 
            className="saas-input"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="main-wrapper">
      {/* HEADER */}
      <div className="header-container">
        <div className="header-left">
          <h1 className="saas-page-title">🧮 Rice Mix Calculator</h1>
        </div>
        <button className="saas-btn saas-btn-secondary" onClick={handleReset}>↺ Reset</button>
      </div>

      {/* CALCULATOR WORKSPACE */}
      <div className="calculator-grid">
        {renderRiceCard('Base Rice A', rice1, rice1Qty, setRice1Qty, 'rice1')}
        <div className="math-symbol">+</div>
        {renderRiceCard('Base Rice B', rice2, rice2Qty, setRice2Qty, 'rice2')}
        
        {showThirdRice && (
          <>
            <div className="math-symbol">+</div>
            {renderRiceCard('Base Rice C', rice3, rice3Qty, setRice3Qty, 'rice3')}
          </>
        )}
      </div>

      {/* TOGGLE 3RD RICE BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        {!showThirdRice ? (
           <button onClick={() => setShowThirdRice(true)} className="saas-btn saas-btn-secondary" style={{ border: '1px dashed #cbd5e1' }}>
             ➕ Add 3rd Rice to Mix
           </button>
        ) : (
           <button onClick={() => { setShowThirdRice(false); setRice3Id(''); setRice3Qty(''); }} className="saas-btn saas-btn-danger" style={{ background: '#fef2f2', color: '#ef4444', border: '1px dashed #fca5a5' }}>
             ➖ Remove 3rd Rice
           </button>
        )}
      </div>

      {/* AUTO-CALCULATED RESULT PANEL */}
      {calcResult && (
        <div className="saas-card mint fade-in" style={{ marginTop: '30px', border: '2px solid #bbf7d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="saas-card-title" style={{ margin: 0, color: '#047857', fontSize: '16px' }}>Auto-Calculated Yield</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setSyncMode('existing')} 
                className={`saas-btn ${syncMode === 'existing' ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
                style={syncMode === 'existing' ? { background: '#3b82f6' } : {}}
              >
                📦 Add to Existing
              </button>
              <button 
                onClick={() => setSyncMode('new')} 
                className={`saas-btn ${syncMode === 'new' ? 'saas-btn-primary' : 'saas-btn-secondary'}`}
              >
                ✨ Create New
              </button>
            </div>
          </div>
          
          <div className="result-stats" style={{ marginBottom: syncMode !== 'none' ? '24px' : '0' }}>
            <div className="stat-box" style={{ flex: 1.5 }}>
              <span className="saas-card-title">Total Raw Mix Weight</span>
              <span className="saas-card-metric" style={{ color: '#3b82f6' }}>
                {calcResult.totalYieldKg.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ fontSize: '16px', fontWeight: 'normal' }}>Kg</span>
              </span>
            </div>
            
            {/* Dynamic View showing exactly what this makes */}
            <div className="stat-box highlight" style={{ flex: 2 }}>
              <span className="saas-card-title" style={{ color: '#8a7650' }}>Will Generate Output of:</span>
              <span className="saas-card-metric" style={{ display: 'flex', alignItems: 'baseline', gap: '8px', color: '#b58a3d' }}>
                 {finalYield.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{outputUnit}</span>
              </span>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', fontWeight: 'bold' }}>
                At new COGS: <span style={{ color: '#0f172a' }}>{formatRiel(finalCogs)} per {outputUnit.slice(0,-1)}</span>
              </div>
            </div>
          </div>

          {/* INLINE INVENTORY SYNC FORM */}
          {syncMode !== 'none' && (
            <div className="saas-card fade-in" style={{ background: '#f8fafc', padding: '20px', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
                {syncMode === 'new' ? 'Create & Sync New Product' : 'Select Target to Sync & Overwrite'}
              </div>

              {syncMode === 'new' ? (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '6px' }}>New Product Name</label>
                    <input type="text" placeholder={`e.g. Mix ${rice1?.name.split(' ')[0]}-${rice2?.name.split(' ')[0]}`} value={newMixName} onChange={e => setNewMixName(e.target.value)} className="saas-input" />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '6px' }}>Size Type</label>
                    <select value={newMixType} onChange={(e: any) => setNewMixType(e.target.value)} className="saas-input" style={{ cursor: 'pointer' }}>
                      <option value="wholesale">Wholesale (50kg Bag)</option>
                      <option value="retail">Retail (1kg)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="saas-card-title" style={{ display: 'block', fontSize: '11px', marginBottom: '6px' }}>Selling Price (៛)</label>
                    <CurrencyInput value={newMixPrice} onChange={(v: any) => setNewMixPrice(v)} className="saas-input" />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  {activeDropdown === 'target' && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} onClick={() => setActiveDropdown(null)}></div>
                  )}
                  {/* Target Trigger Box - NOW ACTS AS THE SEARCH INPUT */}
                  <div style={{ position: 'relative', zIndex: activeDropdown === 'target' ? 100 : 1 }}>
                    <input 
                      type="text"
                      placeholder="🔍 Search target product..."
                      value={activeDropdown === 'target' ? dropdownSearch : (targetProd ? `${targetProd.name} (Cost: ${formatRiel(targetProd.cost_price)})` : '')}
                      onClick={() => {
                        if (activeDropdown !== 'target') {
                          setActiveDropdown('target');
                          setDropdownSearch('');
                          setDropdownTab('wholesale');
                        }
                      }}
                      onChange={(e) => {
                        setActiveDropdown('target');
                        setDropdownSearch(e.target.value);
                      }}
                      className="saas-input"
                      style={{ 
                        color: targetProd ? '#1e293b' : '#3b82f6', 
                        fontWeight: 'bold', 
                        paddingRight: '30px',
                        borderColor: activeDropdown === 'target' ? '#3b82f6' : undefined,
                        boxShadow: activeDropdown === 'target' ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : undefined 
                      }}
                    />
                    <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#3b82f6', fontSize: '12px' }}>▼</span>
                  </div>
                  
                  {renderDropdownMenu('target')}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button onClick={handleExecuteInventorySync} disabled={isProcessing} className="saas-btn saas-btn-primary" style={{ padding: '14px 24px', fontSize: '15px' }}>
                  {isProcessing ? 'Processing...' : `✅ Sync and Inject ${finalYield.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${outputUnit}`}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* HISTORY LOG */}
      <div style={{ marginTop: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: '#1e293b', margin: 0, fontSize: '16px' }}>Calculation History</h3>
          {history.length > 0 && (
             <button onClick={clearHistory} className="saas-btn saas-btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }}>Clear History</button>
          )}
        </div>
        
        <div className="saas-table-wrapper">
          <div className="saas-table-responsive">
            <table className="saas-table">
              <thead>
                <tr>
                  <th className="saas-th">Time</th>
                  <th className="saas-th">Recipe Formula</th>
                  <th className="saas-th">Final Yield</th>
                  <th className="saas-th">Mixed COGS</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 0 }}>
                      <EmptyState 
                        icon="🕒" 
                        title="No history yet" 
                        message="Calculations and inventory syncs will appear here." 
                      />
                    </td>
                  </tr>
                ) : (
                  history.map(h => (
                    <tr key={h.id} className="saas-tr">
                      <td className="saas-td" style={{ color: '#64748b', fontSize: '13px' }}>{h.time}</td>
                      <td className="saas-td" style={{ color: '#334155', fontSize: '14px' }}>
                        ({h.rice1Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice1Name}</span>) 
                        + ({h.rice2Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice2Name}</span>)
                        {h.rice3Name && h.rice3Ratio ? (
                          <> + ({h.rice3Ratio} × <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{h.rice3Name}</span>)</>
                        ) : null}
                      </td>
                      <td className="saas-td" style={{ color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>{h.yieldStr || '-'}</td>
                      <td className="saas-td" style={{ color: '#b58a3d', fontWeight: 'bold', fontSize: '14px' }}>{formatRiel(h.mixedCogs)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- PAGE-SPECIFIC CSS --- */}
      <style jsx global>{`
        .dropdown-menu-container {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; background-color: #fff;
          border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          z-index: 101; overflow: hidden; display: flex; flex-direction: column;
        }
        .dropdown-results-container {
          max-height: 220px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px;
        }
        .dropdown-result-item {
          padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; border-radius: 8px; transition: background 0.2s;
        }
        .dropdown-result-item:hover {
          background-color: #f8fafc;
        }

        .header-container {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; margin-top: 0; margin-left: 60px; gap: 12px; min-height: 42px; width: calc(100% - 60px); max-width: 1600px;
        }
        .header-left {
          display: flex; align-items: center; gap: 12px;
        }

        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .calculator-grid { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
        .math-symbol { font-size: 32px; font-weight: bold; color: #cbd5e1; margin-top: 40px; }
        
        .price-display { margin-top: 16px; padding: 16px; background: #fefcf3; border: 1px solid #eadeca; border-radius: 8px; }
        .price-display .label { display: block; font-size: 11px; color: #8a7650; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
        .price-display .value { font-size: 18px; color: #b58a3d; font-weight: bold; }

        .result-stats { display: flex; gap: 20px; flex-wrap: wrap; }
        .stat-box { flex: 1; min-width: 200px; padding: 16px 24px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .stat-box.highlight { background: #fefcf3; border-color: #fde047; }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        @media (max-width: 1023px) {
          .header-container {
            margin-left: 54px !important;
            margin-bottom: 24px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-right: 0 !important;
            margin-top: 0 !important;
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
          }
          .header-left {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
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