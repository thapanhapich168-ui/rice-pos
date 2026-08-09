'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useUserRole } from '@/lib/useUserRole'

// Define the shape of our context
interface Branch {
  id: number;
  name: string;
}

interface BranchContextType {
  branches: Branch[];
  activeBranchId: number;
  setActiveBranchId: (id: number) => void;
  isLoadingBranches: boolean;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<number>(1); // Default to SMC
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  
  const { role, loadingRole } = useUserRole();

  useEffect(() => {
    async function fetchBranchesAndProfile() {
      // 1. Get all available branches
      const { data: branchData } = await supabase.from('branches').select('*').order('id', { ascending: true });
      if (branchData) setBranches(branchData);

      // 2. Get the current user's profile to see if they are locked to a branch
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('branch_id, role').eq('id', user.id).single();
        
        if (profile && profile.branch_id) {
            // If they have a saved branch in their profile, default to it
            setActiveBranchId(Number(profile.branch_id));
        } else {
            // Fallback to local storage so Admins stay on the branch they last viewed
            const savedBranch = localStorage.getItem('active_branch_id');
            if (savedBranch) setActiveBranchId(Number(savedBranch));
        }
      }
      setIsLoadingBranches(false);
    }

    fetchBranchesAndProfile();
  }, []);

  // Whenever the active branch changes, save it to local storage so it persists on refresh
  const handleSetBranch = (id: number) => {
    setActiveBranchId(id);
    localStorage.setItem('active_branch_id', id.toString());
    // Dispatch a custom event so pages know they need to re-fetch their data!
    window.dispatchEvent(new Event('branch_changed'));
  };

  return (
    <BranchContext.Provider value={{ branches, activeBranchId, setActiveBranchId: handleSetBranch, isLoadingBranches }}>
      {children}
    </BranchContext.Provider>
  );
}

// Hook to use the branch context anywhere in the app
export const useBranch = () => {
  const context = useContext(BranchContext);
  if (!context) throw new Error("useBranch must be used within a BranchProvider");
  return context;
};