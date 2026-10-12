#!/usr/bin/env bash
# Starts the project-local, low-memory MySQL instance (port 3307). No Docker needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CNF="$ROOT/.local/mysql/my.cnf"
MYSQLD="$(command -v mysqld || echo /opt/homebrew/opt/mysql/bin/mysqld)"
mkdir -p "$ROOT/.local/mysql/data"
# regenerate datadir path in case the folder was moved
sed -i.bak "s#^datadir=.*#datadir=$ROOT/.local/mysql/data#; s#^socket=.*#socket=$ROOT/.local/mysql/mysql.sock#; s#^pid-file=.*#pid-file=$ROOT/.local/mysql/mysql.pid#; s#^log-error=.*#log-error=$ROOT/.local/mysql/mysql.err#" "$CNF" && rm -f "$CNF.bak"
if [ ! -d "$ROOT/.local/mysql/data/mysql" ]; then
  echo "Initialising local MySQL data directory..."
  "$MYSQLD" --defaults-file="$CNF" --initialize-insecure
fi
if [ -S "$ROOT/.local/mysql/mysql.sock" ] && mysqladmin --socket="$ROOT/.local/mysql/mysql.sock" -uroot ping >/dev/null 2>&1; then
  echo "MySQL already running on :3307"; exit 0
fi
nohup "$MYSQLD" --defaults-file="$CNF" >/dev/null 2>&1 &
for i in $(seq 1 40); do
  if mysqladmin --socket="$ROOT/.local/mysql/mysql.sock" -uroot ping >/dev/null 2>&1; then
    echo "MySQL ready on 127.0.0.1:3307"; break
  fi
  sleep 1
done
mysql --socket="$ROOT/.local/mysql/mysql.sock" -uroot <<SQL
CREATE DATABASE IF NOT EXISTS cevi CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS cevi_test CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'cevi'@'127.0.0.1' IDENTIFIED BY 'cevi_local_dev_pw';
CREATE USER IF NOT EXISTS 'cevi'@'localhost' IDENTIFIED BY 'cevi_local_dev_pw';
GRANT ALL PRIVILEGES ON cevi.* TO 'cevi'@'127.0.0.1';
GRANT ALL PRIVILEGES ON cevi_test.* TO 'cevi'@'127.0.0.1';
GRANT ALL PRIVILEGES ON cevi.* TO 'cevi'@'localhost';
GRANT ALL PRIVILEGES ON cevi_test.* TO 'cevi'@'localhost';
-- Prisma migrate needs to create a shadow database
GRANT ALL PRIVILEGES ON \`prisma\_migrate\_shadow\_db%\`.* TO 'cevi'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`prisma\_migrate\_shadow\_db%\`.* TO 'cevi'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "Databases cevi / cevi_test ready."
