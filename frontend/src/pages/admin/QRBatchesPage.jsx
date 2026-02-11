import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, QrCode, Download, Printer, AlertTriangle, Eye, ExternalLink } from 'lucide-react';

export default function QRBatchesPage() {
  const { api } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBatch, setNewBatch] = useState({
    name: '',
    count: 100,
    prefix: '',
    oiv: '',
    floor: '',
    department: '',
    section: '',
    location: '',
    mol: ''
  });
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      const res = await api.get('/qr-batches');
      setBatches(res.data);
    } catch (err) {
      toast.error('Ошибка загрузки партий');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!newBatch.name || newBatch.count < 1) {
      toast.error('Заполните название и количество');
      return;
    }

    setCreating(true);
    try {
      await api.post('/qr-batches', newBatch);
      toast.success('Партия создана');
      setShowCreateDialog(false);
      setNewBatch({ name: '', count: 100, prefix: '' });
      loadBatches();
    } catch (err) {
      toast.error('Ошибка создания партии');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPDF = async (batchId, batchName) => {
    setDownloading(batchId);
    try {
      const res = await api.get(`/qr-batches/${batchId}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `qr_batch_${batchName}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('PDF скачан');
      loadBatches();
    } catch (err) {
      toast.error('Ошибка скачивания PDF');
    } finally {
      setDownloading(null);
    }
  };

  const handleMarkSpoiled = async (batchId) => {
    const count = prompt('Сколько этикеток испорчено?', '1');
    if (!count) return;

    try {
      await api.post(`/qr-batches/${batchId}/spoil?count=${parseInt(count)}`);
      toast.success('Помечено испорченными');
      loadBatches();
    } catch (err) {
      toast.error('Ошибка');
    }
  };

  return (
    <div className="space-y-6" data-testid="qr-batches-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            QR Партии
          </h1>
          <p className="text-muted-foreground">Генерация и печать QR этикеток</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="create-batch-btn">
              <Plus className="w-4 h-4 mr-2" />
              Создать партию
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая партия QR кодов</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название партии</Label>
                <Input
                  placeholder="Партия #1 - Этаж 2"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="batch-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Количество этикеток</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={newBatch.count}
                  onChange={(e) => setNewBatch(prev => ({ ...prev, count: parseInt(e.target.value) || 0 }))}
                  data-testid="batch-count-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Префикс (опционально)</Label>
                <Input
                  placeholder="E2-"
                  value={newBatch.prefix}
                  onChange={(e) => setNewBatch(prev => ({ ...prev, prefix: e.target.value }))}
                  data-testid="batch-prefix-input"
                />
                <p className="text-xs text-muted-foreground">
                  Пример: E2-INV-ABC12345
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreateBatch} disabled={creating} data-testid="submit-batch-btn">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <QrCode className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold font-mono">
                  {batches.reduce((acc, b) => acc + b.count, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Всего QR кодов</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Printer className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold font-mono text-emerald-500">
                  {batches.reduce((acc, b) => acc + b.printed, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Напечатано</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold font-mono text-amber-500">
                  {batches.reduce((acc, b) => acc + b.spoiled, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Испорчено</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Префикс</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Напечатано</TableHead>
              <TableHead className="text-right">Испорчено</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="hidden md:table-cell">Дата</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : batches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Нет партий
                </TableCell>
              </TableRow>
            ) : (
              batches.map((batch) => (
                <TableRow key={batch.id} data-testid={`batch-row-${batch.id}`}>
                  <TableCell className="font-medium">{batch.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {batch.prefix || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{batch.count}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">{batch.printed}</TableCell>
                  <TableCell className="text-right font-mono text-amber-500">{batch.spoiled}</TableCell>
                  <TableCell>
                    <Badge variant={batch.status === 'printed' ? 'default' : 'secondary'}>
                      {batch.status === 'printed' ? 'Напечатан' : 'Создан'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {new Date(batch.created_at).toLocaleDateString('ru-RU')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(batch.id, batch.name)}
                        disabled={downloading === batch.id}
                        data-testid={`download-pdf-${batch.id}`}
                      >
                        {downloading === batch.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkSpoiled(batch.id)}
                        data-testid={`spoil-${batch.id}`}
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
