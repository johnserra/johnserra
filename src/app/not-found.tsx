export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen flex items-center justify-center bg-zinc-50">
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-4">
              404
            </p>
            <h1 className="text-4xl font-bold text-zinc-900 mb-4">
              Page not found
            </h1>
            <p className="text-lg text-zinc-600">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
