# 本地开发环境参考手册

> 本文件记录项目本地运行所需的全部环境信息（Mock 降级、后端部署、数据库、工具链版本等）。
> 换电脑 / 重装环境 / 新人接手时，按本手册配置即可恢复本地开发，无需重新摸索。
> **维护约定**：环境信息有变动时，请同步更新本文件。

---

## 一、Mock 降级机制（仅限已登录会话期间的数据接口兜底）

项目实现了「后端不可用时部分业务数据接口自动降级到本地 Mock」的机制。

> ⚠️ **它不能让你跳过登录**。认证已全部收回后端（安全边界：禁止前端自授 admin 权限），
> 登录不存在任何 Mock 降级；后端未启动时前端会提示「無法連接後端服務」并停在登录页。
> 因此本节的实际用途是：**已登录会话期间后端短暂不可用/重启中时，页面不崩、不出现假成功**。
> 想在本地「完整跑通业务」必须自备后端 + 数据库（见第二、三节）。

### 1.1 降级触发条件

- 文件：`frontend/packages/platform-client/src/api/request.ts` 中的 `isBackendUnavailable(error)`
- 触发场景：网络异常（无响应）、HTTP 404、HTTP 5xx
- 不触发：后端返回的业务错误（如参数校验失败）会正常抛出

### 1.2 已接入 Mock 降级的接口（只给取真值的命令，不维护静态表）

静态表已腐化过一次（商户集团/门店的降级已收回真实接口，`merchantMock.ts` 现为无人引用的死文件）。
**要当前真值，跑这两条命令**：

```bash
# 哪些 api 文件带降级分支（这是「能降级」的权威口径）
grep -rl isBackendUnavailable frontend/packages/platform-client/src/api/*.ts | grep -v test

# 现存 mock 数据文件
ls frontend/packages/platform-client/src/api/mock/*.ts | grep -v '\.test\.'
```

两个集合**并不完全重合**（如 `eamCategory`/`eamSupplier` 有 mock 文件但调用方未接降级），
新增模块时以「api 文件里有 `isBackendUnavailable` 分支」为接入完成的判定。

> 登录 Mock 降级机制已彻底移除，当前实现以 `frontend/packages/platform-client/src/contexts/AuthContext.tsx`
> 为准（原 `src/contexts/AuthContext.tsx` 与 `VITE_ADMIN_PASSWORD` 环境变量机制已不存在）。
> 部分 api 路径已从 `src/` 迁至 `frontend/packages/platform-client/src/`，旧路径不存在。

### 1.3 新增模块接入 Mock 的标准步骤

1. 在 `frontend/packages/platform-client/src/api/mock/` 下新建 `xxxMock.ts`，实现与后端接口同名的 mock 函数（基于 localStorage + 种子数据）
2. 在 `frontend/packages/platform-client/src/api/xxx.ts` 中每个接口函数加 try/catch，用 `isBackendUnavailable(err)` 判断后降级
3. 所有请求带 `SILENT_HEADER` 静默头，避免降级时弹全局错误提示

### 1.4 Mock 数据存储位置

- 全部存于浏览器 `localStorage`，key 前缀 `mftb_mock_`
- 清除浏览器数据会重置为种子数据（首次访问自动初始化）
- 种子数据定义在各 mock 文件的 `SEED_*` 常量中

### 1.5 本地登录凭据

> ❌ **不存在「Mock 登录账号」**。历史上曾有 `MT0001`/`MT0002` 一对纯前端演示口令，
> 该机制已因安全边界问题删除（任何前端自授的 admin 会话都等于绕过鉴权）。
> 现在登录只能走后端，账号见第六节「后端登录（系统管理员）/（员工）」两行；
> 密码值**只写在本地 `backend/.env.local` 与交付记录里**，不得回显到本文件或任何入库文件。
>
> 未入库的 `quick-login-hack.js`（见 `.gitignore`）属同类风险，禁止在任何部署产物中携带。

---

## 二、后端服务部署信息

### 2.1 本地开发后端

| 项 | 值 |
|----|-----|
| 服务端口 | `8080` |
| 上下文路径 | `/`（根路径） |
| API 基础路径 | `/api`（前端 Vite proxy 代理） |
| 前端代理配置 | `vite.config.ts` → `server.proxy./api` → `http://localhost:8080` |
| 启动命令（本机） | `cd backend && bash run-local.sh`（自动设 JDK 17 + source `.env.local`） |
| 启动命令（新拉仓库） | `cd backend && mvn -pl bootstrap -am spring-boot:run`（需先自行 export 四个必填变量） |
| ⚠️ 脚本入库情况 | `backend/run-local.sh` 被 `backend/.gitignore` 忽略（历史上含凭据）；`restart-service.sh` / `restart-after-migration.sh` **已入库**且只从 `.env.local` 读变量，不带明文 |
| 启动类位置 | `backend/bootstrap/src/main/java/com/mftb/admin/MftbAdminApplication.java`；**在聚合根直接跑 `mvn spring-boot:run` 会因父 POM 无启动类而失败**，必须带 `-pl bootstrap -am` |
| Java 版本要求 | **JDK 17**（Lombok 与 Java 25 不兼容，必须用 17） |
| Maven 版本 | 3.9.x（推荐 3.9.6） |

### 2.2 生产环境后端

| 项 | 值 |
|----|-----|
| 部署平台 | Sealos |
| 公网地址 | `https://dacnhtyrpxhc.sealoshzh.site` |
| 镜像仓库 | GitHub Container Registry (`ghcr.io`) |
| 镜像名 | `ghcr.io/<owner>/mftb-admin-backend:latest` |
| 触发构建 | push 到 main 分支且 `backend/**` 有变更 |
| 工作流文件 | `.github/workflows/backend-docker.yml` |
| Docker 构建上下文 | `.`（仓库根目录，Dockerfile 路径 `backend/Dockerfile`） |
| 运行时额外依赖 | 镜像内安装 `git`（Alpine apk），并复制 `.git` 目录，供「版本管理 → 从 Git 同步」功能读取提交历史 |
| .dockerignore | 仓库根目录 `.dockerignore`（排除 node_modules/dist/target 等大目录，保留 `.git/`） |

### 2.3 后端关键配置（application.yml）

```yaml
# 数据库连接：无任何默认值，四项必须从环境变量注入（本地读 gitignore 的 backend/.env.local）
spring.datasource.url: ${DB_URL}&socketTimeout=15000&connectTimeout=10000
spring.datasource.username: ${DB_USERNAME}
spring.datasource.password: ${DB_PASSWORD}

# 生产环境由 Sealos 注入 DB_URL / DB_USERNAME / DB_PASSWORD 指向阿里云 RDS 生产库
# JWT 密钥（无默认值，必须外部注入；HS256 要求至少 32 字节）
jwt.secret: ${JWT_SECRET}
jwt.expiration: 86400000  # 24 小时

# AI 供应商 API Key 的静态加密密钥（无默认值；未注入时 ProviderKeyCipher 回退复用 ${jwt.secret}）
# 属性本身不在 application.yml 里声明，靠 Spring relaxed binding 读环境变量 AI_PROVIDER_CRYPTO_KEY
ai.provider.crypto-key: ${AI_PROVIDER_CRYPTO_KEY}
```

> ⚠️ **连接串完全由环境变量决定，仓内不内置任何可用数据库**：
> 不配 `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`/`JWT_SECRET` 四项，后端直接启动失败
> （`run-local.sh` 会先校验缺失项并报错退出）。这是有意设计：
> 拉代码不等于能跑，运行资产只走线下交付（见 README「代码 ≠ 可运行系统」）。
>
> ⚠️ **`JWT_SECRET` 与 `AI_PROVIDER_CRYPTO_KEY` 必须各自独立配置**：后者缺省时，
> AI 供应商 API Key 的 AES-256-GCM 加密会回退复用签名密钥，于是每次轮换 `JWT_SECRET`
> 都会让已入库的 `ai_provider.api_key` 全部解不开（2026-10-31 实测事故）。
> 启动日志出现「未独立配置…当前复用 JWT_SECRET」即为此状态，见 Q6。
>
> ⚠️ **`DB_URL` 格式硬约束**：必须已带查询参数（`?useUnicode=true&...`），
> 因为 yml 是 `${DB_URL}&socketTimeout=...` 字面拼接——末尾无 `?` 参数时会拼出非法连接串。
> 可直接参照 `backend/.env.local.example` 第 10 行的模板格式。
>
> ℹ️ 历史上确曾把 SQLPub 开发库写进 `application.yml` 默认值（已移除）；
> 网上/旧文档里「无需设置环境变量直接启动」的说法均已失效。

### 2.4 数据库迁移治理与发布验收（兼容式）

生产环境反复出现“迁移未执行导致保存报数据库异常”，已建立统一治理机制：

| 机制 | 说明 |
|------|------|
| 迁移登记表 | `backend/src/main/resources/db/migrations/catalog.json`，登记所有启动期自动迁移；CI 校验唯一键/依赖/资源已打包 |
| 后置校验执行 | `SchemaVersionTracker.applyOnce(key, task, verify)`：任务 + 校验都成功才记成功版本，失败写审计 `sys_schema_migration_log` 并下次重试 |
| 每次启动契约自愈 | `SchemaContractValidator` 不受版本门控，关键表缺表/缺列在迁移命名锁内自愈并复核 |
| 就绪探针 | `GET /api/health/ready`（匿名）：迁移 + 契约通过返回 200，否则 503 |
| 存活探针 | `GET /api/health/live`（匿名）：进程存活即 200 |
| 只读预检 | `java -jar app.jar --schema.check-only=true`，退出码 0=就绪 / 2=漂移 |

**生产环境变量（Sealos 注入）**：

```text
SCHEMA_STRICT=true      # 存在无法自愈的结构漂移时中止启动（配合 maxUnavailable:0，旧实例继续服务）
APP_BUILD_TAG=<git-sha> # 迁移审计表记录本次部署版本，便于追溯
```

**会议 AI 整理纪要（试点）——环境级上限开关**：`MEETING_MINUTES_AI_ENABLED`（映射 `meeting.minutes.ai-enabled`，默认 `true`）。它只是环境级上限：显式 `false` 会整体禁用会议 AI（优先级高于管理台开关，用于联调/灰度/紧急降级）；`true` 既不代表场景已启用、也不代表员工已授权。日常启停在「AI 操作授权 · 业务 AI 场景」页管理（`ai_scene_config` 表，默认停用），员工权限在「授权中心」按 `meeting-my/booking/record` 的 `edit` + `ai_minutes` 成对授予。改此环境变量需重启后端生效。

**发布验收**（凭据通过环境变量注入，脚本不落盘任何密钥）：

```bash
BASE_URL=https://dacnhtyrpxhc.sealoshzh.site \
VERIFY_USER=<最小权限账号> VERIFY_PASS=<密码> \
bash scripts/verify-deploy.sh   # 先校验 ready 探针，再断言关键接口业务码，任一失败非零退出
```

**无凭据快速探测**（改完环境变量但不想动账号口令时，先跑这个）：

```bash
bash scripts/verify-sealos-env.sh   # 只发匿名请求，5 项全过退出 0；任一项失败退出 1
```

它与 `verify-deploy.sh` 的分工：

| 脚本 | 需要凭据 | 验证内容 |
|------|:---:|---------|
| `verify-sealos-env.sh` | 否 | live/ready 探针、前端来源 CORS 预检放行且精确回显 `access-control-allow-origin`、**非白名单来源必须 403**（防 CORS 退化成 `*`）、未认证请求必须 401 |
| `verify-deploy.sh` | 是 | 在探针结果之上再断言关键接口的**业务码** |

> 目标地址不写默认值：未指定 `BASE_URL` 时自动取 `.env.production` 的 `VITE_API_BASE_URL`，
> 未指定 `EXPECT_CORS_ORIGIN` 时由 `package.json` 的 `homepage` 推导 origin（避免仓内出现第二份环境副本）。
>
> ⚠️ 两个脚本都无法证明的事：**轮换 `JWT_SECRET` 后旧 token 真的失效了**。那需要人工拿一个
> 轮换前的旧 token 请求受保护接口并确认返回 401。`ready=200` 不等于旧密钥已作废。

---


## 三、数据库部署信息

### 3.0 当前数据库架构（2026-09-09 更新）

> 生产库已迁移至阿里云 RDS MySQL，开发库使用 SQLPub 开发版（付费），两库隔离：
> - **生产库 `fengsong`**（阿里云 RDS）：Sealos 应用 `mftb-admin-backend` 环境变量指向此库；修改入口：Sealos 控制台 → 应用管理 → mftb-admin-backend → 变更 → 环境变量。
> - **开发库 `fengsong`**（SQLPub 开发版付费库，`mysql3.sqlpub.com:3308`）：本地 `backend/run-local.sh` 指向此库。

| 项 | 生产库（阿里云 RDS） | 开发库（SQLPub 开发版） |
|----|--------|--------|
| Host:Port | 阿里云 RDS（Sealos DB_URL 注入） | `mysql3.sqlpub.com:3308` |
| Database | `fengsong` | `fengsong` |
| Username | Sealos 环境变量注入 | `fengsong_mftb` |
| Password | Sealos 环境变量注入 | 唯一存放处：`backend/.env.local` 的 `DB_PASSWORD`（gitignore） |
| 套餐 | 阿里云 RDS（付费） | 开发版 ¥9.9/年（1GB/50连接/自动备份） |
| MySQL 版本 | 8.x | 8.4.3 |
| 使用方 | Sealos 生产后端 | 本地 `backend/run-local.sh` |

> 注意：SQLPub 网站登录密码（邮箱账号）≠ 数据库连接密码，二者独立。
> 执行 SQL 的正式入口：开发库用任意 MySQL 客户端（`mysql -h mysql3.sqlpub.com -P 3308 -u <用户> -p`）或 SQLPub 网页控制台；
> 生产库（阿里云 RDS）的整库结构导入用 `scripts/import_schema_to_rds.py`（需 export `RDS_HOST`/`RDS_USER`，密码作为第一个参数传入，凭据不得写入仓库；脚本内 `SQL_FILE` 为硬编码的 `fengsong_schema.sql` 路径，执行前按本机位置调整）。

### 3.1 本地 MySQL（新环境必备）

> ⚠️ **修正**：`application.yml` 已不再内置任何库地址，所以下面两种情形必须自备 MySQL 8：
> ① 本机未拿到 SQLPub 开发库口令；② 协作者/外部人员从公开仓库拉代码后想跑起来。

| 项 | 值 | 说明 |
|----|-----|------|
| 推荐方式 | `docker run` 一个 MySQL 8.4 容器 | 10 分钟内可交付一个空库，与生产隔离 |
| 必需版本 | MySQL 8.0+ | 依赖 8.x 语法与字符集（utf8mb4） |
| 建库 | 自行命名（如 `mftb_admin`） | 由 `DB_URL` 连接串指定，脚本不建库 |
| 历史方式 | `localhost:3306/mftb_admin` / `root:root` | 旧默认值，**现已不再生效**，仅作历史参考 |

### 3.2 开发库初始化步骤（换电脑后）

> 开发库 `fengsong`（SQLPub 开发版）已在 SQLPub 上维护，通常无需重新初始化。
> 如需重建，用任意 MySQL 客户端（或 SQLPub 网页控制台）连接 SQLPub 开发库后按顺序执行 `backend/sql/*.sql`；
> 增量表结构/种子数据无需手工执行，由后端启动期迁移机制自愈（见 §2.4）。

### 3.3 数据库表清单（核心业务表）

| 表名 | 用途 |
|------|------|
| `sys_user` | 系统用户（员工） |
| `sys_role` | 角色 |
| `sys_department` | 部门 |
| `sys_position` | 职位 |
| `sys_menu` | 菜单 |
| `biz_merchant_group` | 商户集团（ID 自增规则：`JT000001`） |
| `biz_store` | 门店（ID 自增规则：`MD00001`） |
| `biz_gift_record` | 赠送记录（gift_id 格式：`2401-001`） |
| `biz_gift_consume` | 赠送消费流水 |
| `sys_login_log` | 员工登录日志（登录/登出/在线时长/退出原因） |
| `sys_config` | 系统配置表（通用 key-value 存储，如 `session_idle_timeout_ms` 空闲超时） |

---

## 四、前端环境信息

### 4.1 本地开发

| 项 | 值 |
|----|-----|
| 启动命令 | `npm run dev` |
| 端口 | `3000` |
| 本地地址 | `http://localhost:3000` |
| Node 版本 | `20`（CI 固定版本） |
| 安装依赖 | `npm ci --legacy-peer-deps`（**必须加 --legacy-peer-deps**） |

### 4.2 生产部署

| 项 | 值 |
|----|-----|
| 部署平台 | GitHub Pages |
| 访问地址 | `https://fengsong7889.github.io/-mftb-admin-portal/` |
| base 路径 | `/-mftb-admin-portal/`（生产环境自动加前缀） |
| 后端 API 地址 | `https://dacnhtyrpxhc.sealoshzh.site`（来自 `.env.production` 的 `VITE_API_BASE_URL`） |
| 触发部署 | push 到 main 分支 |
| 工作流文件 | `.github/workflows/deploy.yml` |

### 4.3 质量门禁（CI 必过）

```bash
npm run lint          # ESLint 检查
npm run typecheck     # TypeScript 类型检查
npm run test:run      # Vitest 单元测试
npm run secret-scan   # 硬编码敏感信息扫描
```

---

## 五、工具链版本速查

| 工具 | 版本 | 安装/配置说明 |
|------|------|--------------|
| Node.js | 20.x | 推荐用 nvm 管理 |
| npm | 随 Node 20 | |
| Java | **17**（**不要用 25+**） | 已装 Temurin 17.0.20：`~/Library/Java/JavaVirtualMachines/temurin-17.jdk`（`/usr/libexec/java_home -v 17`） |
| Maven | 3.9.x | 已装 3.9.9：`~/Library/apache-maven-3.9.9`（需手动加 PATH，run-local.sh 已处理） |
| MySQL | 8.0+ | 本机未装，当前用 SQLPub 外网库（见 3.0） |
| TypeScript | ^5.6.3 | 项目依赖 |
| Vite | ^6.0.1 | 项目依赖 |

### 5.1 换电脑必做清单

- [ ] 安装 Node 20（`nvm install 20`）
- [ ] 安装 JDK 17（**不要装 25+，Lombok 不兼容**）
- [ ] 安装 Maven 3.9.x
- [ ] 准备 MySQL 8：本机跑 docker 容器，或线下获取 SQLPub 开发库口令（见 3.0）
- [ ] 后端：`cp backend/.env.local.example backend/.env.local`，填 `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`/`JWT_SECRET`（四项缺一不可，`JWT_SECRET` ≥ 32 字节）
- [ ] 后端：同一份 `.env.local` 再补 `AI_PROVIDER_CRYPTO_KEY`（≥ 32 字节随机值，与 `JWT_SECRET` 不同）——
      不配也能启动，但供应商 API Key 会跟着 `JWT_SECRET` 一起作废（见 2.3 与 Q6）
- [ ] 前端：**本地开发无需 `.env.local`**（Vite proxy 已把 `/api` 转发到 `localhost:8080`）；如需指向远程后端才 `cp .env.example .env.local` 并填 `VITE_API_BASE_URL`
- [ ] 后端：`cd backend && bash run-local.sh`（本机已有此脚本）；
      新拉仓库无此脚本时用 `cd backend && mvn -pl bootstrap -am spring-boot:run`（先 export 四个变量）
- [ ] 前端：`npm ci --legacy-peer-deps`（**必须带此参数**）
- [ ] 前端：`npm run dev`（访问 `http://localhost:3000`）

---

## 六、关键账号与凭据

> ⚠️ 以下凭据仅用于本地开发 / 演示环境，**生产环境务必更换**。

| 用途 | 账号/值 | 密码/密钥 |
|------|---------|----------|
| 后端登录（系统管理员） | `admin`（`BuiltinAccounts.ADMIN_USERNAME`） | 值不入库。全新库首次启动时按优先级取引导口令：`ADMIN_BOOTSTRAP_PASSWORD` 环境变量 &gt; `.local/admin-bootstrap-password.txt` &gt; 随机生成并落盘（权限 600，已 gitignore），并置 `must_change_password=1`，**首登必须改密**；存量库则继承原超管哈希，不强制重置 |
| 后端登录（员工） | 工号 `MF*****` | 历史上 `MF00001` 曾是超管，现已降级为普通员工账号（不能再当管理员入口用） |
| SQLPub 开发库 | `fengsong_mftb` | 唯一存放处：`backend/.env.local` 的 `DB_PASSWORD`（gitignore，禁止复制到本文件；**已于 2026-10-31 轮换**，旧值随 git 历史永久作废） |
| JWT 密钥 | — | 无默认值。必须在 `backend/.env.local` 设 `JWT_SECRET`（≥ 32 字 节）；开发/生产各自独立，禁止复用示例值 |
| AI 供应商加密密钥 | — | 无默认值。`backend/.env.local` 的 `AI_PROVIDER_CRYPTO_KEY`（≥ 32 字节）；缺省时回退复用 `JWT_SECRET`（不建议）。只用于 `ai_provider.api_key` 的 AES-256-GCM，**长期不变**，改动等于让存量密文全部作废 |
| 生产后端地址 | — | `https://dacnhtyrpxhc.sealoshzh.site`（属公开信息，已随仓库暴露，需当作真实攻击面加固） |
| 生产前端地址 | — | `https://fengsong7889.github.io/-mftb-admin-portal/` |
| GitHub 仓库 | `fengsong7889/-mftb-admin-portal` | — |

> 🔎 **内置管理员的口令来源**（已去硬编码）：仅当密码列不是合法 BCrypt（即全新库）时写入，
> 优先级：环境变量 `ADMIN_BOOTSTRAP_PASSWORD` &gt; 已存在的 `.local/admin-bootstrap-password.txt`
> &gt; 随机生成 20 位并落盘（权限 600）。三条路径都不输出口令明文；写入时同步置
> `must_change_password=1`，因此**首登必须改密**；存量库继承原有合法哈希，不重置不强制。
> 对外交付前必须确认对方已完成首登改密并删除临时落盘文件；生产请显式设环境变量，
> 因为落盘文件会随容器重建丢失。

---

## 七、常见问题速查

### Q1：本地启动后端报 Lombok 找不到 getter/setter？
**A**：Java 版本不对，必须用 JDK 17。检查 `java -version`，若为 25+ 需切换。

### Q2：本地前端打开后提「無法連接後端服務」、登不进去？
**A**：这是预期行为，**不是缺陷**。登录不存在 Mock 降级，后端未启动就是进不了系统。
正确做法：启动后端 + 数据库（第二/三节），或只改纯 UI 时对着登录页以外的静态样式调。
若已登录会话中某个页面白屏/报错，才需检查对应 API 是否已接入 Mock 降级（见第一节命令重新取真值）。

### Q3：Mock 数据被改乱了，如何重置？
**A**：浏览器 DevTools → Application → Local Storage → 删除所有 `mftb_mock_*` 键，刷新页面即可恢复种子数据。

### Q4：换电脑后如何恢复完整环境？
**A**：按第五节「换电脑必做清单」逐项执行即可。

### Q5：别人从公开仓库拉了代码，能跑起来吗？
**A**：**不能**，这是有意设计的边界。仓内不含 `backend/.env.local`（凭据）、
不含 `run-local.sh`，`application.yml` 也没有任何可用默认值，
缺四项环境变量后端直接启动失败；且即使自己装了 MySQL，仓内也没有真实业务库。
运行资产只走线下书面交付（见根目录 `LICENSE` 第五条与 `README.md`）。
如需进一步卡住「拿到全部源码也自建成可运行系统」，可评估引入后端 License 激活门
（方案与优先级记在本地未入库台账，对外交付前必须走 `docs/OFFLINE_DELIVERY_CHECKLIST_2026-10.md`）。

### Q6：「模型供应商」里明明填过 API Key，列表又显示「未配置 / 密鑰已失效」？

**A**：先确认库里有没有值，别怀疑保存链路。`ai_provider.api_key` 是密文入库
（`enc:v1:<keyId>:<base64>`），列表页的 `apiKeyMasked` 由后端现场解密得出：

```sql
SELECT provider_key,
       CASE WHEN api_key IS NULL THEN 'NULL'
            WHEN LEFT(api_key,7)='enc:v1:' THEN 'ENC_V1'
            WHEN LEFT(api_key,4)='enc:'    THEN 'ENC_LEGACY'
            ELSE 'PLAIN' END AS kind,
       CHAR_LENGTH(COALESCE(api_key,'')) AS len, updated_at
  FROM ai_provider ORDER BY id;
```

- 有密文但 `updated_at` 就是你保存的时间 → 数据在，**是解不开**，不是没存。
  后端日志会伴随 `API Key 解密失败…Tag mismatch!` 或「密文由另一把加密密钥写入」。
- 根因几乎总是加密密钥变了：`AI_PROVIDER_CRYPTO_KEY` 未独立配置时，加密密钥等于
  `JWT_SECRET`，轮换签名密钥就顺带销毁供应商密文。
- 处置：① 先按 2.3 配好独立的 `AI_PROVIDER_CRYPTO_KEY` 并重启（启动日志不应再有
  「当前复用 JWT_SECRET」告警）；② 到「模型供应商」逐个编辑，重新粘贴 API Key 并保存
  （旧密文不可逆，没有任何自动恢复手段）；③ 以后轮换 `JWT_SECRET` 不再影响供应商 Key。
- 三态口径：`apiKeyStatus` 0=未配置、1=已配置、2=密钥已失效（需重填）。**2 不等于没配过**，
  看到「密鑰已失效」直接去重填，不要再去查保存接口。

---

## 八、维护约定（重要）

> ⚠️ **本文件是换电脑 / 重装环境的唯一参考，务必保持最新。**
> ⚠️ **凭据红线**：本文件受版本控制，禁止写入任何真实数据库口令/JWT 密钥等凭据值，只允许写「位置和类型」（如「见 backend/.env.local 的 DB_PASSWORD」）。
> 原先允许的「本地 Mock 演示口令（MT0001/MT0002）」例外已作废——该登录机制已删除，相应口令不再存在。
>
> 🔓 **凭据泄露处置**：历史旧值不可回收，只能作废旧凭据。
> - [x] SQLPub 开发库口令已于 2026-10-31 轮换（历史里的旧值已失效）
> - 其余待处置项（包括其他凭据的作废进度、历史清洗时机）**不列在本公开文件里**——
>   在公开仓库里逐项标注“哪条密钥现在仍然有效”，本身就是额外的暴露。
>   实况台账存于本地未入库文件 `.qoder/security-followups-2026-10.md`（被 `.gitignore` 忽略，请仓库外备份），
>   流程性要求见 `docs/OFFLINE_DELIVERY_CHECKLIST_2026-10.md` 第七节。

以下场景**必须**同步更新本文件，否则换电脑后前功尽弃：

| 场景 | 需更新的章节 |
|------|------------|
| 修改后端部署地址（本地/生产） | 二、后端服务部署信息 |
| 修改数据库连接（host/库名/账号密码） | 三、数据库部署信息 |
| 修改环境变量（`.env*` 或 `application.yml`） | 二 / 三 / 四 对应章节 |
| 修改登录账号密码 | 六、关键账号与凭据 |
| 更换工具链版本要求（Node/Java/Maven/MySQL） | 五、工具链版本速查 |
| 新增业务模块接入 Mock 降级 | 一、Mock 降级机制（改为命令取真值，不再维护静态表） |
| 更换部署平台或 CI/CD 流程 | 二 / 四 部署信息 |
| 换电脑后验证出的新配置项 | 对应章节 |
| **轮换任何凭据** | 六、关键账号与凭据（只写位置与类型）+ 本节处置台账 |

**自检清单**（每次环境变更后勾选）：

- [ ] 本地后端地址是否最新？
- [ ] 生产后端地址是否最新？
- [ ] 本地数据库连接是否最新？
- [ ] 生产前端地址是否最新？
- [ ] 登录账号密码是否最新？
- [ ] 工具链版本要求是否最新？
- [ ] Mock 降级模块清单是否最新？

**AI 协作约定**：凡是涉及上述变更的任务，AI 在任务结束前会主动询问是否同步更新本文件。

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文档属作者个人所有的专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。许可条款见仓库根目录 `LICENSE`。
