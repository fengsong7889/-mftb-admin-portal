---
description: 前端编码规范。涵盖架构设计、TypeScript 规范、命名与代码风格、第三方组件库版本约束。编写前端代码时必须遵循。
globs:
  - "src/**/*.{ts,tsx}"
alwaysApply: false
---

# 编码规范

### 架构设计
- 采用组件化开发，页面 UI 与业务逻辑分离，业务逻辑优先抽取为自定义 Hooks
- 统一 API 请求层，所有接口请求需经过统一封装的请求实例处理，并统一拦截处理错误提示
- 路由配置需支持按需加载/懒加载，优化首屏加载性能

### TypeScript 规范
- 严格模式开发，禁止滥用 `any` 类型，尽量使用具体类型或泛型
- 所有 API 的请求参数和响应数据必须定义明确的 Interface 或 Type
- 涉及状态、类型等字段需使用常量对象或 TS Enum 定义，代码中严禁出现魔法数字

### 命名与代码风格
- React 组件文件名使用 PascalCase（如 `UserManage.tsx`），工具类或 Hooks 文件名使用 camelCase（如 `useAuth.ts`）
- 样式文件使用原生 CSS（如 `index.css`），通过全局类名隔离
- 事件处理函数命名以 `handle` 开头（如 `handleSubmit`），异步请求函数以 `fetch` 或 `request` 开头

### 第三方组件库

| 库 | 版本 | 用途 |
|---|---|---|
| Ant Design (antd) | ^5.22.0 | 主 UI 组件库 |
| @ant-design/icons | ^5.5.1 | 图标库 |
| @ant-design/charts | ^2.6.7 | 图表组件库 |
| @xyflow/react | ^12.11.1 | 流程图组件库（React Flow v12） |
