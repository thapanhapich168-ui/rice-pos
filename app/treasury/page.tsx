'use client'

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CurrencyInput } from '@/components/Inputs';
import { useBranch } from '@/components/BranchContext';
import { useToast } from '@/components/ToastProvider';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'balances' | 'transfer'>('balances');
  
  // 🚀 BULK INITIALIZATION STATE
  const [showStartingBalance, setShowStartingBalance] = useState(false);
  const [draftBalances, setDraftBalances] = useState<Record<string, number | ''>>({});

  // 🚀 SYNC WITH LIVE BALANCES (Like the Dashboard Settings)
  useEffect(() => {
    if (showStartingBalance) {
      const currentBalances: Record<string, number | ''> = {};
      wallets.forEach(w => {
        currentBalances[w.id] = Number(w.balance) || 0;
      });
      setDraftBalances(currentBalances);
    }
  }, [showStartingBalance, wallets]);

  // Transfer Form State
  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number | ''>('');
  const [transferNotes, setTransferNotes] = useState('');

  useEffect(() => {
    fetchWallets();
  }, [activeBranchId]);

  async function fetchWallets() {
    setIsLoading(true);
    
    // 🔒 SECURITY FIX: Enforce branch isolation so tenants only see their own wallets
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

  const handleSaveInitialBalances = async () => {
    setIsProcessing(true);
    try {
      const updatePromises = wallets.map(async (w) => {
        const newBal = Number(String(draftBalances[w.id] || '').replace(/,/g, ''));
        if (isNaN(newBal)) return;
        
        const currentBal = Number(w.balance) || 0;
        const difference = newBal - currentBal;

        if (difference !== 0) {
          // 🔒 RLS FIX: Force the transaction to match the wallet's native branch
          const targetBranchId = w.branch_id || (activeBranchId === 0 ? 1 : activeBranchId);

          const { error } = await supabase.rpc('record_wallet_transaction', {
            p_wallet_name: w.name,
            p_amount: difference, // 🚀 Applies exactly the difference so the wallet matches your typed number!
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
      setShowStartingBalance(false);
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

    const fromWallet = wallets.find(w => w.id.toString() === fromWalletId);
    const toWallet = wallets.find(w => w.id.toString() === toWalletId);

    if (fromWallet?.currency !== toWallet?.currency) {
      return showToast('error', 'Currency Mismatch', 'Cannot transfer KHR directly to USD without a dedicated exchange action.');
    }

    setIsProcessing(true);
    try {
      const transferVal = Number(transferAmount);
      const safeNotes = transferNotes.trim() || 'Internal Treasury Transfer';

      // 🚀 ONE SECURE TRIP TO POSTGRES (100% Atomic Execution)
      const { error: transferErr } = await supabase.rpc('execute_treasury_transfer', {
          p_from_wallet: fromWallet.name,
          p_to_wallet: toWallet.name,
          p_amount: transferVal,
          p_notes: safeNotes,
          p_branch_id: activeBranchId
      });
      
      if (transferErr) throw transferErr;

      // Calculate Balances for Telegram visually
      const fromBalAfter = Number(fromWallet.balance) - transferVal;
      const toBalAfter = Number(toWallet.balance) + transferVal;

      // 🔔 AUTO-SEND TELEGRAM ALERT ON EVERY TRANSFER
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

        const tgPayload: any = {
          chat_id: masterChatId,
          text: alertMsg,
          parse_mode: 'Markdown'
        };

        if (targetThreadId) {
          tgPayload.message_thread_id = targetThreadId;
        }

        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tgPayload)
        }).catch(err => console.error('Telegram dispatch error:', err));
      }

      showToast('success', 'Transfer Complete', `Successfully moved funds from ${fromWallet?.name} to ${toWallet?.name}.`);
      
      setFromWalletId('');
      setToWalletId('');
      setTransferAmount('');
      setTransferNotes('');
      fetchWallets();
      setActiveTab('balances');

    } catch (error: any) {
      showToast('error', 'Transfer Failed', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const khrWallets = wallets.filter(w => w.currency === 'KHR');
  const usdWallets = wallets.filter(w => w.currency === 'USD');

  const getCardIcon = (name: string) => {
    if (name.includes('ABA')) return '📱';
    if (name.includes('Chest')) return '🗄️';
    if (name.includes('Mom')) return '👩';
    return '💵';
  };

  return (
    <div className="main-wrapper responsive-wrapper" style={{ height: '100dvh', overflowY: 'auto', backgroundColor: '#f8fafc' }}>
      
      {/* PERFECTLY ALIGNED HEADER (Matches the Burger Icon Middle) */}
      <div className="header-container responsive-header" style={{ display: 'flex', alignItems: 'center', marginLeft: '54px', marginBottom: '24px' }}>
        <h1 className="saas-page-title" style={{ fontSize: '22px', color: '#0f172a', margin: 0, padding: 0, display: 'flex', alignItems: 'center', lineHeight: '1.2' }}>
          🏛️ Master Treasury
        </h1>
      </div>

      {/* TABS - Hidden on Laptop, Visible on Mobile */}
      <div className="mobile-tabs-wrapper" style={{ width: '100%', justifyContent: 'center', marginBottom: '24px' }}>
        <div className="saas-tab-container hide-scrollbar" style={{ margin: 0, display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: '8px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '6px', boxShadow: '0 4px 10px -2px rgba(0,0,0,0.05)' }}>
          <button 
            type="button" 
            onClick={() => setActiveTab('balances')} 
            className={`saas-tab ${activeTab === 'balances' ? 'active' : ''}`} 
            style={{ flexShrink: 0, padding: '10px 32px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'balances' ? '#0f172a' : 'transparent', color: activeTab === 'balances' ? '#ffffff' : '#64748b' }}
          >
            💰 Live Balances
          </button>
          <button 
            type="button" 
            onClick={() => setActiveTab('transfer')} 
            className={`saas-tab ${activeTab === 'transfer' ? 'active' : ''}`} 
            style={{ flexShrink: 0, padding: '10px 32px', fontSize: '14px', fontWeight: 'bold', background: activeTab === 'transfer' ? '#3b82f6' : 'transparent', color: activeTab === 'transfer' ? '#ffffff' : '#64748b' }}
          >
            🔄 Internal Transfer
          </button>
        </div>
      </div>

      {/* RESPONSIVE CONTENT AREA (Mobile: Single Column Tab, Laptop: 2-Column Grid) */}
      <div className="content-grid" style={{ margin: '0 auto' }}>
        
        {/* --- LEFT SIDE: COMPACT BULLET ROWS DASHBOARD --- */}
        <div className={`grid-item fade-in ${activeTab === 'balances' ? 'mobile-active' : ''}`}>
          
          {/* 🚀 BULK INITIALIZATION ACCORDION */}
          <div className="saas-card" style={{ padding: 0, marginBottom: '24px', overflow: 'hidden', border: '2px dashed #cbd5e1' }}>
            <button 
              onClick={() => setShowStartingBalance(!showStartingBalance)}
              style={{ width: '100%', padding: '16px 24px', background: '#f8fafc', border: 'none', textAlign: 'left', fontWeight: 'bold', color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚙️</span> Sync Live Balances (Like Dashboard)
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{showStartingBalance ? '▲ CLOSE' : '▼ OPEN TO EDIT'}</span>
            </button>
            
            {showStartingBalance && (
              <div style={{ padding: '24px', borderTop: '1px dashed #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', background: '#ffffff' }}>
                <div style={{ gridColumn: '1 / -1', fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                  These boxes show the <b>exact current balance</b> of your accounts. Change a number and hit save to instantly sync the account to match your new amount.
                </div>
                {wallets.map(w => (
                  <div key={w.id}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px', fontWeight: 'bold' }}>
                      {w.name} ({w.currency === 'USD' ? '$' : '៛'})
                    </label>
                    <CurrencyInput 
                      value={draftBalances[w.id] === undefined ? '' : draftBalances[w.id]} 
                      onChange={(v: any) => setDraftBalances(prev => ({ ...prev, [w.id]: v }))} 
                      className="saas-input" 
                      style={{ width: '100%', textAlign: 'left', backgroundColor: '#f8fafc' }} 
                    />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button onClick={handleSaveInitialBalances} disabled={isProcessing} className="saas-btn saas-btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>
                    {isProcessing ? 'Processing...' : '💾 Sync Balances'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* KHR WALLETS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>🇰🇭 Riel (KHR)</h3>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
            {isLoading ? <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>Loading...</div> : khrWallets.length === 0 ? <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>No KHR wallets configured.</div> : khrWallets.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '16px' }}>{getCardIcon(w.name)}</span> {w.name}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {new Intl.NumberFormat('en-US').format(w.balance)} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'normal' }}>៛</span>
                </div>
              </div>
            ))}
          </div>

          {/* USD WALLETS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '13px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>🇺🇸 Dollar (USD)</h3>
            <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '32px' }}>
            {isLoading ? <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>Loading...</div> : usdWallets.length === 0 ? <div style={{ color: '#94a3b8', padding: '12px', textAlign: 'center' }}>No USD wallets configured.</div> : usdWallets.map(w => (
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
            ))}
          </div>
        </div>

        {/* --- RIGHT SIDE: INTERNAL TRANSFER TERMINAL --- */}
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
                  wallets={wallets} 
                  onChange={setFromWalletId} 
                  placeholder="-- Select Source Wallet --" 
                />
              </div>

              {/* TRANSFER ARROW */}
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
                  wallets={wallets} 
                  onChange={setToWalletId} 
                  placeholder="-- Select Destination Wallet --" 
                />
              </div>

              {/* AMOUNT */}
              <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '12px', border: '2px solid #bfdbfe', marginTop: '8px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '12px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>Amount to Move</label>
                <CurrencyInput 
                  placeholder="0" 
                  value={transferAmount} 
                  onChange={(v: any) => setTransferAmount(v)} 
                  className="saas-input" 
                  style={{ width: '100%', borderColor: '#60a5fa', padding: '16px', fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#1e3a8a', background: '#ffffff' }} 
                />
              </div>

              {/* NOTES */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>📝 Reason (Optional)</label>
                <input 
                  type="text" 
                  value={transferNotes} 
                  onChange={e => setTransferNotes(e.target.value)} 
                  placeholder="e.g. Daily cash float setup" 
                  className="saas-input" 
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
      
      <style jsx global>{`
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* RESPONSIVE ALIGNMENT FIX */
        .responsive-wrapper { padding: 0 24px 24px 24px; }
        .responsive-header { margin-top: 0; min-height: 44px; }
        
        /* MOBILE TABS & LAYOUT */
        .mobile-tabs-wrapper { display: flex; }
        .content-grid {
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
        }
        .grid-item {
          display: none; /* Hide both blocks by default on mobile */
          width: 100%;
        }
        .grid-item.mobile-active {
          display: block; /* Show only the active block on mobile */
        }
        
        /* LAPTOP/DESKTOP OVERRIDE (For side-by-side view) */
        @media (min-width: 1024px) {
          .responsive-wrapper { padding: 24px; }
          .responsive-header { margin-top: -4px; min-height: 40px; }
          
          .mobile-tabs-wrapper { display: none !important; } /* Hide the tab buttons */
          
          .content-grid {
            max-width: 1000px; /* Widen the container to fit both */
            display: grid;
            grid-template-columns: 1fr 1fr; /* Split into 2 columns */
            gap: 40px; /* Spacing between the columns */
            align-items: start;
          }
          
          .grid-item {
            display: block !important; /* Force both blocks to show side-by-side */
          }
        }
      `}</style>
    </div>
  );
}