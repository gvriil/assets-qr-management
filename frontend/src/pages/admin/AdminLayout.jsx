import { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  LayoutDashboard, Package, Users, Upload, QrCode, 
  BookOpen, DollarSign, ClipboardCheck, FileText, 
  History, Settings, Sun, Moon, LogOut, Search, Menu
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "../components/ui/sheet";

const NAV_ITEMS = [
  { path: '/admin', icon: LayoutDashboard, label: 'Дашборд', exact: true },
  { path: '/admin/objects', icon: Package, label: 'Объекты' },
  { path: '/admin/users', icon: Users, label: 'Пользователи' },
  { path: '/admin/import', icon: Upload, label: 'Импорт' },
  { path: '/admin/qr-batches', icon: QrCode, label: 'QR Партии' },
  { path: '/admin/references', icon: BookOpen, label: 'Справочники' },
  { path: '/admin/rates', icon: DollarSign, label: 'Тарифы' },
  { path: '/admin/qa', icon: ClipboardCheck, label: 'Проверка' },
  { path: '/admin/export', icon: FileText, label: 'Экспорт' },
  { path: '/admin/audit', icon: History, label: 'Аудит' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { user, logout, api } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Handle global search
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/admin/objects?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const NavContent = () => (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.exact}
          onClick={() => setMobileMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`
          }
        >
          <item.icon className="w-5 h-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className={`min-h-screen ${isDark ? 'dark bg-zinc-950' : 'bg-zinc-50'}`}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <QrCode className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            Инвентаризация
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <NavContent />
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
              <span className="font-semibold text-sm">
                {user?.name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleTheme}
              className="flex-1"
              data-testid="theme-toggle-btn"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logout}
              className="flex-1 text-destructive"
              data-testid="admin-logout-btn"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-card/95 backdrop-blur-sm px-4 lg:px-6">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-btn">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
                  Инвентаризация
                </span>
              </div>
              <div className="p-4">
                <NavContent />
              </div>
            </SheetContent>
          </Sheet>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Поиск по QR/ID/названию/МОЛ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
                data-testid="global-search-input"
              />
            </div>
          </form>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 lg:hidden">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleTheme}
              data-testid="mobile-theme-toggle"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>

          {/* Back to Scanner */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/scanner')}
            className="hidden sm:flex"
            data-testid="back-to-scanner-btn"
          >
            К сканеру
          </Button>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
