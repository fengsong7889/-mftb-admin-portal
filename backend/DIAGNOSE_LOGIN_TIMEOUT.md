# 🔧 立即诊断登录超时问题

## 🎯 当前状态
✅ 后端服务正在运行 (PID: 18569)  
✅ 8080 端口已监听  
✅ 数据库字段 `avatar_url` 已添加

## ❓ 需要你确认的信息

### 1. 登录时具体报什么错误？

**在浏览器开发者工具 Console 中查看：**
```
F12 → Console → 查看报错信息
```

**在 Network 标签中查看：**
```
F12 → Network → 找到 POST /api/auth/login → Response 内容
```

### 2. 错误类型判断

#### A. 如果是 HTTP Timeout/Connection Error:
可能是防火墙、网络或 Tomcat 启动慢

**解决方法：**
```bash
# 重启后端服务
kill -9 18569
./run-local.sh
```

#### B. 如果是 500 Internal Server Error:
查看应用日志

**查看最新日志:**
```bash
tail -100 /Users/yangjingjing/Desktop/SRAS/backend/backend.log
```

或者直接在 IDEA 的 Run 窗口查看输出

#### C. 如果是 401 Unauthorized:
Token 无效或过期

### 3️⃣ 快速测试 API

**测试登录接口是否正常：**
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"MF00001","password":"your-password"}'
```

**替换密码为你实际的密码**

---

## 💡 如果找不到日志

由于你没有实时日志输出，最准确的方法是：

### 方案 1：在 IDEA 中查看日志
1. 打开 IntelliJ IDEA
2. 切换到 **Run** 窗口
3. 查找最近的错误信息

### 方案 2：开启 DEBUG 模式重启
```bash
export LOG_LEVEL=debug
./run-local.sh
```

---

## ⚡ 临时解决方案

如果你能访问数据库，可以测试一下：

**1. 检查用户是否存在:**
```sql
SELECT username, password FROM sys_user WHERE username='MF00001';
```

**2. 测试数据库连接:**
```bash
mysql -h mysql6.sqlpub.com -P 3311 -u fengsong_mt -p fengsong_test -e "SELECT 1;"
```

**3. 验证 avatar_url 字段:**
```bash
mysql -h mysql6.sqlpub.com -P 3311 -u fengsong_mt -p fengsong_test -e "DESC sys_user;" | grep avatar_url
```

---

## 📝 请把以下信息告诉我：

1. **具体的错误消息是什么？**
2. **错误发生在哪个阶段？** (登录按钮点击后多久)
3. **你能看到什么 HTTP 状态码？** (401/500/504/timeout)
4. **前端报错截图或控制台输出**

这样我才能给你最精准的解决方案！🎯
