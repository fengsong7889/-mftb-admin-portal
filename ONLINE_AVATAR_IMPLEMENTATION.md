# 在线头像功能实现说明

## 功能概述
新增从 IconFont 网站获取卡片头像并保存用户选择的功能，支持在线加载和持久化存储。

## 实现内容

### 1. 前端改动

#### API 层 (`src/api/iconfont.ts`)
新建文件，提供以下接口：
- `fetchIconFontAvatars(keyword, page, pageSize)` - 获取 IconFont 头像列表
- `saveUserAvatarUrl(avatarUrl)` - 保存用户选中的头像 URL
- `getUserSavedAvatarUrl()` - 获取用户已保存的头像 URL

#### 组件层 (`src/components/HeaderBar.tsx`)
更新头像弹窗，增加以下功能：

**搜索功能：**
- 实时搜索 IconFont 头像（关键词如：卡通、商务、可爱等）
- 支持分页加载（每页 40 个，最多 3 页演示数据）

**交互逻辑：**
1. 点击"更换头像"→选择"IconFont 头像"标签
2. 输入关键词搜索或保持默认"卡通头像"
3. 点击"搜索"按钮获取头像列表
4. 点击头像预选中（橙色边框高亮）
5. 点击"确认"应用并保存到后端
6. 下次登录直接显示该头像

**保存机制：**
- 选择头像后同时保存到两处：
  - `avatar` 字段：用于 Base64/pikachu 标识
  - `avatar_url` 字段：专门存储在线 URL（HTTPS）
- 读取时优先使用 avatar_url，降级到 avatar 字段

#### 国际化 (`src/i18n/locales/*.json`)
添加翻译文本：
- `iconfontLoadFailed`: 载入失败提示
- `avatarTabOnline`: 重命名为 "IconFont 头像"

### 2. 后端改动

#### Controller (`backend/src/main/java/com/mftb/admin/controller/IconfontController.java`)
新建控制类，提供：
```java
GET /api/iconfont/avatars?q={keyword}&page={1}&pageSize={40}
```

**模拟数据结构：**
- 目前返回占位图（https://placehold.co/）
- 每个头像包含：id, title, icon_url, category

**未来扩展方向：**
- 替换为真实的 IconFont 爬虫或使用第三方 API
- 缓存机制避免重复请求

#### Controller (`backend/src/main/java/com/mftb/admin/controller/AuthController.java`)
新增两个接口：

**保存头像 URL：**
```java
PUT /api/auth/avatar-url
Body: { "avatarUrl": "https://..." }
```

**获取头像 URL：**
```java
GET /api/auth/avatar-url
Response: { code: 200, data: "https://..." | null }
```

**容错处理：**
- 如果数据库没有 avatar_url 字段，会降级错误
-  fallback 逻辑使用 avatar 字段远程 URL

#### 实体类 (`backend/src/main/java/com/mftb/admin/entity/SysUser.java`)
新增字段：
```java
private String avatarUrl; // 用户选中的在线头像 URL
```

#### SQL 迁移脚本 (`backend/sql/77_add_avatar_url_column.sql`)
执行命令：
```sql
ALTER TABLE sys_user 
ADD COLUMN avatar_url VARCHAR(512) COMMENT '用户选中的在线头像 URL（IconFont/DiceBear 等外部 URL）' AFTER avatar;

-- 迁移现有远程 URL 数据
UPDATE sys_user SET avatar_url = avatar 
WHERE avatar IS NOT NULL AND (avatar LIKE 'https://%') OR (avatar LIKE 'http://%');
```

## 使用流程

### 用户使用流程
1. **查看当前头像**：右上角下拉菜单 → "更换头像"
2. **选择在线头像**：切换 Tab → "IconFont 头像"
3. **搜索头像**：输入关键词（如：卡通、商务、萌趣），点击"搜索"按钮
4. **预览头像**：鼠标悬停显示标题，点击选中（橙色边框）
5. **确认应用**：点击"确认"按钮，头像立即生效
6. **持续使用**：下次登录自动加载该头像 URL

### 技术流程
```
前端：fetchIconFontAvatars()
    ↓
后端：IconfontController.getAvatars()
    ↓
返回模拟数据（placeholder）
    ↓
前端展示网格列表
    ↓
用户选中 → 调用 saveUserAvatarUrl()
    ↓
后端：AuthController.saveAvatarUrl()
    ↓
数据库：UPDATE sys_user SET avatar_url=? WHERE username=?
```

## 注意事项

### ⚠️ 重要说明
1. **数据源限制**：当前 Avatar 数据是模拟的 placeholder 图片，不是真实 IconFont 资源
   - 原因：IconFont 未公开 API，需要爬虫解析网页
   - 影响：用户体验较差，头像都是占位图
   
2. **生产环境建议方案**：
   - 方案 A：自行爬取 IconFont 并自建头像库（推荐）
   - 方案 B：对接其他免费头像 API（DiceBear 已存在）
   - 方案 C：用户上传自定义头像（已有"上传头像"Tab）
   
3. **兼容性设计**：
   - avatar_url 字段可选，旧系统仍可使用 avatar 字段
   - 读取时双重 fallback：avatar_url → avatar
   - 写入时同时更新两处（确保向后兼容）

### 📋 部署步骤
1. 执行 SQL 脚本：
   ```bash
   mysql -u root -p admin_db < backend/sql/77_add_avatar_url_column.sql
   ```

2. 重启后端服务以加载新字段

3. 前端无需构建配置（TypeScript 会自动识别新类型）

4. 测试验证：
   - 打开头像设置页面
   - 尝试搜索并选择一个头像
   - 刷新页面确认持久化效果

## 后续优化方向

### 🔧 技术优化
1. **真实数据集成**
   - 开发爬虫抓取 IconFont 卡片头像
   - 本地缓存热门头像减少外部依赖
   - 定期同步更新头像库

2. **性能优化**
   - 头像图片懒加载 + 预加载
   - CDN 加速静态资源
   - Browser cache 策略

3. **用户体验**
   - 头像分类筛选（商务、卡通、动漫等）
   - 收藏功能（常用头像快速访问）
   - 批量导入 IconFont 图标

### 🎨 视觉增强
1. 加载动画优化（骨架屏代替 Spin）
2. 头像裁剪/编辑工具（上传后调整）
3. AI 生成头像（接入 LLM 服务）

## 相关文件清单

### 前端文件
- ✅ `/src/api/iconfont.ts` - IconFont API 封装
- ✅ `/src/components/HeaderBar.tsx` - 头像弹窗主逻辑
- ✅ `/src/i18n/locales/en.json` - 英文翻译
- ✅ `/src/i18n/locales/zh-TW.json` - 繁体翻译

### 后端文件
- ✅ `/backend/src/main/java/com/mftb/admin/controller/IconfontController.java` - IconFont 控制器
- ✅ `/backend/src/main/java/com/mftb/admin/controller/AuthController.java` - 新增头像 URL 接口
- ✅ `/backend/src/main/java/com/mftb/admin/entity/SysUser.java` - 新增 avatarUrl 字段
- ✅ `/backend/sql/77_add_avatar_url_column.sql` - 数据库迁移脚本

## 已知问题与待办事项

### ❌ 已知问题
1. Placeholder 头像不够真实（需爬虫实现）
2. 无头像下载缓存（每次重新加载）
3. 无法查看头像原始链接

### 📝 待办任务
- [ ] 开发 IconFont 爬虫程序
- [ ] 建立本地头像存储服务
- [ ] 增加头像分类/筛选功能
- [ ] 添加头像预览放大功能
- [ ] 支持头像评分/投票

## 参考资源
- IconFont 官网：https://www.iconfont.cn/search/index?searchType=icon&q=%E5%8D%A1%E9%80%9A%E5%A4%B4%E5%83%8F
- DiceBear API：https://api.dicebear.com/9.1/
- Ant Design 头像规范：https://ant.design/components/avatar-cn
