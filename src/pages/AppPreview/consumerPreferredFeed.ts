/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 閃蜂用户端 · 優選商家瀑布流数据（纯前端原型 Mock）
 *
 * 特惠團購页「優選商家」页签（ConsumerGroupBuy）与全站搜索结果页「團購」分类
 * （ConsumerSearch）共用同一份瀑布流数据：搜索结果页团购瀑布流 = 優選商家小图模式
 * （需求口径），并追加超出范围/未入驻/开业时间三个搜索专属展示样例。
 *
 * logo 为令牌渐变占位（logoTone），封面图为 AI 生成统一风格占位图，待设计切图接入后替换。
 */
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import type { PreferredMerchant, PreferredGood } from './PreferredMerchantCard'

/* ─── 優選商家基礎 5 家（特惠團購页「優選商家」页签与搜索结果页共用） ─── */
export const PREFERRED_MERCHANTS: PreferredMerchant[] = [
  { key: 'pm1', name: '翡翠茶餐廳🏆-關閘店（🔥全澳…', rating: '4.6', perPerson: '$76/人', cateArea: '淮揚菜·新馬路商圈', dist: '231m', logoText: '翡翠', logoTone: 'red', isNew: true, cover: fishPotImg, sales: '半年售300+', coupons: [{ icon: '券', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }] },
  { key: 'pm2', name: '麥田茶餐廳（SINCE 2016）', rating: '4.6', perPerson: '$76/人', cateArea: '淮揚菜·新馬路商圈', dist: '231m', logoText: '麥田', logoTone: 'green', fav: true, cover: burgerImg, inflate: '最高膨脹至$6', sales: '半年售3+', coupons: [{ icon: '券', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }, { icon: '惠', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }, { icon: '秒', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }] },
  { key: 'pm3', name: '大豐燒肉🥩-氹仔店', rating: '4.8', perPerson: '$120/人', cateArea: '燒烤·氹仔商圈', dist: '1.2km', logoText: '大豐', logoTone: 'orange', isNew: true, cover: bbqImg, sales: '半年售1000+', coupons: [{ icon: '券', price: '150', discount: '7.5折', name: '燒肉雙人套餐券' }, { icon: '秒', price: '88', discount: '6折', name: '工作日午市秒殺券' }] },
  { key: 'pm4', name: '記記冰室😋-下環店', rating: '4.5', perPerson: '$45/人', cateArea: '港式·下環商圈', dist: '800m', logoText: '記記', logoTone: 'blue', cover: lemonTeaImg, inflate: '最高膨脹至$30', sales: '半年售600+', coupons: [{ icon: '惠', price: '40', discount: '8.8折', name: '下午茶專享優惠' }] },
  { key: 'pm5', name: '龍湯堂🍜-北區店', rating: '4.7', perPerson: '$60/人', cateArea: '粥麵·北區商圈', dist: '2.4km', logoText: '龍湯', logoTone: 'red', cover: riceballImg, sales: '半年售2000+', coupons: [{ icon: '券', price: '55', discount: '5.5折', name: '粥麵雙人券' }, { icon: '惠', price: '30', discount: '9折', name: '小食優惠券' }] },
]

/* ─── 搜索結果頁團購瀑布流專用列表：基礎商家 + 未入駐 / 開業時間兩個展示樣例 ───
   未入駐 = 僅基礎信息 + 評分「暫無」，無券列表/半年售/紅包标/收藏钮；
   開業時間 = LOGO 底部深色横條白字（如「10:00 營業」），開業後自動隱藏；
   （「超出範圍」展示样例已按需求下线，原 pm6 海灣火鍋城随说明行一并移除） */
/* ─── 搜索结果团购瀑布流·商品横滑行 mock（仅搜索列表附加；页签瀑布流不展示） ─── */
const SEARCH_GOODS: PreferredGood[] = [
  { name: '44元代50元券', image: burgerImg, price: '44', origin: '50', icon: '券' },
  { name: '代10元券', image: fishPotImg, price: '8', origin: '10', icon: '券' },
  { name: '雙人套餐券', image: bbqImg, price: '150', origin: '200', icon: '惠' },
  { name: '下午茶優惠', image: lemonTeaImg, price: '40', origin: '45', icon: '惠' },
  { name: '秒殺·招牌魚蛋粉', image: riceballImg, price: '19', origin: '32', icon: '秒' },
]

const PREFERRED_SEARCH_BASE: PreferredMerchant[] = [
  ...PREFERRED_MERCHANTS,
  { key: 'pm7', name: '小貝廚房（關閘店）', rating: '0', perPerson: '', cateArea: '輕食·關閘商圈', dist: '1.6km', logoText: '小貝', logoTone: 'green', cover: riceballImg, sales: '', coupons: [], notJoined: true },
  { key: 'pm8', name: '早安茶餐廳（新橋店）', rating: '4.5', perPerson: '$45/人', cateArea: '港式·新橋商圈', dist: '900m', logoText: '早安', logoTone: 'blue', cover: lemonTeaImg, sales: '半年售400+', coupons: [{ icon: '惠', price: '40', discount: '8.8折', name: '早餐專享優惠' }], openTimeLabel: '10:00 營業' },
]
export const PREFERRED_SEARCH_MERCHANTS: PreferredMerchant[] = PREFERRED_SEARCH_BASE.map((m, i): PreferredMerchant => (m.notJoined ? m : {
  ...m,
  goods: [
    SEARCH_GOODS[i % SEARCH_GOODS.length],
    SEARCH_GOODS[(i + 1) % SEARCH_GOODS.length],
    SEARCH_GOODS[(i + 2) % SEARCH_GOODS.length],
  ],
}))
