'use client';

import { useState } from 'react';
import { Copy, Check, Download, Loader2 } from 'lucide-react';

interface TailoredResultsProps {
  tailoredCv: string;
  coverLetter: string;
}

export default function TailoredResults({ tailoredCv, coverLetter }: TailoredResultsProps) {
  const [activeTab, setActiveTab] = useState<'cv' | 'coverLetter'>('cv');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleCopy = async () => {
    const textToCopy = activeTab === 'cv' ? tailoredCv : coverLetter;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDocx = async () => {
    try {
      setIsDownloading(true);
      const textToExport = activeTab === 'cv' ? tailoredCv : coverLetter;
      const filename = activeTab === 'cv' ? 'Tailored_CV.docx' : 'Cover_Letter.docx';
      
      const response = await fetch('/api/cv/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: textToExport }),
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading DOCX:', error);
      alert('Failed to download document.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 bg-zinc-50 dark:bg-zinc-800/50">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('cv')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cv'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Tailored CV
          </button>
          <button
            onClick={() => setActiveTab('coverLetter')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'coverLetter'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Cover Letter
          </button>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleDownloadDocx}
            disabled={isDownloading}
            className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isDownloading ? 'Exporting...' : 'Export DOCX'}</span>
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied!' : 'Copy Markdown'}</span>
          </button>
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-grow bg-zinc-50 dark:bg-zinc-950 font-mono text-sm text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap">
        {activeTab === 'cv' ? tailoredCv : coverLetter}
      </div>
    </div>
  );
}
