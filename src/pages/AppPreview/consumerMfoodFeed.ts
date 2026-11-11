/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * MFOOD 用户端 · 瀑布流数据（纯前端原型 Mock）
 *
 * - MFOOD_STORES：首页/美食外賣频道页共用的外賣門店瀑布流（原内联于 MfoodHome，抽出的同时
 *   供搜索结果页复用）；与閃蜂数据互不共用（门店信息为 MFOOD 独立内容，仅形态逐位对齐）。
 * - MFOOD_NEAR_STORES：特惠團購页「附近好店」页签瀑布流（原内联于 MfoodGroupBuy）。
 * - 搜索结果页专用列表 = 基础数据（不含人气商家广告）+ 超出范围/未入驻/开业时间展示样例，
 *   口径与閃蜂搜索结果页一致（同理复刻）。
 */
import burgerImg from '@/assets/consumer-home/burger.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import hotPosterOrangeImg from '@/assets/consumer-home/posters/poster_orange.png'
import type { MfoodStore, MfoodHotDish } from './MfoodDeliveryStoreCard'
import type { PreferredMerchant, PreferredGood } from './PreferredMerchantCard'

/* ─── 美食外賣門店瀑布流（MFOOD 专属组件 MfoodDeliveryStoreCard；勁爆券皮）
   门店顺序与閃蜂 DELIVERY_STORES 逐位形态对齐（新店/品质标签/打烊三态/预定/免配送費/自取/準時寶/
   会员展开/人气商家大小图逐位同位，便于双机并排逐行对比） ─── */
export const MFOOD_STORES: MfoodStore[] = [
  /* 1. 对齐閃蜂 s1：新店 + 品牌 + 自取折扣 + 正常营业 */
  { key: 'ms1', name: '恆友魚蛋王（三盞燈總店）', isNew: true, brandTag: '品牌', rating: '4.9', monthlySales: '500+', minOrder: '$40', deliveryFee: '$5~10', deliveryTime: '30分鐘', distance: '1.3km', pickupDiscount: '8.8折', tags: ['全澳热门店铺', '近期千人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: fishPotImg, deliveryType: 'pickup', merchantId: 'mf-hangyau', coverVideo: true },
  /* 2. 对齐閃蜂 s2：独家 + 已打烊·休息一会 */
  { key: 'ms2', name: '大堂街炸雞（總店）', brandTag: '独家', rating: '4.8', monthlySales: '4000+', minOrder: '$40', deliveryDiscount: '$0~6', deliveryTime: '29分鐘', distance: '1.4km', tags: ['全澳销量第1名', '万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满50減4' }, { kind: 'coupon', text: '領券 $10' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'mf-taihong', businessState: 'closed', closedReason: '休息一会，马上回来' },
  /* 3. 对齐閃蜂 s3：连锁 + 準時寶 + 会員可展開 */
  { key: 'ms3', name: '龍卷堂（賈伯樂總店）', brandTag: '连锁', rating: '4.8', monthlySales: '2000+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '29分鐘', distance: '1.9km', punctual: true, tags: ['高士德飯糰包類人氣第1名', '全澳飯糰包類銷量第1名'], memberTags: [{ kind: 'point', text: '双倍抵$10元' }, { kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '6.5折起' }, { kind: 'red', text: '180减9' }, { kind: 'red', text: '110减6' }, { kind: 'red', text: '80减4' }, { kind: 'red', text: '到店自取9.5折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '双倍抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-long', closingCountdown: '00:18:32' },
  /* 4. 对齐閃蜂 s4：无标签 + 自取折扣 + 已打烊·休息打烊 */
  { key: 'ms4', name: '世記咖啡（皇朝店）', rating: '4.4', monthlySales: '200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '28分鐘', distance: '2.6km', pickupDiscount: '9.8折', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $4' }], image: burgerImg, deliveryType: 'pickup', merchantId: 'mf-saigai', businessState: 'closed', closedReason: '休息打烊' },
  /* 5. 对齐閃蜂 s5：金牌 + 免配送費 + 準時寶 + 会員可展開 */
  { key: 'ms5', name: '六記粥麵（新馬路總店-🏆冠軍店）', brandTag: '金牌', rating: '4.8', monthlySales: '3000+', minOrder: '$40', freeDelivery: true, deliveryTime: '32分鐘', distance: '2.1km', punctual: true, tags: ['全澳米粉面馆销量第1名', '全澳好评店铺'], memberTags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $8' }], memberSections: [ { label: '券包', tags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $8' }, { kind: 'red', text: '領券 $10 | 5 | 4' }] }, { label: '活动', tags: [{ kind: 'red', text: '7折起' }, { kind: 'red', text: '150减8' }, { kind: 'red', text: '100减5' }, { kind: 'red', text: '到店自取9折' }, { kind: 'red', text: '收藏有禮' }] }, { label: '其它', tags: [{ kind: 'point', text: '积分抵$10元' }, { kind: 'green', text: '食得健康' }, { kind: 'gray', text: '支持自取' }] } ], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-luk' },
  /* 6. 对齐閃蜂 s6：新店 + 无标签 + 免配送費 + 近距離 */
  { key: 'ms6', name: '晨光早點（北區新店）', isNew: true, rating: '4.9', monthlySales: '800+', minOrder: '$30', freeDelivery: true, deliveryTime: '25分鐘', distance: '900m', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满30減3' }], image: burgerImg, deliveryType: 'self', merchantId: 'mf-morning', closingCountdown: '00:07:18', coverVideo: true },
  /* 7. 对齐閃蜂 s7：新店 + 独家 + 起送$35·減配 */
  { key: 'ms7', name: '杏香園餅店（氹仔舊城區店）', isNew: true, brandTag: '独家', rating: '4.7', monthlySales: '700+', minOrder: '$35', deliveryDiscount: '$0~4', deliveryTime: '27分鐘', distance: '3.2km', tags: ['高仕德热门店铺', '近期99人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'coupon', text: '領券 $5' }], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-hang' },
  /* 8. 对齐閃蜂 s8：新店 + 连锁 + 免配送費 */
  { key: 'ms8', name: '泉記美食廣場（連鎖·亞利鴉架街店）', isNew: true, brandTag: '连锁', rating: '4.6', monthlySales: '2000+', minOrder: '$35', freeDelivery: true, deliveryTime: '26分鐘', distance: '1.1km', tags: ['全澳人气店铺', '十万人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $6' }], image: friedChickenImg, deliveryType: 'self', merchantId: 'mf-quan', closingCountdown: '00:26:40' },
  /* 9. 对齐閃蜂 s9：金牌 + 已打烊·爆单 */
  { key: 'ms9', name: '鳳城珠記酒家（新口岸店）', brandTag: '金牌', rating: '4.7', monthlySales: '1500+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '35分鐘', distance: '4.6km', tags: ['高仕德回头率超高店铺', '89人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满80減10' }], image: fishPotImg, deliveryType: 'platform', merchantId: 'mf-fcsz', businessState: 'closed', closedReason: '爆单啦，暂停接单一会' },
  /* 10. 对齐閃蜂 s10：新店 + 无标签 + 免配送費 + 接受预定 */
  { key: 'ms10', name: '佛笑樓三明治專門店（筷子基新店）', isNew: true, rating: '4.5', monthlySales: '90+', minOrder: '$20', freeDelivery: true, deliveryTime: '20分鐘', distance: '600m', tags: [], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-fsl', businessState: 'preorder', preorderTime: '07:30' },
  /* 11. 对齐閃蜂 s11：人气商家小图（MFOOD 用魅紫配色） */
  { key: 'ms11', name: '洪馨椰子雪糕（果欄街店）', rating: '4.7', monthlySales: '900+', minOrder: '$40', deliveryDiscount: '$0~5', deliveryTime: '31分鐘', distance: '2.7km', tags: ['高仕德好评店铺', '近期万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'red', text: '满50減4' }], image: riceballImg, deliveryType: 'platform', merchantId: 'mf-hunghing', hotSkin: { mode: 'small', templateKey: 'small_purple' } },
  /* 12. 对齐閃蜂 s12：人气商家小图 + 免配送費（MFOOD 用湖青配色） */
  { key: 'ms12', name: '盛香亭滷味（關閘店）', rating: '4.6', monthlySales: '2600+', minOrder: '$40', freeDelivery: true, deliveryTime: '28分鐘', distance: '1.2km', tags: ['全澳销量前10%', '近期十万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: friedChickenImg, deliveryType: 'platform', merchantId: 'mf-sheng', hotSkin: { mode: 'small', templateKey: 'small_teal' } },
  /* 13. 对齐閃蜂 s13：人气商家大圖拼列（MFOOD 用暖橙海報） */
  { key: 'ms13', name: '海灣咖啡美食 ☕ 限時$26雙拼下午茶', rating: '4.6', monthlySales: '1200+', minOrder: '$40', deliveryDiscount: '$0~3', deliveryTime: '30分鐘', distance: '1.6km', tags: ['全澳人气店铺', '近期千万人下单'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }, { kind: 'green', text: '新客券 $5' }], image: fishPotImg, deliveryType: 'platform', merchantId: 'mf-bay', hotSkin: { mode: 'large', posterKey: 'poster_orange', posterImage: hotPosterOrangeImg, posterBrand: '海灣咖啡美食\n雙拼下午茶', posterMascot: '☕', dishes: [ { name: '1.招牌豬扒包+絲襪奶茶', image: burgerImg, discount: '8.2折', price: '26', origin: '38' }, { name: '2.蛋撻（2只）', image: riceballImg, price: '18' }, { name: '3.公司三文治', image: friedChickenImg, price: '22' } ] } },
]

/* ─── 搜索結果頁外賣瀑布流專用列表：基礎門店（不含人氣商家廣告）+ 超出範圍 / 未入駐樣例（同閃蜂口径） ─── */
/* ─── 搜索结果外卖瀑布流·商品横滑行 mock（仅搜索列表附加；首页/频道页不展示） ─── */
const SEARCH_PRODUCTS: MfoodHotDish[] = [
  { name: 'Shake爆薯條', image: friedChickenImg, price: '25', origin: '28' },
  { name: '番鬼佬豬扒包', image: burgerImg, price: '58' },
  { name: '傳統佬澳葡飯', image: riceballImg, price: '58' },
  { name: '珍珠奶茶', image: lemonTeaImg, price: '16', origin: '20' },
  { name: '招牌魚蛋粉', image: fishPotImg, price: '32' },
]

const MFOOD_SEARCH_BASE: MfoodStore[] = [
  ...MFOOD_STORES.filter((store) => !store.hotSkin),
  { key: 'ms14', name: '路環橋記咖啡（路環店）', rating: '4.6', monthlySales: '700+', minOrder: '$0', deliveryFee: '$0', deliveryTime: '24分鐘', distance: '5.6km', tags: ['千人收藏好店'], memberTags: [{ kind: 'shen', text: '最高膨脹至30' }], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-oos', outOfRange: true },
  { key: 'ms15', name: '小貝廚房（關閘店）', rating: '0', monthlySales: '0', minOrder: '$0', deliveryFee: '$0', deliveryTime: '30分鐘', distance: '1.6km', tags: [], memberTags: [], image: lemonTeaImg, deliveryType: 'platform', merchantId: 'mf-nj', notJoined: true },
]
export const MFOOD_SEARCH_STORES: MfoodStore[] = MFOOD_SEARCH_BASE.map((s, i): MfoodStore => (s.notJoined ? s : {
  ...s,
  products: [
    SEARCH_PRODUCTS[i % SEARCH_PRODUCTS.length],
    SEARCH_PRODUCTS[(i + 1) % SEARCH_PRODUCTS.length],
    SEARCH_PRODUCTS[(i + 2) % SEARCH_PRODUCTS.length],
  ],
}))

/* ─── 附近好店（優選商家同構卡 · MFOOD 品牌）：特惠團購页「附近好店」页签与搜索结果页共用 ─── */
export const MFOOD_NEAR_STORES: PreferredMerchant[] = [
  { key: 'ns1', name: '澳門燒味工房🔥-新橋店', rating: '4.7', perPerson: '$58/人', cateArea: '燒臘·新橋商圈', dist: '180m', logoText: '燒味', logoTone: 'orange', isNew: true, cover: friedChickenImg, sales: '半年售800+', coupons: [{ icon: '券', price: '60', discount: '6折', name: '燒味雙拚優惠券' }, { icon: '惠', price: '30', discount: '8折', name: '午市快閃券' }] },
  { key: 'ns2', name: '金沙砂鍋粥🍜-提督店', rating: '4.5', perPerson: '$45/人', cateArea: '粥麵·提督商圈', dist: '420m', logoText: '金沙', logoTone: 'red', cover: fishPotImg, inflate: '最高膨脹至$25', sales: '半年售1200+', coupons: [{ icon: '券', price: '45', discount: '6.5折', name: '砂鍋粥雙人券' }] },
  { key: 'ns3', name: '麥記漢堡包🍔-關閘店', rating: '4.4', perPerson: '$38/人', cateArea: '快餐·關閘商圈', dist: '1.1km', logoText: '麥記', logoTone: 'blue', cover: burgerImg, sales: '半年售300+', coupons: [{ icon: '秒', price: '25', discount: '5折', name: '早晨套餐秒殺券' }, { icon: '惠', price: '15', discount: '8.8折', name: '下午茶優惠' }] },
  { key: 'ns4', name: '檸檬屋茶飲🍋-下環店', rating: '4.6', perPerson: '$22/人', cateArea: '茶飲·下環商圈', dist: '860m', logoText: '檸檬', logoTone: 'green', cover: lemonTeaImg, inflate: '最高膨脹至$12', sales: '半年售2600+', coupons: [{ icon: '惠', price: '12', discount: '9折', name: '凍飲第二杯半價' }] },
]

/* ─── 搜索結果頁團購瀑布流專用列表：附近好店基礎 + 未入駐 / 開業時間樣例（同閃蜂口径；「超出範圍」样例已按需求下线） ─── */
/* ─── 搜索结果团购瀑布流·商品横滑行 mock（仅搜索列表附加；页签瀑布流不展示） ─── */
const SEARCH_GOODS: PreferredGood[] = [
  { name: '44元代50元券', image: burgerImg, price: '44', origin: '50', icon: '券' },
  { name: '代10元券', image: fishPotImg, price: '8', origin: '10', icon: '券' },
  { name: '雙人套餐券', image: riceballImg, price: '150', origin: '200', icon: '惠' },
  { name: '下午茶優惠', image: lemonTeaImg, price: '40', origin: '45', icon: '惠' },
  { name: '秒殺·招牌魚蛋粉', image: friedChickenImg, price: '19', origin: '32', icon: '秒' },
]

const MFOOD_NEAR_SEARCH_BASE: PreferredMerchant[] = [
  ...MFOOD_NEAR_STORES,
  { key: 'ns6', name: '小貝廚房（關閘店）', rating: '0', perPerson: '', cateArea: '輕食·關閘商圈', dist: '1.6km', logoText: '小貝', logoTone: 'green', cover: riceballImg, sales: '', coupons: [], notJoined: true },
  { key: 'ns7', name: '早安茶餐廳（新橋店）', rating: '4.5', perPerson: '$45/人', cateArea: '港式·新橋商圈', dist: '900m', logoText: '早安', logoTone: 'blue', cover: lemonTeaImg, sales: '半年售400+', coupons: [{ icon: '惠', price: '40', discount: '8.8折', name: '早餐專享優惠' }], openTimeLabel: '10:00 營業' },
]
export const MFOOD_NEAR_SEARCH_STORES: PreferredMerchant[] = MFOOD_NEAR_SEARCH_BASE.map((m, i): PreferredMerchant => (m.notJoined ? m : {
  ...m,
  goods: [
    SEARCH_GOODS[i % SEARCH_GOODS.length],
    SEARCH_GOODS[(i + 1) % SEARCH_GOODS.length],
    SEARCH_GOODS[(i + 2) % SEARCH_GOODS.length],
  ],
}))
