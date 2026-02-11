import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { 
  Loader2, Upload, FileSpreadsheet, CheckCircle, AlertCircle, 
  ArrowRight, Download, Eye, AlertTriangle, Info
} from 'lucide-react';

const FIELD_OPTIONS = [
  { value: 'name', label: 'Наименование', required: true },
  { value: 'description', label: 'Описание (используется как наименование, если пусто)' },
  { value: 'category', label: 'Категория' },
  { value: 'characteristics', label: 'Характеристики' },
  { value: 'serial_number', label: 'Серийный номер' },
  { value: 'inventory_number', label: 'Инвентарный номер' },
  { value: 'year', label: 'Год выпуска' },
  { value: 'condition', label: 'Состояние' },
  { value: 'oiv', label: 'ОИВ' },
  { value: 'floor', label: 'Этаж' },
  { value: 'management', label: 'Управление' },
  { value: 'department', label: 'Отдел' },
  { value: 'room', label: 'Место / Помещение' },
  { value: 'mol', label: 'ФИО (МОЛ)' },
  { value: 'quantity', label: 'Количество' },
  { value: 'external_id', label: 'Внешний ID' },
  { value: 'notes', label: 'Примечание' },
];

// Parse comma-separated description into fields
const parseDescriptionToFields = (description) => {
  if (!description) return { name: '', notes: '' };
  
  const parts = description.split(',').map(p => p.trim()).filter(p => p);
  
  if (parts.length === 0) return { name: '', notes: '' };
  if (parts.length === 1) return { name: parts[0], notes: '' };
  
  // First part is usually the main name/description
  const name = parts[0];
  
  // Try to extract structured data from remaining parts
  const extracted = {
    name: name,
    characteristics: '',
    notes: ''
  };
  
  const remainingParts = [];
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const partLower = part.toLowerCase();
    
    // Try to identify what this part is
    if (partLower.includes('этаж') || /^\d+\s*(эт|этаж)/i.test(part)) {
      extracted.floor = part.replace(/этаж|эт\.?/gi, '').trim();
    } else if (partLower.includes('каб') || partLower.includes('комн') || partLower.includes('помещ')) {
      extracted.room = part.replace(/кабинет|каб\.?|комната|комн\.?|помещение/gi, '').trim();
    } else if (part.match(/^\d{4}$/)) {
      // Looks like a year
      extracted.year = part;
    } else if (part.match(/^[A-Za-z0-9\-\/]+$/)) {
      // Looks like serial number
      if (!extracted.serial_number) {
        extracted.serial_number = part;
      } else {
        remainingParts.push(part);
      }
    } else {
      // Add to characteristics or notes
      remainingParts.push(part);
    }
  }
  
  // Remaining parts go to characteristics first, then notes
  if (remainingParts.length > 0) {
    extracted.characteristics = remainingParts.slice(0, 3).join(', ');
    if (remainingParts.length > 3) {
      extracted.notes = remainingParts.slice(3).join(', ');
    }
  }
  
  return extracted;
};

// Validation functions for preview
const validateRow = (row, mapping) => {
  const errors = [];
  
  // Check required field - name OR description as fallback
  const hasName = mapping.name && row[mapping.name] && String(row[mapping.name]).trim() !== '';
  const hasDescription = mapping.description && row[mapping.description] && String(row[mapping.description]).trim() !== '';
  
  if (!hasName && !hasDescription) {
    errors.push('Отсутствует наименование или описание');
  }
  
  // Check quantity is a number
  if (mapping.quantity) {
    const qty = row[mapping.quantity];
    if (qty && isNaN(Number(qty))) {
      errors.push('Количество не является числом');
    }
  }
  
  // Check year format
  if (mapping.year) {
    const year = row[mapping.year];
    if (year && (isNaN(Number(year)) || Number(year) < 1900 || Number(year) > 2100)) {
      errors.push('Некорректный год выпуска');
    }
  }
  
  return errors;
};

// Transform row according to mapping
const transformRow = (row, mapping) => {
  const result = {};
  FIELD_OPTIONS.forEach(opt => {
    const sourceCol = mapping[opt.value];
    if (sourceCol && row[sourceCol] !== undefined && row[sourceCol] !== null) {
      result[opt.value] = String(row[sourceCol]).trim();
    }
  });
  
  // Use description as name fallback
  if (!result.name && result.description) {
    result.name = result.description;
  }
  
  return result;
};

export default function ImportPage() {
  const { api } = useAuth();
  const fileInputRef = useRef(null);
  
  const [step, setStep] = useState('upload'); // upload, mapping, preview, result
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // Import options
  const [options, setOptions] = useState({
    skipEmptyRows: true,
    fillDownCategory: false, // ffill category from previous row
    splitCharacteristics: false // split characteristics by comma
  });
  
  // Preview with validation
  const [validatedPreview, setValidatedPreview] = useState([]);
  const [previewErrors, setPreviewErrors] = useState({ count: 0, rows: [] });

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
      console.log('Columns from file:', res.data.columns);
      
      res.data.columns.forEach(col => {
        const colLower = col.toLowerCase();
        console.log('Processing column:', col, '->', colLower);
        
        if (colLower.includes('наимен') || colLower.includes('название') || colLower === 'name') {
          autoMapping['name'] = col;
          console.log('Mapped name to:', col);
        } else if (colLower.includes('катег') || colLower === 'category') {
          autoMapping['category'] = col;
        } else if (colLower.includes('характер') || colLower.includes('описан') || colLower === 'description') {
          // Map "Описание (характеристики)" as name fallback
          autoMapping['characteristics'] = col;
          // Also set as description for fallback to name
          if (!autoMapping['name']) {
            autoMapping['description'] = col;
          }
        } else if (colLower.includes('серийн') || colLower.includes('s/n') || colLower === 'serial') {
          autoMapping['serial_number'] = col;
        } else if (colLower.includes('инвентар') || colLower === 'inventory') {
          autoMapping['inventory_number'] = col;
        } else if (colLower.includes('год') || colLower === 'year') {
          autoMapping['year'] = col;
        } else if (colLower.includes('состоян') || colLower === 'condition') {
          autoMapping['condition'] = col;
        } else if (colLower.includes('этаж') || colLower === 'floor') {
          autoMapping['floor'] = col;
        } else if (colLower.includes('кабинет') || colLower.includes('комнат') || colLower === 'room') {
          autoMapping['room'] = col;
        } else if (colLower.includes('отдел') || colLower.includes('подразд') || colLower === 'department') {
          autoMapping['department'] = col;
        } else if (colLower.includes('мол') || colLower.includes('ответств')) {
          autoMapping['mol'] = col;
        } else if (colLower.includes('колич') || colLower.includes('кол-во') || colLower.includes('общее кол') || colLower === 'quantity') {
          autoMapping['quantity'] = col;
        } else if (colLower.includes('примеч') || colLower === 'notes') {
          autoMapping['notes'] = col;
        } else if (colLower.includes('внешн') || colLower.includes('external') || colLower === 'id' || colLower === '№') {
          autoMapping['external_id'] = col;
        }
      });
      
      console.log('Final autoMapping:', autoMapping);
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
    console.log('Mapping change:', field, '->', column);
    if (column === '') {
      // Remove mapping when "Not used" selected
      setMapping(prev => {
        const newMapping = { ...prev };
        delete newMapping[field];
        return newMapping;
      });
    } else {
      setMapping(prev => ({ ...prev, [field]: column }));
    }
  };

  const handlePreviewValidation = () => {
    console.log('Current mapping before validation:', mapping);
    
    // Allow either name OR description
    if (!mapping.name && !mapping.description) {
      toast.error('Укажите колонку для наименования или описания');
      return;
    }
    
    // Validate preview rows
    const validated = [];
    const errorRows = [];
    let lastCategory = '';
    
    preview.preview.forEach((row, idx) => {
      let processedRow = { ...row };
      
      // Fill down category if enabled
      if (options.fillDownCategory && mapping.category) {
        const catValue = row[mapping.category];
        if (catValue && String(catValue).trim()) {
          lastCategory = String(catValue).trim();
        } else if (lastCategory) {
          processedRow[mapping.category] = lastCategory;
        }
      }
      
      const errors = validateRow(processedRow, mapping);
      const transformed = transformRow(processedRow, mapping);
      
      validated.push({
        original: processedRow,
        transformed,
        errors,
        rowNum: idx + 2 // +2 for header and 0-based index
      });
      
      if (errors.length > 0) {
        errorRows.push({ rowNum: idx + 2, errors });
      }
    });
    
    setValidatedPreview(validated);
    setPreviewErrors({ count: errorRows.length, rows: errorRows });
    setStep('preview');
  };

  const handleImport = async () => {
    if (!mapping.name && !mapping.description) {
      toast.error('Укажите колонку для наименования или описания');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Include options in the request
      const importParams = {
        ...mapping,
        _options: options
      };

      const res = await api.post(
        `/import/execute?mapping=${encodeURIComponent(JSON.stringify(importParams))}`,
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

  const handleDownloadErrorReport = () => {
    if (!result?.errors?.length) return;
    
    const csvContent = 'Строка,Ошибка\n' + 
      result.errors.map(err => `"${err.replace(/"/g, '""')}"`).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import_errors_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setValidatedPreview([]);
    setPreviewErrors({ count: 0, rows: [] });
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
        <p className="text-muted-foreground">Загрузка объектов из Excel/CSV с проверкой</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={step === 'upload' ? 'default' : 'secondary'}>1. Файл</Badge>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <Badge variant={step === 'mapping' ? 'default' : 'secondary'}>2. Маппинг</Badge>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <Badge variant={step === 'preview' ? 'default' : 'secondary'}>3. Проверка</Badge>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <Badge variant={step === 'result' ? 'default' : 'secondary'}>4. Результат</Badge>
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
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Найдено строк: <strong>{preview.total_rows}</strong> | 
                Колонок: <strong>{preview.columns.length}</strong>
              </p>
              
              {/* Import Options */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <p className="font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Настройки импорта
                </p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="skipEmpty" className="text-sm">Пропускать пустые строки</Label>
                  <Switch
                    id="skipEmpty"
                    checked={options.skipEmptyRows}
                    onCheckedChange={(v) => setOptions(prev => ({ ...prev, skipEmptyRows: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="fillCategory" className="text-sm">
                    Заполнять категорию из предыдущей строки (ffill)
                  </Label>
                  <Switch
                    id="fillCategory"
                    checked={options.fillDownCategory}
                    onCheckedChange={(v) => setOptions(prev => ({ ...prev, fillDownCategory: v }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Сопоставление колонок (Mapping Wizard)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-amber-950/30 border border-amber-800/30 rounded-lg mb-4 text-sm text-amber-300">
                <p className="font-medium">💡 Подсказка:</p>
                <p>Если в вашем файле нет колонки "Наименование", выберите колонку "Описание" — она будет использована как название объекта.</p>
              </div>
              <div className="space-y-3">
                {FIELD_OPTIONS.map(opt => (
                  <div key={opt.value} className="flex items-center gap-4">
                    <span className="w-44 text-sm font-medium flex-shrink-0">
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
                    {mapping[opt.value] && (
                      <Badge variant="outline" className="text-xs">
                        ✓
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Raw Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Исходные данные (первые 5 строк)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {preview.columns.slice(0, 8).map(col => (
                        <TableHead key={col} className="whitespace-nowrap text-xs">
                          {col}
                          {Object.values(mapping).includes(col) && (
                            <span className="ml-1 text-primary">●</span>
                          )}
                        </TableHead>
                      ))}
                      {preview.columns.length > 8 && <TableHead>...</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 2}</TableCell>
                        {preview.columns.slice(0, 8).map(col => (
                          <TableCell key={col} className="text-sm max-w-[150px] truncate">
                            {row[col] || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                        {preview.columns.length > 8 && <TableCell>...</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 pb-6">
            <Button variant="outline" onClick={handleReset}>
              Отмена
            </Button>
            <Button 
              onClick={handlePreviewValidation} 
              disabled={loading || (!mapping.name && !mapping.description)} 
              data-testid="preview-btn"
              size="lg"
              className="flex-1"
            >
              <Eye className="w-4 h-4 mr-2" />
              Далее → Проверить данные
            </Button>
          </div>
          {!mapping.name && !mapping.description && (
            <p className="text-sm text-amber-400 pb-4">
              ⚠️ Укажите колонку для "Наименование" или "Описание" чтобы продолжить
            </p>
          )}
        </div>
      )}

      {/* Step: Preview with Validation */}
      {step === 'preview' && validatedPreview.length > 0 && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium">Проверка завершена</p>
                  <p className="text-sm text-muted-foreground">
                    Всего строк: {preview.total_rows} | 
                    Проверено: {validatedPreview.length} | 
                    С ошибками: {previewErrors.count}
                  </p>
                </div>
                {previewErrors.count > 0 ? (
                  <Badge variant="destructive" className="text-lg px-4 py-2">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {previewErrors.count} ошибок
                  </Badge>
                ) : (
                  <Badge className="text-lg px-4 py-2 bg-emerald-600">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Всё в порядке
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Validated Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Предпросмотр результата (как будет импортировано)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Наименование</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Этаж</TableHead>
                      <TableHead>Отдел</TableHead>
                      <TableHead>МОЛ</TableHead>
                      <TableHead>Кол-во</TableHead>
                      <TableHead className="w-32">Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validatedPreview.slice(0, 30).map((item, i) => (
                      <TableRow 
                        key={i} 
                        className={item.errors.length > 0 ? 'bg-red-950/30' : ''}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {item.rowNum}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {item.transformed.name || <span className="text-red-500">—</span>}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {item.transformed.category || '—'}
                        </TableCell>
                        <TableCell>{item.transformed.floor || '—'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {item.transformed.department || '—'}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {item.transformed.mol || '—'}
                        </TableCell>
                        <TableCell>{item.transformed.quantity || '1'}</TableCell>
                        <TableCell>
                          {item.errors.length > 0 ? (
                            <span className="text-xs text-red-400" title={item.errors.join(', ')}>
                              <AlertCircle className="w-4 h-4 inline mr-1" />
                              {item.errors[0]}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-400">
                              <CheckCircle className="w-4 h-4 inline mr-1" />
                              OK
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {validatedPreview.length > 30 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          ...и ещё {validatedPreview.length - 30} строк
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Error Details */}
          {previewErrors.count > 0 && (
            <Card className="border-red-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Найденные ошибки ({previewErrors.count})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                  {previewErrors.rows.slice(0, 20).map((item, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="text-red-400">Строка {item.rowNum}:</span> {item.errors.join('; ')}
                    </li>
                  ))}
                  {previewErrors.rows.length > 20 && (
                    <li className="text-muted-foreground font-medium">
                      ...и ещё {previewErrors.rows.length - 20} строк с ошибками
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('mapping')}>
              Назад к маппингу
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={loading} 
              data-testid="import-execute-btn"
              variant={previewErrors.count > 0 ? 'destructive' : 'default'}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {previewErrors.count > 0 
                ? `Импортировать (с ${previewErrors.count} ошибками)` 
                : `Импортировать ${preview.total_rows} объектов`
              }
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Ошибки импорта
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDownloadErrorReport}
                  data-testid="download-errors-btn"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Скачать CSV
                </Button>
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

          <div className="flex gap-3">
            <Button onClick={handleReset} data-testid="import-new-btn">
              Импортировать ещё
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/admin/objects'}>
              Перейти к объектам
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
