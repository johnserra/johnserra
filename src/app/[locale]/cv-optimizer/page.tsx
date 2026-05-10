'use client';

import { useState } from 'react';
import FileUpload from '@/components/cv-optimizer/FileUpload';
import AtsScorecard from '@/components/cv-optimizer/AtsScorecard';
import TailoredResults from '@/components/cv-optimizer/TailoredResults';
import { Loader2 } from 'lucide-react';

export default function CvOptimizerPage() {
  const [baseCvMarkdown, setBaseCvMarkdown] = useState('');
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [atsSuggestions, setAtsSuggestions] = useState<string[]>([]);
  const [jobAd, setJobAd] = useState('');
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredCv, setTailoredCv] = useState('');
  const [coverLetter, setCoverLetter] = useState('');

  const handleUploadSuccess = async (markdown: string) => {
    setBaseCvMarkdown(markdown);
    // Fetch ATS Score
    try {
      const res = await fetch('/api/cv/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
      const data = await res.json();
      if (data.score !== undefined) {
        setAtsScore(data.score);
        setAtsSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error('Error analyzing ATS', e);
    }
  };

  const handleTailor = async () => {
    if (!jobAd.trim()) return;
    setIsTailoring(true);
    try {
      const res = await fetch('/api/cv/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: baseCvMarkdown, jobAd }),
      });
      const data = await res.json();
      if (data.tailoredCv) {
        setTailoredCv(data.tailoredCv);
        setCoverLetter(data.coverLetter);
      }
    } catch (e) {
      console.error('Error tailoring CV', e);
    } finally {
      setIsTailoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-12">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
            CV Optimizer
          </h1>
          <p className="mt-4 text-xl text-zinc-600 dark:text-zinc-400">
            Upload your CV, analyze it for ATS readiness, and tailor it to specific job ads.
          </p>
        </div>

        {!baseCvMarkdown ? (
          <div className="max-w-2xl mx-auto">
            <FileUpload onUploadSuccess={handleUploadSuccess} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              {atsScore !== null && (
                <AtsScorecard score={atsScore} suggestions={atsSuggestions} />
              )}

              <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Target Job Ad</h3>
                <textarea
                  className="w-full h-48 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Paste the job advertisement here..."
                  value={jobAd}
                  onChange={(e) => setJobAd(e.target.value)}
                />
                <button
                  onClick={handleTailor}
                  disabled={isTailoring || !jobAd.trim()}
                  className="w-full mt-4 flex justify-center items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTailoring ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  <span>{isTailoring ? 'Tailoring...' : 'Tailor CV & Cover Letter'}</span>
                </button>
              </div>
            </div>

            <div className="h-full min-h-[600px]">
              {tailoredCv ? (
                <TailoredResults tailoredCv={tailoredCv} coverLetter={coverLetter} />
              ) : (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 dark:text-zinc-400 p-8 text-center bg-zinc-50 dark:bg-zinc-900/50">
                  Paste a job ad and click &quot;Tailor CV&quot; to see your customized results here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
