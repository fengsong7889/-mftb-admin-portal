#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 从 `scripts/lib/theme-token-map.mjs` 的 TOKEN_VALUES / NON_COLOR_TOKENS 生成 `theme.css`。
 *
 * 为什么生成而不是手写：令牌取值有三个消费方（CSS、antd token、映射表的等值判据）。
 * 手写 theme.css 等于再造一份真源，Phase 0 单测已经把「映射表 ↔ 令牌浅色值」的等值判据
 * 机验化，如果主题文件还要靠人抄，判据就只守住了两个源而不是三个。
 *
 * 流程约定：改颜色只改 `TOKEN_VALUES` → 跑本脚本 → 跑 `npm run check:theme-tokens`。
 * 直接手改 theme.css 会被门禁的「生成物与真源一致」断言拦下。
 *
 * 用法：
 *   node scripts/generate-theme-css.mjs            # 生成/覆盖
 *   node scripts/generate-theme-css.mjs --check    # 只校验当前文件是否与真源一致（CI 用）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NON_COLOR_TOKENS, TOKEN_VALUES } from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const OUT = join(ROOT, 'frontend/packages/ui/src/styles/theme.css')

/** 令牌定义顺序 = 分组顺序（surface → text → border → brand → 语义色 → 组件层 → 阴影），保证可读 */
const ALL_TOKENS = { ...TOKEN_VALUES, ...NON_COLOR_TOKENS }

function block(selector, side, extra = []) {
  const lines = [`${selector} {`, ...extra.map((line) => `  ${line}`)]
  for (const [name, values] of Object.entries(ALL_TOKENS)) lines.push(`  --${name}: ${values[side]};`)
  lines.push('}', '')
  return lines.join('\n')
}

function render() {
  const head = `/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * ⚠️ 自动生成文件，请勿手改。
 * 真源：scripts/lib/theme-token-map.mjs 的 TOKEN_VALUES / NON_COLOR_TOKENS
 * 生成：node scripts/generate-theme-css.mjs
 * 校验：npm run check:theme-tokens（比对生成物与真源，手改会被拦下）
 *
 * 改颜色的正确流程：改 TOKEN_VALUES（浅色值 + 深色值 + 实测对比度）→ 跑生成脚本 → 跑门禁。
 * 深色取值规则与实测依据：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §4.3 / §4.5 / §4.6
 *
 * 令牌共 ${Object.keys(ALL_TOKENS).length} 个：语义层 + 组件层（--sidebar-*）+ 阴影/描边补偿。
 * 业务代码只允许引用语义层；--sidebar-* 属组件层，仅壳层 CSS 可用。
 */
`

  // color-scheme 必须声明：否则深色下浏览器原生控件（滚动条、日期输入区、select）仍是白底。
  const parts = [
    head,
    block(':root', 'light', ['color-scheme: light;']),
    block("html[data-theme='dark']", 'dark', ['color-scheme: dark;']),
    `/*
 * 画布底色：必须在 React 挂载前就有值，否则深色主题刷新时会闪一下白底。
 * 这里取 --surface-2（浅色 #FFFFFF）而不是 --surface-1（#F5F5F5）：
 * 浏览器画布现状就是白色，用 surface-1 会让浅色主题的底色变灰 —— 那不再是视觉恒等变换。
 */
html {
  background: var(--surface-2);
}

`,
    // 打印恒浅色：交付物要进邮件与纸质件，深色底在打印上不可读，与 §6.6 导出锁浅色同一口径。
    // 选择器必须带上 html[data-theme='dark']：它的特异性 (0,1,1) 高于 :root (0,1,0)，
    // 只写 :root 覆盖不住深色块，打印仍会带出深色。
    `@media print {\n`,
    `  /* 打印恒浅色（与 html-to-image 导出锁浅色同一口径）*/\n`,
    '  html,\n',
    "  html[data-theme='dark'] {\n",
    Object.entries(ALL_TOKENS).map(([name, v]) => `    --${name}: ${v.light};\n`).join(''),
    '  }\n',
    '}\n',
  ]
  return parts.join('')
}

const content = render()

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error('❌ theme.css 不存在，请先跑 node scripts/generate-theme-css.mjs')
    process.exit(1)
  }
  if (readFileSync(OUT, 'utf8') !== content) {
    console.error('❌ theme.css 与真源 TOKEN_VALUES 不一致（多半是手改了 theme.css）')
    console.error('   正确做法：改 scripts/lib/theme-token-map.mjs 的 TOKEN_VALUES，再跑 node scripts/generate-theme-css.mjs')
    process.exit(1)
  }
  console.log(`✅ theme.css 与真源一致（${Object.keys(ALL_TOKENS).length} 个令牌）`)
  process.exit(0)
}

writeFileSync(OUT, content)
console.log(`✅ 已生成 frontend/packages/ui/src/styles/theme.css（${Object.keys(ALL_TOKENS).length} 个令牌）`)
