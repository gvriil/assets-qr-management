import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ProgressPage() {
  const navigate = useNavigate();
  const { api, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [rates, setRates] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [progressRes, ratesRes] = await Promise.all([
        api.get('/stats/progress'),
        api.get('/rates')
      ]);
      
      setStats(progressRes.data);
      
      const ratesMap = {};
      ratesRes.data.forEach(r => {
        ratesMap[r.complexity] = r.rate;
      });
      setRates(ratesMap);
    } catch (err) {
      console.error('Error loading progress:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const progressPercent = stats?.total > 0 
    ? Math.round(((stats.verified + stats.pending) / stats.total) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/scanner')}
          className="text-zinc-400"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Мой прогресс
        </h1>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* User Card */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <span className="text-2xl font-bold text-primary">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
              </div>
              <h2 className="font-semibold text-lg">{user?.name}</h2>
              <p className="text-sm text-zinc-500">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

        {/* Progress Overview */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Общий прогресс
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">Выполнено</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-white font-mono">{stats?.total || 0}</p>
                <p className="text-xs text-zinc-500 mt-1">Всего</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-500 font-mono">{stats?.pending || 0}</p>
                <p className="text-xs text-zinc-500 mt-1">На проверке</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-500 font-mono">{stats?.verified || 0}</p>
                <p className="text-xs text-zinc-500 mt-1">Принято</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Earnings */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Начисления
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-zinc-400">Ожидает подтверждения</p>
                  <p className="text-xs text-zinc-600">После проверки QA</p>
                </div>
              </div>
              <p className="text-xl font-bold font-mono text-amber-500">
                {stats?.pending_earnings?.toLocaleString('ru-RU') || 0} ₽
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-emerald-900/20 rounded-lg border border-emerald-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm text-zinc-300">Подтверждено</p>
                  <p className="text-xs text-zinc-500">К выплате</p>
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-500">
                {stats?.confirmed_earnings?.toLocaleString('ru-RU') || 0} ₽
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rates Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Тарифы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Простой (S)</span>
                <span className="font-mono">{rates['S'] || '-'} ₽</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Средний (M)</span>
                <span className="font-mono">{rates['M'] || '-'} ₽</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-400">Сложный (L)</span>
                <span className="font-mono">{rates['L'] || '-'} ₽</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
