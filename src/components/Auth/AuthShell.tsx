import type { ReactNode } from 'react';

interface AuthShellProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
}

/**
 * SoCal product-family authentication shell.
 *
 * Uses the same graphite header, typography-led product lockup, warm-white
 * working surface and restrained form treatment as SoCal HUB. Keep this
 * visual treatment shared across Sign In, Request Access, recovery and
 * account-status screens. Functional auth logic stays in the callers.
 */
export function AuthShell({
  eyebrow = 'Authorized staff access',
  title,
  description,
  children,
  footer,
  compact = false,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[#faf9f7] font-sans text-[#1a1a1a]">
      <header className="flex min-h-[60px] items-center bg-[#1c1c1e] px-4 text-white shadow-[0_1px_0_#ffffff0a,0_2px_12px_rgba(0,0,0,0.1)] sm:px-7 lg:px-12">
        <div className="flex min-w-0 items-center">
          <span className="shrink-0 border-r border-white/15 pr-3 text-[14px] font-bold tracking-[0.14em]">
            SOCAL INSPECT
          </span>
          <span className="pl-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#9c9994]">
            Autoworks
          </span>
        </div>
      </header>

      <main className="flex min-h-[calc(100dvh-60px)] items-center justify-center px-4 py-10 sm:px-6">
        <section className={`w-full ${compact ? 'max-w-[420px]' : 'max-w-[440px]'}`}>
          {eyebrow && (
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64666b]">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="text-[28px] font-semibold leading-[1.18] tracking-[-0.025em] text-[#1a1a1a] sm:text-[30px]">
              {title}
            </h1>
          )}
          {description && (
            <p className="mt-3 text-sm leading-6 text-[#64666b]">{description}</p>
          )}
          <div className="mt-7 rounded-[10px] border border-[#e4e1dc] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-7">
            {children}
          </div>
          {footer && <div className="mt-6 text-center">{footer}</div>}
          <p className="mt-8 text-center text-[11px] text-[#787a80]">
            SoCal Autoworks · Authorized personnel only
          </p>
        </section>
      </main>
    </div>
  );
}
