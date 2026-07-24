'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types'
import { formatRiel } from '@/utils/formatters'
import { CurrencyInput } from '@/components/Inputs'
import { useToast } from '@/components/ToastProvider'

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

  // 🟢 REUSABLE DROPDOWN COMPONENT (Search bar removed from here)
  const renderDropdownMenu = (target: string) => {
    if (activeDropdown !== target) return null;
    return (
      <div className="dropdown-menu-container">
        
        {/* Category Tabs */}
        <div className="dropdown-tab-container">
          <button 
            onClick={(e) => { e.stopPropagation(); setDropdownTab('wholesale'); }} 
            className={`dropdown-tab-btn ${dropdownTab === 'wholesale' ? 'active' : 'inactive'}`}
          >
            🌾 Wholesale
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setDropdownTab('retail'); }} 
            className={`dropdown-tab-btn ${dropdownTab === 'retail' ? 'active' : 'inactive'}`}
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
      <div className="calc-card fade-in">
        <h2 className="card-header">{label}</h2>
        <div className="input-group" style={{ position: 'relative' }}>
          <label>Select Rice Ingredient</label>
          
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
              className={`rice-card-trigger ${activeDropdown === target ? 'active' : 'inactive'} mobile-input-field`}
              style={{ paddingRight: '30px' }}
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
          <label>Portion / Quantity ({unitLabel})</label>
          <CurrencyInput 
            placeholder="0" 
            value={qty} 
            onChange={(v: any) => setQty(v)} 
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
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
          <h1 className="page-title">🧮 Rice Mix Calculator</h1>
        </div>
        <button className="action-btn" onClick={handleReset} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>↺ Reset</button>
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
           <button onClick={() => setShowThirdRice(true)} style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '12px 24px', borderRadius: '8px', color: '#64748b', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
             ➕ Add 3rd Rice to Mix
           </button>
        ) : (
           <button onClick={() => { setShowThirdRice(false); setRice3Id(''); setRice3Qty(''); }} style={{ background: '#fef2f2', border: '1px dashed #fca5a5', padding: '12px 24px', borderRadius: '8px', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
             ➖ Remove 3rd Rice
           </button>
        )}
      </div>

      {/* AUTO-CALCULATED RESULT PANEL */}
      {calcResult && (
        <div className="result-panel fade-in" style={{ marginTop: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 className="card-header" style={{ margin: 0 }}>Auto-Calculated Yield</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => setSyncMode('existing')} style={{ padding: '10px 16px', borderRadius: '8px', border: syncMode === 'existing' ? '2px solid #3b82f6' : '1px solid #cbd5e1', background: syncMode === 'existing' ? '#eff6ff' : '#fff', color: syncMode === 'existing' ? '#1e40af' : '#475569', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                📦 Add to Existing
              </button>
              <button onClick={() => setSyncMode('new')} style={{ padding: '10px 16px', borderRadius: '8px', border: syncMode === 'new' ? '2px solid #10b981' : '1px solid #cbd5e1', background: syncMode === 'new' ? '#f0fdf4' : '#fff', color: syncMode === 'new' ? '#166534' : '#475569', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px' }}>
                ✨ Create New
              </button>
            </div>
          </div>
          
          <div className="result-stats" style={{ marginBottom: syncMode !== 'none' ? '24px' : '0' }}>
            <div className="stat-box" style={{ flex: 1.5 }}>
              <span className="label">Total Raw Mix Weight</span>
              <span className="value" style={{ color: '#3b82f6' }}>
                {calcResult.totalYieldKg.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ fontSize: '16px', fontWeight: 'normal' }}>Kg</span>
              </span>
            </div>
            
            {/* Dynamic View showing exactly what this makes */}
            <div className="stat-box highlight" style={{ flex: 2 }}>
              <span className="label">Will Generate Output of:</span>
              <span className="value text-gold" style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                 {finalYield.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#8a7650' }}>{outputUnit}</span>
              </span>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', fontWeight: 'bold' }}>
                At new COGS: <span style={{ color: '#0f172a' }}>{formatRiel(finalCogs)} per {outputUnit.slice(0,-1)}</span>
              </div>
            </div>
          </div>

          {/* INLINE INVENTORY SYNC FORM */}
          {syncMode !== 'none' && (
            <div className="sync-form-container fade-in">
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
                {syncMode === 'new' ? 'Create & Sync New Product' : 'Select Target to Sync & Overwrite'}
              </div>

              {syncMode === 'new' ? (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="sync-input-label">New Product Name</label>
                    <input type="text" placeholder={`e.g. Mix ${rice1?.name.split(' ')[0]}-${rice2?.name.split(' ')[0]}`} value={newMixName} onChange={e => setNewMixName(e.target.value)} className="sync-input-field" />
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="sync-input-label">Size Type</label>
                    <select value={newMixType} onChange={(e: any) => setNewMixType(e.target.value)} className="sync-input-field" style={{ cursor: 'pointer' }}>
                      <option value="wholesale">Wholesale (50kg Bag)</option>
                      <option value="retail">Retail (1kg)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <label className="sync-input-label">Selling Price (៛)</label>
                    <CurrencyInput value={newMixPrice} onChange={(v: any) => setNewMixPrice(v)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', color: '#0f172a' }} />
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
                      className={`rice-card-trigger ${activeDropdown === 'target' ? 'active-target' : 'inactive-target'} mobile-input-field`}
                      style={{ color: targetProd ? '#1e293b' : '#3b82f6', fontWeight: 'bold', paddingRight: '30px' }}
                    />
                    <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#3b82f6', fontSize: '12px' }}>▼</span>
                  </div>
                  
                  {renderDropdownMenu('target')}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button onClick={handleExecuteInventorySync} disabled={isProcessing} className="sync-submit-btn">
                  {isProcessing ? 'Processing...' : `✅ Sync and Inject ${finalYield.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${outputUnit}`}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Time</th>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Recipe Formula</th>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Final Yield</th>
                <th style={{ padding: '14px 16px', color: '#475569', fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>Mixed COGS</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No calculations logged yet.</td></tr>
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
                    <td style={{ padding: '14px 16px', color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>{h.yieldStr || '-'}</td>
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
        /* DE-INLINED CORE STYLES */
        .dropdown-menu-container {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; background-color: #fff;
          border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          z-index: 101; overflow: hidden; display: flex; flex-direction: column;
        }
        .dropdown-tab-container {
          display: flex; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
        }
        .dropdown-tab-btn {
          flex: 1; padding: 10px; font-weight: bold; border: none; background: transparent; 
          cursor: pointer; font-size: 13px; transition: all 0.2s;
        }
        .dropdown-tab-btn.active {
          background: #fff; color: #b58a3d; border-bottom: 2px solid #b58a3d;
        }
        .dropdown-tab-btn.inactive {
          color: #64748b; border-bottom: none;
        }
        .dropdown-results-container {
          max-height: 220px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px;
        }
        .dropdown-result-item {
          padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; border-radius: 6px; transition: background 0.2s;
        }
        .dropdown-result-item:hover {
          background-color: #f8fafc;
        }
        
        .rice-card-trigger {
          width: 100%; padding: 12px 14px; border-radius: 8px; cursor: text; background-color: #fff; 
          font-size: 15px; box-sizing: border-box; outline: none; color: #1e293b;
        }
        .rice-card-trigger.active { border: 2px solid #b58a3d; }
        .rice-card-trigger.inactive { border: 1px solid #cbd5e1; }
        .rice-card-trigger.active-target { border: 2px solid #3b82f6; }
        .rice-card-trigger.inactive-target { border: 1px solid #3b82f6; }
        
        .sync-form-container {
          background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;
        }
        .sync-input-label {
          display: block; font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 6px; text-transform: uppercase;
        }
        .sync-input-field {
          width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; box-sizing: border-box; 
          font-size: 16px; color: #0f172a; outline: none; background-color: #fff;
        }
        .sync-submit-btn {
          padding: 14px 24px; background: #10b981; color: #fff; border: none; border-radius: 8px; 
          font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2); transition: filter 0.2s;
        }
        .sync-submit-btn:disabled {
          cursor: not-allowed; opacity: 0.7;
        }
        .sync-submit-btn:not(:disabled):hover {
          cursor: pointer; filter: brightness(1.05);
        }

        /* ORIGINAL STYLES PRESERVED */
        input[type="text"].no-spinners::-webkit-inner-spin-button,
        input[type="text"].no-spinners::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        
        .main-wrapper {
          padding: max(20px, env(safe-area-inset-top, 20px)) 24px 24px 24px;
          background: #f8fafc; min-height: 100vh; font-family: Arial, sans-serif; color: #333; box-sizing: border-box; width: 100%;
        }

        .header-container {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; margin-top: 0; margin-left: 60px; gap: 12px; min-height: 42px; width: calc(100% - 60px); max-width: 1600px;
        }
        
        .header-left {
          display: flex; align-items: center; gap: 12px;
        }

        .page-title {
          font-size: 24px !important; font-weight: bold; color: #4a3b1b !important; margin: 0 !important; letter-spacing: -0.5px; line-height: normal !important; display: flex; align-items: center; min-width: 0; white-space: nowrap !important;
        }

        .action-btn {
          padding: 10px 16px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; transition: background 0.2s;
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
        .calc-card { flex: 1; min-width: 250px; background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .card-header { margin: 0 0 16px 0; font-size: 16px; color: #475569; text-transform: uppercase; font-weight: bold; }
        .input-group label { display: block; font-size: 12px; font-weight: bold; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
        
        .price-display { margin-top: 16px; padding: 16px; background: #fefcf3; border: 1px solid #eadeca; border-radius: 8px; }
        .price-display .label { display: block; font-size: 11px; color: #8a7650; text-transform: uppercase; font-weight: bold; margin-bottom: 4px; }
        .price-display .value { font-size: 18px; color: #b58a3d; font-weight: bold; }

        .result-panel { background: #fff; padding: 24px; border-radius: 12px; border: 2px solid #bbf7d0; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .result-stats { display: flex; gap: 20px; flex-wrap: wrap; }
        .stat-box { flex: 1; min-width: 200px; padding: 16px 24px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
        .stat-box.highlight { background: #fefcf3; border-color: #fde047; }
        .stat-box .label { display: block; font-size: 12px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; font-weight: bold; }
        .stat-box .value { display: block; font-size: 24px; color: #1e293b; font-weight: bold; }
        .text-gold { color: #b58a3d !important; }
        .history-section { margin-top: 40px; }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

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
          .page-title {
            font-size: 22px !important;
            line-height: normal !important; 
            white-space: nowrap !important;
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