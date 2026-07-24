# MFTB 通用管理平台 - 后端服务

Spring Boot 3 + MyBatis-Plus + Spring Security + JWT + MySQL 8 的后端服务，为前端 React 管理后台提供 REST API。

## 一、环境要求

| 工具 | 版本 |
|------|------|
| JDK | 17+ |
| Maven | 3.8+ |
| MySQL | 8.0+ |

安装后验证：

```bash
java -version
mvn -version
mysql --version
```

> macOS 推荐使用 Homebrew 安装：
> ```bash
> brew install openjdk@17 maven mysql
> brew services start mysql
> ```

## 二、数据库初始化

1. 启动 MySQL 后，执行建表脚本：

```bash
mysql -u root -p < sql/01_init_system.sql
```

2. 脚本会自动创建数据库 `mftb_admin` 及系统表，并插入初始用户。

## 三、配置

编辑 `src/main/resources/application.yml`，将数据库密码改为你本地的 MySQL 密码：

```yaml
spring:
  datasource:
    username: root
    password: 你的密码
```

## 四、启动

```bash
mvn spring-boot:run
```

服务启动在 `http://localhost:8080`。

首次启动时，`DataInitializer` 会自动把初始用户的密码重置为正确的 BCrypt 加密值：

- 管理员账号：`admin` / `111222`
- 访客账号：`guest` / `123456`

## 五、接口

| 方法 | 路径 | 说明 | 是否需要 Token |
|------|------|------|:---:|
| POST | `/api/auth/login` | 登录，返回 JWT Token 与用户信息 | 否 |
| POST | `/api/auth/logout` | 登出 | 否 |
| GET | `/api/auth/info` | 获取当前登录用户信息 | 是 |

### 登录请求示例

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"111222"}'
```

### 携带 Token 访问

```bash
curl http://localhost:8080/api/auth/info \
  -H "Authorization: Bearer <登录返回的 token>"
```

## 六、与前端联调

前端已在 `vite.config.ts` 配置代理，将 `/api` 请求转发到 `http://localhost:8080`。

启动顺序：

```bash
# 1. 启动后端 (backend 目录)
mvn spring-boot:run

# 2. 启动前端 (项目根目录)
npm run dev
```

前端访问 `http://localhost:3000`，用 `admin/111222` 登录即可打通全链路。

## 七、目录结构

```
backend/
├── pom.xml
├── sql/
│   └── 01_init_system.sql          # 数据库初始化脚本
└── src/main/
    ├── java/com/mftb/admin/
    │   ├── MftbAdminApplication.java  # 启动类
    │   ├── config/                    # 配置 (Security/JWT过滤器/MyBatis/数据初始化)
    │   ├── controller/                # 接口层 (AuthController)
    │   ├── service/                   # 业务层 (AuthService)
    │   ├── mapper/                    # 数据访问层 (SysUserMapper)
    │   ├── entity/                    # 实体 (SysUser)
    │   ├── dto/                       # 请求/响应对象
    │   ├── common/                    # 通用类 (Result/异常处理)
    │   └── util/                      # 工具类 (JwtUtil)
    └── resources/
        └── application.yml
```

## 八、后续扩展业务模块

以审批中心为例，新增一个模块的步骤：

1. 在 `sql/` 新增建表脚本并执行
2. `entity/` 新增实体类，`mapper/` 新增 Mapper 接口
3. `service/` + `service/impl/` 编写业务逻辑
4. `controller/` 新增 REST 接口
5. 前端 `src/api/` 新增对应 API 文件，页面替换 mock 数据为真实调用
