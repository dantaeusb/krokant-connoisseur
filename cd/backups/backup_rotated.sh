#!/bin/bash

# ---
# HOW TO USE:
# backup_rotated.sh <database_name> <mongodb_uri>
#
# EXAMPLE:
# backup_rotated.sh my_database "mongodb://user:password@localhost:27017"
# ---

# ---
# HOW TO RESTORE:
# mongorestore --uri="<mongodb_uri>" --db="<database_name>" --archive="<backup_file>.gz" --gzip
#
# EXAMPLE:
# mongorestore --uri="mongodb://user:password@localhost:27017" --db="my_database" --archive="/var/backups/mongodb/daily/my_database-2025-12-02.gz" --gzip
# ---

# ---
# CONFIGURATION
# ---

MONGO_URI=$1
DB_NAME=$2
BACKUP_DIR=$3

if [ -z "$DB_NAME" ] || [ -z "$MONGO_URI" ] || [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <mongodb_uri> <database_name> <backup_directory>"
    exit 1
fi

# Number of daily and weekly backups to keep
DAILY_BACKUPS=7
WEEKLY_BACKUPS=4

echo "Creating backup directory if it doesn't exist..."

mkdir -p "$BACKUP_DIR/daily"
mkdir -p "$BACKUP_DIR/weekly"

DATE=$(date +"%Y-%m-%d")
DAY_OF_WEEK=$(date +"%u") # 1 for Monday, 7 for Sunday

echo "Creating daily backup..."
# Create daily backup
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --archive="$BACKUP_DIR/daily/$DB_NAME-$DATE.gz" --gzip

# If it's Sunday, create a weekly backup
if [ "$DAY_OF_WEEK" -eq 7 ]; then
  echo "Creating weekly backup..."
  cp "$BACKUP_DIR/daily/$DB_NAME-$DATE.gz" "$BACKUP_DIR/weekly/$DB_NAME-weekly-$DATE.gz"
fi

echo "Rotating daily backups..."
# Rotate daily backups
find "$BACKUP_DIR/daily" -type f -name "*.gz" -mtime +$DAILY_BACKUPS -delete

echo "Rotating weekly backups..."
# Rotate weekly backups
find "$BACKUP_DIR/weekly" -type f -name "*.gz" -mtime +$(($WEEKLY_BACKUPS * 7)) -delete

echo "Backup and rotation complete."

