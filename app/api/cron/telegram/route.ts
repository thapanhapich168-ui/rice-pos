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

    // 2. Validate Supabase Environment Variables (Prevents instant 500 crashes)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. Load Telegram Credentials directly from your config
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

    // 4. 🔥 BULLETPROOF CAMBODIA DATE PARSING (No "Invalid Date" or RangeError crashes)
    const now = new Date()

    // Safely get Cambodia today string as "YYYY-MM-DD"
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now)

    // Safely get current Cambodia month name (e.g., "August 2026")
    const currentMonthName = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Phnom_Penh',
      month: 'long',
      year: 'numeric'
    }).format(now)

    // Check if tomorrow in Cambodia is Day 1 (to see if today is the Last Day of Month)
    const tomorrowDate = new Date(now.getTime() + 86400000)
    const tomorrowDayCambodia = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        day: 'numeric'
      }).format(tomorrowDate)
    )
    const isLastDayOfMonth = tomorrowDayCambodia === 1

    // Construct start of month in Cambodia timezone safely (YYYY-MM-01T00:00:00+07:00)
    const [yearStr, monthStr] = todayStr.split('-')
    const startOfMonth = `${yearStr}-${monthStr}-01T00:00:00+07:00`

    // 5. Fetch Data from the start of the current month
    const [
      { data: invData, error: invError },
      { data: retData, error: retError },
      { data: expData, error: expError }
    ] = await Promise.all([
      supabase.from('invoice_summaries').select('*').gte('created_at', startOfMonth),
      supabase.from('retail_sales').select('*').gte('created_at', startOfMonth),
      supabase.from('expenses').select('*').gte('created_at', startOfMonth)
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

    const month = calculateSlice(invoices, retailSales, expenses)
    const today = calculateSlice(
      invoices.filter(i => i.created_at?.startsWith(todayStr)),
      retailSales.filter(r => r.created_at?.startsWith(todayStr)),
      expenses.filter(e => (e.expense_date || e.created_at)?.startsWith(todayStr))
    )

    // --- 7. DISPATCH DAILY REPORT (MARKDOWN TEXT) EVERY DAY AT 7:00 PM ---
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

      if (!dailyRes.ok) {
        const errJson = await dailyRes.json()
        console.error('Telegram Daily Send Error:', errJson)
      }
    }

    // --- 8. DISPATCH MONTHLY REPORT (ALBUM OF 3 IMAGES) ON LAST DAY OF MONTH AT 7:00 PM ---
    if (isLastDayOfMonth && sendMonthly) {
      let topCat = 'None'
      let topCatAmount = 0
      Object.entries(month.categoryBreakdown).forEach(([cat, val]) => {
        const eq = val.riel + (val.usd * EXCHANGE_RATE)
        if (eq > topCatAmount) {
          topCatAmount = eq
          topCat = cat
        }
      })

      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

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
            {
              type: 'photo',
              media: imgOwnersUrl
            },
            {
              type: 'photo',
              media: imgExpensesUrl
            }
          ]
        })
      })

      if (!monthlyRes.ok) {
        const errJson = await monthlyRes.json()
        console.error('Telegram Monthly Album Send Error:', errJson)
      }
    }

    return NextResponse.json({
      success: true,
      todayStr,
      isLastDayOfMonth,
      dailySent: sendDaily,
      monthlySent: isLastDayOfMonth && sendMonthly
    })
  } catch (error: any) {
    console.error('Telegram Cron Job Uncaught Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}