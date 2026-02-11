import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Loader2, Search, ChevronLeft, ChevronRight, User, Clock } from 'lucide-react';

const ACTION_LABELS = {
  create: 'Создание',
  update: 'Обновление',
  verify: 'Верификация',
  photo_upload: 'Загрузка фото',
  qa_approve: 'QA: принято',
  qa_reject: 'QA: отклонено'
};

const ACTION_COLORS = {
  create: 'bg-emerald-500',
  update: 'bg-blue-500',
  verify: 'bg-amber-500',
  photo_upload: 'bg-purple-500',
  qa_approve: 'bg-green-500',
  qa_reject: 'bg-red-500'
};

export default function AuditPage() {
  const { api } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchUserId, setSearchUserId] = useState('');
  const [searchObjectId, setSearchObjectId] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadLogs();
  }, [page]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('skip', page * limit);
      params.append('limit', limit);
      if (searchUserId) params.append('user_id', searchUserId);
      if (searchObjectId) params.append('object_id', searchObjectId);

      const res = await api.get(`/audit-log?${params.toString()}`);
      setLogs(res.data);
    } catch (err) {
      toast.error('Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(0);
    loadLogs();
  };

  return (
    <div className="space-y-6" data-testid="audit-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Аудит
        </h1>
        <p className="text-muted-foreground">История изменений объектов</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="ID объекта..."
            value={searchObjectId}
            onChange={(e) => setSearchObjectId(e.target.value)}
            data-testid="audit-object-search"
          />
        </div>
        <div className="flex-1">
          <Input
            placeholder="ID пользователя..."
            value={searchUserId}
            onChange={(e) => setSearchUserId(e.target.value)}
            data-testid="audit-user-search"
          />
        </div>
        <Button onClick={handleSearch} data-testid="audit-search-btn">
          <Search className="w-4 h-4 mr-2" />
          Поиск
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата/время</TableHead>
              <TableHead>Действие</TableHead>
              <TableHead>Объект</TableHead>
              <TableHead>Пользователь</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Нет записей
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log, i) => (
                <TableRow key={i} data-testid={`audit-row-${i}`}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {new Date(log.timestamp).toLocaleString('ru-RU')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${ACTION_COLORS[log.action] || 'bg-zinc-500'} text-white`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.object_id?.slice(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {log.user_name}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Страница {page + 1}
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
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < limit}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
