# 后端服务启动问题修复说明

## 问题描述

启动后端服务时出现以下错误：
```
java.sql.SQLSyntaxErrorException: Unknown column 'avatar_url' in 'field list'
```

错误发生在 `LoginLogServiceImpl.markTimeoutSessions()` 方法中，当查询用户信息时。

## 根本原因

1. **SysUser 实体类中存在 `avatarUrl` 字段**（第 95-97 行）
2. **数据库表中缺少 `avatar_url` 列**
3. MyBatis-Plus 生成的 SQL 包含 `avatar_url` 字段，导致执行失败

## 已完成修复

### 1. 修复 SysUser.java 注释语法 ✓

在 `/Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/entity/SysUser.java` 中：

**修改前（错误）：**
```java
/* TODO: 添加 avatar_url 字段到数据库
/** 用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL） */
private String avatarUrl;  // ← 这行实际上被注释掉了！
```

**修改后（正确）：**
```java
/** 用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL） */
private String avatarUrl;
```

### 2. 准备数据库迁移脚本 ✓

SQL 脚本已存在：
- 路径：`/Users/yangjingjing/Desktop/SRAS/backend/sql/77_add_avatar_url_column.sql`
- 功能：添加 `avatar_url` 字段并迁移现有数据

### 3. 提供迁移辅助工具 ✓

- 自动化脚本：`migrate-avatar-url.sh`
- 操作说明：`MIGRATION_INSTRUCTIONS.md`

## 下一步操作（必需）

你必须**手动执行一次数据库迁移**来添加 `avatar_url` 字段：

### 方案一：使用自动化脚本（推荐）

```bash
cd /Users/yangjingjing/Desktop/SRAS/backend
chmod +x migrate-avatar-url.sh
./migrate-avatar-url.sh
```

### 方案二：手动执行 SQL

1. **通过 MySQL 命令行客户端：**
```bash
mysql -h localhost -P 3306 -u <用户名> -p <数据库名> <<EOF
ALTER TABLE sys_user 
ADD COLUMN avatar_url VARCHAR(512) COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）' AFTER avatar;

UPDATE sys_user SET avatar_url = avatar WHERE avatar IS NOT NULL AND (avatar LIKE 'https://%' OR avatar LIKE 'http://%');
EOF
```

2. **或者直接在 MySQL 客户端执行：**
   - 打开 SQL 文件：`/Users/yangjingjing/Desktop/SRAS/backend/sql/77_add_avatar_url_column.sql`
   - 复制其中的 SQL 语句执行
   - 可选：验证数据是否迁移成功

### 方案三：使用可视化工具

如果使用 Navicat、MySQL Workbench 等工具：
1. 连接到你的数据库
2. 执行以下 SQL：
```sql
ALTER TABLE sys_user 
ADD COLUMN avatar_url VARCHAR(512) 
COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）' 
AFTER avatar;

UPDATE sys_user SET avatar_url = avatar 
WHERE avatar IS NOT NULL AND (avatar LIKE 'https://%' OR avatar LIKE 'http://%');
```

## 验证迁移成功

执行以下 SQL 查看是否有远程头像数据：
```sql
SELECT username, avatar, avatar_url FROM sys_user WHERE avatar_url IS NOT NULL LIMIT 10;
```

如果有结果，说明迁移成功！

## 启动服务

完成数据库迁移后，正常启动后端服务：
```bash
./mvnw spring-boot:run
```

或其他方式启动 Spring Boot 应用。

## 后续优化建议

1. **将迁移脚本集成到启动初始化器**
   - 当前系统已有 `SchemaVersionTracker` 记录版本
   - 建议将 `77_add_avatar_url_column.sql` 集成进去
   - 避免每次手动执行

2. **检查其他可能的字段遗漏**
   - 确保所有代码中使用的字段都已添加到数据库
   - 可以运行：
     ```bash
     grep -r "private.*;" src/main/java/com/mftb/admin/entity/*.java | grep -v "@Table" | wc -l
     ```

## 总结

这个问题是一个典型的**代码与数据库 schema 不同步**的问题。

**已解决内容：**
- ✅ 修复了 SysUser.java 的注释语法错误
- ✅ 准备了完整的 SQL 迁移脚本
- ✅ 提供了多种迁移方案和操作文档

**你需要做的：**
- ⚠️ **立即执行数据库迁移**（选择上述任一方案）
- ✅ 迁移完成后重启后端服务

---
如果还有任何问题，请查看：
- SQL 脚本：`sql/77_add_avatar_url_column.sql`
- 迁移说明：`MIGRATION_INSTRUCTIONS.md`
- 自动化脚本：`migrate-avatar-url.sh`
