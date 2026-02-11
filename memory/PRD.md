# MVP Система Полевой Инвентаризации

## Оригинальная Задача
MVP система полевой инвентаризации для ~40,000 объектов с 15-20 полевыми исполнителями.
Полный цикл: загрузка Excel/CSV → генерация QR → печать → наклейка → сканирование → сопоставление/создание позиций → фото/история изменений → экспорт отчетов.

## Выбранные настройки
- **Auth/2FA:** JWT + email-код (2FA)
- **Фото-хранилище:** локально на сервере (MVP)
- **QR + PDF:** серверная генерация (Python: qrcode + reportlab)
- **UI:** минималистичный индустриальный, переключатель тёмная/светлая тема
- **Язык:** русский

## Архитектура

### Backend (FastAPI + MongoDB)
- `/app/backend/server.py` - основной сервер
- JWT аутентификация с 2FA (код в логах для MVP)
- RBAC: admin, operator, field_worker, auditor, mol
- REST API с prefix `/api`

### Frontend (React + Tailwind + Shadcn)
- `/app/frontend/src/` - исходники
- PWA для мобильных устройств
- Offline режим с localforage
- QR сканер через html5-qrcode

## Реализовано (Этап 1 - Core MVP)

### ✅ Аутентификация и безопасность
- [x] JWT + 2FA (email код)
- [x] Система инвайт-кодов (регистрация только по приглашению)
- [x] Тестовый админ: admin@inventory.system / admin123
- [x] RBAC (роли: admin, operator, field_worker, auditor, mol)
- [x] Создание пользователей админом напрямую

### ✅ Объекты
- [x] CRUD для объектов
- [x] Автогенерация QR кода при создании
- [x] Поиск по QR коду
- [x] Статусы: new, pending, verified, rejected
- [x] Сложность: S (простой), M (средний), L (сложный)

### ✅ QR коды
- [x] Генерация партий QR кодов
- [x] PDF для печати (3x8 этикеток на странице)
- [x] Учёт: выдано/испорчено

### ✅ Импорт/Экспорт
- [x] Импорт Excel/CSV с маппингом колонок
- [x] Экспорт в Excel/CSV

### ✅ Справочники
- [x] Категории с сложностью по умолчанию
- [x] Этажи, Отделы, МОЛ

### ✅ Тарифы и оплата
- [x] Настройка ставок по сложности
- [x] Расчёт начислений (pending/confirmed)

### ✅ Админ-панель
- [x] Дашборд со статистикой
- [x] Управление пользователями
- [x] Управление инвайтами
- [x] QA очередь
- [x] История изменений (аудит)

### ✅ Полевой интерфейс (PWA)
- [x] QR сканер (камера)
- [x] Карточка объекта
- [x] Создание объекта
- [x] Загрузка фото (сжатие)
- [x] Прогресс и начисления
- [x] Offline режим (очередь действий)

## Backlog (P1 - следующий этап)

### Офлайн режим
- [ ] Кэширование справочников
- [ ] Синхронизация фото в офлайне
- [ ] Разрешение конфликтов

### Улучшения UX
- [ ] Автодополнение по части слова
- [ ] "Последние использованные" значения
- [ ] Голосовой ввод (Speech-to-Text)

### Отчёты
- [ ] Ведомость инвентаризации
- [ ] Отчёт по спецификации
- [ ] Фотоархив с галереей

### Интеграции
- [ ] Email отправка 2FA кодов
- [ ] Push уведомления

## Backlog (P2 - дополнительно)

- [ ] Telegram бот для уведомлений
- [ ] Массовые операции с объектами
- [ ] Сравнение версий объекта
- [ ] Dashboard с графиками по времени
- [ ] S3 хранилище для фото (production)

## API Endpoints

### Auth
- POST /api/auth/register - регистрация по инвайту
- POST /api/auth/register-by-admin - создание админом
- POST /api/auth/login - вход (отправляет 2FA)
- POST /api/auth/verify-2fa - подтверждение 2FA
- GET /api/auth/me - текущий пользователь

### Invites
- POST /api/invites - создать инвайт
- GET /api/invites - список инвайтов
- DELETE /api/invites/{id} - деактивировать

### Objects
- POST /api/objects - создать
- GET /api/objects - список с фильтрами
- GET /api/objects/{id} - получить
- GET /api/objects/by-qr/{qr} - поиск по QR
- PUT /api/objects/{id} - обновить
- POST /api/objects/{id}/photo - загрузить фото
- POST /api/objects/{id}/verify - отправить на проверку

### QR Batches
- POST /api/qr-batches - создать партию
- GET /api/qr-batches - список
- GET /api/qr-batches/{id}/pdf - скачать PDF

### References
- POST /api/categories, GET /api/categories
- POST /api/references, GET /api/references
- POST /api/rates, GET /api/rates

### Stats
- GET /api/stats/overview
- GET /api/stats/progress
- GET /api/stats/by-user

### QA
- GET /api/qa/queue
- POST /api/qa/{id}/approve
- POST /api/qa/{id}/reject

### Import/Export
- POST /api/import/preview
- POST /api/import/execute
- GET /api/export/objects

## Тестовые данные

- **Админ:** 0020992@gmail.com / admin123
- **2FA код:** показывается в зелёном уведомлении вверху экрана
- **Тарифы:** S=50₽, M=100₽, L=200₽

## Дата обновления
2026-02-11
