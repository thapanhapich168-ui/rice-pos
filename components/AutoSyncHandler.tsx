'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ToastProvider'

// Helper: Always get accurate YYYY-MM-DD in Cambodia Local Time (UTC+7)
const getCambodiaDateStr = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' })
}

// Helper: Get current hour (0 - 23) in Cambodia Local Time
const getCambodiaHour = () => {
  const hourStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Phnom_Penh',
    hour12: false,
    hour: '2-digit'
  })
  return parseInt(hourStr, 10)
}

export default function AutoSyncHandler() {
  const { showToast } = useToast()

  useEffect(() => {
    const checkAndSync = async () => {
      try {
        const savedDate = localStorage.getItem('expense_ledger_date')
        if (!savedDate) return

        const todayCambodia = getCambodiaDateStr()
        const currentHour = getCambodiaHour()

        // 🔥 CRITERIA 1: Is the saved ledger from a PREVIOUS day? (e.g., opened next morning)
        const isPreviousDay = savedDate < todayCambodia

        // 🔥 CRITERIA 2: Is it TODAY and AFTER 10:00 PM (22:00)?
        const isAfter10PM = savedDate === todayCambodia && currentHour >= 22

        // If neither condition is met, do not auto-submit
        if (!isPreviousDay && !isAfter10PM) return

        // Load saved personal & business queues from localStorage
        const rawPers = localStorage.getItem('expense_ledger_personal')
        const rawBiz = localStorage.getItem('expense_ledger_business')

        const persList: any[] = rawPers ? JSON.parse(rawPers) : []
        const bizList: any[] = rawBiz ? JSON.parse(rawBiz) : []

        // Filter out empty/placeholder rows
        const validPers = persList.filter(
          exp => exp.remarks?.trim() !== '' && exp.payments?.some((p: any) => Number(p.amount) > 0)
        )
        const validBiz = bizList.filter(
          exp => exp.remarks?.trim() !== '' && exp.payments?.some((p: any) => Number(p.amount) > 0)
        )

        const allValid = [
          ...validPers.map(item => ({ ...item, tabType: 'PERSONAL' })),
          ...validBiz.map(item => ({ ...item, tabType: 'BUSINESS' }))
        ]

        // If there are no valid expenses waiting, just clean up old dates and exit
        if (allValid.length === 0) {
          if (isPreviousDay) {
            localStorage.setItem('expense_ledger_date', todayCambodia)
          }
          return
        }

        // Build payload for Supabase using the SAVED date (so yesterday's expenses stay on yesterday's date!)
        const payloadArray = allValid.map(exp => {
          const activePayments = exp.payments.filter((r: any) => (Number(r.amount) || 0) > 0)

          let combinedMethod = activePayments[0].method
          if (activePayments.length > 1) {
            combinedMethod = activePayments.map((r: any) => `${r.method}:${r.amount}`).join(',')
          }

          let totalUsd = 0
          let totalRiel = 0

          for (const row of activePayments) {
            const rawAmount = Number(row.amount)
            if (row.method.includes('$')) {
              totalUsd += rawAmount
            } else {
              totalRiel += rawAmount
            }
          }

          return {
            expense_date: savedDate, // 🔥 Uses savedDate so next-day sync logs under yesterday!
            spender: exp.spender,
            payment_method: combinedMethod,
            remarks: exp.remarks,
            amount_usd: totalUsd,
            amount_riel: totalRiel,
            description: exp.tabType
          }
        })

        // Insert into Supabase
        const { error } = await supabase.from('expenses').insert(payloadArray.reverse())
        if (error) throw error

        // Clear local queues after successful sync
        localStorage.removeItem('expense_ledger_personal')
        localStorage.removeItem('expense_ledger_business')
        localStorage.setItem('expense_ledger_date', todayCambodia)

        // Notify user and trigger form reset in ExpenseDashboard
        showToast(
          'success',
          '✅ Auto-Synced!',
          `Automatically logged ${allValid.length} offline expense(s) for ${savedDate}.`
        )

        window.dispatchEvent(new Event('expense_ledger_synced'))
      } catch (err: any) {
        console.error('AutoSyncHandler Error:', err)
      }
    }

    // Run check 1 second after Safari loads to prevent race conditions
    const timer = setTimeout(checkAndSync, 1000)
    return () => clearTimeout(timer)
  }, [showToast])

  return null
}