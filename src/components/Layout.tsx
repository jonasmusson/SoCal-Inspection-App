import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, User, Home, ClipboardList, Settings, Layers } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{profile?.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
            </div>
          </div>
          <img src="/image.png" alt="SoCal Autoworks" className="h-7 object-contain absolute left-1/2 -translate-x-1/2" />
          <button onClick={signOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </header>
        <nav aria-label="Primary navigation" className="border-y border-gray-200 bg-gray-50 px-3 py-2">
          <div className="grid gap-2 max-w-3xl mx-auto" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center justify-center gap-1.5 min-w-0 px-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-white border-primary-300 text-primary-700 shadow-sm'
                    : 'border-transparent text-gray-500 hover:bg-white hover:border-gray-200 hover:text-gray-800'
                }`}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
          </div>
        </nav>
      </div>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
