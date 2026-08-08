import { NextResponse } from 'next/server';
import { generateAndSendCogsReport } from '@/lib/cogsReportSender';

export async function POST(request: Request) {
  try {
    const { fromDate, toDate, ownerTab, downloadOnly } = await request.json();

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range required' }, { status: 400 });
    }

    const result = await generateAndSendCogsReport({
      fromDate,
      toDate,
      ownerTab: ownerTab || 'mom',
      downloadOnly
    });

    if (downloadOnly && result.pdfBuffer) {
      return new NextResponse(new Uint8Array(result.pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename}"`
        }
      });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    console.error('Telegram PDF Generate Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}