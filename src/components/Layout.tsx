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
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
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
      <main className="flex-1 overflow-auto pb-20">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className={`flex flex-col items-center py-2 px-4 rounded-lg ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                <item.icon className="w-6 h-6" />
                <span className="text-xs mt-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
