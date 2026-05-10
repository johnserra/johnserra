import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export async function POST(req: NextRequest) {
  try {
    const { markdown } = await req.json();

    if (!markdown) {
      return NextResponse.json({ error: 'No CV markdown provided' }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are an expert ATS (Applicant Tracking System) reviewer. Analyze the provided CV markdown and output a JSON object with two fields: 'score' (a number out of 100) and 'suggestions' (an array of strings with actionable advice to improve ATS readability and impact). Do not include any other text besides the JSON.",
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `Here is the CV in Markdown format:\n\n${markdown}` }]
        }
      ]
    });

    const responseText = response.text || '';
    
    // Attempt to parse JSON safely
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // Fallback if Gemini wraps in markdown code block
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
      result = JSON.parse(jsonStr);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
