import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, QrCode, Shield, UserPlus, LogIn } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, verify2FA } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [step, setStep] = useState('credentials'); // credentials | 2fa
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Registration fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

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
        // MVP: показываем код в toast (убрать в production!)
        if (res.dev_code) {
          toast.success(`Ваш код: ${res.dev_code}`, { duration: 30000 });
        } else {
          toast.success('Код подтверждения отправлен');
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail;
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Ошибка входа');
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
      navigate(user.role === 'admin' || user.role === 'auditor' ? '/admin' : '/scanner');
    } catch (err) {
      const errorMsg = err.response?.data?.detail;
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword || !inviteCode) {
      toast.error('Заполните все поля');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/register`, {
        email: regEmail,
        password: regPassword,
        name: regName,
        invite_code: inviteCode.toUpperCase()
      });
      
      toast.success('Регистрация успешна! Теперь войдите.');
      setEmail(regEmail);
      setPassword(regPassword);
      setActiveTab('login');
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setInviteCode('');
    } catch (err) {
      const errorMsg = err.response?.data?.detail;
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Ошибка регистрации');
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
        </CardHeader>

        <CardContent>
          {step === 'credentials' ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" className="gap-2">
                  <LogIn className="w-4 h-4" />
                  Вход
                </TabsTrigger>
                <TabsTrigger value="register" className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  Регистрация
                </TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login">
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

                {/* Default admin hint */}
                <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <p className="text-xs text-zinc-400 text-center">
                    <strong className="text-zinc-300">Админ:</strong><br />
                    0020992@gmail.com / admin123
                  </p>
                </div>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Инвайт-код *</Label>
                    <Input
                      placeholder="INV-XXXX-XXXX"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono tracking-wider"
                      data-testid="invite-code-input"
                    />
                    <p className="text-xs text-zinc-500">Получите код у администратора</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Ваше имя</Label>
                    <Input
                      placeholder="Иван Иванов"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                      data-testid="register-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Email</Label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                      data-testid="register-email-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Пароль</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="h-12 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                      data-testid="register-password-input"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold"
                    disabled={loading}
                    data-testid="register-submit-btn"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Зарегистрироваться'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-center items-center gap-2 text-zinc-400">
                <Shield className="w-5 h-5" />
                <span className="text-sm">Двухфакторная аутентификация</span>
              </div>
              
              <div className="space-y-2">
                <Label className="text-zinc-300">Введите 6-значный код</Label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-14 text-center text-2xl font-mono tracking-widest bg-zinc-800 border-zinc-700 text-white"
                  data-testid="otp-code-input"
                  autoFocus
                />
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
