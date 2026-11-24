"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-ground px-4 text-ink">
          <div className="max-w-md text-center">
            <p className="mb-4 font-mono text-sm uppercase tracking-[0.14em] text-accent">
              500
            </p>
            <h1 className="mb-4 font-serif text-4xl font-normal tracking-tight text-ink">
              Something went wrong
            </h1>
            <p className="mb-8 text-base text-muted">
              An unexpected error occurred while loading this page. Please try again.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => reset()}
                className="cursor-pointer rounded-lg bg-accent px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-on-accent transition-colors hover:bg-accent-dim"
              >
                Try again
              </button>
              <Link
                href="/"
                className="font-mono text-xs uppercase tracking-[0.1em] text-accent transition-colors hover:text-accent-dim"
              >
                Home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
