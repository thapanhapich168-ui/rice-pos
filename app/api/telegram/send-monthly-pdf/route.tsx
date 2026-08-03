import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

export const runtime = 'nodejs'

const EXCHANGE_RATE = 4000
const formatKHR = (val: number) => `${Math.round(val || 0).toLocaleString()} KHR`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`
const formatNum = (val: number) => Number(val || 0).toLocaleString()

// --- A4 CORPORATE STYLESHEET ---
const styles = StyleSheet.create({
  page: { padding: 35, fontFamily: 'Helvetica', backgroundColor: '#ffffff', color: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 10, marginBottom: 16 },
  brandTitle: { fontSize: 9, color: '#64748b', textTransform: 'uppercase' },
  docTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginTop: 2 },
  monthBadge: { fontSize: 13, fontWeight: 'bold', color: '#b58a3d' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', color: '#334155', backgroundColor: '#f1f5f9', padding: 5, marginBottom: 10, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rowLabel: { fontSize: 9, color: '#334155' },
  rowValue: { fontSize: 9, fontWeight: 'bold', color: '#0f172a' },
  grid3: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  card: { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  cardLabel: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 },
  cardValue: { fontSize: 12, fontWeight: 'bold', color: '#0f172a' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e2e8f0', paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 5, paddingHorizontal: 6 },
  colCat: { flex: 2, fontSize: 8, color: '#334155' },
  colAmt: { flex: 1, fontSize: 8, textAlign: 'right', fontWeight: 'bold', color: '#0f172a' },
  footer: { position: 'absolute', bottom: 25, left: 35, right: 35, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 8 },
  footerText: { fontSize: 8, color: '#64748b' }
})

// --- FULL DOCUMENT COMPONENT ---
const MonthlyReportPDF = ({ monthName, mtd, lastMonth, wholesaleTop, retailTop, categoryBreakdown }: any) => {
  const margin = mtd.totalSales > 0 ? ((mtd.totalProfit / mtd.totalSales) * 100).toFixed(1) : '0.0'
  const totalExpEq = mtd.totalExpRiel + (mtd.totalExpUsd * EXCHANGE_RATE)
  const netCashFlow = mtd.totalProfit - totalExpEq

  const categories = Object.entries(categoryBreakdown || {}).sort(
    (a: any, b: any) => (b[1].riel + b[1].usd * EXCHANGE_RATE) - (a[1].riel + a[1].usd * EXCHANGE_RATE)
  )

  return (
    <Document>
      {/* --- PAGE 1: EXECUTIVE SUMMARY, MTD PERFORMANCE & PARTNER SHARES --- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>Rice Business Financial Report</Text>
            <Text style={styles.docTitle}>Executive Monthly Statement</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.monthBadge}>{monthName}</Text>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>Generated: {new Date().toLocaleDateString('en-GB')}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>1. EXECUTIVE SUMMARY & KEY INSIGHTS</Text>
        <View style={styles.grid3}>
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#10b981' }]}>
            <Text style={styles.cardLabel}>Gross Profit Margin</Text>
            <Text style={[styles.cardValue, { color: '#10b981' }]}>{margin}%</Text>
          </View>
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.cardLabel}>Net Retained Cash Flow</Text>
            <Text style={[styles.cardValue, { color: netCashFlow >= 0 ? '#2563eb' : '#dc2626' }]}>{formatKHR(netCashFlow)}</Text>
          </View>
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.cardLabel}>Total Expenses (Eq)</Text>
            <Text style={styles.cardValue}>{formatKHR(totalExpEq)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>2. MONTH TO DATE (MTD) PERFORMANCE</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Total MTD Gross Sales</Text><Text style={[styles.rowValue, { color: '#2563eb' }]}>{formatKHR(mtd.totalSales)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Total MTD Gross Profit</Text><Text style={[styles.rowValue, { color: '#10b981' }]}>{formatKHR(mtd.totalProfit)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>MTD Business Expenses (KHR / USD)</Text><Text style={[styles.rowValue, { color: '#dc2626' }]}>{formatKHR(mtd.bizExpRiel)} / {formatUSD(mtd.bizExpUsd)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>MTD Personal Expenses (KHR / USD)</Text><Text style={[styles.rowValue, { color: '#dc2626' }]}>{formatKHR(mtd.persExpRiel)} / {formatUSD(mtd.persExpUsd)}</Text></View>

        <Text style={styles.sectionTitle}>3. PARTNER PROFIT SHARES (MTD)</Text>
        <View style={styles.grid3}>
          <View style={styles.card}><Text style={styles.cardLabel}>Pich Share</Text><Text style={styles.cardValue}>{formatKHR(mtd.profitByOwner.Pich)}</Text></View>
          <View style={styles.card}><Text style={styles.cardLabel}>Jing Share</Text><Text style={styles.cardValue}>{formatKHR(mtd.profitByOwner.Jing)}</Text></View>
          <View style={styles.card}><Text style={styles.cardLabel}>Shared Both</Text><Text style={styles.cardValue}>{formatKHR(mtd.profitByOwner.Both)}</Text></View>
        </View>

        <View style={styles.footer}><Text style={styles.footerText}>Rice POS System</Text><Text style={styles.footerText}>Page 1 of 2</Text></View>
      </Page>

      {/* --- PAGE 2: WHOLESALE & RETAIL TOP PERFORMERS, COMPARISONS & EXPENSE TABLES --- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View><Text style={styles.brandTitle}>Rice Business Financial Report</Text><Text style={styles.docTitle}>Top Performers & Expenses</Text></View>
          <Text style={styles.monthBadge}>{monthName}</Text>
        </View>

        <Text style={styles.sectionTitle}>4. MTD TOP PERFORMERS (WHOLESALE)</Text>
        <View style={styles.tableHeader}><Text style={styles.colCat}>Rice Type / Product</Text><Text style={styles.colAmt}>Volume Sold</Text><Text style={styles.colAmt}>Profit Generated</Text></View>
        {wholesaleTop.topByQty.length === 0 ? (
          <View style={styles.tableRow}><Text style={styles.colCat}>No wholesale data available.</Text><Text style={styles.colAmt}>-</Text><Text style={styles.colAmt}>-</Text></View>
        ) : (
          wholesaleTop.topByQty.map((item: any, idx: number) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colCat}>{idx + 1}. {item.name}</Text>
              <Text style={[styles.colAmt, { color: '#2563eb' }]}>{formatNum(item.qty)} bags</Text>
              <Text style={[styles.colAmt, { color: '#10b981' }]}>{formatKHR(item.profit)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>5. MTD TOP PERFORMERS (RETAIL)</Text>
        <View style={styles.tableHeader}><Text style={styles.colCat}>Rice Type / Product</Text><Text style={styles.colAmt}>Volume Sold</Text><Text style={styles.colAmt}>Profit Generated</Text></View>
        {retailTop.topByQty.length === 0 ? (
          <View style={styles.tableRow}><Text style={styles.colCat}>No retail data available.</Text><Text style={styles.colAmt}>-</Text><Text style={styles.colAmt}>-</Text></View>
        ) : (
          retailTop.topByQty.map((item: any, idx: number) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colCat}>{idx + 1}. {item.name}</Text>
              <Text style={[styles.colAmt, { color: '#2563eb' }]}>{formatNum(item.qty)} bags</Text>
              <Text style={[styles.colAmt, { color: '#10b981' }]}>{formatKHR(item.profit)}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>6. MTD VS LAST MONTH COMPARISON</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Sales Comparison</Text><Text style={styles.rowValue}>This Mth: {formatKHR(mtd.totalSales)} | Last Mth: {formatKHR(lastMonth.totalSales)}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Profit Comparison</Text><Text style={styles.rowValue}>This Mth: {formatKHR(mtd.totalProfit)} | Last Mth: {formatKHR(lastMonth.totalProfit)}</Text></View>

        <Text style={styles.sectionTitle}>7. ITEMIZED EXPENSES BY CATEGORY</Text>
        <View style={styles.tableHeader}><Text style={styles.colCat}>Category Name</Text><Text style={styles.colAmt}>Total (KHR)</Text><Text style={styles.colAmt}>Total (USD)</Text></View>
        {categories.length === 0 ? (
          <View style={styles.tableRow}><Text style={styles.colCat}>No recorded expenses.</Text><Text style={styles.colAmt}>0 KHR</Text><Text style={styles.colAmt}>$0.00</Text></View>
        ) : (
          categories.map(([cat, val]: any, idx: number) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colCat}>{cat}</Text>
              <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatKHR(val.riel)}</Text>
              <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatUSD(val.usd)}</Text>
            </View>
          ))
        )}

        <View style={{ marginTop: 25, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: '45%' }}><Text style={{ fontSize: 8, color: '#334155', fontWeight: 'bold', marginBottom: 25 }}>Prepared By:</Text><View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} /><Text style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>Accountant / POS System</Text></View>
          <View style={{ width: '45%' }}><Text style={{ fontSize: 8, color: '#334155', fontWeight: 'bold', marginBottom: 25 }}>Approved By:</Text><View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} /><Text style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>Business Ownership</Text></View>
        </View>

        <View style={styles.footer}><Text style={styles.footerText}>Rice POS System</Text><Text style={styles.footerText}>Page 2 of 2</Text></View>
      </Page>
    </Document>
  )
}

// --- API ROUTE HANDLER ---
export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Missing Supabase variables' }, { status: 500 })

    const supabase = createClient(supabaseUrl, supabaseKey)
    const botToken = TELEGRAM_CONFIG.botToken
    const chatId = TELEGRAM_CONFIG.chatId
    if (!botToken || !chatId) return NextResponse.json({ error: 'Missing Telegram config' }, { status: 400 })

    const now = new Date()
    const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', month: 'long', year: 'numeric' }).format(now)
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const [yearStr, monthStr] = todayStr.split('-')
    const startOfMonth = `${yearStr}-${monthStr}-01T00:00:00+07:00`

    const lastMonthDate = new Date(Number(yearStr), Number(monthStr) - 2, 1)
    const lastMonthStart = lastMonthDate.toISOString()

    const [{ data: salesData }, { data: invData }, { data: retData }, { data: expData }] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', lastMonthStart),
      supabase.from('invoice_summaries').select('*').gte('created_at', lastMonthStart),
      supabase.from('retail_sales').select('*').gte('created_at', lastMonthStart),
      supabase.from('expenses').select('*').gte('created_at', lastMonthStart)
    ])

    const wholesaleSales = salesData || []
    const invoices = invData || []
    const retailSales = retData || []
    const expenses = expData || []

    const isMTD = (dateStr: string) => new Date(dateStr).getMonth() === now.getMonth() && new Date(dateStr).getFullYear() === now.getFullYear()
    const isLastMonth = (dateStr: string) => {
      const d = new Date(dateStr)
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()
    }

    const calculateSlice = (invSlice: any[], retSlice: any[], expSlice: any[]) => {
      let totalSales = 0, totalProfit = 0
      const profitByOwner = { Pich: 0, Jing: 0, Both: 0 }
      invSlice.forEach(inv => {
        totalSales += Number(inv.total_sales) || 0
        totalProfit += Number(inv.total_profit) || 0
        const owner = ['Pich', 'Jing'].includes(inv.owner) ? inv.owner : 'Both'
        profitByOwner[owner as keyof typeof profitByOwner] += Number(inv.total_profit) || 0
      })
      retSlice.forEach(ret => {
        const qty = Number(ret.qty) || 0
        const price = Number(ret.price_per_bag) || 0
        const cogs = Number(ret.cogs_price) || 0
        totalSales += qty * price
        totalProfit += (price - cogs) * qty
        profitByOwner.Both += (price - cogs) * qty
      })

      let totalExpRiel = 0, totalExpUsd = 0, bizExpRiel = 0, bizExpUsd = 0, persExpRiel = 0, persExpUsd = 0
      const categoryBreakdown: Record<string, { riel: number; usd: number }> = {}

      expSlice.forEach(exp => {
        const r = Number(exp.amount_riel) || 0
        const u = Number(exp.amount_usd) || 0
        totalExpRiel += r; totalExpUsd += u
        const type = (exp.description || '').toLowerCase()
        const isBiz = type === 'business' || type === 'biz' || type === 'staff'
        if (isBiz) { bizExpRiel += r; bizExpUsd += u } else { persExpRiel += r; persExpUsd += u }

        const cat = exp.category || exp.description || 'Uncategorized'
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { riel: 0, usd: 0 }
        categoryBreakdown[cat].riel += r
        categoryBreakdown[cat].usd += u
      })

      return { totalSales, totalProfit, profitByOwner, totalExpRiel, totalExpUsd, bizExpRiel, bizExpUsd, persExpRiel, persExpUsd, categoryBreakdown }
    }

    const mtdMetrics = calculateSlice(invoices.filter(i => isMTD(i.created_at)), retailSales.filter(r => isMTD(r.created_at)), expenses.filter(e => isMTD(e.expense_date || e.created_at)))
    const lastMonthMetrics = calculateSlice(invoices.filter(i => isLastMonth(i.created_at)), retailSales.filter(r => isLastMonth(r.created_at)), expenses.filter(e => isLastMonth(e.expense_date || e.created_at)))

    const getTop = (dataSet: any[]) => {
      const map: Record<string, { name: string, qty: number, profit: number }> = {}
      dataSet.filter(s => isMTD(s.created_at)).forEach(sale => {
        const name = sale.custom_rice_type || sale.rice_type || 'Unknown'
        const qty = Number(sale.qty || 0)
        const profit = (Number(sale.price_per_bag || 0) - Number(sale.cogs_price || 0)) * qty
        if (!map[name]) map[name] = { name, qty: 0, profit: 0 }
        map[name].qty += qty; map[name].profit += profit
      })
      const arr = Object.values(map)
      return { topByQty: [...arr].sort((a, b) => b.qty - a.qty).slice(0, 3) }
    }

    const wholesaleTop = getTop(wholesaleSales)
    const retailTop = getTop(retailSales)

    const pdfBuffer = await renderToBuffer(
      <MonthlyReportPDF
        monthName={monthName}
        mtd={mtdMetrics}
        lastMonth={lastMonthMetrics}
        wholesaleTop={wholesaleTop}
        retailTop={retailTop}
        categoryBreakdown={mtdMetrics.categoryBreakdown}
      />
    )

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('caption', `📊 *${monthName.toUpperCase()} — FULL EXECUTIVE BUSINESS REPORT*\n\n📄 Comprehensive multi-section statement attached.`)
    formData.append('parse_mode', 'Markdown')

    const cleanFilename = `Rice_Business_Report_${monthName.replace(/\s+/g, '_')}.pdf`
    const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
    formData.append('document', pdfBlob, cleanFilename)

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: 'POST', body: formData })
    const telegramResult = await telegramRes.json()
    if (!telegramRes.ok) throw new Error(telegramResult.description || 'Telegram failed')

    return NextResponse.json({ success: true, telegramResult })
  } catch (error: any) {
    console.error('PDF Send Error:', error)
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 })
  }
}