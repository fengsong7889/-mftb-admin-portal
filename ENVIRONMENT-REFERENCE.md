# 本地开发环境参考手册

> 本文件记录项目本地运行所需的全部环境信息（Mock 降级、后端部署、数据库、工具链版本等）。
> 换电脑 / 重装环境 / 新人接手时，按本手册配置即可恢复本地开发，无需重新摸索。
> **维护约定**：环境信息有变动时，请同步更新本文件。

---

## 一、Mock 降级机制（本地无后端也能跑）

项目已实现「后端不可用时自动降级到本地 Mock 数据」的统一机制，本地开发**无需启动后端也能完整验证**前端功能。

### 1.1 降级触发条件

- 文件：`src/api/request.ts` 中的 `isBackendUnavailable(error)`
- 触发场景：网络异常（无响应）、HTTP 404、HTTP 5xx
- 不触发：后端返回的业务错误（如参数校验失败）会正常抛出

### 1.2 已接入 Mock 降级的模块

| 模块 | API 文件 | Mock 文件 | 覆盖接口 |
|------|---------|----------|---------|
| 商户集团 | `src/api/merchantGroup.ts` | `src/api/mock/merchantMock.ts` | 分页/全量/下拉/新增/编辑/删除 |
| 门店管理 | `src/api/store.ts` | `src/api/mock/merchantMock.ts` | 分页/按集团/下拉/新增/编辑/删除 |
| 赠送管理 | `src/api/gift.ts` | `src/api/mock/giftMock.ts` | 列表/详情/新增/扣除/消费流水 |
| 登录认证 | `src/contexts/AuthContext.tsx` | Mock 登录（MT0001/111222） | 登录/登出/获取用户信息 |

### 1.3 新增模块接入 Mock 的标准步骤

1. 在 `src/api/mock/` 下新建 `xxxMock.ts`，实现与后端接口同名的 mock 函数（基于 localStorage + 种子数据）
2. 在 `src/api/xxx.ts` 中每个接口函数加 try/catch，用 `isBackendUnavailable(err)` 判断后降级
3. 所有请求带 `SILENT_HEADER` 静默头，避免降级时弹全局错误提示

### 1.4 Mock 数据存储位置

- 全部存于浏览器 `localStorage`，key 前缀 `mftb_mock_`
- 清除浏览器数据会重置为种子数据（首次访问自动初始化）
- 种子数据定义在各 mock 文件的 `SEED_*` 常量中

### 1.5 本地登录凭据（Mock 模式）

| 角色 | 工号 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | `MT0001` | `111222` | 来自 `.env.local` 的 `VITE_ADMIN_PASSWORD` |
| 访客 | `MT0002` | `123456` | 来自 `.env.local` 的 `VITE_GUEST_PASSWORD` |

> 注意：`.env.local` 已被 gitignore，换电脑需手动重建（参考 `.env.example`）。

---

## 二、后端服务部署信息

### 2.1 本地开发后端

| 项 | 值 |
|----|-----|
| 服务端口 | `8080` |
| 上下文路径 | `/`（根路径） |
| API 基础路径 | `/api`（前端 Vite proxy 代理） |
| 前端代理配置 | `vite.config.ts` → `server.proxy./api` → `http://localhost:8080` |
| 启动命令 | `cd backend && bash run-local.sh`（推荐，自动设置 JDK 17 + 环境变量） |
| 备选启动 | `cd backend && mvn spring-boot:run`（`application.yml` 默认已指向开发库） |
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
# 数据库连接（默认值已指向开发库 fengsong，生产环境通过环境变量覆盖）
spring.datasource.url: jdbc:mysql://mysql3.sqlpub.com:3308/fengsong
spring.datasource.username: fengsong_mftb
spring.datasource.password: bBMzwCsHPYDhi4my

# 生产环境由 Sealos 注入 DB_URL / DB_USERNAME / DB_PASSWORD 指向阿里云 RDS 生产库
# JWT 密钥（生产环境务必通过环境变量 JWT_SECRET 注入）
jwt.secret: ${JWT_SECRET}（无默认值，必须外部注入）
jwt.expiration: 86400000  # 24 小时
```

> ⚠️ **数据库默认值已统一为开发库 `fengsong`（SQLPub 开发版付费库）**：无论通过 `run-local.sh`、IDE 直接运行、还是 `mvn spring-boot:run`，默认都连开发库，不再需要手动设置环境变量。生产环境由 Sealos 平台通过 `DB_URL` 环境变量覆盖指向阿里云 RDS。

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
| Password | Sealos 环境变量注入 | 见 `backend/run-local.sh`（已 gitignore） |
| 套餐 | 阿里云 RDS（付费） | 开发版 ¥9.9/年（1GB/50连接/自动备份） |
| MySQL 版本 | 8.x | 8.4.3 |
| 使用方 | Sealos 生产后端 | 本地 `backend/run-local.sh` |

> 注意：SQLPub 网站登录密码（邮箱账号）≠ 数据库连接密码，二者独立。
> 无 mysql 客户端时可用 `.qoder/temp/SqlRunner.java`（JDBC 脚本执行器）导入 SQL。

### 3.1 本地 MySQL（已废弃，不再需要）

> ✅ 自 `application.yml` 默认值改为 SQLPub 开发库后，本地无需安装 MySQL。
> 以下信息仅作参考保留：

| 项 | 值 | 说明 |
|----|-----|------|
| 状态 | **已废弃** | `application.yml` 默认已指向 SQLPub 开发库 |
| 原默认值 | `localhost:3306/mftb_admin` / `root:root` | 仅历史记录，不再使用 |

### 3.2 开发库初始化步骤（换电脑后）

> 开发库 `fengsong`（SQLPub 开发版）已在 SQLPub 上维护，通常无需重新初始化。
> 如需重建，使用 `.qoder/temp/SqlRunner.java` 或任意 MySQL 客户端连接 SQLPub 后按顺序执行 `backend/sql/*.sql`。

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
- [ ] ~~安装 MySQL 8.0+~~（已不需要，默认连 SQLPub 开发库）
- [ ] ~~创建数据库 `mftb_admin`~~（已不需要）
- [ ] 复制 `.env.example` 为 `.env.local`，填写密码
- [ ] 前端：`npm ci --legacy-peer-deps`
- [ ] 后端：`cd backend && bash run-local.sh`（推荐）或直接 `mvn spring-boot:run`
- [ ] 前端：`npm run dev`（访问 `http://localhost:3000`）

---

## 六、关键账号与凭据

> ⚠️ 以下凭据仅用于本地开发 / 演示环境，**生产环境务必更换**。

| 用途 | 账号/值 | 密码/密钥 |
|------|---------|----------|
| 前端管理员登录（Mock） | `MT0001` | `111222` |
| 前端访客登录（Mock） | `MT0002` | `123456` |
| 后端登录（真实库） | `MF00001` | `111222`（DataInitializer 首次启动自动重置） |
| SQLPub 开发库 | `fengsong_mftb` | 见 `backend/run-local.sh`（`application.yml` 默认值已内置） |
| JWT 默认密钥 | — | 无默认值，`run-local.sh` 已内置本地开发密钥 |
| 生产后端地址 | — | `https://dacnhtyrpxhc.sealoshzh.site` |
| 生产前端地址 | — | `https://fengsong7889.github.io/-mftb-admin-portal/` |
| GitHub 仓库 | `fengsong7889/-mftb-admin-portal` | — |

---

## 七、常见问题速查

### Q1：本地启动后端报 Lombok 找不到 getter/setter？
**A**：Java 版本不对，必须用 JDK 17。检查 `java -version`，若为 25+ 需切换。

### Q2：本地前端打开后「服务器异常」？
**A**：正常现象——后端未启动时会自动降级到 Mock 数据，**不应**出现错误提示。若仍报错，检查对应 API 是否已接入 Mock 降级（见第一节表格）。

### Q3：Mock 数据被改乱了，如何重置？
**A**：浏览器 DevTools → Application → Local Storage → 删除所有 `mftb_mock_*` 键，刷新页面即可恢复种子数据。

### Q4：换电脑后如何恢复完整环境？
**A**：按第五节「换电脑必做清单」逐项执行即可。

---

## 八、维护约定（重要）

> ⚠️ **本文件是换电脑 / 重装环境的唯一参考，务必保持最新。**

以下场景**必须**同步更新本文件，否则换电脑后前功尽弃：

| 场景 | 需更新的章节 |
|------|------------|
| 修改后端部署地址（本地/生产） | 二、后端服务部署信息 |
| 修改数据库连接（host/库名/账号密码） | 三、数据库部署信息 |
| 修改环境变量（`.env*` 或 `application.yml`） | 二 / 三 / 四 对应章节 |
| 修改登录账号密码 | 六、关键账号与凭据 |
| 更换工具链版本要求（Node/Java/Maven/MySQL） | 五、工具链版本速查 |
| 新增业务模块接入 Mock 降级 | 一、Mock 降级机制（表格） |
| 更换部署平台或 CI/CD 流程 | 二 / 四 部署信息 |
| 换电脑后验证出的新配置项 | 对应章节 |

**自检清单**（每次环境变更后勾选）：

- [ ] 本地后端地址是否最新？
- [ ] 生产后端地址是否最新？
- [ ] 本地数据库连接是否最新？
- [ ] 生产前端地址是否最新？
- [ ] 登录账号密码是否最新？
- [ ] 工具链版本要求是否最新？
- [ ] Mock 降级模块清单是否最新？

**AI 协作约定**：凡是涉及上述变更的任务，AI 在任务结束前会主动询问是否同步更新本文件。
