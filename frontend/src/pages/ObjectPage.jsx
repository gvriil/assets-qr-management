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
  const { api } = useAuth();
  const { isOnline, queueAction, cacheObject, getFieldSession, saveFieldSession } = useOffline();
  
  const isNew = id === 'new';
  const qrFromUrl = searchParams.get('qr');
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
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
    floor: sessionDefaults.floor || '',
    room: sessionDefaults.room || '',
    department: sessionDefaults.department || '',
    mol: sessionDefaults.mol || '',
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
      
      refsRes.data.forEach(r => {
        if (r.type === 'floor') floorsArr.push(r.name);
        if (r.type === 'department') deptsArr.push(r.name);
        if (r.type === 'mol') molsArr.push(r.name);
      });
      
      setFloors(floorsArr);
      setDepartments(deptsArr);
      setMols(molsArr);
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

  // Upload photo to server
  const uploadPhoto = async (file) => {
    if (isNew) {
      toast.error('Сначала сохраните объект');
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

  // Combobox with custom input
  const ComboInput = ({ label, value, options, onChange, placeholder }) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const filteredOptions = options.filter(opt => 
      opt.toLowerCase().includes((value || '').toLowerCase())
    );
    
    return (
      <div className="space-y-2 relative">
        <Label className="text-zinc-300">{label}</Label>
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className="bg-zinc-900 border-zinc-700"
        />
        {showDropdown && filteredOptions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {filteredOptions.map((opt, i) => (
              <div
                key={i}
                className="px-3 py-2 hover:bg-zinc-700 cursor-pointer text-sm"
                onMouseDown={() => onChange(opt)}
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
    <div className="min-h-screen bg-zinc-950 text-white pb-24" data-testid="object-page">
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
                </div>
              ))}
              {(!object.photos || object.photos.length === 0) && (
                <div className="col-span-3 text-center py-8 text-zinc-500">
                  Нет фотографий
                </div>
              )}
            </div>
            
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
                className="bg-zinc-900 border-zinc-700"
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
                className="bg-zinc-900 border-zinc-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Инв. номер</Label>
                <Input
                  value={object.inventory_number || ''}
                  onChange={(e) => handleChange('inventory_number', e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Серийный №</Label>
                <Input
                  value={object.serial_number || ''}
                  onChange={(e) => handleChange('serial_number', e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
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
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Кол-во</Label>
                <Input
                  type="number"
                  min={1}
                  value={object.quantity || '1'}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Сложность</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-zinc-700 bg-zinc-900 text-sm"
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

        {/* Location */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Местоположение</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <ComboInput
                label="Этаж"
                value={object.floor}
                options={floors}
                onChange={(v) => handleChange('floor', v)}
                placeholder="№ этажа"
              />
              <div className="space-y-2">
                <Label className="text-zinc-300">Кабинет</Label>
                <Input
                  value={object.room || ''}
                  onChange={(e) => handleChange('room', e.target.value)}
                  placeholder="№ кабинета"
                  className="bg-zinc-900 border-zinc-700"
                />
              </div>
            </div>

            <ComboInput
              label="Отдел"
              value={object.department}
              options={departments}
              onChange={(v) => handleChange('department', v)}
              placeholder="Выберите отдел"
            />

            <ComboInput
              label="МОЛ"
              value={object.mol}
              options={mols}
              onChange={(v) => handleChange('mol', v)}
              placeholder="Материально-ответственное лицо"
            />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Примечания</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full h-24 px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-sm resize-none"
              value={object.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация"
            />
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
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 p-4">
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
