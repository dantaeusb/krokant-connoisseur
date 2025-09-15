#!/bin/bash
set -euo pipefail

if [ -z "${MONGO_BOT_USER:-}" ] || [ -z "${MONGO_BOT_PASSWORD:-}" ]; then
  echo "[bot-init] MONGO_BOT_USER or MONGO_BOT_PASSWORD not set; skipping user creation." >&2
  exit 0
fi

q_MONGO_USER=$(jq --arg v "$MONGO_BOT_USER" -n '$v')
q_MONGO_PASSWORD=$(jq --arg v "$MONGO_BOT_PASSWORD" -n '$v')

mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" admin <<EOF
    use bot;
    db.createUser({
        user: $q_MONGO_USER,
        pwd: $q_MONGO_PASSWORD,
        roles: [ { role: "readWrite", db: "bot" } ],
    });
EOF


