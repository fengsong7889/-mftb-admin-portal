# 后端服务重启指南

> 本文档详细说明后端服务的重启策略，帮助开发者和 AI Agent 选择最高效的重启方式。
> 配套脚本：`backend/restart-service.sh`
> 快速参考：`AGENTS.md` → 「后端重启策略」章节

---

## 一、为什么需要增量重启？

| 启动方式 | 耗时 | 说明 |
|---------|------|------|
| `mvn spring-boot:run`（旧方式） | 2~3 分钟 | **每次都重新编译**，包括依赖解析、源码编译、打包 |
| `java -jar target/mftb-admin.jar`（新方式） | 30~60 秒 | **跳过编译**，直接跑已有 JAR |

后端启动慢的三大瓶颈：

1. **Maven 编译**：每次 `mvn spring-boot:run` 都重新编译全部源码（~40-90 秒）
2. **远程数据库延迟**：20+ 个 `CommandLineRunner` 启动时逐个查询 `sys_schema_version`，每次查询都是远程 DB 网络往返
3. **初始化器数量**：`DataInitializer`、`BizDataInitializer`、`EamSchemaMigrationInitializer` 等 ~20 个初始化器

增量重启的核心思路：**只在代码变更时重新编译，平时直接跑 JAR**。

---

## 二、决策树

```text
需要重启？
├─ 否 → 无需操作
└─ 是 → 检查变更类型
    │
    ├─ pom.xml 变更（新增/升级依赖）
    │   └─ 必须 --rebuild
    │
    ├─ application.yml / application-*.yml 变更
    │   └─ 必须 --rebuild
    │
    ├─ Java 源码变更（Service/Controller/DTO/Entity 等）
    │   └─ 需要 --rebuild（JAR 是旧编译产物）
    │
    ├─ 未变更（仅重启调试运行中服务）
    │   └─ 用 --fast
    │
    └─ 不确定
        └─ 先 bash restart-service.sh（自动检测）
           或先 --fast，观察日志确认行为是否包含本次修改
```

---

## 三、各命令详解

### 3.1 `bash restart-service.sh --fast`（最快）

**适用场景**：
- 未修改任何代码，只是想重启服务（例如进程卡死、端口被占用）
- 上次 `--rebuild` 后已编译好 JAR，本次仅需重启
- 调试运行中服务，需要快速重启

**执行流程**：
1. 停止端口 8080 上的旧进程
2. 直接运行 `target/mftb-admin.jar`（不编译）
3. 等待 HTTP 200 响应（最多 90 秒）

**耗时**：~20-30 秒（取决于 Spring 容器初始化和 DB 迁移检查）

**注意**：如果 JAR 不存在（首次使用），脚本会自动编译。

### 3.2 `bash restart-service.sh --rebuild`（代码变更后）

**适用场景**：
- 修改了任何 Java 源码（`*.java`）
- 修改了 `pom.xml`（依赖变更）
- 修改了 `application.yml`（配置变更）
- 不确定变更类型，需要安全起见重新编译

**执行流程**：
1. 停止旧进程
2. `mvn package -DskipTests -q`（编译 JAR，跳过测试）
3. 运行新 JAR
4. 等待 HTTP 200

**耗时**：~60-90 秒（编译 ~30-40 秒 + 启动 ~30-50 秒）

### 3.3 `bash restart-service.sh`（无参数，自动检测）

**适用场景**：
- 不确定变更了什么，让脚本自动判断
- AI Agent 执行重启任务时的默认选择

**执行流程**：
1. 通过 `git diff` 检测变更类型
2. 根据变更类型自动选择 `--fast` 或 `--rebuild`
3. 若 `target/mftb-admin.jar` 不存在，自动编译

### 3.4 `bash restart-service.sh --stop`（仅停止）

**适用场景**：
- 想手动停止后端服务
- 端口被占用需要释放
- 调试结束后关闭服务

**执行流程**：
1. 优先通过 PID 文件优雅停止（`kill`，等待 10 秒）
2. 兜底通过端口查找并强制终止（`kill -9`）

### 3.5 `bash restart-service.sh --status`（查看状态）

**适用场景**：
- 确认后端是否在运行
- 检查端口和 HTTP 状态
- 查看 JAR 编译时间

### 3.6 `bash restart-service.sh --full`（全量启动）

**适用场景**：
- 需要完整 Maven 生命周期（如排查编译问题）
- 首次拉取代码后的首次启动
- `restart-service.sh` 编译失败需要看完整 Maven 输出

**等效于**：`bash run-local.sh`（`mvn spring-boot:run`，前台运行，阻塞终端）

---

## 四、各变更类型对照表

| 变更类型 | 命令 | 原因 |
|---------|------|------|
| 纯 Java 业务逻辑（Service/Controller/DTO） | `--rebuild` | JAR 是旧编译产物，需重新打包 |
| Entity / Mapper 接口变更 | `--rebuild` | 同上 |
| `pom.xml` 新增/升级依赖 | `--rebuild` | 依赖变更必须重新解析 |
| `application.yml` 配置变更 | `--rebuild` | 配置打包进 JAR |
| 未变更，仅重启 | `--fast` | 跳过编译，最快 |
| SQL 脚本变更（`backend/sql/`） | `--rebuild` | SQL 脚本打包进 JAR resources |
| 不确定 | 无参数自动检测 | 脚本会分析 git diff |

---

## 五、启动失败排查

### 5.1 编译失败

```bash
# 查看完整 Maven 输出
cd backend && mvn package -DskipTests

# 常见原因：
# - JDK 版本不对（必须是 17）
# - Maven 不在 PATH（脚本已配置 $HOME/apache-maven-3.9.6）
# - 依赖下载失败（网络问题）
```

### 5.2 启动失败（JAR 运行后崩溃）

```bash
# 查看日志末尾
tail -50 backend/backend-service.log

# 常见原因：
# - 端口 8080 被占用（脚本会自动 kill，但可能有残留）
# - 数据库连接失败（检查网络 / 环境变量）
# - CommandLineRunner 迁移逻辑报错（查看日志中的异常堆栈）
```

### 5.3 启动成功但行为异常

```bash
# 检查日志确认 CommandLineRunner 执行情况
grep -E '(初始化|迁移|就绪|失败)' backend/backend-service.log

# 如果本次修改未生效，说明 JAR 是旧的，需要 --rebuild
bash restart-service.sh --rebuild
```

---

## 六、高级选项：懒初始化

Spring Boot 支持懒初始化（Bean 延迟到首次使用时创建），可缩短启动时间。

**开启方式**：

```bash
# 方式 1：启动时传环境变量
SPRING_LAZY_INIT=true bash restart-service.sh --fast

# 方式 2：修改 application.yml 默认值（不推荐，影响所有人）
```

**注意事项**：
- `CommandLineRunner`（DataInitializer 等迁移逻辑）**不受此开关影响**，仍会在启动时执行
- 懒初始化可能改变 Bean 创建顺序时序，**默认不开启**
- 仅作为高级选项，在确认无副作用后可按需使用

---

## 七、脚本文件清单

| 文件 | 用途 |
|------|------|
| `backend/restart-service.sh` | 增量重启脚本（本文档配套） |
| `backend/run-local.sh` | 全量启动脚本（旧方式，`mvn spring-boot:run`） |
| `backend/run-local-mem.sh` | 全量启动 + 内存参数（`-Xmx2g -Xms1g`） |
| `backend/backend-service.log` | 增量重启脚本的日志文件 |
| `backend/.backend.pid` | 增量重启脚本的 PID 记录文件 |

---

## 八、FAQ

**Q：首次使用 `restart-service.sh` 会怎样？**
A：如果 `target/mftb-admin.jar` 不存在，脚本会自动执行 `mvn package -DskipTests` 编译 JAR，然后启动。后续重启根据变更类型选择是否重新编译。

**Q：`--fast` 启动后发现代码修改没生效？**
A：说明 JAR 是旧编译产物。改用 `--rebuild` 重新编译后再启动。

**Q：编译失败但 `run-local.sh` 能成功？**
A：`run-local.sh` 使用 `mvn spring-boot:run` 直接运行源码（不生成 JAR），编译错误会直接输出到终端。`restart-service.sh --rebuild` 使用 `mvn package -DskipTests -q`，错误可能被 `-q` 静默。遇到编译问题可改用 `--full` 看完整输出。

**Q：为什么不用 Spring Boot DevTools 热重载？**
A：DevTools 适合纯 Spring Boot 项目，但本项目的启动瓶颈在 20+ 个 `CommandLineRunner` 迁移逻辑（远程 DB 查询），热重载无法跳过这些初始化步骤。JAR 模式跳过编译是最大收益。

**Q：AI Agent 重启后端时应该用什么命令？**
A：默认使用 `bash restart-service.sh`（自动检测）。如果明确知道改了 Java 代码，用 `--rebuild`。如果仅重启，用 `--fast`。详见 `AGENTS.md` → 「后端重启策略」。
