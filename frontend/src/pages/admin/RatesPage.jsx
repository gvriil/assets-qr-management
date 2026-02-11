import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Edit, DollarSign } from 'lucide-react';

const COMPLEXITY_LABELS = {
  S: 'Простой (S)',
  M: 'Средний (M)',
  L: 'Сложный (L)'
};

export default function RatesPage() {
  const { api } = useAuth();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    complexity: 'S',
    rate: 50,
    time_norm_minutes: 5
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRates();
  }, []);

  const loadRates = async () => {
    try {
      const res = await api.get('/rates');
      setRates(res.data);
    } catch (err) {
      toast.error('Ошибка загрузки тарифов');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (rate = null) => {
    if (rate) {
      setEditingRate(rate);
      setFormData({
        name: rate.name || '',
        complexity: rate.complexity,
        rate: rate.rate,
        time_norm_minutes: rate.time_norm_minutes
      });
    } else {
      setEditingRate(null);
      setFormData({ name: '', complexity: 'S', rate: 50, time_norm_minutes: 5 });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRate) {
        await api.put(`/rates/${editingRate.id}`, formData);
        toast.success('Тариф обновлён');
      } else {
        await api.post('/rates', formData);
        toast.success('Тариф создан');
      }
      setShowDialog(false);
      loadRates();
    } catch (err) {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals preview
  const calculateTotal = (complexity, count) => {
    const rate = rates.find(r => r.complexity === complexity);
    return rate ? rate.rate * count : 0;
  };

  return (
    <div className="space-y-6" data-testid="rates-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            Тарифы
          </h1>
          <p className="text-muted-foreground">Настройка ставок по сложности</p>
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="add-rate-btn">
              <Plus className="w-4 h-4 mr-2" />
              Добавить тариф
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRate ? 'Редактировать тариф' : 'Новый тариф'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Сложность</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={formData.complexity}
                  onChange={(e) => setFormData(prev => ({ ...prev, complexity: e.target.value }))}
                  disabled={!!editingRate}
                  data-testid="rate-complexity-select"
                >
                  {Object.entries(COMPLEXITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Ставка (₽)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                  data-testid="rate-value-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Норма времени (мин)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.time_norm_minutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, time_norm_minutes: parseInt(e.target.value) || 1 }))}
                  data-testid="rate-time-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Отмена</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="submit-rate-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Действующие тарифы
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : rates.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Нет тарифов</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сложность</TableHead>
                  <TableHead className="text-right">Ставка</TableHead>
                  <TableHead className="text-right">Норма времени</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map(rate => (
                  <TableRow key={rate.id} data-testid={`rate-row-${rate.id}`}>
                    <TableCell className="font-medium">
                      {COMPLEXITY_LABELS[rate.complexity]}
                    </TableCell>
                    <TableCell className="text-right font-mono text-lg">
                      {rate.rate} ₽
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {rate.time_norm_minutes} мин
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(rate)}
                        data-testid={`edit-rate-${rate.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Calculator */}
      <Card>
        <CardHeader>
          <CardTitle>Калькулятор</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(COMPLEXITY_LABELS).map(([key, label]) => {
              const rate = rates.find(r => r.complexity === key);
              return (
                <div key={key} className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">{label}</p>
                  <p className="text-2xl font-bold font-mono">
                    {rate?.rate || 0} ₽
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    за объект • {rate?.time_norm_minutes || '-'} мин норма
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
