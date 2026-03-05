import { Link, Outlet, useLocation } from 'react-router-dom';
import { Moon, Sun, Play, KeyRound, ShieldCheck, Blocks, Building2 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const NAV_ITEMS = [
  { to: '/domains', label: 'Offices', icon: Building2 },
  { to: '/custom-nodes', label: 'Custom Nodes', icon: Blocks },
  { to: '/credentials', label: 'Credentials', icon: KeyRound },
  { to: '/executions', label: 'Executions', icon: Play },
  { to: '/hitl', label: 'HITL Requests', icon: ShieldCheck },
];

export function AppLayout() {
  const location = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <div className="h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-card border-r border-border flex flex-col">
        {/* Logo */}
        <Link to="/domains" className="flex items-center justify-center px-4 py-5 border-b border-border">
          <img src="/garage-logo.png" alt="Garage" className="w-full px-2 object-contain" />
        </Link>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={toggle}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-background">
        <Outlet />
      </div>
    </div>
  );
}
