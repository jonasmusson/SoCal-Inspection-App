import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Home, ClipboardList, Settings, Layers, Car } from 'lucide-react';

interface LayoutProps { children: ReactNode; }

export function Layout({ children }: LayoutProps) {
  const { profile, signOut, isManager, isOwner } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    ...(isManager || isOwner ? [{ path: '/dashboard', icon: Home, label: 'Dashboard' }] : []),
    { path: '/my-inspections', icon: ClipboardList, label: 'My Work' },
    ...(isOwner ? [{ path: '/templates', icon: Layers, label: 'Templates' }] : []),
    ...(isManager || isOwner ? [{ path: '/settings', icon: Settings, label: 'Settings' }] : []),
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-primary-50 flex flex-col">
      {/* Desktop header */}
      <div className="sticky top-0 z-40 bg-primary-900 text-white shadow-elevated">
        <header className="px-5 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-500 flex items-center justify-center flex-shrink-0">
              <Car className="w-5 h-5 text-primary-900" />
            </div>
            <div className="hidden sm:block">
              <p className="font-display text-lg leading-none tracking-wide">SoCAL AUTOWORKS</p>
              <p className="text-[10px] text-primary-300 uppercase tracking-[0.15em] mt-0.5">Inspection System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{profile?.full_name}</p>
              <p className="text-xs text-primary-300 capitalize">{profile?.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-accent-300">
                {profile?.full_name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <button
              onClick={signOut}
              aria-label="Log out"
              className="p-2 rounded-lg text-primary-300 hover:text-white hover:bg-primary-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Desktop nav — underline style */}
        <nav aria-label="Primary navigation" className="px-5 max-w-5xl mx-auto hidden sm:block">
          <div className="flex gap-1">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                    active
                      ? 'text-white border-accent-500'
                      : 'text-primary-300 border-transparent hover:text-white hover:border-primary-600'
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Mobile top bar — logo only, nav at bottom */}
      <div className="sm:hidden sticky top-0 z-40 bg-primary-900 text-white">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-accent-500 flex items-center justify-center">
              <Car className="w-4 h-4 text-primary-900" />
            </div>
            <p className="font-display text-sm leading-none tracking-wide">SoCAL AUTOWORKS</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-primary-300 capitalize">{profile?.role}</span>
            <button
              onClick={signOut}
              aria-label="Log out"
              className="p-1.5 rounded-lg text-primary-300 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-auto pb-20 sm:pb-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary navigation"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-primary-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      >
        <div
          className="grid gap-0.5 px-2 py-1.5"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition-colors ${
                  active ? 'text-primary-900' : 'text-primary-400'
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? 'text-accent-500' : ''}`} />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
