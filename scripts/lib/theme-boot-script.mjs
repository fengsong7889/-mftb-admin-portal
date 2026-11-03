/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 首屏主题引导脚本（防白闪 FOUC）—— 4 个 `index.html` 的**单一真源**。
 *
 * 为什么必须是字符串常量而不是往 4 个 HTML 里各贴一份：
 * 主站 `index.html` 与 `frontend/apps/{eam,hr,rdm}/index.html` 是四份独立文档
 * （`scripts/build-apps.mjs` 用 `VITE_APP_ROOT` 切入口，复用同一份 vite.config.ts）。
 * 手工贴四份必然漂移，后果是某个子系统刷新时白闪一下——而且只在子系统上发生，
 * 平时开发在主站上看不出来，属于典型的「上线才发现」缺陷。
 *
 * 本常量同时被 vite 插件（注入产物）与 `check-theme-tokens` 门禁（校验产物含特征串）消费，
 * 两边共用一份，避免「插件改了校验没改」。
 *
 * 口径与 `theme/index.ts` 的 `resolveTheme()` 必须一致，否则首屏与 React 挂载后
 * 会出现两次主题跳变：
 *   - 记录为 `dark` → 深色
 *   - 记录为 `light` → 浅色
 *   - 无记录 / 记录非法 / 记录为 `system` → 跟随系统 `prefers-color-scheme`
 * 「选跟随系统时删除 key」的约定让「无记录」成为唯一真值口径，不必再存 'system' 字符串。
 *
 * ⚠️ 灰度开关关闭时**不注入本脚本**（由 vite 插件判定），而不是在脚本里再判一次 flag：
 * 没有 data-theme 时 `html[data-theme='dark']` 不匹配、`:root` 浅色令牌自然生效，
 * 与 React 侧「开关关闭恒浅色」的结果一致，因此不存在闪变窗口。
 * 反之若脚本照系统偏好写了深色、React 又改回浅色，深色操作系统的用户每次刷新都会闪一下。
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;d.dataset.theme='light';var p=localStorage.getItem('app_theme');var k=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);d.dataset.theme=k?'dark':'light';}catch(e){/* 隐私模式或禁用 storage 时保持浅色，不得阻断首屏 */}})();`

/** 门禁用来在构建产物里确认脚本已注入的特征串（取脚本中最独特、不会与业务代码撞车的片段） */
export const THEME_BOOT_MARKER = "localStorage.getItem('app_theme')"
