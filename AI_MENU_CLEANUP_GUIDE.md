# AI 智能中心菜单重构 - 手动清理步骤

## 问题原因

数据库中已存在旧的 AI 菜单占位数据（从之前的测试或迁移脚本创建），导致 `DataInitializer`的`UPDATE` 条件不满足（placeholderLike=false），因此没有更新父菜单关系。

## 解决方案

### 方法一：手动清理数据库（推荐）

在数据库中执行以下 SQL：

```sql
-- 1. 删除所有与 AI 相关的旧菜单记录
DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%');
DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant';

-- 2. 验证已删除
SELECT COUNT(*) as deleted_count FROM sys_menu WHERE menu_key LIKE '%ai%';
-- 应该显示已删除的数量
```

然后在 IDE 中**重新启动后端**，`DataInitializer`会自动重建正确的菜单树。

### 方法二：使用 Navicat/DBeaver 等数据库管理工具

1. 连接到 MySQL 数据库
2. 执行以下 SQL：
   ```sql
   SELECT id, menu_key, name, parent_id FROM sys_menu WHERE menu_key LIKE '%ai%';
   ```
3. 手动删除显示的菜单记录及其关联权限
4. 重启后端应用

### 方法三：修改 DataInitializer.java（临时方案）

在 `seedSystemMenus()` 方法中添加清理逻辑：

```java
// 在 seedSystemMenus() 方法开头添加
log.info("开始清理旧的 AI 菜单...");
jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%')");
jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%')");
jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant'");
```

重启后端即可。

---

## 验证结果

启动后可以访问以下页面验证菜单是否正常：

1. **首页** - http://localhost:5173/
2. **供应商管理** - http://localhost:5173/ai-model-provider
3. **模型列表** - http://localhost:5173/ai-model-list  
4. **权限管理** - http://localhost:5173/ai-auth
5. **额度策略** - http://localhost:5173/ai-quota

侧边栏应该显示新的层级结构：
```
▼ 智能中心 (AI)
  ├─ ▶ 模型管理
  │   ├─ 供应商管理
  │   └─ 模型列表
  ├─ ▶ 授权与配额
  │   ├─ 权限管理
  │   └─ 额度策略
  ├─ 工具注册中心
  └─ 能耗统计
```

## 相关文件

- `backend/sql/74_split_ai_menus.sql` - 原始菜单拆分脚本（未使用，因为 parent_id 硬编码）
- `backend/src/main/java/com/mftb/admin/config/DataInitializer.java` - 种子数据加载器
- `src/App.tsx` - 路由配置
