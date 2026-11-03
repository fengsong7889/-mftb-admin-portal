/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题切换入口灰度开关。
 *
 * 单独成文件不是为了分类，而是为了**可测**：它读 `import.meta.env`，
 * 属于构建期注入的运行时值，混在纯逻辑模块里会让主题状态层的单测无法控制它
 * （`vi.stubEnv` 对动态属性访问 `env?.KEY` 不生效，实测踩过）。
 * 独立出来后，测试用 `vi.mock('./featureFlag')` 精确替换，被测逻辑保持纯净。
 *
 * 语义：只有显式 `'true'` 才开启，未配置即关闭。
 * 关闭期间主题基础设施（CSS 令牌、ThemeProvider、antd 双套 token）全部就位但入口不露出，
 * 解析结果恒为浅色 —— 这样 Phase 1 可以安全合主干，等裸色值清理到可用程度再开灰度。
 *
 * ⚠️ 这个值必须与首屏引导脚本用的是**同一个构建期常量**：
 * 引导脚本由 vite 插件注入（见 vite.config.ts 的 themeBootstrapPlugin），
 * 插件从 `process.env.VITE_THEME_SWITCH_ENABLED` 取值 —— Vite 会把同名 shell 环境变量
 * 同时注入客户端的 `import.meta.env`，两处因此天然同源。
 * 若两边不一致（脚本按系统偏好写了深色、React 却因开关关闭改回浅色），
 * 深色操作系统的用户每次刷新都会看到一次闪变，而且只在 dev/灰度期出现，极易被当成环境问题漏掉。
 */
export function isThemeSwitchEnabled(): boolean {
  return import.meta.env.VITE_THEME_SWITCH_ENABLED === 'true'
}
