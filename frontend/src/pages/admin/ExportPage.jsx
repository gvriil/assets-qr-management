import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Loader2, Download, FileSpreadsheet, FileText, Image, Printer, Eye, 
  X, Camera, ClipboardList, FileCheck, ListOrdered 
} from 'lucide-react';

// Типы документов согласно ТЗ
const DOCUMENT_TYPES = {
  photo_archive: {
    id: 'photo_archive',
    name: 'Приложение №2 - Общий фотоархив',
    description: 'Фотоархив имущества с инвентарными номерами',
    icon: Camera,
    columns: ['№ п/п', 'Инв. номер АО «ЦУГИ»', 'ФОТО']
  },
  catalog: {
    id: 'catalog',
    name: 'Приложение №3 - Каталог имущества',
    description: 'Полный каталог с характеристиками и фото',
    icon: ClipboardList,
    columns: ['№ п/п', 'Наименование', 'Характеристика/Описание', 'Серийный номер', 
              'Инв. номер', 'Фото', 'Количество', 'Примечание', 'План кабинета']
  },
  inventory_list: {
    id: 'inventory_list',
    name: 'Приложение №4 - Инвентаризационная ведомость',
    description: 'Ведомость с техническим состоянием',
    icon: FileCheck,
    columns: ['№ п/п', 'Инв. номер', 'Порядковый номер', 'Предыдущий инв. номер',
              'Наименование', 'Артикул', 'Год выпуска', 'Паспорт/Сертификат', 
              'Тех. состояние', 'Местонахождение']
  },
  specification_report: {
    id: 'specification_report',
    name: 'Приложение №5 - Отчет по спецификации',
    description: 'Краткий отчет по наличию',
    icon: ListOrdered,
    columns: ['№ п/п по спецификации', 'Наименование', 'Инв. номер', 'Наличие']
  }
};

export default function ExportPage() {
  const { api } = useAuth();
  const iframeRef = useRef(null);
  
  // Selected document type
  const [docType, setDocType] = useState('catalog');
  const [status, setStatus] = useState('all');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Commission members for signatures
  const [commission, setCommission] = useState([
    { position: '', name: '' },
    { position: '', name: '' },
    { position: '', name: '' }
  ]);
  const [executor, setExecutor] = useState({ position: '', name: '' });
  
  // PDF Preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleExport = async (action = 'download') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('doc_type', docType);
      params.append('format', 'pdf');
      if (status && status !== 'all') params.append('status', status);
      if (room) params.append('room', room);
      
      // Add commission data
      const commissionData = {
        members: commission.filter(m => m.name || m.position),
        executor: executor
      };
      params.append('commission', JSON.stringify(commissionData));

      const res = await api.get(`/export/document?${params.toString()}`, {
        responseType: 'blob',
        timeout: 180000 // 3 min timeout
      });

      // Create blob with proper type
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const docName = DOCUMENT_TYPES[docType].name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
      
      if (action === 'preview') {
        setPreviewUrl(url);
        setShowPreview(true);
      } else if (action === 'print') {
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.onload = () => {
            setTimeout(() => printWindow.print(), 500);
          };
        }
        toast.success('Открыто окно печати');
      } else {
        // Download file - use a more reliable approach
        const link = document.createElement('a');
        link.href = url;
        link.download = `${docName}.pdf`;
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
        
        toast.success('Файл скачан');
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Ошибка формирования документа');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('doc_type', docType);
      params.append('format', 'xlsx');
      if (status && status !== 'all') params.append('status', status);
      if (room) params.append('room', room);

      const res = await api.get(`/export/document?${params.toString()}`, {
        responseType: 'blob',
        timeout: 180000
      });

      const blob = new Blob([res.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const docName = DOCUMENT_TYPES[docType].name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
      link.setAttribute('download', `${docName}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel файл скачан');
    } catch (err) {
      console.error('Excel export error:', err);
      toast.error('Ошибка формирования Excel');
    } finally {
      setLoading(false);
    }
  };

  const updateCommissionMember = (index, field, value) => {
    setCommission(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addCommissionMember = () => {
    setCommission(prev => [...prev, { position: '', name: '' }]);
  };

  const DocIcon = DOCUMENT_TYPES[docType]?.icon || FileText;

  return (
    <div className="space-y-6" data-testid="export-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Экспорт документов
        </h1>
        <p className="text-muted-foreground">Формирование официальных документов по ТЗ</p>
      </div>

      {/* Document Type Selection */}
      <Tabs value={docType} onValueChange={setDocType} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
          {Object.values(DOCUMENT_TYPES).map(doc => {
            const Icon = doc.icon;
            return (
              <TabsTrigger 
                key={doc.id} 
                value={doc.id}
                className="flex flex-col gap-1 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                data-testid={`doc-type-${doc.id}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs text-center leading-tight">{doc.name.split(' - ')[0]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {Object.values(DOCUMENT_TYPES).map(doc => (
          <TabsContent key={doc.id} value={doc.id} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <doc.icon className="w-5 h-5 text-primary" />
                  {doc.name}
                </CardTitle>
                <CardDescription>{doc.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Columns preview */}
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Столбцы документа:</p>
                  <div className="flex flex-wrap gap-1">
                    {doc.columns.map((col, i) => (
                      <span key={i} className="text-xs bg-background px-2 py-1 rounded border">
                        {i + 1}. {col}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Статус объектов</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="export-status-select">
                  <SelectValue placeholder="Все статусы" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все объекты</SelectItem>
                  <SelectItem value="verified">Только подтверждённые</SelectItem>
                  <SelectItem value="pending">На проверке</SelectItem>
                  <SelectItem value="new">Новые</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Кабинет / Помещение</Label>
              <Input
                placeholder="Например: 205"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                data-testid="export-room-input"
              />
              <p className="text-xs text-muted-foreground">
                Оставьте пустым для всех помещений
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Commission Members */}
        <Card>
          <CardHeader>
            <CardTitle>Рабочая комиссия</CardTitle>
            <CardDescription>
              Данные для подписей в документе
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Члены комиссии:</Label>
              {commission.map((member, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Должность"
                    value={member.position}
                    onChange={(e) => updateCommissionMember(idx, 'position', e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="ФИО"
                    value={member.name}
                    onChange={(e) => updateCommissionMember(idx, 'name', e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={addCommissionMember}
                className="w-full text-muted-foreground"
              >
                + Добавить члена комиссии
              </Button>
            </div>

            <div className="pt-3 border-t space-y-2">
              <Label className="text-sm font-medium">Исполнитель:</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Должность"
                  value={executor.position}
                  onChange={(e) => setExecutor(prev => ({ ...prev, position: e.target.value }))}
                  className="text-sm"
                />
                <Input
                  placeholder="ФИО"
                  value={executor.name}
                  onChange={(e) => setExecutor(prev => ({ ...prev, name: e.target.value }))}
                  className="text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card className="border-primary/30">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={() => handleExport('preview')} 
              disabled={loading}
              variant="outline"
              className="flex-1"
              data-testid="preview-btn"
            >
              <Eye className="w-4 h-4 mr-2" />
              Предпросмотр PDF
            </Button>
            <Button 
              onClick={() => handleExport('download')} 
              disabled={loading}
              variant="outline"
              className="flex-1"
              data-testid="download-pdf-btn"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Скачать PDF
            </Button>
            <Button 
              onClick={() => handleExport('print')} 
              disabled={loading}
              className="flex-1"
              data-testid="print-btn"
            >
              <Printer className="w-4 h-4 mr-2" />
              Печать
            </Button>
            <Button 
              onClick={handleExportExcel} 
              disabled={loading}
              variant="secondary"
              className="flex-1"
              data-testid="download-excel-btn"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PDF Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl h-[90vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <DocIcon className="w-5 h-5" />
                {DOCUMENT_TYPES[docType]?.name}
              </DialogTitle>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = previewUrl;
                    link.setAttribute('download', `${DOCUMENT_TYPES[docType].name}.pdf`);
                    link.click();
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Скачать
                </Button>
                <Button 
                  size="sm"
                  onClick={() => {
                    const printWindow = window.open(previewUrl, '_blank');
                    if (printWindow) {
                      printWindow.onload = () => printWindow.print();
                    }
                  }}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Печать
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 p-4 pt-2">
            {previewUrl && (
              <iframe
                ref={iframeRef}
                src={previewUrl}
                className="w-full h-full border rounded-lg"
                title="PDF Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
