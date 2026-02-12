# 📦 Руководство по развертыванию MVP Инвентаризации

## Содержание
1. [Требования к серверу](#требования-к-серверу)
2. [Стек технологий](#стек-технологий)
3. [Быстрый старт](#быстрый-старт)
4. [Конфигурация](#конфигурация)
5. [SSL сертификаты](#ssl-сертификаты)
6. [Создание первого администратора](#создание-первого-администратора)
7. [Резервное копирование](#резервное-копирование)
8. [Мониторинг](#мониторинг)
9. [Обновление](#обновление)
10. [Устранение неполадок](#устранение-неполадок)

---

## Требования к серверу

### Минимальные требования
| Параметр | Значение |
|----------|----------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Диск | 40 GB SSD |
| ОС | Ubuntu 22.04 LTS / Debian 12 |

### Рекомендуемые требования (для 40,000+ объектов)
| Параметр | Значение |
|----------|----------|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Диск | 100 GB SSD |

### Сетевые требования
- Открытые порты: 80 (HTTP), 443 (HTTPS), 22 (SSH)
- Статический IP-адрес
- Домен, направленный на сервер (A-запись)

---

## Стек технологий

| Компонент | Технология | Версия | Порт |
|-----------|------------|--------|------|
| Frontend | React + Nginx | 20 / Alpine | 80 |
| Backend | FastAPI (Python) | 3.11 | 8001 |
| Database | MongoDB | 7.x | 27017 |
| Reverse Proxy | Nginx | Alpine | 80, 443 |

### Зависимости Backend (ключевые)
- `fastapi` - веб-фреймворк
- `motor` - асинхронный драйвер MongoDB
- `bcrypt` - хеширование паролей
- `PyJWT` - JWT токены
- `reportlab` - генерация PDF
- `qrcode` - генерация QR-кодов
- `xlsxwriter` - генерация Excel

### Зависимости Frontend (ключевые)
- `react` - UI фреймворк
- `tailwindcss` - CSS фреймворк
- `@radix-ui/*` - UI компоненты
- `axios` - HTTP клиент
- `react-router-dom` - роутинг

---

## Быстрый старт

### 1. Установка Docker и Docker Compose

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Перелогиниться для применения группы docker
exit
# Войти снова
```

### 2. Загрузка проекта

```bash
# Создание директории
mkdir -p /opt/inventory
cd /opt/inventory

# Клонирование или копирование файлов проекта
# Структура должна быть:
# /opt/inventory/
#   ├── backend/
#   ├── frontend/
#   └── deploy/
```

### 3. Конфигурация

```bash
cd /opt/inventory/deploy

# Копирование шаблона конфигурации
cp .env.example .env

# Редактирование конфигурации
nano .env
```

**Обязательно измените:**
- `MONGO_ROOT_PASSWORD` - сильный пароль для MongoDB
- `JWT_SECRET` - случайная строка 64 символа
- `PUBLIC_URL` - ваш домен (https://your-domain.ru)
- `CORS_ORIGINS` - ваш домен

### 4. Запуск

```bash
cd /opt/inventory/deploy

# Сборка и запуск
docker-compose up -d --build

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

---

## Конфигурация

### Переменные окружения (.env)

| Переменная | Описание | Пример |
|------------|----------|--------|
| `MONGO_ROOT_USER` | Пользователь MongoDB | `admin` |
| `MONGO_ROOT_PASSWORD` | Пароль MongoDB | `StrongP@ssw0rd!` |
| `DB_NAME` | Имя базы данных | `inventory` |
| `JWT_SECRET` | Секрет для JWT токенов | `random-64-char-string` |
| `PUBLIC_URL` | Публичный URL | `https://your-domain.ru` |
| `CORS_ORIGINS` | Разрешенные origins | `https://your-domain.ru` |

### Генерация JWT_SECRET

```bash
openssl rand -hex 32
```

### Изменение nginx-proxy.conf

Замените `your-domain.ru` на ваш домен во всех местах файла.

---

## SSL сертификаты

### Автоматически (Let's Encrypt)

```bash
# 1. Временно отключите SSL в nginx-proxy.conf
# Закомментируйте секцию server с listen 443

# 2. Запустите контейнеры
docker-compose up -d

# 3. Получите сертификат
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    -d your-domain.ru \
    --email your@email.ru \
    --agree-tos \
    --no-eff-email

# 4. Раскомментируйте SSL секцию в nginx-proxy.conf

# 5. Перезапустите nginx
docker-compose restart nginx
```

### Ручная установка сертификатов

Если у вас уже есть сертификаты:

```bash
# Копирование сертификатов
sudo mkdir -p /etc/letsencrypt/live/your-domain.ru/
sudo cp fullchain.pem /etc/letsencrypt/live/your-domain.ru/
sudo cp privkey.pem /etc/letsencrypt/live/your-domain.ru/
```

### Автообновление сертификатов

```bash
# Добавление cron задачи
echo "0 0 1 * * docker-compose -f /opt/inventory/deploy/docker-compose.yml run --rm certbot renew && docker-compose -f /opt/inventory/deploy/docker-compose.yml restart nginx" | sudo crontab -
```

---

## Создание первого администратора

После первого запуска нужно создать администратора:

### Способ 1: Через MongoDB напрямую

```bash
# Подключение к MongoDB
docker exec -it inventory-mongodb mongosh -u admin -p YOUR_MONGO_PASSWORD

# Выбор базы данных
use inventory

# Создание администратора (замените данные)
db.users.insertOne({
    id: "admin-" + new Date().getTime(),
    email: "admin@your-domain.ru",
    password: "$2b$12$BCRYPT_HASH_HERE",  // Сгенерировать ниже
    name: "Администратор",
    role: "admin",
    is_active: true,
    created_at: new Date().toISOString()
})
```

### Генерация bcrypt хеша пароля

```bash
docker exec -it inventory-backend python3 -c "
import bcrypt
password = 'YOUR_PASSWORD_HERE'  # Замените
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
print('Bcrypt hash:', hashed)
"
```

### Способ 2: Через API (если включена регистрация)

Создайте инвайт-код и зарегистрируйтесь через UI.

---

## Резервное копирование

### Автоматическое резервное копирование

```bash
# Сделать скрипт исполняемым
chmod +x /opt/inventory/deploy/backup.sh

# Добавить в cron (ежедневно в 2:00)
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/inventory/deploy/backup.sh >> /var/log/inventory-backup.log 2>&1") | crontab -
```

### Ручное резервное копирование

```bash
cd /opt/inventory/deploy
./backup.sh
```

### Восстановление из резервной копии

```bash
cd /opt/inventory/deploy
./restore.sh backup_20240215_020000.tar.gz
```

### Резервное копирование загруженных файлов

```bash
# Файлы хранятся в Docker volume
docker cp inventory-backend:/app/uploads ./uploads_backup

# Или через volume
docker run --rm -v inventory-deploy_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads_backup.tar.gz -C /data .
```

---

## Мониторинг

### Проверка состояния сервисов

```bash
cd /opt/inventory/deploy

# Статус контейнеров
docker-compose ps

# Логи всех сервисов
docker-compose logs -f

# Логи конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

### Проверка health endpoints

```bash
# Backend health check
curl -s http://localhost:8001/api/health

# Или через публичный URL
curl -s https://your-domain.ru/api/health
```

### Мониторинг ресурсов

```bash
# Использование ресурсов контейнерами
docker stats

# Размер базы данных
docker exec inventory-mongodb mongosh -u admin -p PASSWORD --eval "db.stats()"
```

### Настройка логирования (опционально)

Для централизованного логирования можно использовать:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Grafana + Loki
- Fluentd

---

## Обновление

### Обновление приложения

```bash
cd /opt/inventory

# Получение новой версии кода
git pull origin main  # или копирование файлов

# Пересборка и перезапуск
cd deploy
docker-compose down
docker-compose up -d --build

# Проверка
docker-compose ps
docker-compose logs -f
```

### Обновление без простоя (Blue-Green)

```bash
# 1. Сборка новой версии
docker-compose build

# 2. Перезапуск с новой версией
docker-compose up -d --no-deps --build backend
docker-compose up -d --no-deps --build frontend

# 3. Проверка
curl -s https://your-domain.ru/api/health
```

---

## Устранение неполадок

### Проблема: Контейнер не запускается

```bash
# Проверка логов
docker-compose logs backend
docker-compose logs mongodb

# Проверка конфигурации
docker-compose config
```

### Проблема: 502 Bad Gateway

```bash
# Проверка, что backend запущен
docker-compose ps backend
docker-compose logs backend

# Проверка сети
docker network inspect inventory-deploy_inventory-network
```

### Проблема: Не работает авторизация

```bash
# Проверка JWT_SECRET
docker exec inventory-backend env | grep JWT

# Проверка подключения к MongoDB
docker exec inventory-backend python3 -c "from motor.motor_asyncio import AsyncIOMotorClient; import os; c = AsyncIOMotorClient(os.environ['MONGO_URL']); print('Connected')"
```

### Проблема: Медленная работа

```bash
# Проверка индексов MongoDB
docker exec inventory-mongodb mongosh -u admin -p PASSWORD inventory --eval "db.objects.getIndexes()"

# Создание индексов (если нет)
docker exec inventory-mongodb mongosh -u admin -p PASSWORD inventory --eval "
    db.objects.createIndex({qr_code: 1});
    db.objects.createIndex({status: 1});
    db.objects.createIndex({created_at: -1});
"
```

### Полный перезапуск

```bash
cd /opt/inventory/deploy

# Остановка
docker-compose down

# Удаление volumes (ОСТОРОЖНО - удалит данные!)
# docker-compose down -v

# Пересборка
docker-compose build --no-cache

# Запуск
docker-compose up -d
```

---

## Структура файлов проекта

```
/opt/inventory/
├── backend/
│   ├── server.py          # Основной файл FastAPI
│   ├── requirements.txt   # Python зависимости
│   └── .env               # НЕ ИСПОЛЬЗОВАТЬ в продакшене
├── frontend/
│   ├── src/               # React исходники
│   ├── package.json       # Node зависимости
│   └── public/
└── deploy/
    ├── docker-compose.yml # Оркестрация контейнеров
    ├── Dockerfile.backend # Сборка backend
    ├── Dockerfile.frontend# Сборка frontend
    ├── nginx-proxy.conf   # Конфигурация reverse proxy
    ├── nginx-frontend.conf# Конфигурация frontend nginx
    ├── .env.example       # Шаблон конфигурации
    ├── .env               # Ваша конфигурация (создать из .env.example)
    ├── backup.sh          # Скрипт резервного копирования
    └── restore.sh         # Скрипт восстановления
```

---

## Контакты и поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs -f`
2. Проверьте конфигурацию: `docker-compose config`
3. Перезапустите сервисы: `docker-compose restart`

---

---

## Дополнительные файлы для продакшена

### 🐳 Docker Compose конфигурации

- **`docker-compose.yml`** - Базовая конфигурация (с Nginx + Certbot SSL)
- **`docker-compose.dev.yml`** - Для разработки (без SSL)
- **`docker-compose.prod.yml`** - Продакшен с Nginx (улучшенная версия)
- **`docker-compose.caddy.yml`** - Продакшен с Caddy (рекомендуется для упрощенного SSL)

### 📋 Выбор конфигурации

**Для продакшена выберите один из вариантов:**

1. **Nginx + Certbot (традиционный)**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
   - Требует ручной настройки SSL
   - Больше контроля над конфигурацией
   - Используйте `deploy/nginx-proxy.conf`

2. **Caddy (рекомендуется) ⭐**
   ```bash
   docker compose -f docker-compose.caddy.yml up -d
   ```
   - Автоматический SSL (Let's Encrypt)
   - Нулевая конфигурация HTTPS
   - Авто-обновление сертификатов
   - Используйте `deploy/Caddyfile`

### 🔒 SSL варианты

#### Вариант A: Nginx + Certbot
См. раздел [SSL сертификаты](#ssl-сертификаты) выше.

#### Вариант B: Caddy (автоматический SSL)
```bash
# 1. Отредактируйте Caddyfile
nano deploy/Caddyfile
# Замените your-domain.com на ваш домен

# 2. Отредактируйте .env
nano .env
# Установите правильные значения

# 3. Запустите с Caddy
docker compose -f deploy/docker-compose.caddy.yml up -d

# Готово! SSL настроится автоматически
```

### 📚 Полная документация

Для детальной инструкции по деплою см. **`docs/DEPLOY.md`**

Включает:
- Настройка сервера Ubuntu/Debian с нуля
- Firewall и безопасность
- CI/CD с GitHub Actions
- Мониторинг и резервное копирование
- Troubleshooting

### 🔐 Пример environment файла

См. `.env.prod.example` в корне проекта для полного списка переменных окружения.

---

**Версия документации:** 2.0
**Дата:** Февраль 2026
