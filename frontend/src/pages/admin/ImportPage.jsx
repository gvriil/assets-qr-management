import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';

const FIELD_OPTIONS = [
  { value: 'name', label: 'Наименование', required: true },
  { value: 'category', label: 'Категория' },
  { value: 'characteristics', label: 'Характеристики' },
  { value: 'serial_number', label: 'Серийный номер' },
  { value: 'inventory_number', label: 'Инвентарный номер' },
  { value: 'year', label: 'Год выпуска' },
  { value: 'condition', label: 'Состояние' },
  { value: 'floor', label: 'Этаж' },
  { value: 'room', label: 'Кабинет' },
  { value: 'department', label: 'Отдел' },
  { value: 'mol', label: 'МОЛ' },
  { value: 'quantity', label: 'Количество' },
  { value: 'complexity', label: 'Сложность' },
  { value: 'external_id', label: 'Внешний ID' },
  { value: 'notes', label: 'Примечание' },
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
      
      // Auto-map columns by name similarity
      const autoMapping = {};
      res.data.columns.forEach(col => {
        const colLower = col.toLowerCase();
        FIELD_OPTIONS.forEach(opt => {
          // Check various naming patterns
          if (colLower.includes('наимен') || colLower.includes('название')) {
            autoMapping['name'] = col;
          } else if (colLower.includes('катег')) {
            autoMapping['category'] = col;
          } else if (colLower.includes('характер') || colLower.includes('описан')) {
            autoMapping['characteristics'] = col;
          } else if (colLower.includes('серийн') || colLower.includes('s/n')) {
            autoMapping['serial_number'] = col;
          } else if (colLower.includes('инвентар')) {
            autoMapping['inventory_number'] = col;
          } else if (colLower.includes('год')) {
            autoMapping['year'] = col;
          } else if (colLower.includes('состоян')) {
            autoMapping['condition'] = col;
          } else if (colLower.includes('этаж')) {
            autoMapping['floor'] = col;
          } else if (colLower.includes('кабинет') || colLower.includes('комнат')) {
            autoMapping['room'] = col;
          } else if (colLower.includes('отдел') || colLower.includes('подразд')) {
            autoMapping['department'] = col;
          } else if (colLower.includes('мол') || colLower.includes('ответств')) {
            autoMapping['mol'] = col;
          } else if (colLower.includes('колич') || colLower.includes('кол-во')) {
            autoMapping['quantity'] = col;
          } else if (colLower.includes('примеч')) {
            autoMapping['notes'] = col;
          }
        });
      });
      setMapping(autoMapping);
      
      setStep('mapping');
      toast.success(`Файл загружен: ${res.data.total_rows} строк`);
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Ошибка чтения файла');
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (field, column) => {
    setMapping(prev => ({ ...prev, [field]: column }));
  };

  const handleImport = async () => {
    if (!mapping.name) {
      toast.error('Укажите колонку для наименования');
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
      const msg = err.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Ошибка импорта');
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
                  <p className="text-lg font-medium mb-2">Нажмите для выбора файла</p>
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
                Найдено строк: <strong>{preview.total_rows}</strong>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Сопоставление колонок</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {FIELD_OPTIONS.map(opt => (
                  <div key={opt.value} className="flex items-center gap-4">
                    <span className="w-40 text-sm font-medium flex-shrink-0">
                      {opt.label}
                      {opt.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <select
                      className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
                      value={mapping[opt.value] || ''}
                      onChange={(e) => handleMappingChange(opt.value, e.target.value)}
                      data-testid={`mapping-${opt.value}`}
                    >
                      <option value="">— Не использовать —</option>
                      {preview.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
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
                      {preview.columns.slice(0, 6).map(col => (
                        <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
                      ))}
                      {preview.columns.length > 6 && <TableHead>...</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((row, i) => (
                      <TableRow key={i}>
                        {preview.columns.slice(0, 6).map(col => (
                          <TableCell key={col} className="text-sm max-w-[200px] truncate">
                            {row[col] || '-'}
                          </TableCell>
                        ))}
                        {preview.columns.length > 6 && <TableCell>...</TableCell>}
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
              Импортировать {preview.total_rows} объектов
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
                <ul className="space-y-1 text-sm max-h-60 overflow-y-auto">
                  {result.errors.slice(0, 50).map((err, i) => (
                    <li key={i} className="text-muted-foreground">{err}</li>
                  ))}
                  {result.errors.length > 50 && (
                    <li className="text-muted-foreground font-medium">...и ещё {result.errors.length - 50}</li>
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
