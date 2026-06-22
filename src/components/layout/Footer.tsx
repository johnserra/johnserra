import { LogoLinkedin, Email } from "@carbon/icons-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-white dark:bg-carbon-gray-100 border-t border-zinc-200 dark:border-zinc-800 font-sans">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Social Links */}
          <div className="flex items-center gap-6">
            <a
              href="https://linkedin.com/in/johnserra"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              aria-label="LinkedIn"
            >
              <LogoLinkedin size={20} />
            </a>
            <a
              href="mailto:john@serra.us"
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              aria-label="Email"
            >
              <Email size={20} />
            </a>
          </div>

          {/* Copyright */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Copyright &copy; {currentYear}
          </p>
        </div>
      </div>
    </footer>
  );
}
