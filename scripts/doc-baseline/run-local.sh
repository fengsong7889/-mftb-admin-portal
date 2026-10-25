#!/bin/bash
# 本地基线重放：从 backend/.env.replay.local 读取测试库连接，重置目标库并执行完整门禁。
# 用法：bash scripts/doc-baseline/run-local.sh [--skip-backup]
set -euo pipefail
cd "$(dirname "$0")/../.." || exit 1

ENV_FILE=backend/.env.replay.local
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE；请先配置 REPLAY_DB_URL/REPLAY_DB_USERNAME/REPLAY_DB_PASSWORD" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export BASELINE_TARGET_DB_URL="${REPLAY_DB_URL:?缺少 REPLAY_DB_URL}"
export BASELINE_TARGET_DB_USERNAME="${REPLAY_DB_USERNAME:?缺少 REPLAY_DB_USERNAME}"
export BASELINE_TARGET_DB_PASSWORD="${REPLAY_DB_PASSWORD:-}"

JAR="${BASELINE_JAR:-}"
if [ -z "$JAR" ]; then
  JAR=backend/target/mftb-admin.jar
fi
if [ ! -f "$JAR" ]; then
  echo "缺少 JAR: $JAR；先执行 mvn -Dmaven.test.skip=true package -f backend/pom.xml" >&2
  exit 1
fi
if [ -z "${JAVA_HOME:-}" ]; then
  echo "未设置 JAVA_HOME；请指向 JDK 17" >&2
  exit 1
fi

exec python3 scripts/doc-baseline/replay_check.py --allow-reset --jar "$JAR" "$@"
