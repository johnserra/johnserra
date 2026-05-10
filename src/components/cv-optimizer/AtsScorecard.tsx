'use client';

import { CheckCircle, AlertCircle } from 'lucide-react';

interface AtsScorecardProps {
  score: number;
  suggestions: string[];
}

export default function AtsScorecard({ score, suggestions }: AtsScorecardProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-500';
    if (s >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">ATS Suitability Score</h3>
        <div className={`text-4xl font-extrabold ${getScoreColor(score)}`}>
          {score}<span className="text-xl text-zinc-500">/100</span>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-blue-500" />
          Suggestions for Improvement
        </h4>
        <ul className="space-y-3">
          {suggestions.map((suggestion, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <CheckCircle className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
