/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 瀑布流封面占位：品牌色渐变圆角方块 + 白色品牌字（设计稿口径，待切图后替换回 img）
 *
 * 閃蜂/MFOOD 的团购与外卖四类瀑布流共用；同一 seed 恒取同一色调（key 字符码和取模），
 * 文字取品牌/店名去 emoji 与符号后的前两字。取色仅全局令牌渐变，不新增裸色值。
 */
const TONES = ['t0', 't1', 't2', 't3', 't4', 't5'] as const

/** 稳定取色：seed 字符码和对色调数取模 */
function toneOf(seed: string): (typeof TONES)[number] {
  let h = 0
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % 997
  return TONES[h % TONES.length]
}

/** 品牌/店名去 emoji 与符号后取前两字作为方块文字 */
function textOf(name: string): string {
  return name.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').slice(0, 2) || name.slice(0, 2)
}

export default function BrandCover({ seed, name }: { seed: string; name: string }) {
  return (
    <div className={`apf-cover apf-cover--${toneOf(seed)}`} role="img" aria-label={name}>
      <span>{textOf(name)}</span>
    </div>
  )
}
