import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-ground text-ink">
          <div className="text-center">
            <p className="mb-4 font-display text-7xl text-accent">
              404
            </p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-ink">
              Page not found
            </h1>
            <p className="mb-8 text-lg text-ink-soft">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <Link href="/" className="font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-accent">
              Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
