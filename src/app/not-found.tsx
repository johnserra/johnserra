import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { NAV_LINKS } from "@/lib/constants";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 pt-24 pb-16">
          {/* 404 message */}
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-4">
            404
          </p>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Page not found
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-16">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          {/* Sitemap */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-12">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-6">
              Sitemap
            </h2>
            <nav className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-zinc-900 dark:text-zinc-50 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
