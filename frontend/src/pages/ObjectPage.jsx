import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  ArrowLeft, Save, Camera, Loader2, QrCode, 
  Clock, User, Mic, MicOff, Trash2, CheckCircle,
  AlertCircle, History
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const COMPLEXITY_LABELS = {
  S: 'Простой (S)',
  M: 'Средний (M)',
  L: 'Сложный (L)'
};

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

export default function ObjectPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { api } = useAuth();
  const { isOnline, queueAction, cacheObject } = useOffline();
  
  const isNew = id === 'new';
  const qrFromUrl = searchParams.get('qr');
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [object, setObject] = useState({
    name: '',
    category_id: '',
    description: '',
    characteristics: '',
    floor: '',
    department: '',
    mol_id: '',
    complexity: 'S',
    qr_code: qrFromUrl || '',
    photos: [],
    status: 'new'
  });
  
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState({ floor: [], department: [], mol: [] });
  const [autocomplete, setAutocomplete] = useState({ name: [], characteristics: [] });
  const [auditLog, setAuditLog] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceField, setVoiceField] = useState(null);
  
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Load object data
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
      const logRes = await api.get(`/audit-log?object_id=${id}`);
      setAuditLog(logRes.data);
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
      
      setCategories(catsRes.data);
      
      const grouped = { floor: [], department: [], mol: [] };
      refsRes.data.forEach(r => {
        if (grouped[r.type]) grouped[r.type].push(r);
      });
      setReferences(grouped);
    } catch (e) {
      console.error('Error loading references:', e);
    }
  };

  // Autocomplete
  const loadAutocomplete = useCallback(async (field, query) => {
    if (!query || query.length < 2) return;
    try {
      const res = await api.get(`/autocomplete/${field}?q=${encodeURIComponent(query)}`);
      setAutocomplete(prev => ({ ...prev, [field]: res.data }));
    } catch (e) {
      console.error('Autocomplete error:', e);
    }
  }, [api]);

  const handleChange = (field, value) => {
    setObject(prev => ({ ...prev, [field]: value }));
    
    // Trigger autocomplete for certain fields
    if (['name', 'characteristics'].includes(field)) {
      loadAutocomplete(field, value);
    }
  };

  // Save object
  const handleSave = async () => {
    if (!object.name) {
      toast.error('Введите название объекта');
      return;
    }

    setSaving(true);
    try {
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
        // Queue for offline sync
        await queueAction(isNew ? 'create' : 'update', id, object);
        toast.success('Сохранено локально (синхронизация при подключении)');
        if (isNew) navigate('/scanner');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // Send to verification
  const handleVerify = async () => {
    try {
      await api.post(`/objects/${id}/verify`);
      toast.success('Отправлено на проверку');
      loadObject();
    } catch (err) {
      toast.error('Ошибка');
    }
  };

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    }
  };

  // Voice input
  const startVoice = (field) => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Голосовой ввод не поддерживается');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setObject(prev => ({
        ...prev,
        [field]: prev[field] ? `${prev[field]} ${transcript}` : transcript
      }));
      toast.success('Текст распознан');
    };

    recognition.onerror = () => {
      toast.error('Ошибка распознавания');
      setVoiceActive(false);
    };

    recognition.onend = () => {
      setVoiceActive(false);
      setVoiceField(null);
    };

    recognition.start();
    setVoiceActive(true);
    setVoiceField(field);
    recognitionRef.current = recognition;
  };

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setVoiceActive(false);
    setVoiceField(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
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
              <Label className="text-zinc-300">Название *</Label>
              <div className="flex gap-2">
                <Input
                  value={object.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Введите название"
                  className="flex-1 h-12 bg-zinc-800 border-zinc-700"
                  list="name-suggestions"
                  data-testid="object-name-input"
                />
                <Button
                  type="button"
                  variant={voiceField === 'name' ? 'default' : 'outline'}
                  size="icon"
                  className="h-12 w-12 border-zinc-700"
                  onClick={() => voiceField === 'name' ? stopVoice() : startVoice('name')}
                  data-testid="voice-name-btn"
                >
                  {voiceField === 'name' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
              </div>
              <datalist id="name-suggestions">
                {autocomplete.name.map((v, i) => <option key={i} value={v} />)}
              </datalist>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Категория</Label>
              <Select 
                value={object.category_id} 
                onValueChange={(v) => handleChange('category_id', v)}
              >
                <SelectTrigger className="h-12 bg-zinc-800 border-zinc-700" data-testid="category-select">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id} className="text-white">
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Complexity */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Сложность</Label>
              <Select 
                value={object.complexity} 
                onValueChange={(v) => handleChange('complexity', v)}
              >
                <SelectTrigger className="h-12 bg-zinc-800 border-zinc-700" data-testid="complexity-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {Object.entries(COMPLEXITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-white">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Characteristics */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Характеристики</Label>
              <div className="flex gap-2">
                <Textarea
                  value={object.characteristics || ''}
                  onChange={(e) => handleChange('characteristics', e.target.value)}
                  placeholder="Описание характеристик"
                  className="flex-1 bg-zinc-800 border-zinc-700 min-h-[80px]"
                  data-testid="characteristics-input"
                />
                <Button
                  type="button"
                  variant={voiceField === 'characteristics' ? 'default' : 'outline'}
                  size="icon"
                  className="h-12 w-12 border-zinc-700"
                  onClick={() => voiceField === 'characteristics' ? stopVoice() : startVoice('characteristics')}
                  data-testid="voice-characteristics-btn"
                >
                  {voiceField === 'characteristics' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
              Расположение
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Floor */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Этаж</Label>
              <Select 
                value={object.floor || ''} 
                onValueChange={(v) => handleChange('floor', v)}
              >
                <SelectTrigger className="h-12 bg-zinc-800 border-zinc-700" data-testid="floor-select">
                  <SelectValue placeholder="Выберите этаж" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {references.floor.map(f => (
                    <SelectItem key={f.id} value={f.name} className="text-white">
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Отдел</Label>
              <Select 
                value={object.department || ''} 
                onValueChange={(v) => handleChange('department', v)}
              >
                <SelectTrigger className="h-12 bg-zinc-800 border-zinc-700" data-testid="department-select">
                  <SelectValue placeholder="Выберите отдел" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {references.department.map(d => (
                    <SelectItem key={d.id} value={d.name} className="text-white">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MOL */}
            <div className="space-y-2">
              <Label className="text-zinc-300">МОЛ</Label>
              <Select 
                value={object.mol_id || ''} 
                onValueChange={(v) => handleChange('mol_id', v)}
              >
                <SelectTrigger className="h-12 bg-zinc-800 border-zinc-700" data-testid="mol-select">
                  <SelectValue placeholder="Выберите МОЛ" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {references.mol.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-white">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        {!isNew && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-['Barlow_Condensed'] uppercase">
                Фото
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="border-zinc-700"
                data-testid="add-photo-btn"
              >
                <Camera className="w-4 h-4 mr-2" />
                Добавить
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
                    <div key={i} className="aspect-square rounded overflow-hidden bg-zinc-800">
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL}${url}`} 
                        alt={`Фото ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-center py-4">Нет фото</p>
              )}
            </CardContent>
          </Card>
        )}

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
