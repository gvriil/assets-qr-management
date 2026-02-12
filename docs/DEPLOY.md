# Production Deployment Guide

This guide provides step-by-step instructions for deploying the Inventory Management System (FastAPI + React + MongoDB + Nginx) to a production server.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Server Setup](#server-setup)
- [Initial Deployment](#initial-deployment)
- [SSL Setup - Option A: Nginx + Certbot](#ssl-setup---option-a-nginx--certbot)
- [SSL Setup - Option B: Caddy (Recommended)](#ssl-setup---option-b-caddy-recommended)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Backup and Restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 22.04 LTS or Debian 12 (recommended)
- **RAM**: Minimum 2GB (4GB recommended)
- **Storage**: Minimum 20GB SSD
- **CPU**: 2 cores minimum
- **Network**: Static IP address
- **Domain**: A domain name pointing to your server's IP

### Local Requirements
- Git installed
- SSH access to the server
- GitHub account (for CI/CD)

---

## Server Setup

### 1. Initial Server Configuration

Connect to your server:
```bash
ssh root@your-server-ip
```

### 2. Create a Non-Root User

```bash
# Create user
adduser deploy
usermod -aG sudo deploy

# Switch to new user
su - deploy
```

### 3. Configure SSH Access

On your **local machine**, copy your SSH key:
```bash
ssh-copy-id deploy@your-server-ip
```

Or manually:
```bash
# On your local machine
cat ~/.ssh/id_rsa.pub

# On server as deploy user
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Test SSH access:
```bash
ssh deploy@your-server-ip
```

### 4. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 5. Install Docker and Docker Compose

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
ssh deploy@your-server-ip

# Verify Docker installation
docker --version
docker compose version
```

### 6. Install Additional Tools

```bash
sudo apt install -y git curl wget nano htop ufw
```

### 7. Configure Firewall

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (IMPORTANT: Do this first!)
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### 8. Configure DNS

Ensure your domain's DNS A record points to your server's IP:

```
Type: A
Name: @ (or your subdomain)
Value: YOUR_SERVER_IP
TTL: 3600
```

For www subdomain:
```
Type: A
Name: www
Value: YOUR_SERVER_IP
TTL: 3600
```

Wait for DNS propagation (can take up to 48 hours, but usually 15-30 minutes):
```bash
# Check DNS propagation
nslookup your-domain.com
dig your-domain.com
```

---

## Initial Deployment

### 1. Clone Repository

```bash
# Create deployment directory
sudo mkdir -p /opt/inventory
sudo chown -R $USER:$USER /opt/inventory
cd /opt/inventory

# Clone your repository
git clone https://github.com/YOUR_USERNAME/assets-qr-management.git .

# Or if using SSH
git clone git@github.com:YOUR_USERNAME/assets-qr-management.git .
```

### 2. Configure Environment Variables

```bash
# Copy example environment file
cp .env.prod.example .env

# Edit with your values
nano .env
```

Fill in the following values:
```env
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=YOUR_SECURE_PASSWORD_HERE

DB_NAME=inventory

JWT_SECRET=YOUR_RANDOM_64_CHAR_STRING_HERE

CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

PUBLIC_URL=https://your-domain.com
```

Generate secure secrets:
```bash
# Generate JWT secret (64 characters)
openssl rand -hex 32

# Generate MongoDB password
openssl rand -base64 32
```

### 3. Update Domain in Nginx Config

```bash
# Edit nginx config
nano deploy/nginx-proxy.conf
```

Replace `your-domain.ru` with your actual domain in both HTTP and HTTPS server blocks.

---

## SSL Setup - Option A: Nginx + Certbot

This is the traditional approach using Let's Encrypt with Certbot.

### Step 1: Initial Deployment Without SSL

First, deploy with HTTP only to obtain SSL certificates:

```bash
cd /opt/inventory

# Temporarily modify nginx config to remove SSL (or use separate config)
# Comment out the HTTPS server block and use only HTTP for now

# Start services
docker compose -f deploy/docker-compose.prod.yml up -d mongodb backend frontend

# Start nginx without SSL
docker run -d \
  --name inventory-nginx-temp \
  --network inventory-network \
  -p 80:80 \
  -v $(pwd)/deploy/nginx-proxy-temp.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine
```

Create temporary nginx config (`deploy/nginx-proxy-temp.conf`):
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass http://backend:8001/api/;
    }
}
```

### Step 2: Obtain SSL Certificate

```bash
# Create directories
sudo mkdir -p /etc/letsencrypt /var/www/certbot

# Run certbot
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d your-domain.com \
  -d www.your-domain.com
```

### Step 3: Deploy with Full SSL

```bash
# Stop temporary nginx
docker stop inventory-nginx-temp
docker rm inventory-nginx-temp

# Deploy full stack with SSL
docker compose -f deploy/docker-compose.prod.yml up -d

# Enable certbot for auto-renewal
docker compose -f deploy/docker-compose.prod.yml --profile ssl up -d certbot
```

### Step 4: Verify SSL

```bash
# Check certificate
curl -I https://your-domain.com

# Test SSL configuration
docker compose -f deploy/docker-compose.prod.yml logs nginx
```

### Step 5: Test Auto-Renewal

```bash
# Dry run renewal
docker compose -f deploy/docker-compose.prod.yml exec certbot certbot renew --dry-run
```

---

## SSL Setup - Option B: Caddy (Recommended)

Caddy automatically obtains and renews SSL certificates with zero configuration. This is the **recommended approach** for easier SSL management.

### Step 1: Create Caddyfile

The Caddyfile is already included in `deploy/Caddyfile`. Review and update your domain:

```bash
nano deploy/Caddyfile
```

### Step 2: Create Caddy Docker Compose

Create `deploy/docker-compose.caddy.yml`:

```bash
nano deploy/docker-compose.caddy.yml
```

The file is already created (see next section).

### Step 3: Deploy with Caddy

```bash
cd /opt/inventory

# Deploy with Caddy instead of Nginx
docker compose -f deploy/docker-compose.caddy.yml up -d
```

That's it! Caddy will automatically:
- Obtain SSL certificates from Let's Encrypt
- Configure HTTPS with modern security settings
- Automatically renew certificates
- Redirect HTTP to HTTPS

### Step 4: Verify

```bash
# Check if services are running
docker compose -f deploy/docker-compose.caddy.yml ps

# Check Caddy logs
docker compose -f deploy/docker-compose.caddy.yml logs caddy

# Test HTTPS
curl -I https://your-domain.com
```

### Why Caddy is Recommended

- ✅ **Zero SSL configuration** - automatic HTTPS
- ✅ **Auto-renewal** - no cron jobs needed
- ✅ **Modern TLS** - secure defaults
- ✅ **Simpler config** - 10 lines vs 150 lines of nginx
- ✅ **HTTP/2 & HTTP/3** - enabled by default
- ✅ **Better error messages** - easier debugging

---

## GitHub Actions CI/CD

### 1. Generate SSH Key for Deployment

On your **server**:
```bash
# Generate SSH key (or use existing)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy

# Add to authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Display private key (copy this)
cat ~/.ssh/github_deploy
```

### 2. Configure GitHub Secrets

Go to your GitHub repository: **Settings → Secrets and variables → Actions**

Add the following secrets:

| Secret Name | Value |
|-------------|-------|
| `SSH_HOST` | Your server IP or domain |
| `SSH_USER` | `deploy` (or your deployment user) |
| `SSH_KEY` | Contents of `~/.ssh/github_deploy` (private key) |

### 3. Configure Repository Environment Variables

Also add environment variables in **.env** file on the server (already done in Initial Deployment).

### 4. Test Deployment

Push to main branch:
```bash
git add .
git commit -m "Initial production deployment"
git push origin main
```

GitHub Actions will automatically:
1. Connect to your server via SSH
2. Pull latest code
3. Build and restart Docker containers
4. Run health checks
5. Clean up old Docker images

### 5. Monitor Deployment

View deployment status:
- Go to **Actions** tab in your GitHub repository
- Click on the latest workflow run
- Monitor each step

---

## Monitoring and Maintenance

### Check Application Status

```bash
# View running containers
docker ps

# Check logs
docker compose -f deploy/docker-compose.prod.yml logs -f

# Check specific service
docker compose -f deploy/docker-compose.prod.yml logs -f backend
docker compose -f deploy/docker-compose.prod.yml logs -f mongodb

# Check resource usage
docker stats
```

### Health Checks

```bash
# Backend health
curl http://localhost:8001/api/health

# Check from outside
curl https://your-domain.com/api/health
```

### Update Application

The deployment is automated via GitHub Actions. Simply push to main:

```bash
git push origin main
```

For manual deployment:
```bash
cd /opt/inventory
git pull origin main
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### Restart Services

```bash
# Restart all services
docker compose -f deploy/docker-compose.prod.yml restart

# Restart specific service
docker compose -f deploy/docker-compose.prod.yml restart backend

# Full stop and start
docker compose -f deploy/docker-compose.prod.yml down
docker compose -f deploy/docker-compose.prod.yml up -d
```

### Clean Up

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (CAREFUL!)
docker volume prune

# Complete cleanup (CAREFUL!)
docker system prune -a
```

---

## Backup and Restore

### Automated Backups

A backup script is included at `deploy/backup.sh`:

```bash
# Run manual backup
cd /opt/inventory/deploy
./backup.sh
```

### Configure Automated Backups

```bash
# Add to crontab
crontab -e

# Add this line for daily backups at 2 AM
0 2 * * * /opt/inventory/deploy/backup.sh
```

### Backup Content

Backups include:
- MongoDB database dump
- Uploaded files (photos, QR codes)
- Environment configuration

Backups are stored in: `/opt/inventory/deploy/backups/`

### Restore from Backup

```bash
cd /opt/inventory/deploy

# List available backups
ls -lh backups/

# Restore specific backup
./restore.sh backups/backup_YYYY-MM-DD_HH-MM-SS.tar.gz
```

### Off-site Backups

For production, configure off-site backups:

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure cloud storage
rclone config

# Sync backups to cloud (example for Dropbox)
rclone sync /opt/inventory/deploy/backups/ dropbox:inventory-backups/
```

Add to crontab:
```bash
# Daily backup to cloud at 3 AM
0 3 * * * rclone sync /opt/inventory/deploy/backups/ dropbox:inventory-backups/
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check container status
docker compose -f deploy/docker-compose.prod.yml ps

# Check logs
docker compose -f deploy/docker-compose.prod.yml logs

# Check specific service
docker compose -f deploy/docker-compose.prod.yml logs backend
```

### Port Already in Use

```bash
# Check what's using port 80
sudo lsof -i :80

# Kill process if needed
sudo kill -9 PID
```

### SSL Certificate Issues

```bash
# Check certificate status
docker compose -f deploy/docker-compose.prod.yml exec certbot certbot certificates

# Force renewal
docker compose -f deploy/docker-compose.prod.yml exec certbot certbot renew --force-renewal

# Check nginx config
docker compose -f deploy/docker-compose.prod.yml exec nginx nginx -t
```

### MongoDB Connection Issues

```bash
# Check MongoDB logs
docker compose -f deploy/docker-compose.prod.yml logs mongodb

# Access MongoDB shell
docker compose -f deploy/docker-compose.prod.yml exec mongodb mongosh -u admin -p

# Check connection from backend
docker compose -f deploy/docker-compose.prod.yml exec backend curl mongodb:27017
```

### Backend Not Responding

```bash
# Check backend logs
docker compose -f deploy/docker-compose.prod.yml logs backend

# Check health endpoint
curl http://localhost:8001/api/health

# Restart backend
docker compose -f deploy/docker-compose.prod.yml restart backend
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Clean up
docker system prune -a --volumes
```

### GitHub Actions Deployment Fails

```bash
# Check SSH access
ssh deploy@your-server-ip

# Check SSH key permissions on server
ls -la ~/.ssh/
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# Check if GitHub Actions can connect
# View logs in GitHub Actions tab
```

### Performance Issues

```bash
# Check resource usage
htop
docker stats

# Check logs for errors
docker compose -f deploy/docker-compose.prod.yml logs --tail=100

# Optimize MongoDB
docker compose -f deploy/docker-compose.prod.yml exec mongodb mongosh
> db.stats()
> db.collection.stats()
```

---

## Security Best Practices

1. **Change default passwords** - Always use strong, unique passwords
2. **Keep system updated** - Regularly update OS and Docker
3. **Use SSH keys** - Disable password authentication
4. **Enable firewall** - Only open necessary ports
5. **Regular backups** - Automate and test backups
6. **Monitor logs** - Set up log monitoring and alerts
7. **Use HTTPS** - Always use SSL/TLS in production
8. **Limit access** - Use principle of least privilege
9. **Update dependencies** - Keep application dependencies updated
10. **Use secrets** - Never commit secrets to Git

---

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [MongoDB Production Notes](https://www.mongodb.com/docs/manual/administration/production-notes/)

---

## Support

For issues specific to this deployment:
1. Check the logs: `docker compose logs`
2. Review this documentation
3. Check GitHub Issues
4. Contact the development team

---

**Last Updated**: February 2025
