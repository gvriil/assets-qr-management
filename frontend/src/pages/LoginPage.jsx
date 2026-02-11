import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { toast } from 'sonner';
import { Loader2, QrCode, Shield } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, verify2FA } = useAuth();
  const [step, setStep] = useState('credentials'); // credentials | 2fa
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Введите email и пароль');
      return;
    }

    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.requires_2fa) {
        setStep('2fa');
        toast.success('Код подтверждения отправлен (проверьте логи сервера для MVP)');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (code.length !== 6) {
      toast.error('Введите 6-значный код');
      return;
    }

    setLoading(true);
    try {
      const user = await verify2FA(email, code);
      toast.success(`Добро пожаловать, ${user.name}!`);
      navigate(user.role === 'admin' ? '/admin' : '/scanner');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-zinc-950"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1767294274634-613a3545e36d?crop=entropy&cs=srgb&fm=jpg&q=85)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/70" />
      
      <Card className="w-full max-w-md relative z-10 bg-zinc-900/95 border-zinc-800 backdrop-blur-sm" data-testid="login-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
            <QrCode className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight uppercase text-white font-['Barlow_Condensed']">
            Инвентаризация
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {step === 'credentials' ? 'Войдите для продолжения' : 'Введите код подтверждения'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 'credentials' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  data-testid="login-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  data-testid="login-password-input"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Войти'}
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-center items-center gap-2 text-zinc-400">
                <Shield className="w-5 h-5" />
                <span className="text-sm">Двухфакторная аутентификация</span>
              </div>
              
              <div className="flex justify-center">
                <InputOTP 
                  maxLength={6} 
                  value={code} 
                  onChange={setCode}
                  data-testid="otp-input"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="bg-zinc-800 border-zinc-700 text-white" />
                    <InputOTPSlot index={1} className="bg-zinc-800 border-zinc-700 text-white" />
                    <InputOTPSlot index={2} className="bg-zinc-800 border-zinc-700 text-white" />
                    <InputOTPSlot index={3} className="bg-zinc-800 border-zinc-700 text-white" />
                    <InputOTPSlot index={4} className="bg-zinc-800 border-zinc-700 text-white" />
                    <InputOTPSlot index={5} className="bg-zinc-800 border-zinc-700 text-white" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <p className="text-xs text-center text-zinc-500">
                Код отправлен на {email}
              </p>

              <Button 
                onClick={handleVerify2FA}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold"
                disabled={loading || code.length !== 6}
                data-testid="verify-2fa-btn"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Подтвердить'}
              </Button>

              <Button 
                variant="ghost" 
                className="w-full text-zinc-400 hover:text-white"
                onClick={() => { setStep('credentials'); setCode(''); }}
                data-testid="back-to-login-btn"
              >
                Назад
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-xs text-zinc-600">
            MVP Система инвентаризации v1.0
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
