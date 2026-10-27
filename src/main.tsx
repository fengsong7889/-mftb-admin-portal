/**
 * 整站入口（根 `index.html` 引用）。
 * 启动装配在 `src/bootstrap.tsx`，与 `frontend/apps/<app>/src/main.tsx` 共用（方案 §4.1）。
 */
import { mountApp } from './bootstrap'

mountApp()
