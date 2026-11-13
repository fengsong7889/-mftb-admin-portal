/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 閃蜂用户端 · 首页瀑布流数据（纯前端原型 Mock）
 *
 * 首页（ConsumerHome）与全站搜索结果页（ConsumerSearch）共用同一份瀑布流数据：
 * 搜索结果的「外賣/團購」分类与首页完全同源（同数据、同卡片组件），
 * 保证「搜索结果 = 首页同款瀑布流」口径，避免两处 mock 数据漂移。
 *
 * 商品/门店图当前为 AI 生成的统一风格占位图（src/assets/consumer-home/），待设计切图接入后按同名文件替换。
 */
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import hotPosterImg from '@/assets/consumer-home/posters/poster_red.png'
import type { DeliveryStore, HotDish } from './DeliveryStoreCard'
import type { GroupBuyItem } from './GroupBuyFeedCard'

/* ─── 外賣瀑布流門店·基礎 10 家（No.1~No.8 見 DeliveryStoreCard；首頁與搜索結果頁共用） ─── */
export const HOME_DELIVERY_STORES: DeliveryStore[] = [
  { key: 's1', name: '毛氏海鮮火鍋飯店（湘粵融合菜）', isNew: true, brandTag: '品牌', rating: '5.0', monthlySales: '300+', minOrder: '$40', deliveryFee: '$6~12', deliveryTime: '30分鐘', distance: '1.5km', pickupDiscount: '8.8折', tags: ['全澳人气店铺', '近期百人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: fishPotImg, deliveryType: 'pickup', merchantId: 'dl-mao', coverVideo: true },
  { key: 's2', name: '大力·烤肉飯·燒烤·川式快餐', brandTag: '独家', rating: '4.8', monthlySales: '5000+', minOrder: '$40', deliveryDiscount: '$0~6', deliveryTime: '29分鐘', distance: '1.4km', tags: ['全澳销量前10%', '千人收藏好店'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '300減3' }, { kind: 'coupon', text: '領券 $10' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-dali', businessState: 'closed', closedReason: '休息一会，马上回来' },
  { key: 's3', noRating: true, name: '芭提雅·豪華店🇹🇭（正宗泰國廚師）', brandTag: '连锁', rating: '4.8', monthlySales: '1000+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '29分鐘', distance: '1.9km', punctual: true, tags: ['高仕德热门店铺', '百人收藏好店'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $6' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '6.5折起' }, { kind: 'red', text: '180减9' }, { kind: 'red', text: '110减6' }, { kind: 'red', text: '80减4' }, { kind: 'red', text: '到店自取9.5折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: riceballImg, pickupDiscount: '9.5折', deliveryType: 'pickup', merchantId: 'dl-thai1', closingCountdown: '00:21:45' },
  { key: 's4', name: '芭提雅·豪華店（MaMa麵）', rating: '4.4', monthlySales: '100+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '28分鐘', distance: '2.4km', pickupDiscount: '9.8折', tags: [], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: friedChickenImg, deliveryType: 'pickup', merchantId: 'dl-thai2', businessState: 'closed', closedReason: '休息打烊' },
  { key: 's5', name: '聚緣過橋米線館-🏆冠軍店', brandTag: '金牌', rating: '4.8', monthlySales: '3000+', minOrder: '$40', freeDelivery: true, deliveryTime: '32分鐘', distance: '2.3km', punctual: true, tags: ['全澳米粉面馆销量第1名', '全澳回头率超高店铺'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨至$30' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '新客券 $5' }] }, { label: '活动', tags: [{ kind: 'red', text: '7折起' }, { kind: 'red', text: '150减8' }, { kind: 'red', text: '到店自取9折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-jy' },
  { key: 's6', name: '悅享家庭廚房（免配送費示範店）', isNew: true, rating: '4.9', monthlySales: '800+', minOrder: '$30', freeDelivery: true, deliveryTime: '25分鐘', distance: '800m', tags: [], memberTags: [{ kind: 'shen', text: '$15' }, { kind: 'red', text: '200減5' }], image: fishPotImg, pickupDiscount: '9.2折', deliveryType: 'pickup', merchantId: 'dl-free', closingCountdown: '00:04:02', coverVideo: true },
  { key: 's7', noRating: true, name: '盛記燒味茶餐廳（新埠島店）', isNew: true, brandTag: '独家', rating: '4.7', monthlySales: '600+', minOrder: '$35', deliveryDiscount: '$0~4', deliveryTime: '27分鐘', distance: '3.2km', tags: ['高仕德销量第1名', '近期千人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'coupon', text: '領券 $5' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-sj' },
  { key: 's8', name: '小胖麵館（連鎖·北區店）', isNew: true, brandTag: '连锁', rating: '4.6', monthlySales: '2000+', minOrder: '$35', freeDelivery: true, deliveryTime: '26分鐘', distance: '1.1km', tags: ['全澳米粉面馆人气店铺', '万人收藏好店'], memberTags: [{ kind: 'shen', text: '$20' }], image: riceballImg, pickupDiscount: '8.5折', deliveryType: 'pickup', merchantId: 'dl-xp', closingCountdown: '00:14:03' },
  { key: 's9', name: '川渝人家（澳門店）', brandTag: '金牌', rating: '4.7', monthlySales: '1500+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '35分鐘', distance: '4.6km', tags: ['全澳热门店铺', '高仕德好评店铺'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }, { kind: 'red', text: '满60減8' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'dl-cy', businessState: 'closed', closedReason: '爆单啦，暂停接单一会' },
  { key: 's10', name: '早安豆漿舖（筷子基新店）', isNew: true, rating: '4.5', monthlySales: '90+', minOrder: '$20', freeDelivery: true, deliveryTime: '20分鐘', distance: '600m', tags: [], memberTags: [{ kind: 'shen', text: '$8' }], image: lemonTeaImg, pickupDiscount: '9折', deliveryType: 'pickup', merchantId: 'dl-za', businessState: 'preorder', preorderTime: '07:30' },
]

/* ─── 人氣商家廣告門店（購買廣告皮膚後點亮；配色取 SMALL_SKIN_TEMPLATES / FALLBACK_POSTERS 真源）───
   僅首頁瀑布流展示（拼在基礎門店後）；搜索結果頁外賣瀑布流不含廣告門店（需求：去掉最後幾個人氣商家） */
export const HOME_DELIVERY_AD_STORES: DeliveryStore[] = [
  { key: 's11', name: '朱記燒臘飯店（氹仔店）', rating: '4.7', monthlySales: '900+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '31分鐘', distance: '2.7km', tags: ['全澳回头率超高店铺', '近期万人下单'], memberTags: [{ kind: 'shen', text: '$10' }, { kind: 'red', text: '满50減4' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-zhu', hotSkin: { mode: 'small', templateKey: 'small_red' } },
  { key: 's12', name: '譚家三哥米線（北區店）', rating: '4.6', monthlySales: '2600+', minOrder: '$40', freeDelivery: true, deliveryTime: '28分鐘', distance: '1.2km', tags: ['全澳米粉面馆热门店铺', '近期十万人下单'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: riceballImg, deliveryType: 'platform', merchantId: 'dl-tan', closingCountdown: '00:28:16', hotSkin: { mode: 'small', templateKey: 'small_amber' } },
  { key: 's13', name: '上海生煎王 ❤ 限時$30小炒木桶飯', rating: '4.6', monthlySales: '1200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '30分鐘', distance: '1.6km', tags: ['全澳人气店铺', '百万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: burgerImg, deliveryType: 'platform', merchantId: 'dl-shjw', hotSkin: { mode: 'large', posterKey: 'poster_red', posterImage: hotPosterImg, posterBrand: '上海生煎王\n小炒木桶飯', posterMascot: '🐝', dishes: [ { name: '1.農家小炒肉木桶飯', image: fishPotImg, discount: '8.7折', price: '40', origin: '46' }, { name: '2.上海生煎（4只）', image: riceballImg, price: '64' }, { name: '3.麻辣豆腐（套餐）', image: friedChickenImg, price: '28' } ] } },
]

/* ─── 搜索結果頁外賣瀑布流專用列表：基礎門店 + 超出配送範圍 / 未入駐商家樣例（不含人氣商家廣告）───
   圖2 口徑：超出範圍門店 = LOGO 蒙暗色阴影，「超出範圍」白膠囊寫在阴影上，其餘信息正常（展示信息不用抄參考圖的標籤堆砌）；
   圖3 口徑：未入駐商家 = 評分「暫無」，無標籤/紅包區，LOGO 不加標識 */
/* ─── 搜索结果外卖瀑布流·商品横滑行 mock（仅搜索列表附加；首页/频道页不展示） ─── */
const SEARCH_PRODUCTS: HotDish[] = [
  { name: 'Shake爆薯條', image: friedChickenImg, price: '25', origin: '28' },
  { name: '番鬼佬豬扒包', image: burgerImg, price: '58' },
  { name: '傳統佬澳葡飯', image: riceballImg, price: '58' },
  { name: '珍珠奶茶', image: lemonTeaImg, price: '16', origin: '20' },
  { name: '招牌魚蛋粉', image: fishPotImg, price: '32' },
]

const HOME_DELIVERY_SEARCH_BASE: DeliveryStore[] = [
  ...HOME_DELIVERY_STORES,
  { key: 's14', name: '燒鵝仔餐廳（路環店）', rating: '4.7', monthlySales: '2000+', minOrder: '$0', deliveryFee: '$0', deliveryTime: '24分鐘', distance: '5.6km', tags: ['千人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨至$30' }], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-oos', outOfRange: true },
  { key: 's15', name: '小貝廚房（關閘店）', rating: '0', monthlySales: '0', minOrder: '$0', deliveryFee: '$0', deliveryTime: '30分鐘', distance: '1.6km', tags: [], memberTags: [], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'dl-nj', notJoined: true },
]
export const HOME_DELIVERY_SEARCH_STORES: DeliveryStore[] = HOME_DELIVERY_SEARCH_BASE.map((s, i): DeliveryStore => (s.notJoined ? s : {
  ...s,
  products: [
    SEARCH_PRODUCTS[i % SEARCH_PRODUCTS.length],
    SEARCH_PRODUCTS[(i + 1) % SEARCH_PRODUCTS.length],
    SEARCH_PRODUCTS[(i + 2) % SEARCH_PRODUCTS.length],
  ],
}))

/* ─── 團購瀑布流券（共享 GroupBuyFeedCard） ─── */
export const HOME_GROUPBUY_FEED: GroupBuyItem[] = [
  { key: 'f1', brand: '魚🐟日本料理', title: '200蚊代250蚊券 葉林極上日料放題💕炒', image: fishPotImg, isNew: true, typeLabel: '酒', halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '30', discountNote: '降價超20%，勁慳$60', ratingNote: '4.7', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp1', pointPrice: true },
  { key: 'f2', brand: '魚🐟日本料理', title: '200蚊代250蚊券 葉林極上日料放題💕炒', image: burgerImg, halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', ratingNote: '4.7', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp2' },
  { key: 'f3', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: riceballImg, isNew: true, halfYearSales: 416, price: '25.9', origin: '80', ratingNote: '4.5', dist: '5.3km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋🔥小炒...', merchantId: 'd-hn' },
  { key: 'f4', brand: '聯豐', title: '雞蛋10只（散裝）', image: lemonTeaImg, halfYearSales: 5066, customTags: ['性價比之選'], price: '8.8', origin: '15.9', pointPrice: true, dist: '7.1km', area: '筷子基', shop: '聯豐宅鮮餸（筷子基店）', merchantId: 'd-egg' },
  { key: 'f5', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: fishPotImg, halfYearSales: 416, customTags: ['1人餐', '蜂蜜抵$2'], price: '25.9', origin: '80', dist: '5.0km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋🔥小炒...', merchantId: 'd-xc', flashBadge: '秒殺', flashCountdown: '07:36:58', flashBadgePos: 'top', grabbedLabel: '已搶30%', grabbedPct: 30, ctaText: '秒', discountNote: '秒殺價3.2折,降價超68%', ratingNote: '4.5' },
]
