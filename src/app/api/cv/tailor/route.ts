import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export async function POST(req: NextRequest) {
  try {
    const { markdown, jobAd } = await req.json();

    if (!markdown || !jobAd) {
      return NextResponse.json({ error: 'Missing CV markdown or Job Ad' }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are an expert Career Coach and CV Writer. Given a user's base CV and a target Job Advertisement, your task is to:\n1. Tailor the CV to the job ad by emphasizing relevant skills and incorporating keywords, keeping it in Markdown format.\n2. Write a professional, compelling cover letter (in Markdown) for the same job.\n\nOutput ONLY a JSON object with two fields: 'tailoredCv' (string) and 'coverLetter' (string). Do not include any conversational filler.",
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Here is the base CV in Markdown:\n\n${markdown}\n\nHere is the Job Advertisement:\n\n${jobAd}` }]
        }
      ]
    });

    const responseText = response.text || '';
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
      result = JSON.parse(jsonStr);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Tailor error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
