# 文档中心基线重放门禁

用于验证「当前 schema 基线 + 最小配置种子」能在隔离库启动、二次启动幂等、备份恢复后再启动。

## 1. 刷新基线

基线由当前数据库结构 + 配置种子生成，**不含用户、业务数据和敏感配置值**：

```bash
set -a; source backend/.env.local; set +a
python3 scripts/doc-baseline/refresh_baseline.py
```

生成：

- `backend/sql/baseline/doc_baseline_schema.sql`：348+ 张表结构
- `backend/sql/baseline/doc_baseline_seed.sql`：菜单/角色/部门/迁移版本/编号规则等配置种子
- `backend/sql/baseline/doc_baseline_translation.sql.gz`：翻译语料（避免 CI 启动时逐行同步 8000+ 条）

来源库连接只读环境变量：`BASELINE_SOURCE_DB_URL/USERNAME/PASSWORD`，未设置时回落 `DB_URL/USERNAME/PASSWORD`。

## 2. 本地重放

```bash
bash scripts/doc-baseline/run-local.sh              # 完整：两次启动 + 备份恢复 + 再启动
bash scripts/doc-baseline/run-local.sh --skip-backup # 只验证两次启动
```

脚本会从 `backend/.env.replay.local` 读取 `REPLAY_DB_*`，要求已设置 `JAVA_HOME`，并默认使用 `backend/target/mftb-admin.jar`（可用 `BASELINE_JAR` 覆盖）。

也可以手工指定：

```bash
set -a; source backend/.env.replay.local; set +a
export BASELINE_TARGET_DB_URL="$REPLAY_DB_URL"
export BASELINE_TARGET_DB_USERNAME="$REPLAY_DB_USERNAME"
export BASELINE_TARGET_DB_PASSWORD="$REPLAY_DB_PASSWORD"
export JAVA_HOME=/path/to/jdk-17
python3 scripts/doc-baseline/replay_check.py --allow-reset --jar backend/target/mftb-admin.jar
```

安全约束：

- 必须显式 `--allow-reset`
- 目标库名不能是 `fengsong`，只允许含 `test` / `baseline` / `replay`
- 不含凭据；数据库连接只从环境变量读取

输出：`$TMPDIR/doc-baseline/summary.json`，包含表数、迁移版本数、两次启动耗时、备份行数、恢复差异。

## 3. CI

`.github/workflows/doc-baseline-replay.yml` 使用 MySQL 8.4 service：

1. 导入 schema + seed + translation
2. 启动应用 → `/api/health/ready` 200
3. 二次启动 → 表数/版本数不变
4. 全库备份 → 清空 → 恢复 → 行数 0 差异
5. 恢复后再次启动 → ready 200
6. 上传 `summary.json` 与日志

触发范围：基线 SQL、`scripts/doc-baseline/**`、后端 config/application.yml、工作流自身。

## 4. 边界

- 这是「当前 schema 基线」重放，不是「只有 5 张基表的裸库自建」。裸库自建仍缺完整 baseline，属于后续工程债。
- 基线会随 schema 变化而更新；后端新增表/列后请重新执行 `refresh_baseline.py` 并提交三个基线文件。
- 测试库无用户/业务数据；如需登录 UI，请另行创建测试账号。
