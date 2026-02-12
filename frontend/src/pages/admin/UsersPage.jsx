import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Copy, Trash2, Key, UserPlus, Users, Edit, UserX } from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Администратор',
  operator: 'Оператор',
  field_worker: 'Полевой работник',
  auditor: 'Аудитор',
  mol: 'МОЛ'
};

const ROLE_COLORS = {
  admin: 'bg-red-500',
  operator: 'bg-blue-500',
  field_worker: 'bg-emerald-500',
  auditor: 'bg-purple-500',
  mol: 'bg-amber-500'
};

export default function UsersPage() {
  const { api } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create user dialog
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: 'field_worker'
  });
  
  // Create invite dialog
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [newInvite, setNewInvite] = useState({
    role: 'field_worker',
    max_uses: 1,
    expires_days: 7,
    unlimited: false
  });
  
  const [saving, setSaving] = useState(false);
  
  // Edit user dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        api.get('/users'),
        api.get('/invites')
      ]);
      setUsers(usersRes.data);
      setInvites(invitesRes.data);
    } catch (err) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.name) {
      toast.error('Заполните все поля');
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/register-by-admin', newUser);
      toast.success('Пользователь создан');
      setShowUserDialog(false);
      setNewUser({ email: '', password: '', name: '', role: 'field_worker' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvite = async () => {
    setSaving(true);
    try {
      const inviteData = {
        role: newInvite.role,
        max_uses: newInvite.max_uses,
        expires_days: newInvite.unlimited ? 3650 : newInvite.expires_days // 10 years for "unlimited"
      };
      const res = await api.post('/invites', inviteData);
      toast.success('Инвайт создан');
      
      // Copy to clipboard
      await navigator.clipboard.writeText(res.data.code);
      toast.success(`Код скопирован: ${res.data.code}`);
      
      setShowInviteDialog(false);
      setNewInvite({ role: 'field_worker', max_uses: 1, expires_days: 7, unlimited: false });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка создания инвайта');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = async (code) => {
    await navigator.clipboard.writeText(code);
    toast.success('Код скопирован');
  };

  const handleDeactivateInvite = async (inviteId) => {
    try {
      await api.delete(`/invites/${inviteId}`);
      toast.success('Инвайт деактивирован');
      loadData();
    } catch (err) {
      toast.error('Ошибка');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await api.put(`/users/${userId}`, { is_active: !currentStatus });
      toast.success(currentStatus ? 'Пользователь деактивирован' : 'Пользователь активирован');
      loadData();
    } catch (err) {
      toast.error('Ошибка обновления');
    }
  };

  const activeInvites = invites.filter(inv => inv.is_active && new Date(inv.expires_at) > new Date());

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
            Пользователи
          </h1>
          <p className="text-muted-foreground">
            {users.length} пользователей • {activeInvites.length} активных инвайтов
          </p>
        </div>

        <div className="flex gap-2">
          {/* Create Invite Dialog */}
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="create-invite-btn">
                <Key className="w-4 h-4 mr-2" />
                Создать инвайт
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый инвайт-код</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Роль для приглашённого</Label>
                  <Select
                    value={newInvite.role}
                    onValueChange={(v) => setNewInvite(prev => ({ ...prev, role: v }))}
                  >
                    <SelectTrigger data-testid="invite-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Макс. использований</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={newInvite.max_uses}
                    onChange={(e) => setNewInvite(prev => ({ ...prev, max_uses: parseInt(e.target.value) || 1 }))}
                    data-testid="invite-max-uses"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Срок действия (дней)</Label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newInvite.unlimited}
                        onChange={(e) => setNewInvite(prev => ({ ...prev, unlimited: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300"
                        data-testid="invite-unlimited-checkbox"
                      />
                      <span className="text-muted-foreground">Бессрочно</span>
                    </label>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={newInvite.expires_days}
                    onChange={(e) => setNewInvite(prev => ({ ...prev, expires_days: parseInt(e.target.value) || 7 }))}
                    disabled={newInvite.unlimited}
                    data-testid="invite-expires-days"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Отмена</Button>
                <Button onClick={handleCreateInvite} disabled={saving} data-testid="submit-invite-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать и скопировать'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create User Dialog */}
          <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
            <DialogTrigger asChild>
              <Button data-testid="create-user-btn">
                <UserPlus className="w-4 h-4 mr-2" />
                Добавить напрямую
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый пользователь</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    data-testid="new-user-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Имя</Label>
                  <Input
                    placeholder="Иван Иванов"
                    value={newUser.name}
                    onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="new-user-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Пароль</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newUser.password}
                    onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                    data-testid="new-user-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Роль</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v) => setNewUser(prev => ({ ...prev, role: v }))}
                  >
                    <SelectTrigger data-testid="new-user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUserDialog(false)}>Отмена</Button>
                <Button onClick={handleCreateUser} disabled={saving} data-testid="submit-create-user">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Создать'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Active Invites */}
      {activeInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="w-5 h-5 text-primary" />
              Активные инвайт-коды
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeInvites.map(inv => (
                <div 
                  key={inv.id} 
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  data-testid={`invite-${inv.id}`}
                >
                  <div className="flex items-center gap-4">
                    <code className="font-mono text-primary font-bold">{inv.code}</code>
                    <Badge className={`${ROLE_COLORS[inv.role]} text-white`}>
                      {ROLE_LABELS[inv.role]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {inv.used_count}/{inv.max_uses} использовано
                    </span>
                    <span className="text-xs text-muted-foreground">
                      до {new Date(inv.expires_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyCode(inv.code)}
                      data-testid={`copy-invite-${inv.id}`}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeactivateInvite(inv.id)}
                      data-testid={`delete-invite-${inv.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            Список пользователей
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="hidden md:table-cell">Дата</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Нет пользователей
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge className={`${ROLE_COLORS[user.role]} text-white`}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? 'default' : 'secondary'}>
                          {user.is_active ? 'Активен' : 'Неактивен'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {new Date(user.created_at).toLocaleDateString('ru-RU')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          data-testid={`toggle-user-${user.id}`}
                        >
                          {user.is_active ? '🔒' : '🔓'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
