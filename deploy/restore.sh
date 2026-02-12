#!/bin/bash
# ==============================================
# Inventory System - Restore Script
# ==============================================
# Usage: ./restore.sh backup_YYYYMMDD_HHMMSS.tar.gz
# ==============================================

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    echo "Available backups:"
    ls -la /backups/*.tar.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE=$1
CONTAINER_NAME="inventory-mongodb"
BACKUP_DIR="/backups"
TEMP_DIR="/tmp/restore_$$"

echo "[$(date)] Starting restore from $BACKUP_FILE..."

# Create temp directory
mkdir -p $TEMP_DIR

# Extract backup
tar -xzf $BACKUP_DIR/$BACKUP_FILE -C $TEMP_DIR

# Find the dump directory
DUMP_DIR=$(ls -d $TEMP_DIR/dump_* 2>/dev/null | head -1)

if [ -z "$DUMP_DIR" ]; then
    echo "Error: No dump directory found in backup"
    rm -rf $TEMP_DIR
    exit 1
fi

# Copy to container
docker cp $DUMP_DIR $CONTAINER_NAME:/tmp/restore_dump

# Restore MongoDB
docker exec $CONTAINER_NAME mongorestore \
    --username=$MONGO_ROOT_USER \
    --password=$MONGO_ROOT_PASSWORD \
    --authenticationDatabase=admin \
    --drop \
    /tmp/restore_dump/inventory

# Cleanup
docker exec $CONTAINER_NAME rm -rf /tmp/restore_dump
rm -rf $TEMP_DIR

echo "[$(date)] Restore completed successfully"
