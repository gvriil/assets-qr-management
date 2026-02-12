import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, Save, Camera, Image as ImageIcon, Plus, ArrowLeft, 
  Send, QrCode, Clock, Trash2, History, X
} from 'lucide-react';

const STATUS_LABELS = {
  new: 'Новый',
  pending: 'На проверке',
  verified: 'Подтверждён',
  rejected: 'Отклонён'
};

const STATUS_COLORS = {
  new: 'bg-blue-500',
  pending: 'bg-amber-500',
  verified: 'bg-emerald-500',
  rejected: 'bg-red-500'
};

const CONDITION_OPTIONS = [
  'Исправен',
  'Требует ремонта',
  'Неисправен',
  'На списание'
];

export default function ObjectPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { api, user } = useAuth();
  const { isOnline, queueAction, cacheObject, getFieldSession, saveFieldSession } = useOffline();
  
  const isNew = id === 'new';
  const qrFromUrl = searchParams.get('qr');
  const canDeletePhotos = user?.role === 'admin' || user?.role === 'auditor';
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(null);
  
  // Get saved session for new objects
  const sessionDefaults = isNew ? getFieldSession() : {};
  
  const [object, setObject] = useState({
    name: '',
    category: sessionDefaults.category || '',
    description: '',
    characteristics: '',
    serial_number: '',
    inventory_number: '',
    year: '',
    condition: '',
    oiv: sessionDefaults.oiv || '',  // ОИВ
    floor: sessionDefaults.floor || '',  // ЭТАЖ
    management: sessionDefaults.management || '',  // УПРАВЛЕНИЕ
    department: sessionDefaults.department || '',  // ОТДЕЛ
    room: sessionDefaults.room || '',  // МЕСТО/помещение
    mol: sessionDefaults.mol || '',  // ФИО
    quantity: '1',
    complexity: 'S',
    qr_code: qrFromUrl || '',
    photos: [],
    status: 'new',
    notes: ''
  });
  
  const [categories, setCategories] = useState([]);
  const [floors, setFloors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [managements, setManagements] = useState([]);
  const [oivs, setOivs] = useState([]);
  const [mols, setMols] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (!isNew && id) {
      loadObject();
    }
    loadReferences();
  }, [id, isNew]);

  const loadObject = async () => {
    try {
      const res = await api.get(`/objects/${id}`);
      setObject(res.data);
      cacheObject(res.data);
      
      // Load audit log
      try {
        const logRes = await api.get(`/audit-log?object_id=${id}`);
        setAuditLog(logRes.data || []);
      } catch (logErr) {
        console.warn('Could not load audit log:', logErr);
        setAuditLog([]);
      }
    } catch (err) {
      toast.error('Ошибка загрузки объекта');
      navigate('/scanner');
    } finally {
      setLoading(false);
    }
  };

  const loadReferences = async () => {
    try {
      const [catsRes, refsRes] = await Promise.all([
        api.get('/categories'),
        api.get('/references')
      ]);
      
      setCategories(catsRes.data.map(c => c.name));
      
      const floorsArr = [];
      const deptsArr = [];
      const molsArr = [];
      const managementsArr = [];
      const oivsArr = [];
      
      refsRes.data.forEach(r => {
        if (r.type === 'floor') floorsArr.push(r.name);
        if (r.type === 'department') deptsArr.push(r.name);
        if (r.type === 'mol') molsArr.push(r.name);
        if (r.type === 'management') managementsArr.push(r.name);
        if (r.type === 'oiv') oivsArr.push(r.name);
      });
      
      setFloors(floorsArr);
      setDepartments(deptsArr);
      setMols(molsArr);
      setManagements(managementsArr);
      setOivs(oivsArr);
    } catch (e) {
      console.error('Error loading references:', e);
    }
  };

  const handleChange = (field, value) => {
    setObject(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!object.name) {
      toast.error('Введите наименование объекта');
      return;
    }

    setSaving(true);
    try {
      // Save session fields for next object
      saveFieldSession({
        floor: object.floor,
        department: object.department,
        mol: object.mol,
        category: object.category,
        room: object.room
      });
      
      if (isOnline) {
        if (isNew) {
          const res = await api.post('/objects', object);
          toast.success('Объект создан');
          navigate(`/object/${res.data.id}`);
        } else {
          await api.put(`/objects/${id}`, object);
          toast.success('Сохранено');
          loadObject();
        }
      } else {
        await queueAction(isNew ? 'create' : 'update', id, object);
        toast.success('Сохранено локально');
        if (isNew) navigate('/scanner');
      }
    } catch (err) {
      const msg = err.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    try {
      await api.post(`/objects/${id}/verify`);
      toast.success('Отправлено на проверку');
      loadObject();
    } catch (err) {
      toast.error('Ошибка');
    }
  };

  // Resubmit rejected object for review
  const handleResubmit = async () => {
    try {
      await api.post(`/objects/${id}/verify`);
      toast.success('Повторно отправлено на проверку');
      loadObject();
    } catch (err) {
      toast.error('Ошибка отправки');
    }
  };

  // Delete photo (admin/auditor only)
  const handleDeletePhoto = async (photoUrl) => {
    if (!canDeletePhotos) return;
    
    if (!window.confirm('Удалить это фото?')) return;
    
    setDeletingPhoto(photoUrl);
    try {
      await api.delete(`/objects/${id}/photo`, { 
        data: { photo_url: photoUrl } 
      });
      setObject(prev => ({
        ...prev,
        photos: prev.photos.filter(p => p !== photoUrl)
      }));
      toast.success('Фото удалено');
    } catch (err) {
      toast.error('Ошибка удаления фото');
    } finally {
      setDeletingPhoto(null);
    }
  };

  // Handle file selection (from gallery)
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(file);
  };

  // Handle camera capture
  const handleCameraCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(file);
  };

  // Upload photo to server (max 5MB, auto-resize)
  const uploadPhoto = async (file) => {
    if (isNew) {
      toast.error('Сначала сохраните объект');
      return;
    }
    
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Максимальный размер фото: 5 МБ');
      return;
    }

    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/objects/${id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setObject(prev => ({
        ...prev,
        photos: [...(prev.photos || []), res.data.photo_url]
      }));
      toast.success('Фото загружено');
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Ошибка загрузки фото');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Combobox with custom input - search anywhere in string
  const ComboInput = ({ label, value, options, onChange, placeholder }) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const [inputValue, setInputValue] = useState(value || '');
    
    // Update input when value prop changes
    useEffect(() => {
      setInputValue(value || '');
    }, [value]);
    
    // Filter options - match anywhere in string (case insensitive)
    const filteredOptions = options.filter(opt => 
      opt.toLowerCase().includes((inputValue || '').toLowerCase())
    );
    
    const handleInputChange = (e) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      onChange(newValue);
    };
    
    return (
      <div className="space-y-2 relative">
        <Label className="text-zinc-300">{label}</Label>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className="bg-zinc-900 border-zinc-700 text-white"
        />
        {showDropdown && filteredOptions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {filteredOptions.slice(0, 15).map((opt, i) => (
              <div
                key={i}
                className="px-3 py-2 hover:bg-zinc-700 cursor-pointer text-sm text-white"
                onMouseDown={() => {
                  setInputValue(opt);
                  onChange(opt);
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-40" data-testid="object-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center justify-between p-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate(-1)}
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="text-center flex-1">
            <p className="text-xs text-zinc-500 font-mono">
              {object.qr_code || 'Новый объект'}
            </p>
            <Badge className={`${STATUS_COLORS[object.status]} text-xs`}>
              {STATUS_LABELS[object.status]}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
            data-testid="history-btn"
          >
            <History className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Rejected Notice */}
        {object.status === 'rejected' && (
          <Card className="bg-red-950/30 border-red-800/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-red-300 mb-1">Объект отклонён</p>
                  {object.reject_reason && (
                    <p className="text-sm text-red-400 mb-3">
                      Причина: {object.reject_reason}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={handleResubmit}
                    className="bg-amber-600 hover:bg-amber-700"
                    data-testid="resubmit-btn"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Отправить повторно на проверку
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Photos Section */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              Фотографии
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {object.photos?.map((photo, i) => (
                <div key={i} className="aspect-square relative group">
                  <img
                    src={`${process.env.REACT_APP_BACKEND_URL}${photo}`}
                    alt={`Фото ${i + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  {canDeletePhotos && (
                    <button
                      onClick={() => handleDeletePhoto(photo)}
                      disabled={deletingPhoto === photo}
                      className="absolute top-1 right-1 p-1.5 bg-red-600 hover:bg-red-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`delete-photo-${i}`}
                    >
                      {deletingPhoto === photo ? (
                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                      ) : (
                        <Trash2 className="w-3 h-3 text-white" />
                      )}
                    </button>
                  )}
                </div>
              ))}
              {(!object.photos || object.photos.length === 0) && (
                <div className="col-span-3 text-center py-8 text-zinc-500">
                  Нет фотографий
                </div>
              )}
            </div>
            
            {/* Photo format info */}
            <p className="text-xs text-zinc-500 mb-2">
              Формат: JPG, PNG. Макс. размер: 5 МБ. Рекомендуется: 1200×900 px
            </p>
            
            {/* Photo Upload Buttons */}
            <div className="flex gap-2">
              {/* Camera button - take photo */}
              <Button
                variant="default"
                className="flex-1 bg-primary"
                disabled={uploadingPhoto || isNew}
                onClick={() => cameraInputRef.current?.click()}
                data-testid="camera-btn"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                Сфотографировать
              </Button>
              
              {/* File input for camera capture */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />
              
              {/* Gallery button - select from files */}
              <Button
                variant="outline"
                className="flex-1"
                disabled={uploadingPhoto || isNew}
                onClick={() => fileInputRef.current?.click()}
                data-testid="gallery-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Из галереи
              </Button>
              
              {/* File input for gallery */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            
            {isNew && (
              <p className="text-xs text-amber-500 mt-2 text-center">
                Сохраните объект, чтобы добавить фото
              </p>
            )}
          </CardContent>
        </Card>

        {/* Main Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Основная информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Наименование *</Label>
              <Input
                value={object.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Введите название объекта"
                className="bg-zinc-900 border-zinc-700 text-white"
                data-testid="object-name-input"
              />
            </div>

            <ComboInput
              label="Категория"
              value={object.category}
              options={categories}
              onChange={(v) => handleChange('category', v)}
              placeholder="Выберите или введите"
            />

            <div className="space-y-2">
              <Label className="text-zinc-300">Характеристики</Label>
              <Input
                value={object.characteristics || ''}
                onChange={(e) => handleChange('characteristics', e.target.value)}
                placeholder="Описание, параметры"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Инв. номер</Label>
                <Input
                  value={object.inventory_number || ''}
                  onChange={(e) => handleChange('inventory_number', e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Серийный №</Label>
                <Input
                  value={object.serial_number || ''}
                  onChange={(e) => handleChange('serial_number', e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Год</Label>
                <Input
                  type="number"
                  value={object.year || ''}
                  onChange={(e) => handleChange('year', e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Кол-во</Label>
                <Input
                  type="number"
                  min={1}
                  value={object.quantity || '1'}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Сложность</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-white text-sm"
                  value={object.complexity}
                  onChange={(e) => handleChange('complexity', e.target.value)}
                >
                  <option value="S">S - Простой</option>
                  <option value="M">M - Средний</option>
                  <option value="L">L - Сложный</option>
                </select>
              </div>
            </div>

            <ComboInput
              label="Состояние"
              value={object.condition}
              options={CONDITION_OPTIONS}
              onChange={(v) => handleChange('condition', v)}
              placeholder="Выберите состояние"
            />
          </CardContent>
        </Card>

        {/* Location - ОИВ, ЭТАЖ, УПРАВЛЕНИЕ, ОТДЕЛ, МЕСТО, ФИО */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Местоположение и ответственные</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              ОИВ → ЭТАЖ → УПРАВЛЕНИЕ → ОТДЕЛ → МЕСТО → ФИО
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <ComboInput
                label="ОИВ"
                value={object.oiv}
                options={oivs}
                onChange={(v) => handleChange('oiv', v)}
                placeholder="Выберите ОИВ"
              />
              <ComboInput
                label="Этаж"
                value={object.floor}
                options={floors}
                onChange={(v) => handleChange('floor', v)}
                placeholder="№ этажа"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ComboInput
                label="Управление"
                value={object.management}
                options={managements}
                onChange={(v) => handleChange('management', v)}
                placeholder="Выберите управление"
              />
              <ComboInput
                label="Отдел"
                value={object.department}
                options={departments}
                onChange={(v) => handleChange('department', v)}
                placeholder="Выберите отдел"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Место / Помещение</Label>
                <Input
                  value={object.room || ''}
                  onChange={(e) => handleChange('room', e.target.value)}
                  placeholder="№ кабинета / помещения"
                  className="bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
              <ComboInput
                label="ФИО (МОЛ)"
                value={object.mol}
                options={mols}
                onChange={(v) => handleChange('mol', v)}
                placeholder="Ответственное лицо"
              />
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Примечания</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full h-24 px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-white text-sm resize-none"
              value={object.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация"
            />
          </CardContent>
        </Card>

        {/* QR Code Section */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              QR код
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-zinc-300">Код объекта</Label>
              <Input
                value={object.qr_code || ''}
                onChange={(e) => handleChange('qr_code', e.target.value)}
                placeholder="Введите или отсканируйте QR код"
                className="bg-zinc-900 border-zinc-700 text-white font-mono"
                data-testid="qr-code-input"
              />
            </div>
            {!object.qr_code && (
              <p className="text-xs text-amber-500">
                QR код можно добавить вручную или отсканировать при создании объекта
              </p>
            )}
          </CardContent>
        </Card>

        {/* History Panel */}
        {showHistory && auditLog.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                История изменений
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {auditLog.map((log, i) => (
                  <div key={i} className="text-sm border-l-2 border-primary pl-3">
                    <p className="text-zinc-400 text-xs">
                      {new Date(log.timestamp).toLocaleString('ru-RU')}
                    </p>
                    <p className="text-zinc-300">
                      <span className="font-medium">{log.user_name}</span>: {log.action}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fixed Bottom Actions */}
      <div className="fixed bottom-16 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 p-4 z-40">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <Button
            variant="default"
            className="flex-1 h-12"
            onClick={handleSave}
            disabled={saving}
            data-testid="save-object-btn"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            Сохранить
          </Button>
          
          {!isNew && object.status === 'new' && (
            <Button
              variant="outline"
              className="h-12"
              onClick={handleVerify}
              data-testid="verify-btn"
            >
              <Send className="w-5 h-5 mr-2" />
              На проверку
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
