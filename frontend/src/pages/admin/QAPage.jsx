import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Loader2, CheckCircle, XCircle, Clock, ImageOff, 
  AlertTriangle, ExternalLink, ChevronLeft, ChevronRight 
} from 'lucide-react';

const STATUS_LABELS = {
  new: 'Новый',
  pending: 'На проверке',
  verified: 'Подтверждён',
  rejected: 'Отклонён'
};

export default function QAPage() {
  const navigate = useNavigate();
  const { api } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState('date_desc');
  const limit = 20;

  useEffect(() => {
    loadQueue();
  }, [activeTab, page, sortBy]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/qa/queue?filter_type=${activeTab}&skip=${page * limit}&limit=${limit}&sort=${sortBy}`);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      toast.error('Ошибка загрузки очереди');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (objectId) => {
    setProcessing(objectId);
    try {
      await api.post(`/qa/${objectId}/approve`);
      toast.success('Принято');
      loadQueue();
    } catch (err) {
      toast.error('Ошибка');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (objectId) => {
    const reason = prompt('Причина отклонения:');
    if (reason === null) return;

    setProcessing(objectId);
    try {
      await api.post(`/qa/${objectId}/reject?reason=${encodeURIComponent(reason)}`);
      toast.success('Отклонено');
      loadQueue();
    } catch (err) {
      toast.error('Ошибка');
    } finally {
      setProcessing(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6" data-testid="qa-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Проверка качества
        </h1>
        <p className="text-muted-foreground">Очередь объектов на проверку</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            На проверке
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            <XCircle className="w-4 h-4" />
            Отклонённые
          </TabsTrigger>
          <TabsTrigger value="no_photo" className="gap-2">
            <ImageOff className="w-4 h-4" />
            Без фото
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Найдено: {total}
          </p>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
                <p className="text-muted-foreground">Очередь пуста</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map(obj => (
                <Card key={obj.id} className="overflow-hidden" data-testid={`qa-item-${obj.id}`}>
                  {/* Photo Preview */}
                  <div className="aspect-video bg-muted relative">
                    {obj.photos?.length > 0 ? (
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL}${obj.photos[0]}`}
                        alt={obj.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <ImageOff className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <Badge className="absolute top-2 right-2 bg-primary">
                      {obj.complexity}
                    </Badge>
                  </div>

                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-mono text-xs text-primary">{obj.qr_code}</p>
                      <h3 className="font-semibold truncate">{obj.name}</h3>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1">
                      {obj.floor && <p>Этаж: {obj.floor}</p>}
                      {obj.department && <p>Отдел: {obj.department}</p>}
                      {obj.category_name && <p>Категория: {obj.category_name}</p>}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/object/${obj.id}`)}
                        data-testid={`view-${obj.id}`}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Открыть
                      </Button>
                      
                      {activeTab === 'pending' && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => handleApprove(obj.id)}
                            disabled={processing === obj.id}
                            data-testid={`approve-${obj.id}`}
                          >
                            {processing === obj.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleReject(obj.id)}
                            disabled={processing === obj.id}
                            data-testid={`reject-${obj.id}`}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Страница {page + 1} из {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
