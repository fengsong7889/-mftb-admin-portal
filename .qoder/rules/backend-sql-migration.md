---
description: 后端 SQL 与迁移规范（强制标准）。涵盖 MySQL 方言约束、SQL 迁移文件管理、Java 迁移代码规范、就绪与发布门禁。编写后端 SQL 或迁移代码时必须遵循。
globs:
  - "backend/**/*.java"
  - "backend/sql/**/*.sql"
  - "backend/**/*.yml"
alwaysApply: false
---

### 后端 SQL 规范 ⚠️ 强制标准

> 本项目数据库为 **MySQL 8.x**，所有 SQL 脚本和 Java 内嵌 SQL 必须遵守以下约束。

#### 1. MySQL 方言约束（禁止 PostgreSQL 语法）

| 场景 | ✅ MySQL 正确写法 | ❌ 禁止写法（PostgreSQL 专有） |
|------|------------------|-------------------------------|
| 加列前检查存在 | 先查 `INFORMATION_SCHEMA.COLUMNS`，不存在再 `ADD COLUMN` | `ADD COLUMN IF NOT EXISTS ...` |
| 加表前检查存在 | `CREATE TABLE IF NOT EXISTS ...`（MySQL 支持） | — |
| 字符串拼接 | `CONCAT(a, b)` | `a \|\| b` |
| 布尔值 | `1` / `0` | `TRUE` / `FALSE` 作为字面量（MySQL 虽兼容但语义为整数） |
| UPSERT | `INSERT ... ON DUPLICATE KEY UPDATE ...` | `INSERT ... ON CONFLICT ... DO UPDATE`（PostgreSQL） |
| JSON 字段 | `JSON_EXTRACT()` / `->>` 操作符 | `jsonb` 类型或 `@>` 操作符 |
| 自增主键 | `BIGINT AUTO_INCREMENT` | `BIGSERIAL` / `IDENTITY` |
| LIMIT 语法 | `SELECT ... LIMIT n` | `SELECT ... FETCH FIRST n ROWS ONLY` |

**加列标准模板**（Java 迁移代码中必须遵循）：

```java
// ✅ 正确：先查 INFORMATION_SCHEMA，再决定是否加列
Integer colExists = jdbcTemplate.queryForObject(
    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
    + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '表名' AND COLUMN_NAME = '列名'",
    Integer.class
);
if (colExists != null && colExists == 0) {
    jdbcTemplate.execute("ALTER TABLE 表名 ADD COLUMN 列名 VARCHAR(255) DEFAULT NULL COMMENT '说明'");
}
```

```sql
-- ✅ SQL 脚本中可直接 ALTER（脚本本身是一次性参考文档）
ALTER TABLE 表名 ADD COLUMN 列名 VARCHAR(255) DEFAULT NULL COMMENT '说明';
```

#### 2. SQL 迁移文件管理

| 规则 | 说明 |
|------|------|
| 存放位置 | `backend/sql/` 目录 |
| 命名格式 | `{序号}_{简短描述}.sql`，如 `174_eam_asset_accessories.sql` |
| 序号递增 | 查看现有最大序号，新文件 +1（避免冲突） |
| 文件头注释 | 必须包含用途说明，如 `-- 174: 资产台账新增配件清单字段` |
| 幂等性 | SQL 脚本为**一次性参考文档**，实际幂等保证由 Java 迁移代码负责 |
| 禁止破坏性操作 | 生产环境禁止 `DROP TABLE` / `DROP COLUMN` / `TRUNCATE`，仅允许 `ADD` / `MODIFY` / `UPDATE` |

#### 3. Java 迁移代码规范（兼容式治理 · 强制）

> 本项目已建立统一的迁移治理框架 `com.mftb.admin.config.migration`，解决"生产库迁移反复漏执行"。
> 所有新增迁移必须遵循以下标准，不再把"某个初始化器"当唯一入口。

- **登记先行**：任何启动期自动迁移，必须先在 `backend/src/main/resources/db/migrations/catalog.json` 登记
  （`versionKey` / `module` / `phase` / `executionType` / `executor`|`resource` / `status` / `dependencies`）。
  未登记的脚本不参与自动执行；`backend/sql/` 下的历史文件仅为参考文档。CI 会校验清单一致性（唯一键、依赖存在且无环、资源已打包）。
- **迁移入口按模块就近**：放在对应模块的初始化器（如广告 → `AdPromotionDataInitializer`、EAM → `EamSchemaMigrationInitializer`）。`@Order` 决定阶段顺序（`SchemaPhase`）。
- **幂等 + 后置校验**：结构类迁移**必须**用带校验的重载 `SchemaVersionTracker.applyOnce(versionKey, task, verify)`，
  `verify` 校验表/列确实就绪；**只有任务与校验都成功才记录成功版本**。校验失败 → 不记录、写 `sys_schema_migration_log` 失败审计、下次启动重试。
- **严禁吞异常**：结构迁移的补列/建表辅助方法**不得** `catch(Exception){log.warn}` 后继续——失败必须抛出，
  否则会被误记为"已迁移"。（历史事故：金字招牌 `addColumnIfAbsent` 吞异常导致生产缺列。）
- **关键结构登记契约**：为事故相关/关键写入路径的表在 `ContractRegistry` 登记 `ContractSpec`（含可自愈的 CREATE/ADD DDL）。
  `SchemaContractValidator` **每次启动**（不受 `applyOnce` 门控）在迁移命名锁内自愈并复核，通过后置就绪位；
  `SCHEMA_STRICT=true`（生产）时残余漂移将中止启动。
- **versionKey 命名**：`{module}:{step}-v{major}.{minor}`；内容变更必须递增版本，不复用旧 key（被取代的旧键在 catalog 标 `SUPERSEDED` 并用新版本键重跑）。
- **并发保护**：多副本启动由 `MigrationLock`（MySQL `GET_LOCK`，独占连接）串行化自愈 DDL。
- **日志/审计**：迁移开始结束打印 `log.info()`；执行结果落 `sys_schema_migration_log`。
- **只读预检**：发布前可用 `java -jar app.jar --schema.check-only=true` 做免写结构校验（退出码 0=就绪 / 2=漂移）。

```java
// ✅ 正确：登记 + 带后置校验 + 不吞异常
versionTracker.applyOnce("adpromo:xxx:v2", this::doMigration, this::verifyMigration);

private void doMigration() {
    addColumnIfAbsent("t", "c", "ALTER TABLE t ADD COLUMN c ..."); // 失败抛出，不 catch
}
private void verifyMigration() {
    if (!columnExists("t", "c")) throw new IllegalStateException("列 c 未就绪");
}
```

```java
// ❌ 禁止：吞异常会使 applyOnce 误记成功，下次启动不再重试
try { jdbcTemplate.execute("ALTER TABLE ..."); } catch (Exception e) { log.warn("失败:{}", e); }
```

#### 4. 就绪与发布门禁

- **就绪探针** `/api/health/ready`（匿名）：迁移 + 契约校验通过才 200，否则 503；K8s readiness 据此切流。
- **存活探针** `/api/health/live`：进程/容器存活即 200，不因数据库瞬时故障反复重启。
- **CI 门禁**：`backend-docker.yml` 真实执行 `mvn test`（含迁移框架单测），并断言 `catalog.json` 及被登记 SQL 已打进镜像。
- **生产发布**：`SCHEMA_STRICT=true` + `maxUnavailable: 0`，未就绪实例不接流量、迁移失败保留旧版本。


#### 5. 常见踩坑记录

| 问题 | 原因 | 正确做法 |
|------|------|----------|
| `ADD COLUMN IF NOT EXISTS` 报语法错误 | MySQL 不支持此语法（PostgreSQL 专有） | 先查 `INFORMATION_SCHEMA.COLUMNS` 再 `ADD COLUMN` |
| `UPDATE ... JOIN ... LIMIT` 报错 | MySQL 多表 UPDATE 不支持 LIMIT | 用子查询替代，或分步执行 |
| `ALTER TABLE` 后列未生效 | 连接池缓存旧 schema | 迁移后无需特殊处理，新连接自动生效 |
| 迁移重复执行报错 | 未使用 `applyOnce` 保护 | 所有迁移必须注册 `versionKey` |
| JSON 字段查询返回 null | 字段值为字符串 `"null"` 而非 JSON null | 查询时加 `IS NOT NULL AND != 'null'` 条件 |
| **迁移记成功但生产缺表/缺列** | 补列/建表**吞异常**，或 SQL 未进镜像 | 用 `applyOnce(key,task,verify)` 后置校验 + 不吞异常 + 关键表登记 `ContractRegistry` 契约每次启动自愈 |
