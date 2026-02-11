import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  ArrowLeft, Save, Camera, Loader2, QrCode, 
  Clock, User, Trash2, CheckCircle, History, Plus
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const COMPLEXITY_OPTIONS = [
  { value: 'S', label: 'Простой (S)' },
  { value: 'M', label: 'Средний (M)' },
  { value: 'L', label: 'Сложный (L)' }
];

const STATUS_LABELS = {
  new: 'Новый',
  pending: 'На проверке',
  verified: 'Подтверждён',
  rejected: 'Отклонён'
};

const STATUS_COLORS = {
  new: 'bg-zinc-500',
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
  const { isOnline, queueAction, cacheObject, getFieldSession, saveFieldSession, clearFieldSession } = useOffline();
  
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
      
      // Audit log is stored inside the object
      if (res.data.audit_log) {
        setAuditLog(res.data.audit_log);
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

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
          className="h-12 bg-zinc-800 border-zinc-700"
          data-testid={`input-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
        {showDropdown && filteredOptions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg max-h-48 overflow-auto">
            {filteredOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 text-white"
                onMouseDown={() => onChange(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-40">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate(-1)}
          className="text-zinc-400"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            {isNew ? 'Новый объект' : object.name || 'Объект'}
          </h1>
          {object.qr_code && (
            <p className="text-xs text-zinc-500 font-mono">{object.qr_code}</p>
          )}
        </div>
        {!isNew && (
          <Badge className={`${STATUS_COLORS[object.status]} text-white`}>
            {STATUS_LABELS[object.status]}
          </Badge>
        )}
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* QR Code Display */}
        {object.qr_code && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center">
                <QrCode className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">QR Код</p>
                <p className="font-mono text-primary">{object.qr_code}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Form */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Основные данные
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Наименование *</Label>
              <Input
                value={object.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Например: Стол офисный"
                className="h-12 bg-zinc-800 border-zinc-700"
                data-testid="object-name-input"
              />
            </div>

            {/* Category - with custom input */}
            <ComboInput
              label="Категория"
              value={object.category}
              options={categories}
              onChange={(v) => handleChange('category', v)}
              placeholder="Мебель, Оборудование..."
            />

            {/* Characteristics */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Характеристики / Описание</Label>
              <Textarea
                value={object.characteristics || ''}
                onChange={(e) => handleChange('characteristics', e.target.value)}
                placeholder="Размеры, цвет, материал..."
                className="bg-zinc-800 border-zinc-700 min-h-[80px]"
                data-testid="characteristics-input"
              />
            </div>

            {/* Serial Number */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Серийный номер</Label>
              <Input
                value={object.serial_number || ''}
                onChange={(e) => handleChange('serial_number', e.target.value)}
                placeholder="S/N"
                className="h-12 bg-zinc-800 border-zinc-700"
              />
            </div>

            {/* Inventory Number */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Инвентарный номер (старый)</Label>
              <Input
                value={object.inventory_number || ''}
                onChange={(e) => handleChange('inventory_number', e.target.value)}
                placeholder="Предыдущий инв. номер"
                className="h-12 bg-zinc-800 border-zinc-700"
              />
            </div>

            {/* Year */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Год выпуска</Label>
                <Input
                  value={object.year || ''}
                  onChange={(e) => handleChange('year', e.target.value)}
                  placeholder="2020"
                  className="h-12 bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Количество</Label>
                <Input
                  type="number"
                  min="1"
                  value={object.quantity || '1'}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                  className="h-12 bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            {/* Condition */}
            <ComboInput
              label="Техническое состояние"
              value={object.condition}
              options={CONDITION_OPTIONS}
              onChange={(v) => handleChange('condition', v)}
              placeholder="Исправен, Требует ремонта..."
            />

            {/* Complexity */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Сложность</Label>
              <div className="flex gap-2">
                {COMPLEXITY_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={object.complexity === opt.value ? 'default' : 'outline'}
                    className={object.complexity === opt.value ? '' : 'border-zinc-700 text-zinc-400'}
                    onClick={() => handleChange('complexity', opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Местонахождение
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ComboInput
                label="Этаж"
                value={object.floor}
                options={floors}
                onChange={(v) => handleChange('floor', v)}
                placeholder="1, 2, 3..."
              />
              <div className="space-y-2">
                <Label className="text-zinc-300">Кабинет / Комната</Label>
                <Input
                  value={object.room || ''}
                  onChange={(e) => handleChange('room', e.target.value)}
                  placeholder="101, 205..."
                  className="h-12 bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            <ComboInput
              label="Отдел"
              value={object.department}
              options={departments}
              onChange={(v) => handleChange('department', v)}
              placeholder="Бухгалтерия, IT..."
            />

            <ComboInput
              label="МОЛ (Материально ответственное лицо)"
              value={object.mol}
              options={mols}
              onChange={(v) => handleChange('mol', v)}
              placeholder="Иванов И.И."
            />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Примечание
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={object.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Дополнительная информация..."
              className="bg-zinc-800 border-zinc-700 min-h-[60px]"
            />
          </CardContent>
        </Card>

        {/* Photos */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Фото
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isNew || uploadingPhoto}
              className="border-zinc-700"
              data-testid="add-photo-btn"
            >
              {uploadingPhoto ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Camera className="w-4 h-4 mr-2" />
              )}
              {isNew ? 'Сохраните сначала' : 'Добавить фото'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </CardHeader>
          <CardContent>
            {object.photos?.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {object.photos.map((url, i) => (
                  <div key={i} className="aspect-square rounded overflow-hidden bg-zinc-800 relative group">
                    <img 
                      src={`${process.env.REACT_APP_BACKEND_URL}${url}`} 
                      alt={`Фото ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Camera className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{isNew ? 'Сохраните объект, чтобы добавить фото' : 'Нет фото'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit Log Button */}
        {!isNew && auditLog.length > 0 && (
          <Dialog open={showHistory} onOpenChange={setShowHistory}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full border-zinc-700 text-zinc-300"
                data-testid="show-history-btn"
              >
                <History className="w-4 h-4 mr-2" />
                История изменений ({auditLog.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-['Barlow_Condensed'] uppercase">
                  История изменений
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                {auditLog.map((log, i) => (
                  <div key={i} className="p-3 bg-zinc-800 rounded border border-zinc-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-primary uppercase">
                        {log.action}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(log.timestamp).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400">
                      <User className="w-3 h-3 inline mr-1" />
                      {log.user_name}
                    </p>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Action Buttons */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">
          <div className="flex gap-3 max-w-lg mx-auto">
            {!isNew && object.status === 'new' && (
              <Button
                onClick={handleVerify}
                variant="outline"
                className="flex-1 h-12 border-emerald-600 text-emerald-500 hover:bg-emerald-900/20"
                data-testid="verify-btn"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                На проверку
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 bg-primary hover:bg-primary/90"
              data-testid="save-btn"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Сохранить
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
