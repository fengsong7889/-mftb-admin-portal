/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 人氣商家皮膚預覽 · 商品示意圖映射
 *
 * AI 生成示意素材（僅供定價/購買頁皮膚預覽展示，非真實商品數據）。
 * 消費方：SkinTemplatePreview（預覽畫布，購買頁 PopularSkinPicker 復用同一畫布）。
 */
import dishBurger from '@/assets/consumer-home/dishes/dish_burger.jpg'
import dishLemonTea from '@/assets/consumer-home/dishes/dish_lemon_tea.jpg'
import dishFries from '@/assets/consumer-home/dishes/dish_fries.jpg'
import dishCoke from '@/assets/consumer-home/dishes/dish_coke.jpg'
import dishIcecream from '@/assets/consumer-home/dishes/dish_icecream.jpg'

export const DISH_IMAGES = {
  dish_burger: dishBurger,
  dish_lemon_tea: dishLemonTea,
  dish_fries: dishFries,
  dish_coke: dishCoke,
  dish_icecream: dishIcecream,
} as const
