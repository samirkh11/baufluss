#!/bin/sh
# Applies pending database migrations, then starts the command (the API server by default).
set -e
echo "Applying database migrations ..."
npx prisma migrate deploy
exec "$@"
