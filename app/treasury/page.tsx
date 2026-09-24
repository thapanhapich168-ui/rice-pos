'use client'

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CurrencyInput } from '@/components/Inputs';
import { useBranch } from '@/components/BranchContext';
import { useToast } from '@/components/ToastProvider';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';
import Modal from '@/components/Modal';

// --- CUSTOM TREASURY DROPDOWN ---
function TreasuryWalletDropdown({ selectedId, wallets, onChange, placeholder }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedWallet = wallets.find((w: any) => w.id.toString() === selectedId);

  const getIcon = (name: string) => {
    if (name.includes('ABA')) return '📱';
    if (name.includes('Chest')) return '🗄️';
    if (name.includes('Mom')) return '👩';
    return '💵';
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: '#fff', border: '1px solid #cbd5e1', 
          borderRadius: '8px', cursor: 'pointer', height: '50px', boxSizing: 'border-box',
          fontSize: '15px', color: '#0f172a', transition: 'all 0.2s',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
        }}
      >
        {selectedWallet ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <span>{getIcon(selectedWallet.name)}</span> {selectedWallet.name} 
            <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '13px', marginLeft: '4px' }}>
              ({new Intl.NumberFormat('en-US').format(selectedWallet.balance)} {selectedWallet.currency === 'USD' ? '$' : '៛'})
            </span>
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>{placeholder}</span>
        )}
        <span style={{ fontSize: '10px', color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>
      
      {isOpen && (
        <div className="hide-scrollbar" style={{ 
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', 
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', overflowY: 'auto', maxHeight: '250px',
          display: 'flex', flexDirection: 'column', padding: '6px'
        }}>
          {wallets.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No wallets found</div>
          ) : (
            wallets.map((w: any) => (
              <div 
                key={w.id}
                onClick={() => { onChange(w.id.toString()); setIsOpen(false); }}
                style={{ 
                  padding: '12px 14px', cursor: 'pointer', fontSize: '14px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: selectedId === w.id.toString() ? '#f8fafc' : '#fff',
                  borderRadius: '8px', color: '#0f172a', transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = selectedId === w.id.toString() ? '#f8fafc' : '#fff')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: selectedId === w.id.toString() ? 'bold' : 'normal' }}>
                  <span>{getIcon(w.name)}</span> {w.name}
                </span>
                <span style={{ fontWeight: 'bold', color: w.currency === 'USD' ? '#15803d' : '#b58a3d' }}>
                  {new Intl.NumberFormat('en-US').format(w.balance)} {w.currency === 'USD' ? '$' : '៛'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TreasuryPage() {
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  
  const [wallets, setWallets] = useState<any[]>([]);
  const [arBalanceRiel, setArBalanceRiel] = useState<number>(0);
  const [arBalanceUsd, setArBalanceUsd] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'balances' | 'transfer'>('balances');
  
  // SETTINGS MODAL STATE
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [draftBalances, setDraftBalances] = useState<Record<string, number | ''>>({});

  // 🚀 ISOLATE TRANSFERABLE WALLETS: Safely filters out Accounts Receivable from UI Dropdowns
  const transferableWallets = wallets.filter(
    w => !(w.name || '').toLowerCase().includes('receiv')
  );

  // SYNC WITH LIVE BALANCES
  useEffect(() => {
    if (isSettingsOpen) {
      const currentBalances: Record<string, number | ''> = {};
      transferableWallets.forEach(w => {
        currentBalances[w.id] = Number(w.balance) || 0;
      });
      setDraftBalances(currentBalances);
    }
  }, [isSettingsOpen, wallets]);

  // Transfer Form State
  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferNotes, setTransferNotes] = useState('');

  // TEST BUTTON STATE & LOGIC
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  
  const handleSendTestAlert = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await fetch('/api/cron/treasury');
      const data = await res.json(); 
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP Error: ${res.status}`);
      }
      
      showToast('success', 'Test Sent!', 'Check your Telegram app right now.');
    } catch (err: any) {
      showToast('error', 'Test Failed', err.message);
    } finally {
      setIsTestingTelegram(false);
    }
  };

  useEffect(() => {
    fetchWallets();
    fetchAccountsReceivable();
  }, [activeBranchId]);

  async function fetchWallets() {
    setIsLoading(true);
    
    let query = supabase.from('wallets').select('*').order('id', { ascending: true });
    if (activeBranchId !== 0) query = query.eq('branch_id', activeBranchId);
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Wallet fetch error:', error);
      showToast('error', 'Database Error', error.message);
    } else if (data) {
      setWallets(data);
    }
    
    setIsLoading(false);
  }

  // 🚀 FETCH REAL ACCOUNTS RECEIVABLE TO MATCH DASHBOARD
  async function fetchAccountsReceivable() {
    try {
      // 1. Fetch Unpaid Invoices (Biz AR)
      let invQuery = supabase.from('invoice_summaries').select('owner, balance_due').eq('is_done', false);
      if (activeBranchId !== 0) invQuery = invQuery.eq('branch_id', activeBranchId);
      
      // 2. Fetch Staff Debt
      let staffQuery = supabase.from('staff').select('total_debt_riel, total_debt_usd');
      if (activeBranchId !== 0) staffQuery = staffQuery.eq('branch_id', activeBranchId);
      
      // 3. Fetch Family Debt (Manual App Settings)
      const familyKeys = activeBranchId === 0 
        ? ['family_owe_riel', 'family_owe_usd'] 
        : [`family_owe_riel_${activeBranchId}`, `family_owe_usd_${activeBranchId}`];
      const settingsQuery = supabase.from('app_settings').select('setting_key, setting_value').in('setting_key', familyKeys);

      // Execute all 3 simultaneously for speed
      const [invRes, staffRes, settingsRes] = await Promise.all([invQuery, staffQuery, settingsQuery]);

      let rielDebt = 0;
      let usdDebt = 0;

      // Add Biz AR (Riel only)
      if (invRes.data) {
        invRes.data.forEach((inv: any) => {
          const owner = String(inv.owner || '').toLowerCase().trim();
          if (owner !== 'mom') {
            rielDebt += Number(inv.balance_due || 0);
          }
        });
      }

      // Add Staff Debt
      if (staffRes.data) {
        staffRes.data.forEach((staff: any) => {
          rielDebt += Number(staff.total_debt_riel || 0);
          usdDebt += Number(staff.total_debt_usd || 0);
        });
      }

      // Add Family Debt
      if (settingsRes.data) {
        settingsRes.data.forEach((setting: any) => {
          if (setting.setting_key.includes('family_owe_riel')) rielDebt += Number(setting.setting_value || 0);
          if (setting.setting_key.includes('family_owe_usd')) usdDebt += Number(setting.setting_value || 0);
        });
      }

      // 🚀 Store exact currencies natively without converting!
      setArBalanceRiel(rielDebt);
      setArBalanceUsd(usdDebt);
      
    } catch (err) {
      console.error('AR fetch error:', err);
    }
  }

  const handleSaveInitialBalances = async () => {
    setIsProcessing(true);
    try {
      const updatePromises = transferableWallets.map(async (w) => {
        const newBal = Number(String(draftBalances[w.id] || '').replace(/,/g, ''));
        if (isNaN(newBal)) return;
        
        const currentBal = Number(w.balance) || 0;
        const difference = newBal - currentBal;

        if (difference !== 0) {
          const targetBranchId = w.branch_id || (activeBranchId === 0 ? 1 : activeBranchId);

          const { error } = await supabase.rpc('record_wallet_transaction', {
            p_wallet_name: w.name,
            p_amount: difference, 
            p_reference_type: 'TREASURY',
            p_reference_id: 'MANUAL_SYNC',
            p_description: 'Manual Balance Sync / Adjustment',
            p_branch_id: targetBranchId
          });
          if (error) throw error;
        }
      });

      await Promise.all(updatePromises);
      showToast('success', 'Balances Synced', 'Your accounts now exactly match the numbers you entered.');
      setIsSettingsOpen(false);
      fetchWallets();
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromWalletId || !toWalletId) return showToast('error', 'Missing Data', 'Select both origin and destination wallets.');
    if (fromWalletId === toWalletId) return showToast('error', 'Invalid', 'Cannot transfer to the same wallet.');
    if (!transferAmount || transferAmount <= 0) return showToast('error', 'Invalid Amount', 'Enter a valid transfer amount.');

    const fromWallet = transferableWallets.find(w => w.id.toString() === fromWalletId);
    const toWallet = transferableWallets.find(w => w.id.toString() === toWalletId);

    if (fromWallet?.currency !== toWallet?.currency) {
      return showToast('error', 'Currency Mismatch', 'Cannot transfer KHR directly to USD without a dedicated exchange action.');
    }

    setIsProcessing(true);
    try {
      const transferVal = Number(transferAmount);
      const safeNotes = transferNotes.trim() || 'Internal Treasury Transfer';

      const { error: transferErr } = await supabase.rpc('execute_treasury_transfer', {
          p_from_wallet: fromWallet.name,
          p_to_wallet: toWallet.name,
          p_amount: transferVal,
          p_notes: safeNotes,
          p_branch_id: activeBranchId
      });
      
      if (transferErr) throw transferErr;

      const fromBalAfter = Number(fromWallet.balance) - transferVal;
      const toBalAfter = Number(toWallet.balance) + transferVal;

      const botToken = TELEGRAM_CONFIG.botToken || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
      const masterChatId = TELEGRAM_CONFIG.chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;
      const targetThreadId = (TELEGRAM_CONFIG as any).treasuryTopics?.[activeBranchId];

      if (botToken && masterChatId) {
        const symbol = fromWallet.currency === 'USD' ? '$' : '៛';
        const formatBal = (n: number) => new Intl.NumberFormat('en-US').format(n);

        let alertMsg = `🔄 *INTERNAL TREASURY TRANSFER*\n`;
        alertMsg += `🏬 Branch ID: *${activeBranchId}*\n`;
        alertMsg += `📅 Date: ${new Date().toLocaleString('en-GB')}\n\n`;
        alertMsg += `📤 *Deducted From:*\n`;
        alertMsg += `• Wallet: ${fromWallet.name}\n`;
        alertMsg += `• Amount: -${formatBal(transferVal)} ${symbol}\n`;
        alertMsg += `• Balance After: *${formatBal(fromBalAfter)} ${symbol}*\n\n`;
        alertMsg += `📥 *Added To:*\n`;
        alertMsg += `• Wallet: ${toWallet.name}\n`;
        alertMsg += `• Amount: +${formatBal(transferVal)} ${symbol}\n`;
        alertMsg += `• Balance After: *${formatBal(toBalAfter)} ${symbol}*\n\n`;
        alertMsg += `📝 *Reason:* ${safeNotes}`;

        const tgPayload: any = { chat_id: masterChatId, text: alertMsg, parse_mode: 'Markdown' };
        if (targetThreadId) tgPayload.message_thread_id = targetThreadId;

        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgPayload)
        }).catch(err => console.error('Telegram dispatch error:', err));
      }

      showToast('success', 'Transfer Complete', `Successfully moved funds from ${fromWallet?.name} to ${toWallet?.name}.`);
      setFromWalletId(''); setToWalletId(''); setTransferAmount(''); setTransferNotes('');
      fetchWallets();
      setActiveTab('balances');

    } catch (error: any) {
      showToast('error', 'Transfer Failed', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 🚀 UI Renders derived from the safe transferableWallets list
  const khrWallets = transferableWallets.filter(w => w.currency === 'KHR');
  const usdWallets = transferableWallets.filter(w => w.currency === 'USD');

  const getCardIcon = (name: string) => {
    if (name.includes('ABA')) return '📱';
    if (name.includes('Chest')) return '🗄️';
    if (name.includes('Mom')) return '👩';
    return '💵';
  };

  return (
    <div className="main-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
      
      {/* HEADER */}
      <div className="header-container" style={{ flexShrink: 0 }}>
        <div className="header-left">
          <h1 className="saas-page-title">🏛️ Treasury</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={handleSendTestAlert} 
            disabled={isTestingTelegram}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
              fontSize: '13px', fontWeight: 'bold', background: isTestingTelegram ? '#94a3b8' : '#3b82f6',
              color: '#ffffff', border: 'none', borderRadius: '8px',
              cursor: isTestingTelegram ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', flexShrink: 0
            }}
          >
            {isTestingTelegram ? '⏳ Sending...' : '📲 Send Test'}
          </button>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="saas-btn"
            style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', fontSize: '18px', padding: '6px 10px', borderRadius: '8px' }}
            title="Treasury Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 🚀 FROZEN MOBILE TABS (Moved outside scrollable area to freeze them) */}
      <div className="mobile-tabs-wrapper" style={{ width: '100%', justifyContent: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <div className="saas-tab-container hide-scrollbar" style={{ margin: 0, display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px', boxShadow: '0 4px 10px -2px rgba(0,0,0,0.05)' }}>
          <button 
            type="button" onClick={() => setActiveTab('balances')} 
            className={`saas-tab ${activeTab === 'balances' ? 'active' : ''}`} 
            style={{ flexShrink: 0, padding: '10px 32px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'balances' ? '#3b82f6' : 'transparent', color: activeTab === 'balances' ? '#ffffff' : '#64748b' }}
          >
            💰 Live Balances
          </button>
          <button 
            type="button" onClick={() => setActiveTab('transfer')} 
            className={`saas-tab ${activeTab === 'transfer' ? 'active' : ''}`} 
            style={{ flexShrink: 0, padding: '10px 32px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'transfer' ? '#3b82f6' : 'transparent', color: activeTab === 'transfer' ? '#ffffff' : '#64748b' }}
          >
            🔄 Internal Transfer
          </button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>

        {/* CONTENT GRID */}
        <div className="content-grid" style={{ margin: '0 auto' }}>
          
          {/* LEFT: WALLETS */}
          <div className={`grid-item fade-in ${activeTab === 'balances' ? 'mobile-active' : ''}`}>
            <div className="wallet-split-grid">
              
              {/* KHR WALLETS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>🇰🇭 Riel (KHR)</h3>
                  <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                  {isLoading ? (
                    <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>Loading...</div>
                  ) : (
                    <>
                      {khrWallets.length === 0 ? (
                        <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>No KHR wallets configured.</div>
                      ) : (
                        khrWallets.map(w => (
                          <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                            <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px' }}>{getCardIcon(w.name)}</span> {w.name}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {new Intl.NumberFormat('en-US').format(w.balance)} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'normal' }}>៛</span>
                            </div>
                          </div>
                        ))
                      )}

                      {/* 🚀 READ-ONLY AR CARD (KHR) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px dashed #94a3b8', marginTop: '6px' }}>
                        <div style={{ fontSize: '14px', color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '16px' }}>📒</span> Accounts Receivable ៛
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {new Intl.NumberFormat('en-US').format(arBalanceRiel)} <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'normal' }}>៛</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* USD WALLETS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>🇺🇸 Dollar (USD)</h3>
                  <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '32px' }}>
                  {isLoading ? (
                    <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>Loading...</div>
                  ) : (
                    <>
                      {usdWallets.length === 0 ? (
                        <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>No USD wallets configured.</div>
                      ) : (
                        usdWallets.map(w => (
                          <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #bbf7d0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                            <div style={{ fontSize: '14px', color: '#166534', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px' }}>{getCardIcon(w.name)}</span> {w.name}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                                <span style={{ fontSize: '13px', color: '#22c55e', fontWeight: 'normal', marginRight: '2px' }}>$</span>
                                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(w.balance)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT: INTERNAL TRANSFER TERMINAL */}
          <div className={`grid-item fade-in ${activeTab === 'transfer' ? 'mobile-active' : ''}`}>
            <div style={{ background: '#fff', padding: '40px', borderRadius: '20px', border: '1px solid #cbd5e1', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.1)' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* SOURCE WALLET */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '12px', textTransform: 'uppercase' }}>
                    <span>📤 From Wallet</span>
                    <span style={{ color: '#ef4444' }}>Deducting</span>
                  </label>
                  <TreasuryWalletDropdown 
                    selectedId={fromWalletId} 
                    wallets={transferableWallets} 
                    onChange={setFromWalletId} 
                    placeholder="-- Select Source Wallet --" 
                  />
                </div>

                {/* ARROW */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '-16px 0', position: 'relative', zIndex: 10 }}>
                  <div style={{ background: '#3b82f6', border: '4px solid #fff', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                  </div>
                </div>

                {/* DESTINATION WALLET */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '12px', textTransform: 'uppercase' }}>
                    <span>📥 To Wallet</span>
                    <span style={{ color: '#10b981' }}>Adding</span>
                  </label>
                  <TreasuryWalletDropdown 
                    selectedId={toWalletId} 
                    wallets={transferableWallets} 
                    onChange={setToWalletId} 
                    placeholder="-- Select Destination Wallet --" 
                  />
                </div>

                {/* AMOUNT */}
                <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '12px', border: '2px solid #bfdbfe', marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '12px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>Amount to Move</label>
                  <CurrencyInput 
                    placeholder="0" value={transferAmount} onChange={(v: any) => setTransferAmount(v)} 
                    className="saas-input" 
                    style={{ width: '100%', borderColor: '#60a5fa', padding: '16px', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#1e3a8a', background: '#ffffff' }} 
                  />
                </div>

                {/* NOTES */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>📝 Reason (Optional)</label>
                  <input 
                    type="text" value={transferNotes} onChange={e => setTransferNotes(e.target.value)} 
                    placeholder="e.g. Daily cash float setup" className="saas-input" 
                    style={{ width: '100%', padding: '14px', fontSize: '15px' }} 
                  />
                </div>

                <button 
                  onClick={handleTransfer} 
                  disabled={isProcessing || !fromWalletId || !toWalletId || !transferAmount} 
                  className="saas-btn saas-btn-primary" 
                  style={{ width: '100%', padding: '18px', fontSize: '16px', fontWeight: 'bold', marginTop: '12px', background: (!fromWalletId || !toWalletId || !transferAmount) ? '#cbd5e1' : '#10b981', boxShadow: (!fromWalletId || !toWalletId || !transferAmount) ? 'none' : '0 10px 15px -3px rgba(16, 185, 129, 0.4)' }}
                >
                  {isProcessing ? 'Moving Funds...' : '✅ Execute Transfer'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* SETTINGS MODAL */}
      <Modal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        title="Treasury Settings" 
        icon="⚙️"
        maxWidth="600px"
      >
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          These boxes show the <b>exact current balance</b> of your accounts. Change a number and hit save to manually adjust and overwrite the database.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          {transferableWallets.map(w => (
            <div key={w.id}>
              <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>
                {w.name} ({w.currency === 'USD' ? '$' : '៛'})
              </label>
              <CurrencyInput 
                value={draftBalances[w.id] === undefined ? '' : draftBalances[w.id]} 
                onChange={(v: any) => setDraftBalances(prev => ({ ...prev, [w.id]: v }))} 
                className="saas-input" 
                style={{ width: '100%', textAlign: 'left', backgroundColor: '#ffffff' }} 
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px', gap: '12px' }}>
          <button onClick={() => setIsSettingsOpen(false)} disabled={isProcessing} className="saas-btn saas-btn-secondary">
            Cancel
          </button>
          <button onClick={handleSaveInitialBalances} disabled={isProcessing} className="saas-btn saas-btn-primary">
            {isProcessing ? 'Processing...' : '💾 Sync Balances'}
          </button>
        </div>
      </Modal>
      
      <style jsx global>{`
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .header-container { 
          display: flex;
          justify-content: space-between;
          align-items: center; 
          margin-bottom: 24px; 
          margin-top: 0;
          margin-left: 60px;
          gap: 12px;
          min-height: 48px; 
          width: calc(100% - 60px);
          padding-right: 24px; 
        }
        .header-left {
          display: flex;
          align-items: center; 
          gap: 12px;
        }
        .header-actions {
          display: flex;
          gap: 10px;
          margin-left: auto; 
        }

        @media (max-width: 1023px) {
          .header-container { 
            margin-left: 54px !important;
            margin-right: 0 !important;
            margin-bottom: 16px !important; 
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important; 
            min-height: 44px !important;
            width: calc(100% - 54px) !important;
            padding-right: 16px !important;
          }
        }

        .mobile-tabs-wrapper { display: flex; }
        .content-grid {
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
        }
        .grid-item {
          display: none; 
          width: 100%;
        }
        .grid-item.mobile-active {
          display: block; 
        }
        
        .wallet-split-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        
        @media (min-width: 1024px) {
          .mobile-tabs-wrapper { display: none !important; }
          
          .content-grid {
            max-width: 1300px; 
            display: grid;
            grid-template-columns: 1.8fr 1fr;
            gap: 40px; 
            align-items: start;
          }
          
          .grid-item {
            display: block !important; 
          }

          .wallet-split-grid {
            grid-template-columns: 1fr 1fr;
            gap: 32px;
          }
        }
      `}</style>
    </div>
  );
}