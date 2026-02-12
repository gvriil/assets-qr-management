#!/bin/bash
# ==============================================
# Inventory System - Backup Script
# ==============================================
# Run daily via cron: 0 2 * * * /path/to/backup.sh
# ==============================================

set -e

# Configuration
BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="inventory-mongodb"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# Backup MongoDB
docker exec $CONTAINER_NAME mongodump \
    --username=$MONGO_ROOT_USER \
    --password=$MONGO_ROOT_PASSWORD \
    --authenticationDatabase=admin \
    --db=inventory \
    --out=/backups/dump_$DATE

# Compress backup
cd $BACKUP_DIR
tar -czf backup_$DATE.tar.gz dump_$DATE
rm -rf dump_$DATE

echo "[$(date)] Backup created: backup_$DATE.tar.gz"

# Remove old backups
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Old backups cleaned up (older than $RETENTION_DAYS days)"

# Optional: Upload to S3 or remote storage
# aws s3 cp $BACKUP_DIR/backup_$DATE.tar.gz s3://your-bucket/backups/

echo "[$(date)] Backup completed successfully"
