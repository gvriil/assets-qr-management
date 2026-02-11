import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { 
  ScanLine, Camera, CameraOff, Plus, User, 
  Settings, Wifi, WifiOff, RefreshCw, Menu,
  ChevronRight, BarChart3
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";

export default function ScannerPage() {
  const navigate = useNavigate();
  const { user, logout, api } = useAuth();
  const { isOnline, pendingCount, syncing, syncActions, clearFieldSession, getFieldSession } = useOffline();
  
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  
  // Get current session info
  const session = getFieldSession();

  const startScanner = useCallback(async () => {
    if (html5QrRef.current) return;

    try {
      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        async (decodedText) => {
          // Prevent duplicate scans
          if (lastScanned === decodedText) return;
          setLastScanned(decodedText);
          
          // Vibrate on success
          if (navigator.vibrate) navigator.vibrate(100);
          
          toast.success(`QR: ${decodedText}`);
          
          // Stop scanner and navigate to object
          await stopScanner();
          
          // Check if object exists
          try {
            const res = await api.get(`/objects/by-qr/${encodeURIComponent(decodedText)}`);
            navigate(`/object/${res.data.id}`);
          } catch (err) {
            if (err.response?.status === 404) {
              // Object not found - create new
              navigate(`/object/new?qr=${encodeURIComponent(decodedText)}`);
            } else {
              toast.error('Ошибка при поиске объекта');
            }
          }
        },
        () => {} // Ignore scan errors
      );

      setScanning(true);
      setCameraError(null);
    } catch (err) {
      console.error('Scanner error:', err);
      setCameraError(err.message || 'Не удалось запустить камеру');
      toast.error('Не удалось запустить камеру. Проверьте разрешения.');
    }
  }, [api, navigate, lastScanned]);

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
      } catch (e) {
        console.error('Stop error:', e);
      }
      html5QrRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const handleManualEntry = () => {
    const code = prompt('Введите QR код:');
    if (code) {
      setLastScanned(code);
      navigate(`/object/new?qr=${encodeURIComponent(code)}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-zinc-400" data-testid="menu-btn">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-zinc-900 border-zinc-800 text-white">
              <SheetHeader>
                <SheetTitle className="text-white font-['Barlow_Condensed'] uppercase tracking-tight">
                  Меню
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6 space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-800"
                  onClick={() => navigate('/scanner')}
                  data-testid="nav-scanner"
                >
                  <ScanLine className="w-5 h-5 mr-3" />
                  Сканер
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-800"
                  onClick={() => navigate('/progress')}
                  data-testid="nav-progress"
                >
                  <BarChart3 className="w-5 h-5 mr-3" />
                  Мой прогресс
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-800"
                  onClick={() => navigate('/object/new')}
                  data-testid="nav-new-object"
                >
                  <Plus className="w-5 h-5 mr-3" />
                  Новый объект
                </Button>
                {(user?.role === 'admin' || user?.role === 'auditor') && (
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-zinc-300 hover:text-white hover:bg-zinc-800"
                    onClick={() => navigate('/admin')}
                    data-testid="nav-admin"
                  >
                    <Settings className="w-5 h-5 mr-3" />
                    Админ-панель
                  </Button>
                )}
                <div className="pt-4 border-t border-zinc-800 mt-4">
                  <div className="px-3 py-2 text-sm text-zinc-500">
                    <User className="w-4 h-4 inline mr-2" />
                    {user?.name}
                  </div>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    onClick={logout}
                    data-testid="logout-btn"
                  >
                    Выйти
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          
          <h1 className="text-lg font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            Сканер
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Status */}
          <Button
            variant="ghost"
            size="sm"
            className={`gap-2 ${isOnline ? 'text-emerald-400' : 'text-zinc-500'}`}
            onClick={syncActions}
            disabled={syncing || !isOnline}
            data-testid="sync-status-btn"
          >
            {syncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isOnline ? (
              <Wifi className="w-4 h-4" />
            ) : (
              <WifiOff className="w-4 h-4" />
            )}
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-black text-xs px-1.5 py-0.5 rounded-sm font-mono">
                {pendingCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Scanner Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {/* Scanner View */}
        <div 
          id="qr-reader" 
          ref={scannerRef}
          className={`w-full max-w-sm aspect-square rounded-lg overflow-hidden bg-zinc-900 border-2 ${
            scanning ? 'border-primary' : 'border-zinc-800'
          }`}
          data-testid="qr-scanner"
        />

        {/* Scanner Overlay */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 relative">
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary" />
              
              {/* Scanning line animation */}
              <div className="absolute inset-x-4 h-0.5 bg-primary/50 animate-pulse top-1/2" />
            </div>
          </div>
        )}

        {/* Error State */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90">
            <div className="text-center p-6 max-w-sm">
              <CameraOff className="w-16 h-16 mx-auto text-zinc-600 mb-4" />
              <p className="text-zinc-400 mb-4">{cameraError}</p>
              <Button 
                onClick={startScanner}
                className="bg-primary hover:bg-primary/90"
                data-testid="retry-camera-btn"
              >
                Повторить
              </Button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mt-6 space-y-3 w-full max-w-sm">
          <Button
            onClick={scanning ? stopScanner : startScanner}
            className={`w-full h-14 text-lg font-semibold ${
              scanning 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-primary hover:bg-primary/90'
            }`}
            data-testid="toggle-scanner-btn"
          >
            {scanning ? (
              <>
                <CameraOff className="w-6 h-6 mr-2" />
                Остановить
              </>
            ) : (
              <>
                <Camera className="w-6 h-6 mr-2" />
                Начать сканирование
              </>
            )}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={handleManualEntry}
              data-testid="manual-entry-btn"
            >
              <ScanLine className="w-5 h-5 mr-2" />
              Ввод вручную
            </Button>
            <Button
              variant="outline"
              className="h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              onClick={() => navigate('/object/new')}
              data-testid="create-object-btn"
            >
              <Plus className="w-5 h-5 mr-2" />
              Новый объект
            </Button>
          </div>
        </div>

        {/* Last Scanned */}
        {lastScanned && (
          <div className="mt-6 p-3 bg-zinc-900 border border-zinc-800 rounded-md w-full max-w-sm">
            <p className="text-xs text-zinc-500 mb-1">Последний скан:</p>
            <p className="font-mono text-sm text-primary">{lastScanned}</p>
          </div>
        )}
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-600 text-black py-2 px-4 text-center text-sm font-medium" data-testid="offline-banner">
          <WifiOff className="w-4 h-4 inline mr-2" />
          Офлайн режим • Данные сохраняются локально
        </div>
      )}
    </div>
  );
}
