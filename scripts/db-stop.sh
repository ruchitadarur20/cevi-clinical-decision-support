#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mysqladmin --socket="$ROOT/.local/mysql/mysql.sock" -uroot shutdown && echo "MySQL stopped."
