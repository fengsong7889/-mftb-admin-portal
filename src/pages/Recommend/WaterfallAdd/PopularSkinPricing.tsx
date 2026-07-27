/**
 * 人氣商家 - 皮膚定價（新增/編輯/詳情）
 *
 * 業務背景：人氣商家主要靠售賣「皮膚」盈利。業務人員配置皮膚組成元素並按天定價，
 * 商家購買後皮膚將應用在 APP 瀑布流列表的商家卡片上。
 *
 * 皮膚組成元素（參考 APP 實際展示樣式）：
 *  - 標籤圖標：上傳圖標（「人氣」標籤樣式），展示在店鋪名稱旁，小圖/大圖模式通用
 *  - 卡片邊框：支持 無邊框 / 選擇配色 / 上傳邊框圖 三種方式，小圖/大圖模式通用
 *  - 大圖模式左側豎版主圖：必須上傳（小圖模式無需上傳圖片）
 *  - 售價按天計算（MOP/天）
 *  - 內置預覽：運營人員可查看所配置皮膚在小圖/大圖模式下的展示效果
 */
import { useState, useEffect } from 'react'
import { Button, ColorPicker, Form, Input, InputNumber, Select, Switch, Upload, message, Modal } from 'antd'
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
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlgorithmType,
  RecommendChannel,
  ServiceStatus,
  APP_OPTIONS,
} from '../constants'

// Mock数据 - 人氣商家可選算法列表
const ALGORITHM_OPTIONS = [
  { id: 3001, name: '人氣商家-首頁版' },
  { id: 3002, name: '人氣商家-外賣版' },
  { id: 3003, name: '人氣商家-團購版' },
  { id: 3004, name: '人氣商家-超市版' },
]

/** 邊框方式 */
const BORDER_TYPE_OPTIONS = [
  { value: 'none', label: '無邊框' },
  { value: 'color', label: '選擇配色' },
  { value: 'image', label: '上傳邊框' },
]

/** 邊框配色預設色板 */
const COLOR_PRESETS = [
  { label: '推薦顏色', colors: ['#FF4D4F', '#E8720C', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#EB2F96', '#13C2C2'] },
]

/** 可上傳圖片的字段 */
type SkinImageField = 'tagIcon' | 'borderImage' | 'bigImage'

/** 按天梯度折扣配置（購買天數≥ days 時享 discount 折，參考盤活復蘇梯度配置） */
interface DayDiscountGradient {
  days: number
  discount: number
}

/** 單款皮膚配置 */
interface SkinItem {
  id: number
  /** 皮膚名稱 */
  name: string
  /** 售價 MOP/天 */
  price?: number
  /** 標籤圖標（dataURL，類似「新店」標籤樣式） */
  tagIcon: string | null
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
  tagIcon: null,
  borderType: 'image',
  borderColor: '#FF4D4F',
  borderImage: null,
  bigImage: null,
  ...partial,
})

/** 生成 SVG dataURL，用於編輯/詳情模式回顯已上傳的 Mock 圖片 */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Mock 標籤圖標：「人氣」膠囊標籤 */
const buildMockTagIcon = (from: string, to: string) => svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="40" viewBox="0 0 88 40">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`
  + `<rect width="88" height="40" rx="20" fill="url(#g)"/>`
  + `<text x="44" y="27" font-size="20" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC, sans-serif">人氣</text>`
  + `</svg>`,
)

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
    tagIcon: buildMockTagIcon('#FF4D4F', '#FF7A45'),
    bigImage: buildMockBigImage('#FF4D4F', '#FFA39E', '紅運當頭'),
  }),
  createSkin({
    name: '橙意滿滿', price: 18, borderType: 'color', borderColor: '#E8720C',
    tagIcon: buildMockTagIcon('#E8720C', '#F59432'),
    bigImage: buildMockBigImage('#E8720C', '#FFB347', '橙意滿滿'),
  }),
  createSkin({
    name: '簡約無框', price: 8, borderType: 'none',
    tagIcon: buildMockTagIcon('#8C8C8C', '#BFBFBF'),
    bigImage: buildMockBigImage('#595959', '#8C8C8C', '簡約無框'),
  }),
]

export default function PopularSkinPricing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlModule = searchParams.get('module') || 'delivery'
  const urlId = searchParams.get('id') || ''
  const isDetailMode = searchParams.get('mode') === 'detail'
  const isEditMode = !!urlId && !isDetailMode
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  // 皮膚列表
  const [skins, setSkins] = useState<SkinItem[]>(() => (urlId ? buildMockSkins() : [createSkin()]))
  // 預覽中的皮膚
  const [previewSkin, setPreviewSkin] = useState<SkinItem | null>(null)
  // 狀態（底部 Switch：啟用/停用）
  const [status, setStatus] = useState<ServiceStatus>(ServiceStatus.ENABLED)
  // 購買多天折扣配置（梯度）
  const [gradientEnabled, setGradientEnabled] = useState(false)
  const [gradients, setGradients] = useState<DayDiscountGradient[]>([])
  // 詳情圖（基礎信息卡片，與無敵星星/盤活復蘇保持一致）
  const [detailFileList, setDetailFileList] = useState<UploadFile[]>([])

  // 業務頻道選項（按模塊過濾，與銷售定價通用表單保持一致）
  const channelOptions = urlModule === 'groupBuy'
    ? [{ label: '團購到店', value: RecommendChannel.GROUP_BUY }]
    : [
        { label: '美食外賣', value: RecommendChannel.DELIVERY },
        { label: '超市百貨', value: RecommendChannel.SUPERMARKET },
      ]

  // 編輯/詳情模式回填基礎信息
  useEffect(() => {
    if (urlId) {
      form.setFieldsValue({
        algorithmId: ALGORITHM_OPTIONS[0]?.id,
        app: APP_OPTIONS[0]?.value,
        channel: channelOptions[0]?.value,
      })
      // 回填按天梯度折扣 Mock 數據
      setGradientEnabled(true)
      setGradients([
        { days: 7, discount: 95 },
        { days: 15, discount: 90 },
        { days: 30, discount: 85 },
      ])
      // 回填詳情圖 Mock 數據
      setDetailFileList([{ uid: '-1', name: 'detail.svg', status: 'done', url: MOCK_DETAIL_IMAGE }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlId, form])

  // 更新指定皮膚的字段
  const updateSkin = (id: number, patch: Partial<SkinItem>) => {
    setSkins(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }

  // 上傳皮膚圖片（本地預覽，不真正上傳）
  const handleUploadImage = (file: File, targetId: number, field: SkinImageField) => {
    if (!file.type.startsWith('image/')) {
      message.error('僅支持上傳圖片文件')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('圖片大小不能超過 5MB')
      return false
    }
    const reader = new FileReader()
    reader.onload = () => {
      updateSkin(targetId, { [field]: reader.result as string })
      message.success('上傳成功')
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
    setGradients(prev => [...prev, { days: 0, discount: 0 }])
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
      message.warning('至少保留一款皮膚')
      return
    }
    Modal.confirm({
      title: '刪除皮膚',
      content: '確定刪除該款皮膚嗎？刪除後不可恢復。',
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
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
        const label = skin.name.trim() || `皮膚 ${i + 1}`
        if (!skin.name.trim()) {
          message.error(`${label}：請填寫皮膚名稱`)
          return
        }
        if (skin.borderType === 'image' && !skin.borderImage) {
          message.error(`${label}：請上傳邊框圖`)
          return
        }
        if (!skin.bigImage) {
          message.error(`${label}：請上傳大圖模式圖片`)
          return
        }
        if (skin.price === undefined || skin.price <= 0) {
          message.error(`${label}：請設置售價`)
          return
        }
      }
      // 校驗按天梯度折扣配置
      if (gradientEnabled) {
        for (let i = 0; i < gradients.length; i++) {
          const g = gradients[i]
          if (!g.days || !g.discount) {
            message.error(`折扣梯度 ${i + 1}：請填寫完整的購買天數與折扣`)
            return
          }
        }
      }
      setLoading(true)
      console.log('提交皮膚定價:', { ...values, skins, status, gradientEnabled, gradients, detailFileList })
      message.success(isEditMode ? '編輯成功' : '新增成功')
      navigate(`/promotion-waterfall?type=${AlgorithmType.POPULAR_MERCHANT_KA}`)
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
            ? <span style={{ fontSize: 11, color: '#BFBFBF' }}>暫無圖片</span>
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
      <img src={skin.borderImage} alt="邊框"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 12 }} />
    ) : null
  )

  /** 店鋪名稱行（標籤圖標 + 名稱） */
  const previewTitleRow = (skin: SkinItem) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {skin.tagIcon && <img src={skin.tagIcon} alt="標籤" style={{ height: 18, flexShrink: 0 }} />}
      <span style={{ fontSize: 14, fontWeight: 600, color: '#262626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        小貝全球獨家烤鴨專門店
      </span>
    </div>
  )

  const previewMetaStyle: React.CSSProperties = { fontSize: 11, color: '#8C8C8C', marginTop: 4 }

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
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? '定價詳情' : isEditMode ? '編輯定價' : '新增定價'}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>🏆 人氣商家</span>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* 基礎信息 */}
        <div style={cardShellStyle}>
          {cardTitle(<ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', '基礎信息')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="算法名稱" name="algorithmId" rules={[{ required: true, message: '請選擇算法' }]}>
              <Select
                placeholder="請選擇算法"
                showSearch
                optionFilterProp="label"
                disabled={isEditMode || isDetailMode}
                options={ALGORITHM_OPTIONS.map(alg => ({ label: alg.name, value: alg.id }))}
              />
            </Form.Item>
            <Form.Item label="所屬品牌" name="app" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
              <Select placeholder="請選擇" options={APP_OPTIONS} disabled={isEditMode || isDetailMode} />
            </Form.Item>
            <Form.Item label="業務頻道" name="channel" rules={[{ required: true, message: '請選擇業務頻道' }]}>
              <Select placeholder="請選擇" options={channelOptions} disabled={isEditMode || isDetailMode} />
            </Form.Item>
          </div>
          {/* 詳情圖：置於第二行，與算法名稱左對齊（與無敵星星/盤活復蘇保持一致） */}
          <Form.Item label="詳情圖" style={{ marginBottom: 0, marginTop: 16 }}>
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
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>上傳詳情圖</span>
                </div>
              )}
            </Upload>
          </Form.Item>
        </div>

        {/* 皮膚列表 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <SkinOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#FFF7E6', '皮膚列表',
            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 4 }}>
              小圖模式無需上傳圖片（由標籤 + 邊框自動組成），大圖模式需上傳左側豎版主圖
            </span>,
            !isDetailMode && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddSkin}
                style={{ borderRadius: 6 }}
              >
                添加皮膚
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
                  皮膚套件
                </span>
                <div style={{ flex: 1 }} />
                <Button type="link" size="small" icon={<EyeOutlined />}
                  onClick={() => setPreviewSkin(skin)}>預覽</Button>
                {!isDetailMode && (
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => handleRemoveSkin(skin.id)}>刪除</Button>
                )}
              </div>

              {/* 第一行：名稱 / 售價 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', marginBottom: 14 }}>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}皮膚名稱</div>
                  <Input
                    placeholder="請輸入皮膚名稱"
                    value={skin.name}
                    maxLength={20}
                    allowClear
                    disabled={isDetailMode}
                    onChange={e => updateSkin(skin.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}售價（按天計算）</div>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    precision={0}
                    placeholder="請輸入每天售價"
                    value={skin.price}
                    disabled={isDetailMode}
                    onChange={v => updateSkin(skin.id, { price: v ?? undefined })}
                    addonAfter="MOP/天"
                  />
                </div>
              </div>

              {/* 第二行：標籤圖標 / 邊框 / 大圖主圖 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' }}>
                <div>
                  <div style={fieldLabelStyle}>標籤圖標</div>
                  {renderUploadBox(skin, 'tagIcon', 88, 88, '上傳圖標')}
                  <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 4 }}>展示在店鋪名稱旁，「人氣」標籤</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ ...fieldLabelStyle, marginBottom: 0 }}>{requiredMark}邊框配置</span>
                    <Select
                      style={{ width: 110, flexShrink: 0 }}
                      value={skin.borderType}
                      disabled={isDetailMode}
                      onChange={v => updateSkin(skin.id, { borderType: v })}
                      options={BORDER_TYPE_OPTIONS}
                    />
                  </div>
                  {skin.borderType === 'color' && (
                    <ColorPicker
                      value={skin.borderColor}
                      disabled={isDetailMode}
                      presets={COLOR_PRESETS}
                      showText
                      onChange={c => updateSkin(skin.id, { borderColor: c.toHexString() })}
                    />
                  )}
                  {skin.borderType === 'image' && renderUploadBox(skin, 'borderImage', 88, 88, '上傳邊框')}
                </div>
                <div>
                  <div style={fieldLabelStyle}>{requiredMark}大圖模式圖片</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {renderUploadBox(skin, 'bigImage', 88, 88, '上傳圖片')}
                    <div style={{ fontSize: 11, color: '#8C8C8C', lineHeight: '18px', paddingTop: 2 }}>
                      大圖模式需上傳左側豎版主圖（3:4，5MB 以內）；小圖模式無需上傳
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
            <PercentageOutlined style={{ fontSize: 14, color: '#722ED1' }} />, '#F9F0FF', '購買多天折扣配置（梯度）',
            <>
              <Switch
                size="small"
                checked={gradientEnabled}
                disabled={isDetailMode}
                onChange={checked => {
                  setGradientEnabled(checked)
                  if (checked && gradients.length === 0) {
                    setGradients([{ days: 0, discount: 0 }])
                  }
                }}
              />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>商家購買多天時按以下梯度匹配折扣，所有皮膚通用</span>
            </>,
            gradientEnabled && !isDetailMode && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddGradient}
                style={{ borderRadius: 6 }}
              >
                添加梯度
              </Button>
            ),
          )}
          {gradientEnabled ? (
            gradients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
                暫無梯度配置，請點擊右上角“添加梯度”
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {gradients.map((gradient, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: '#722ED1', background: '#F9F0FF',
                      border: '1px solid #D3ADF7', borderRadius: 4, padding: '1px 8px', flexShrink: 0,
                    }}>梯度 {index + 1}</span>
                    <span style={{ fontSize: 13, color: '#595959' }}>購買天數≥</span>
                    <InputNumber
                      min={1}
                      max={180}
                      precision={0}
                      placeholder="天數"
                      style={{ width: 90 }}
                      value={gradient.days || undefined}
                      disabled={isDetailMode}
                      onChange={value => handleUpdateGradient(index, 'days', value)}
                    />
                    <span style={{ fontSize: 13, color: '#595959' }}>天，對應折扣：</span>
                    <InputNumber
                      min={1}
                      max={99}
                      precision={0}
                      placeholder="折扣"
                      style={{ width: 100 }}
                      addonAfter="折"
                      value={gradient.discount || undefined}
                      disabled={isDetailMode}
                      onChange={value => handleUpdateGradient(index, 'discount', value)}
                    />
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {gradient.days > 0 && gradient.discount > 0
                        ? `示例：購買滿 ${gradient.days} 天，按原價的 ${gradient.discount}% 付款`
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
                      >刪除</Button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>未啟用梯度折扣，商家購買時一律按原價計算</div>
          )}
        </div>

        {/* 狀態設置 */}
        <div style={cardShellStyle}>
          {cardTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />, '#f6ffed', '狀態設置')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>狀態：</span>
            <Switch
              checked={status === ServiceStatus.ENABLED}
              disabled={isDetailMode}
              onChange={checked => setStatus(checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)}
              checkedChildren="啟用"
              unCheckedChildren="停用"
            />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>停用後該定價不再對商家開放購買</span>
          </div>
        </div>
      </Form>

      {/* 皮膚預覽彈窗：模擬 APP 瀑布流卡片效果 */}
      <Modal
        open={!!previewSkin}
        title={`皮膚預覽${previewSkin?.name.trim() ? `：${previewSkin.name}` : ''}`}
        footer={null}
        width={720}
        onCancel={() => setPreviewSkin(null)}
      >
        {previewSkin && (
          <div style={{ background: '#F5F5F5', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* 小圖模式 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>小圖模式（列表卡片）</div>
                <div style={previewCardStyle(previewSkin)}>
                  {previewBorderOverlay(previewSkin)}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{
                      width: 76, height: 76, borderRadius: 8, background: '#f0f0f0', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    }}>🍣</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {previewTitleRow(previewSkin)}
                      <div style={previewMetaStyle}>★4.5 月售 1196</div>
                      <div style={previewMetaStyle}>起送$80・配送$12・30分鐘・2.5km</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        <span style={{ fontSize: 10, color: '#1565C0', background: '#E3F2FD', borderRadius: 3, padding: '1px 5px' }}>全澳銷量第1名</span>
                        <span style={{ fontSize: 10, color: '#722ED1', background: '#F9F0FF', borderRadius: 3, padding: '1px 5px' }}>熱門店鋪</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 大圖模式 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>大圖模式（大卡曝光）</div>
                <div style={previewCardStyle(previewSkin)}>
                  {previewBorderOverlay(previewSkin)}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {previewSkin.bigImage
                      ? <img src={previewSkin.bigImage} alt="主圖" style={{ width: 90, height: 120, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : (
                        <div style={{
                          width: 90, height: 120, borderRadius: 8, flexShrink: 0,
                          border: '1px dashed #d9d9d9', background: '#fafafa',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, color: '#8C8C8C', textAlign: 'center', padding: 8,
                        }}>未上傳主圖</div>
                      )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {previewTitleRow(previewSkin)}
                      <div style={previewMetaStyle}>★4.5 起送$80・專送$12・30分鐘</div>
                      <div style={{
                        marginTop: 8, height: 64, borderRadius: 8, background: '#f0f0f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, position: 'relative',
                      }}>
                        🍔
                        <span style={{
                          position: 'absolute', left: 6, bottom: 6, fontSize: 10, color: '#fff',
                          background: '#FF4D4F', borderRadius: 3, padding: '1px 5px', fontWeight: 600,
                        }}>$9.9</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              店鋪名稱、評分、商品圖與優惠信息為示意數據，實際以商家數據自動生成為準
            </div>
          </div>
        )}
      </Modal>

      {/* 底部操作欄：統一為「取消 + 保存」，詳情模式隱藏（返回走頂部按鈕） */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSubmit}>
            保存
          </Button>
        </div>
      )}
    </div>
  )
}
