// app/api/telegram/send-cogs-pdf/route.tsx

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TELEGRAM_CONFIG } from '@/lib/telegramConfig';
import { renderToBuffer, Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { parseOwner } from '@/utils/formatters';

// --- 1. REGISTER KHMER FONT FOR REACT-PDF ---
Font.register({
  family: 'KhmerFont',
  src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansKhmer/NotoSansKhmer-Regular.ttf'
});

const formatRielPDF = (val: number) => `${Math.round(val || 0).toLocaleString()} KHR`;
const formatRielCaption = (val: number) => `${Math.round(val || 0).toLocaleString()} ៛`;

// --- 2. STYLING ---
const styles = StyleSheet.create({
  page: { padding: 35, fontFamily: 'KhmerFont', fontSize: 10, color: '#0f172a' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderColor: '#15803d', paddingBottom: 12, marginBottom: 16 },
  title: { fontSize: 18, color: '#15803d' },
  subtitle: { fontSize: 10, color: '#64748b', marginTop: 4 },
  dateText: { fontSize: 11, textAlign: 'right' },
  sellerTitle: { fontSize: 12, color: '#1e293b', marginTop: 14, marginBottom: 6, backgroundColor: '#f1f5f9', padding: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#fffacd', borderBottomWidth: 1, borderColor: '#000000', paddingVertical: 6, paddingHorizontal: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#cbd5e1', paddingVertical: 6, paddingHorizontal: 4 },
  colInv: { width: '12%', textAlign: 'center' },
  colCustomer: { width: '22%' },
  colRice: { width: '20%' },
  colCustom: { width: '18%' },
  colQty: { width: '8%', textAlign: 'center' },
  colPrice: { width: '10%', textAlign: 'right' },
  colTotal: { width: '10%', textAlign: 'right' },
  sellerSubtotal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fffacd', padding: 6, borderBottomWidth: 1, borderColor: '#000000' },
  grandTotalBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fffacd', borderWidth: 1.5, borderColor: '#000000', padding: 10, marginTop: 20 },
  footer: { position: 'absolute', bottom: 20, left: 35, right: 35, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#e2e8f0', paddingTop: 6, fontSize: 8, color: '#94a3b8' }
});

// --- 3. BULLETPROOF CAMBODIA TIMEZONE HELPER (UTC+7) ---
// Safely converts UTC timestamps to zero-padded YYYY-MM-DD in Cambodia time
const getCambodiaDateStr = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    // Cambodia is UTC+7 (7 hours = 7 * 60 * 60 * 1000 ms)
    const camTime = new Date(d.getTime() + (7 * 60 * 60 * 1000));
    return camTime.toISOString().substring(0, 10);
  } catch (e) {
    return dateStr.substring(0, 10);
  }
};

// Matches either direct YYYY-MM-DD string OR converted Cambodia UTC+7 YYYY-MM-DD
const matchesDateRange = (rawDateStr: string, from: string, to: string) => {
  if (!rawDateStr) return false;
  const direct = rawDateStr.substring(0, 10);
  const camDate = getCambodiaDateStr(rawDateStr);
  return (direct >= from && direct <= to) || (camDate >= from && camDate <= to);
};

// --- 4. FRONTEND GROUPING MATH ---
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

// --- 5. PDF DOCUMENT LAYOUT ---
const CogsReportDocument = ({ groupedBySeller, combinedGrandTotal, fromDate, toDate, tabLabel }: any) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.headerContainer} wrap={false}>
        <View>
          <Text style={styles.title}>អង្ករត្រូវទូទាត់</Text>
          <Text style={styles.subtitle}>{tabLabel} Breakdown Report</Text>
        </View>
        <View>
          <Text style={styles.dateText}>Date: {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}</Text>
          <Text style={{ fontSize: 9, color: '#64748b', textAlign: 'right', marginTop: 3 }}>Phnom Penh, Cambodia</Text>
        </View>
      </View>

      {Object.keys(groupedBySeller).length === 0 ? (
        <View style={{ padding: 40, textAlign: 'center' }}>
          <Text style={{ color: '#64748b', fontSize: 13 }}>No COGS sales recorded for this date range.</Text>
        </View>
      ) : (
        Object.keys(groupedBySeller).map((seller) => {
          const { rows, sellerGrandTotal } = processSellerData(groupedBySeller[seller]);

          return (
            <View key={seller} style={{ marginBottom: 15 }}>
              <Text style={styles.sellerTitle}>ថៅកែ {seller.toUpperCase()}</Text>

              <View style={styles.tableHeader} wrap={false}>
                <Text style={styles.colInv}>INV</Text>
                <Text style={styles.colCustomer}>អតិថិជន</Text>
                <Text style={styles.colRice}>ប្រភេទអង្ករ</Text>
                <Text style={styles.colCustom}>ឈ្មោះក្នុងប៊ុង</Text>
                <Text style={styles.colQty}>ចំនួន</Text>
                <Text style={styles.colPrice}>តម្លៃ</Text>
                <Text style={styles.colTotal}>សរុប</Text>
              </View>

              {rows.map((row: any, idx: number) => (
                <View key={idx} style={styles.tableRow} wrap={false}>
                  <Text style={styles.colInv}>{row.invoice_id ? String(row.invoice_id).replace(/\D/g, '') : '-'}</Text>
                  <Text style={styles.colCustomer}>{row.isFirstOfCustomer ? (row.customer_name || 'Walk-in') : ''}</Text>
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
                <Text>សរុប</Text>
                <Text style={{ color: '#b58a3d' }}>{formatRielPDF(sellerGrandTotal)}</Text>
              </View>
            </View>
          );
        })
      )}

      <View style={styles.grandTotalBox} wrap={false}>
        <Text style={{ fontSize: 13 }}>សរុបរួមទាំងអស់</Text>
        <Text style={{ fontSize: 15, color: '#b58a3d' }}>{formatRielPDF(combinedGrandTotal)}</Text>
      </View>

      <View style={styles.footer} fixed>
        <Text>Generated by COGS Automated Engine</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

// --- 6. POST ROUTE HANDLER ---
export async function POST(request: Request) {
  try {
    const { fromDate, toDate, ownerTab, downloadOnly } = await request.json();

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [{ data: sales }, { data: retailSales }] = await Promise.all([
      supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(3000),
      supabase.from('retail_sales').select('*').order('created_at', { ascending: false }).limit(3000)
    ]);

    const isMomTab = (ownerTab || '').toLowerCase() === 'mom';

    // 🔥 USES CAMBODIA TIMEZONE SAFE-MATCHING & SAFE OWNER PARSING
    const rawSales = [...(sales || []), ...(retailSales || [])]
      .filter((s) => matchesDateRange(s.created_at, fromDate, toDate))
      .filter((s) => {
        const owner = parseOwner(s.owner || s.customer_name || '');
        const isMomRow = owner.toLowerCase() === 'mom' || String(s.owner || s.customer_name || '').toLowerCase().includes('mom');
        return isMomTab ? isMomRow : !isMomRow;
      });

    const groupedBySeller: Record<string, any[]> = {};
    let combinedGrandTotal = 0;

    rawSales.forEach((s) => {
      let seller = parseOwner(s.owner || s.customer_name || '');
      seller = seller.charAt(0).toUpperCase() + seller.slice(1);
      if (!groupedBySeller[seller]) groupedBySeller[seller] = [];
      groupedBySeller[seller].push(s);
    });

    Object.keys(groupedBySeller).forEach((seller) => {
      const { sellerGrandTotal } = processSellerData(groupedBySeller[seller]);
      combinedGrandTotal += sellerGrandTotal;
    });

    const tabLabel = isMomTab ? 'Mom COGS' : 'Pich / Jing / Both COGS';

    const pdfBuffer = await renderToBuffer(
      <CogsReportDocument
        groupedBySeller={groupedBySeller}
        combinedGrandTotal={combinedGrandTotal}
        fromDate={fromDate}
        toDate={toDate}
        tabLabel={tabLabel}
      />
    );

    if (downloadOnly) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="COGS-${(ownerTab || 'REPORT').toUpperCase()}-${fromDate}.pdf"`
        }
      });
    }

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
      `🌾 <b>${tabLabel} A4 REPORT</b>\n📅 Date: <b>${fromDate} to ${toDate}</b>\n💰 Total Due: <b>${formatRielCaption(combinedGrandTotal)}</b>\n✅ Attached: Multi-page A4 PDF`
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