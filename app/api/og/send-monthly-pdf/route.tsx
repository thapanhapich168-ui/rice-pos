import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

// 🔥 MUST USE NODE.JS RUNTIME FOR PDF GENERATION (NOT EDGE)
export const runtime = 'nodejs'

const EXCHANGE_RATE = 4000
const formatKHR = (val: number) => `${Math.round(val || 0).toLocaleString()} KHR`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`

// --- 1. A4 CORPORATE STYLESHEET ---
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#ffffff', color: '#0f172a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 12, marginBottom: 20 },
  brandTitle: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  docTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginTop: 4 },
  monthBadge: { fontSize: 14, fontWeight: 'bold', color: '#b58a3d' },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', backgroundColor: '#f1f5f9', padding: 6, marginBottom: 12, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rowLabel: { fontSize: 10, color: '#334155' },
  rowValue: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },
  grid3: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  card: { flex: 1, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  cardLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 },
  cardValue: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e2e8f0', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 8 },
  colCat: { flex: 2, fontSize: 9, color: '#334155' },
  colAmt: { flex: 1, fontSize: 9, textAlign: 'right', fontWeight: 'bold', color: '#0f172a' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 12 },
  footerText: { fontSize: 9, color: '#64748b' }
})

// --- 2. MULTI-PAGE PDF DOCUMENT COMPONENT ---
const MonthlyReportPDF = ({ monthName, sales, profit, expenseRiel, expenseUsd, owners, categoryBreakdown }: any) => {
  const margin = sales > 0 ? ((profit / sales) * 100).toFixed(1) : '0.0'
  const totalExpEq = expenseRiel + (expenseUsd * EXCHANGE_RATE)
  const netCashFlow = profit - totalExpEq

  const categories = Object.entries(categoryBreakdown || {}).sort(
    (a: any, b: any) => (b[1].riel + b[1].usd * EXCHANGE_RATE) - (a[1].riel + a[1].usd * EXCHANGE_RATE)
  )

  return (
    <Document>
      {/* --- PAGE 1: EXECUTIVE FINANCIAL SUMMARY & PARTNER ALLOCATION --- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>Rice Business Financial Report</Text>
            <Text style={styles.docTitle}>Executive Monthly Statement</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.monthBadge}>{monthName}</Text>
            <Text style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>Generated: {new Date().toLocaleDateString('en-GB')}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>1. KEY EXECUTIVE PERFORMANCE</Text>
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

        <Text style={styles.sectionTitle}>2. PROFIT & EXPENSE BREAKDOWN</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total Monthly Gross Sales</Text>
          <Text style={[styles.rowValue, { color: '#2563eb' }]}>{formatKHR(sales)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total Monthly Gross Profit</Text>
          <Text style={[styles.rowValue, { color: '#10b981' }]}>{formatKHR(profit)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Operational & Personal Outflow (KHR)</Text>
          <Text style={[styles.rowValue, { color: '#dc2626' }]}>{formatKHR(expenseRiel)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Operational & Personal Outflow (USD)</Text>
          <Text style={[styles.rowValue, { color: '#dc2626' }]}>{formatUSD(expenseUsd)}</Text>
        </View>

        <Text style={styles.sectionTitle}>3. PARTNER PROFIT SHARES</Text>
        <View style={styles.grid3}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pich Share</Text>
            <Text style={styles.cardValue}>{formatKHR(owners.Pich || 0)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Jing Share</Text>
            <Text style={styles.cardValue}>{formatKHR(owners.Jing || 0)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Shared Both</Text>
            <Text style={styles.cardValue}>{formatKHR(owners.Both || 0)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Rice POS System — Automated Statement</Text>
          <Text style={styles.footerText}>Page 1 of 2</Text>
        </View>
      </Page>

      {/* --- PAGE 2: EXPENSE CATEGORIZATION TABLE & SIGN-OFF --- */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>Rice Business Financial Report</Text>
            <Text style={styles.docTitle}>Expense Analysis & Signatures</Text>
          </View>
          <Text style={styles.monthBadge}>{monthName}</Text>
        </View>

        <Text style={styles.sectionTitle}>4. ITEMIZED EXPENSES BY CATEGORY</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colCat}>Category / Function Name</Text>
          <Text style={styles.colAmt}>Total (KHR)</Text>
          <Text style={styles.colAmt}>Total (USD)</Text>
        </View>
        {categories.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.colCat}>No recorded expenses this month.</Text>
            <Text style={styles.colAmt}>0 KHR</Text>
            <Text style={styles.colAmt}>$0.00</Text>
          </View>
        ) : (
          categories.map(([cat, val]: any, idx: number) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colCat}>{cat}</Text>
              <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatKHR(val.riel)}</Text>
              <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatUSD(val.usd)}</Text>
            </View>
          ))
        )}

        <View style={{ marginTop: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: '45%' }}>
            <Text style={{ fontSize: 9, color: '#334155', fontWeight: 'bold', marginBottom: 35 }}>Prepared By:</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} />
            <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>Accountant / POS System Operator</Text>
          </View>
          <View style={{ width: '45%' }}>
            <Text style={{ fontSize: 9, color: '#334155', fontWeight: 'bold', marginBottom: 35 }}>Approved By:</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} />
            <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>Business Ownership Sign-off</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Rice POS System — Automated Statement</Text>
          <Text style={styles.footerText}>Page 2 of 2</Text>
        </View>
      </Page>
    </Document>
  )
}

// --- 3. API ROUTE HANDLER (FETCHES DATA, BUILDS PDF & DISPATCHES TO TELEGRAM) ---
export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Missing Supabase variables' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const botToken = TELEGRAM_CONFIG.botToken
    const chatId = TELEGRAM_CONFIG.chatId

    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Missing Telegram credentials in lib/telegramConfig.ts' }, { status: 400 })
    }

    // Cambodia Today & Month helper
    const now = new Date()
    const monthName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', month: 'long', year: 'numeric' }).format(now)
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const [yearStr, monthStr] = todayStr.split('-')
    const startOfMonth = `${yearStr}-${monthStr}-01T00:00:00+07:00`

    // Fetch monthly database records
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

    // Crunch numbers
    let totalSales = 0
    let totalProfit = 0
    const profitByOwner = { Pich: 0, Jing: 0, Both: 0 }
    let totalExpRiel = 0
    let totalExpUsd = 0
    const categoryBreakdown: Record<string, { riel: number; usd: number }> = {}

    invoices.forEach(inv => {
      totalSales += Number(inv.total_sales) || 0
      totalProfit += Number(inv.total_profit) || 0
      const owner = ['Pich', 'Jing'].includes(inv.owner) ? inv.owner : 'Both'
      profitByOwner[owner as keyof typeof profitByOwner] += Number(inv.total_profit) || 0
    })

    retailSales.forEach(ret => {
      const qty = Number(ret.qty) || 0
      const price = Number(ret.price_per_bag) || 0
      const cogs = Number(ret.cogs_price) || 0
      totalSales += qty * price
      totalProfit += (price - cogs) * qty
      profitByOwner.Both += (price - cogs) * qty
    })

    expenses.forEach(exp => {
      const r = Number(exp.amount_riel) || 0
      const u = Number(exp.amount_usd) || 0
      totalExpRiel += r
      totalExpUsd += u
      const cat = exp.category || exp.description || 'Uncategorized'
      if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { riel: 0, usd: 0 }
      categoryBreakdown[cat].riel += r
      categoryBreakdown[cat].usd += u
    })

    // 🔥 COMPILE REACT COMPONENT INTO A BINARY PDF BUFFER
    const pdfBuffer = await renderToBuffer(
      <MonthlyReportPDF
        monthName={monthName}
        sales={totalSales}
        profit={totalProfit}
        expenseRiel={totalExpRiel}
        expenseUsd={totalExpUsd}
        owners={profitByOwner}
        categoryBreakdown={categoryBreakdown}
      />
    )

    // 🔥 PREPARE FORM DATA FOR TELEGRAM sendDocument
    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('caption', `📊 *${monthName.toUpperCase()} — FULL MONTHLY EXECUTIVE REPORT*\n\n📄 Attached is your formal 2-page financial statement and category breakdown PDF.`)
    formData.append('parse_mode', 'Markdown')

    const cleanFilename = `Rice_Business_Report_${monthName.replace(/\s+/g, '_')}.pdf`
    
    // 🔥 FIX: Wrap in new Uint8Array(pdfBuffer) to satisfy TypeScript's web BlobPart requirement
    const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
    formData.append('document', pdfBlob, cleanFilename)

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    })

    const telegramResult = await telegramRes.json()
    if (!telegramRes.ok) {
      throw new Error(telegramResult.description || 'Telegram sendDocument failed')
    }

    return NextResponse.json({ success: true, telegramResult })
  } catch (error: any) {
    console.error('PDF Send Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}