// app/api/telegram/send-cogs-pdf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateAndSendCogsReport } from '@/lib/cogsReportSender';

export async function POST(request: NextRequest) {
  try {
    const { fromDate, toDate, ownerTab, downloadOnly, records } = await request.json();

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range required' }, { status: 400 });
    }

    const validOwnerTab = (ownerTab || 'mom').toLowerCase() === 'mom' ? 'mom' : 'others';

    const result: any = await generateAndSendCogsReport({
      fromDate,
      toDate,
      ownerTab: validOwnerTab,
      downloadOnly: !!downloadOnly,
      clientRecords: records || null // 🔥 Passes UI records directly to the PDF printer
    });

    if (downloadOnly && result?.pdfBuffer) {
      return new NextResponse(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename || 'COGS-Report.pdf'}"`
        }
      });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('API Send COGS PDF Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}