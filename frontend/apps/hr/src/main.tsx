/**
 * 应用独立入口（方案 §4.1）：`frontend/apps/hr/index.html` 引用本文件。
 * 启动装配复用共享壳 `src/bootstrap.tsx`；路由差异由构建期别名 `@/app-routes`
 * 指向 `frontend/apps/hr/src/app-routes.ts`（scripts/build-apps.mjs 注入 VITE_APP_ROUTES）。
 */
import { mountApp } from '../../../../src/bootstrap'

mountApp()
