import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import HTMLtoDOCX from 'html-to-docx';

export async function POST(req: NextRequest) {
  try {
    const { markdown } = await req.json();

    if (!markdown) {
      return NextResponse.json({ error: 'No markdown provided' }, { status: 400 });
    }

    // Convert Markdown to HTML
    const htmlString = await marked.parse(markdown);

    // Convert HTML to DOCX buffer
    const fileBuffer = await HTMLtoDOCX(htmlString, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    // Create standard web response with proper headers for file download
    const response = new NextResponse(fileBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Export.docx"',
      },
    });

    return response;
  } catch (error: any) {
    console.error('DOCX Export error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
