# MFTB 搜广推系统 - 后端服务

Spring Boot 3 + MyBatis-Plus + Spring Security + JWT + MySQL 8 的后端服务，为前端 React 管理后台提供 REST API。

## 一、环境要求

| 工具 | 版本 |
|------|------|
| JDK | **17**（🔴 不要用 21+/25+：Lombok 与高版本不兼容，会报「找不到 getter/setter」） |
| Maven | 3.9.x（最低 3.8） |
| MySQL | 8.0+（**必须自备**，见第二节） |

安装后验证：

```bash
java -version
mvn -version
```

> macOS 推荐使用 Homebrew 安装：
> ```bash
> brew install openjdk@17 maven
> ```
> 已装多个 JDK 时，用 `/usr/libexec/java_home -v 17` 定位并设 `JAVA_HOME`。

## 二、数据库（必须自备，仓内不内置）

本服务**不包含任何可用的数据库连接**。`bootstrap/src/main/resources/application.yml` 的数据源配置
全部来自环境变量，**没有默认值**，缺任一项启动即失败：

| 环境变量 | 必需 | 说明 |
|-----------|:---:|------|
| `DB_URL` | 是 | `jdbc:mysql://<host>:<port>/<db>?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`<br>⚠️ 必须已带 `?` 查询段：yml 是 `${DB_URL}&socketTimeout=...` 字面拼接 |
| `DB_USERNAME` | 是 | 数据库账号 |
| `DB_PASSWORD` | 是 | 数据库密码 |
| `JWT_SECRET` | 是 | HS256 签名密钥，**至少 32 字节**；长度不足启动脚本直接报错退出 |
| `LOG_LEVEL` | 否 | 默认 `info`；`debug` 会逐请求打印并推高 CPU，生产禁用 |
| `CORS_ALLOWED_ORIGINS` | 否 | 留空会回退开发白名单并告警；**生产必须显式设置** |

本地配置方式（模板已入库，真值永不入库）：

```bash
cp .env.local.example .env.local   # .env.local 已被 .gitignore 忽略，禁止提交
```

建库与初始化：

1. 自行建一个空库（本目录脚本**不建库**，库名由 `DB_URL` 指定），与生产隔离。
2. 表结构与种子数据**不需要手工执行 `sql/*.sql`** —— 启动期迁移机制与契约自愈会处理
   （见 `ENVIRONMENT-REFERENCE.md` §2.4）；`sql/` 为历史脚本与基线参考，仅供排错与重建时使用。
3. 预检可单独跑：`java -jar app.jar --schema.check-only=true`（退出码 0=就绪 / 2=漂移）。

> 生产环境由 Sealos 注入同名环境变量指向阿里云 RDS，本目录不保存任何生产凭据。

## 三、启动

```bash
# 方式一：本机的完整启动脚本（自动设 JDK 17 + source .env.local + 校验必填项）
#   ⚠️ run-local.sh 本身未入库（被 backend/.gitignore 忽略），新拉仓库时没有此文件
bash run-local.sh

# 方式二（推荐，新拉仓库可用）：已入库的增量重启脚本
bash restart-service.sh --rebuild   # 首次启动 / target/ 不存在时会自动走此分支
bash restart-service.sh --fast      # 仅跑已有 JAR，不编译
bash restart-service.sh --full      # 等同于 run-local.sh

# 方式三：纯 Maven（自行先 export 四个变量）。启动类在 bootstrap 模块
mvn -pl bootstrap -am spring-boot:run
```

> 🔴 **不要在聚合根直接跑 `mvn spring-boot:run`**：父 POM 无启动类，会失败。
> 必须带 `-pl bootstrap -am`。

服务启动在 `http://localhost:8080`。验证是否就绪：

```bash
curl -s http://localhost:8080/api/health/ready   # 迁移+契约通过返 200，否则 503
curl -s http://localhost:8080/api/health/live    # 进程存活即 200
```

首次启动时 `DataInitializer` 会幂等准备账号：

- 内置系统管理员：用户名 `admin`（`BuiltinAccounts.ADMIN_USERNAME`）。
  全新库会落一个**引导密码**并置 `must_change_password=1`，**首登必须改密**；
  存量库继承原有合法 BCrypt 哈希，不重置、不强制改密。
- 员工登录账号统一为工号（`MF` 前缀自增）；历史上以 `MF00001` 作为超管已降级为普通员工账号。
- 引导密码的具体值不在本文档写出（凭据红线）；它来自 `DataInitializer` 中的引导常量，
  仅在密码缺失或为占位哈希时写入。对外交付前必须确认接收方已完成首登改密。

> 登录安全：连续失败 3 次后，登录必须携带一次性滑块验证 Token（`/api/auth/captcha` 签发，5 分钟有效），
> 否则返回业务码 `1005`。

## 四、接口（认证部分）

| 方法 | 路径 | 说明 | 是否需要 Token |
|------|------|------|:---:|
| GET | `/api/auth/captcha` | 签发滑块安全验证 Token（返 `data.token`，5 分钟有效、一次性） | 否 |
| POST | `/api/auth/login` | 登录，返回 JWT Token 与用户信息；失败 3 次后必须携带 `captchaToken` | 否 |
| POST | `/api/auth/logout` | 登出（在白名单内，但靠请求上下文解析当前用户才能记录登出时间） | 建议带 |
| GET | `/api/auth/info` | 获取当前登录用户信息 | 是 |
| GET | `/api/health/ready` | 就绪探针（迁移 + 契约校验） | 否 |
| GET | `/api/health/live` | 存活探针 | 否 |

> 上表仅为认证/健康类最小集。全量接口契约以 `controller/` 代码与
> `frontend/packages/platform-client/src/api/` 调用为准，本文不维护副本。

### 登录请求示例

```bash
# 未触发滑块验证时（注意：密码值请从环境变量/本地记录读取，不要写进脚本或提交）
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<首登已改的密码>"}'

# 返 1005 时需先取滑块 Token：
#   GET /api/auth/captcha → 取 data.token → 登录时多传一个 "captchaToken":"<该 token>"
```

### 携带 Token 访问

```bash
curl http://localhost:8080/api/auth/info \
  -H "Authorization: Bearer <登录返回的 token>"
```

## 五、与前端联调

前端已在 `vite.config.ts` 配置代理，将 `/api` 请求转发到 `http://localhost:8080`，
因此**前端本地开发不需要 `.env.local`**。

启动顺序：

```bash
# 1. 先起后端（backend 目录，需先配好 backend/.env.local）
bash restart-service.sh --rebuild

# 2. 再起前端（项目根目录）
npm ci --legacy-peer-deps
npm run dev
```

前端访问 `http://localhost:3000`，用 `admin`（或员工工号）+ 已改密的密码登录即可打通全链路。

> ⚠️ **后端未启动时前端登录不成功，也没有任何 Mock 登录兼容**（安全边界：禁止前端自授 admin 权限）。
> 登录会提示「無法連接後端服務」并停在登录页，这是预期行为。

## 六、目录结构

Maven 多模块工程（方案 P3），**启动类不在 `backend/src/`**（该路径已不存在）：

```
backend/
├── pom.xml                       # 聚合根（无启动类，故不能直接在此 spring-boot:run）
├── bootstrap/                    # 启动模块：MftbAdminApplication + application.yml
├── libraries/platform-core/      # 平台基础库（注解/客户端/通用类/常量）
├── contracts/{rdm,eam,hr,oa}/    # 各业务域跨模块契约（应为叶子模块）
├── modules/
│   ├── legacy/                   # 历史主体（含 AuthController/SecurityConfig/DataInitializer
│   │                             #   与启动期迁移目录 resources/db/migrations/catalog.json）
│   ├── shared/                   # 共享层
│   └── {eam,hr,rdm}/             # 业务模块
├── sql/                          # 历史 SQL 与基线参考（日常不手工执行，见第二节）
├── .env.local.example            # 环境变量模板（已入库）
└── .env.local                    # 真值（已 gitignore，禁止提交）
```

依赖边界由 `npm run check:boundary` 拦截：公共层不得 import 业务页面，`contracts/**` 必须是叶子。

## 七、后续扩展业务模块

1. 在对应模块 `modules/<域>/` 下新增 entity / mapper / service / service.impl / controller
2. 结表与字段变更走**启动期迁移**（登记到 `resources/db/migrations/catalog.json` + 对应
   `*DataInitializer`，后置校验与审计自动进 `sys_schema_migration_log`），
   而不是只写一个 `sql/*.sql` 让人手工执行（见 `.qoder/rules/backend-sql-migration.md`）
3. 菜单/图标/权限按系统归属写入启动期幂等 upsert（参考 `docs/system-portal/inventory.md`）
4. 前端在 `frontend/packages/platform-client/src/api/` 新增对应 API 文件，页面接真实调用
5. 提交前至少跑：`npm run typecheck` + `npm run secret-scan` + `npm run test:affected`

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文件与后端代码属作者个人所有的专有软件，仅按仓库根目录 `LICENSE` 授予查阅权。
本文档不含可用的默认值、凭据或库地址 —— 这些缺失均属有意设计，运行资产只走线下书面交付。
