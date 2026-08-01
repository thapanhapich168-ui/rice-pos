import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig'

const EXCHANGE_RATE = 4100
const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString()}៛`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`

export async function GET(request: Request) {
  try {
    // 1. Optional Security Check: Verify Vercel Cron Secret
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Initialize Supabase Admin Client (still needed to fetch invoice & expense data)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. Load Telegram Credentials directly from your imported config
    const botToken = TELEGRAM_CONFIG.botToken
    const chatId = TELEGRAM_CONFIG.chatId
    const sendDaily = TELEGRAM_CONFIG.autoSendDaily
    const sendMonthly = TELEGRAM_CONFIG.autoSendMonthly

    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Missing Telegram credentials in lib/telegramConfig.ts' }, { status: 400 })
    }

    // 4. Determine Cambodia Date & Check if today is Last Day of the Month
    const nowCambodia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" }))
    const todayStr = nowCambodia.toISOString().split('T')[0]
    
    // Tomorrow is day 1 of the next month if today is the last day
    const tomorrowCambodia = new Date(nowCambodia)
    tomorrowCambodia.setDate(nowCambodia.getDate() + 1)
    const isLastDayOfMonth = tomorrowCambodia.getDate() === 1

    // 5. Fetch Data from the start of the current month
    const startOfMonth = new Date(nowCambodia.getFullYear(), nowCambodia.getMonth(), 1).toISOString()

    const [
      { data: invData },
      { data: retData },
      { data: expData }
    ] = await Promise.all([
      supabase.from('invoice_summaries').select('*').gte('created_at', startOfMonth),
      supabase.from('retail_sales').select('*').gte('created_at', startOfMonth),
      supabase.from('expenses').select('*').gte('created_at', startOfMonth)
    ])

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

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: dailyText, parse_mode: 'Markdown' })
      })
    }

    // --- 8. DISPATCH MONTHLY REPORT (ALBUM OF 3 IMAGES) ON LAST DAY OF MONTH AT 7:00 PM ---
    if (isLastDayOfMonth && sendMonthly) {
      const currentMonthName = nowCambodia.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      
      let topCat = 'None'
      let topCatAmount = 0
      Object.entries(month.categoryBreakdown).forEach(([cat, val]) => {
        const eq = val.riel + (val.usd * EXCHANGE_RATE)
        if (eq > topCatAmount) {
          topCatAmount = eq
          topCat = cat
        }
      })

      // Ensure proper base URL for Vercel or local testing
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      const baseParams = `month=${encodeURIComponent(currentMonthName)}&sales=${month.totalSales}&profit=${month.totalProfit}&expRiel=${month.totalExpRiel}&expUsd=${month.totalExpUsd}`

      const imgSummaryUrl = `${baseUrl}/api/og/monthly-report?card=summary&${baseParams}`
      const imgOwnersUrl = `${baseUrl}/api/og/monthly-report?card=owners&${baseParams}&pichP=${month.profitByOwner.Pich}&jingP=${month.profitByOwner.Jing}&bothP=${month.profitByOwner.Both}`
      const imgExpensesUrl = `${baseUrl}/api/og/monthly-report?card=expenses&${baseParams}&topCat=${encodeURIComponent(topCat)}&topCatAmt=${topCatAmount}`

      await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
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
    }

    return NextResponse.json({
      success: true,
      dailySent: sendDaily,
      monthlySent: isLastDayOfMonth && sendMonthly
    })
  } catch (error: any) {
    console.error('Telegram Cron Job Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}