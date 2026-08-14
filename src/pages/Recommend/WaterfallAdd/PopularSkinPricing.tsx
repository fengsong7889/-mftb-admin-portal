/**
 * 人氣商家 - 皮膚定價（新增/編輯/詳情）
 *
 * 業務背景：人氣商家主要靠售賣「皮膚」盈利。業務人員配置皮膚組成元素並按天定價，
 * 商家購買後皮膚將應用在 APP 瀑布流列表的商家卡片上。
 *
 * 皮膚組成元素（參考 APP 實際展示樣式）：
 *  - 卡片邊框：支持 無邊框 / 選擇配色 / 上傳邊框圖 三種方式，小圖/大圖模式通用
 *  - 大圖模式左側豎版主圖：必須上傳（小圖模式無需上傳圖片）
 *  - 菜品展示佈局：大圖拼列（1大2小）/ 階梯輪播，單選；
 *    商家自己選擇一種菜品佈局風格購買
 *  - 售價按天計算（MOP/天）
 *  - 內置預覽：運營人員可查看所配置皮膚在小圖/大圖模式下的展示效果
 */
import { useMemo, useState, useEffect } from 'react'
import { Button, Radio, ColorPicker, Form, Input, InputNumber, Select, Space, Switch, Table, Upload, message, Modal } from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  SkinOutlined,
  ShopOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  PercentageOutlined,
  SettingOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlgorithmType,
  RecommendChannel,
  ServiceStatus,
  APP_OPTIONS,
  AppType,
} from '../constants'
import {
  fetchAdHotPricingDetail,
  createAdHotPricing,
  updateAdHotPricing,
  appTypeToBrand,
  brandToAppType,
  type AdHotSkinPrice,
} from '../../../api/adPromotion'

// 人氣商家可選算法列表（從後端算法庫動態加載，不再使用本地 Mock）

/** 邊框方式 */
const BORDER_TYPE_OPTIONS = [
  { value: 'none', labelKey: 'recommend:popularSkin.borderNoneLabel' },
  { value: 'color', labelKey: 'recommend:popularSkin.borderColorLabel' },
  { value: 'image', labelKey: 'recommend:popularSkin.borderImageLabel' },
]

/** 邊框配色預設色板 */
const COLOR_PRESETS = [
  { labelKey: 'recommend:popularSkin.recommendedColors', colors: ['#FF4D4F', '#E8720C', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#EB2F96', '#13C2C2'] },
]

/** 可上傳圖片的字段 */
type SkinImageField = 'borderImage' | 'bigImage'

/** 菜品展示佈局：大圖拼列（1大2小）/ 階梯輪播 */
type DishLayout = 'grid' | 'carousel'
const DISH_LAYOUT_OPTIONS = [
  { value: 'grid', labelKey: 'recommend:popularSkin.dishLayoutGridLabel' },
  { value: 'carousel', labelKey: 'recommend:popularSkin.dishLayoutCarouselLabel' },
]

/** 預覽用 Mock 餐品（麥當勞示意，bg 為餐品底圖漸變，铺滿整張卡片） */
const PREVIEW_DISHES = [
  { emoji: '🍔', name: '招牌雙層牛堡·特惠一人餐', price: '$43.3', original: '$65', discount: '6.6折', bg: 'linear-gradient(135deg, #FFE2B8, #FFAE5E)' },
  { emoji: '🍟', name: '黃金薯條（大）', price: '$12.9', original: '$19', discount: '6.8折', bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
  { emoji: '🥤', name: '冰爽可樂（中）', price: '$5.9', original: '$9', discount: '6.5折', bg: 'linear-gradient(135deg, #C9E7FF, #7FB8F0)' },
  { emoji: '🍦', name: '新地雪糕', price: '$8.9', original: '$12', discount: '7.4折', bg: 'linear-gradient(135deg, #FFE9F0, #FFC1D4)' },
]

/** 按天梯度折扣配置（購買天數≥ days 時享 discount 折，參考盤活復蘇梯度配置） */
interface DayDiscountGradient {
  days: number | undefined
  discount: number | undefined
}

/** 退費比例規則（剩餘天數 ≤ maxDays 時，退款按 feePercent% 扣費） */
interface CancelFeeRule {
  id: number
  maxDays: number
  feePercent: number
}

/** 單款皮膚配置 */
interface SkinItem {
  id: number
  /** 皮膚名稱 */
  name: string
  /** 售價 MOP/天 */
  price?: number
  /** 菜品展示佈局（單選）：大圖拼列 / 階梯輪播，商家自選一種 */
  dishLayout: DishLayout
  /** 邊框方式：無 / 配色 / 上傳邊框圖 */
  borderType: 'none' | 'color' | 'image'
  /** 邊框顏色（borderType=color 時生效） */
  borderColor: string
  /** 邊框圖（dataURL，borderType=image 時生效） */
  borderImage: string | null
  /** 大圖模式左側豎版主圖（dataURL） */
  bigImage: string | null
}

// 以時間戳為起點的自增 id，避免模塊重載（HMR）後種子重置導致 id 重複、多套皮膚聯動
let skinIdSeed = Date.now()

const createSkin = (partial?: Partial<SkinItem>): SkinItem => ({
  id: skinIdSeed++,
  name: '',
  price: undefined,
  dishLayout: 'grid',
  borderType: 'image',
  borderColor: '#FF4D4F',
  borderImage: null,
  bigImage: null,
  ...partial,
})

/** 生成 SVG dataURL，用於編輯/詳情模式回顯已上傳的 Mock 圖片 */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Mock 大圖模式主圖：3:4 豎版漸變主圖 */
const buildMockBigImage = (from: string, to: string, label: string) => svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="360" viewBox="0 0 270 360">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`
  + `<rect width="270" height="360" fill="url(#g)"/>`
  + `<text x="135" y="175" font-size="56" text-anchor="middle" font-family="PingFang SC, sans-serif">\u{1F3EA}</text>`
  + `<text x="135" y="235" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">${label}</text>`
  + `</svg>`,
)

/** Mock 詳情圖：4:3 橫版漸變圖（編輯/詳情模式回顯） */
const MOCK_DETAIL_IMAGE = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8720C"/><stop offset="1" stop-color="#FFB347"/></linearGradient></defs>`
  + `<rect width="400" height="300" fill="url(#g)"/>`
  + `<text x="200" y="145" font-size="52" text-anchor="middle" font-family="PingFang SC, sans-serif">\u{1F3C6}</text>`
  + `<text x="200" y="200" font-size="24" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">人氣商家詳情圖</text>`
  + `</svg>`,
)

/** 編輯/詳情模式的 Mock 皮膚數據 */
const buildMockSkins = (): SkinItem[] => [
  createSkin({
    name: '紅運當頭', price: 28, borderType: 'color', borderColor: '#FF4D4F',
    dishLayout: 'grid',
    bigImage: buildMockBigImage('#FF4D4F', '#FFA39E', '紅運當頭'),
  }),
  createSkin({
    name: '橙意滿滿', price: 18, borderType: 'color', borderColor: '#E8720C',
    dishLayout: 'carousel',
    bigImage: buildMockBigImage('#E8720C', '#FFB347', '橙意滿滿'),
  }),
  createSkin({
    name: '簡約無框', price: 8, borderType: 'none',
    dishLayout: 'carousel',
    bigImage: buildMockBigImage('#595959', '#8C8C8C', '簡約無框'),
  }),
]

export default function PopularSkinPricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 皮膚列表（新增模式從空白開始，編輯/詳情模式從後端加載）
  const [skins, setSkins] = useState<SkinItem[]>([createSkin()])
  // 預覽中的皮膚
  const [previewSkin, setPreviewSkin] = useState<SkinItem | null>(null)
  // 階梯輪播餐品指針：current 為當前張，prev 為正在向左滑出的上一張
  const [dishState, setDishState] = useState<{ current: number; prev: number | null }>({ current: 0, prev: null })
  // 狀態（底部 Switch：啟用/停用）
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  // 購買多天折扣配置（梯度）
  const [gradientEnabled, setGradientEnabled] = useState(false)
  const [gradients, setGradients] = useState<DayDiscountGradient[]>([])
  // 上線天數（銷售策略，與無敵星星/盤活復蘇保持一致）：限制商家最多可購買未來幾天內的皮膚推廣
  const [presaleDays, setPresaleDays] = useState<number>(7)
  // 退費比例配置：人氣商家默認不允許退款（與訂單側業務規則一致），開啟後可配置退費比例梯度
  const [refundEnabled, setRefundEnabled] = useState(false)
  const [cancelFeeRules, setCancelFeeRules] = useState<CancelFeeRule[]>([{ id: 1, maxDays: 3, feePercent: 50 }])
  // 詳情圖（基礎信息卡片，與無敵星星/盤活復蘇保持一致）
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])
  // 人氣名稱（用戶自定義命名，不再關聯算法庫）

  // APP/頻道/邊框/菜品佈局選項（多語言，使用 labelKey 統一管理）
  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tBorderTypeOptions = useMemo(
    () => BORDER_TYPE_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })),
    [t],
  )
  const tDishLayoutOptions = useMemo(
    () => DISH_LAYOUT_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })),
    [t],
  )
  const tColorPresets = useMemo(
    () => COLOR_PRESETS.map(p => ({ label: t(p.labelKey), colors: p.colors })),
    [t],
  )

  // 業務頻道選項（按模塊過濾，與銷售定價通用表單保持一致）
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: t('recommend:channelGroupBuyName'), value: RecommendChannel.GROUP_BUY }]
    : [
        { label: t('recommend:channelDeliveryName'), value: RecommendChannel.DELIVERY },
        { label: t('recommend:channelSupermarketName'), value: RecommendChannel.SUPERMARKET },
      ]

  // 編輯/詳情模式：從後端加載計價配置並回填
  useEffect(() => {
    if (!urlId) return
    setLoading(true)
    fetchAdHotPricingDetail(Number(urlId))
      .then(data => {
        // 回填基礎信息
        const appValue = brandToAppType(data.brand)
        form.setFieldsValue({
          popularName: data.algoName || '',
          app: appValue ?? APP_OPTIONS[0]?.value,
          channel: data.channel ?? channelOptions[0]?.value,
        })
        // 回填上線天數
        if (data.presaleDays) setPresaleDays(data.presaleDays)
        // 回填退款開關
        setRefundEnabled(data.refundEnabled === 1)
        // 回填狀態
        if (data.status) setStatus(data.status as ServiceStatus)
        // 回填梯度折扣
        if (data.discountTiers) {
          try {
            const tiers = JSON.parse(data.discountTiers)
            if (Array.isArray(tiers) && tiers.length) {
              setGradientEnabled(true)
              setGradients(tiers.map((t: { minDays?: number; days?: number; discount: number }) => ({
                days: (t.minDays ?? t.days) || undefined,
                discount: t.discount || undefined,
              })))
            }
          } catch { /* ignore */ }
        }
        // 回填取消扣費梯度
        if (data.cancelFeeTiers) {
          try {
            const tiers = JSON.parse(data.cancelFeeTiers)
            if (Array.isArray(tiers) && tiers.length) {
              setCancelFeeRules(tiers.map((t: { remainDays?: number; ratio?: number }, i: number) => ({
                id: i + 1,
                maxDays: t.remainDays ?? 0,
                feePercent: t.ratio ?? 0,
              })))
            }
          } catch { /* ignore */ }
        }
        // 回填皮膚列表（含邊框方式與顏色）
        if (data.skins?.length) {
          setSkins(data.skins.map((s: AdHotSkinPrice) => createSkin({
            name: s.skinName,
            price: s.price,
            dishLayout: (s as any).dishLayout || 'grid',
            borderType: (s.borderType === 'none' || s.borderType === 'color' || s.borderType === 'image') ? s.borderType : 'color',
            borderColor: s.borderColor || '#FF4D4F',
          })))
        }
      })
      .catch(() => {
        // 後端不可用，表單留空不降級 Mock
        setGradientEnabled(true)
        setGradients([
          { days: 7, discount: 95 },
          { days: 15, discount: 90 },
          { days: 30, discount: 85 },
        ])
        setDetailFileList([{ uid: '-1', name: 'detail.svg', status: 'done', url: MOCK_DETAIL_IMAGE }])
        setPresaleDays(30)
        setCancelFeeRules([
          { id: 1, maxDays: 1, feePercent: 80 },
          { id: 2, maxDays: 3, feePercent: 50 },
          { id: 3, maxDays: 7, feePercent: 20 },
        ])
        setSkins(buildMockSkins())
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, form])

  // 階梯輪播：當前張向左滑出、下一張從後方呈現上來，關閉彈窗/所選佈局不含輪播時自動停止
  useEffect(() => {
    if (!previewSkin || previewSkin.dishLayout !== 'carousel') return
    setDishState({ current: 0, prev: null })
    const timer = setInterval(() => {
      setDishState(s => ({ current: (s.current + 1) % PREVIEW_DISHES.length, prev: s.current }))
    }, 5000)
    return () => clearInterval(timer)
  }, [previewSkin])

  // 更新指定皮膚的字段
  const updateSkin = (id: number, patch: Partial<SkinItem>) => {
    setSkins(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }

  // 上傳皮膚圖片（本地預覽，不真正上傳）
  const handleUploadImage = (file: File, targetId: number, field: SkinImageField) => {
    if (!file.type.startsWith('image/')) {
      message.error(t('recommend:popularSkin.uploadImageOnly'))
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error(t('recommend:popularSkin.imageTooLarge'))
      return false
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateSkin(targetId, { [field]: reader.result as string })
      message.success(t('recommend:popularSkin.uploadSuccess'))
    }
    reader.readAsDataURL(file)
    return false
  }

  // 新增一款皮膚
  const handleAddSkin = () => {
    setSkins(prev => [...prev, createSkin()])
  }

  // 添加折扣梯度
  const handleAddGradient = () => {
    setGradients(prev => [...prev, { days: undefined, discount: undefined }])
  }

  // 刪除折扣梯度
  const handleRemoveGradient = (index: number) => {
    setGradients(prev => prev.filter((_, i) => i !== index))
  }

  // 更新折扣梯度
  const handleUpdateGradient = (index: number, field: keyof DayDiscountGradient, value: number | null) => {
    setGradients(prev => prev.map((g, i) => (i === index ? { ...g, [field]: value ?? 0 } : g)))
  }

  // 刪除皮膚
  const handleRemoveSkin = (id: number) => {
    if (skins.length <= 1) {
      message.warning(t('recommend:popularSkin.keepOneSkin'))
      return
    }
    Modal.confirm({
      title: t('recommend:popularSkin.confirmDeleteSkinTitle'),
      content: t('recommend:popularSkin.confirmDeleteSkinContent'),
      okText: t('common:delete'),
      okButtonProps: { danger: true },
      cancelText: t('common:cancel'),
      onOk: () => {
        setSkins(prev => prev.filter(s => s.id !== id))
      },
    })
  }

  const handleBack = () => {
    navigate(`/promotion-waterfall?type=${AlgorithmType.POPULAR_MERCHANT_KA}`)
  }

  // 保存：校驗基礎信息 + 每款皮膚的完整性
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      for (let i = 0; i < skins.length; i++) {
        const skin = skins[i]
        const label = skin.name.trim() || t('recommend:popularSkin.skinNameFallback', { index: i + 1 })
        if (!skin.name.trim()) {
          message.error(t('recommend:popularSkin.enterSkinName'))
          return
        }
        if (!skin.dishLayout) {
          message.error(t('recommend:popularSkin.selectOneDishLayout'))
          return
        }
        if (skin.borderType === 'image' && !skin.borderImage) {
          message.error(t('recommend:popularSkin.uploadBorderImage'))
          return
        }
        if (!skin.bigImage) {
          message.error(t('recommend:popularSkin.uploadBigImage'))
          return
        }
        if (skin.price === undefined || skin.price <= 0) {
          message.error(t('recommend:popularSkin.setPrice'))
          return
        }
      }
      // 校驗按天梯度折扣配置
      if (gradientEnabled) {
        for (let i = 0; i < gradients.length; i++) {
          const g = gradients[i]
          if (!g.days || !g.discount) {
            message.error(t('recommend:popularSkin.completeDaysDiscount', { index: i + 1 }))
            return
          }
        }
      }
      setLoading(true)
      // 構建請求 payload
      const payload = {
        algoName: values.popularName,
        brand: appTypeToBrand(values.app),
        channel: values.channel,
        presaleDays,
        refundEnabled: refundEnabled ? 1 : 2,
        discountTiers: gradientEnabled && gradients.length
          ? gradients.filter(g => g.days && g.discount).map(g => ({ minDays: g.days!, discount: g.discount! }))
          : undefined,
        cancelFeeTiers: refundEnabled && cancelFeeRules.length
          ? cancelFeeRules.map(r => ({ remainDays: r.maxDays, ratio: r.feePercent }))
          : undefined,
        blockMerchant: 2, // 默認不屏蔽
        status,
        skins: skins.map(s => ({
          skinName: s.name,
          price: s.price!,
          borderType: s.borderType,
          borderColor: s.borderType === 'color' ? s.borderColor : undefined,
          dishLayout: s.dishLayout,
        })),
      }
      try {
        if (isEditMode) {
          await updateAdHotPricing(Number(urlId), payload)
          message.success(t('recommend:popularSkin.editSuccess'))
        } else {
          await createAdHotPricing(payload)
          message.success(t('recommend:popularSkin.addSuccess'))
        }
        navigate(`/promotion-waterfall?type=${AlgorithmType.POPULAR_MERCHANT_KA}`)
      } catch {
        // 後端不可用或業務錯誤，提示用戶
        message.error(isEditMode ? t('recommend:popularSkin.editFail') : t('recommend:popularSkin.addFail'))
      }
    } catch {
      /* 表單校驗失敗，antd 自動提示 */
    } finally {
      setLoading(false)
    }
  }

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  /** 卡片標題：action 置於分割線右側（模塊右上角），與無敵星星/盤活復蘇保持一致 */
  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string, extra?: React.ReactNode, action?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {action}
    </div>
  )

  const fieldLabelStyle: React.CSSProperties = { fontSize: 13, color: '#595959', marginBottom: 4 }
  const requiredMark = <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>

  /** 通用上傳框 */
  const renderUploadBox = (
    skin: SkinItem, field: SkinImageField,
    width: number, height: number, emptyText: string,
  ) => (
    <Upload
      showUploadList={false}
      accept="image/*"
      disabled={isDetailMode}
      beforeUpload={file => handleUploadImage(file, skin.id, field)}
    >
      <div
        style={{
          width, height, borderRadius: 6, overflow: 'hidden',
          border: skin[field] ? '1px solid #d9d9d9' : '1px dashed #d9d9d9',
          background: '#fff', cursor: isDetailMode ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2,
          transition: 'border-color 0.25s',
        }}
        // 鼠標移入邊框變品牌橘，與無敵星星詳情圖 picture-card 上傳框 hover 效果一致
        onMouseEnter={e => { if (!isDetailMode) e.currentTarget.style.borderColor = '#E8720C' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#d9d9d9' }}
      >
        {skin[field]
          ? <img src={skin[field] as string} alt={emptyText} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : isDetailMode
            // 詳情模式無圖時展示只讀占位，不出現上傳按鈕
            ? <span style={{ fontSize: 11, color: '#BFBFBF' }}>{t('recommend:popularSkin.noImage')}</span>
            : (
              <>
                <PlusOutlined style={{ fontSize: 14, color: '#8C8C8C' }} />
                <span style={{ fontSize: 11, color: '#8C8C8C' }}>{emptyText}</span>
              </>
            )}
      </div>
    </Upload>
  )

  /** 預覽卡片的邊框樣式（配色 / 邊框圖 / 無） */
  const previewCardStyle = (skin: SkinItem): React.CSSProperties => ({
    position: 'relative', background: '#fff', borderRadius: 12, padding: 10,
    border: skin.borderType === 'color'
      ? `2px solid ${skin.borderColor}`
      : '1px solid #f0f0f0',
  })

  /** 上傳邊框圖時，以覆蓋層方式套在卡片外圍 */
  const previewBorderOverlay = (skin: SkinItem) => (
    skin.borderType === 'image' && skin.borderImage ? (
      <img src={skin.borderImage} alt={t('recommend:popularSkin.borderImageLabel')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 12 }} />
    ) : null
  )

  /** 店鋪名稱行（Mock 麥當勞門店，名稱前不展示連鎖圖標） */
  const previewTitleRow = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#262626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        McDonald's（氹仔泉福店）
      </span>
    </div>
  )

  /** 預覽小圖：麥當勞店鋪 LOGO（紅底金拱門，SVG 矢量保證清晰） */
  const previewStoreLogo = (size: number) => (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: '#DA291C',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 100 100">
        <path
          d="M12 90 C12 16 50 16 50 58 C50 16 88 16 88 90"
          fill="none" stroke="#FFC72C" strokeWidth="14" strokeLinecap="round"
        />
      </svg>
    </div>
  )

  /** 店鋪信息區（小圖/大圖模式共用，字段內容保持一致） */
  const previewInfoBlock = () => (
    <>
      {previewTitleRow()}
      {/* 評分 + 月售 + 起送/減配/時長/距離 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#FA8C16' }}>⭐ 4.6</span>
        <span style={{ fontSize: 12, color: '#595959' }}>月售 1196</span>
        <span style={{ fontSize: 12, color: '#595959' }}>起送$40・減配$0~3・32分鐘・1.9km</span>
      </div>
      {/* 標籤行：銷量/店鋪標籤與評價標籤合併展示一排，不換行 */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'nowrap' }}>
        <span style={{ fontSize: 10, color: '#1565C0', background: '#E3F2FD', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>全澳銷量第1名</span>
        <span style={{ fontSize: 10, color: '#722ED1', background: '#F9F0FF', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>熱門店鋪</span>
        <span style={{ fontSize: 10, color: '#D46B08', background: '#FFF3E8', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>金黃酥脆，澳門人氣漢堡首選！</span>
        <span style={{ fontSize: 10, color: '#8C8C8C', background: '#F5F5F5', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>千人收藏好店</span>
      </div>
    </>
  )

  /** 菜品佈局① 大圖拼列：左侧1張大圖（價格疊展示）+ 右侧2張小圖（參考圖一） */
  const renderDishGrid = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 10 }}>
      {/* 左側大圖：餐品铺滿整張卡 + 底部價格/名稱漸變遮罩 */}
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: PREVIEW_DISHES[0].bg, height: 148 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 96, lineHeight: 1 }}>
          {PREVIEW_DISHES[0].emoji}
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 10px 8px',
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55))',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{PREVIEW_DISHES[0].price}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textDecoration: 'line-through' }}>{PREVIEW_DISHES[0].original}</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {PREVIEW_DISHES[0].name}
          </div>
        </div>
      </div>
      {/* 右側兩張小圖：餐品 + 底部名稱遮罩 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PREVIEW_DISHES.slice(1, 3).map(dish => (
          <div key={dish.name} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: dish.bg, height: 70 }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, lineHeight: 1 }}>
              {dish.emoji}
            </div>
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 8px 4px',
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55))',
              fontSize: 11, fontWeight: 600, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{dish.name}</div>
          </div>
        ))}
      </div>
    </div>
  )

  /** 菜品佈局② 階梯輪播：頂層向左滑出的同時，後方卡片沿階梯位置彈性頂上來（同一 DOM 持續過渡，位置/縮放/透明度連貫動畫） */
  const renderDishCarousel = () => {
    const n = PREVIEW_DISHES.length
    // 堆疊深度位：0=前方主卡，1/2=後方階梯卡（依次右移、收窄、淡化）
    const depthStyles: React.CSSProperties[] = [
      { top: 0, bottom: 0, left: 0, right: '28%', zIndex: 3, opacity: 1, transform: 'translateX(0) rotate(0deg)', boxShadow: '4px 0 12px rgba(0,0,0,0.12)' },
      { top: 8, bottom: 8, left: 34, right: 0, zIndex: 2, opacity: 0.75, transform: 'translateX(0) rotate(0deg)', boxShadow: 'none' },
      { top: 16, bottom: 16, left: 68, right: -6, zIndex: 1, opacity: 0.5, transform: 'translateX(0) rotate(0deg)', boxShadow: 'none' },
    ]
    // 離場位：沿主卡位置向左滑出，輕微旋轉淡出（容器 overflow hidden 裁剪，不滑出遮擋其他內容）
    const exitStyle: React.CSSProperties = { top: 0, bottom: 0, left: 0, right: '28%', zIndex: 4, opacity: 0, transform: 'translateX(-118%) rotate(-5deg)' }
    return (
      <div style={{ position: 'relative', height: 158, marginTop: 10, overflow: 'hidden' }}>
        {PREVIEW_DISHES.map((dish, i) => {
          const depth = (i - dishState.current + n) % n
          const prevDepth = dishState.prev !== null ? (i - dishState.prev + n) % n : depth
          // 剛從主卡位離場：帶過渡向左滑出；離場後歸隊：直接停到隊尾階梯位淡入，不做跨屏橫穿
          const isExiting = depth > 2 && prevDepth === 0
          const reJoining = depth <= 2 && prevDepth > 2
          const style = depth <= 2 ? depthStyles[depth] : isExiting ? exitStyle : { ...depthStyles[2], opacity: 0, zIndex: 0 }
          const isFront = depth === 0 || isExiting
          return (
            <div key={dish.name} style={{
              position: 'absolute', borderRadius: 10, overflow: 'hidden', background: dish.bg, pointerEvents: 'none',
              transition: reJoining ? 'none' : 'all 0.65s cubic-bezier(0.34, 1.25, 0.5, 1)',
              animation: reJoining ? 'dishBackIn 0.5s ease' : undefined,
              ...style,
            }}>
              {/* 餐品铺滿整卡，後方卡同步縮小，頂上來時平滑放大 */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 118, lineHeight: 1,
                transform: isFront ? 'scale(1)' : 'scale(0.55)',
                filter: isFront ? 'none' : 'saturate(0.85)',
                transition: reJoining ? 'none' : 'transform 0.65s cubic-bezier(0.34, 1.25, 0.5, 1), filter 0.4s ease',
              }}>{dish.emoji}</div>
              {/* 折扣膠囊 + 名稱條：僅前方主卡展示，頂上來後延遲淡入 */}
              <div style={{ opacity: isFront ? 1 : 0, transition: 'opacity 0.3s ease 0.25s' }}>
                <div style={{ position: 'absolute', left: 8, bottom: 30, display: 'flex', alignItems: 'stretch', borderRadius: 12, overflow: 'hidden' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#E8302D', background: '#fff', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 2 }}>🏷️ {dish.discount}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#E8302D', padding: '3px 8px', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                    {dish.price}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.8)', textDecoration: 'line-through' }}>{dish.original}</span>
                  </span>
                </div>
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 8px',
                  background: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: 600, color: '#262626',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{dish.name}</div>
              </div>
            </div>
          )
        })}
        {/* 輪播指示點 */}
        <div style={{ position: 'absolute', right: 4, bottom: 4, zIndex: 5, display: 'flex', gap: 4 }}>
          {PREVIEW_DISHES.map((_, i) => (
            <span key={i} style={{
              width: i === dishState.current ? 12 : 5, height: 5, borderRadius: 3,
              background: i === dishState.current ? '#E8302D' : '#D9D9D9', transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>
    )
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
                {isDetailMode ? t('recommend:popularSkin.skinPricingDetail') : isEditMode ? t('recommend:popularSkin.skinPricingEdit') : t('recommend:popularSkin.skinPricingAdd')}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>🏆 {t('recommend:popularSkin.skinPopularMerchant')}</span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* 基礎信息 */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', t('recommend:popularSkin.basicInfoTitle'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('recommend:popularSkin.popularNameLabel')} name="popularName" rules={[{ required: true, message: t('recommend:popularSkin.popularNamePlaceholder') }]}>
              <Input
                placeholder={t('recommend:popularSkin.popularNamePlaceholder')}
                maxLength={30}
                showCount
                disabled={isEditMode || isDetailMode}
              />
            </Form.Item>
            <Form.Item label={t('recommend:popularSkin.appLabel')} name="app" rules={[{ required: true, message: t('recommend:popularSkin.selectApp') }]}>
              <Select placeholder={t('recommend:popularSkin.pleaseSelect')} options={tAppOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label={t('recommend:popularSkin.channelLabel')} name="channel" rules={[{ required: true, message: t('recommend:popularSkin.selectChannel') }]}>
              <Select placeholder={t('recommend:popularSkin.pleaseSelect')} options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          {/* 詳情圖：置於第二行，與算法名稱左對齊（與無敵星星/盤活復蘇保持一致） */}
          <Form.Item label={t('recommend:popularSkin.detailImageLabel')} style={{ marginBottom: 0, marginTop: 16 }}>
            <Upload
              disabled={isDetailMode}
              listType="picture-card"
              fileList={detailFileList}
              onChange={({ fileList }) => setDetailFileList(fileList)}
              beforeUpload={() => false}
            >
              {detailFileList.length < 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <PlusOutlined style={{ fontSize: 20 }} />
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:popularSkin.uploadDetailImage')}</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* 銷售策略：上線天數（與無敵星星/盤活復蘇定價保持一致，限制廣告銷售可購買的天數範圍） */}
        <div style={cardShellStyle}>
          {cardTitle(<BarChartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, '#fff7e6', t('recommend:popularSkin.salesStrategyCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 80 }}>{t('recommend:popularSkin.presaleDaysLabel')}</span>
            <InputNumber
              min={1}
              max={90}
              precision={0}
              value={presaleDays}
              disabled={isDetailMode}
              onChange={(value) => setPresaleDays(value || 7)}
              addonAfter={t('recommend:popularSkin.dayAddon')}
              style={{ width: 160 }}
            />
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
              {t('recommend:popularSkin.presaleDaysHint', { days: presaleDays })}
            </span>
          </div>
        </div>

        {/* 皮膚列表 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SkinOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7E6', t('recommend:popularSkin.skinListCard'),
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              {t('recommend:popularSkin.skinListHint')}
            </span>,
            !isDetailMode && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddSkin}
                style={{ borderRadius: 6 }}
              >
                {t('recommend:popularSkin.addSkin')}
              </Button>
            ),
          )}

          {skins.map((skin, index) => (
            <div key={skin.id} style={{
              border: '1px solid #f0f0f0', borderRadius: 8,
              padding: '16px 20px', marginBottom: 12, background: '#FAFAFA',
            }}>
              {/* 塊頭：序號徽章 + 固定標題（自增序號 + 皮膚套件） + 預覽/刪除 */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #E8720C, #F59432)',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 4px rgba(232,114,12,0.25)', marginRight: 8,
                }}>{index + 1}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                  {t('recommend:popularSkin.skinKit')}
                </span>
                <div style={{ flex: 1 }} />
                <Button type="link" size="small" icon={<EyeOutlined />}
                  onClick={() => setPreviewSkin(skin)}>{t('recommend:popularSkin.skinPreview')}</Button>
                {!isDetailMode && (
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => handleRemoveSkin(skin.id)}>{t('recommend:popularSkin.skinDelete')}</Button>
                )}
              </div>

              {/* 第一行：名稱 / 售價 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', marginBottom: 14 }}>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}{t('recommend:popularSkin.skinNameLabel')}</div>
                  <Input
                    placeholder={t('recommend:popularSkin.skinNamePh')}
                    value={skin.name}
                    maxLength={20}
                    allowClear
                    disabled={isDetailMode}
                    onChange={e => updateSkin(skin.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}{t('recommend:popularSkin.skinPriceLabel')}</div>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    precision={0}
                    placeholder={t('recommend:popularSkin.skinPricePh')}
                    value={skin.price}
                    disabled={isDetailMode}
                    onChange={v => updateSkin(skin.id, { price: v ?? undefined })}
                    addonAfter={t('recommend:popularSkin.mopDayUnit')}
                  />
                </div>
              </div>

              {/* 第二行：菜品展示佈局 / 邊框 / 大圖主圖 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' }}>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}{t('recommend:popularSkin.dishLayoutLabel')}</div>
                  <Radio.Group
                    value={skin.dishLayout}
                    disabled={isDetailMode}
                    onChange={e => updateSkin(skin.id, { dishLayout: e.target.value })}
                    options={tDishLayoutOptions}
                    optionType="button"
                    buttonStyle="solid"
                  />
                  <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 4, lineHeight: '16px' }}>
                    {t('recommend:popularSkin.dishLayoutHint')}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ ...fieldLabelStyle, marginBottom: 0 }}>{requiredMark}{t('recommend:popularSkin.borderConfigLabel')}</span>
                    <Select
                      style={{ width: 110, flexShrink: 0 }}
                      value={skin.borderType}
                      disabled={isDetailMode}
                      onChange={v => updateSkin(skin.id, { borderType: v })}
                      options={tBorderTypeOptions}
                    />
                  </div>
                  {skin.borderType === 'color' && (
                    <ColorPicker
                      value={skin.borderColor}
                      disabled={isDetailMode}
                      presets={tColorPresets}
                      showText
                      onChange={c => updateSkin(skin.id, { borderColor: c.toHexString() })}
                    />
                  )}
                  {skin.borderType === 'image' && renderUploadBox(skin, 'borderImage', 88, 88, t('recommend:popularSkin.uploadBorderText'))}
                </div>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}{t('recommend:popularSkin.bigImageLabel')}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {renderUploadBox(skin, 'bigImage', 88, 88, t('recommend:popularSkin.uploadImageText'))}
                    <div style={{ fontSize: 11, color: '#8C8C8C', lineHeight: '18px', paddingTop: 2 }}>
                      {t('recommend:popularSkin.bigImageHint')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 購買多天折扣配置（梯度），參考盤活復蘇 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <PercentageOutlined style={{ fontSize: 14, color: '#722ED1' }} />, '#F9F0FF', t('recommend:popularSkin.gradientDiscountTitle'),
            <>
              <Switch
                size="small"
                checked={gradientEnabled}
                disabled={isDetailMode}
                onChange={checked => {
                  setGradientEnabled(checked)
                  if (checked && gradients.length === 0) {
                    setGradients([{ days: undefined, discount: undefined }])
                  }
                }}
              />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:popularSkin.gradientDiscountHint')}</span>
            </>,
            gradientEnabled && !isDetailMode && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddGradient}
                style={{ borderRadius: 6 }}
              >
                {t('recommend:popularSkin.addGradient')}
              </Button>
            ),
          )}
          {gradientEnabled ? (
            gradients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                {t('recommend:popularSkin.noGradientConfig')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {gradients.map((gradient, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: '#722ED1', background: '#F9F0FF',
                      border: '1px solid #D3ADF7', borderRadius: 4, padding: '1px 8px', flexShrink: 0,
                    }}>{t('recommend:popularSkin.gradientN', { index: index + 1 })}</span>
                    <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:popularSkin.purchaseDaysGe')}</span>
                    <InputNumber
                      min={1}
                      max={9999}
                      precision={0}
                      placeholder={t('recommend:daysPlaceholder')}
                      style={{ width: 110 }}
                      value={gradient.days || undefined}
                      disabled={isDetailMode}
                      onChange={value => handleUpdateGradient(index, 'days', value)}
                    />
                    <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:popularSkin.correspondingDiscount')}</span>
                    <InputNumber
                      min={0.01}
                      max={10}
                      precision={2}
                      placeholder={t('recommend:discountPlaceholder')}
                      style={{ width: 120 }}
                      addonAfter={t('recommend:zheUnit')}
                      value={gradient.discount || undefined}
                      disabled={isDetailMode}
                      onChange={value => handleUpdateGradient(index, 'discount', value)}
                    />
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {(gradient.days ?? 0) > 0 && (gradient.discount ?? 0) > 0
                        ? t('recommend:popularSkin.gradientExample', { days: gradient.days, discount: gradient.discount })
                        : ''}
                    </span>
                    {!isDetailMode && (
                      <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        style={{ marginLeft: 'auto' }}
                        onClick={() => handleRemoveGradient(index)}
                      >{t('recommend:popularSkin.skinDelete')}</Button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend:popularSkin.gradientDisabledHint')}</div>
          )}
        </div>

        {/* 訂單退款，退費比例配置（與無敵星星/盤活復蘇定價保持一致） */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SettingOutlined style={{ fontSize: 14, color: '#f5222d' }} />, '#fff1f0', t('recommend:popularSkin.refundConfigTitle'),
            <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 4 }}>{t('recommend:popularSkin.refundConfigHint')}</span>,
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: refundEnabled ? '#52c41a' : '#8c8c8c' }}>{refundEnabled ? t('recommend:popularSkin.allowRefund') : t('recommend:popularSkin.notAllowRefund')}</span>
              <Switch
                size="small"
                checked={refundEnabled}
                disabled={isDetailMode}
                onChange={checked => setRefundEnabled(checked)}
                style={{ background: refundEnabled ? '#52c41a' : '#d9d9d9' }}
              />
            </div>,
          )}
          {refundEnabled ? (
            <Table
              rowKey="id"
              dataSource={cancelFeeRules}
              pagination={false}
              bordered
              size="small"
              columns={[
                {
                  title: t('recommend:popularSkin.adPromotionCol'),
                  dataIndex: 'maxDays',
                  width: 220,
                  render: (_, record: CancelFeeRule) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('recommend:popularSkin.remainingDaysLe')}</span>
                      <InputNumber
                        disabled={isDetailMode}
                        min={0}
                        max={999}
                        value={record.maxDays === 999 ? undefined : record.maxDays}
                        onChange={(val) => {
                          setCancelFeeRules(prev => prev.map(r => r.id === record.id ? { ...r, maxDays: val ?? 0 } : r))
                        }}
                        addonAfter={record.maxDays === 999 ? '' : t('recommend:popularSkin.dayAddon')}
                        placeholder={record.maxDays === 999 ? t('recommend:popularSkin.unlimitedPh') : ''}
                        style={{ flex: 1 }}
                      />
                    </div>
                  ),
                },
                {
                  title: t('recommend:popularSkin.ratioConfigCol'),
                  dataIndex: 'feePercent',
                  width: 160,
                  render: (_, record: CancelFeeRule) => (
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
                  title: t('recommend:popularSkin.opCol'),
                  width: 120,
                  align: 'center',
                  render: (_: unknown, record: CancelFeeRule) => {
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
                            {t('recommend:popularSkin.addTier')}
                          </Button>
                        )}
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={() => {
                            if (cancelFeeRules.length <= 1) {
                              message.warning(t('recommend:atLeastOneRule'))
                              return
                            }
                            setCancelFeeRules(prev => prev.filter(r => r.id !== record.id))
                          }}
                        >
                          {t('recommend:popularSkin.skinDelete')}
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
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('recommend:popularSkin.notAllowRefundHint')}</span>
            </div>
          )}
        </div>

        {/* 狀態設置 */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />, '#f6ffed', t('recommend:popularSkin.statusSettingCard'))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend:popularSkin.statusLabelColon')}</span>
            <Switch
              checked={status === ServiceStatus.ENABLED}
              disabled={isDetailMode}
              onChange={checked => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
              checkedChildren={t('recommend:popularSkin.statusEnabledText')}
              unCheckedChildren={t('recommend:popularSkin.statusDisabledText')}
            />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('recommend:popularSkin.disableSkinHint')}</span>
          </div>
        </div>
      </Form>

      {/* 皮膚預覽彈窗：模擬 APP 瀑布流卡片效果 */}
      <Modal
        open={!!previewSkin}
        title={previewSkin?.name.trim()
          ? t('recommend:popularSkin.skinPreviewModalTitleNamed', { name: previewSkin.name })
          : t('recommend:popularSkin.skinPreviewModalTitle')}
        footer={null}
        width={620}
        onCancel={() => setPreviewSkin(null)}
      >
        {previewSkin && (
          <div style={{ background: '#F5F5F5', borderRadius: 8, padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* 小圖模式 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>{t('recommend:popularSkin.smallMode')}</div>
                {/* 瀑布流上下文：上方鄰卡（模糊淡化） */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍜</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>老友記茶餐廳</div>
                          <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.2 月售 866</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 當前卡片 + 「您的門店」標籤 */}
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', top: -9, right: 10, zIndex: 1,
                      fontSize: 10, color: '#fff', fontWeight: 600,
                      background: 'linear-gradient(135deg, #E8720C, #F59432)',
                      borderRadius: 8, padding: '1px 8px', lineHeight: '16px',
                      boxShadow: '0 2px 6px rgba(232,114,12,0.35)',
                    }}>{t('recommend:popularSkin.yourStoreBadge')}</span>
                    <div style={previewCardStyle(previewSkin)}>
                      {previewBorderOverlay(previewSkin)}
                      <div style={{ display: 'flex', gap: 10 }}>
                        {previewStoreLogo(76)}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {previewInfoBlock()}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 下方鄰卡（模糊淡化） */}
                  <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>☕</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>街角咖啡</div>
                          <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.6 月售 1024</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 大圖模式：左側豎版主圖 + 右側店鋪信息/優惠券/品牌說/商品列 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('recommend:popularSkin.bigMode')}</span>
                  <span style={{
                    fontSize: 11, borderRadius: 4, padding: '1px 8px', lineHeight: '18px',
                    color: '#E8720C', background: '#FFF7E6', border: '1px solid #E8720C',
                  }}>{tDishLayoutOptions.find(o => o.value === previewSkin.dishLayout)?.label}</span>
                </div>
                {/* 瀑布流上下文：上方鄰卡（模糊淡化） */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍜</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>老友記茶餐廳</div>
                          <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.2 月售 866</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 當前卡片 + 「您的門店」標籤 */}
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', top: -9, right: 10, zIndex: 1,
                      fontSize: 10, color: '#fff', fontWeight: 600,
                      background: 'linear-gradient(135deg, #E8720C, #F59432)',
                      borderRadius: 8, padding: '1px 8px', lineHeight: '16px',
                      boxShadow: '0 2px 6px rgba(232,114,12,0.35)',
                    }}>{t('recommend:popularSkin.yourStoreBadge')}</span>
                    <div style={previewCardStyle(previewSkin)}>
                      {previewBorderOverlay(previewSkin)}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                        {previewSkin.bigImage
                          ? (
                            <div style={{ width: 130, flexShrink: 0, alignSelf: 'stretch' }}>
                              <img src={previewSkin.bigImage} alt={t('recommend:popularSkin.bigImageAlt')} style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                            </div>
                          )
                          : (
                            <div style={{
                              width: 130, flexShrink: 0, alignSelf: 'stretch', borderRadius: 8,
                              border: '1px dashed #d9d9d9', background: '#fafafa',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, color: '#8C8C8C', textAlign: 'center', padding: 8,
                            }}>{t('recommend:popularSkin.noBigImage')}</div>
                          )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {previewInfoBlock()}
                          {/* 菜品展示區：渲染商家選擇的佈局風格 */}
                          {!previewSkin.dishLayout && (
                            <div style={{ fontSize: 12, color: '#BFBFBF', marginTop: 10 }}>{t('recommend:popularSkin.noDishLayout')}</div>
                          )}
                          {previewSkin.dishLayout === 'grid' ? renderDishGrid() : previewSkin.dishLayout === 'carousel' ? renderDishCarousel() : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 下方鄰卡（模糊淡化） */}
                  <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>☕</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>街角咖啡</div>
                          <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.6 月售 1024</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* 風格分配說明 */}
                <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8, lineHeight: 1.7 }}>
                  {t('recommend:popularSkin.layoutAssignHint')}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              {t('recommend:popularSkin.previewDataHint')}
            </div>
          </div>
        )}
      </Modal>

      {/* 底部操作欄：統一為「取消 + 保存」，詳情模式隱藏（返回走頂部按鈕） */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>
            {t('common:save')}
          </Button>
        </div>
      )}
    </div>
  )
}
