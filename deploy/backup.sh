#!/bin/sh
# Backup of the database and the document volumes into ./backups (run in the folder with docker-compose.yml).
# Usage: ./backup.sh        (e.g. daily via the Synology Task Scheduler)
set -e
cd "$(dirname "$0")"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
docker compose exec -T postgres pg_dump -U meisterwerk -Fc meisterwerk > "backups/db-$STAMP.dump"
# the GoBD archive and uploads: tar from the named volumes
for VOLUME in storage uploads; do
  docker run --rm -v "meisterwerk_$VOLUME:/data:ro" -v "$PWD/backups:/backup" alpine tar czf "/backup/$VOLUME-$STAMP.tgz" -C /data .
done
# keep the last 14 days
find backups -type f -mtime +14 -delete
echo "Backup written to backups/*-$STAMP.*"
