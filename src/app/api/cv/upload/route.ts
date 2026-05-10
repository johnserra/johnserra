import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { insertCvDocument } from '@/lib/db';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    
    if (file.type !== 'application/pdf') {
       return NextResponse.json({ error: 'Only PDF files are currently supported' }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'application/pdf'
              }
            },
            {
              text: 'You are an expert ATS (Applicant Tracking System) parser. Please transcribe this CV/resume exactly into clean, well-structured Markdown. Do not include any conversational filler, introductory or concluding text, or markdown code blocks (```markdown). Just output the raw Markdown content representing the CV.'
            }
          ]
        }
      ]
    });

    const markdownContent = response.text || '';

    // Save to local SQLite database
    const docId = insertCvDocument(file.name, markdownContent);

    return NextResponse.json({ id: docId, markdown: markdownContent });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
