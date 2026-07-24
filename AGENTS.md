# AGENTS.md — Agent 操作指南

> 本文件为 AI Agent 和开发者提供项目操作所需的关键信息。
> 版本控制追踪，所有协作者共享。

## 项目概述

闪蜂推广管理后台（admin-portal）— 基于 React 18 + Vite 6 + Ant Design 5 的管理后台系统。

## 运行时版本

| 依赖 | 版本 |
|------|------|
| Node.js | 20（CI 固定版本） |
| npm | 随 Node 20 附带 |
| TypeScript | ^5.6.3 |
| Vite | ^6.0.1 |

## 常用命令

```bash
# 安装依赖（必须使用 --legacy-peer-deps）
npm ci --legacy-peer-deps

# 本地开发
npm run dev

# 类型检查（不产出文件）
npm run typecheck

# 构建（含类型检查）
npm run build:strict

# 构建（跳过类型检查，仅打包）
npm run build

# Lint 检查
npm run lint

# Lint 自动修复
npm run lint:fix

# 运行测试（watch 模式）
npm run test

# 运行测试（单次）
npm run test:run

# 测试覆盖率
npm run test:coverage

# 安全扫描（检测硬编码凭据）
npm run secret-scan
```

## 关键约束

1. **安装必须使用 `--legacy-peer-deps`**：项目存在 peer dependency 冲突，不加此参数安装会失败。
2. **类型检查**：`tsconfig.json` 启用 `strict: true`，CI 使用 `build:strict`（`tsc && vite build`）执行类型检查。
3. **环境变量**：Mock 认证凭据通过 `.env.local`（已 gitignore）注入，参考 `.env.example`。
4. **路径别名**：`@/` 映射到 `src/`，在 `tsconfig.json` 和 `vite.config.ts` 中同步配置。

## 项目结构

```
src/
├── components/       # 共享组件（HeaderBar, Sidebar, ContentArea 等）
├── constants/        # 常量定义（品牌、枚举）
├── contexts/         # React Context（AuthContext）
├── hooks/            # 自定义 Hooks（useColumnConfig）
├── pages/            # 页面组件（按功能模块分目录）
│   ├── Home/         # 首页工作台
│   ├── Login/        # 登录页
│   ├── Recommend/    # 推荐管理
│   ├── SearchConfigNew/  # 搜索配置
│   ├── PromotionReport/  # 推广报表
│   ├── Permission/   # 权限管理
│   └── ...
├── styles/           # 全局样式（components.css, global.css）
├── App.tsx           # 根组件（路由配置）
└── main.tsx          # 入口文件
```

## CI/CD

- **平台**：GitHub Actions → GitHub Pages
- **触发**：push 到 main 分支
- **质量门禁**：lint + typecheck + test + secret-scan（任一失败中止部署）
- **部署**：`actions/deploy-pages@v4`

## 测试

- **框架**：Vitest + @testing-library/react
- **环境**：jsdom
- **配置**：`vitest.config.ts`
- **测试文件**：`src/**/*.{test,spec}.{ts,tsx}`
- **Setup**：`src/test/setup.ts`（localStorage mock、matchMedia mock）

## Lint

- **框架**：ESLint 9（Flat Config）
- **配置**：`eslint.config.js`
- **规则**：TypeScript ESLint recommended + React Hooks 核心规则
- **已知警告**：现有代码库存在约 300 个 warning（unused vars、any 类型），渐进修复中

## 设计规范

UI/UX 设计规范详见 `.qoder/rules/System-rules.md`（含色彩体系、圆角、阴影、间距、字体、交互效果等完整设计令牌）。
