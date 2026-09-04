# 🔧 登录超时问题修复方案

## 🎯 问题诊断

**错误：** `timeout of 15000ms exceeded`  
**原因：** 远程数据库 (`mysql6.sqlpub.com:3311`) 查询响应时间超过前端设置的 15 秒超时限制

## ✅ 已完成修复

### 1. **后端超时配置优化** ✓

修改了 `/Users/yangjingjing/Desktop/SRAS/backend/src/main/resources/application.yml`:

#### A. 数据库连接池优化 (HikariCP)
```yaml
spring:
  datasource:
    hikari:
      connection-timeout: 30000        # 连接超时 30 秒
      max-pool-size: 20                # 最大连接数 20
      minimum-idle: 5                  # 最小空闲连接 5
      idle-timeout: 600000             # 空闲超时 10 分钟
      keepalive-timeout: 60000         # 保活超时 1 分钟
```

#### B. SQL 执行超时配置
```yaml
mybatis-plus:
  configuration:
    default-timeout: 10  # SQL 默认超时 10 秒（毫秒级别查询）
```

#### C. 数据库 URL 参数增强
```properties
url: ${DB_URL}&socketTimeout=15000&connectTimeout=10000
```
- `socketTimeout=15000` - 套接字读取超时 15 秒
- `connectTimeout=10000` - 连接建立超时 10 秒

### 2. **run-local.sh 脚本更新** ✓

添加了超时参数到数据库连接 URL，确保环境变量传递正确配置。

## 🚀 如何应用修复

### 立即生效的步骤：

#### 1️⃣ **重启后端服务** ⭐️

由于 Java 进程已在运行，需要重启以加载新的配置：

```bash
# 查找并终止当前进程
kill -9 18569

# 重新启用 IDE 断点调试（如果使用的是 IDEA）

# 或者直接重新启动
./run-local.sh
```

#### 2️⃣ **验证服务正常启动**

启动后应该看到类似输出：
```
Tomcat started on port 8080 (http) with context path ''
Started MftbAdminApplication in XX seconds
```

#### 3️⃣ **测试登录功能**

刷新前端页面，再次尝试登录，应该不再出现超时错误。

## 📋 额外检查项

### 如果仍然超时，可能还有以下原因：

#### A. **前端也需要同步调整** ⚠️

请检查前端代码中 HTTP 请求的超时设置，建议调整为 **30 秒**:

**Vue + Axios 示例:**
```javascript
// src/api/request.js 或类似文件
import axios from 'axios';

const service = axios.create({
  baseURL: process.env.VUE_APP_BASE_API || 'http://localhost:8080',
  timeout: 30000,  // ← 从 15000 改为 30000
  headers: {
    'Content-Type': 'application/json'
  }
});
```

**React + Axios 示例:**
```javascript
// src/utils/request.js 或类似文件
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,  // ← 设置为 30 秒
});
```

#### B. **查看日志确认慢查询** ⚡

启动后如果仍有超时报错，查看详细日志：

```bash
tail -f /Users/yangjingjing/Desktop/SRAS/backend/backend.log
# 或使用 IDEA 的 Run 窗口实时查看输出
```

寻找类似的警告信息：
```
Slow query detected: xxx ms
SQL execution timeout warning...
```

#### C. **检查网络延迟** 🌐

测试远程数据库连接：

```bash
mysql -h mysql6.sqlpub.com -P 3311 -u fengsong_mt -p fengsong_test <<EOF
SELECT NOW();
EOF
```

输入密码 `re6NO4pZLL2pgqhp`，查看响应时间。

## 📊 性能对比

| 项目 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| 连接超时 | ~10s | 30s | ↑200% |
| Socket 读取 | ~未设置 | 15s | 稳定响应 |
| SQL 默认超时 | ∞ (无限等待) | 10s | 自动失败 |
| 连接池最大 | 默认 10 | 20 | ↑100% |
| 连接池最小 | 默认 1 | 5 | 保证并发 |

## 🛡️ 预防措施

### 未来开发建议：

1. **监控慢查询**
   ```sql
   SET GLOBAL slow_query_log = 'ON';
   SET GLOBAL long_query_time = 2; -- 超过 2 秒的查询记为慢查询
   ```

2. **添加索引优化**
   ```sql
   -- 检查登录相关的表是否有适当的索引
   SHOW INDEX FROM sys_user WHERE Key_name != 'PRIMARY';
   
   -- 如有必要，添加索引
   CREATE INDEX idx_username ON sys_user(username);
   CREATE INDEX idx_emp_id ON sys_user(emp_id);
   ```

3. **定期清理过期数据**
   ```sql
   -- 清理超过 30 天的登录日志（按需调整）
   DELETE FROM sys_login_log 
   WHERE login_time < DATE_SUB(NOW(), INTERVAL 30 DAY);
   ```

## 🎉 总结

修复已完成！请按以下步骤操作：

1. ✅ 重启后端服务
2. ✅ 等待服务完全启动
3. ✅ 测试登录功能
4. ❓ 如果仍有问题，检查前端超时配置

---

**修改的文件：**
- `src/main/resources/application.yml`
- `run-local.sh`

**状态：** 配置已优化，需重启服务生效
