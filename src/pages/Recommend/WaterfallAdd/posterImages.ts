/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 人氣商家兜底海報 · 真實圖映射
 *
 * key 與 popularSkinTemplates.FALLBACK_POSTERS 一一對應（11 張），
 * 圖源為設計參考圖逐張切圖（原為漸變 SVG 佔位，2026-11 換真實海報）。
 * 消費方：SkinTemplateSection（定價選圖網格）、SkinTemplatePreview（預覽畫布，
 * 購買頁 PopularSkinPicker 復用同一畫布自動跟隨）。
 */
import posterRed from '@/assets/consumer-home/posters/poster_red.png'
import posterOrange from '@/assets/consumer-home/posters/poster_orange.png'
import posterAmber from '@/assets/consumer-home/posters/poster_amber.png'
import posterPurple from '@/assets/consumer-home/posters/poster_purple.png'
import posterMagenta from '@/assets/consumer-home/posters/poster_magenta.png'
import posterPink from '@/assets/consumer-home/posters/poster_pink.png'
import posterBlue from '@/assets/consumer-home/posters/poster_blue.png'
import posterGreen from '@/assets/consumer-home/posters/poster_green.png'
import posterTeal from '@/assets/consumer-home/posters/poster_teal.png'
import posterBrown from '@/assets/consumer-home/posters/poster_brown.png'
import posterGold from '@/assets/consumer-home/posters/poster_gold.png'

export const FALLBACK_POSTER_IMAGES: Record<string, string> = {
  poster_red: posterRed,
  poster_orange: posterOrange,
  poster_amber: posterAmber,
  poster_purple: posterPurple,
  poster_magenta: posterMagenta,
  poster_pink: posterPink,
  poster_blue: posterBlue,
  poster_green: posterGreen,
  poster_teal: posterTeal,
  poster_brown: posterBrown,
  poster_gold: posterGold,
}
