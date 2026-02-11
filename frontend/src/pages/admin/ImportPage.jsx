import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

const FIELD_OPTIONS = [
  { value: 'name', label: 'Название' },
  { value: 'external_id', label: 'Внешний ID' },
  { value: 'description', label: 'Описание' },
  { value: 'characteristics', label: 'Характеристики' },
  { value: 'floor', label: 'Этаж' },
  { value: 'department', label: 'Отдел' },
  { value: 'complexity', label: 'Сложность' },
];

export default function ImportPage() {
  const { api } = useAuth();
  const fileInputRef = useRef(null);
  
  const [step, setStep] = useState('upload'); // upload, mapping, result
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(res.data);
      
      // Auto-map columns
      const autoMapping = {};
      res.data.columns.forEach(col => {
        const colLower = col.toLowerCase();
        FIELD_OPTIONS.forEach(opt => {
          if (colLower.includes(opt.value) || colLower.includes(opt.label.toLowerCase())) {
            autoMapping[opt.value] = col;
          }
        });
      });
      setMapping(autoMapping);
      
      setStep('mapping');
    } catch (err) {
      toast.error('Ошибка чтения файла');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!mapping.name) {
      toast.error('Укажите колонку для названия');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post(
        `/import/execute?mapping=${encodeURIComponent(JSON.stringify(mapping))}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setResult(res.data);
      setStep('result');
      toast.success(`Импорт завершён: создано ${res.data.created}, обновлено ${res.data.updated}`);
    } catch (err) {
      toast.error('Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
  };

  return (
    <div className="space-y-6" data-testid="import-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Импорт данных
        </h1>
        <p className="text-muted-foreground">Загрузка объектов из Excel/CSV</p>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div 
              className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              data-testid="file-dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              {loading ? (
                <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              ) : (
                <>
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">Перетащите файл или нажмите</p>
                  <p className="text-sm text-muted-foreground">
                    Поддерживаемые форматы: .xlsx, .xls, .csv
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Mapping */}
      {step === 'mapping' && preview && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                {preview.filename}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Найдено строк: {preview.total_rows}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Сопоставление колонок</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {FIELD_OPTIONS.map(opt => (
                  <div key={opt.value} className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium">
                      {opt.label}
                      {opt.value === 'name' && <span className="text-red-500">*</span>}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <Select
                      value={mapping[opt.value] || ''}
                      onValueChange={(v) => setMapping(prev => ({ ...prev, [opt.value]: v }))}
                    >
                      <SelectTrigger className="flex-1" data-testid={`mapping-${opt.value}`}>
                        <SelectValue placeholder="Выберите колонку" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Не использовать —</SelectItem>
                        {preview.columns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Предпросмотр (первые 5 строк)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.columns.map(col => (
                        <TableHead key={col}>{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((row, i) => (
                      <TableRow key={i}>
                        {preview.columns.map(col => (
                          <TableCell key={col} className="text-sm">
                            {row[col] || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={handleReset}>
              Отмена
            </Button>
            <Button onClick={handleImport} disabled={loading} data-testid="import-execute-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Импортировать
            </Button>
          </div>
        </div>
      )}

      {/* Step: Result */}
      {step === 'result' && result && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Импорт завершён</h2>
                <div className="flex justify-center gap-8 mt-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-500">{result.created}</p>
                    <p className="text-sm text-muted-foreground">Создано</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-500">{result.updated}</p>
                    <p className="text-sm text-muted-foreground">Обновлено</p>
                  </div>
                  {result.errors?.length > 0 && (
                    <div className="text-center">
                      <p className="text-3xl font-bold text-red-500">{result.errors.length}</p>
                      <p className="text-sm text-muted-foreground">Ошибок</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {result.errors?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Ошибки импорта
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {result.errors.slice(0, 20).map((err, i) => (
                    <li key={i} className="text-muted-foreground">{err}</li>
                  ))}
                  {result.errors.length > 20 && (
                    <li className="text-muted-foreground">...и ещё {result.errors.length - 20}</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          <Button onClick={handleReset} data-testid="import-new-btn">
            Импортировать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
