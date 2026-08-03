import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig'

const EXCHANGE_RATE = 4000
const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString()}៛`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`

export async function GET(request: Request) {
  try {
    // 1. Optional Security Check: Verify Vercel Cron Secret
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Validate Supabase Environment Variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. Load Telegram Credentials
    const botToken = TELEGRAM_CONFIG.botToken
    const chatId = TELEGRAM_CONFIG.chatId
    const sendDaily = TELEGRAM_CONFIG.autoSendDaily
    const sendMonthly = TELEGRAM_CONFIG.autoSendMonthly

    if (!botToken || !chatId) {
      return NextResponse.json(
        { error: 'Missing Telegram credentials in lib/telegramConfig.ts' },
        { status: 400 }
      )
    }

    // 4. 🔥 SAFE DATE LOGIC (Identical to ReportControlPage - No string splitting bugs)
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // Cambodia Timezone comparison helpers (UTC+7)
    const getCambodiaDateParts = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(d)
      const get = (type: string) => Number(parts.find(p => p.type === type)?.value || 0)
      return { year: get('year'), month: get('month'), day: get('day') }
    }

    const nowCam = getCambodiaDateParts(now)

    const isToday = (dateStr: string) => {
      if (!dateStr) return false
      const d = getCambodiaDateParts(new Date(dateStr))
      return d.day === nowCam.day && d.month === nowCam.month && d.year === nowCam.year
    }

    const isMTD = (dateStr: string) => {
      if (!dateStr) return false
      const d = getCambodiaDateParts(new Date(dateStr))
      return d.month === nowCam.month && d.year === nowCam.year
    }

    // Check if tomorrow is Day 1 in Cambodia (Last day of month check)
    const tomorrowCam = getCambodiaDateParts(new Date(now.getTime() + 86400000))
    const isLastDayOfMonth = tomorrowCam.day === 1

    // 5. Fetch Data from Supabase safely
    const [
      { data: invData, error: invError },
      { data: retData, error: retError },
      { data: expData, error: expError }
    ] = await Promise.all([
      supabase.from('invoice_summaries').select('*').gte('created_at', firstDayOfMonth),
      supabase.from('retail_sales').select('*').gte('created_at', firstDayOfMonth),
      supabase.from('expenses').select('*').gte('created_at', firstDayOfMonth)
    ])

    if (invError || retError || expError) {
      return NextResponse.json(
        { error: 'Database query failed', details: { invError, retError, expError } },
        { status: 500 }
      )
    }

    const invoices = invData || []
    const retailSales = retData || []
    const expenses = expData || []

    // 6. Number Crunching Engine
    const calculateSlice = (invSlice: any[], retSlice: any[], expSlice: any[]) => {
      let totalSales = 0
      let totalProfit = 0
      const profitByOwner = { Pich: 0, Jing: 0, Both: 0 }

      invSlice.forEach(inv => {
        const sales = Number(inv.total_sales) || 0
        const profit = Number(inv.total_profit) || 0
        totalSales += sales
        totalProfit += profit
        const owner = ['Pich', 'Jing'].includes(inv.owner) ? inv.owner : 'Both'
        profitByOwner[owner as keyof typeof profitByOwner] += profit
      })

      retSlice.forEach(ret => {
        const qty = Number(ret.qty) || 0
        const price = Number(ret.price_per_bag) || 0
        const cogs = Number(ret.cogs_price) || 0
        const sales = qty * price
        const profit = (price - cogs) * qty
        totalSales += sales
        totalProfit += profit
        profitByOwner.Both += profit
      })

      const expenseBySpender = {
        Pich: { riel: 0, usd: 0 },
        Jing: { riel: 0, usd: 0 },
        Both: { riel: 0, usd: 0 }
      }
      let totalExpRiel = 0
      let totalExpUsd = 0
      const categoryBreakdown: Record<string, { riel: number; usd: number }> = {}

      expSlice.forEach(exp => {
        const riel = Number(exp.amount_riel) || 0
        const usd = Number(exp.amount_usd) || 0
        const spender = ['Pich', 'Jing'].includes(exp.spender) ? exp.spender : 'Both'
        expenseBySpender[spender as keyof typeof expenseBySpender].riel += riel
        expenseBySpender[spender as keyof typeof expenseBySpender].usd += usd
        totalExpRiel += riel
        totalExpUsd += usd

        const cat = exp.category || exp.description || 'Uncategorized'
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { riel: 0, usd: 0 }
        categoryBreakdown[cat].riel += riel
        categoryBreakdown[cat].usd += usd
      })

      return { totalSales, totalProfit, profitByOwner, expenseBySpender, totalExpRiel, totalExpUsd, categoryBreakdown }
    }

    const month = calculateSlice(
      invoices.filter(i => isMTD(i.created_at)),
      retailSales.filter(r => isMTD(r.created_at)),
      expenses.filter(e => isMTD(e.expense_date || e.created_at))
    )

    const today = calculateSlice(
      invoices.filter(i => isToday(i.created_at)),
      retailSales.filter(r => isToday(r.created_at)),
      expenses.filter(e => isToday(e.expense_date || e.created_at))
    )

    let dailyTelegramResponse = null
    let monthlyTelegramResponse = null

    // --- 7. DISPATCH DAILY REPORT ---
    if (sendDaily) {
      const dailyText =
`📊 *RICE BUSINESS REPORT*

📆 *THIS MONTH*
💰 *Sales*      \`${formatRiel(month.totalSales)}\`
📈 *Profit*     \`${formatRiel(month.totalProfit)}\`
💸 *Expense*    \`${formatRiel(month.totalExpRiel)} / ${formatUSD(month.totalExpUsd)}\`

👤 *MONTH PROFIT*
🟢 Pich       \`${formatRiel(month.profitByOwner.Pich)}\`
🔵 Jing       \`${formatRiel(month.profitByOwner.Jing)}\`
🟡 Both       \`${formatRiel(month.profitByOwner.Both)}\`

💸 *MONTH EXPENSE*
🟢 Pich       \`${formatRiel(month.expenseBySpender.Pich.riel)} / ${formatUSD(month.expenseBySpender.Pich.usd)}\`
🔵 Jing       \`${formatRiel(month.expenseBySpender.Jing.riel)} / ${formatUSD(month.expenseBySpender.Jing.usd)}\`
🟡 Both       \`${formatRiel(month.expenseBySpender.Both.riel)} / ${formatUSD(month.expenseBySpender.Both.usd)}\`

━━━━━━━━━━━━━━━

📅 *TODAY*
💰 *Sales*      \`${formatRiel(today.totalSales)}\`
📈 *Profit*     \`${formatRiel(today.totalProfit)}\`
💸 *Expense*    \`${formatRiel(today.totalExpRiel)} / ${formatUSD(today.totalExpUsd)}\`

👤 *TODAY PROFIT*
🟢 Pich       \`${formatRiel(today.profitByOwner.Pich)}\`
🔵 Jing       \`${formatRiel(today.profitByOwner.Jing)}\`
🟡 Both       \`${formatRiel(today.profitByOwner.Both)}\`

💸 *TODAY EXPENSE*
🟢 Pich       \`${formatRiel(today.expenseBySpender.Pich.riel)} / ${formatUSD(today.expenseBySpender.Pich.usd)}\`
🔵 Jing       \`${formatRiel(today.expenseBySpender.Jing.riel)} / ${formatUSD(today.expenseBySpender.Jing.usd)}\`
🟡 Both       \`${formatRiel(today.expenseBySpender.Both.riel)} / ${formatUSD(today.expenseBySpender.Both.usd)}\``

      const dailyRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: dailyText, parse_mode: 'Markdown' })
      })

      dailyTelegramResponse = await dailyRes.json()
      if (!dailyRes.ok) {
        console.error('Telegram Daily Send Error:', dailyTelegramResponse)
      }
    }

    // --- 8. DISPATCH MONTHLY REPORT (LAST DAY OF MONTH) ---
    if (isLastDayOfMonth && sendMonthly) {
      const currentMonthName = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Phnom_Penh',
        month: 'long',
        year: 'numeric'
      }).format(now)

      let topCat = 'None'
      let topCatAmount = 0
      Object.entries(month.categoryBreakdown).forEach(([cat, val]) => {
        const eq = val.riel + (val.usd * EXCHANGE_RATE)
        if (eq > topCatAmount) {
          topCatAmount = eq
          topCat = cat
        }
      })

      const rawBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      const baseUrl = rawBaseUrl.replace(/\/$/, '')

      const baseParams = `month=${encodeURIComponent(currentMonthName)}&sales=${month.totalSales}&profit=${month.totalProfit}&expRiel=${month.totalExpRiel}&expUsd=${month.totalExpUsd}`

      const imgSummaryUrl = `${baseUrl}/api/og/monthly-report?card=summary&${baseParams}`
      const imgOwnersUrl = `${baseUrl}/api/og/monthly-report?card=owners&${baseParams}&pichP=${month.profitByOwner.Pich}&jingP=${month.profitByOwner.Jing}&bothP=${month.profitByOwner.Both}`
      const imgExpensesUrl = `${baseUrl}/api/og/monthly-report?card=expenses&${baseParams}&topCat=${encodeURIComponent(topCat)}&topCatAmt=${topCatAmount}`

      const monthlyRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          media: [
            {
              type: 'photo',
              media: imgSummaryUrl,
              caption: `📊 *${currentMonthName.toUpperCase()} — EXECUTIVE BUSINESS SUMMARY*`,
              parse_mode: 'Markdown'
            },
            { type: 'photo', media: imgOwnersUrl },
            { type: 'photo', media: imgExpensesUrl }
          ]
        })
      })

      monthlyTelegramResponse = await monthlyRes.json()
      if (!monthlyRes.ok) {
        console.error('Telegram Monthly Album Send Error:', monthlyTelegramResponse)
      }
    }

    return NextResponse.json({
      success: true,
      dailySent: sendDaily,
      monthlySent: isLastDayOfMonth && sendMonthly,
      telegramResults: {
        daily: dailyTelegramResponse,
        monthly: monthlyTelegramResponse
      }
    })
  } catch (error: any) {
    console.error('Telegram Cron Job Uncaught Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}