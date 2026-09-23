'use client'

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CurrencyInput } from '@/components/Inputs';
import { useBranch } from '@/components/BranchContext';
import { useToast } from '@/components/ToastProvider';

export default function TreasuryManager() {
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  
  const [wallets, setWallets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

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
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('branch_id', activeBranchId)
      .order('id', { ascending: true });
    
    if (data) setWallets(data);
    if (error) console.error(error);
    setIsLoading(false);
  }

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
      const payload = {
        branchId: activeBranchId,
        fromWalletId,
        toWalletId,
        amount: Number(transferAmount),
        notes: transferNotes
      };

      const { error } = await supabase.rpc('process_wallet_transfer', { p_payload: payload });
      if (error) throw error;

      showToast('success', 'Transfer Complete', `Successfully moved funds from ${fromWallet?.name} to ${toWallet?.name}.`);
      
      // Reset Form & Refresh Balances
      setFromWalletId('');
      setToWalletId('');
      setTransferAmount('');
      setTransferNotes('');
      fetchWallets();

    } catch (error: any) {
      showToast('error', 'Transfer Failed', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const khrWallets = wallets.filter(w => w.currency === 'KHR');
  const usdWallets = wallets.filter(w => w.currency === 'USD');

  return (
    <div className="saas-card fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <h2 className="saas-card-title" style={{ fontSize: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        🏛️ Master Treasury & Transfers
      </h2>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* --- LEFT: LIVE MONEY DASHBOARD --- */}
        <div style={{ flex: 1.5, minWidth: '350px' }}>
          
          <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 'bold' }}>
            🇰🇭 Riel Wallets (KHR)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {khrWallets.map(w => (
              <div key={w.id} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold', marginBottom: '4px' }}>{w.name}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                  {new Intl.NumberFormat('en-US').format(w.balance)} ៛
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: '14px', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 'bold' }}>
            🇺🇸 Dollar Wallets (USD)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {usdWallets.map(w => (
              <div key={w.id} style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold', marginBottom: '4px' }}>{w.name}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#15803d' }}>
                  $ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(w.balance)}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* --- RIGHT: INTERNAL TRANSFER TERMINAL --- */}
        <div style={{ flex: 1, minWidth: '300px', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          <h3 style={{ fontSize: '16px', color: '#0f172a', marginBottom: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔄 Internal Transfer
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>📤 From Wallet (Deduct)</label>
              <select className="saas-input" value={fromWalletId} onChange={e => setFromWalletId(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                <option value="">-- Select Origin --</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({new Intl.NumberFormat('en-US').format(w.balance)} {w.currency === 'USD' ? '$' : '៛'})</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: '#f1f5f9', padding: '8px', borderRadius: '50%', color: '#94a3b8' }}>⬇️</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>📥 To Wallet (Add)</label>
              <select className="saas-input" value={toWalletId} onChange={e => setToWalletId(e.target.value)} style={{ width: '100%', cursor: 'pointer' }}>
                <option value="">-- Select Destination --</option>
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>💰 Transfer Amount</label>
              <CurrencyInput 
                placeholder="0" 
                value={transferAmount} 
                onChange={(v: any) => setTransferAmount(v)} 
                className="saas-input" 
                style={{ width: '100%', borderColor: '#3b82f6' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>📝 Note / Reason (Optional)</label>
              <input 
                type="text" 
                value={transferNotes} 
                onChange={e => setTransferNotes(e.target.value)} 
                placeholder="e.g. Withdrawing cash for daily change" 
                className="saas-input" 
                style={{ width: '100%' }} 
              />
            </div>

            <button 
              onClick={handleTransfer} 
              disabled={isProcessing} 
              className="saas-btn saas-btn-primary" 
              style={{ width: '100%', padding: '14px', fontSize: '15px', marginTop: '10px' }}
            >
              {isProcessing ? 'Moving Funds...' : '✅ Execute Transfer'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}