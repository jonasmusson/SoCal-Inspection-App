import { ReactNode } from 'react';
import { Car } from 'lucide-react';

interface AuthShellProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
}

export function AuthShell({ eyebrow = 'Inspection operations', title, description, children, footer, compact = false }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[#f4f2ed] text-primary-900 lg:grid lg:grid-cols-[minmax(300px,0.82fr)_minmax(520px,1.18fr)]">
      <aside className="relative hidden overflow-hidden bg-primary-950 px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-44 -left-28 h-[30rem] w-[30rem] rounded-full border border-accent-300/10" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-accent-300/40 bg-accent-400 text-primary-950">
              <Car className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-200">SoCal Autoworks</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-primary-400">Inspection platform</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-sm">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-accent-300">Built for the shop floor</p>
          <h1 className="max-w-md text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white xl:text-5xl">
            Precise records for exceptional work.
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-6 text-primary-300">
            Keep every finding, image, decision, and customer report organized from check-in through delivery.
          </p>
          <div className="mt-10 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-primary-400">
            <span className="h-px w-8 bg-accent-400" />
            Southern California
          </div>
        </div>
        <p className="relative z-10 text-[10px] uppercase tracking-[0.18em] text-primary-500">Private workspace · Authorized staff only</p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12 xl:px-20">
        <div className={`w-full ${compact ? 'max-w-md' : 'max-w-[430px]'}`}>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-950 text-accent-300">
              <Car className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-900">SoCal Autoworks</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-primary-500">Inspection platform</p>
            </div>
          </div>
          {eyebrow && <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-700">{eyebrow}</p>}
          {title && <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em] text-primary-950">{title}</h2>}
          {description && <p className="mt-3 max-w-md text-sm leading-6 text-primary-500">{description}</p>}
          <div className="mt-8 rounded-xl border border-primary-200/80 bg-white p-5 shadow-[0_18px_50px_-28px_rgba(20,23,26,0.45)] sm:p-7">
            {children}
          </div>
          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
