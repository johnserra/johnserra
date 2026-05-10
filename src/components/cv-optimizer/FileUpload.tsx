'use client';

import { useState } from 'react';
import { UploadCloud, Loader2, FileText } from 'lucide-react';

interface FileUploadProps {
  onUploadSuccess: (markdown: string) => void;
}

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/cv/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onUploadSuccess(data.markdown);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
      <div className="flex flex-col items-center space-y-4 text-center">
        {file ? (
          <div className="flex items-center space-x-2 text-zinc-900 dark:text-zinc-100">
            <FileText className="w-8 h-8" />
            <span className="font-medium">{file.name}</span>
          </div>
        ) : (
          <>
            <UploadCloud className="w-12 h-12 text-zinc-400" />
            <div>
              <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Upload your CV</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">PDF files only (Max 5MB)</p>
            </div>
          </>
        )}

        <label className="relative cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 px-4 py-2 rounded-md font-medium transition-colors">
          <span>{file ? 'Change File' : 'Select File'}</span>
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {file && (
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            <span>{isUploading ? 'Analyzing...' : 'Analyze CV'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
