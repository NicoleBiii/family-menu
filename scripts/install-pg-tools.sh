#!/usr/bin/env bash
# Installs PostgreSQL client tools of one major version (and age when asked) on an Ubuntu CI
# runner from the PostgreSQL project's apt repository, then prints their bin directory.
# Usage: scripts/install-pg-tools.sh <major> [age]
set -euo pipefail
major="$1"
[[ "$major" =~ ^[0-9]+$ ]] || { echo "PostgreSQL major version expected." >&2; exit 1; }
extra=()
[[ "${2:-}" == "age" ]] && extra+=(age)
sudo apt-get update -qq >&2
sudo apt-get install -y -qq postgresql-common "${extra[@]}" >&2
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >&2
sudo apt-get install -y -qq "postgresql-client-${major}" >&2
echo "/usr/lib/postgresql/${major}/bin"
