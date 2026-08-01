'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ToastProvider'

export default function AutoSyncHandler() {
  const { showToast } = useToast()

  useEffect(() => {
    checkAndSyncExpenses()
    // Re-check whenever the user switches back to Safari from another app
    window.addEventListener('focus', checkAndSyncExpenses)
    return () => window.removeEventListener('focus', checkAndSyncExpenses)
  }, [])

  async function checkAndSyncExpenses() {
    try {
      const savedPers = localStorage.getItem('expense_ledger_personal')
      if (!savedPers) return // Nothing stored yet

      const now = new Date()
      const currentHour = now.getHours() // 0 - 23
      const todayStr = now.toISOString().split('T')[0]

      // Read saved ledger date (defaults to today if not set)
      const ledgerDate = localStorage.getItem('expense_ledger_date') || todayStr

      // Condition: Sync if ledger date is from a previous day OR if current hour >= 22 (10:00 PM)
      const isPast10PM = currentHour >= 22
      const isPreviousDay = ledgerDate !== todayStr

      if (!isPast10PM && !isPreviousDay) return

      // Parse stored personal and business queues
      const pendingPers: any[] = JSON.parse(savedPers || '[]')
      const pendingBiz: any[] = JSON.parse(
        localStorage.getItem('expense_ledger_business') || '[]'
      )

      // Filter out empty default rows (must have remarks and amount > 0)
      const validPers = pendingPers.filter(
        (exp) =>
          exp?.remarks?.trim() !== '' &&
          exp?.payments?.some((p: any) => Number(p.amount) > 0)
      )
      const validBiz = pendingBiz.filter(
        (exp) =>
          exp?.remarks?.trim() !== '' &&
          exp?.payments?.some((p: any) => Number(p.amount) > 0)
      )

      const totalValidCount = validPers.length + validBiz.length
      if (totalValidCount === 0) return

      // Build payload for Personal expenses
      const persPayload = validPers.map((exp) => formatExpensePayload(exp, 'PERSONAL', ledgerDate))
      // Build payload for Business expenses
      const bizPayload = validBiz.map((exp) => formatExpensePayload(exp, 'BUSINESS', ledgerDate))

      const fullPayload = [...persPayload, ...bizPayload].reverse()

      // Insert into Supabase
      const { error } = await supabase.from('expenses').insert(fullPayload)

      if (error) {
        console.error('Auto-sync failed:', error.message)
        return
      }

      // Clear local queues after successful sync
      localStorage.removeItem('expense_ledger_personal')
      localStorage.removeItem('expense_ledger_business')
      localStorage.removeItem('expense_ledger_date')

      // Notify open components to clear their UI forms
      window.dispatchEvent(new Event('expense_ledger_synced'))

      showToast(
        'success',
        '✅ Auto-Sync Complete!',
        `Successfully submitted ${totalValidCount} queued expense(s) from ${ledgerDate} to Supabase.`
      )
    } catch (e) {
      console.error('Local sync error:', e)
    }
  }

  // Helper to format payment splits identically to your handleSubmit
  function formatExpensePayload(exp: any, description: string, dateStr: string) {
    const activePayments = (exp.payments || []).filter((r: any) => (Number(r.amount) || 0) > 0)

    let combinedMethod = activePayments[0]?.method || 'Cash ៛'
    if (activePayments.length > 1) {
      combinedMethod = activePayments.map((r: any) => `${r.method}:${r.amount}`).join(',')
    }

    let totalUsd = 0
    let totalRiel = 0

    for (const row of activePayments) {
      const rawAmount = Number(row.amount) || 0
      if (row.method.includes('$')) {
        totalUsd += rawAmount
      } else {
        totalRiel += rawAmount
      }
    }

    return {
      expense_date: dateStr,
      spender: exp.spender || 'Both',
      payment_method: combinedMethod,
      remarks: exp.remarks,
      amount_usd: totalUsd,
      amount_riel: totalRiel,
      description: description,
    }
  }

  return null
}