/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 */
/**
 * 首屏主题引导插件（深浅色主题方案 §6.10）—— 从 vite.config.ts 抽出来是为了**可测**。
 *
 * 为什么必须是这一个文件、而不是留在 vite.config.ts 里：
 * 注入判定原先读 `process.env.VITE_THEME_SWITCH_ENABLED`，而客户端 `featureFlag.ts` 读的是
 * `import.meta.env`（= Vite 解析 .env* 后的 `config.env`）。两个源**只在「shell 传变量」时同源**：
 * 写进 `.env.local` 时客户端为 true、Node 侧仍 undefined → **开关半开**：
 * 切换入口出现、深色也能生效（ThemeProvider 挂载后会落 data-theme），
 * 但防 FOUC 的引导脚本没注入，深色下每次刷新先白一下。真上线时若用 `.env.production` 打开，
 * 踩的就是这个洞。所以两侧统一从 `config.env` 取，本文件把这条判据变成可单测的纯函数。
 *
 * order:'pre' + head-prepend：必须在入口 script 与任何样式之前执行，
 * 否则深色主题会先以浅色绘制一帧再跳色（FOUC）。这两个字段是行为契约，由测试钉住。
 */
import { THEME_BOOT_SCRIPT } from './theme-boot-script.mjs'

/** 灰度开关的变量名（客户端与服务端共用同一字符串，避免两处各写一遍写歪） */
export const THEME_FLAG_KEY = 'VITE_THEME_SWITCH_ENABLED'

/**
 * 开关判定：只认 `'true'` 这个字面值。
 * 其它值（未设置 / '1' / 'yes' / 'false'）一律按关闭处理 —— 宁可少开，
 * 因为关闭态是「`<html>` 上没有 data-theme，`:root` 浅色令牌直接生效」这一既有不变量。
 */
export function isThemeSwitchEnabled(env) {
  return env?.[THEME_FLAG_KEY] === 'true'
}

/** Vite 插件工厂：在 configResolved 里拿到与客户端同源的 env，再决定是否注入 */
export function themeBootstrapPlugin() {
  let enabled = false
  return {
    name: 'mftb:theme-bootstrap',
    configResolved(config) {
      enabled = isThemeSwitchEnabled(config?.env)
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (!enabled) return []
        return [{ tag: 'script', children: THEME_BOOT_SCRIPT, injectTo: 'head-prepend' }]
      },
    },
  }
}
