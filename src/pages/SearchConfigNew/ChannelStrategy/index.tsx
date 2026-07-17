import { useState, useMemo } from 'react'
import {
  Card, Form, Input, InputNumber, Table, Switch, Button, Space, Tag,
  Modal, Select, Radio, message, Row, Col, Typography, Tooltip,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined, SearchOutlined, ShopOutlined,
  UserOutlined, GlobalOutlined, DollarOutlined, ReloadOutlined,
  RocketOutlined, GiftOutlined, ShoppingOutlined, AppstoreOutlined, SettingOutlined,
} from '@ant-design/icons'
import { Tabs } from 'antd'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'

const { Text } = Typography

/* ============================ 類型 ============================ */

type Biz = 'takeaway' | 'supermarket' | 'groupBuy'
type AppChannelType = 'all' | 'flashBee' | 'mFood'
type BoostMethod = 'fixed' | 'weight_multiply'

interface StoreFactor {
  key: string; factorName: string; bonusValue: number; description: string; enabled: boolean
}
interface ActivityRecord {
  key: string; activityType: string; activityName: string; appChannel: AppChannelType
  boostValue: number; boostMethod: BoostMethod
  status: boolean; weightValue?: number; multiplyValue?: number
  description?: string
  updatedBy: string; updatedAt: string
}
/** 加分梯队配置（简化版，移除金额区间） */
interface BoostTier {
  boostType: 'amount_match' | 'fixed_boost' // 加分类型
  boostValue: number // 加分值（amount_match时为倍数，fixed_boost时为固定分数）
}

/** 减分梯队配置 */
interface DemoteTier {
  days: number         // 未购买广告天数
  deductionType: 'fixed_deduction' | 'percent_deduction' // 扣分类型
  deductionValue: number // 扣分值（fixed_deduction时为固定分数，percent_deduction时为折扣比例）
}

interface AdRecord {
  key: string; adType: string; adName: string
  appChannel: AppChannelType
  boostValue: number; status: boolean
  description?: string
  updatedBy: string; updatedAt: string
  // 梯队配置字段
  boostTiers?: BoostTier[]
  demoteTiers?: DemoteTier[]
  // 是否可删除
  deletable?: boolean
}
interface UserFactorRow {
  key: string; label: string; fields: { key: string; label: string; value: number; suffix?: string; max?: number; min?: number; step?: number }[]
}
interface PlatformFactorRow {
  key: string; label: string; fields: { key: string; label: string; value: number; suffix?: string; max?: number; min?: number }[]
}
interface BizConfig {
  storeFactors: StoreFactor[]
  userFactors: UserFactorRow[]
  platformFactors: PlatformFactorRow[]
  activities: ActivityRecord[]
  ads: AdRecord[]
}
type ChannelConfig = Record<Biz, BizConfig>

/* ============================ 常量 ============================ */

const bizOptions: { label: string; value: Biz }[] = [
  { label: '外賣', value: 'takeaway' }, { label: '團購', value: 'groupBuy' }, { label: '超市', value: 'supermarket' },
]
const bizMap: Record<Biz, string> = { takeaway: '外賣', supermarket: '超市', groupBuy: '團購' }
const appChannelMap: Record<AppChannelType, string> = { all: '全部', flashBee: '閃蜂', mFood: 'mFood' }
const appChannelColorMap: Record<AppChannelType, string> = { all: 'blue', flashBee: 'orange', mFood: 'green' }
const boostMethodMap: Record<BoostMethod, string> = { fixed: '固定加分', weight_multiply: '權重×倍數' }
const appChannelOptions = [{ label: '全部', value: 'all' }, { label: '閃蜂', value: 'flashBee' }, { label: 'mFood', value: 'mFood' }]

const activityTypeOptions = [
  { label: '滿額立減', value: 'full_reduce' }, { label: '減免運費', value: 'free_delivery' },
  { label: '進店領券', value: 'store_coupon' }, { label: '新客立減', value: 'new_user_reduce' },
  { label: '收藏送券', value: 'fav_coupon' }, { label: '官方勝券', value: 'official_coupon' },
  { label: '會員紅包', value: 'member_bonus' }, { label: '人氣搜索', value: 'popular_search' },
  { label: '限時折扣', value: 'flash_sale' }, { label: '買一送一', value: 'buy_one_get_one' },
]
const adTypeOptions = [
  { label: '關鍵詞廣告', value: 'keyword_ad' }, { label: '熱搜詞廣告', value: 'hotsearch_ad' },
  { label: '曝光廣告', value: 'exposure_ad' }, { label: '品牌廣告', value: 'brand_ad' },
]
const activityTypeMap: Record<string, string> = Object.fromEntries(activityTypeOptions.map(o => [o.value, o.label]))
const adTypeMap: Record<string, string> = Object.fromEntries(adTypeOptions.map(o => [o.value, o.label]))

/* ============================ 默認數據 ============================ */

function createDefaultBizConfig(): BizConfig {
  return {
    storeFactors: [
      { key: 'st1', factorName: '店鋪等級S', bonusValue: 100, description: 'S級店鋪加分', enabled: true },
      { key: 'st2', factorName: '店鋪等級A', bonusValue: 80, description: 'A級店鋪加分', enabled: true },
      { key: 'st3', factorName: '店鋪等級B', bonusValue: 60, description: 'B級店鋪加分', enabled: true },
      { key: 'st4', factorName: '店鋪等級C', bonusValue: 40, description: 'C級店鋪加分', enabled: true },
      { key: 'st5', factorName: '店鋪等級D', bonusValue: 20, description: 'D級店鋪加分', enabled: true },
      { key: 'st6', factorName: '店鋪口碑', bonusValue: 50, description: '口碑評分加分', enabled: true },
      { key: 'st7', factorName: '月銷量', bonusValue: 40, description: '月銷量排名加分', enabled: true },
      { key: 'st8', factorName: '日銷量', bonusValue: 30, description: '日銷量排名加分', enabled: true },
      { key: 'st9', factorName: '品牌連鎖', bonusValue: 35, description: '品牌連鎖店加分', enabled: true },
      { key: 'st10', factorName: '金牌店標', bonusValue: 50, description: '金牌店標加分', enabled: true },
      { key: 'st11', factorName: '獨家店標', bonusValue: 45, description: '獨家店標加分', enabled: true },
      { key: 'st12', factorName: '超時未接單', bonusValue: -20, description: '超時未接單扣分', enabled: true },
    ],
    userFactors: [
      { key: 'uf1', label: '瀏覽過的店鋪關鍵字', fields: [{ key: 'count', label: '取最新前N個', value: 10, max: 100 }, { key: 'weight', label: '權重分', value: 50, max: 9999 }] },
      { key: 'uf2', label: '最新購買過的店鋪', fields: [{ key: 'count', label: '前N個', value: 5, max: 100 }, { key: 'coeff', label: '係數', value: 1.5, max: 99, step: 0.1 }] },
      { key: 'uf3', label: '收藏過的店鋪', fields: [{ key: 'bonus', label: '固定加分', value: 30, max: 9999 }] },
      { key: 'uf4', label: '經常購買的店鋪', fields: [{ key: 'bonus', label: '固定加分', value: 40, max: 9999 }] },
      { key: 'uf5', label: '搜索過的關鍵字', fields: [{ key: 'timeWindow', label: '時間窗口(分鐘)', value: 30, max: 1440 }, { key: 'count', label: '取前N個', value: 8, max: 100 }] },
    ],
    platformFactors: [
      { key: 'pf1', label: '距離衰減', fields: [{ key: 'interval', label: '衰減間隔(米)', value: 500, max: 99999 }, { key: 'score', label: '每間隔扣分', value: 5, min: -9999, max: 0 }] },
      { key: 'pf2', label: '營業中加分', fields: [{ key: 'bonus', label: '加分值', value: 20 }] },
      { key: 'pf3', label: '打烊接單加分', fields: [{ key: 'bonus', label: '加分值', value: 0 }] },
      { key: 'pf4', label: '打烊不接單扣分', fields: [{ key: 'bonus', label: '加分值', value: -50 }] },
      { key: 'pf5', label: '主營時段匹配加分', fields: [{ key: 'bonus', label: '加分值', value: 15 }] },
      { key: 'pf6', label: '商品可售加分', fields: [{ key: 'bonus', label: '加分值', value: 10 }] },
      { key: 'pf7', label: '商品不可售扣分', fields: [{ key: 'bonus', label: '加分值', value: -30 }] },
    ],
    activities: [
      { key: '1', activityType: 'full_reduce', activityName: '滿額立減', appChannel: 'all', boostValue: 30, boostMethod: 'fixed', status: true, description: '訂單金額達到指定門檻即可享受減免優惠', updatedBy: '王美玲(E10089)', updatedAt: '2026-06-15 10:30' },
      { key: '2', activityType: 'free_delivery', activityName: '減免運費', appChannel: 'all', boostValue: 25, boostMethod: 'fixed', status: true, description: '用戶下單可享受免運費服務', updatedBy: '陳浩然(E10067)', updatedAt: '2026-06-14 14:20' },
      { key: '3', activityType: 'store_coupon', activityName: '進店領券', appChannel: 'all', boostValue: 20, boostMethod: 'fixed', status: true, description: '進入店鋪頁面即可領取優惠券', updatedBy: '林美心(E10034)', updatedAt: '2026-06-13 09:15' },
      { key: '4', activityType: 'new_user_reduce', activityName: '新客立減', appChannel: 'all', boostValue: 35, boostMethod: 'fixed', status: true, description: '首次下單的新用戶享受專屬減免', updatedBy: '張志明(E10023)', updatedAt: '2026-06-12 16:45' },
      { key: '5', activityType: 'fav_coupon', activityName: '收藏送券', appChannel: 'flashBee', boostValue: 15, boostMethod: 'fixed', status: true, description: '收藏店鋪即可獲得優惠券', updatedBy: '李婉婷(E10045)', updatedAt: '2026-06-11 11:30' },
      { key: '6', activityType: 'official_coupon', activityName: '官方勝券', appChannel: 'flashBee', boostValue: 40, boostMethod: 'fixed', status: true, description: '官方補貼的專屬優惠券', updatedBy: '王建華(E10067)', updatedAt: '2026-06-10 15:20' },
      { key: '7', activityType: 'member_bonus', activityName: '會員紅包', appChannel: 'all', boostValue: 25, boostMethod: 'fixed', status: true, description: '會員專屬紅包獎勵', updatedBy: '陳浩然(E10067)', updatedAt: '2026-06-10 16:30' },
      { key: '8', activityType: 'popular_search', activityName: '人氣搜索', appChannel: 'all', boostValue: 50, boostMethod: 'weight_multiply', status: true, weightValue: 15, multiplyValue: 3, description: '熱門搜索詞相關店鋪獲得額外曝光', updatedBy: '趙大偉(E10078)', updatedAt: '2026-06-09 10:00' },
      { key: '9', activityType: 'flash_sale', activityName: '限時折扣', appChannel: 'mFood', boostValue: 30, boostMethod: 'fixed', status: true, description: '限時特價活動', updatedBy: '周小蘭(E10056)', updatedAt: '2026-06-08 13:25' },
      { key: '10', activityType: 'buy_one_get_one', activityName: '買一送一', appChannel: 'mFood', boostValue: 45, boostMethod: 'fixed', status: true, description: '購買指定商品買一送一', updatedBy: '吳美玲(E10089)', updatedAt: '2026-06-07 17:40' },
    ],
    ads: [
      { 
        key: 'ad_consumption', 
        adType: 'ad_consumption', 
        adName: '廣告消費', 
        appChannel: 'all', 
        boostValue: 0, 
        status: true, 
        description: '商家x天不消費廣告，將會扣分，商家消費廣告則按消費金額得分', 
        updatedBy: '系統', 
        updatedAt: '2026-06-22 00:00',
        deletable: false, // 不可删除
        boostTiers: [
          { boostType: 'amount_match', boostValue: 1.5 },
        ],
        demoteTiers: [
          { days: 3, deductionType: 'percent_deduction', deductionValue: 10 },
          { days: 7, deductionType: 'percent_deduction', deductionValue: 20 },
          { days: 15, deductionType: 'percent_deduction', deductionValue: 50 },
        ],
      },
      { key: '1', adType: 'keyword_ad', adName: '關鍵詞競價', appChannel: 'all', boostValue: 50, status: true, description: '商家購買關鍵詞獲得搜索排名加分', updatedBy: '王美玲(E10089)', updatedAt: '2026-06-15 11:00', deletable: true },
    ],
  }
}

function createDefaultConfig(): ChannelConfig {
  return {
    takeaway: createDefaultBizConfig(),
    groupBuy: createDefaultBizConfig(),
    supermarket: createDefaultBizConfig(),
  }
}

/* ============================ 業務側邊欄組件 ============================ */

const bizIcons: Record<Biz, React.ReactNode> = {
  takeaway: <RocketOutlined />,
  groupBuy: <GiftOutlined />,
  supermarket: <ShoppingOutlined />,
}

const BizSidebar = ({ activeBiz, onChange }: { activeBiz: Biz; onChange: (v: Biz) => void }) => (
  <div style={{ width: 160, flexShrink: 0, marginRight: 16 }}>
    <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
      <div style={{
        padding: '0 0 12px',
        marginBottom: 8,
        borderBottom: '2px solid #1677ff',
        fontSize: 15,
        fontWeight: 700,
        color: '#1677ff',
        letterSpacing: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <AppstoreOutlined />
        <span>業務頻道</span>
      </div>
      {bizOptions.map(opt => (
        <div
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '14px 16px',
            marginBottom: 4,
            borderRadius: 6,
            cursor: 'pointer',
            background: activeBiz === opt.value ? '#e6f4ff' : 'transparent',
            borderLeft: activeBiz === opt.value ? '3px solid #1677ff' : '3px solid transparent',
            fontSize: 14,
            fontWeight: activeBiz === opt.value ? 600 : 400,
            color: activeBiz === opt.value ? '#1677ff' : '#595959',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onMouseEnter={e => {
            if (activeBiz !== opt.value) {
              e.currentTarget.style.background = '#f0f5ff'
              e.currentTarget.style.transform = 'translateX(4px)'
            }
          }}
          onMouseLeave={e => {
            if (activeBiz !== opt.value) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.transform = 'translateX(0)'
            }
          }}
        >
          <span style={{ fontSize: 16 }}>{bizIcons[opt.value]}</span>
          <span>{opt.label}業務</span>
        </div>
      ))}
    </div>
  </div>
)

/* ============================ 主組件 ============================ */

export default function DimensionStrategy() {
  const [activeDimension, setActiveDimension] = useState<string>('commercial')
  const [activeBiz, setActiveBiz] = useState<Biz>('takeaway')
  const [commercialSubTab, setCommercialSubTab] = useState<'activity' | 'ad'>('activity')
  const [commercialSearchText, setCommercialSearchText] = useState('')
  const [storeNameFilter, setStoreNameFilter] = useState('')
  const [storeEditModalOpen, setStoreEditModalOpen] = useState(false)
  const [editingStoreFactor, setEditingStoreFactor] = useState<StoreFactor | null>(null)
  const [storeEditForm] = Form.useForm()
  const [config, setConfig] = useState<ChannelConfig>(createDefaultConfig())

  const bizCfg = config[activeBiz]
  const updateBiz = (updater: (prev: BizConfig) => BizConfig) =>
    setConfig(prev => ({ ...prev, [activeBiz]: updater(prev[activeBiz]) }))

  /* ---- 活動 CRUD ---- */
  const [actModalOpen, setActModalOpen] = useState(false)
  const [editingAct, setEditingAct] = useState<ActivityRecord | null>(null)
  const [actBoostMethod, setActBoostMethod] = useState<BoostMethod>('fixed')
  const [actForm] = Form.useForm()

  const handleActAdd = () => {
    setEditingAct(null); setActBoostMethod('fixed'); actForm.resetFields()
    actForm.setFieldsValue({ appChannel: 'all', boostMethod: 'fixed', status: true })
    setActModalOpen(true)
  }
  const handleActEdit = (r: ActivityRecord) => {
    setEditingAct(r); setActBoostMethod(r.boostMethod); setActModalOpen(true)
    setTimeout(() => actForm.setFieldsValue({ ...r, appChannel: r.appChannel || 'all' }), 0)
  }
  const handleActDelete = (r: ActivityRecord) => {
    Modal.confirm({ title: '確認刪除', content: `確定刪除「${r.activityName}」？`, okText: '確定', cancelText: '取消',
      onOk: () => { updateBiz(p => ({ ...p, activities: p.activities.filter(a => a.key !== r.key) })); message.success('刪除成功') } })
  }
  const handleActSave = () => {
    actForm.validateFields().then(values => {
      const activityName = activityTypeMap[values.activityType] || values.activityName
      const now = new Date().toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')
      const base = { ...values, activityName, updatedBy: '當前用戶', updatedAt: now }
      if (editingAct) {
        updateBiz(p => ({ ...p, activities: p.activities.map(a => a.key === editingAct.key ? { ...a, ...base } : a) }))
        message.success('編輯成功')
      } else {
        updateBiz(p => ({ ...p, activities: [...p.activities, { key: String(Date.now()), ...base }] }))
        message.success('新增成功')
      }
      setActModalOpen(false)
    })
  }

  /* ---- 廣告 CRUD ---- */
  const [adModalOpen, setAdModalOpen] = useState(false)
  const [editingAd, setEditingAd] = useState<AdRecord | null>(null)
  const [adForm] = Form.useForm()
  const [adCategory, setAdCategory] = useState<'boost' | 'demote'>('boost') // 加分/减分类目
  const [adBoostTiers, setAdBoostTiers] = useState<BoostTier[]>([])
  const [adDemoteTiers, setAdDemoteTiers] = useState<DemoteTier[]>([])

  const handleAdAdd = () => {
    setEditingAd(null); adForm.resetFields()
    adForm.setFieldsValue({ status: true })
    setAdCategory('boost')
    setAdBoostTiers([{ boostType: 'amount_match', boostValue: 1 }])
    setAdDemoteTiers([])
    setAdModalOpen(true)
  }
  const handleAdEdit = (r: AdRecord) => {
    setEditingAd(r)
    // 根据编辑的记录判断当前是加分还是扣分
    const isBoost = r.boostTiers && r.boostTiers.length > 0
    setAdCategory(isBoost ? 'boost' : 'demote')
    // 编辑时保留原有梯队数据（如果有），否则使用默认值
    const defaultBoostTier: BoostTier = r.boostTiers && r.boostTiers.length > 0 
      ? r.boostTiers[0] // 取第一个梯队
      : { boostType: 'amount_match', boostValue: 1 }
    setAdBoostTiers([defaultBoostTier])
    // ad_consumption默认只展示一个扣分梯队，其他广告保留所有梯队
    const defaultDemoteTiers = r.key === 'ad_consumption'
      ? (r.demoteTiers && r.demoteTiers.length > 0 ? [r.demoteTiers[0]] : [{ days: 3, deductionType: 'percent_deduction', deductionValue: 10 }])
      : (r.demoteTiers && r.demoteTiers.length > 0 ? r.demoteTiers : [{ days: 3, deductionType: 'percent_deduction', deductionValue: 10 }])
    setAdDemoteTiers(defaultDemoteTiers)
    setAdModalOpen(true)
    setTimeout(() => adForm.setFieldsValue({ ...r, appChannel: r.appChannel || 'all' }), 0)
  }
  const handleAdDelete = (r: AdRecord) => {
    if (r.deletable === false) {
      message.warning('此數據不可删除')
      return
    }
    Modal.confirm({ title: '確認刪除', content: `確定刪除「${r.adName}」？`, okText: '確定', cancelText: '取消',
      onOk: () => { updateBiz(p => ({ ...p, ads: p.ads.filter(a => a.key !== r.key) })); message.success('刪除成功') } })
  }
  const handleAdSave = () => {
    adForm.validateFields().then(values => {
      const adName = adTypeMap[values.adType] || values.adName
      const now = new Date().toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')
      const base = { 
        ...values, 
        adName, 
        updatedBy: '當前用戶', 
        updatedAt: now,
        boostTiers: adCategory === 'boost' ? adBoostTiers : undefined,
        demoteTiers: adCategory === 'demote' ? adDemoteTiers : undefined,
      }
      if (editingAd) {
        updateBiz(p => ({ ...p, ads: p.ads.map(a => a.key === editingAd.key ? { ...a, ...base } : a) }))
        message.success('編輯成功')
      } else {
        updateBiz(p => ({ ...p, ads: [...p.ads, { key: String(Date.now()), ...base }] }))
        message.success('新增成功')
      }
      setAdModalOpen(false)
    })
  }

  /* ---- 廣告加分梯队操作 ---- */
  const handleAddAdBoostTier = () => {
    setAdBoostTiers([...adBoostTiers, { boostType: 'amount_match', boostValue: 1 }])
  }
  const handleRemoveAdBoostTier = (index: number) => {
    if (adBoostTiers.length <= 1) return
    const newTiers = [...adBoostTiers]
    newTiers.splice(index, 1)
    setAdBoostTiers(newTiers)
  }
  const handleUpdateAdBoostTier = (index: number, field: keyof BoostTier, value: unknown) => {
    const newTiers = [...adBoostTiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    setAdBoostTiers(newTiers)
  }

  /* ---- 廣告減分梯队操作 ---- */
  const handleAddAdDemoteTier = () => {
    setAdDemoteTiers([...adDemoteTiers, { days: 3, deductionType: 'percent_deduction', deductionValue: 10 }])
  }
  const handleRemoveAdDemoteTier = (index: number) => {
    if (adDemoteTiers.length <= 1) return
    const newTiers = [...adDemoteTiers]
    newTiers.splice(index, 1)
    setAdDemoteTiers(newTiers)
  }
  const handleUpdateAdDemoteTier = (index: number, field: keyof DemoteTier, value: unknown) => {
    const newTiers = [...adDemoteTiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    setAdDemoteTiers(newTiers)
  }

  /* ---- 店鋪 CRUD ---- */
  const handleStoreEdit = (r: StoreFactor) => {
    setEditingStoreFactor(r); setStoreEditModalOpen(true)
    setTimeout(() => storeEditForm.setFieldsValue({ ...r }), 0)
  }
  const handleStoreToggle = (r: StoreFactor) => {
    updateBiz(p => ({ ...p, storeFactors: p.storeFactors.map(f => f.key === r.key ? { ...f, enabled: !f.enabled } : f) }))
    message.success(r.enabled ? '已停用' : '已啟用')
  }
  const handleStoreSave = () => {
    storeEditForm.validateFields().then(values => {
      if (editingStoreFactor) {
        updateBiz(p => ({ ...p, storeFactors: p.storeFactors.map(f => f.key === editingStoreFactor.key ? { ...f, ...values } : f) }))
        message.success('編輯成功')
      }
      setStoreEditModalOpen(false)
    })
  }

  /* ---- 更新函數 ---- */
  const updateSF = (key: string, field: keyof StoreFactor, val: unknown) =>
    updateBiz(p => ({ ...p, storeFactors: p.storeFactors.map(r => r.key === key ? { ...r, [field]: val } : r) }))
  const updateUF = (key: string, fieldKey: string, val: number | null) =>
    updateBiz(p => ({ ...p, userFactors: p.userFactors.map(r => r.key === key ? { ...r, fields: r.fields.map(f => f.key === fieldKey ? { ...f, value: val ?? 0 } : f) } : r) }))
  const updatePF = (key: string, fieldKey: string, val: number | null) =>
    updateBiz(p => ({ ...p, platformFactors: p.platformFactors.map(r => r.key === key ? { ...r, fields: r.fields.map(f => f.key === fieldKey ? { ...f, value: val ?? 0 } : f) } : r) }))

  /* ============================ 商業維度 ============================ */

  const renderCommercial = () => {
    const isActivity = commercialSubTab === 'activity'
    const filteredActivities = bizCfg.activities.filter(r => {
      if (commercialSearchText && !r.activityName.includes(commercialSearchText) && !(activityTypeMap[r.activityType] || '').includes(commercialSearchText)) return false
      return true
    })
    const filteredAds = bizCfg.ads.filter(r => {
      if (commercialSearchText && !r.adName.includes(commercialSearchText) && !(adTypeMap[r.adType] || '').includes(commercialSearchText)) return false
      return true
    })

    // 活動類目列配置
    const actColumnMeta = useMemo(() => [
      { key: 'activityType', title: '活動類型' },
      { key: 'appChannel', title: '適用頻道' },
      { key: 'boostValue', title: '加分值' },
      { key: 'boostMethod', title: '加分方式' },
      { key: 'status', title: '狀態' },
      { key: 'description', title: '說明' },
      { key: 'updatedBy', title: '最後更新人' },
      { key: 'updatedAt', title: '最後更新時間' },
      { key: 'action', title: '操作' },
    ], [])

    const { configComponent: actConfigComponent, applyConfig: actApplyConfig } = useColumnConfig(
      'dimension-strategy-activity',
      actColumnMeta,
      [{ key: 'action', visible: true, locked: 'tail' as const }]
    )

    // 廣告類目列配置
    const adColumnMeta = useMemo(() => [
      { key: 'adType', title: '廣告類型' },
      { key: 'appChannel', title: '適用頻道' },
      { key: 'boostValue', title: '加分值' },
      { key: 'status', title: '狀態' },
      { key: 'description', title: '說明' },
      { key: 'updatedBy', title: '最後更新人' },
      { key: 'updatedAt', title: '最後更新時間' },
      { key: 'action', title: '操作' },
    ], [])

    const { configComponent: adConfigComponent, applyConfig: adApplyConfig } = useColumnConfig(
      'dimension-strategy-ad',
      adColumnMeta,
      [{ key: 'action', visible: true, locked: 'tail' as const }]
    )

    const actCols: TableColumnsType<ActivityRecord> = [
      { title: '活動類型', dataIndex: 'activityType', key: 'activityType', width: 120, render: (v: string) => <Tag color="blue">{activityTypeMap[v] || v}</Tag> },
      { title: '適用頻道', dataIndex: 'appChannel', key: 'appChannel', width: 100, render: (v: AppChannelType) => v === 'all' ? <Tag color={appChannelColorMap[v]}>{appChannelMap[v]}</Tag> : <BrandTag value={v} /> },
      { title: '加分值', dataIndex: 'boostValue', key: 'boostValue', width: 80, render: (v: number, r: ActivityRecord) => r.boostMethod === 'weight_multiply' ? `${r.weightValue}×${r.multiplyValue}` : v },
      { title: '加分方式', dataIndex: 'boostMethod', key: 'boostMethod', width: 100, render: (v: BoostMethod) => <Tag color={v === 'fixed' ? 'blue' : 'purple'}>{boostMethodMap[v]}</Tag> },
      { title: '狀態', dataIndex: 'status', key: 'status', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '啟用' : '停用'}</Tag> },
      { title: '說明', dataIndex: 'description', key: 'description', width: 200, ellipsis: { showTitle: false }, render: (v: string) => <Tooltip placement="topLeft" title={v}>{v || '-'}</Tooltip> },
      { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 140, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
      { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 150, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
      { title: '操作', key: 'action', width: 160, fixed: 'right', render: (_: unknown, r: ActivityRecord) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={e => { e.preventDefault(); handleActEdit(r) }}>編輯</Button>
          <Button type="link" size="small" danger={r.status} onClick={e => { e.preventDefault(); updateBiz(p => ({ ...p, activities: p.activities.map(a => a.key === r.key ? { ...a, status: !a.status } : a) })) }}>
            {r.status ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={e => { e.preventDefault(); handleActDelete(r) }}>刪除</Button>
        </Space>
      )},
    ]

    const adCols: TableColumnsType<AdRecord> = [
      { title: '廣告類型', dataIndex: 'adType', key: 'adType', width: 120, render: (v: string) => <Tag color="orange">{adTypeMap[v] || v}</Tag> },
      { title: '適用頻道', dataIndex: 'appChannel', key: 'appChannel', width: 100, render: (v: AppChannelType) => v === 'all' ? <Tag color={appChannelColorMap[v]}>{appChannelMap[v]}</Tag> : <BrandTag value={v} /> },
      { title: '狀態', dataIndex: 'status', key: 'status', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '啟用' : '停用'}</Tag> },
      { title: '說明', dataIndex: 'description', key: 'description', width: 200, ellipsis: { showTitle: false }, render: (v: string) => <Tooltip placement="topLeft" title={v}>{v || '-'}</Tooltip> },
      { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 140, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
      { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 150, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
      { title: '操作', key: 'action', width: 160, fixed: 'right', render: (_: unknown, r: AdRecord) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={e => { e.preventDefault(); handleAdEdit(r) }}>編輯</Button>
          <Button type="link" size="small" danger={r.status} onClick={e => { e.preventDefault(); updateBiz(p => ({ ...p, ads: p.ads.map(a => a.key === r.key ? { ...a, status: !a.status } : a) })) }}>
            {r.status ? '停用' : '啟用'}
          </Button>
          {r.deletable !== false && (
            <Button type="link" size="small" danger onClick={e => { e.preventDefault(); handleAdDelete(r) }}>刪除</Button>
          )}
        </Space>
      )},
    ]

    return (
      <div style={{ display: 'flex' }}>
        <BizSidebar activeBiz={activeBiz} onChange={setActiveBiz} />
        <div style={{ flex: 1 }}>
          <Tabs activeKey={commercialSubTab} onChange={val => setCommercialSubTab(val as 'activity' | 'ad')}
            items={[{ key: 'activity', label: '📋 活動類目' }, { key: 'ad', label: '📢 廣告類目' }]}
            style={{ marginBottom: 16 }}
          />
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Input prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜索名稱" allowClear
                value={commercialSearchText} onChange={e => setCommercialSearchText(e.target.value)} style={{ width: 200 }} />
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => setCommercialSearchText('')}>重置</Button>
              <Button type="primary" icon={<PlusOutlined />}
                onClick={isActivity ? handleActAdd : handleAdAdd}>
                {isActivity ? '新增活動' : '新增廣告'}
              </Button>
            </Space>
            <div style={{ float: 'right' }}>
              {isActivity ? actConfigComponent : adConfigComponent}
            </div>
          </div>
          {isActivity ? (
            <Table<ActivityRecord> columns={actApplyConfig(actCols)} dataSource={filteredActivities} rowKey="key"
              pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條`, size: 'small', showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showQuickJumper: true }} size="small" scroll={{ x: 1100 }} />
          ) : (
            <Table<AdRecord> columns={adApplyConfig(adCols)} dataSource={filteredAds} rowKey="key"
              pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條`, size: 'small', showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showQuickJumper: true }} size="small" scroll={{ x: 950 }} />
          )}
        </div>
      </div>
    )
  }

  /* ============================ 店鋪維度 ============================ */

  const renderStore = () => {
    const filtered = bizCfg.storeFactors.filter(r => {
      if (storeNameFilter && !r.factorName.includes(storeNameFilter)) return false
      return true
    })
    const cols: TableColumnsType<StoreFactor> = [
      { title: '因子名稱', dataIndex: 'factorName', width: 140 },
      { title: '加分值', dataIndex: 'bonusValue', width: 100, render: (v: number) => v },
      { title: '說明', dataIndex: 'description', render: (v: string) => <Text type="secondary">{v}</Text> },
      { title: '狀態', dataIndex: 'enabled', width: 80, render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '啟用' : '停用'}</Tag> },
      { title: '操作', key: 'action', width: 140, fixed: 'right', render: (_: unknown, r: StoreFactor) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={e => { e.preventDefault(); handleStoreEdit(r) }}>編輯</Button>
          <Button type="link" size="small" danger={r.enabled} onClick={e => { e.preventDefault(); handleStoreToggle(r) }}>
            {r.enabled ? '停用' : '啟用'}
          </Button>
        </Space>
      )},
    ]
    return (
      <div style={{ display: 'flex' }}>
        <BizSidebar activeBiz={activeBiz} onChange={setActiveBiz} />
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Input prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} placeholder="搜索因子名稱" allowClear
                value={storeNameFilter} onChange={e => setStoreNameFilter(e.target.value)} style={{ width: 180 }} />
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => setStoreNameFilter('')}>重置</Button>
            </Space>
          </div>
          <Table<StoreFactor> columns={cols} dataSource={filtered} rowKey="key"
            pagination={{ pageSize: 10, showTotal: t => `共 ${t} 條`, size: 'small' }} size="small" bordered />
        </div>
      </div>
    )
  }

  /* ============================ 用戶維度 ============================ */

  const renderUser = () => (
    <div style={{ display: 'flex' }}>
      <BizSidebar activeBiz={activeBiz} onChange={setActiveBiz} />
      <div style={{ flex: 1 }}>
        <Card size="small" styles={{ body: { padding: 0 } }}>
          {bizCfg.userFactors.map((row, idx) => (
            <div key={row.key} style={{ padding: '12px 20px', borderBottom: idx < bizCfg.userFactors.length - 1 ? '1px solid #f0f0f0' : undefined }}>
              <Row align="middle" gutter={16}>
                <Col span={6}>
                  <Text strong style={{ fontSize: 13 }}>{row.label}</Text>
                </Col>
                <Col span={18}>
                  <Space wrap size={16}>
                    {row.fields.map(f => (
                      <Space key={f.key} size={4}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{f.label}</Text>
                        <InputNumber min={f.min ?? 0} max={f.max ?? 9999} step={f.step ?? 1} value={f.value} size="small"
                          style={{ width: 80 }} onChange={val => updateUF(row.key, f.key, val)} />
                        {f.suffix && <Text type="secondary" style={{ fontSize: 12 }}>{f.suffix}</Text>}
                      </Space>
                    ))}
                  </Space>
                </Col>
              </Row>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )

  /* ============================ 平台維度 ============================ */

  const renderPlatform = () => (
    <div style={{ display: 'flex' }}>
      <BizSidebar activeBiz={activeBiz} onChange={setActiveBiz} />
      <div style={{ flex: 1 }}>
        <Card size="small" styles={{ body: { padding: 0 } }}>
          {bizCfg.platformFactors.map((row, idx) => (
            <div key={row.key} style={{ padding: '12px 20px', borderBottom: idx < bizCfg.platformFactors.length - 1 ? '1px solid #f0f0f0' : undefined }}>
              <Row align="middle" gutter={16}>
                <Col span={6}>
                  <Text strong style={{ fontSize: 13 }}>{row.label}</Text>
                </Col>
                <Col span={18}>
                  <Space wrap size={16}>
                    {row.fields.map(f => (
                      <Space key={f.key} size={4}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{f.label}</Text>
                        <InputNumber min={f.min ?? 0} max={f.max ?? 9999} value={f.value} size="small"
                          style={{ width: 80 }} onChange={val => updatePF(row.key, f.key, val)} />
                        {f.suffix && <Text type="secondary" style={{ fontSize: 12 }}>{f.suffix}</Text>}
                      </Space>
                    ))}
                  </Space>
                </Col>
              </Row>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )

  /* ============================ 頁面渲染 ============================ */

  const dimensionPanels: Record<string, { icon: React.ReactNode; label: string; render: () => JSX.Element }> = {
    commercial: { icon: <DollarOutlined />, label: '商業維度', render: renderCommercial },
    store: { icon: <ShopOutlined />, label: '店鋪維度', render: renderStore },
    user: { icon: <UserOutlined />, label: '用戶維度', render: renderUser },
    platform: { icon: <GlobalOutlined />, label: '平台維度', render: renderPlatform },
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ background: '#fff', padding: '16px', borderRadius: 8 }}>
        {/* 頁面描述 */}
        <Card
          size="small"
          style={{ marginBottom: 16, background: '#f6f8fa', border: '1px solid #e8e8e8' }}
        >
          <span style={{ color: '#595959', fontSize: 13 }}>
            維度策略配置對閃蜂和mFood兩個APP共同生效，每個業務頻道的配置參數獨立維護
          </span>
        </Card>
        <Tabs
          activeKey={activeDimension}
          onChange={val => setActiveDimension(val)}
          items={Object.entries(dimensionPanels).map(([key, { icon, label }]) => ({
            key,
            label: <Space>{icon}<span>{label}</span></Space>,
            children: (
              <Card size="small" styles={{ body: { padding: 16 } }}>
                {dimensionPanels[key]?.render()}
              </Card>
            ),
          }))}
        />
      </div>

      {/* ---- 活動 Modal ---- */}
      <Modal title={editingAct ? '編輯活動' : '新增活動'} open={actModalOpen} onOk={handleActSave}
        onCancel={() => setActModalOpen(false)} width={600} destroyOnClose>
        <Form form={actForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="活動類型" name="activityType" rules={[{ required: true, message: '請選擇活動類型' }]}>
              <Select options={activityTypeOptions} placeholder="選擇活動類型" />
            </Form.Item>
            <Form.Item label="適用頻道" name="appChannel" rules={[{ required: true }]}>
              <Select options={appChannelOptions} />
            </Form.Item>
          </div>
          <Form.Item label="加分方式" name="boostMethod" rules={[{ required: true }]}>
            <Radio.Group onChange={e => setActBoostMethod(e.target.value)}>
              <Radio value="fixed">固定加分</Radio><Radio value="weight_multiply">權重×倍數</Radio>
            </Radio.Group>
          </Form.Item>
          {actBoostMethod === 'fixed'
            ? <Form.Item label="加分值" name="boostValue" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={9999} /></Form.Item>
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item label="權重值" name="weightValue" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={9999} /></Form.Item>
                <Form.Item label="倍數" name="multiplyValue" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={99} /></Form.Item>
              </div>
          } 
          <Form.Item label="狀態" name="status" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item label="說明" name="description">
            <Input.TextArea rows={2} placeholder="請輸入活動說明（選填）" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---- 廣告 Modal ---- */}
      <Modal 
        title={editingAd ? '編輯廣告' : '新增廣告'} 
        open={adModalOpen} 
        onOk={handleAdSave}
        onCancel={() => setAdModalOpen(false)} 
        width={800} 
        destroyOnClose
      >
        <Form form={adForm} layout="vertical" style={{ marginTop: 16 }}>
          {/* 新增模式下显示广告类型选择 */}
          {!editingAd && (
            <Form.Item label="廣告類型" name="adType" rules={[{ required: true, message: '請選擇廣告類型' }]}>
              <Select options={adTypeOptions} placeholder="選擇廣告類型" />
            </Form.Item>
          )}

          {/* 所有广告都显示加分/扣分Tab切换 */}
          {editingAd && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 500 }}>配置類型</div>
              <Tabs
                activeKey={adCategory}
                onChange={(key) => setAdCategory(key as 'boost' | 'demote')}
                items={[
                  { key: 'boost', label: '➕ 加分' },
                  { key: 'demote', label: '➖ 扣分' },
                ]}
                size="small"
              />
            </div>
          )}

          {/* 加分规则配置 - 根据Tab显示 */}
          {adCategory === 'boost' && (
            <Form.Item label="加分規則配置">
              <div style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
                配置廣告加分規則
              </div>
              {adBoostTiers.map((tier, index) => (
                <div key={index} style={{ 
                  border: '1px solid #d9d9d9', 
                  borderRadius: 4, 
                  padding: 16, 
                  background: '#fafafa'
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 8, fontSize: 13, color: '#333', fontWeight: 500 }}>加分方式</div>
                    <Radio.Group 
                      value={tier.boostType}
                      onChange={(e) => handleUpdateAdBoostTier(index, 'boostType', e.target.value)}
                    >
                      <Radio value="amount_match">按消費金額×倍數加分</Radio>
                      <Radio value="fixed_boost">固定加分</Radio>
                    </Radio.Group>
                  </div>
                  <div>
                    <div style={{ marginBottom: 8, fontSize: 13, color: '#333', fontWeight: 500 }}>
                      {tier.boostType === 'amount_match' ? '消費金額倍數' : '固定加分值'}
                    </div>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={tier.boostValue}
                      onChange={(val) => handleUpdateAdBoostTier(index, 'boostValue', val || 0)}
                      min={0}
                      max={9999}
                      step={tier.boostType === 'amount_match' ? 0.1 : 1}
                      addonAfter={tier.boostType === 'amount_match' ? '倍' : '分'}
                      placeholder={tier.boostType === 'amount_match' ? '請輸入倍數，如1.5' : '請輸入固定加分值'}
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                      {tier.boostType === 'amount_match' 
                        ? '說明：按廣告消費金額 × 倍數計算加分，如消費100元×1.5倍=150分' 
                        : '說明：無論消費多少，固定增加指定分數'}
                    </div>
                  </div>
                </div>
              ))}
            </Form.Item>
          )}

          {/* 减分规则配置 - 根据Tab显示 */}
          {adCategory === 'demote' && (
            <Form.Item label="減分規則配置">
              <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                配置階梯式減分規則，支持多個梯队
              </div>
              {adDemoteTiers.map((tier, index) => (
                <div key={index} style={{ 
                  border: '1px solid #d9d9d9', 
                  borderRadius: 4, 
                  padding: 12, 
                  marginBottom: 8,
                  background: '#fff2f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 'bold' }}>梯队 {index + 1}</span>
                    <Button 
                      type="link" 
                      danger 
                      size="small"
                      onClick={() => handleRemoveAdDemoteTier(index)}
                      disabled={adDemoteTiers.length <= 1}
                    >
                      删除
                    </Button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>x天未消費</div>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={tier.days}
                      onChange={(val) => handleUpdateAdDemoteTier(index, 'days', val || 0)}
                      min={0}
                      max={365}
                      addonAfter="天"
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>扣分方式</div>
                    <Radio.Group 
                      value={tier.deductionType}
                      onChange={(e) => handleUpdateAdDemoteTier(index, 'deductionType', e.target.value)}
                    >
                      <Radio value="fixed_deduction">固定扣分</Radio>
                      <Radio value="percent_deduction">按商戶總得分折扣</Radio>
                    </Radio.Group>
                  </div>
                  <div>
                    <div style={{ marginBottom: 4, fontSize: 12, color: '#666' }}>
                      {tier.deductionType === 'fixed_deduction' ? '扣分值' : '折扣比例'}
                    </div>
                    <InputNumber
                      style={{ width: '100%' }}
                      value={tier.deductionValue}
                      onChange={(val) => handleUpdateAdDemoteTier(index, 'deductionValue', val || 0)}
                      min={0}
                      max={tier.deductionType === 'percent_deduction' ? 100 : 9999}
                      addonAfter={tier.deductionType === 'percent_deduction' ? '%' : '分'}
                      placeholder={tier.deductionType === 'percent_deduction' ? '請輸入折扣比例，如20' : '請輸入扣分值'}
                    />
                    {tier.deductionType === 'percent_deduction' && (
                      <div style={{ 
                        marginTop: 8, 
                        padding: 8, 
                        background: '#e6f7ff', 
                        borderRadius: 4,
                        fontSize: 12,
                        color: '#0050b3',
                        lineHeight: 1.6
                      }}>
                        <strong>按商戶總得分折扣說明：</strong>按商戶總得分折扣是根據商戶當前總分進行比例扣減。用戶搜索時，系統會執行：<code style={{ margin: '0 4px', padding: '2px 6px', background: '#f5f5f5', borderRadius: 3 }}>最終得分 = 商戶總分 × (1 - 折扣比例)</code>。例如：商戶總分100分，輸入20%則最終得分80分；輸入100%則全部扣除，最終得分0分。
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <Button 
                type="dashed" 
                icon={<PlusOutlined />} 
                onClick={handleAddAdDemoteTier}
                style={{ width: '100%' }}
              >
                新增梯队
              </Button>
            </Form.Item>
          )}

          <Form.Item label="狀態" name="status" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item label="說明" name="description">
            <Input.TextArea rows={2} placeholder="請輸入廣告說明（選填）" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---- 店鋪因子編輯 Modal ---- */}
      <Modal title="編輯店鋪因子" open={storeEditModalOpen} onOk={handleStoreSave}
        onCancel={() => setStoreEditModalOpen(false)} width={500} destroyOnClose>
        <Form form={storeEditForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="因子名稱" name="factorName">
            <Input disabled />
          </Form.Item>
          <Form.Item label="加分值" name="bonusValue" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={-9999} max={9999} />
          </Form.Item>
          <Form.Item label="說明" name="description">
            <Input />
          </Form.Item>
          <Form.Item label="狀態" name="enabled" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
