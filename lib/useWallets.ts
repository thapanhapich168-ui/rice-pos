// hooks/useWallets.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useWallets(branchId: number) {
  const [wallets, setWallets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWallets = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('branch_id', branchId)
      .order('id', { ascending: true });
    
    if (data) setWallets(data);
    if (error) console.error("Error fetching wallets:", error);
    setIsLoading(false);
  };

  useEffect(() => {
    if (branchId) fetchWallets();
  }, [branchId]);

  // Utility to get a specific wallet's balance instantly
  const getBalance = (walletName: string) => {
    return wallets.find(w => w.name === walletName)?.balance || 0;
  };

  return { wallets, fetchWallets, isLoading, getBalance };
}