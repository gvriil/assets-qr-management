import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { toast } from 'sonner';
import { Loader2, Search, ExternalLink, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Название (А-Я)' },
  { value: 'name_desc', label: 'Название (Я-А)' },
  { value: 'created_desc', label: 'Дата создания (новые)' },
  { value: 'created_asc', label: 'Дата создания (старые)' },
  { value: 'floor_asc', label: 'Этаж (1-99)' },
  { value: 'category_asc', label: 'Категория (А-Я)' },
  { value: 'status_asc', label: 'Статус' }
];

export default function ObjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { api } = useAuth();
  
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 20;

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    status: searchParams.get('status') || '',
    category_id: '',
    sort: 'created_desc'
  });
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadObjects();
  }, [page, filters]);

  const loadCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(res.data);
    } catch (e) {
      console.error('Error loading categories:', e);
    }
  };

  const loadObjects = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('skip', page * limit);
      params.append('limit', limit);
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.category_id) params.append('category_id', filters.category_id);
      if (filters.sort) params.append('sort', filters.sort);

      const [objectsRes, countRes] = await Promise.all([
        api.get(`/objects?${params.toString()}`),
        api.get(`/objects/count?${filters.status ? `status=${filters.status}` : ''}${filters.category_id ? `&category_id=${filters.category_id}` : ''}`)
      ]);

      setObjects(objectsRes.data);
      setTotal(countRes.data.count);
    } catch (err) {
      toast.error('Ошибка загрузки объектов');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    loadObjects();
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6" data-testid="objects-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            Объекты
          </h1>
          <p className="text-muted-foreground">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, QR, характеристикам..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10"
              data-testid="objects-search-input"
            />
          </div>
          <Button type="submit" data-testid="objects-search-btn">
            <Search className="w-4 h-4" />
          </Button>
        </form>

        <select 
          className="h-10 px-3 rounded-md border border-input bg-background text-sm w-[160px]"
          value={filters.status} 
          onChange={(e) => handleFilterChange('status', e.target.value)}
          data-testid="status-filter"
        >
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select 
          className="h-10 px-3 rounded-md border border-input bg-background text-sm w-[160px]"
          value={filters.category_id} 
          onChange={(e) => handleFilterChange('category_id', e.target.value)}
          data-testid="category-filter"
        >
          <option value="">Все категории</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">QR Код</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="hidden md:table-cell">Категория</TableHead>
              <TableHead className="hidden lg:table-cell">Этаж</TableHead>
              <TableHead className="hidden lg:table-cell">Отдел</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : objects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Объекты не найдены
                </TableCell>
              </TableRow>
            ) : (
              objects.map((obj) => (
                <TableRow 
                  key={obj.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/object/${obj.id}`)}
                  data-testid={`object-row-${obj.id}`}
                >
                  <TableCell className="font-mono text-xs text-primary">
                    {obj.qr_code}
                  </TableCell>
                  <TableCell className="font-medium">{obj.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {obj.category || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {obj.floor || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {obj.department || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[obj.status]} text-white`}>
                      {STATUS_LABELS[obj.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
              data-testid="prev-page-btn"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              data-testid="next-page-btn"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
