import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, InputNumber, Select, Space, message, Divider, Tag, DatePicker, Switch, Modal, Checkbox, Table, Tree, Upload } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteFilled,
  FileTextOutlined,
  SettingOutlined,
  DownOutlined,
  ShopOutlined,
  PictureOutlined,
  BarChartOutlined,
  FundOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  Region,
  ServiceStatus,
  APP_OPTIONS,
  REGION_OPTIONS,
  REGION_LABEL_KEY,
  REGION_TREE_DATA,
  AREA_TO_REGIONS,
  ALGORITHM_TYPE_OPTIONS,
} from '../constants'
import dayjs from 'dayjs'
import PopularSkinPricing from './PopularSkinPricing'
import { fetchAdAlgorithms, fetchAdPricingDetail, createAdPricing, updateAdPricing, fetchAdRevivePricingDetail, createAdRevivePricing, updateAdRevivePricing, appTypeToBrand, brandToAppType, type AdPricingStar, type AdPricingStarRequest, type AdPricingReviveRequest } from '../../../api/adPromotion'
import { fetchStores } from '../../../api/store'

/** 解析 JSON 數組字符串（折扣/扣費梯度），失敗返回空數組 */
function parseJsonList(json?: string): Record<string, unknown>[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 算法类型图标 */
const TYPE_ICON: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '⭐',
  [AlgorithmType.NEW_STORE_AD]: '🏪',
  [AlgorithmType.HOT_REVIVE_AD]: '🔥',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '👑',
  [AlgorithmType.TRAFFIC_AD]: '📊',
  [AlgorithmType.GUESS_YOU_LIKE]: '💡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '🌿',
  [AlgorithmType.SEARCH_ALGORITHM]: '🔍',
}

// 可選算法列表（從後端算法庫動態加載，不再使用本地 Mock）


// 业务频道 → 展示页面选项映射
const _CHANNEL_PAGE_OPTIONS: Record<number, { label: string; value: string }[]> = {
  [RecommendChannel.DELIVERY]: [
    { label: '大首頁-Feed', value: 'home' },
    { label: '外賣頻道-Feed', value: 'delivery' },
  ],
  [RecommendChannel.SUPERMARKET]: [
    { label: '大首頁-Feed', value: 'home' },
    { label: '超市頻道-Feed', value: 'supermarket' },
  ],
  [RecommendChannel.GROUP_BUY]: [
    { label: '大首頁-Feed', value: 'home' },
    { label: '團購頻道-Feed', value: 'groupBuy' },
  ],
}

// 时段枚举
const TIME_SLOTS = [
  { key: 'fullDay', labelKey: 'recommend.fullDaySlot' },
  { key: 'breakfast', labelKey: 'recommend.breakfastSlot' },
  { key: 'lunch', labelKey: 'recommend.lunchSlot' },
  { key: 'afternoon', labelKey: 'recommend.afternoonTeaSlot' },
  { key: 'dinner', labelKey: 'recommend.dinnerSlot' },
  { key: 'night', labelKey: 'recommend.lateNightSlot' },
]

// 商圈选择树形数据：在组件内翻译 titleKey

// 区域计价配置接口
interface RegionPricingConfig {
  region: Region
  regionLabel: string // 显示名称（区域或商圈名称）
  pricing: Record<string, number | undefined>
  discountEnabled: boolean
  discounts: Record<string, number | undefined>
  limitedTimeDiscount: boolean // 限时折扣开关
  discountDateRange?: [dayjs.Dayjs, dayjs.Dayjs] // 限时折扣日期周期
  dailySalesLimit: number // 每天销售个数限制
}

// 梯度配置接口
interface TimeSlotGradient {
  count: number | undefined
  discount: number | undefined
}

// 商家接口
interface Merchant {
  id: string
  groupId: string
  groupName: string
  storeId: string
  storeName: string
}

/**
 * 地圖尺寸修復器（解決 Leaflet 放在 Modal 彈窗中的灰屏 / 只加載左上角瓦片問題）
 * - active 變為 true（彈窗打開）後，等待彈窗動畫結束再 invalidateSize 重新測量容器尺寸
 * - 同時移除 Leaflet 前綴署名，底部僅保留「高德地图」
 */
function MapResizer({ active }: { active: boolean }) {
  const map = useMap()
  useEffect(() => {
    // 只保留高德地图署名，移除 Leaflet 前綴
    map.attributionControl.setPrefix(false)
    if (!active) return
    // 彈窗有展開動畫，延遲重新計算尺寸並定位到澳門/珠海
    const timer = setTimeout(() => {
      map.invalidateSize()
      map.setView([22.1987, 113.5439], 12)
    }, 300)
    return () => clearTimeout(timer)
  }, [active, map])
  return null
}

export default function WaterfallAdd() {
  const [searchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  // 人氣商家：獨立的皮膚定價界面（賣皮膚模式，上傳皮膚樣式並配售價）
  if (typeParam && Number(typeParam) === AlgorithmType.POPULAR_MERCHANT_KA) {
    return <PopularSkinPricing />
  }
  return <WaterfallAddGeneral />
}

/** 通用銷售定價表單（無敵星星/盤活復蘇等） */
function WaterfallAddGeneral() {
  const { t } = useTranslation()

  /** 翻譯後的商圈樹形數據 */
  const regionTreeData = useMemo(() => REGION_TREE_DATA.map(area => ({
    key: String(area.value),
    title: t(area.titleKey),
    value: area.value as string | number,
    children: (area.children ?? []).map(c => ({ key: String(c.value), title: t(c.titleKey), value: c.value as string | number })),
  })), [t])

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlAlgorithmType = searchParams.get('type') ? Number(searchParams.get('type')) as AlgorithmType : null
  const urlModule = searchParams.get('module') || 'delivery' // 'delivery' = 外賣到家, 'groupBuy' = 團購到店
  const urlId = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail' // 只读详情模式
  const isEditMode = !!urlId && !isDetailMode // 有 id 且非详情模式则为编辑模式
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])

  // 根据模块过滤业务频道选项
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: t('recommend.channelGroupBuyName'), value: RecommendChannel.GROUP_BUY }]
    : [
        { label: t('recommend.channelDeliveryName'), value: RecommendChannel.DELIVERY },
        { label: t('recommend.channelSupermarketName'), value: RecommendChannel.SUPERMARKET },
      ]

  // 基础信息
  const [selectedApp, setSelectedApp] = useState<AppType | undefined>(undefined)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel | undefined>(undefined)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | undefined>(urlAlgorithmType ?? undefined)

  // 取消扣费规则配置
  const [cancelFeeRules, setCancelFeeRules] = useState<{ id: number; maxDays: number; feePercent: number }[]>([
    { id: 1, maxDays: 0, feePercent: 100 },
    { id: 2, maxDays: 3, feePercent: 80 },
  ])

  // 退款开关
  const [refundEnabled, setRefundEnabled] = useState(false)
  
  // 广告位选择（已移除展示位置）
  const [selectedAlgorithmInfo, setSelectedAlgorithmInfo] = useState<{ id: number; name: string } | null>(null)

  // 可选算法列表（从后端算法库动态加载）
  const [algorithmSelectOptions, setAlgorithmSelectOptions] = useState<{ id: number; name: string; app: AppType; algoType?: number }[]>([])
  
  // 区域计价配置
  const [selectedRegions, setSelectedRegions] = useState<Region[]>([])
  const [regionPricingConfigs, setRegionPricingConfigs] = useState<RegionPricingConfig[]>([])
  const [_newRegionSelect, _setNewRegionSelect] = useState<Region | undefined>(undefined) // 新增区域选择器
  
  // 商圈选择弹窗
  const [regionSelectModalVisible, setRegionSelectModalVisible] = useState(false)
  const [selectedRegionNode, setSelectedRegionNode] = useState<{ key: string; value: string | number; title: string; level: number } | null>(null)
  const [replacingRegion, setReplacingRegion] = useState<Region | null>(null) // 正在更换的商圈
  

  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  
  // 推广图片
  const [coverFileList, setCoverFileList] = useState<UploadFile[]>([])
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])
  const [promoFileList, setPromoFileList] = useState<UploadFile[]>([])
  
  // 算法规则弹窗
  const [algorithmRuleModalVisible, setAlgorithmRuleModalVisible] = useState(false)
  
  // 时段个数折扣 - 梯度配置
  const [gradients, setGradients] = useState<TimeSlotGradient[]>([])
  const [gradientEnabled, setGradientEnabled] = useState(false) // 梯度配置开关
  
  // 销售策略（仅无敌星星）
  const [presaleDays, setPresaleDays] = useState<number>(7) // 预售天数
  const [merchantLimit, setMerchantLimit] = useState(false) // 商家限制
  const [selectedMerchants, setSelectedMerchants] = useState<Merchant[]>([]) // 选择的商家
  const [onlySellTimeSlots, setOnlySellTimeSlots] = useState<string[]>(['fullDay']) // 只销售时段
  
  // 商家选择弹窗
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [merchantSearchForm] = Form.useForm()
  const [tempSelectedMerchants, setTempSelectedMerchants] = useState<Merchant[]>([]) // 弹窗临时选择
  const [merchantSearchValues, setMerchantSearchValues] = useState<Record<string, string>>({}) // 已应用的搜索条件
  // 屏蔽商家可选列表：使用数据库真实门店数据（非演示数据）
  const [dbMerchants, setDbMerchants] = useState<Merchant[]>([])
  useEffect(() => {
    fetchStores({ page: 1, size: 500 }).then(res => {
      setDbMerchants(res.records.map(s => ({
        id: s.storeCode,
        groupId: s.groupCode,
        groupName: s.groupName,
        storeId: s.storeCode,
        storeName: s.storeName,
      })))
    }).catch(() => { /* 静默请求：错误不阻断页面 */ })
  }, [])
  
  // 盘活复苏 - 按天定价配置
  const [_dailyPrice, setDailyPrice] = useState<number | undefined>(undefined)
  
  // 显示广告位的条件（已移除廣告位選擇）
  
  // 廣告類型爲其它條件時顯示暫未開通提示
  const showNotAvailable = false
  
  // 是否为盤活復蘇算法类型
  const isReviveAlgorithm = selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD

  // 是否为單圖類型（無敵星星/盤活復蘇只有詳情圖，合併進基礎信息卡片）
  const isSingleImageType =
    selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR ||
    selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD

  // 从 URL 参数初始化表单
  useEffect(() => {
    if (urlAlgorithmType) {
      form.setFieldsValue({ algorithmType: urlAlgorithmType })
    }
  }, [urlAlgorithmType, form])

  /** 加载启用中的算法库，按当前广告类型过滤 */
  useEffect(() => {
    const fetchParams: Record<string, unknown> = { page: 1, size: 200, status: ServiceStatus.ENABLED }
    // 按当前广告类型过滤，确保只能选择对应类型的算法
    if (urlAlgorithmType) {
      fetchParams.algoType = urlAlgorithmType
    }
    fetchAdAlgorithms(fetchParams as Parameters<typeof fetchAdAlgorithms>[0])
      .then(res => {
        // 过滤系统预置算法（SQL seed），仅展示算法库菜单中用户创建的算法
        const opts = (res.records ?? []).filter(a => a.updatedBy !== '系統').map(a => ({
          id: a.id ?? 0,
          name: a.algoName,
          algoType: a.algoType,
          app: (brandToAppType(a.brand) ?? AppType.SHANFENG) as AppType,
        }))
        if (opts.length > 0) setAlgorithmSelectOptions(opts)
      })
      .catch(() => { /* 静默请求：错误不阻断页面 */ })
  }, [urlAlgorithmType])

  // 编辑/详情模式下加载数据
  useEffect(() => {
    if (!urlId) return
    const algoType = urlAlgorithmType ?? AlgorithmType.INVINCIBLE_STAR
    if (algoType === AlgorithmType.HOT_REVIVE_AD) {
      // 盤活復蘇：加载 revive 计价配置回填
      ;(async () => {
        try {
          const detail = await fetchAdRevivePricingDetail(Number(urlId))
          const app = (brandToAppType(detail.brand) ?? AppType.SHANFENG) as AppType
          form.setFieldsValue({
            algorithmId: detail.algoId,
            app,
            channel: detail.channel,
          })
          setSelectedApp(app)
          setSelectedChannel((detail.channel ?? RecommendChannel.DELIVERY) as RecommendChannel)
          setSelectedAlgorithmType(AlgorithmType.HOT_REVIVE_AD)
          setSelectedAlgorithmInfo({ id: detail.algoId, name: detail.algoName || '' })
          setPresaleDays(detail.presaleDays ?? 180)
          setRefundEnabled(detail.refundEnabled === 1)
          setStatus((detail.status ?? ServiceStatus.ENABLED) as ServiceStatus)
          // 多天梯度折扣（后端百分比记法 → 前端「折」记法: 90=9折）
          const tiers = parseJsonList(detail.discountTiers)
          setGradients(tiers.map(t => ({ count: Number(t.minDays) || undefined, discount: (Number(t.discount) || 0) / 10 })))
          setGradientEnabled(tiers.length > 0)
          // 屏蔽商家回填
          setMerchantLimit(detail.blockMerchant === 1)
          setSelectedMerchants(parseJsonList(detail.blockList).map(b => ({
            id: String(b.storeCode ?? ''),
            groupId: String(b.groupCode ?? ''),
            groupName: String(b.groupName ?? ''),
            storeId: String(b.storeCode ?? ''),
            storeName: String(b.storeName ?? ''),
          })).filter(m => m.storeId))
          // 取消扣费梯度
          const fees = parseJsonList(detail.cancelFeeTiers)
          if (fees.length > 0) {
            setCancelFeeRules(fees.map((f, i) => ({ id: i + 1, maxDays: Number(f.remainDays) || 0, feePercent: Number(f.ratio) || 0 })))
          }
          // 分商圈日单价（每日销售个数=库存回填）
          const configs: RegionPricingConfig[] = (detail.regionPrices ?? []).map(rp => {
            const price = Number(rp.dailyPrice) || 0
            return {
              region: rp.region as Region,
              regionLabel: (REGION_LABEL_KEY[rp.region as number] ? t(REGION_LABEL_KEY[rp.region as number]) : String(rp.region)),
              pricing: { fullDay: price, breakfast: price / 5, lunch: price / 5, afternoon: price / 5, dinner: price / 5, night: price / 5 },
              discountEnabled: false,
              discounts: {},
              limitedTimeDiscount: false,
              discountDateRange: undefined,
              dailySalesLimit: rp.dailySalesLimit ?? 2,
            }
          })
          setSelectedRegions(configs.map(c => c.region))
          setRegionPricingConfigs(configs)
        } catch { /* 静默请求 */ }
      })()
      return
    }
    const isStar = algoType === AlgorithmType.INVINCIBLE_STAR
    if (!isStar) return
    ;(async () => {
      try {
        const detail = await fetchAdPricingDetail(Number(urlId))
        const app = (brandToAppType(detail.brand) ?? AppType.SHANFENG) as AppType
        form.setFieldsValue({
          algorithmId: detail.algoId,
          app,
          channel: detail.channel,
        })
        setSelectedApp(app)
        setSelectedChannel((detail.channel ?? RecommendChannel.DELIVERY) as RecommendChannel)
        setSelectedAlgorithmType(AlgorithmType.INVINCIBLE_STAR)
        setSelectedAlgorithmInfo({ id: detail.algoId, name: detail.algoName || '' })
        setPresaleDays(detail.presaleDays ?? 7)
        setRefundEnabled(detail.refundEnabled === 1)
        setStatus((detail.status ?? ServiceStatus.ENABLED) as ServiceStatus)
        // 多时段梯度折扣（后端百分比记法 → 前端「折」记法: 90=9折）
        const tiers = parseJsonList(detail.discountTiers)
        setGradients(tiers.map(t => ({ count: Number(t.minSlots) || undefined, discount: (Number(t.discount) || 0) / 10 })))
        setGradientEnabled(tiers.length > 0)
        // 屏蔽商家回填
        setMerchantLimit(detail.blockMerchant === 1)
        setSelectedMerchants(parseJsonList(detail.blockList).map(b => ({
          id: String(b.storeCode ?? ''),
          groupId: String(b.groupCode ?? ''),
          groupName: String(b.groupName ?? ''),
          storeId: String(b.storeCode ?? ''),
          storeName: String(b.storeName ?? ''),
        })).filter(m => m.storeId))
        // 可售时段回填（后端 supper → 前端 night；空或含 fullDay → 全部时段）
        const sellSlots = parseJsonList(detail.sellTimeSlots).map(s => String(s)).map(s => s === 'supper' ? 'night' : s)
        setOnlySellTimeSlots(sellSlots.length > 0 ? sellSlots : ['fullDay'])
        // 取消扣费梯度
        const fees = parseJsonList(detail.cancelFeeTiers)
        if (fees.length > 0) {
          setCancelFeeRules(fees.map((f, i) => ({ id: i + 1, maxDays: Number(f.remainDays) || 0, feePercent: Number(f.ratio) || 0 })))
        }
        // 分商圈日单价（按 5 餐段拆分展示；每日销售个数=库存回填）
        const configs: RegionPricingConfig[] = (detail.regionPrices ?? []).map(rp => {
          const price = Number(rp.dailyPrice) || 0
          return {
            region: rp.region as Region,
            regionLabel: (REGION_LABEL_KEY[rp.region as number] ? t(REGION_LABEL_KEY[rp.region as number]) : String(rp.region)),
            pricing: { fullDay: price, breakfast: price / 5, lunch: price / 5, afternoon: price / 5, dinner: price / 5, night: price / 5 },
            discountEnabled: false,
            discounts: {},
            limitedTimeDiscount: false,
            discountDateRange: undefined,
            dailySalesLimit: rp.dailySalesLimit ?? 2,
          }
        })
        // 时段折扣配置回填（后端百分比 → 前端「折」记法）
        const sdByRegion = new Map<number, Record<string, unknown>>()
        parseJsonList(detail.slotDiscounts).forEach(sd => {
          const region = Number(sd.region)
          if (Number.isFinite(region)) sdByRegion.set(region, sd)
        })
        const toZhe = (v: unknown) => (v == null ? undefined : Math.round((Number(v) / 10) * 10) / 10)
        const finalConfigs = configs.map(c => {
          const sd = sdByRegion.get(Number(c.region))
          if (!sd) return c
          return {
            ...c,
            discountEnabled: true,
            discounts: {
              fullDay: toZhe(sd.fullDay),
              breakfast: toZhe(sd.breakfast),
              lunch: toZhe(sd.lunch),
              afternoon: toZhe(sd.afternoon),
              dinner: toZhe(sd.dinner),
              night: toZhe(sd.supper),
            },
            limitedTimeDiscount: Boolean(sd.limitedTime),
            discountDateRange: sd.startDate && sd.endDate
              ? [dayjs(String(sd.startDate)), dayjs(String(sd.endDate))] as [dayjs.Dayjs, dayjs.Dayjs]
              : undefined,
          }
        })
        setSelectedRegions(finalConfigs.map(c => c.region))
        setRegionPricingConfigs(finalConfigs)
      } catch { /* 静默请求 */ }
    })()
  }, [urlId, urlAlgorithmType, form])

  // 自定义美化 Switch
  const _CustomSwitch = ({
    checked,
    onChange,
    leftText,
    rightText,
    leftColor = '#ff4d4f',
    rightColor = '#1890ff',
  }: {
    checked?: boolean
    onChange?: (checked: boolean) => void
    leftText: string
    rightText: string
    leftColor?: string
    rightColor?: string
  }) => {
    const isChecked = checked ?? false
    return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 400 : 600,
          color: isChecked ? '#8c8c8c' : '#1890ff',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {leftText}
      </span>

      <div
        style={{
          position: 'relative',
          width: 72,
          height: 28,
          borderRadius: 999,
          background: isChecked ? rightColor : leftColor,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.3s ease',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
        }}
        onClick={() => onChange && onChange(!isChecked)}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 22,
            height: 22,
            background: '#ffffff',
            borderRadius: '50%',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            transform: isChecked ? 'translateX(44px)' : 'translateX(0)',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 600 : 400,
          color: isChecked ? '#1890ff' : '#8c8c8c',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'left',
        }}
      >
        {rightText}
      </span>
    </div>
  )
}




  // 添加区域计价配置
  const handleAddRegionConfig = (region: Region, label: string) => {
    if (regionPricingConfigs.find(c => c.region === region)) {
      message.warning(t('recommend.districtAlreadyAdded'))
      return
    }
    
    const newConfig: RegionPricingConfig = {
      region,
      regionLabel: label,
      pricing: {},
      discountEnabled: false,
      discounts: {},
      limitedTimeDiscount: false,
      discountDateRange: undefined,
      dailySalesLimit: 2,
    }
    setRegionPricingConfigs([...regionPricingConfigs, newConfig])
    setSelectedRegions([...selectedRegions, region])
  }

  // 删除区域计价配置
  const handleRemoveRegionConfig = (region: Region) => {
    if (regionPricingConfigs.length === 1) {
      Modal.confirm({
        title: t('recommend.confirmDeleteTitle'),
        content: t('recommend.confirmDeleteLastDistrict'),
        okText: t('recommend.confirmDeleteBtn'),
        cancelText: t('common:cancel'),
        okButtonProps: { danger: true },
        onOk: () => {
          setRegionPricingConfigs([])
          setSelectedRegions([])
        },
      })
      return
    }
    setRegionPricingConfigs(regionPricingConfigs.filter(c => c.region !== region))
    setSelectedRegions(selectedRegions.filter(r => r !== region))
  }

  // 更换商圈
  const handleReplaceRegion = (oldRegion: Region) => {
    setSelectedRegionNode(null)
    // 记录当前正在更换的商圈
    setReplacingRegion(oldRegion)
    setRegionSelectModalVisible(true)
  }

  // 更新区域计价
  const handleUpdateRegionPricing = (region: Region, slotKey: string, value: number | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return {
            ...config,
            pricing: { ...config.pricing, [slotKey]: value ?? undefined }
          }
        }
        return config
      })
    )
  }

  // 更新区域折扣
  const handleUpdateRegionDiscount = (region: Region, slotKey: string, value: number | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return {
            ...config,
            discounts: { ...config.discounts, [slotKey]: value ?? undefined }
          }
        }
        return config
      })
    )
  }

  // 切换区域折扣开关
  const handleToggleRegionDiscount = (region: Region, enabled: boolean) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { ...config, discountEnabled: enabled }
        }
        return config
      })
    )
  }

  // 切换限时折扣开关
  const handleToggleLimitedTimeDiscount = (region: Region, enabled: boolean) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { 
            ...config, 
            limitedTimeDiscount: enabled,
            // 如果关闭限时折扣，清空日期范围
            discountDateRange: enabled ? config.discountDateRange : undefined
          }
        }
        return config
      })
    )
  }

  // 更新限时折扣日期范围
  const handleUpdateDiscountDateRange = (region: Region, dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    setRegionPricingConfigs(configs => 
      configs.map(config => {
        if (config.region === region) {
          return { ...config, discountDateRange: dates ?? undefined }
        }
        return config
      })
    )
  }

  // 更新区域每天销售个数
  const handleUpdateRegionDailySalesLimit = (region: Region, value: number | null) => {
    setRegionPricingConfigs(configs =>
      configs.map(config => {
        if (config.region === region) {
          return { ...config, dailySalesLimit: value ?? 2 }
        }
        return config
      })
    )
  }

  // 添加梯度
  const handleAddGradient = () => {
    setGradients([...gradients, { count: undefined, discount: undefined }])
  }

  // 删除梯度
  const handleRemoveGradient = (index: number) => {
    setGradients(gradients.filter((_, i) => i !== index))
  }

  // 更新梯度
  const handleUpdateGradient = (index: number, field: 'count' | 'discount', value: number | null) => {
    setGradients(gradients.map((g, i) => {
      if (i === index) {
        return { ...g, [field]: value ?? 0 }
      }
      return g
    }))
  }

  // 返回列表（始终携带当前算法类型，保证回到该类型的列表视图）
  const handleBack = () => {
    const type = urlAlgorithmType ?? selectedAlgorithmType
    if (type != null) {
      navigate(`/promotion-waterfall?type=${type}`)
    } else {
      navigate('/promotion-waterfall')
    }
  }

  // 提交表单（无敌星星写入后端计价配置，后端不可用时降级为本地提示）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)

      if (selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR) {
        const algoId = (selectedAlgorithmInfo?.id ?? values.algorithmId) as number | undefined
        if (!algoId) {
          message.error(t('recommend.selectAlgo'))
          return
        }
        const payload: AdPricingStarRequest = {
          algoId,
          brand: appTypeToBrand(selectedApp),
          channel: selectedChannel,
          presaleDays,
          refundEnabled: refundEnabled ? 1 : 2,
          // 「折」记法 → 后端百分比记法（6折 = 60，支持2位小数）
          discountTiers: gradientEnabled
            ? gradients.filter(g => g.count && g.discount).map(g => ({ minSlots: g.count!, discount: Math.round(g.discount! * 100) / 10 }))
            : [],
          cancelFeeTiers: cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent })),
          // 屏蔽商家（规则6）：开关+名单落库，销售端据此拦截
          blockMerchant: merchantLimit ? 1 : 2,
          blockList: merchantLimit
            ? selectedMerchants.map(m => ({ storeCode: m.storeId, storeName: m.storeName, groupCode: m.groupId, groupName: m.groupName }))
            : [],
          // 可售时段（规则7）：前端 night ↔ 后端 supper
          sellTimeSlots: onlySellTimeSlots.map(s => s === 'night' ? 'supper' : s),
          // 时段折扣配置（分商圈落库，前端「折」记法 → 后端百分比记法: 8折=80）
          slotDiscounts: regionPricingConfigs
            .filter(c => c.discountEnabled)
            .map(c => {
              const toPercent = (v: number | undefined) => (v != null ? Math.round(v * 10) : undefined)
              return {
                region: c.region,
                fullDay: toPercent(c.discounts.fullDay),
                breakfast: toPercent(c.discounts.breakfast),
                lunch: toPercent(c.discounts.lunch),
                afternoon: toPercent(c.discounts.afternoon),
                dinner: toPercent(c.discounts.dinner),
                supper: toPercent(c.discounts.night),
                limitedTime: c.limitedTimeDiscount || undefined,
                startDate: c.limitedTimeDiscount && c.discountDateRange?.[0] ? c.discountDateRange[0].format('YYYY-MM-DD') : undefined,
                endDate: c.limitedTimeDiscount && c.discountDateRange?.[1] ? c.discountDateRange[1].format('YYYY-MM-DD') : undefined,
              }
            }),
          status,
          regionPrices: regionPricingConfigs.map(c => {
            const slots = ['breakfast', 'lunch', 'afternoon', 'dinner', 'night']
            const sum = slots.reduce((acc, k) => acc + (c.pricing[k] ?? 0), 0)
            return { region: c.region, dailyPrice: c.pricing.fullDay ?? sum, dailySalesLimit: c.dailySalesLimit }
          }),
        }
        if (isEditMode) {
          await updateAdPricing(Number(urlId), payload)
        } else {
          await createAdPricing(payload)
        }
        message.success(isEditMode ? t('recommend.pricingUpdated') : t('recommend.pricingSaved'))
        navigate(`/promotion-waterfall?type=${AlgorithmType.INVINCIBLE_STAR}`)
        return
      }

      if (selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD) {
        const algoId = (selectedAlgorithmInfo?.id ?? values.algorithmId) as number | undefined
        if (!algoId) {
          message.error(t('recommend.selectAlgo'))
          return
        }
        const payload: AdPricingReviveRequest = {
          algoId,
          brand: appTypeToBrand(selectedApp),
          channel: selectedChannel,
          presaleDays,
          refundEnabled: refundEnabled ? 1 : 2,
          // 多天梯度折扣：「折」记法 → 后端百分比记法（95折 = 95，支持2位小数）
          discountTiers: gradientEnabled
            ? gradients.filter(g => g.count && g.discount).map(g => ({ minDays: g.count!, discount: Math.round(g.discount! * 100) / 10 }))
            : [],
          cancelFeeTiers: cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent })),
          // 屏蔽商家：开关+名单落库，销售端据此拦截
          blockMerchant: merchantLimit ? 1 : 2,
          blockList: merchantLimit
            ? selectedMerchants.map(m => ({ storeCode: m.storeId, storeName: m.storeName, groupCode: m.groupId, groupName: m.groupName }))
            : [],
          status,
          regionPrices: regionPricingConfigs.map(c => {
            const slots = ['breakfast', 'lunch', 'afternoon', 'dinner', 'night']
            const sum = slots.reduce((acc, k) => acc + (c.pricing[k] ?? 0), 0)
            return { region: c.region, dailyPrice: c.pricing.fullDay ?? sum, dailySalesLimit: c.dailySalesLimit }
          }),
        }
        if (isEditMode) {
          await updateAdRevivePricing(Number(urlId), payload)
        } else {
          await createAdRevivePricing(payload)
        }
        message.success(isEditMode ? t('recommend.pricingUpdated') : t('recommend.pricingSaved'))
        navigate(`/promotion-waterfall?type=${AlgorithmType.HOT_REVIVE_AD}`)
        return
      }

      const submitData = {
        app: selectedApp,
        channel: selectedChannel,
        algorithmType: selectedAlgorithmType,
        slotPosition: undefined,
        algorithmId: selectedAlgorithmInfo?.id,
        algorithmName: selectedAlgorithmInfo?.name,
        regions: regionPricingConfigs.map(c => ({
          region: c.region,
          pricing: c.pricing,
          discountEnabled: c.discountEnabled,
          discounts: c.discountEnabled ? c.discounts : undefined,
          dailySalesLimit: c.dailySalesLimit,
        })),
        gradients,
        status,
      }

      message.success(t('recommend.addSuccessMsg'))
      navigate(`/promotion-waterfall?type=${selectedAlgorithmType}`)
    } catch (error) {
      // 表单校验失败不提示（antd 已标红），接口业务错误提示后端返回信息
      if (error instanceof Error) {
        message.error(error.message || t('recommend.saveFailed'))
      }
    } finally {
      setLoading(false)
    }
  }

  // 商家搜索过滤（支持集团ID/名称合并搜索、门店ID/名称合并搜索）
  const filteredMerchants = useMemo(() => {
    return dbMerchants.filter(m => {
      if (merchantSearchValues.groupKeyword) {
        const kw = merchantSearchValues.groupKeyword.toLowerCase()
        if (!m.groupId.toLowerCase().includes(kw) && !m.groupName.toLowerCase().includes(kw)) return false
      }
      if (merchantSearchValues.storeKeyword) {
        const kw = merchantSearchValues.storeKeyword.toLowerCase()
        if (!m.storeId.toLowerCase().includes(kw) && !m.storeName.toLowerCase().includes(kw)) return false
      }
      return true
    })
  }, [merchantSearchValues, dbMerchants])

  // 集团下拉选项（去重）
  const groupOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbMerchants.forEach(m => {
      if (!map.has(m.groupId)) {
        map.set(m.groupId, { label: `${m.groupId} - ${m.groupName}`, value: m.groupId })
      }
    })
    return Array.from(map.values())
  }, [dbMerchants])

  // 门店下拉选项（去重）
  const storeOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>()
    dbMerchants.forEach(m => {
      if (!map.has(m.storeId)) {
        map.set(m.storeId, { label: `${m.storeId} - ${m.storeName}`, value: m.storeId })
      }
    })
    return Array.from(map.values())
  }, [dbMerchants])

  // 商家搜索
  const handleMerchantSearch = () => {
    const values = merchantSearchForm.getFieldsValue() || {}
    setMerchantSearchValues(values)
  }

  // 商家搜索重置
  const handleMerchantSearchReset = () => {
    merchantSearchForm.resetFields()
    setMerchantSearchValues({})
  }

  // 打开商家选择弹窗
  const handleOpenMerchantModal = () => {
    setTempSelectedMerchants([...selectedMerchants])
    merchantSearchForm.resetFields()
    setMerchantModalVisible(true)
  }

  // 确认选择商家
  const handleConfirmMerchants = () => {
    setSelectedMerchants(tempSelectedMerchants)
    setMerchantModalVisible(false)
    message.success(t('recommend.merchantsSelectedCount', { count: tempSelectedMerchants.length }))
  }

  // 删除已选商家
  const handleRemoveMerchant = (merchantId: string) => {
    setSelectedMerchants(selectedMerchants.filter(m => m.id !== merchantId))
  }

  return (
    <div className="content-area">
      {/* 顶部标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? t('recommend.pricingDetailTitle') : isEditMode ? t('recommend.editPricingTitle') : t('recommend.addPricingTitle')}
              </h2>
              {urlAlgorithmType != null && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {TYPE_ICON[urlAlgorithmType]} {(ALGORITHM_TYPE_OPTIONS.find(o => o.value === urlAlgorithmType)?.labelKey ? t(ALGORITHM_TYPE_OPTIONS.find(o => o.value === urlAlgorithmType)!.labelKey) : '')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 表单内容区域 */}
      <div style={{ padding: 0 }}>
        <Form form={form} layout="vertical" disabled={isDetailMode}>
          {/* 基础信息 */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.basicInfo')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item 
                label={t('recommend.algoName')}
                name="algorithmId" 
                rules={[{ required: true, message: t('recommend.selectAlgo') }]}
              >
                <Select 
                  disabled={isEditMode || isDetailMode}
                  placeholder={t('recommend.selectAlgo')}
                  showSearch
                  optionFilterProp="label"
                  options={algorithmSelectOptions.map(alg => ({
                    label: alg.name,
                    value: alg.id,
                  }))}
                  onChange={(value) => {
                    // 根据算法自动带出所属品牌，并记录选中算法信息
                    const selectedAlg = algorithmSelectOptions.find(alg => alg.id === value)
                    if (selectedAlg) {
                      setSelectedAlgorithmInfo({ id: selectedAlg.id, name: selectedAlg.name })
                      if (selectedAlg.app) {
                        form.setFieldsValue({ app: selectedAlg.app })
                        setSelectedApp(selectedAlg.app)
                      }
                    }
                  }}
                />
              </Form.Item>

              <Form.Item 
                label={t('common:brand')} 
                name="app" 
                rules={[{ required: true, message: t('common:selectBrand') }]}
              >
                <Select 
                  disabled
                  placeholder={t('common:selectBrand')} 
                  options={tAppOptions}
                  onChange={(value) => setSelectedApp(value)}
                />
              </Form.Item>

              <Form.Item 
                label={t('common:channel')} 
                name="channel" 
                rules={[{ required: true, message: t('common:selectChannel') }]}
              >
                <Select 
                  disabled={isEditMode || isDetailMode}
                  placeholder={t('common:selectChannel')} 
                  options={channelOptions}
                  onChange={(value) => {
                    setSelectedChannel(value)
                    // 切换頻道时重置展示页面
                    form.setFieldsValue({ algorithmLandingPage: undefined })
                  }}
                />
              </Form.Item>
            </div>
            {/* 單圖類型：詳情圖置於第二行，與算法名稱左對齊 */}
            {isSingleImageType && (
              <Form.Item label={t('recommend.detailImage')} style={{ marginBottom: 0, marginTop: 16 }}>
                <Upload
                  disabled={isDetailMode}
                  listType="picture-card"
                  fileList={coverFileList}
                  onChange={({ fileList }) => setCoverFileList(fileList)}
                  beforeUpload={() => false}
                >
                  {coverFileList.length < 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <PlusOutlined style={{ fontSize: 20 }} />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.uploadDetailImage')}</span>
                    </div>
                  )}
                </Upload>
              </Form.Item>
            )}
          </div>

          {/* 推广图片（多圖類型：詳情/宣傳；單圖類型已合併至基礎信息卡片） */}
          {!isSingleImageType && (
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PictureOutlined style={{ fontSize: 14, color: '#52c41a' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.promoImage')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              <Form.Item label={t('recommend.detailImage')}>
                <Upload
                  listType="picture-card"
                  fileList={coverFileList}
                  onChange={({ fileList }) => setCoverFileList(fileList)}
                  beforeUpload={() => false}
                >
                  {coverFileList.length < 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <PlusOutlined style={{ fontSize: 20 }} />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.uploadDetailImage')}</span>
                    </div>
                  )}
                </Upload>
              </Form.Item>
              <Form.Item label={t('recommend.detailImage')}>
                <Upload
                  listType="picture-card"
                  fileList={detailFileList}
                  onChange={({ fileList }) => setDetailFileList(fileList)}
                  beforeUpload={() => false}
                >
                  {detailFileList.length < 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <PlusOutlined style={{ fontSize: 20 }} />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.uploadDetailImage')}</span>
                    </div>
                  )}
                </Upload>
              </Form.Item>
              <Form.Item label={t('recommend.promoImageLabel')}>
                <Upload
                  listType="picture-card"
                  fileList={promoFileList}
                  onChange={({ fileList }) => setPromoFileList(fileList)}
                  beforeUpload={() => false}
                >
                  {promoFileList.length < 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <PlusOutlined style={{ fontSize: 20 }} />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.uploadPromoImage')}</span>
                    </div>
                  )}
                </Upload>
              </Form.Item>
            </div>
          </div>
          )}

          {/* 销售策略（无敌星星 + 盘活复苏） */}
          {(
            <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.salesStrategy')}</span>
                <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('recommend.strategyConfigTag')}</Tag>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              </div>
              {/* 预售天数 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.preSaleDaysLabel')}</span>
                  <InputNumber
                    min={1}
                    max={90}
                    value={presaleDays}
                    onChange={(value) => setPresaleDays(value || 7)}
                    addonAfter={t('recommend.dayAddon')}
                    style={{ width: 160 }}
                  />
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
                    {t('recommend.preSaleDaysTipDynamic', { days: presaleDays })}
                  </span>
                </div>
              </div>

              {/* 屏蔽商家：Switch + 选择商家 + 备注 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.blockMerchantsLabel')}</span>
                  <Switch 
                    checked={merchantLimit}
                    onChange={(checked) => setMerchantLimit(checked)}
                    checkedChildren={t('recommend.blockOn')}
                    unCheckedChildren={t('recommend.blockOff')}
                  />
                </div>
                {merchantLimit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button 
                      icon={<PlusOutlined />} 
                      onClick={handleOpenMerchantModal}
                      type={selectedMerchants.length > 0 ? 'default' : 'default'}
                    >
                      {selectedMerchants.length > 0 ? t('recommend.manageMerchants') : t('recommend.selectMerchant')}
                    </Button>
                    {selectedMerchants.length > 0 && (
                      <Space size={4} wrap>
                        {selectedMerchants.slice(0, 3).map(m => (
                          <Tag 
                            key={m.id} 
                            color="blue" 
                            closable 
                            onClose={(e) => { e.preventDefault(); handleRemoveMerchant(m.id) }}
                            style={{ margin: 0 }}
                          >
                            {m.storeName}
                          </Tag>
                        ))}
                        {selectedMerchants.length > 3 && (
                          <Tag color="blue" style={{ margin: 0, cursor: 'pointer' }} onClick={handleOpenMerchantModal}>
                            +{selectedMerchants.length - 3} {t('recommend.moreCount', { count: selectedMerchants.length - 3 })}
                          </Tag>
                        )}
                      </Space>
                    )}
                  </div>
                )}
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {t('recommend.blockMerchantTip')}
                </span>
              </div>

              {/* 可售时段（仅无敌星星） */}
              {!isReviveAlgorithm && (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend.sellableTimeSlots')}</span>
                  <Switch 
                    checked={!onlySellTimeSlots.includes('fullDay')}
                    onChange={(checked) => {
                      if (checked) {
                        // 指定：清空选择，让用户自己勾选
                        setOnlySellTimeSlots([])
                      } else {
                        // 全部
                        setOnlySellTimeSlots(['fullDay'])
                      }
                    }}
                    checkedChildren={t('recommend.designate')}
                    unCheckedChildren={t('recommend.allTimeSlots')}
                  />
                </div>
                {/* 指定时显示5个时段勾选 */}
                {!onlySellTimeSlots.includes('fullDay') && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, padding: 12, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                    {TIME_SLOTS.filter(s => s.key !== 'fullDay').map(slot => (
                      <Checkbox
                        key={slot.key}
                        checked={onlySellTimeSlots.includes(slot.key)}
                        onChange={(e) => {
                          let next: string[]
                          if (e.target.checked) {
                            next = [...onlySellTimeSlots, slot.key]
                          } else {
                            next = onlySellTimeSlots.filter(k => k !== slot.key)
                          }
                          setOnlySellTimeSlots(next)
                        }}
                      >
                        {t(slot.labelKey)}
                      </Checkbox>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          )}
          {showNotAvailable && (
            <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#8c8c8c' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#595959', marginBottom: 6 }}>
                  {t('recommend.notAvailableTitle')}
                </div>
                <div style={{ fontSize: 13 }}>
                  {t('recommend.notAvailableHint')}
                </div>
              </div>
            </div>
          )}


          {/* 区域计价配置 - 无敌星星和盘活复苏都显示 */}
            <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FundOutlined style={{ fontSize: 14, color: '#722ed1' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.districtPricingConfig')}</span>
                <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{t('recommend.zonePricingTag')}</Tag>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                <Button 
                  type="primary" 
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSelectedRegionNode(null)
                    setRegionSelectModalVisible(true)
                  }}
                  style={{ borderRadius: 6 }}
                >
                  {t('recommend.selectDistrictBtn')}
                </Button>
              </div>
              {regionPricingConfigs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c', fontSize: 13 }}>
                  {t('recommend.districtEmptyHint')}
                </div>
              ) : (
                <>
              {/* 每个区域的计价配置 */}
              {regionPricingConfigs.map((config, index) => (
                <div key={config.region} style={{ marginBottom: index < regionPricingConfigs.length - 1 ? 24 : 0, padding: 16, background: '#fafafa', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Tag color="cyan" style={{ fontSize: 14, padding: '4px 12px' }}>
                        {config.regionLabel}
                      </Tag>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.dailySalesCount')}</span>
                        <InputNumber
                          min={1}
                          max={999}
                          value={config.dailySalesLimit}
                          onChange={(value) => handleUpdateRegionDailySalesLimit(config.region, value)}
                          addonAfter={t('recommend.dailySalesUnit')}
                          style={{ width: 140 }}
                        />
                        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {t('recommend.dailySalesHint', { count: config.dailySalesLimit })}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Button
                        type="text"
                        icon={<EditOutlined style={{ fontSize: 14, color: '#1890FF' }} />}
                        onClick={() => handleReplaceRegion(config.region)}
                        style={{ fontSize: 12, color: '#1890FF', padding: '2px 6px' }}
                      >
                        {t('recommend.replace')}
                      </Button>
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 14 }} />}
                        onClick={() => handleRemoveRegionConfig(config.region)}
                        style={{ fontSize: 12, padding: '2px 6px' }}
                      >
                        {t('common:delete')}
                      </Button>
                    </div>
                  </div>

                  {/* 时段售价 / 按天售价 */}
                  {isReviveAlgorithm ? (
                    // 盤活復蘇：按天计价
                    <div style={{ width: '100%' }}>
                      <Form.Item
                        label={t('recommend.dailyPriceLabel')}
                        style={{ marginBottom: 0, maxWidth: 500 }}
                      >
                        <InputNumber
                          min={0}
                          precision={2}
                          placeholder={t('recommend.dailyPricePh')}
                          style={{ width: '100%' }}
                          addonAfter={t('recommend.mopPerDay')}
                          value={config.pricing['fullDay']}
                          onChange={(value) => handleUpdateRegionPricing(config.region, 'fullDay', value)}
                        />
                      </Form.Item>
                    </div>
                  ) : (
                    // 無敵星星：按时段计价
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                      {TIME_SLOTS.map(slot => (
                        <Form.Item
                          key={slot.key}
                          label={`${t(slot.labelKey)}${t('recommend.slotPriceSuffix')}`}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={0}
                            precision={2}
                            placeholder={t('recommend.slotPricePh', { slot: t(slot.labelKey) })}
                            style={{ width: '100%' }}
                            addonAfter="MOP"
                            value={config.pricing[slot.key]}
                            onChange={(value) => handleUpdateRegionPricing(config.region, slot.key, value)}
                          />
                        </Form.Item>
                      ))}
                    </div>
                  )}

                  {/* 时段折扣开关 - 仅無敵星星显示 */}
                  {!isReviveAlgorithm && (
                    <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: config.discountEnabled ? 12 : 0 }}>
                    <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.slotDiscountConfig')}</span>
                    <Switch 
                      checked={config.discountEnabled} 
                      onChange={(checked) => handleToggleRegionDiscount(config.region, checked)}
                      size="small"
                    />
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.slotDiscountHint')}</span>
                  </div>

                  {/* 时段折扣配置 */}
                  {config.discountEnabled && (
                    <>
                      {/* 限时折扣开关 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: config.limitedTimeDiscount ? 12 : 16 }}>
                        <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.longTermDiscount')}</span>
                        <Switch 
                          checked={config.limitedTimeDiscount} 
                          onChange={(checked) => handleToggleLimitedTimeDiscount(config.region, checked)}
                          size="small"
                        />
                        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {config.limitedTimeDiscount ? t('recommend.executeInPeriod') : t('recommend.limitedTimeDiscountLabel')}
                        </span>
                      </div>

                      {/* 限时折扣日期周期 */}
                      {config.limitedTimeDiscount && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                          <Form.Item
                            label={t('recommend.discountPeriod')}
                            style={{ marginBottom: 0 }}
                          >
                            <DatePicker.RangePicker
                              style={{ width: '100%' }}
                              placeholder={[t('common:startDate'), t('common:endDate')]}
                              value={config.discountDateRange}
                              onChange={(dates) => handleUpdateDiscountDateRange(config.region, dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                            />
                          </Form.Item>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {TIME_SLOTS.map(slot => {
                        const discountValue = config.discounts[slot.key]
                        return (
                        <Form.Item
                          key={slot.key}
                          label={`${t(slot.labelKey)}${t('recommend.zheUnit')}`}
                          style={{ marginBottom: 0 }}
                        >
                          {isDetailMode && (discountValue === null || discountValue === undefined) ? (
                            <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 11px', background: '#fafafa', border: '1px solid #e8eaed', borderRadius: 6, color: '#8c8c8c' }}>{t('recommend.noDiscount')}</div>
                          ) : (
                            <InputNumber
                              min={1}
                              max={100}
                              placeholder={t('recommend.slotDiscountPh', { slot: t(slot.labelKey) })}
                              style={{ width: '100%' }}
                              addonAfter={t('recommend.zheUnit')}
                              value={discountValue}
                              onChange={(value) => handleUpdateRegionDiscount(config.region, slot.key, value)}
                            />
                          )}
                        </Form.Item>
                        )
                      })}
                    </div>
                    </>
                  )}
                    </>
                  )}
                </div>
              ))}
              </>
              )}
            </div>

          {/* 盘活复苏 - 梯度折扣配置（选择商圈后才展示） */}
          {isReviveAlgorithm && regionPricingConfigs.length > 0 && (
            <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {/* 购买多天折扣配置（梯度） */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('recommend.multiDayDiscount')}</span>
                <Switch 
                  checked={gradientEnabled}
                  onChange={(checked) => {
                    setGradientEnabled(checked)
                    if (checked && gradients.length === 0) {
                      setGradients([{ count: undefined, discount: undefined }])
                    }
                  }}
                  size="small"
                />
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.matchDiscountTip')}</span>
                {gradientEnabled && (
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={handleAddGradient}
                    style={{ borderRadius: 6, marginLeft: 'auto' }}
                  >
                    {t('recommend.addGradient')}
                  </Button>
                )}
              </div>
              {gradientEnabled && (
                gradients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                    {t('recommend.noGradientConfig')}
                  </div>
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {gradients.map((gradient, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                      <Tag color="blue">{t('recommend.gradientN', { index: index + 1 })}</Tag>
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.purchaseDaysGe')}</span>
                      <InputNumber
                        min={1}
                        max={9999}
                        placeholder={t('recommend.daysPlaceholder')}
                        style={{ width: 110 }}
                        value={gradient.count || undefined}
                        onChange={(value) => handleUpdateGradient(index, 'count', value)}
                      />
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.dayUnit')}{t('recommend.correspondingDiscount')}</span>
                      <InputNumber
                        min={0.01}
                        max={10}
                        precision={2}
                        placeholder={t('recommend.discountPlaceholder')}
                        style={{ width: 120 }}
                        addonAfter={t('recommend.zheUnit')}
                        value={gradient.discount || undefined}
                        onChange={(value) => handleUpdateGradient(index, 'discount', value)}
                      />
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 16 }} />}
                        onClick={() => handleRemoveGradient(index)}
                      />
                    </div>
                  ))}
                </Space>
                )
              )}
            </div>
          )}

          {/* 时段个数折扣配置 - 仅无敌星星显示 */}
          {!isReviveAlgorithm && selectedRegions.length > 0 && (
            <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6fffb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BarChartOutlined style={{ fontSize: 14, color: '#13c2c2' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>
                  {t('recommend.slotCountDiscountTitle')}
                </span>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                <Switch 
                  checked={gradientEnabled}
                  onChange={(checked) => {
                    setGradientEnabled(checked)
                    if (checked && gradients.length === 0) {
                      setGradients([{ count: undefined, discount: undefined }])
                    }
                  }}
                  size="small"
                />
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {t('recommend.slotCountDiscountHint')}
                </span>
                {gradientEnabled && (
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={handleAddGradient}
                    style={{ borderRadius: 6 }}
                  >
                    {t('recommend.addGradient')}
                  </Button>
                )}
              </div>
              {gradientEnabled ? (
                gradients.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                    {t('recommend.noGradientConfig')}
                  </div>
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {gradients.map((gradient, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                      <Tag color="blue">{t('recommend.gradientN', { index: index + 1 })}</Tag>
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.slotCountGe')}</span>
                      <InputNumber
                        min={1}
                        max={9999}
                        placeholder={t('recommend.daysPlaceholder')}
                        style={{ width: 110 }}
                        value={gradient.count || undefined}
                        onChange={(value) => handleUpdateGradient(index, 'count', value)}
                      />
                      <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.slotCountUnit')}{t('recommend.correspondingDiscount')}</span>
                      <InputNumber
                        min={0.01}
                        max={10}
                        precision={2}
                        placeholder={t('recommend.discountPlaceholder')}
                        style={{ width: 120 }}
                        addonAfter={t('recommend.zheUnit')}
                        value={gradient.discount || undefined}
                        onChange={(value) => handleUpdateGradient(index, 'discount', value)}
                      />
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteFilled style={{ fontSize: 16 }} />}
                        onClick={() => handleRemoveGradient(index)}
                      />
                    </div>
                  ))}
                </Space>
                )
              ) : null}
            </div>
          )}

          {/* 商圈选择弹窗 */}
          <Modal
            title={replacingRegion ? t('recommend.replaceDistrict') : t('recommend.selectDistrictTitle')}
            open={regionSelectModalVisible}
            onCancel={() => { setRegionSelectModalVisible(false); setReplacingRegion(null) }}
            onOk={() => {
              if (!selectedRegionNode) {
                message.warning(t('recommend.selectRegionWarning'))
                return
              }
              // 商圈节点 value 即 Region 枚举值（全局统一数据）；选区域（父节点）时取其首个子商圈
              let regionValue: Region
              if (typeof selectedRegionNode.value === 'number') {
                regionValue = selectedRegionNode.value as Region
              } else {
                const first = AREA_TO_REGIONS[selectedRegionNode.value]?.[0]
                if (!first) {
                  message.warning(t('recommend.regionUnrecognized'))
                  return
                }
                regionValue = first
              }
              
              // 更换商圈模式
              if (replacingRegion) {
                if (regionPricingConfigs.find(c => c.region === regionValue && c.region !== replacingRegion)) {
                  message.warning(t('recommend.districtAlreadyAdded'))
                  return
                }
                setRegionPricingConfigs(configs => configs.map(c => 
                  c.region === replacingRegion 
                    ? { ...c, region: regionValue, regionLabel: selectedRegionNode.title }
                    : c
                ))
                setSelectedRegions(regions => regions.map(r => r === replacingRegion ? regionValue : r))
                setReplacingRegion(null)
                setRegionSelectModalVisible(false)
                message.success(t('recommend.districtReplaced'))
                return
              }
              
              if (regionPricingConfigs.find(c => c.region === regionValue)) {
                message.warning(t('recommend.districtAlreadyAdded'))
                return
              }
              handleAddRegionConfig(regionValue, selectedRegionNode.title)
              setRegionSelectModalVisible(false)
            }}
            okText={t('common:confirm')}
            cancelText={t('common:cancel')}
            width={800}
          >
            <div style={{ display: 'flex', gap: 16, padding: '8px 0' }}>
              {/* 左侧树形结构 */}
              <div style={{ width: 240, flexShrink: 0 }}>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#8c8c8c' }}>
                  {t('recommend.selectRegionOrDistrict')}
                </div>
                <Tree
                  treeData={regionTreeData}
                  defaultExpandAll
                  showIcon={false}
                  switcherIcon={<DownOutlined />}
                  selectedKeys={selectedRegionNode ? [selectedRegionNode.key] : []}
                  onSelect={(keys, info) => {
                    setSelectedRegionNode({
                      key: keys[0] as string,
                      value: (info.node as { value?: string | number }).value ?? keys[0] as string,
                      title: info.node.title as string,
                      level: info.node.children ? 1 : 2,
                    })
                  }}
                  style={{ padding: 12, background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0', minHeight: 520 }}
                />
                {selectedRegionNode && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>{t('recommend.selectedLabel')}</span>
                    <Tag color="green">{selectedRegionNode.title}</Tag>
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>({selectedRegionNode.level === 1 ? t('recommend.regionLabel') : t('recommend.districtLabel')})</span>
                  </div>
                )}
              </div>
              {/* 右侧地图区域 */}
              <div style={{ flex: 1, borderRadius: 6, overflow: 'hidden', border: '1px solid #f0f0f0', minHeight: 520, height: 520 }}>
                <MapContainer
                  center={[22.1987, 113.5439]}
                  zoom={12}
                  style={{ height: '100%', width: '100%' }}
                  preferCanvas
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.amap.com/">高德地图</a>'
                    url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
                    subdomains="1234"
                    updateWhenIdle={false}
                    keepBuffer={4}
                  />
                  <MapResizer active={regionSelectModalVisible} />
                </MapContainer>
              </div>
            </div>
          </Modal>


        </Form>
      </div>

      {/* 訂單退款，退費比例配置 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff1f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.refundConfig')}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 4 }}>{t('recommend.refundConfigDesc')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: refundEnabled ? '#52c41a' : '#8c8c8c' }}>{refundEnabled ? t('recommend.allowRefund') : t('recommend.denyRefund')}</span>
            <Switch
              size="small"
              checked={refundEnabled}
              onChange={(checked) => setRefundEnabled(checked)}
              style={{ background: refundEnabled ? '#52c41a' : '#d9d9d9' }}
            />
          </div>
        </div>
        {refundEnabled ? (
        <Table
          rowKey="id"
          dataSource={cancelFeeRules}
          pagination={false}
          bordered
          size="small"
          columns={[
            {
              title: t('recommend.adPromotionCol'),
              dataIndex: 'maxDays',
              width: 220,
              render: (_, record: { id: number; maxDays: number; feePercent: number }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend.remainingDaysLE')}</span>
                  <InputNumber
                    disabled={isDetailMode}
                    min={0}
                    max={999}
                    value={record.maxDays === 999 ? undefined : record.maxDays}
                    onChange={(val) => {
                      setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, maxDays: val ?? 0 } : r))
                    }}
                    addonAfter={record.maxDays === 999 ? '' : t('recommend.dayUnit')}
                    placeholder={record.maxDays === 999 ? t('common:all') : ''}
                    style={{ flex: 1 }}
                  />
                </div>
              ),
            },
            {
              title: t('recommend.ratioConfigCol'),
              dataIndex: 'feePercent',
              width: 160,
              render: (_, record: { id: number; maxDays: number; feePercent: number }) => (
                <InputNumber
                  disabled={isDetailMode}
                  min={0}
                  max={100}
                  value={record.feePercent}
                  onChange={(val) => {
                    setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, feePercent: val ?? 0 } : r))
                  }}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              ),
            },
            {
              title: t('common:action'),
              width: 120,
              align: 'center',
              render: (_: unknown, record: { id: number; maxDays: number; feePercent: number }) => {
                if (isDetailMode) return <span style={{ color: '#bfbfbf' }}>—</span>
                const isLastRow = cancelFeeRules[cancelFeeRules.length - 1]?.id === record.id
                return (
                  <Space size={4}>
                    {isLastRow && (
                      <Button
                        type="link"
                        size="small"
                        
                        onClick={() => {
                          const nextId = cancelFeeRules.length > 0 ? Math.max(...cancelFeeRules.map(r => r.id)) + 1 : 1
                          setCancelFeeRules(prev => [...prev, { id: nextId, maxDays: 0, feePercent: 50 }])
                        }}
                      >
                        {t('recommend.addTier')}
                      </Button>
                    )}
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        if (cancelFeeRules.length <= 1) {
                          message.warning(t('recommend.atLeastOneRule'))
                          return
                        }
                        setCancelFeeRules(prev => prev.filter(r => r.id !== record.id))
                      }}
                    >
                      {t('common:delete')}
                    </Button>
                  </Space>
                )
              },
            },
          ]}
        />
        ) : (
          <div style={{
            padding: '24px', textAlign: 'center',
            background: '#fafafa', borderRadius: 8,
            border: '1px dashed #d9d9d9',
          }}>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend.denyRefundTip')}</span>
          </div>
        )}
      </div>

      {/* 狀態設置 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('recommend.statusSetting')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.statusLabelColon')}</span>
          <Switch
            checked={status === ServiceStatus.ENABLED}
            disabled={isDetailMode}
            onChange={(checked) => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
            checkedChildren={t('recommend.enableLabel')}
            unCheckedChildren={t('recommend.disableLabel')}
          />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend.disablePricingHint')}</span>
        </div>
      </div>

      {/* 底部操作按钮 - 固定（取消/保存） */}
      {!isDetailMode && (
      <div className="form-footer">
        <Button onClick={handleBack}>
          {t('common:cancel')}
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSubmit}
          loading={loading}
        >
          {t('common:save')}
        </Button>
      </div>
      )}

      {/* 算法规则弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>{t('recommend.algoRuleConfig')}</span>
          </Space>
        }
        open={algorithmRuleModalVisible}
        onCancel={() => setAlgorithmRuleModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAlgorithmRuleModalVisible(false)}>
            {t('common:close')}
          </Button>
        ]}
        width={800}
      >
        {selectedAlgorithmInfo && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 6 }}>
              <Space>
                <span style={{ color: '#8c8c8c' }}>{t('recommend.algoIdLabel')}</span>
                <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>
                  {String(selectedAlgorithmInfo.id).padStart(6, '0')}
                </code>
                <span style={{ color: '#8c8c8c', marginLeft: 16 }}>{t('recommend.algoNameLabelColon')}</span>
                <strong>{selectedAlgorithmInfo.name}</strong>
              </Space>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12 }}>{t('recommend.ruleParamConfig')}</h4>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fff', borderBottom: '2px solid #d9d9d9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>{t('recommend.paramNameCol')}</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>{t('recommend.paramValueCol')}</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 13 }}>{t('recommend.descCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{t('recommend.matchStrategyRow')}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>weighted_score</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>{t('recommend.weightedScoreMatch')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{t('recommend.recallCountRow')}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>100</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>{t('recommend.initialRecallItems')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{t('recommend.fineRankThresholdRow')}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>0.75</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>{t('recommend.fineRankFilterThreshold')}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{t('recommend.rerankStrategyRow')}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>diversity_boost</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>{t('recommend.diversityBoostRerank')}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}>{t('recommend.scatterRuleRow')}</td>
                    <td style={{ padding: '8px 12px', fontSize: 13 }}><code>category_interval=3</code></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: '#8c8c8c' }}>{t('recommend.categoryInterval3')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <h4 style={{ marginBottom: 12 }}>{t('recommend.weightConfigTitle')}</h4>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div style={{ padding: 12, background: '#fff', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('recommend.salesWeight')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>0.35</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('recommend.ratingWeight')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#52c41a' }}>0.25</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('recommend.distanceWeight')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#faad14' }}>0.20</div>
                </div>
                <div style={{ padding: 12, background: '#fff', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('recommend.conversionWeight')}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#f5222d' }}>0.20</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 商家选择弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShopOutlined style={{ fontSize: 12, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>{t('recommend.selectBlockMerchant')}</span>
          </div>
        }
        open={merchantModalVisible}
        onCancel={() => setMerchantModalVisible(false)}
        width={800}
        onOk={handleConfirmMerchants}
        okText={t('recommend.confirmSelectMerchants')}
        cancelText={t('common:cancel')}
        destroyOnClose
      >
        {/* 查询条件 */}
        <div className="search-section">
          <Form form={merchantSearchForm} layout="inline" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Form.Item label={t('recommend.groupLabel')} name="groupKeyword">
              <Select
                showSearch
                allowClear
                placeholder={t('recommend.groupSearchPh')}
                options={groupOptions}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item label={t('recommend.storeLabel')} name="storeKeyword">
              <Select
                showSearch
                allowClear
                placeholder={t('recommend.storeSearchPh')}
                options={storeOptions}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" onClick={handleMerchantSearch}>{t('common:search')}</Button>
                <Button onClick={handleMerchantSearchReset}>{t('common:reset')}</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {/* 已选提示 */}
        {tempSelectedMerchants.length > 0 && (
          <div style={{ marginBottom: 12, padding: '6px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#52c41a', fontWeight: 500 }}>
              {t('recommend.merchantsSelectedCount', { count: tempSelectedMerchants.length })}
            </span>
            <Space size={4} wrap>
              {tempSelectedMerchants.slice(0, 5).map(m => (
                <Tag 
                  key={m.id} 
                  color="blue" 
                  closable 
                  onClose={(e) => { e.preventDefault(); setTempSelectedMerchants(tempSelectedMerchants.filter(s => s.id !== m.id)) }}
                  style={{ margin: 0 }}
                >
                  {m.storeName}
                </Tag>
              ))}
              {tempSelectedMerchants.length > 5 && (
                <Tag color="blue" style={{ margin: 0 }}>+{tempSelectedMerchants.length - 5} {t('recommend.moreCount', { count: tempSelectedMerchants.length - 5 })}</Tag>
              )}
            </Space>
          </div>
        )}

        {/* 商家列表 */}
        <Table
          rowKey="id"
          dataSource={filteredMerchants}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => t('common:total', { count: total }),
            size: 'small',
          }}
          size="small"
          scroll={{ y: 360 }}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: tempSelectedMerchants.map(m => m.id),
            preserveSelectedRowKeys: true,
            onChange: (selectedRowKeys, selectedRows) => {
              // preserveSelectedRowKeys 会保留所有页的选择，selectedRows 包含所有已选数据
              setTempSelectedMerchants(selectedRows.filter(Boolean))
            },
          }}
          columns={[
            {
              title: t('common:colGroupId'),
              dataIndex: 'groupId',
              key: 'groupId',
              width: 100,
            },
            {
              title: t('common:colGroupName'),
              dataIndex: 'groupName',
              key: 'groupName',
              width: 140,
            },
            {
              title: t('common:colStoreId'),
              dataIndex: 'storeId',
              key: 'storeId',
              width: 100,
            },
            {
              title: t('common:colStoreName'),
              dataIndex: 'storeName',
              key: 'storeName',
            },
          ]}
        />
      </Modal>

    </div>
  )
}
