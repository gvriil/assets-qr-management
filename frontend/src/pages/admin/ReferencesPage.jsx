import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Building, Layers, User } from 'lucide-react';

const REFERENCE_TYPES = [
  { value: 'floor', label: 'Этажи', icon: Layers },
  { value: 'department', label: 'Отделы', icon: Building },
  { value: 'mol', label: 'МОЛ', icon: User },
];

const COMPLEXITY_OPTIONS = [
  { value: 'S', label: 'Простой (S)' },
  { value: 'M', label: 'Средний (M)' },
  { value: 'L', label: 'Сложный (L)' },
];

export default function ReferencesPage() {
  const { api } = useAuth();
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Category Dialog
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    complexity_default: 'S',
    required_fields: []
  });
  
  // Reference Dialog
  const [showRefDialog, setShowRefDialog] = useState(false);
  const [newReference, setNewReference] = useState({ name: '', type: 'floor' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [catsRes, refsRes] = await Promise.all([
        api.get('/categories'),
        api.get('/references')
      ]);
      setCategories(catsRes.data);
      setReferences(refsRes.data);
    } catch (err) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name) {
      toast.error('Введите название категории');
      return;
    }

    setCreating(true);
    try {
      await api.post('/categories', newCategory);
      toast.success('Категория создана');
      setShowCatDialog(false);
      setNewCategory({ name: '', complexity_default: 'S', required_fields: [] });
      loadData();
    } catch (err) {
      toast.error('Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Удалить категорию?')) return;
    try {
      await api.delete(`/categories/${catId}`);
      toast.success('Удалено');
      loadData();
    } catch (err) {
      toast.error('Ошибка удаления');
    }
  };

  const handleCreateReference = async () => {
    if (!newReference.name) {
      toast.error('Введите название');
      return;
    }

    setCreating(true);
    try {
      await api.post('/references', newReference);
      toast.success('Создано');
      setShowRefDialog(false);
      setNewReference({ name: '', type: 'floor' });
      loadData();
    } catch (err) {
      toast.error('Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteReference = async (refId) => {
    if (!window.confirm('Удалить запись?')) return;
    try {
      await api.delete(`/references/${refId}`);
      toast.success('Удалено');
      loadData();
    } catch (err) {
      toast.error('Ошибка удаления');
    }
  };

  const getRefsByType = (type) => references.filter(r => r.type === type);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="references-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Справочники
        </h1>
        <p className="text-muted-foreground">Управление категориями и справочными данными</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="categories">Категории</TabsTrigger>
          <TabsTrigger value="floor">Этажи</TabsTrigger>
          <TabsTrigger value="department">Отделы</TabsTrigger>
          <TabsTrigger value="mol">МОЛ</TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
              <DialogTrigger asChild>
                <Button data-testid="add-category-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить категорию
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новая категория</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Название</Label>
                    <Input
                      placeholder="Мебель"
                      value={newCategory.name}
                      onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="category-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Сложность по умолчанию</Label>
                    <Select
                      value={newCategory.complexity_default}
                      onValueChange={(v) => setNewCategory(prev => ({ ...prev, complexity_default: v }))}
                    >
                      <SelectTrigger data-testid="category-complexity-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPLEXITY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCatDialog(false)}>Отмена</Button>
                  <Button onClick={handleCreateCategory} disabled={creating} data-testid="submit-category-btn">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Сложность</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Нет категорий
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map(cat => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>{COMPLEXITY_OPTIONS.find(o => o.value === cat.complexity_default)?.label}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(cat.id)}
                          data-testid={`delete-cat-${cat.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Reference Tabs */}
        {REFERENCE_TYPES.map(refType => (
          <TabsContent key={refType.value} value={refType.value} className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={showRefDialog && newReference.type === refType.value} onOpenChange={(open) => {
                setShowRefDialog(open);
                if (open) setNewReference(prev => ({ ...prev, type: refType.value }));
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => setNewReference({ name: '', type: refType.value })} data-testid={`add-${refType.value}-btn`}>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Добавить: {refType.label}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Название</Label>
                      <Input
                        placeholder={refType.value === 'floor' ? 'Этаж 1' : refType.value === 'department' ? 'Бухгалтерия' : 'Иванов И.И.'}
                        value={newReference.name}
                        onChange={(e) => setNewReference(prev => ({ ...prev, name: e.target.value }))}
                        data-testid={`ref-name-input`}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRefDialog(false)}>Отмена</Button>
                    <Button onClick={handleCreateReference} disabled={creating} data-testid="submit-ref-btn">
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getRefsByType(refType.value).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        Нет данных
                      </TableCell>
                    </TableRow>
                  ) : (
                    getRefsByType(refType.value).map(ref => (
                      <TableRow key={ref.id}>
                        <TableCell className="font-medium">{ref.name}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteReference(ref.id)}
                            data-testid={`delete-ref-${ref.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
