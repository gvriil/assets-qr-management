import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { 
  ShieldCheck, UserCog, Scan, ClipboardCheck, Package,
  FileText, QrCode, Users, Settings, Download, Upload, Eye, Edit, Trash2
} from 'lucide-react';

const ROLES = [
  {
    id: 'admin',
    name: 'Администратор',
    color: 'bg-red-500',
    icon: ShieldCheck,
    description: 'Полный доступ к системе',
    permissions: [
      { icon: Users, text: 'Управление пользователями (создание, редактирование, удаление, изменение ролей)' },
      { icon: Settings, text: 'Настройка справочников (ОИВ, этажи, отделы, МОЛ, категории)' },
      { icon: QrCode, text: 'Генерация и печать QR-кодов' },
      { icon: Download, text: 'Экспорт документов (фотоархив, каталог, ведомости)' },
      { icon: Upload, text: 'Импорт данных из CSV/Excel' },
      { icon: ClipboardCheck, text: 'Контроль качества (одобрение/отклонение объектов)' },
      { icon: Eye, text: 'Просмотр всех объектов и аудит-логов' },
      { icon: Edit, text: 'Редактирование любых объектов' },
      { icon: Trash2, text: 'Удаление фотографий' },
      { icon: FileText, text: 'Управление тарифами' },
    ]
  },
  {
    id: 'auditor',
    name: 'Аудитор',
    color: 'bg-purple-500',
    icon: ClipboardCheck,
    description: 'Контроль качества и проверка объектов',
    permissions: [
      { icon: ClipboardCheck, text: 'Контроль качества (одобрение/отклонение объектов)' },
      { icon: Eye, text: 'Просмотр всех объектов' },
      { icon: Edit, text: 'Редактирование объектов' },
      { icon: Trash2, text: 'Удаление фотографий' },
      { icon: Download, text: 'Экспорт отчётов' },
      { icon: FileText, text: 'Просмотр аудит-логов' },
    ]
  },
  {
    id: 'operator',
    name: 'Оператор',
    color: 'bg-blue-500',
    icon: UserCog,
    description: 'Работа с данными в офисе',
    permissions: [
      { icon: Eye, text: 'Просмотр всех объектов' },
      { icon: Edit, text: 'Редактирование объектов' },
      { icon: Upload, text: 'Импорт данных' },
      { icon: Download, text: 'Экспорт отчётов' },
      { icon: QrCode, text: 'Генерация QR-кодов' },
    ]
  },
  {
    id: 'field_worker',
    name: 'Полевой работник',
    color: 'bg-emerald-500',
    icon: Scan,
    description: 'Инвентаризация на местах',
    permissions: [
      { icon: Scan, text: 'Сканирование QR-кодов' },
      { icon: Package, text: 'Создание новых объектов' },
      { icon: Edit, text: 'Редактирование своих объектов' },
      { icon: FileText, text: 'Добавление фотографий к объектам' },
      { icon: ClipboardCheck, text: 'Отправка объектов на проверку' },
    ]
  },
  {
    id: 'mol',
    name: 'МОЛ (Материально-ответственное лицо)',
    color: 'bg-amber-500',
    icon: Package,
    description: 'Просмотр своего имущества',
    permissions: [
      { icon: Eye, text: 'Просмотр объектов, закреплённых за МОЛ' },
      { icon: FileText, text: 'Просмотр истории изменений' },
    ]
  }
];

export default function HelpPage() {
  return (
    <div className="space-y-6" data-testid="help-page">
      <div>
        <h1 className="text-2xl font-bold font-['Barlow_Condensed'] uppercase tracking-tight">
          Инструкции
        </h1>
        <p className="text-muted-foreground">
          Справка по использованию системы инвентаризации
        </p>
      </div>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <CardTitle>Быстрый старт</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                1. Генерация QR-кодов
              </h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Перейдите в раздел "QR-коды"</li>
                <li>Нажмите "Создать партию"</li>
                <li>Выберите ОИВ, этаж, отдел и МОЛ из справочников</li>
                <li>Укажите количество кодов</li>
                <li>Скачайте PDF и распечатайте</li>
              </ol>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Scan className="w-5 h-5 text-primary" />
                2. Сканирование и привязка
              </h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Откройте сканер на телефоне</li>
                <li>Наведите камеру на QR-код</li>
                <li>Заполните данные об объекте</li>
                <li>Добавьте фотографии</li>
                <li>Отправьте на проверку</li>
              </ol>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                3. Контроль качества
              </h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Перейдите в раздел "Контроль качества"</li>
                <li>Проверьте данные и фотографии</li>
                <li>Одобрите или отклоните с указанием причины</li>
                <li>Отклонённые объекты возвращаются исполнителю</li>
              </ol>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                4. Экспорт отчётов
              </h3>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Перейдите в раздел "Экспорт"</li>
                <li>Выберите тип документа</li>
                <li>Заполните данные комиссии</li>
                <li>Скачайте в PDF или Excel</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle>Роли и права доступа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {ROLES.map((role) => (
            <div key={role.id} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Badge className={`${role.color} text-white px-3 py-1`}>
                  <role.icon className="w-4 h-4 mr-2" />
                  {role.name}
                </Badge>
                <span className="text-sm text-muted-foreground">{role.description}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {role.permissions.map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <perm.icon className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{perm.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Photo Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Требования к фотографиям</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <strong>Форматы:</strong> JPG, PNG
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <strong>Максимальный размер:</strong> 5 МБ
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <strong>Рекомендуемое разрешение:</strong> 1200×900 пикселей
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <strong>Рекомендации:</strong> Объект должен быть чётко виден, хорошее освещение, без размытия
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Statuses */}
      <Card>
        <CardHeader>
          <CardTitle>Статусы объектов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Badge className="bg-zinc-500">Новый</Badge>
              <span className="text-sm">Объект создан, но не отправлен на проверку</span>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Badge className="bg-amber-500">На проверке</Badge>
              <span className="text-sm">Ожидает проверки аудитором</span>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Badge className="bg-emerald-500">Подтверждён</Badge>
              <span className="text-sm">Проверен и одобрен</span>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Badge className="bg-red-500">Отклонён</Badge>
              <span className="text-sm">Требуется исправление замечаний</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
