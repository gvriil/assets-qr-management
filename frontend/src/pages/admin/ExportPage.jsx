import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Loader2, Download, FileSpreadsheet, FileText, Image } from 'lucide-react';

export default function ExportPage() {
  const { api } = useAuth();
  const [format, setFormat] = useState('xlsx');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (status) params.append('status', status);

      const res = await api.get(`/export/objects?${params.toString()}`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_export.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Экспорт завершён');
    } catch (err) {
      toast.error('Ошибка экспорта');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="export-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Экспорт
        </h1>
        <p className="text-muted-foreground">Выгрузка данных в Excel/CSV</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Экспорт объектов
            </CardTitle>
            <CardDescription>
              Выгрузка перечня объектов с фильтрами
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Формат</label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger data-testid="export-format-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Статус (фильтр)</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="export-status-select">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все статусы</SelectItem>
                  <SelectItem value="new">Новые</SelectItem>
                  <SelectItem value="pending">На проверке</SelectItem>
                  <SelectItem value="verified">Подтверждённые</SelectItem>
                  <SelectItem value="rejected">Отклонённые</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleExport} 
              disabled={loading}
              className="w-full"
              data-testid="export-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Скачать
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              Фотоархив
            </CardTitle>
            <CardDescription>
              Выгрузка фотографий объектов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Для выгрузки фотоархива экспортируйте данные в Excel - в файле будут ссылки на фото каждого объекта.
            </p>
            <div className="p-4 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-2">Колонки в экспорте:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>ID объекта</li>
                <li>QR код</li>
                <li>Название</li>
                <li>Категория</li>
                <li>Характеристики</li>
                <li>Этаж / Отдел / МОЛ</li>
                <li>Статус</li>
                <li>Ссылки на фото</li>
                <li>Дата создания</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
