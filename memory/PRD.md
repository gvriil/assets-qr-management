# MVP Система Полевой Инвентаризации

## Описание
Система для полевой инвентаризации ~40,000 объектов с поддержкой QR-кодов, мобильного сканирования и экспорта отчетов.

## Архитектура
- **Backend:** FastAPI + MongoDB
- **Frontend:** React + Tailwind + Shadcn

## Функционал

### Аутентификация
- JWT авторизация
- Регистрация по инвайт-коду
- Роли: admin, operator, field_worker, auditor, mol

### Объекты
- Обязательные поля: ОИВ, Этаж, Управление, Отдел, Место, МОЛ
- Автозаполнение из справочников
- История изменений (аудит)
- Загрузка фотографий
- Привязка QR-кода

### Справочники
- Этажи, Отделы, МОЛ, ОИВ, Управления
- Наполнены из PDF

### QR-коды
- Создание партий с выбором атрибутов из справочников
- Генерация PDF для печати
- Этикетки: ОИВ - ЭТАЖ - УПРАВЛЕНИЕ - ОТДЕЛ - МЕСТО - ФИО

### Экспорт (4 типа документов)
- Фотоархив (PDF/Excel)
- Каталог имущества
- Инвентаризационная ведомость
- Отчет по спецификации

### Импорт
- CSV/Excel с автоматическим маппингом
- Опция разбивки по запятым

## API Endpoints

### Auth
- POST /api/auth/login
- POST /api/auth/register
- GET /api/auth/me

### Objects
- GET/POST /api/objects
- PUT /api/objects/{id}

### References
- GET/POST /api/references

### Export
- GET /api/export/document

### QR
- GET/POST /api/qr-batches
- GET /api/qr-batches/{id}/pdf

## Первоначальная настройка

Для создания первого администратора используйте MongoDB:
```javascript
db.users.insertOne({
  id: "admin-uuid",
  email: "your-email@domain.com",
  password: "<bcrypt-hash>",
  name: "Администратор",
  role: "admin",
  is_active: true,
  created_at: new Date().toISOString()
})
```

## Переменные окружения

### Backend (.env)
- MONGO_URL - URL подключения к MongoDB
- DB_NAME - Имя базы данных
- JWT_SECRET - Секретный ключ для JWT (обязателен)
- CORS_ORIGINS - Разрешенные origins

### Frontend (.env)
- REACT_APP_BACKEND_URL - URL бэкенда

## Дата обновления
2026-02-11
