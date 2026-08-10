'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/lib/useUserRole'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role, loadingRole } = useUserRole();
  const router = useRouter();

  useEffect(() => {
    // If they finish loading and they are NOT an admin, kick them out to the POS instantly!
    if (!loadingRole && role !== 'admin') {
      router.replace('/pos'); 
    }
  }, [role, loadingRole, router]);

  // Show a blank/loading screen while we check their ID badge
  if (loadingRole) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '18px', fontWeight: 'bold' }}>
        🔒 Verifying Access...
      </div>
    );
  }

  // If they aren't an admin, render absolutely nothing while the router kicks them out
  if (role !== 'admin') {
    return null; 
  }

  // If they ARE an admin, let them see the page!
  return <>{children}</>;
}