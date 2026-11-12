/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 外卖配送费「$x起」原型展示值。
 *
 * mock 阶段若直接取数据区间最低档，配送费会大量集中于「$0起」、观感失真；
 * 故按门店 key 稳定散列到 0-19 区间随机分配（同一门店刷新/双机对照取值稳定）。
 * 仅用于原型展示；生产口径仍为「当前生效方案最低档」（见说明 id7）。
 */
export function deliveryFromText(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997
  return `$${h % 20}起`
}