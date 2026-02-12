import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { ComboInput } from '../../components/ui/combo-input';
import { toast } from 'sonner';
import { Loader2, Plus, QrCode, Download, Printer, AlertTriangle, Eye, ExternalLink } from 'lucide-react';

// Use ComboInput but with compact styling for this page
const ComboSelect = ({ label, value, options, onChange, placeholder }) => (
  <ComboInput
    label={label}
    value={value}
    options={options}
    onChange={onChange}
    placeholder={placeholder}
    className="[&>label]:text-xs"
  />
);

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
  
  // References from database
  const [references, setReferences] = useState({
    oivs: [],
    floors: [],
    departments: [],
    managements: [],
    mols: []
  });

  useEffect(() => {
    loadBatches();
    loadReferences();
  }, []);
  
  const loadReferences = async () => {
    try {
      const res = await api.get('/references');
      const refs = {
        oivs: [],
        floors: [],
        departments: [],
        managements: [],
        mols: []
      };
      
      res.data.forEach(r => {
        if (r.type === 'oiv') refs.oivs.push(r.name);
        if (r.type === 'floor') refs.floors.push(r.name);
        if (r.type === 'department') refs.departments.push(r.name);
        if (r.type === 'management') refs.managements.push(r.name);
        if (r.type === 'mol') refs.mols.push(r.name);
      });
      
      setReferences(refs);
    } catch (e) {
      console.error('Error loading references:', e);
    }
  };

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
      await api.post('/qr-batches', {
        name: newBatch.name,
        count: newBatch.count,
        prefix: newBatch.prefix,
        label_data: {
          oiv: newBatch.oiv,
          floor: newBatch.floor,
          department: newBatch.department,
          section: newBatch.section,
          location: newBatch.location,
          mol: newBatch.mol
        }
      });
      toast.success('Партия создана');
      setShowCreateDialog(false);
      setNewBatch({ name: '', count: 100, prefix: '', oiv: '', floor: '', department: '', section: '', location: '', mol: '' });
      loadBatches();
    } catch (err) {
      toast.error('Ошибка создания партии');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadPDF = async (batchId, batchName, action = 'download') => {
    setDownloading(batchId);
    try {
      const res = await api.get(`/qr-batches/${batchId}/pdf`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      if (action === 'preview') {
        // Open in new tab for preview
        setPreviewUrl(url);
        window.open(url, '_blank');
      } else if (action === 'print') {
        // Open print dialog
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      } else {
        // Download - use a more reliable approach
        const link = document.createElement('a');
        link.href = url;
        link.download = `qr_batch_${batchName}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Use setTimeout to ensure the link is in DOM
        setTimeout(() => {
          link.click();
          // Cleanup after download starts
          setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
          }, 100);
        }, 0);
        
        toast.success('PDF скачан');
      }
      
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новая партия QR кодов</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название партии *</Label>
                <Input
                  placeholder="Партия #1 - Этаж 2"
                  value={newBatch.name}
                  onChange={(e) => setNewBatch(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="batch-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Количество этикеток *</Label>
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
              </div>
              
              {/* Label Data Fields */}
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-3 text-muted-foreground">
                  Данные для этикетки (будут напечатаны рядом с QR):
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <ComboSelect
                    label="ОИВ"
                    value={newBatch.oiv}
                    options={references.oivs}
                    onChange={(v) => setNewBatch(prev => ({ ...prev, oiv: v }))}
                    placeholder="Выберите ОИВ"
                  />
                  <ComboSelect
                    label="Этаж"
                    value={newBatch.floor}
                    options={references.floors}
                    onChange={(v) => setNewBatch(prev => ({ ...prev, floor: v }))}
                    placeholder="№ этажа"
                  />
                  <ComboSelect
                    label="Управление"
                    value={newBatch.department}
                    options={references.managements}
                    onChange={(v) => setNewBatch(prev => ({ ...prev, department: v }))}
                    placeholder="Выберите управление"
                  />
                  <ComboSelect
                    label="Отдел"
                    value={newBatch.section}
                    options={references.departments}
                    onChange={(v) => setNewBatch(prev => ({ ...prev, section: v }))}
                    placeholder="Выберите отдел"
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Место / Помещение</Label>
                    <Input
                      placeholder="Кабинет 205"
                      value={newBatch.location}
                      onChange={(e) => setNewBatch(prev => ({ ...prev, location: e.target.value }))}
                      data-testid="batch-location-input"
                    />
                  </div>
                  <ComboSelect
                    label="ФИО (МОЛ)"
                    value={newBatch.mol}
                    options={references.mols}
                    onChange={(v) => setNewBatch(prev => ({ ...prev, mol: v }))}
                    placeholder="Выберите МОЛ"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Формат этикетки: ОИВ - ЭТАЖ - УПРАВЛЕНИЕ - ОТДЕЛ - МЕСТО - ФИО
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
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(batch.id, batch.name, 'preview')}
                        disabled={downloading === batch.id}
                        title="Просмотр"
                        data-testid={`preview-pdf-${batch.id}`}
                      >
                        {downloading === batch.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(batch.id, batch.name, 'download')}
                        disabled={downloading === batch.id}
                        title="Скачать"
                        data-testid={`download-pdf-${batch.id}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPDF(batch.id, batch.name, 'print')}
                        disabled={downloading === batch.id}
                        title="Печать"
                        data-testid={`print-pdf-${batch.id}`}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkSpoiled(batch.id)}
                        title="Испорчено"
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
