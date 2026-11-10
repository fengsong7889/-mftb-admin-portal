/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD 瀑布流团购券数据（首页「特價團購」与特惠團購页共用唯一真源）
 *
 * 独立成模块：MfoodHome 同时导出组件与常量会触发 react-refresh 门禁警告，
 * 数据外置后两页 import 同一份 FEED，改数据只改一处。
 * 占位数据口径同 MfoodHome（不进语言包，二期统一接 i18n）。
 */
import burgerImg from '@/assets/consumer-home/burger.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import type { GroupBuyItem } from './GroupBuyFeedCard'

export const FEED: GroupBuyItem[] = [
  { key: 'a1', brand: '新華順', title: '【連環賞推薦】50元代60元券（新華順）', image: fishPotImg, isNew: true, typeLabel: '酒', halfYearSales: 0, customTags: ['新品推薦'], price: '50', origin: '60', ratingNote: '4.6', dist: '4.9km', area: '台山', shop: '新華順(台山-花雕雞瀨粉)', merchantId: 'm-1' },
  { key: 'a2', brand: '慶記冰室', title: '超值下午茶套餐', image: burgerImg, halfYearSales: 68, customTags: ['新品推薦'], price: '24', origin: '43', ratingNote: '4.5', dist: '5.1km', area: '筷子基', shop: '慶記冰室🌟招牌蒸飯/焗...', merchantId: 'm-2' },
  { key: 'a3', brand: '福隆煌', title: '🍜招牌牛肉麵/粉', image: riceballImg, isNew: true, halfYearSales: 0, customTags: ['新品推薦'], price: '33', origin: '38', ratingNote: '4.8', dist: '6.4km', area: '新馬路', shop: '福隆煌（福隆新街店）', merchantId: 'm-3' },
  { key: 'a4', brand: '金庫餐廳', title: '金庫餐廳澳門元200餐飲折扣券', image: friedChickenImg, halfYearSales: 54, customTags: ['新品推薦'], price: '120', origin: '20', discountNote: '降價超40%，勁慳$80', pointPrice: true, ratingNote: '4.6', dist: '6.6km', area: '新口岸', shop: '金庫餐廳', merchantId: 'm-4' },
  { key: 'a5', brand: '峰盛比薩', title: '雅廉訪總店主廚特選【僅限自取】', image: burgerImg, halfYearSales: 1, customTags: ['新品推薦'], price: '68', origin: '152', ratingNote: '4.7', dist: '5.9km', area: '高士德', shop: 'Lavish Pizza峰盛比薩(雅...', merchantId: 'm-5', flashBadge: '秒殺', flashCountdown: '1天 07:38:18', flashBadgePos: 'bottom', remainingLabel: '剩餘50份', remainingPct: 50, ctaText: '秒殺', discountNote: '秒殺補貼，享4.5折' },
]
