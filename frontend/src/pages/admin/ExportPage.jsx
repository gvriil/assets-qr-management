import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { toast } from 'sonner';
import { Loader2, Download, FileSpreadsheet, FileText, Image, Printer, BookOpen } from 'lucide-react';

export default function ExportPage() {
  const { api } = useAuth();
  
  // Simple export
  const [format, setFormat] = useState('xlsx');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Catalog export
  const [catalogFormat, setCatalogFormat] = useState('pdf');
  const [pageSize, setPageSize] = useState('A4');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [catalogStatus, setCatalogStatus] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

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

  const handleCatalogExport = async () => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('format', catalogFormat);
      params.append('page_size', pageSize);
      params.append('include_photos', includePhotos.toString());
      if (catalogStatus) params.append('status', catalogStatus);

      const res = await api.get(`/export/catalog?${params.toString()}`, {
        responseType: 'blob',
        timeout: 120000 // 2 min timeout for large catalogs with photos
      });

      const contentType = res.headers['content-type'];
      const ext = catalogFormat === 'pdf' ? 'pdf' : 'xlsx';
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_catalog_${pageSize}${includePhotos ? '_with_photos' : ''}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Каталог сформирован');
    } catch (err) {
      console.error('Catalog export error:', err);
      toast.error('Ошибка формирования каталога');
    } finally {
      setCatalogLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="export-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Экспорт и печать
        </h1>
        <p className="text-muted-foreground">Выгрузка данных, каталогов и отчётов</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Simple Data Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Экспорт данных
            </CardTitle>
            <CardDescription>
              Выгрузка перечня объектов в таблицу
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Формат файла</Label>
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
              <Label>Фильтр по статусу</Label>
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
              Скачать таблицу
            </Button>
          </CardContent>
        </Card>

        {/* Catalog Export with Photos */}
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Каталог для печати
            </CardTitle>
            <CardDescription>
              Формирование каталога с фото для печати на A4/A3
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Format Selection */}
            <div className="space-y-3">
              <Label>Формат каталога</Label>
              <RadioGroup value={catalogFormat} onValueChange={setCatalogFormat} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pdf" id="pdf" />
                  <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer">
                    <FileText className="w-4 h-4" />
                    PDF
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="xlsx" id="xlsx-catalog" />
                  <Label htmlFor="xlsx-catalog" className="flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel с фото
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Page Size */}
            <div className="space-y-3">
              <Label>Размер страницы</Label>
              <RadioGroup value={pageSize} onValueChange={setPageSize} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="A4" id="a4" />
                  <Label htmlFor="a4" className="cursor-pointer">A4 (210×297 мм)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="A3" id="a3" />
                  <Label htmlFor="a3" className="cursor-pointer">A3 (297×420 мм)</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Include Photos Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Image className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="include-photos" className="cursor-pointer">Включить фотографии</Label>
                  <p className="text-xs text-muted-foreground">Каждый объект с фото</p>
                </div>
              </div>
              <Switch
                id="include-photos"
                checked={includePhotos}
                onCheckedChange={setIncludePhotos}
                data-testid="include-photos-switch"
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Фильтр по статусу</Label>
              <Select value={catalogStatus} onValueChange={setCatalogStatus}>
                <SelectTrigger data-testid="catalog-status-select">
                  <SelectValue placeholder="Все объекты" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Все объекты</SelectItem>
                  <SelectItem value="verified">Только подтверждённые</SelectItem>
                  <SelectItem value="pending">На проверке</SelectItem>
                  <SelectItem value="new">Новые</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleCatalogExport} 
              disabled={catalogLoading}
              className="w-full h-12"
              data-testid="catalog-export-btn"
            >
              {catalogLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Формирование каталога...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Сформировать каталог
                </>
              )}
            </Button>

            {/* Info */}
            <div className="p-3 bg-blue-950/30 border border-blue-800/30 rounded-lg text-xs text-blue-300">
              <p className="font-medium mb-1">Содержание каталога:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-400">
                <li>Название и QR-код объекта</li>
                <li>Категория и характеристики</li>
                <li>Местоположение (этаж, кабинет, отдел)</li>
                <li>МОЛ и состояние</li>
                {includePhotos && <li>Фотографии объекта</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Photo Archive Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5 text-primary" />
            Фотоархив
          </CardTitle>
          <CardDescription>
            Информация о хранении фотографий
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium mb-2">Excel с фото:</p>
              <p className="text-sm text-muted-foreground">
                При выборе "Excel с фото" изображения будут встроены непосредственно в ячейки таблицы. 
                Файл может быть большим при большом количестве объектов.
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium mb-2">PDF каталог:</p>
              <p className="text-sm text-muted-foreground">
                PDF формируется как готовый документ для печати. 
                На каждой странице размещаются карточки объектов с фото и всеми данными.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
