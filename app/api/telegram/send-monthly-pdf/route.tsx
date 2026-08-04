import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig'
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
  Svg,
  Line,
  Polyline
} from '@react-pdf/renderer'

export const runtime = 'nodejs'

// 🔥 1. REGISTER NOTO SANS KHMER (CLEAN MODERN ENGLISH NUMBERS/UI + KHMER SCRIPT)
Font.register({
  family: 'NotoSansKhmer',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansKhmer/hinted/ttf/NotoSansKhmer-Regular.ttf',
      fontWeight: 'normal'
    },
    {
      src: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansKhmer/hinted/ttf/NotoSansKhmer-Bold.ttf',
      fontWeight: 'bold'
    }
  ]
})

const EXCHANGE_RATE = 4000
const formatKHR = (val: number) => `${Math.round(val || 0).toLocaleString()} KHR`
const formatUSD = (val: number) => `$${Number(val || 0).toFixed(2)}`
const formatNum = (val: number) => Number(val || 0).toLocaleString()

// --- A4 CORPORATE & SAAS CARD STYLESHEET ---
const styles = StyleSheet.create({
  page: { 
    padding: 35, 
    paddingBottom: 45, 
    fontFamily: 'NotoSansKhmer', 
    backgroundColor: '#ffffff', 
    color: '#0f172a' 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    borderBottomWidth: 2, 
    borderBottomColor: '#0f172a', 
    paddingBottom: 10, 
    marginBottom: 16 
  },
  brandTitle: { fontSize: 9, color: '#64748b', textTransform: 'uppercase' },
  docTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginTop: 2 },
  monthBadge: { fontSize: 13, fontWeight: 'bold', color: '#b58a3d' },
  sectionTitle: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    color: '#334155', 
    backgroundColor: '#f1f5f9', 
    padding: 6, 
    marginBottom: 10, 
    marginTop: 14 
  },
  
  // Grid & SaaS Card Layouts
  grid2: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  grid3: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  card: { 
    flex: 1, 
    padding: 10, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    backgroundColor: '#f8fafc' 
  },
  cardHighlight: { 
    flex: 1, 
    padding: 10, 
    borderRadius: 6, 
    borderWidth: 1, 
    borderColor: '#e2e8f0', 
    backgroundColor: '#f8fafc', 
    borderLeftWidth: 4 
  },
  cardLabel: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 },
  cardValue: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  cardSubValue: { fontSize: 8, color: '#94a3b8', marginBottom: 8 },
  
  // Pich / Jing / Both / Mom 4-box Subgrid
  subBoxGrid: { flexDirection: 'row', gap: 4, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6 },
  subBox: { 
    flex: 1, 
    padding: 4, 
    borderRadius: 4, 
    backgroundColor: '#ffffff', 
    textAlign: 'center', 
    borderWidth: 1, 
    borderColor: '#e2e8f0' 
  },
  subBoxMom: { 
    flex: 1, 
    padding: 4, 
    borderRadius: 4, 
    backgroundColor: '#fefcf3', 
    textAlign: 'center', 
    borderWidth: 1, 
    borderColor: '#fde047' 
  },
  subBoxLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase' },
  subBoxVal: { fontSize: 8, color: '#334155', fontWeight: 'bold', marginTop: 1 },

  // Expense Cash/QR Split Grid
  expSplitGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6, marginTop: 4 },
  expSplitCol: { width: '48%' },
  expSplitText: { fontSize: 8, color: '#64748b', marginBottom: 2 },

  // Tables & Rows
  tableHeader: { flexDirection: 'row', backgroundColor: '#e2e8f0', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 5, paddingHorizontal: 6 },
  colCat: { flex: 2, fontSize: 8, color: '#334155' },
  colAmt: { flex: 1, fontSize: 8, textAlign: 'right', fontWeight: 'bold', color: '#0f172a' },
  
  // Health Bar / Progress Bar
  barContainer: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginVertical: 4 },
  barFill: { height: '100%', borderRadius: 3 },

  footer: { 
    position: 'absolute', 
    bottom: 18, 
    left: 35, 
    right: 35, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    borderTopWidth: 1, 
    borderTopColor: '#cbd5e1', 
    paddingTop: 8 
  },
  footerText: { fontSize: 8, color: '#64748b' }
})

// --- HELPER COMPONENT: COMPLEX SAAS CARD WITH 4 OWNER SUB-BOXES ---
const ComplexCardPDF = ({ title, total, pich = 0, jing = 0, both = 0, mom = 0, color = '#1e293b' }: any) => (
  <View style={styles.card} wrap={false}>
    <Text style={styles.cardLabel}>{title}</Text>
    <Text style={[styles.cardValue, { color }]}>{formatKHR(total)}</Text>
    <Text style={styles.cardSubValue}>{formatUSD(total / EXCHANGE_RATE)}</Text>
    <View style={styles.subBoxGrid}>
      <View style={styles.subBox}>
        <Text style={styles.subBoxLabel}>Pich</Text>
        <Text style={styles.subBoxVal}>{formatKHR(pich)}</Text>
      </View>
      <View style={styles.subBox}>
        <Text style={styles.subBoxLabel}>Jing</Text>
        <Text style={styles.subBoxVal}>{formatKHR(jing)}</Text>
      </View>
      <View style={styles.subBox}>
        <Text style={styles.subBoxLabel}>Both</Text>
        <Text style={styles.subBoxVal}>{formatKHR(both)}</Text>
      </View>
      <View style={styles.subBoxMom}>
        <Text style={[styles.subBoxLabel, { color: '#ca8a04' }]}>Mom</Text>
        <Text style={[styles.subBoxVal, { color: '#854d0e' }]}>{formatKHR(mom)}</Text>
      </View>
    </View>
  </View>
)

// --- HELPER COMPONENT: EXPENSE CARD WITH CASH / QR BREAKDOWN ---
const ExpenseBreakdownCardPDF = ({ title, cR = 0, cU = 0, qR = 0, qU = 0, color = '#1e293b' }: any) => {
  const totalRiel = cR + qR
  const totalUsd = cU + qU
  return (
    <View style={styles.card} wrap={false}>
      <Text style={styles.cardLabel}>{title}</Text>
      <Text style={[styles.cardValue, { color }]}>{formatKHR(totalRiel)}</Text>
      {totalUsd > 0 ? (
        <Text style={[styles.cardSubValue, { color, fontWeight: 'bold' }]}>{formatUSD(totalUsd)}</Text>
      ) : (
        <Text style={styles.cardSubValue}>$0.00</Text>
      )}
      <View style={styles.expSplitGrid}>
        <View style={styles.expSplitCol}>
          <Text style={styles.expSplitText}>
            Cash: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatKHR(cR)}</Text>
          </Text>
          <Text style={styles.expSplitText}>
            QR: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatKHR(qR)}</Text>
          </Text>
        </View>
        <View style={styles.expSplitCol}>
          <Text style={styles.expSplitText}>
            Cash: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatUSD(cU)}</Text>
          </Text>
          <Text style={styles.expSplitText}>
            QR: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatUSD(qU)}</Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

// --- HELPER COMPONENT: HEALTH BAR COMPARISON ---
const HealthBarPDF = ({ title, current, target, color, reverseLogic = false }: any) => {
  let pct = target > 0 ? (current / target) * 100 : (current > 0 ? 100 : 0)
  let displayPct = pct.toFixed(1)
  let barWidth = Math.min(100, Math.max(0, pct))
  let barColor = color
  if (!reverseLogic) {
    if (pct < 50) barColor = '#ef4444'; else if (pct >= 100) barColor = '#10b981'
  } else {
    if (pct > 100) barColor = '#ef4444'; else if (pct < 80) barColor = '#10b981'
  }
  return (
    <View style={[styles.card, { marginBottom: 8 }]} wrap={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#334155' }}>{title}</Text>
        <Text style={{ fontSize: 9, fontWeight: 'bold', color: barColor }}>{displayPct}%</Text>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: barColor }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 7, color: '#64748b' }}>
          This MTD: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatKHR(current)}</Text>
        </Text>
        <Text style={{ fontSize: 7, color: '#64748b' }}>
          Last Mth: <Text style={{ color: '#334155', fontWeight: 'bold' }}>{formatKHR(target)}</Text>
        </Text>
      </View>
    </View>
  )
}

// --- HELPER COMPONENT: SVG TREND LINE CHART ---
const LineChartCardPDF = ({ title, dataCurrent, dataLast, color }: any) => {
  const maxVal = Math.max(...dataCurrent, ...dataLast, 1)
  const formatPoints = (arr: any[]) => arr.map((val: any, idx: number) => {
    const x = (idx / 30) * 450; const y = 80 - ((val / maxVal) * 70); return `${x},${y}`
  }).join(' ')
  
  return (
    <View style={[styles.card, { marginBottom: 10 }]} wrap={false}>
      <Text style={[styles.cardLabel, { marginBottom: 8 }]}>{title}</Text>
      <Svg viewBox="0 0 450 85" style={{ width: '100%', height: 65 }}>
        <Line x1="0" y1="20" x2="450" y2="20" stroke="#f1f5f9" strokeWidth="1" />
        <Line x1="0" y1="50" x2="450" y2="50" stroke="#f1f5f9" strokeWidth="1" />
        <Line x1="0" y1="80" x2="450" y2="80" stroke="#cbd5e1" strokeWidth="1" />
        <Polyline points={formatPoints(dataLast)} fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3,3" />
        <Polyline points={formatPoints(dataCurrent)} fill="none" stroke={color} strokeWidth="2" />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 7, color: color, fontWeight: 'bold' }}>━ This Month Trend</Text>
        <Text style={{ fontSize: 7, color: '#94a3b8' }}>- - Last Month Trend</Text>
      </View>
    </View>
  )
}

// --- FULL MULTI-PAGE DOCUMENT COMPONENT (DYNAMIC FLOW WITH NO CUT-OFFS) ---
const MonthlyReportPDF = ({ monthName, mtd, lastMonth, wholesaleTop, retailTop, categoryBreakdown, charts }: any) => {
  const margin = mtd.totalSales > 0 ? ((mtd.totalProfit / mtd.totalSales) * 100).toFixed(1) : '0.0'
  const totalExpEq = mtd.totalExpRiel + (mtd.totalExpUsd * EXCHANGE_RATE)
  const netCashFlow = mtd.totalProfit - totalExpEq

  const categories = Object.entries(categoryBreakdown || {}).sort(
    (a: any, b: any) => (b[1].riel + b[1].usd * EXCHANGE_RATE) - (a[1].riel + a[1].usd * EXCHANGE_RATE)
  )

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={true}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>Rice Business Financial Report</Text>
            <Text style={styles.docTitle}>Full Executive SaaS Scorecard</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.monthBadge}>{monthName}</Text>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 3 }}>Generated: {new Date().toLocaleDateString('en-GB')}</Text>
          </View>
        </View>

        {/* SECTION 1: EXECUTIVE SUMMARY */}
        <Text style={styles.sectionTitle}>1. EXECUTIVE SUMMARY & KEY INSIGHTS</Text>
        <View style={styles.grid3} wrap={false}>
          <View style={[styles.cardHighlight, { borderLeftColor: '#10b981' }]}>
            <Text style={styles.cardLabel}>Gross Profit Margin</Text>
            <Text style={[styles.cardValue, { color: '#10b981' }]}>{margin}%</Text>
            <Text style={styles.cardSubValue}>Based on monthly gross sales</Text>
          </View>
          <View style={[styles.cardHighlight, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.cardLabel}>Net Retained Cash Flow</Text>
            <Text style={[styles.cardValue, { color: netCashFlow >= 0 ? '#2563eb' : '#dc2626' }]}>{formatKHR(netCashFlow)}</Text>
            <Text style={styles.cardSubValue}>After operational & personal expenses</Text>
          </View>
          <View style={[styles.cardHighlight, { borderLeftColor: '#f59e0b' }]}>
            <Text style={styles.cardLabel}>Total Outflow Expenses (Eq)</Text>
            <Text style={styles.cardValue}>{formatKHR(totalExpEq)}</Text>
            <Text style={styles.cardSubValue}>Combined KHR and USD equivalent</Text>
          </View>
        </View>
        <View style={[styles.card, { marginBottom: 14, backgroundColor: '#f8fafc' }]} wrap={false}>
          <Text style={{ fontSize: 8, color: '#334155', lineHeight: 1.5 }}>
            Operational Conclusion: During {monthName}, the business achieved total sales of {formatKHR(mtd.totalSales)} with a gross profit of {formatKHR(mtd.totalProfit)}. After accounting for all operational and personal expenses of {formatKHR(totalExpEq)} equivalent, the net retained cash flow stands at {formatKHR(netCashFlow)}.
          </Text>
        </View>

        {/* SECTION 2: MONTH TO DATE (MTD) PERFORMANCE CARDS */}
        <Text style={styles.sectionTitle}>2. MONTH TO DATE (MTD) PERFORMANCE</Text>
        <View style={styles.grid2} wrap={false}>
          <ComplexCardPDF title="MTD Sales" total={mtd.totalSales} pich={mtd.pichSales} jing={mtd.jingSales} both={mtd.bothSales} mom={mtd.momSales} color="#2563eb" />
          <ComplexCardPDF title="MTD Profit" total={mtd.totalProfit} pich={mtd.pichProfit} jing={mtd.jingProfit} both={mtd.bothProfit} mom={mtd.momProfit} color="#10b981" />
        </View>
        <View style={styles.grid3} wrap={false}>
          <ExpenseBreakdownCardPDF title="Cash Collected (Direct)" cR={mtd.col.cR} cU={mtd.col.cU} qR={mtd.col.qR} qU={mtd.col.qU} color="#3b82f6" />
          <ExpenseBreakdownCardPDF title="MTD Biz Expenses" cR={mtd.bizCashRiel} cU={mtd.bizCashUsd} qR={mtd.bizQrRiel} qU={mtd.bizQrUsd} color="#b91c1c" />
          <ExpenseBreakdownCardPDF title="MTD Personal Exp" cR={mtd.persCashRiel} cU={mtd.persCashUsd} qR={mtd.persQrRiel} qU={mtd.persQrUsd} color="#f59e0b" />
        </View>

        {/* SECTION 3: MTD TOP PERFORMERS (WHOLESALE & RETAIL) */}
        <Text style={styles.sectionTitle}>3. MTD TOP PERFORMERS (WHOLESALE & RETAIL)</Text>
        <View style={styles.grid2} wrap={false}>
          <View style={styles.card}>
            <Text style={[styles.cardLabel, { marginBottom: 6, color: '#2563eb' }]}>TOP 3 WHOLESALE (BY VOLUME)</Text>
            {wholesaleTop.topByQty.length === 0 ? <Text style={{ fontSize: 8, color: '#94a3b8' }}>No wholesale data available.</Text> : (
              wholesaleTop.topByQty.map((item: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: 'bold' }}>{idx + 1}. {item.name}</Text>
                  <Text style={{ fontSize: 8, color: '#2563eb', fontWeight: 'bold' }}>{formatNum(item.qty)} bags ({formatKHR(item.profit)})</Text>
                </View>
              ))
            )}
          </View>
          <View style={styles.card}>
            <Text style={[styles.cardLabel, { marginBottom: 6, color: '#10b981' }]}>TOP 3 RETAIL (BY VOLUME)</Text>
            {retailTop.topByQty.length === 0 ? <Text style={{ fontSize: 8, color: '#94a3b8' }}>No retail data available.</Text> : (
              retailTop.topByQty.map((item: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: 'bold' }}>{idx + 1}. {item.name}</Text>
                  <Text style={{ fontSize: 8, color: '#10b981', fontWeight: 'bold' }}>{formatNum(item.qty)} bags ({formatKHR(item.profit)})</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* SECTION 4: COMPARE MTD VS LAST MONTH */}
        <Text style={styles.sectionTitle}>4. COMPARE MTD VS LAST MONTH</Text>
        <View style={styles.grid2} wrap={false}>
          <HealthBarPDF title="Sales Comparison" current={mtd.totalSales} target={lastMonth.totalSales} color="#2563eb" />
          <HealthBarPDF title="Profit Comparison" current={mtd.totalProfit} target={lastMonth.totalProfit} color="#10b981" />
        </View>
        <View style={styles.grid2} wrap={false}>
          <HealthBarPDF title="Biz Expenses Comparison" current={mtd.bizCashRiel + mtd.bizQrRiel + (mtd.bizCashUsd * EXCHANGE_RATE)} target={lastMonth.bizCashRiel + lastMonth.bizQrRiel + (lastMonth.bizCashUsd * EXCHANGE_RATE)} color="#b91c1c" reverseLogic />
          <HealthBarPDF title="Personal Expenses Comparison" current={mtd.persCashRiel + mtd.persQrRiel + (mtd.persCashUsd * EXCHANGE_RATE)} target={lastMonth.persCashRiel + lastMonth.persQrRiel + (lastMonth.persCashUsd * EXCHANGE_RATE)} color="#f59e0b" reverseLogic />
        </View>

        {/* SECTION 5: TREND ANALYSIS CHARTS */}
        <Text style={styles.sectionTitle}>5. TREND ANALYSIS (DAY 1 - 31)</Text>
        <View style={styles.grid2} wrap={false}>
          <LineChartCardPDF title="Total Sales: This Month vs Last Month" dataCurrent={charts.thisMonthSales} dataLast={charts.lastMonthSales} color="#2563eb" />
          <LineChartCardPDF title="Total Profit: This Month vs Last Month" dataCurrent={charts.thisMonthProfit} dataLast={charts.lastMonthProfit} color="#10b981" />
        </View>

        {/* SECTION 6: ITEMIZED EXPENSES BY CATEGORY */}
        <Text style={styles.sectionTitle}>6. ITEMIZED EXPENSES BY CATEGORY</Text>
        <View wrap={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.colCat}>Category Name</Text>
            <Text style={styles.colAmt}>Total (KHR)</Text>
            <Text style={styles.colAmt}>Total (USD)</Text>
          </View>
          {categories.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.colCat}>No recorded expenses.</Text>
              <Text style={styles.colAmt}>0 KHR</Text>
              <Text style={styles.colAmt}>$0.00</Text>
            </View>
          ) : (
            categories.map(([cat, val]: any, idx: number) => (
              <View key={idx} style={styles.tableRow} wrap={false}>
                <Text style={styles.colCat}>{cat}</Text>
                <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatKHR(val.riel)}</Text>
                <Text style={[styles.colAmt, { color: '#dc2626' }]}>{formatUSD(val.usd)}</Text>
              </View>
            ))
          )}
        </View>

        {/* SECTION 7: SIGN-OFF SIGNATURES */}
        <View style={{ marginTop: 25, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 }} wrap={false}>
          <View style={{ width: '45%' }}>
            <Text style={{ fontSize: 8, color: '#334155', fontWeight: 'bold', marginBottom: 25 }}>Prepared By:</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} />
            <Text style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>Accountant / POS System Operator</Text>
          </View>
          <View style={{ width: '45%' }}>
            <Text style={{ fontSize: 8, color: '#334155', fontWeight: 'bold', marginBottom: 25 }}>Approved By:</Text>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#94a3b8' }} />
            <Text style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>Business Ownership Sign-off</Text>
          </View>
        </View>

        {/* DYNAMIC FOOTER ("Page X of Y" automatically calculated across all pages) */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Rice POS System — Automated Executive Scorecard</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
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
    
    // Start of current month & last month
    const startOfMonth = `${yearStr}-${monthStr}-01T00:00:00+07:00`
    const lastMonthDate = new Date(Number(yearStr), Number(monthStr) - 2, 1)
    const lastMonthStart = lastMonthDate.toISOString()

    const [
      { data: salesData },
      { data: invData },
      { data: retData },
      { data: expData },
      { data: payData }
    ] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', lastMonthStart),
      supabase.from('invoice_summaries').select('*').gte('created_at', lastMonthStart),
      supabase.from('retail_sales').select('*').gte('created_at', lastMonthStart),
      supabase.from('expenses').select('*').gte('created_at', lastMonthStart),
      supabase.from('invoice_payments').select('*').gte('payment_date', lastMonthStart)
    ])

    const wholesaleSales = salesData || []
    const invoices = invData || []
    const retailSales = retData || []
    const expenses = expData || []
    const invoicePayments = payData || []

    const isMTD = (dateStr: string) => new Date(dateStr).getMonth() === now.getMonth() && new Date(dateStr).getFullYear() === now.getFullYear()
    const isLastMonth = (dateStr: string) => {
      const d = new Date(dateStr)
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()
    }

    const parseOwnerSafe = (ownerStr?: string) => {
      if (!ownerStr) return 'both'
      const s = ownerStr.toLowerCase()
      if (s.includes('pich')) return 'pich'
      if (s.includes('jing')) return 'jing'
      if (s.includes('mom')) return 'mom'
      return 'both'
    }

    // Comprehensive SaaS Card Calculator
    const calculateSlice = (invSlice: any[], retSlice: any[], expSlice: any[], paySlice: any[]) => {
      let totalSales = 0, pichSales = 0, jingSales = 0, bothSales = 0, momSales = 0
      let totalProfit = 0, pichProfit = 0, jingProfit = 0, bothProfit = 0, momProfit = 0

      invSlice.forEach(inv => {
        const rev = Number(inv.total_sales) || 0; const prof = Number(inv.total_profit) || 0
        const o = parseOwnerSafe(inv.owner)
        if (o === 'mom') { momSales += rev; momProfit += prof }
        else {
          totalSales += rev; totalProfit += prof
          if (o === 'pich') { pichSales += rev; pichProfit += prof } else if (o === 'jing') { jingSales += rev; jingProfit += prof } else { bothSales += rev; bothProfit += prof }
        }
      })

      retSlice.forEach(ret => {
        const rev = (Number(ret.qty) || 0) * (Number(ret.price_per_bag) || 0)
        const prof = ((Number(ret.price_per_bag) || 0) - (Number(ret.cogs_price) || 0)) * (Number(ret.qty) || 0)
        totalSales += rev; totalProfit += prof; bothSales += rev; bothProfit += prof
      })

      // Cash Collected Split
      let cR = 0, cU = 0, qR = 0, qU = 0
      paySlice.forEach((p: any) => {
        const methodStr = (p.payment_method || '').toLowerCase()
        if (methodStr.includes('unpaid') || methodStr.includes('debt')) return
        const amtR = Number(p.amount_paid_riel || 0); const amtU = Number(p.amount_paid_usd || 0)
        const isUsd = methodStr.includes('$'); const isQr = methodStr.includes('qr')
        if (isQr) { if (isUsd) qU += amtU; else qR += amtR } else { if (isUsd) cU += amtU; else cR += amtR }
      })

      // Expenses Split
      let totalExpRiel = 0, totalExpUsd = 0, bizCashRiel = 0, bizCashUsd = 0, bizQrRiel = 0, bizQrUsd = 0, persCashRiel = 0, persCashUsd = 0, persQrRiel = 0, persQrUsd = 0
      const categoryBreakdown: Record<string, { riel: number; usd: number }> = {}

      expSlice.forEach(exp => {
        if (parseOwnerSafe(exp.spender) === 'mom') return
        const r = Number(exp.amount_riel) || 0; const u = Number(exp.amount_usd) || 0
        totalExpRiel += r; totalExpUsd += u
        const isBiz = (exp.description || '').toLowerCase().includes('biz') || (exp.description || '').toLowerCase().includes('business') || (exp.description || '').toLowerCase().includes('staff')
        const isQr = (exp.payment_method || '').toLowerCase().includes('qr')

        if (isBiz) { if (u > 0) { isQr ? bizQrUsd += u : bizCashUsd += u } else { isQr ? bizQrRiel += r : bizCashRiel += r } }
        else { if (u > 0) { isQr ? persQrUsd += u : persCashUsd += u } else { isQr ? persQrRiel += r : persCashRiel += r } }

        const cat = exp.category || exp.description || 'Uncategorized'
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { riel: 0, usd: 0 }
        categoryBreakdown[cat].riel += r; categoryBreakdown[cat].usd += u
      })

      return {
        totalSales, pichSales, jingSales, bothSales, momSales,
        totalProfit, pichProfit, jingProfit, bothProfit, momProfit,
        col: { cR, cU, qR, qU },
        totalExpRiel, totalExpUsd, bizCashRiel, bizCashUsd, bizQrRiel, bizQrUsd, persCashRiel, persCashUsd, persQrRiel, persQrUsd,
        categoryBreakdown
      }
    }

    const mtdMetrics = calculateSlice(
      invoices.filter(i => isMTD(i.created_at)),
      retailSales.filter(r => isMTD(r.created_at)),
      expenses.filter(e => isMTD(e.expense_date || e.created_at)),
      invoicePayments.filter(p => isMTD(p.payment_date || p.created_at))
    )

    const lastMonthMetrics = calculateSlice(
      invoices.filter(i => isLastMonth(i.created_at)),
      retailSales.filter(r => isLastMonth(r.created_at)),
      expenses.filter(e => isLastMonth(e.expense_date || e.created_at)),
      invoicePayments.filter(p => isLastMonth(p.payment_date || p.created_at))
    )

    const getTop = (dataSet: any[]) => {
      const map: Record<string, { name: string, qty: number, profit: number }> = {}
      dataSet.filter(s => isMTD(s.created_at)).forEach(sale => {
        const name = sale.custom_rice_type || sale.rice_type || 'Unknown'
        const qty = Number(sale.qty || 0)
        const profit = (Number(sale.price_per_bag || 0) - Number(sale.cogs_price || 0)) * qty
        if (!map[name]) map[name] = { name, qty: 0, profit: 0 }
        map[name].qty += qty; map[name].profit += profit
      })
      return { topByQty: Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 3) }
    }

    const wholesaleTop = getTop(wholesaleSales)
    const retailTop = getTop(retailSales)

    // Generate 31-day Trend Arrays
    const getDailyArr = (isTarget: any) => {
      const salesArr = new Array(31).fill(0); const profArr = new Array(31).fill(0)
      const allSales = [...wholesaleSales, ...retailSales].filter(s => isTarget(s.created_at) && parseOwnerSafe(s.owner) !== 'mom')
      allSales.forEach(s => {
        const idx = new Date(s.created_at).getDate() - 1
        if (idx >= 0 && idx < 31) {
          salesArr[idx] += (Number(s.qty || 0) * Number(s.price_per_bag || 0))
          profArr[idx] += ((Number(s.price_per_bag || 0) - Number(s.cogs_price || 0)) * Number(s.qty || 0))
        }
      })
      return { salesArr, profArr }
    }

    const thisMthDaily = getDailyArr(isMTD)
    const lastMthDaily = getDailyArr(isLastMonth)
    const charts = {
      thisMonthSales: thisMthDaily.salesArr,
      lastMonthSales: lastMthDaily.salesArr,
      thisMonthProfit: thisMthDaily.profArr,
      lastMonthProfit: lastMthDaily.profArr
    }

    const pdfBuffer = await renderToBuffer(
      <MonthlyReportPDF
        monthName={monthName}
        mtd={mtdMetrics}
        lastMonth={lastMonthMetrics}
        wholesaleTop={wholesaleTop}
        retailTop={retailTop}
        categoryBreakdown={mtdMetrics.categoryBreakdown}
        charts={charts}
      />
    )

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('caption', `📊 *${monthName.toUpperCase()} — FULL EXECUTIVE BUSINESS REPORT*\n\n📄 Complete multi-section statement attached (includes all MTD SaaS cards, Trend charts, and Expense categorization).`)
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