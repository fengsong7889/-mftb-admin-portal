/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 用户端 APP · 特惠團購页（按设计稿还原，纯前端静态原型；2026-11 按新稿整页改版）
 *
 * 入口：首页「特惠團購」粉色卡片点击进入（见 ConsumerHome 的 onOpenGroupBuy）。
 * 结构（对应设计稿图2/图3/图4）：
 *   橙色头部(返回+标题+定位 / 搜索行+訂單图标 / 热词胶囊，滚动后折叠为 搜索行+訂單) →
 *   新店 Banner 轮播(圆角+指示点) → 十宫格分类 → 地图卡（附近 2133 家店）→
 *   團購超級秒殺(倒计时+更多 / 横滑秒杀卡) → 页签行(未吸顶=圆形图标，吸顶=文字下划线) →
 *   筛选胶囊(附近商家/全部分類/智能排序/神/篩選) → 筛选下拉面板 / 更多篩選底部 sheet(五模块) →
 *   瀑布流团购券(共享 GroupBuyFeedCard + apf-feed-list，与首页「团购」瀑布流同规格) → 到底提示。
 *
 * 说明：图片为 AI 占位图（src/assets/consumer-home/）；品牌/商品/门店名/热词为占位数据，
 * 按口径不进入语言包；界面骨架文案已接 i18n（appConsumer 命名空间，复用既有 key）。
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { REGION_LABEL_KEY as REGION_TITLE_KEY, REGION_TREE_DATA } from '@mftb/contracts/recommendConstants'
import GroupBuyFeedCard, { type GroupBuyItem } from './GroupBuyFeedCard'
import PreferredMerchantCard, { type PreferredMerchant } from './PreferredMerchantCard'
import groupbuyHeroImg from '@/assets/consumer-home/groupbuy-hero.jpg'
import groupbuyMapImg from '@/assets/consumer-home/groupbuy-map.png'
import bbqImg from '@/assets/consumer-home/bbq.jpg'
import riceballImg from '@/assets/consumer-home/riceball.jpg'
import friedChickenImg from '@/assets/consumer-home/friedchicken.jpg'
import fishPotImg from '@/assets/consumer-home/fishpot.jpg'
import burgerImg from '@/assets/consumer-home/burger.jpg'
import lemonTeaImg from '@/assets/consumer-home/lemontea.jpg'
import serviceImg from '@/assets/consumer-home/service.png'
import leisureImg from '@/assets/consumer-home/leisure.png'

/** 定位（占位数据，不进语言包） */
const LOCATION = 'Science Park(香洲區)'
/** 搜索框占位关键词（占位数据） */
const KEYWORD = '烤魚'

/** 热词胶囊（图2：首个为激活态；占位数据） */
const HOT_WORDS = ['新大家發美食', '雲吞', '火鍋', '烤魚', '下午茶', '炸雞']

/** 十宫格分类（图2，两行五列；沿用既有 category.* key，麥當勞/火鍋烤肉为占位文案） */
const GRID_CATS = [
  { key: '', zh: '麥當勞', img: burgerImg },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', img: lemonTeaImg },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', img: fishPotImg },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', img: riceballImg },
  { key: 'appConsumer.groupBuy.category.service', zh: '生活服務', img: serviceImg },
  { key: 'appConsumer.groupBuy.category.hotpot', zh: '火鍋烤肉', img: bbqImg, plain: true },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', img: riceballImg },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', img: burgerImg },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', img: friedChickenImg },
  { key: 'appConsumer.groupBuy.category.leisure', zh: '休閒娛樂', img: leisureImg },
]

/** 页签行（图3：圆形图标态；吸顶后保留图标、仅加白底与投影表达“吸附”；占位数据 + 既有 key） */
const STICKY_TABS = [
  { key: 'appConsumer.groupBuy.chip.recommend', zh: '推薦', emoji: '👍' },
  { key: '', zh: '優選商家', emoji: '🏪' },
  { key: '', zh: '消費賞', emoji: '🎁' },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', emoji: '🍜' },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', emoji: '🧋' },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', emoji: '🦞' },
  { key: '', zh: '代金券', emoji: '🎟️' },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', emoji: '🍔' },
  { key: '', zh: '火鍋烤肉', emoji: '🍲' },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', emoji: '🍛' },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', emoji: '🍣' },
]

/** 團購超級秒殺 · 横滑秒杀卡（图3；占位数据） */
const SECKILL_CARDS = [
  { key: 'sk1', discount: '6折', title: '100 元代金券【…', price: '60', origin: '100', img: fishPotImg },
  { key: 'sk2', discount: '4.5折', title: '（👍👍超值）…', price: '95', origin: '211', img: lemonTeaImg },
  { key: 'sk3', discount: '5.1折', title: '【3店通用】哆…', price: '26.8', origin: '53', img: friedChickenImg },
]

/** 團購超級秒殺 · 倒计时（占位静态值） */
const SECKILL_COUNTDOWN = ['05', '38', '52']

/** 瀑布流团购券：与首页「团购」瀑布流同一口径（共享 GroupBuyFeedCard + apf-feed-list 容器），数据同首页 FEED */
const FEED: GroupBuyItem[] = [
  { key: 'f1', brand: '魚🐟日本料理大王大三巴店', title: '200蚊代250蚊券 葉林極 上日料放題💕炒...', image: fishPotImg, isNew: true, typeLabel: '酒', halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp1' },
  { key: 'f2', brand: '魚🐟日本料理大王大三巴店', title: '200蚊代250蚊券 葉林極 上日料放題💕炒...', image: burgerImg, halfYearSales: 1000, customTags: ['人氣熱賣', '自定義'], price: '240', origin: '300', dist: '5.8km', area: '筷子基', shop: '澳門新影匯W酒店-津津餐...', merchantId: 'd-jp2' },
  { key: 'f3', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: riceballImg, isNew: true, halfYearSales: 416, price: '25.9', origin: '80', dist: '5.3km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋小炒...', merchantId: 'd-hn' },
  { key: 'f4', brand: '聯豐', title: '雞蛋10只（散裝）', image: lemonTeaImg, halfYearSales: 5066, customTags: ['性價比之選'], price: '8.8', origin: '15.9', dist: '7.1km', area: '筷子基', shop: '聯豐宅鮮餸（筷子基店）', merchantId: 'd-egg' },
  { key: 'f5', brand: '湘楚人家', brandEmoji: '😋', title: '【份量超大抵食】單人全日套餐', image: fishPotImg, halfYearSales: 416, customTags: ['1人餐', '蜂蜜抵$2'], price: '25.9', origin: '80', dist: '5.0km', area: '新口岸', shop: '湘楚人家（蓋飯🍳乾鍋小炒...', merchantId: 'd-xc', flashBadge: '秒殺', flashCountdown: '07:36:58', flashBadgePos: 'top', grabbedLabel: '已搶30%', grabbedPct: 30, ctaText: '秒', discountNote: '秒殺價3.2折,降價超68%', ratingNote: '4.5分' },
]

/** 「附近」页签（左列第一个）与其距离档（单选）；距离单位全球通用，不进语言包 */
const NEARBY_TAB = 'nearby'
const NEARBY_DISTANCES = ['500m', '1km', '2km', '3km']

/**
 * 「附近」面板的区域→商圈直接引用全系统唯一商圈树（recommendConstants.REGION_TREE_DATA），
 * 与定价/门店/订单同一口径，labelKey 已在 recommend 域的 area 与 region 两组 key 登记双语。
 * 不得在前端另造一份地名清单——历史教训：另造后与后端数据对不上，筛选必然空转。
 */
const AREA_TREE = REGION_TREE_DATA

/** 「分類」面板（多选）；emoji 为占位插画，待切图后替换 */
const CATEGORY_OPTIONS = [
  { key: 'appConsumer.groupBuy.category.hotpot', zh: '火鍋燒肉', emoji: '🍲' },
  { key: 'appConsumer.groupBuy.category.dessert', zh: '甜品飲品', emoji: '🧋' },
  { key: 'appConsumer.groupBuy.category.localCuisine', zh: '地方菜系', emoji: '🍛' },
  { key: 'appConsumer.groupBuy.category.exotic', zh: '異國料理', emoji: '🍣' },
  { key: 'appConsumer.groupBuy.category.fastFood', zh: '快餐小食', emoji: '🍔' },
  { key: 'appConsumer.groupBuy.category.congeeNoodle', zh: '粥粉麵飯', emoji: '🥟' },
  { key: 'appConsumer.groupBuy.category.buffet', zh: '自助餐', emoji: '🦞' },
  { key: 'appConsumer.groupBuy.category.service', zh: '生活服務', emoji: '🧰' },
  { key: 'appConsumer.groupBuy.category.leisure', zh: '休閒娛樂', emoji: '🏋️' },
  { key: 'appConsumer.groupBuy.category.beauty', zh: '美容美髮', emoji: '💇' },
]

/** 「排序」面板枚举（单选） */
const SORT_OPTIONS = [
  { key: 'appConsumer.groupBuy.sort.smart', zh: '智能排序' },
  { key: 'appConsumer.groupBuy.sort.distance', zh: '距離優先' },
  { key: 'appConsumer.groupBuy.sort.sales', zh: '銷量優先' },
  { key: 'appConsumer.groupBuy.sort.priceAsc', zh: '低價優先' },
  { key: 'appConsumer.groupBuy.sort.priceDesc', zh: '高價優先' },
]

/** 面板容器的无障碍标题（静态 key + 繁中兜底，供 i18n 引用门禁与语言包收割） */
const PANEL_TITLE = {
  nearby: { key: 'appConsumer.groupBuy.panel.nearby', zh: '附近篩選面板' },
  category: { key: 'appConsumer.groupBuy.panel.category', zh: '分類篩選面板' },
  sort: { key: 'appConsumer.groupBuy.panel.sort', zh: '排序篩選面板' },
} as const

/**
 * 「更多篩選」底部面板占位文案（照抄设计稿图2-5；与 HOT_WORDS/FLASH_LIST 同口径：
 * 占位数据暂不进语言包，二期统一接 i18n，避免一期 UI 先行时新增未收录 key 触发门禁）。
 * 营业时间/使用人数为单选胶囊；偏好优惠/店铺服务为多选胶囊。
 */
const MORE_HOURS = ['0-5 時', '5-10 時', '10-14 時', '14-17 時', '17-21 時', '21-24 時', '24 小時營業']
const MORE_PEOPLE = ['單人', '雙人', '3-4 人', '5-10 人', '10 人以上']
/** 偏好优惠：圆形渐变图标 + 文案；icon 为占位 emoji/字样，待切图后替换 */
const MORE_PREFS = [
  { key: 'vip', label: '神會員', icon: '👑', tone: 'crown' },
  { key: 'coupon', label: '津貼神券', icon: '🎫', tone: 'coupon' },
  { key: 'vs', label: '全澳格價', icon: 'VS', tone: 'vs' },
  { key: 'hot', label: '人氣推薦', icon: '🔥', tone: 'fire' },
  { key: 'chain', label: '連鎖店鋪', icon: '🏪', tone: 'chain' },
  { key: 'praise', label: '好評高分', icon: '👍', tone: 'thumb' },
  { key: 'service', label: '服務優先', icon: '🛎️', tone: 'service' },
  { key: 'taste', label: '口味優先', icon: '🌶️', tone: 'taste' },
  { key: 'newstore', label: '新店入駐', icon: 'New', tone: 'new' },
  { key: 'env', label: '環境優先', icon: '🌴', tone: 'env' },
  { key: 'healthy', label: '食得健康', icon: '🥗', tone: 'healthy' },
]
/** 店铺服务（多选；设计稿含重名条目，渲染 key 需带下标） */
const MORE_SERVICES = [
  '有 WIFI', '免費停車', '付費停車', '可包場',
  '可預點餐', '可電話預定', '等位區', '宴會廳',
  '有包廂', '寶寶椅', '寵物禁入', '無煙餐廳',
  '吸煙區', '有露臺', '室內衛生間', '有充電寶',
  '無隱形消費', '不主動推銷', '不滿意重做', '保證正品',
  '有演出', '流行音樂主體', '有卡座', '工業風裝修',
  '有舞台', '有骰子', '可容納 400 人', '可存酒',
  '啤酒', '敘利亞風格', '復古裝修', '中國風裝修',
  '歐式裝修', '有調酒師', '團隊包場', '頂級音響',
  '更衣室', '寄存櫃', '有沐浴房', '充電寶',
  '不滿意重拍', '可開發票', '專業化妝', '有公主',
  '自助購買酒水', '超大舞池', '隱藏式酒吧', '觀影享受',
  '電競主體', '有沙發位', '爵士樂', '景觀位',
  '威士忌', '雪茄吧', '自助點餐', '空調開放',
  '可手機充電', '可電話預定', 'VIP 包廂', '可刷卡',
  '一對一專屬服務', '保證正品', '沙發座', '電影房',
  '汗蒸房', '大型溫泉游泳池',
]
/** 人均筛选器价格档（$1-$200+，到顶显示 +） */
const PRICE_MIN = 1
const PRICE_MAX = 200

/** 頁签行下标：「優選商家」点击后瀑布流切换为商家卡（设计稿图2） */
const TAB_PREFERRED = 1

/** 優選商家瀑布流（设计稿图2口径；占位数据，logo 为令牌渐变占位待切图） */
const PREFERRED_MERCHANTS: PreferredMerchant[] = [
  { key: 'pm1', name: '翡翠茶餐廳🏆-關閘店（🔥全澳…', rating: '4.6', perPerson: '$76/人', cateArea: '淮揚菜·新馬路商圈', dist: '231m', logoText: '翡翠', logoTone: 'red', isNew: true, sales: '半年售300+', coupons: [{ icon: '券', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }] },
  { key: 'pm2', name: '麥田茶餐廳（SINCE 2016）', rating: '4.6', perPerson: '$76/人', cateArea: '淮揚菜·新馬路商圈', dist: '231m', logoText: '麥田', logoTone: 'green', fav: true, inflate: '最高膨脹至$60', sales: '半年售300+', coupons: [{ icon: '券', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }, { icon: '惠', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }, { icon: '秒', price: '90', discount: '5.8折', name: '代金券名稱代代金券名稱…' }] },
  { key: 'pm3', name: '大豐燒肉🥩-氹仔店', rating: '4.8', perPerson: '$120/人', cateArea: '燒烤·氹仔商圈', dist: '1.2km', logoText: '大豐', logoTone: 'orange', isNew: true, sales: '半年售1000+', coupons: [{ icon: '券', price: '150', discount: '7.5折', name: '燒肉雙人套餐券' }, { icon: '秒', price: '88', discount: '6折', name: '工作日午市秒殺券' }] },
  { key: 'pm4', name: '記記冰室😋-下環店', rating: '4.5', perPerson: '$45/人', cateArea: '港式·下環商圈', dist: '800m', logoText: '記記', logoTone: 'blue', inflate: '最高膨脹至$30', sales: '半年售600+', coupons: [{ icon: '惠', price: '40', discount: '8.8折', name: '下午茶專享優惠' }] },
  { key: 'pm5', name: '龍湯堂🍜-北區店', rating: '4.7', perPerson: '$60/人', cateArea: '粥麵·北區商圈', dist: '2.4km', logoText: '龍湯', logoTone: 'red', sales: '半年售2000+', coupons: [{ icon: '券', price: '55', discount: '5.5折', name: '粥麵雙人券' }, { icon: '惠', price: '30', discount: '9折', name: '小食優惠券' }] },
]

export default function ConsumerGroupBuy({
  onBack,
  onSearch,
  onOpenStore,
  onOpenOrder,
  onTabChange,
  syncTab,
  syncSeq,
}: {
  onBack: () => void
  onSearch: () => void
  onOpenStore?: (merchantId: string) => void
  onOpenOrder?: () => void
  /** 页签切换回流（壳外说明面板联动：優選商家 ↔ preferred 面板） */
  onTabChange?: (tab: string) => void
  /** 壳外说明面板下发的页签同步命令（syncSeq 自增时执行） */
  syncTab?: string
  syncSeq?: number
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  /** 页签行是否已吸顶（图4：吸顶后由圆形图标态切换为文字下划线态） */
  const [tabsStuck, setTabsStuck] = useState(false)
  /** 当前激活页签（仅视觉态，原型不做真实过滤） */
  const [activeTab, setActiveTab] = useState<number>(0)
  /** 当前展开的筛选面板：附近 / 分類 / 排序 / 更多篩選，同一时刻只开一个（null=收起） */
  const [openPanel, setOpenPanel] = useState<'nearby' | 'category' | 'sort' | 'more' | null>(null)
  /** 附近-距离档（单选），null 表示未选距离 */
  const [distance, setDistance] = useState<string | null>(null)
  /** 左侧当前浏览的页签（附近 或 区域 value），僅控制右列展示哪组选项，不是选中态 */
  const [activeAreaTab, setActiveAreaTab] = useState<string>(NEARBY_TAB)
  /** 已选商圈（Region 编号）：各区域均多选，跨区域可同时保留 */
  const [selectedRegions, setSelectedRegions] = useState<number[]>([])
  /** 已选分类（多选，存 i18n key） */
  const [categories, setCategories] = useState<string[]>([])
  /** 排序方式（单选，存 i18n key） */
  const [sort, setSort] = useState<string>(SORT_OPTIONS[0].key)
  /** 更多篩選·人均价格区间（双滑杆；原型仅视觉态，不做真实过滤） */
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX])
  /** 更多篩選·营业时间（单选胶囊，再点取消） */
  const [moreHour, setMoreHour] = useState<string | null>(null)
  /** 更多篩選·使用人数（单选胶囊，再点取消） */
  const [morePeople, setMorePeople] = useState<string | null>(null)
  /** 更多篩選·偏好优惠（多选） */
  const [morePrefs, setMorePrefs] = useState<string[]>([])
  /** 更多篩選·店铺服务（多选） */
  const [moreServices, setMoreServices] = useState<string[]>([])

  /* 壳外说明面板同步命令：只在 syncSeq 变化时执行；preferred → 優選商家页签，page-group → 推薦页签 */
  const syncSeqRef = useRef(syncSeq ?? 0)
  useEffect(() => {
    if ((syncSeq ?? 0) !== syncSeqRef.current) {
      syncSeqRef.current = syncSeq ?? 0
      if (syncTab === 'preferred') setActiveTab(TAB_PREFERRED)
      else if (syncTab === 'page-group') setActiveTab(0)
    }
  }, [syncSeq, syncTab])

  /** 内容区上滑：过阈值折叠头部标题行；再过阈值页签行吸顶变文字态（图4） */
  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const next = el.scrollTop > 36
    setScrolled((prev) => (prev === next ? prev : next))
    const stuck = el.scrollTop > 430
    setTabsStuck((prev) => (prev === stuck ? prev : stuck))
  }

  const openStore = (merchantId: string) => () => onOpenStore?.(merchantId)

  /** 点筛选按钮：展开对应面板，再点同一个收起 */
  const togglePanel = (panel: 'nearby' | 'category' | 'sort' | 'more') => () =>
    setOpenPanel((prev) => (prev === panel ? null : panel))

  /** 距离档单选：与商圈集合互斥（同一个胶囊只能表达一种地点口径），选中即收起面板 */
  const pickDistance = (value: string) => () => {
    setDistance(value)
    setSelectedRegions([])
    setOpenPanel(null)
  }

  /** 商圈多选：可勾可消（跨区域可同时保留）；一勾商圈就清掉距离档 */
  const toggleRegion = (value: number) => () => {
    const next = selectedRegions.includes(value)
      ? selectedRegions.filter((v) => v !== value)
      : [...selectedRegions, value]
    if (next.length > selectedRegions.length) setDistance(null)
    setSelectedRegions(next)
  }

  /** 分类多选：面板保持展开，由 × 收起 */
  const toggleCategory = (key: string) => () =>
    setCategories((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))

  /** 排序单选：选中即生效并收起面板 */
  const pickSort = (key: string) => () => {
    setSort(key)
    setOpenPanel(null)
  }

  /** 人均双滑杆：低端不得越过高端（反之亦然），越界就夹到对方位置 */
  const pickPriceMin = (value: number) =>
    setPriceRange(([, hi]) => [Math.min(value, hi), hi])
  const pickPriceMax = (value: number) =>
    setPriceRange(([lo]) => [lo, Math.max(value, lo)])
  /** 单选胶囊：再点同一个取消 */
  const pickOne = (setter: Dispatch<SetStateAction<string | null>>) => (value: string) => () =>
    setter((prev) => (prev === value ? null : value))
  /** 多选胶囊：可勾可消 */
  const pickMany = (setter: Dispatch<SetStateAction<string[]>>) => (key: string) => () =>
    setter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  /** 重置：五个模块全部回到默认（价格满档、其余清空），面板保持展开 */
  const resetMore = () => {
    setPriceRange([PRICE_MIN, PRICE_MAX])
    setMoreHour(null)
    setMorePeople(null)
    setMorePrefs([])
    setMoreServices([])
  }

  /** 当前浏览页签对应的区域节点（附近页签无区域节点，右列展示距离档） */
  const activeArea = AREA_TREE.find((a) => a.value === activeAreaTab)
  /** 多选回写：首个选中项 + 剩余数量（量词走模板，避免英文下语序错乱） */
  const summarize = (first: string, total: number) =>
    (total === 1 ? first : t('appConsumer.groupBuy.filter.multiSuffix', { first, rest: total - 1, defaultValue: '{{first}}+{{rest}}' }))
  const selectedRegionLabels = selectedRegions.map((v) => t(REGION_TITLE_KEY[v]))
  const nearbyLabel = selectedRegionLabels.length > 0
    ? summarize(selectedRegionLabels[0], selectedRegionLabels.length)
    : (distance ?? t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' }))
  const selectedCategoryLabels = categories.map((k) => t(k))
  const categoryLabel = categories.length === 0
    ? t('appConsumer.groupBuy.filter.allCategories', { defaultValue: '全部分類' })
    : summarize(selectedCategoryLabels[0], categories.length)
  const sortLabel = t(sort)
  /** 箭头方向跟随面板开合（▲=展开中） */
  const caret = (panel: 'nearby' | 'category' | 'sort') => (openPanel === panel ? '▲' : '▼')
  /** 人均双滑杆轨道渐变分段点（满档百分比） */
  const pctLo = ((priceRange[0] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100
  const pctHi = ((priceRange[1] - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100

  return (
    <div className="apg-root">
      {/* 橙色头部：可折叠吸顶（滚动后仅保留 搜索行+訂單，图4） */}
      <div className={`apg-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="apg-header-top">
          <button type="button" className="apg-back" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
          <span className="apg-title">{t('appConsumer.groupBuy.title', { defaultValue: '特惠團購' })}</span>
          <span className="apg-loc">
            <span aria-hidden="true">📍</span>{LOCATION} <i aria-hidden="true">›</i>
          </span>
        </div>
        <div className="apg-header-search">
          {scrolled && (
            <button type="button" className="apg-back apg-back-inline" onClick={onBack} aria-label={t('appConsumer.common.back', { defaultValue: '返回' })}>←</button>
          )}
          <button type="button" className="apg-searchrow" onClick={onSearch}>
            <span className="apc-search-ico" aria-hidden="true">🔍</span>
            <span className="apg-hot">{KEYWORD}</span>
            <span className="apg-search-btn">{t('appConsumer.common.search', { defaultValue: '搜索' })}</span>
          </button>
          {/* 訂單是独立入口（跳底部訂單 Tab），不能嵌在搜索框按钮内 */}
          {onOpenOrder && (
            <button type="button" className="apg-order-btn" onClick={onOpenOrder}>
              <span className="apg-order-ico" aria-hidden="true">📋</span>
              <span className="apg-order-txt">{t('appConsumer.common.order', { defaultValue: '訂單' })}</span>
            </button>
          )}
        </div>
        {!scrolled && (
          <div className="apg-hotwords">
            {HOT_WORDS.map((w, i) => (
              <button key={w} type="button" className={`apg-hotword${i === 0 ? ' is-on' : ''}`}>
                {i === 0 && <span className="apg-hotword-fire" aria-hidden="true">🔥</span>}
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ap-body apg-body" ref={bodyRef} onScroll={handleScroll}>

        {/* 新店 Banner 轮播（圆角大图 + 指示点） */}
        <div
          className="apg-hero"
          style={{ background: `url(${groupbuyHeroImg}) center/cover no-repeat` }}
          role="img"
          aria-label={t('appConsumer.common.heroBadge', { defaultValue: '新店嚟喇 超抵價嘆盡招牌美食' })}
        >
          <div className="apg-dots apg-dots-in"><i className="is-on" /><i /><i /><i /></div>
        </div>

        {/* 十宫格分类（两行五列） */}
        <div className="apg-cats">
          {GRID_CATS.map((c, i) => (
            <button key={`${c.zh}-${i}`} type="button" className="apg-cat">
              {c.img
                ? <img className="apg-cat-img" src={c.img} alt="" />
                : <span className="apg-cat-emoji" aria-hidden="true">🏷️</span>}
              <span className="apg-cat-label">{c.key ? t(c.key, { defaultValue: c.zh }) : c.zh}</span>
            </button>
          ))}
        </div>

        {/* 地图卡：附近门店入口（占位示意，接地图 SDK 后替换） */}
        <button type="button" className="apg-map" onClick={onSearch}>
          <img className="apg-map-img" src={groupbuyMapImg} alt="" />
          <span className="apg-map-pill">
            <span className="apg-map-pill-ico" aria-hidden="true">🐝</span>
            附近 2133 家店 <i aria-hidden="true">›</i>
          </span>
          <span className="apg-map-brand" aria-hidden="true">Bai度地圖</span>
        </button>

        {/* 團購超級秒殺：橙色带 + 倒计时 + 更多；横滑秒杀卡 */}
        <section className="apg-seckill">
          <header className="apg-seckill-head">
            <span className="apg-seckill-title">團購超級秒殺</span>
            <span className="apg-seckill-cd" aria-label="秒殺倒計時">
              {SECKILL_COUNTDOWN.map((n, i) => (
                <span key={n + i} className="apg-seckill-cd-item">{n}</span>
              ))}
              <span className="apg-seckill-cd-suffix">後結束</span>
            </span>
            <button type="button" className="apg-seckill-more">更多 <i aria-hidden="true">→</i></button>
          </header>
          <div className="apg-flash-hscroll">
            {SECKILL_CARDS.map((c) => (
              <button key={c.key} type="button" className="apg-shcard" onClick={openStore('g-seckill')}>
                <span className="apg-shcard-badge">{c.discount}</span>
                <img className="apg-shcard-img" src={c.img} alt="" />
                <span className="apg-shcard-title">{c.title}</span>
                <span className="apg-shcard-price">
                  <span className="apg-shcard-now"><i>$</i>{c.price}</span>
                  <s>${c.origin}</s>
                  <span className="apg-shcard-grab">{t('appConsumer.common.grab', { defaultValue: '搶' })}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 页签行：未吸顶=圆形图标（图3）；吸顶=文字下划线（图4）；sticky 随滚动吸附在头部之下 */}
        <div className={`apg-tabs${tabsStuck ? ' is-stuck' : ''}`}>
          {STICKY_TABS.map((tab, i) => (
            <button
              key={`${tab.zh}-${i}`}
              type="button"
              className={`apg-tab${activeTab === i ? ' is-on' : ''}`}
              onClick={() => {
                setActiveTab(i)
                onTabChange?.(i === TAB_PREFERRED ? 'preferred' : 'page-group')
              }}
            >
              <i className="apg-tab-ico" aria-hidden="true">{tab.emoji}</i>
              <span className="apg-tab-label">{tab.key ? t(tab.key, { defaultValue: tab.zh }) : tab.zh}</span>
            </button>
          ))}
        </div>

        {/* 筛选胶囊：左段横滑（附近商家/全部分類/智能排序可展开面板 + 高亮胶囊），右段筛选图标固定 */}
        <div className="apg-sortbar">
          <div className="apg-sortbar-scroll">
            <button
              type="button"
              className={`apg-chip${openPanel === 'nearby' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'nearby'}
              onClick={togglePanel('nearby')}
            >
              {nearbyLabel === t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' }) ? '附近商家' : nearbyLabel}
              {' '}
              <i className="apg-chip-caret" aria-hidden="true">{caret('nearby')}</i>
            </button>
            <button
              type="button"
              className={`apg-chip${openPanel === 'category' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'category'}
              onClick={togglePanel('category')}
            >
              {categoryLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('category')}</i>
            </button>
            <button
              type="button"
              className={`apg-chip${openPanel === 'sort' ? ' is-open' : ''}`}
              aria-expanded={openPanel === 'sort'}
              onClick={togglePanel('sort')}
            >
              {sortLabel} <i className="apg-chip-caret" aria-hidden="true">{caret('sort')}</i>
            </button>
            <button type="button" className="apg-chip">
              <b className="apg-chip-shen-logo" aria-hidden="true">神</b>會員
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--red" aria-hidden="true">¥</i>津貼神券
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--vs" aria-hidden="true">VS</i>全澳格價
            </button>
            <button type="button" className="apg-chip">
              <i className="apg-chip-ico apg-chip-ico--thumb" aria-hidden="true">👍</i>好評高分
            </button>
          </div>
          <button
            type="button"
            className={`apg-chip is-slider${openPanel === 'more' ? ' is-open' : ''}`}
            aria-label={t('appConsumer.groupBuy.filter.sliders', { defaultValue: '篩選條件' })}
            aria-expanded={openPanel === 'more'}
            onClick={togglePanel('more')}
          >
            <svg className="apg-slider-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M2 4.5h12M2 8h12M2 11.5h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="6" cy="4.5" r="1.9" fill="currentColor" />
              <circle cx="10.5" cy="8" r="1.9" fill="currentColor" />
              <circle cx="5" cy="11.5" r="1.9" fill="currentColor" />
            </svg>
            {t('appConsumer.common.filter', { defaultValue: '篩選' })}
          </button>
        </div>

        {/* 筛选下拉面板：同一时刻只展开一个，底部 × 收起（更多篩選走独立底部 sheet，不经此处） */}
        {(openPanel === 'nearby' || openPanel === 'category' || openPanel === 'sort') && (
          <div className="apg-panel-wrap">
            <div className="apg-panel" role="group" aria-label={t(PANEL_TITLE[openPanel].key, { defaultValue: PANEL_TITLE[openPanel].zh })}>
              {openPanel === 'nearby' && (
                <div className="apg-panel-near">
                  <div className="apg-panel-regions">
                    <button
                      type="button"
                      className={`apg-region${activeAreaTab === NEARBY_TAB ? ' is-on' : ''}`}
                      onClick={() => setActiveAreaTab(NEARBY_TAB)}
                    >
                      {t('appConsumer.groupBuy.filter.nearby', { defaultValue: '附近' })}
                    </button>
                    {AREA_TREE.map((area) => (
                      <button
                        key={area.value}
                        type="button"
                        className={`apg-region${activeAreaTab === area.value ? ' is-on' : ''}`}
                        onClick={() => setActiveAreaTab(String(area.value))}
                      >
                        {t(area.titleKey)}
                      </button>
                    ))}
                  </div>
                  <div className="apg-panel-options">
                    {activeArea
                      ? activeArea.children.map((child) => {
                        const label = t(child.titleKey)
                        const on = selectedRegions.includes(child.value)
                        return (
                          <button key={child.value} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickDistrict', { value: label, defaultValue: '選擇商圈 {{value}}' })} onClick={toggleRegion(child.value)}>
                            <span className={on ? 'is-text-on' : ''}>{label}</span>
                            <i className={`apg-radio${on ? ' is-on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</i>
                          </button>
                        )
                      })
                      : NEARBY_DISTANCES.map((d) => (
                        <button key={d} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickDistance', { value: d, defaultValue: '選擇距離 {{value}}' })} onClick={pickDistance(d)}>
                          <span className={distance === d ? 'is-text-on' : ''}>{d}</span>
                          <i className={`apg-radio${distance === d ? ' is-on' : ''}`} aria-hidden="true">{distance === d ? '✓' : ''}</i>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {openPanel === 'category' && (
                <div className="apg-panel-cats">
                  {CATEGORY_OPTIONS.map((c) => {
                    const on = categories.includes(c.key)
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`apg-catchip${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={toggleCategory(c.key)}
                      >
                        <span className="apg-catchip-emoji" aria-hidden="true">{c.emoji}</span>{t(c.key, { defaultValue: c.zh })}
                      </button>
                    )
                  })}
                </div>
              )}

              {openPanel === 'sort' && (
                <div className="apg-panel-sorts">
                  {SORT_OPTIONS.map((s) => (
                    <button key={s.key} type="button" className="apg-optrow" aria-label={t('appConsumer.groupBuy.filter.pickSort', { value: t(s.key, { defaultValue: s.zh }), defaultValue: '排序方式 {{value}}' })} onClick={pickSort(s.key)}>
                      <span className={sort === s.key ? 'is-text-on' : ''}>{t(s.key, { defaultValue: s.zh })}</span>
                      <i className={`apg-radio${sort === s.key ? ' is-on' : ''}`} aria-hidden="true">{sort === s.key ? '✓' : ''}</i>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="apg-panel-close" aria-label={t('appConsumer.groupBuy.filter.closePanel', { defaultValue: '收起篩選面板' })} onClick={() => setOpenPanel(null)}>✕</button>
          </div>
        )}

        {/* 瀑布流：優選商家页签 → 商家卡瀑布流（图2）；其余页签 → 与首页「团购」同规格瀑布流 */}
        {activeTab === TAB_PREFERRED ? (
          <div className="apq-feed">
            {PREFERRED_MERCHANTS.map((m) => (
              <PreferredMerchantCard key={m.key} item={m} />
            ))}
          </div>
        ) : (
          <div className="apf-feed-list">
            {FEED.map((it) => (
              <GroupBuyFeedCard key={it.key} item={it} theme="orange" onOpenStore={onOpenStore} />
            ))}
          </div>
        )}

        {/* 到底：仅文字提示 */}
        <div className="apg-end">
          <span className="apg-end-text">{t('appConsumer.common.reachedBottom', { defaultValue: '已經到我底線了' })}</span>
        </div>

        {/* 更多篩選底部面板（设计稿图2-5）：sticky 满屏罩 + 白底_sheet（五模块可滚）+ 重置/完成 + sheet 下圆形 × */}
        {openPanel === 'more' && (
          <div className="apg-more">
            <div className="apg-more-sheet" role="group" aria-label="更多篩選面板">
              <div className="apg-more-scroll">
                <section className="apg-more-sec">
                  <h4 className="apg-more-title">人均篩選器</h4>
                  <div className="apg-range-card">
                    <div className="apg-range-labels">
                      <span>${priceRange[0]}</span>
                      <span>{priceRange[1] >= PRICE_MAX ? `$${PRICE_MAX}+` : `$${priceRange[1]}`}</span>
                    </div>
                    <div
                      className="apg-range-track"
                      style={{ background: `linear-gradient(to right, var(--border-3) 0 ${pctLo}%, var(--apg-head-from) ${pctLo}% ${pctHi}%, var(--border-3) ${pctHi}% 100%)` }}
                    >
                      <input
                        className="apg-range-input"
                        type="range"
                        min={PRICE_MIN}
                        max={PRICE_MAX}
                        value={priceRange[0]}
                        onChange={(e) => pickPriceMin(Number(e.target.value))}
                        aria-label="最低人均價格"
                      />
                      <input
                        className="apg-range-input"
                        type="range"
                        min={PRICE_MIN}
                        max={PRICE_MAX}
                        value={priceRange[1]}
                        onChange={(e) => pickPriceMax(Number(e.target.value))}
                        aria-label="最高人均價格"
                      />
                    </div>
                  </div>
                </section>
                <section className="apg-more-sec">
                  <h4 className="apg-more-title">營業時間</h4>
                  <div className="apg-more-grid">
                    {MORE_HOURS.map((h) => (
                      <button key={h} type="button" className={`apg-more-chip${moreHour === h ? ' is-on' : ''}`} aria-pressed={moreHour === h} onClick={pickOne(setMoreHour)(h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="apg-more-sec">
                  <h4 className="apg-more-title">使用人數</h4>
                  <div className="apg-more-grid">
                    {MORE_PEOPLE.map((p) => (
                      <button key={p} type="button" className={`apg-more-chip${morePeople === p ? ' is-on' : ''}`} aria-pressed={morePeople === p} onClick={pickOne(setMorePeople)(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="apg-more-sec">
                  <h4 className="apg-more-title">偏好优惠 <i>(可多選)</i></h4>
                  <div className="apg-more-grid apg-more-grid--pref">
                    {MORE_PREFS.map((p) => (
                      <button key={p.key} type="button" className={`apg-more-pref${morePrefs.includes(p.key) ? ' is-on' : ''}`} aria-pressed={morePrefs.includes(p.key)} onClick={pickMany(setMorePrefs)(p.key)}>
                        <i className={`apg-pref-ico apg-pref-ico--${p.tone}`} aria-hidden="true">{p.icon}</i>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="apg-more-sec">
                  <h4 className="apg-more-title">店鋪服務 <i>(可多選)</i></h4>
                  <div className="apg-more-grid apg-more-grid--svc">
                    {MORE_SERVICES.map((s, i) => (
                      <button key={`${s}-${i}`} type="button" className={`apg-more-chip${moreServices.includes(s) ? ' is-on' : ''}`} aria-pressed={moreServices.includes(s)} onClick={pickMany(setMoreServices)(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <div className="apg-more-footer">
                <button type="button" className="apg-more-reset" onClick={resetMore}>重置</button>
                <button type="button" className="apg-more-done" onClick={() => setOpenPanel(null)}>完成 (可多選)</button>
              </div>
            </div>
            <div className="apg-more-closebar">
              <i className="apg-more-stem" aria-hidden="true" />
              <button type="button" className="apg-panel-close" aria-label={t('appConsumer.groupBuy.filter.closePanel', { defaultValue: '收起篩選面板' })} onClick={() => setOpenPanel(null)}>✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
