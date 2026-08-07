// app/api/telegram/send-cogs-pdf/route.tsx

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { parseOwner } from '@/utils/formatters';

const formatRiel = (val: number) => `${Math.round(val || 0).toLocaleString()} ៛`;

// --- 1. A4 STYLING ---
const styles = StyleSheet.create({
  page: { padding: 35, fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: '#15803d', paddingBottom: 12, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#15803d' },
  subtitle: { fontSize: 10, color: '#64748b', marginTop: 4 },
  dateText: { fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
  sellerTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', marginTop: 14, marginBottom: 6, backgroundColor: '#f1f5f9', padding: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#fef9c3', borderBottomWidth: 1, borderColor: '#000000', paddingVertical: 6, paddingHorizontal: 4, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#cbd5e1', paddingVertical: 6, paddingHorizontal: 4 },
  colInv: { width: '12%', textAlign: 'center' },
  colCustomer: { width: '22%' },
  colRice: { width: '22%' },
  colCustom: { width: '16%' },
  colQty: { width: '8%', textAlign: 'center' },
  colPrice: { width: '10%', textAlign: 'right' },
  colTotal: { width: '10%', textAlign: 'right', fontWeight: 'bold' },
  sellerSubtotal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fffacd', padding: 6, borderBottomWidth: 1, borderColor: '#000000', fontWeight: 'bold' },
  grandTotalBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fffacd', borderWidth: 1.5, borderColor: '#000000', padding: 10, marginTop: 20 },
  footer: { position: 'absolute', bottom: 20, left: 35, right: 35, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#e2e8f0', paddingTop: 6, fontSize: 8, color: '#94a3b8' }
});

// --- 2. FRONTEND GROUPING MATH ---
function processSellerData(sellerSales: any[]) {
  const customerGroups: Record<string, any[]> = {};

  sellerSales.forEach((row) => {
    const customer = row.customer_name || 'Walk-in';
    if (!customerGroups[customer]) customerGroups[customer] = [];
    customerGroups[customer].push(row);
  });

  const finalRows: any[] = [];
  let sellerGrandTotal = 0;

  Object.keys(customerGroups).forEach((customer) => {
    const group = customerGroups[customer];
    let normalRows: any[] = [];
    let douRows: any[] = [];
    let consumedRows: any[] = [];
    let specialRows: any[] = [];

    group.forEach((item) => {
      const desc = item.custom_rice_type || item.rice_type || '';
      const price = Number(item.cogs_price || 0);

      if (desc.includes('សេវាដឹក')) return;
      if (desc.includes('បាវ') && price === 0) return;

      if (desc.includes('ដូរ') || desc.includes('បញ្ចុះតម្លៃ') || desc.includes('កក់')) douRows.push(item);
      else if (desc.includes('បានប្រើ') || desc.includes('អង្ករខ្វះ')) consumedRows.push(item);
      else if (desc.includes('ថ្លៃបាវ')) specialRows.push(item);
      else normalRows.push(item);
    });

    specialRows.sort((a, b) => (a.rice_type || '').localeCompare(b.rice_type || ''));
    const sortedGroup = [...normalRows, ...specialRows, ...douRows, ...consumedRows];

    sortedGroup.forEach((item, index) => {
      const qty = Number(item.qty || 0);
      const price = Number(item.cogs_price || 0);
      let amount = qty * price;

      const descForMath = item.custom_rice_type || item.rice_type || '';
      const isNegative = descForMath.includes('ដូរ') || descForMath.includes('បញ្ចុះតម្លៃ') || descForMath.includes('កក់');

      if (isNegative) amount = -Math.abs(amount);
      else amount = Math.abs(amount);

      sellerGrandTotal += amount;

      finalRows.push({
        ...item,
        calculatedAmount: amount,
        isNegative,
        isFirstOfCustomer: index === 0
      });
    });
  });

  return { rows: finalRows, sellerGrandTotal };
}

// --- 3. EXACT FRONTEND PDF DOCUMENT LAYOUT ---
const CogsReportDocument = ({ groupedBySeller, combinedGrandTotal, fromDate, toDate, tabLabel }: any) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.headerContainer} wrap={false}>
        <View>
          <Text style={styles.title}>🌾 COGS ACCOUNTING SHEET</Text>
          <Text style={styles.subtitle}>{tabLabel} Breakdown Report</Text>
        </View>
        <View>
          <Text style={styles.dateText}>📅 {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}</Text>
          <Text style={{ fontSize: 9, color: '#64748b', textAlign: 'right', marginTop: 3 }}>Phnom Penh, Cambodia</Text>
        </View>
      </View>

      {/* Empty State Guard */}
      {Object.keys(groupedBySeller).length === 0 ? (
        <View style={{ padding: 40, textAlign: 'center' }}>
          <Text style={{ color: '#64748b', fontSize: 14 }}>No COGS sales recorded for this date range.</Text>
        </View>
      ) : (
        Object.keys(groupedBySeller).map((seller) => {
          const { rows, sellerGrandTotal } = processSellerData(groupedBySeller[seller]);

          return (
            <View key={seller} style={{ marginBottom: 15 }}>
              <Text style={styles.sellerTitle}>OWNER: {seller.toUpperCase()}</Text>

              <View style={styles.tableHeader} wrap={false}>
                <Text style={styles.colInv}>INV</Text>
                <Text style={styles.colCustomer}>CUSTOMER</Text>
                <Text style={styles.colRice}>RICE TYPE</Text>
                <Text style={styles.colCustom}>NAME (BILL)</Text>
                <Text style={styles.colQty}>QTY</Text>
                <Text style={styles.colPrice}>PRICE</Text>
                <Text style={styles.colTotal}>TOTAL</Text>
              </View>

              {rows.map((row: any, idx: number) => (
                <View key={idx} style={styles.tableRow} wrap={false}>
                  <Text style={styles.colInv}>{row.invoice_id ? String(row.invoice_id).replace(/\D/g, '') : '-'}</Text>
                  <Text style={styles.colCustomer}>{row.customer_name || 'Walk-in'}</Text>
                  <Text style={styles.colRice}>{row.rice_type || '-'}</Text>
                  <Text style={styles.colCustom}>{row.custom_rice_type || '-'}</Text>
                  <Text style={styles.colQty}>{Number(row.qty || 0).toLocaleString()}</Text>
                  <Text style={styles.colPrice}>{Number(row.cogs_price || 0).toLocaleString()}</Text>
                  <Text style={[styles.colTotal, row.isNegative ? { color: '#dc2626' } : {}]}>
                    {Math.round(row.calculatedAmount || 0).toLocaleString()}
                  </Text>
                </View>
              ))}

              <View style={styles.sellerSubtotal} wrap={false}>
                <Text>Subtotal ({seller})</Text>
                <Text>{formatRiel(sellerGrandTotal)}</Text>
              </View>
            </View>
          );
        })
      )}

      {/* Combined Grand Total Box */}
      <View style={styles.grandTotalBox} wrap={false}>
        <Text style={{ fontWeight: 'bold', fontSize: 13 }}>TOTAL COGS DUE:</Text>
        <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#b58a3d' }}>{formatRiel(combinedGrandTotal)}</Text>
      </View>

      {/* Footer Watermark */}
      <View style={styles.footer} fixed>
        <Text>Generated by COGS Automated Engine • Exact Frontend Layout Clone</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

// --- 4. POST ROUTE HANDLER ---
export async function POST(request: Request) {
  try {
    const { fromDate, toDate, ownerTab, downloadOnly } = await request.json();

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startIso = `${fromDate}T00:00:00`;
    const endIso = `${toDate}T23:59:59`;

    const [{ data: sales }, { data: retailSales }] = await Promise.all([
      supabase.from('sales').select('*').gte('created_at', startIso).lte('created_at', endIso),
      supabase.from('retail_sales').select('*').gte('created_at', startIso).lte('created_at', endIso)
    ]);

    const isMomTab = (ownerTab || '').toLowerCase() === 'mom';

    const rawSales = [...(sales || []), ...(retailSales || [])].filter((s) => {
      const owner = parseOwner(s.owner);
      const isMomRow = owner.toLowerCase() === 'mom';
      return isMomTab ? isMomRow : !isMomRow;
    });

    const groupedBySeller: Record<string, any[]> = {};
    let combinedGrandTotal = 0;

    rawSales.forEach((s) => {
      let seller = parseOwner(s.owner);
      seller = seller.charAt(0).toUpperCase() + seller.slice(1);
      if (!groupedBySeller[seller]) groupedBySeller[seller] = [];
      groupedBySeller[seller].push(s);
    });

    Object.keys(groupedBySeller).forEach((seller) => {
      const { sellerGrandTotal } = processSellerData(groupedBySeller[seller]);
      combinedGrandTotal += sellerGrandTotal;
    });

    const tabLabel = isMomTab ? 'Mom COGS' : 'Pich / Jing / Both COGS';

    // Compile A4 PDF Buffer
    const pdfBuffer = await renderToBuffer(
      <CogsReportDocument
        groupedBySeller={groupedBySeller}
        combinedGrandTotal={combinedGrandTotal}
        fromDate={fromDate}
        toDate={toDate}
        tabLabel={tabLabel}
      />
    );

    // 🔥 NEW: If downloadOnly is requested, return the binary PDF file directly!
    if (downloadOnly) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="COGS-${(ownerTab || 'REPORT').toUpperCase()}-${fromDate}.pdf"`
        }
      });
    }

    // Otherwise, upload to Telegram
    const botToken = TELEGRAM_CONFIG.botToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = TELEGRAM_CONFIG.chatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Telegram credentials missing' }, { status: 500 });
    }

    const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });

    const tgFormData = new FormData();
    tgFormData.append('chat_id', chatId);
    tgFormData.append('document', pdfBlob, `COGS-${(ownerTab || 'REPORT').toUpperCase()}-${fromDate}.pdf`);
    tgFormData.append(
      'caption',
      `🌾 <b>${tabLabel} A4 REPORT</b>\n📅 Date: <b>${fromDate} to ${toDate}</b>\n💰 Total Due: <b>${formatRiel(combinedGrandTotal)}</b>\n✅ Attached: Multi-page A4 PDF`
    );
    tgFormData.append('parse_mode', 'HTML');

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: tgFormData
    });

    const tgResult = await tgRes.json();

    if (!tgRes.ok) {
      throw new Error(`Telegram Upload Error: ${JSON.stringify(tgResult)}`);
    }

    return NextResponse.json({ success: true, messageId: tgResult.result?.message_id });
  } catch (error: any) {
    console.error('Telegram PDF Generate Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}