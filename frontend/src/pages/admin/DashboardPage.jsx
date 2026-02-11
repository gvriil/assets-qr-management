import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import { Loader2, Package, Users, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [userStats, setUserStats] = useState([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [overviewRes, userStatsRes] = await Promise.all([
        api.get('/stats/overview'),
        api.get('/stats/by-user')
      ]);
      setStats(overviewRes.data);
      setUserStats(userStatsRes.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalProgress = stats?.total > 0 
    ? Math.round((stats.by_status?.verified / stats.total) * 100) 
    : 0;

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Дашборд
        </h1>
        <p className="text-muted-foreground">Обзор системы инвентаризации</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего объектов
            </CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono">{stats?.total || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              На проверке
            </CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono text-amber-500">
              {stats?.by_status?.pending || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Подтверждено
            </CardTitle>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono text-emerald-500">
              {stats?.by_status?.verified || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Отклонено
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-mono text-red-500">
              {stats?.by_status?.rejected || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Общий прогресс инвентаризации
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Подтверждено объектов</span>
              <span className="font-mono font-semibold">{totalProgress}%</span>
            </div>
            <Progress value={totalProgress} className="h-4" />
            <p className="text-xs text-muted-foreground mt-2">
              {stats?.by_status?.verified || 0} из {stats?.total || 0} объектов подтверждено
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Complexity Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>По сложности</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats?.by_complexity || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      key === 'S' ? 'bg-emerald-500' : 
                      key === 'M' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <span className="text-sm">
                      {key === 'S' ? 'Простой' : key === 'M' ? 'Средний' : 'Сложный'}
                    </span>
                  </div>
                  <span className="font-mono font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* By User */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              По исполнителям
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userStats.slice(0, 5).map((u, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm truncate flex-1">{u.user_name}</span>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-500 font-mono">{u.verified}</span>
                    <span className="text-amber-500 font-mono">{u.pending}</span>
                    <span className="text-muted-foreground font-mono">{u.total}</span>
                  </div>
                </div>
              ))}
              {userStats.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет данных
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
