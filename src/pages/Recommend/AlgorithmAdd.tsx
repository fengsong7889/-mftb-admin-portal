import { useState, useEffect, useRef } from 'react'
import { Button, Form, Input, Select, message, Tag, Checkbox, InputNumber, Modal, Table, Popover } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined, AppstoreOutlined, PlusOutlined, DeleteOutlined, QuestionCircleOutlined, ShopOutlined, StarFilled } from '@ant-design/icons'
import { AlgorithmType, APP_OPTIONS } from './constants'
import { mockAlgorithmData } from './Algorithm/index'
import { fetchAdAlgorithmDetail, createAdAlgorithm, updateAdAlgorithm, appTypeToBrand, brandToAppType, type AdAlgorithmRequest } from '../../api/adPromotion'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import './WeightSlider.css'

/** 广告类型标签映射 */
const TYPE_LABEL: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
  [AlgorithmType.POPULAR_MERCHANT_KA]: '人氣商家',
  [AlgorithmType.BRAND_MERCHANT]: '品牌商家(KA)',
  [AlgorithmType.GOLD_AD]: '點金廣告',
  [AlgorithmType.GOLDEN_SIGNBOARD]: '金字招牌',
  [AlgorithmType.PRODUCT_PROMO]: '商品促銷',
}

const TYPE_ICON: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '⭐',
  [AlgorithmType.NEW_STORE_AD]: '🏪',
  [AlgorithmType.HOT_REVIVE_AD]: '🔥',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '👑',
  [AlgorithmType.TRAFFIC_AD]: '📊',
  [AlgorithmType.GUESS_YOU_LIKE]: '💡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '🌿',
  [AlgorithmType.SEARCH_ALGORITHM]: '🔍',
  [AlgorithmType.POPULAR_MERCHANT_KA]: '🏆',
  [AlgorithmType.BRAND_MERCHANT]: '💎',
  [AlgorithmType.GOLD_AD]: '💰',
  [AlgorithmType.GOLDEN_SIGNBOARD]: '🏅',
  [AlgorithmType.PRODUCT_PROMO]: '🎯',
}

/** 猜你喜歡：評價檔位（對應 APP 評價界面 1~5 星），正數加分、負數減分 */
const RATING_LEVELS = [
  { stars: 1, label: '非常差', color: '#FF4D4F', fieldName: 'reviewScore1', defaultScore: -5 },
  { stars: 2, label: '差', color: '#FAAD14', fieldName: 'reviewScore2', defaultScore: -3 },
  { stars: 3, label: '一般', color: '#8C8C8C', fieldName: 'reviewScore3', defaultScore: 0 },
  { stars: 4, label: '滿意', color: '#52C41A', fieldName: 'reviewScore4', defaultScore: 3 },
  { stars: 5, label: '非常滿意', color: '#E8720C', fieldName: 'reviewScore5', defaultScore: 5 },
]

/** 店鋪等級配置（獨家商家保障單量 / 品牌商家保障流量共用）：等級 / 標籤 / 標籤色 / 默認值 */
const STORE_LEVEL_BLOCK_OPTIONS = [
  { level: 'KA', label: '大KA', color: '#F5222D', defaultOrders: 30 },
  { level: 'RECHARGE', label: '充值大戶', color: '#FAAD14', defaultOrders: 25 },
  { level: 'A', label: 'A級', color: '#E8720C', defaultOrders: 20 },
  { level: 'B', label: 'B級', color: '#1890FF', defaultOrders: 15 },
  { level: 'C', label: 'C級', color: '#52C41A', defaultOrders: 10 },
  { level: 'D', label: 'D級', color: '#722ED1', defaultOrders: 8 },
  { level: 'E', label: 'E級', color: '#13C2C2', defaultOrders: 5 },
]

export default function AlgorithmAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const algorithmTypeParam = searchParams.get('type') || ''
  const algorithmIdParam = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail' // 只读详情模式
  const initialType = algorithmTypeParam ? Number(algorithmTypeParam) as AlgorithmType : null
  const isEditMode = !!algorithmIdParam && !isDetailMode // 有 id 参数且非详情模式则为编辑模式
  const [form] = Form.useForm()
  const merchantExposureStrategy = Form.useWatch('merchantExposureStrategy', form) // 监听曝光策略选择

  // 商家维度配置（按商家维度曝光策略）
  interface DimensionItem {
    id: string
    type: string
    weight: number | undefined
  }
  const DIMENSION_OPTIONS = [
    { value: 'qualityScore', label: '商家質量分', desc: '滿分5分，歸一化至0-1' },
    { value: 'orderCompletion', label: '訂單完成率', desc: '近30天訂單完成比例，歸一化至0-1' },
    { value: 'newMerchant', label: '新商家扶持', desc: '首投7天內漸變：第1天=1，第7天=0.14，第8天=0' },
    { value: 'distance', label: '距離維度', desc: '距離衰減：e^(-0.1×距離km)，越近分越高' },
  ]
  const [dimensionItems, setDimensionItems] = useState<DimensionItem[]>([])
  const [selectedDimension, setSelectedDimension] = useState<string | undefined>(undefined)
  const [orderCompletionDays, setOrderCompletionDays] = useState(30) // 订单完成率天数
  const [tooltipVisible, setTooltipVisible] = useState<Record<string, boolean>>({})
  const hideTimerRef = useRef<Record<string, NodeJS.Timeout>>({})
  const [selectedAlgorithmType, _setSelectedAlgorithmType] = useState<AlgorithmType | null>(initialType) // 从 URL 参数初始化
  const [presaleMode, _setPresaleMode] = useState(true) // false: 固定, true: 滚动
  const [continuousPurchase, _setContinuousPurchase] = useState(false) // false: 不支持, true: 支持
  const [merchantLimit, _setMerchantLimit] = useState(false) // false: 不限制, true: 限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  // 盘活复苏 - 配送范围计算（4 个固定参数：短程/中程/远程/跨桥）
  const [reviveDeliveryRange, setReviveDeliveryRange] = useState<string[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, _setRegionLimit] = useState(true) // false: 不限制, true: 限制
  const [selectedRegions, _setSelectedRegions] = useState<string[]>([])
  const [_isEditing, setIsEditing] = useState(isEditMode && !isDetailMode) // 编辑模式（详情模式下不可编辑）

  // 新店广告 - 波浪计算配置（周期/间隔为默认值，后续如需调整仅改以下常量）
  /** 新店週期默認天數 */
  const NEW_STORE_CYCLE_DAYS = 60
  /** 波浪間隔（天）：每 N 天切換一次配送範圍 */
  const WAVE_INTERVAL_DAYS = 5
  /** 配送範圍選項 */
  const WAVE_RANGE_OPTIONS = [
    { value: 'short', label: '短程' },
    { value: 'medium', label: '中程' },
    { value: 'long', label: '遠程' },
  ]

  interface WaveNode {
    day: number
    ranges: string[] // ['short','medium','long']
  }

  // 按周期与间隔生成剩余天数节点：60, 55, ..., 5
  const buildWaveNodes = (): WaveNode[] => {
    const nodes: WaveNode[] = []
    for (let d = NEW_STORE_CYCLE_DAYS; d > 0; d -= WAVE_INTERVAL_DAYS) {
      nodes.push({ day: d, ranges: [] })
    }
    return nodes
  }
  const [waveNodes, setWaveNodes] = useState<WaveNode[]>(buildWaveNodes)

  // 单元格勾选：切换某节点的某个配送范围
  const handleToggleWaveCell = (idx: number, range: string, checked: boolean) => {
    setWaveNodes(prev => prev.map((n, i) => {
      if (i !== idx) return n
      return { ...n, ranges: checked ? [...n.ranges, range] : n.ranges.filter(r => r !== range) }
    }))
  }

  // 清空全部勾选
  const handleClearWaveNodes = () => {
    setWaveNodes(prev => prev.map(n => ({ ...n, ranges: [] })))
  }

  // 编辑模式或详情模式下加载默认数据
  useEffect(() => {
    if (!algorithmIdParam) return
    fetchAdAlgorithmDetail(Number(algorithmIdParam))
      .then(detail => {
        form.setFieldsValue({
          name: detail.algoName,
          brand: brandToAppType(detail.brand),
        })
      })
      .catch(() => { /* 静默请求：错误不阻断页面 */ })
  }, [algorithmIdParam, form])

  // 返回算法列表页
  const handleBack = () => {
    navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
  }

  // 进入编辑模式
  const _handleEdit = () => {
    setIsEditing(true)
  }

  // 取消编辑
  const _handleCancelEdit = () => {
    setIsEditing(false)
    form.resetFields()
  }

  // 打开商家选择弹窗
  const _handleOpenMerchantModal = () => {
    setMerchantModalVisible(true)
  }

  // 关闭商家选择弹窗
  const handleCloseMerchantModal = () => {
    setMerchantModalVisible(false)
  }

  // 确认选择商家
  const handleConfirmMerchants = () => {
    form.setFieldsValue({ merchants: selectedMerchants })
    setMerchantModalVisible(false)
    message.success(`已選擇 ${selectedMerchants.length} 個商家`)
  }

  // 商家选择表格列
  const merchantColumns = [
    { title: '商家ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '商家名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 120 },
    { title: '業務類型', dataIndex: 'businessType', key: 'businessType', width: 120 },
  ]

  // Mock商家数据
  const mockMerchants = [
    { id: 'M001', name: '澳門茶餐廳', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M002', name: '葡撻專門店', brand: '閃蜂', businessType: '團購到店' },
    { id: 'M003', name: '海鲜美食坊', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M004', name: '日式拉面屋', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M005', name: '泰式料理', brand: 'mFood', businessType: '團購到店' },
    { id: 'M006', name: '美式漢堡', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M007', name: '意大利麵館', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M008', name: '法式甜品店', brand: '閃蜂', businessType: '團購到店' },
  ]

  // 提交表单（新增/编辑写入后端，后端不可用时降级为本地提示）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const payload: AdAlgorithmRequest = {
        algoName: values.name,
        algoType: Number(algorithmTypeParam),
        brand: appTypeToBrand(values.brand),
        params: {
          presaleMode,
          continuousPurchase,
          merchantLimit,
          merchants: selectedMerchants,
          regionLimit,
          regions: selectedRegions,
          merchantExposureStrategy: values.merchantExposureStrategy,
        },
      }
      if (isEditMode) {
        await updateAdAlgorithm(Number(algorithmIdParam), payload)
      } else {
        await createAdAlgorithm(payload)
      }
      message.success(isEditMode ? '算法更新成功' : '算法新增成功')
      setIsEditing(false)
      navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
    } catch (error) {
      // 表单校验失败不提示（antd 已标红），接口业务错误提示后端返回信息
      if (error instanceof Error) {
        message.error(error.message || '保存失败')
      }
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部 */}
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
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? '算法詳情' : isEditMode ? '編輯算法' : '新增算法'}
              </h2>
              {selectedAlgorithmType && (
                <span style={{ fontSize: 14, color: '#595959' }}>
                  {TYPE_ICON[selectedAlgorithmType]} {TYPE_LABEL[selectedAlgorithmType]}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode}
        initialValues={{
          presaleMode: 'rolling',
          continuousPurchase: 'notSupport',
          merchantLimit: 'unlimited',
          regionLimit: 'limited',
          merchantExposureStrategy: 'random',
        }}
      >
      {/* 算法选择区域 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>算法選擇</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <Form.Item
            label="算法名稱"
            name="name"
            rules={[{ required: true, message: '請輸入算法名稱' }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="請輸入算法名稱" />
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
            style={{ marginBottom: 0 }}
          >
            <Select
              placeholder="請選擇所屬品牌"
              options={APP_OPTIONS}
              disabled={isEditMode || isDetailMode}
            />
          </Form.Item>
        </div>
      </div>

      {/* 算法参数区域 */}
      {selectedAlgorithmType === AlgorithmType.ORGANIC_TRAFFIC ? (
        /* 自然流量：4 個維度的商家評分規則配置 */
        <OrganicTrafficScoreConfig readOnly={isDetailMode} />
      ) : (selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.NEW_STORE_AD || selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT || selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA || selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT || selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE) ? (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>算法參數</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>參數配置</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>配置算法運行參數</span>
          </div>


          {/* 人气商家：仅显示商家状态计算定时器 */}
          {selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>定時器:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>每</span>
                <Form.Item name="merchantStatusTimer" noStyle initialValue={5} rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber
                    min={1}
                    max={60}
                    placeholder="分鐘"
                    style={{ width: 70 }}
                  />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>分鐘計算切換大小圖模式</span>
              </div>
            </div>
          ) : (
            <>
          {/* 商家状态计算 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>商家狀態計算:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Form.Item name="statusOpen" noStyle valuePropName="checked" initialValue={true}>
                <Checkbox disabled>營業中</Checkbox>
              </Form.Item>
              <Form.Item name="statusRest" noStyle valuePropName="checked">
                <Checkbox>休息一會，馬上回來<span style={{ fontSize: 12, color: '#8c8c8c' }}>（2小時後自動恢復）</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusOverwhelmed" noStyle valuePropName="checked">
                <Checkbox>爆單了，暫停接單一會<span style={{ fontSize: 12, color: '#8c8c8c' }}>（2小時後自動恢復）</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusClosed" noStyle valuePropName="checked">
                <Checkbox>休息打烊<span style={{ fontSize: 12, color: '#ff4d4f' }}>（需手動恢復，開啟已打烊會影響用戶體驗，請慎重）</span></Checkbox>
              </Form.Item>
            </div>
          </div>

          {/* 定时器 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>定時器:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>每</span>
              <Form.Item name="consistencyCheckInterval" noStyle rules={[{ required: true, message: '請輸入' }]}>
                <InputNumber
                  min={1}
                  max={1440}
                  placeholder="分鐘"
                  style={{ width: 70 }}
                />
              </Form.Item>
              <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>分鐘校驗數據一致性</span>
            </div>
          </div>
            </>
          )}

          {/* ===== 猜你喜歡：用戶興趣得分規則 ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>用戶興趣得分規則</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 14 }}>
                按用戶行為對店鋪累計興趣得分（用戶 × 店鋪 維度）：收藏、下單分別加分；差評對應減分；得分按滾動窗口計算，超過有效期的行為分數自動失效
              </div>

              {/* 收藏店鋪得分 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>收藏店鋪得分:</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>用戶收藏店鋪即 +</span>
                <Form.Item name="favoriteScore" noStyle initialValue={5} rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber min={1} max={100} precision={0} style={{ width: 80 }} addonAfter="分" disabled={isDetailMode} />
                </Form.Item>
                <Form.Item name="favoriteCancelDeduct" noStyle valuePropName="checked" initialValue={true}>
                  <Checkbox disabled={isDetailMode}>取消收藏時扣回對應分數</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>（店鋪僅有收藏 / 取消收藏兩種狀態，收藏態計分一次，不重複叠加）</span>
              </div>

              {/* 下單店鋪得分（不區分訂單類型） */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>下單店鋪得分:</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>用戶每下一筆訂單 +</span>
                <Form.Item name="orderScore" noStyle initialValue={10} rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber min={1} max={100} precision={0} style={{ width: 80 }} addonAfter="分" disabled={isDetailMode} />
                </Form.Item>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>（用戶下單即代表喜歡該店鋪，不區分配送 / 自取等訂單類型）</span>
              </div>

              {/* 訂單評價得分（五檔星級加減分，卡片樣式與品牌商家「店鋪等級保障流量」一致） */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0, paddingTop: 34 }}>訂單評價得分:</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                    {RATING_LEVELS.map(({ stars, label, color, fieldName, defaultScore }) => (
                      <div key={stars} style={{
                        background: '#fff',
                        border: `1px solid ${color}33`,
                        borderTop: `3px solid ${color}`,
                        borderRadius: 8,
                        padding: '12px 12px 14px',
                        textAlign: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                          <span style={{
                            padding: '0 12px', height: 24, lineHeight: '24px', borderRadius: 12,
                            fontSize: 13, fontWeight: 700, color: '#fff',
                            background: color, display: 'inline-block', whiteSpace: 'nowrap',
                          }}>{label}</span>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <StarFilled key={n} style={{ fontSize: 14, color: n <= stars ? color : '#d9d9d9', marginRight: 1 }} />
                          ))}
                        </div>
                        <Form.Item name={fieldName} noStyle initialValue={defaultScore} rules={[{ required: true, message: '請輸入' }]}>
                          <InputNumber min={-100} max={100} precision={0} style={{ width: '100%' }} addonAfter="分" disabled={isDetailMode} />
                        </Form.Item>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c', lineHeight: '20px' }}>
                    訂單完成後用戶給予的評價會動態調整得分：正數加分、負數減分、0 不加減分；即使訂單已完成，差評仍會對應減分。
                    評價加減分以對應訂單為錨點：評價時訂單仍在得分有效期內則生效，並隨該訂單到期一併失效；訂單已超出有效期後再評價，不再計分
                  </div>
                </div>
              </div>

              {/* 得分有效期 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>得分有效期:</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>僅計算近</span>
                <Form.Item name="scoreValidDays" noStyle initialValue={30} rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber min={1} max={365} precision={0} style={{ width: 80 }} addonAfter="天" disabled={isDetailMode} />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>內的收藏 / 下單 / 評價行為</span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>（滾動窗口，超期行為分數自動失效，保證推薦反映用戶近期偏好）</span>
              </div>
            </div>
          )}

          {/* ===== 猜你喜歡：推送規則 ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{ marginBottom: 16, padding: '14px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d46b08', marginBottom: 4 }}>推送規則</div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 14 }}>
                興趣得分達到推送閾值的店鋪，才會進入該用戶瀑布流「猜你喜歡」坑位的曝光候選集
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>推送閾值:</span>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>當店鋪興趣得分 ≥</span>
                <Form.Item name="pushThreshold" noStyle initialValue={20} rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber min={1} max={9999} precision={0} style={{ width: 100 }} addonAfter="分" disabled={isDetailMode} />
                </Form.Item>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>時，推送至瀑布流「猜你喜歡」區域展示</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#8c8c8c', paddingLeft: 108 }}>
                低於閾值的店鋪不進入曝光候選集；得分因超出有效期回落至閾值以下時，系統自動將其移出候選集。
              </div>
            </div>
          )}

          {/* ===== 猜你喜歡：算法策略（三種曝光方案可選） ===== */}
          {selectedAlgorithmType === AlgorithmType.GUESS_YOU_LIKE && (
            <div style={{
              border: '1px solid #d6e4ff',
              borderRadius: 8,
              background: '#f0f5ff',
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              {/* 標題欄 */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#1890ff',
                padding: '10px 20px',
                borderBottom: '1px solid #d6e4ff',
                background: '#e6f4ff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <SettingOutlined />
                算法策略
              </div>

              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                  <Form.Item
                    name="merchantExposureStrategy"
                    style={{ flex: 1, marginBottom: 0 }}
                    wrapperCol={{ span: 24 }}
                  >
                    <Select
                      placeholder="請選擇"
                      style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                      options={[
                        { label: '輪詢計算', value: 'random' },
                        { label: '加權隨機（輪盤賭）', value: 'weightedRandom' },
                        { label: '分數優先＋曝光衰減', value: 'scoreDecay' },
                      ]}
                      disabled={isDetailMode}
                    />
                  </Form.Item>
                </div>

                {/* 輪詢計算說明 */}
                {merchantExposureStrategy === 'random' && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                      系統自動統計該用戶興趣得分達到推送閾值的店鋪，生成店鋪 ID 列表並按順序排列，然後逐個輪播展示，確保每個達標店鋪獲得均勻的曝光機會。過程中如有新達標店鋪，系統會自動納入候選集並加入排序展示；如店鋪得分回落至閾值以下，系統會自動剔除，後續店鋪依次往前頂補位。
                    </span>
                  </div>
                )}

                {/* 加權隨機說明 */}
                {merchantExposureStrategy === 'weightedRandom' && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6 }}>
                    <div style={{ fontSize: 13, color: '#595959', lineHeight: '22px', marginBottom: 8 }}>
                      每次用戶請求到達時，在達標店鋪中按興趣得分加權隨機抽取一個店鋪展示：分數越高，被抽中概率越大，但低分達標店鋪也有曝光機會，兼顧精準度與多樣性。
                    </div>
                    <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>分配公式：</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(店鋪i) = score_i / Σ(達標店鋪得分)</span>
                      <Popover
                        trigger="click"
                        placement="right"
                        title={<span style={{ fontWeight: 600, color: '#d46b08' }}>📊 分配示例</span>}
                        content={
                          <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px' }}>
                            <div style={{ color: '#595959', marginBottom: 6 }}>
                              假設 3 個達標店鋪得分：A=60, B=30, C=20，總分=110
                            </div>
                            <div style={{ color: '#595959' }}>
                              A 曝光概率 54.5%、B 27.3%、C 18.2%
                            </div>
                            <div style={{ marginTop: 8, padding: '6px 8px', background: '#fff7e6', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                              💡 請求 1000 次時，A 約 545 次、B 約 273 次、C 約 182 次
                            </div>
                          </div>
                        }
                      >
                        <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                      </Popover>
                    </div>
                  </div>
                )}

                {/* 分數優先＋曝光衰減說明 */}
                {merchantExposureStrategy === 'scoreDecay' && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 6 }}>
                    <div style={{ fontSize: 13, color: '#595959', lineHeight: '22px', marginBottom: 8 }}>
                      每次用戶請求到達時，展示當前興趣得分最高的達標店鋪；展示後對該店鋪的曝光得分臨時乘以衰減係數（冷卻），下一次請求時次高分店鋪頂上，實現「高分優先、輪流曝光」，避免單一店鋪霸屏。冷卻僅影響曝光排序，不改變真實興趣得分。
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>曝光衰減係數:</span>
                      <Form.Item name="exposureDecayFactor" noStyle initialValue={0.7} rules={[{ required: true, message: '請輸入' }]}>
                        <InputNumber min={0.1} max={0.9} step={0.1} style={{ width: 90 }} disabled={isDetailMode} />
                      </Form.Item>
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>（每曝光一次，曝光得分 × 係數；係數越小輪換越快，冷卻僅當日生效，次日自動恢復原始得分）</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 波浪計算（僅新店廣告） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <div style={{ marginBottom: 16 }}>
              {/* 策略类型模块区域 */}
              <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fafafa', padding: '16px 20px' }}>
                <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600, color: '#262626', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span>策略類型：波浪計算</span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#d46b08' }}>⚠️ 新店週期結束後，商家將自動退出新店廣告計算範圍，不再參與新店曝光。</span>
                </div>

                {/* 默認參數說明 + 清空操作（緊鄰說明文字，便於發現） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>
                    新店週期默認 <span style={{ fontWeight: 700, color: '#E8720C' }}>{NEW_STORE_CYCLE_DAYS}</span> 天，每 <span style={{ fontWeight: 700, color: '#E8720C' }}>{WAVE_INTERVAL_DAYS}</span> 天切換一次配送範圍，共 <span style={{ fontWeight: 700, color: '#262626' }}>{waveNodes.length}</span> 個節點（按剩餘天數由多到少）
                  </span>
                  <Button size="small" danger disabled={isDetailMode} onClick={handleClearWaveNodes}>清空全部</Button>
                </div>

                {/* 波浪節點勾選矩陣：緊湊固定列寬 */}
                <div style={{ border: '1px solid #e8eaed', borderRadius: 8, overflow: 'hidden', background: '#fff', width: 'fit-content' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '90px repeat(3, 96px)',
                    background: '#f0f5ff', borderBottom: '1px solid #d6e4ff',
                    padding: '8px 16px', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1890ff' }}>剩餘天數</span>
                    {WAVE_RANGE_OPTIONS.map(opt => (
                      <span key={opt.value} style={{ fontSize: 13, fontWeight: 600, color: '#1890ff', textAlign: 'center' }}>{opt.label}</span>
                    ))}
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {waveNodes.map((node, idx) => (
                      <div key={node.day} style={{
                        display: 'grid',
                        gridTemplateColumns: '90px repeat(3, 96px)',
                        padding: '6px 16px', alignItems: 'center',
                        borderBottom: idx < waveNodes.length - 1 ? '1px solid #f0f0f0' : 'none',
                        background: node.ranges.length > 0 ? '#fffcf5' : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                        transition: 'background 0.2s',
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{node.day} 天</span>
                        {WAVE_RANGE_OPTIONS.map(opt => (
                          <div key={opt.value} style={{ textAlign: 'center' }}>
                            <Checkbox
                              checked={node.ranges.includes(opt.value)}
                              disabled={isDetailMode}
                              onChange={(e) => handleToggleWaveCell(idx, opt.value, e.target.checked)}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                  勾選各節點對應的配送範圍；點擊「清空全部」可一鍵清除所有勾選。
                </div>
              </div>
            </div>
          )}

          {/* 配送範圍計算（僅盤活復蘇） - 4 個固定參數 */}
          {selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>配送範圍計算:</span>
              <Checkbox.Group
                options={[
                  { label: '短程', value: 'short' },
                  { label: '中程', value: 'medium' },
                  { label: '遠程', value: 'long' },
                  { label: '跨橋', value: 'cross_bridge' },
                ]}
                value={reviveDeliveryRange}
                disabled={isDetailMode}
                onChange={(vals) => setReviveDeliveryRange(vals as string[])}
              />
            </div>
          )}

          {/* 區域商家展示限制（盤活復蘇 / 無敵星星） */}
          {(selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR) && (
            /* 盤活復蘇/無敵星星：區域商家展示限制 */
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR ? [
                            { label: '隨機計算', value: 'random' },
                          ] : selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD ? [
                            { label: '輪詢計算', value: 'random' },
                          ] : [
                            { label: '維度計算', value: 'merchant' },
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR
                                ? '系統自動統計各區域內購買廣告的商家，生成商家ID列表進行隨機展示。過程中如有新增購買商家，系統會自動納入隨機候選集；如有取消推廣的商家，系統會自動剔除。'
                                : '系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 按商家维度配置 */}
                      {merchantExposureStrategy === 'merchant' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffffff', border: '1px solid #e8eaed', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#1890ff', fontWeight: 600 }}>*</span> 選擇維度:
                            </span>
                            {dimensionItems.length < DIMENSION_OPTIONS.length && (
                              <>
                                <Select
                                  placeholder="選擇維度"
                                  style={{ width: 140, height: 28 }}
                                  size="small"
                                  value={selectedDimension}
                                  onChange={(val) => setSelectedDimension(val)}
                                  options={DIMENSION_OPTIONS.filter(o => !dimensionItems.find(d => d.type === o.value))}
                                  disabled={isDetailMode}
                                />
                                <Button
                                  type="dashed"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={isDetailMode || !selectedDimension}
                                  onClick={() => {
                                    if (selectedDimension) {
                                      setDimensionItems([...dimensionItems, { id: Date.now().toString(), type: selectedDimension, weight: undefined }])
                                      setSelectedDimension(undefined)
                                    }
                                  }}
                                >
                                  新增
                                </Button>
                                <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>（至少一項，多項可設置權重，權重高的優先曝光）</span>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dimensionItems.map((item, index) => {
                              const opt = DIMENSION_OPTIONS.find(o => o.value === item.type)
                              return (
                                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', padding: '10px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                                  {/* 第一行：参数名 + 描述 + 删除 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt?.label}</span>
                                    {item.type === 'orderCompletion' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        近
                                        <InputNumber
                                          min={1}
                                          max={365}
                                          value={orderCompletionDays}
                                          onChange={(val) => setOrderCompletionDays(val ?? 30)}
                                          style={{ width: 64 }}
                                          size="small"
                                          disabled={isDetailMode}
                                        />
                                        天訂單完成比例（貝葉斯平滑）
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#52c41a' }}>📊 貝葉斯平滑說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>修正完成率</strong> = (完成單數 + α) / (總單數 + β)
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • <strong>α</strong>：固定值 5，預設已完成訂單數
                                                <br />
                                                • <strong>β</strong>：固定值 10，預設總訂單數
                                                <br />
                                                • <strong>作用</strong>：單量越少，完成率越被拉向 50%，避免小樣本偏差
                                                <br />
                                                • <strong>單量越大</strong>，修正率越接近真實完成率
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f6ffed', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                例：1單完成1單 → 修正率=(1+5)/(1+10)=54.5%
                                                <br />
                                                20單完成10單 → 修正率=(10+5)/(20+10)=50%
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : item.type === 'distance' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {opt?.desc}
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#722ed1' }}>📏 距離衰減說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>距離分</strong> = e<sup>-0.1 × 距離(km)</sup>
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • 距離越近，分數越接近 1
                                                <br />
                                                • 距離越遠，分數指數衰減趨近 0
                                                <br />
                                                • <strong>衰減係數 0.1</strong>：每增加 10km，分數約下降 63%
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f9f0ff', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                1km → 0.90 &nbsp; 3km → 0.74 &nbsp; 5km → 0.61
                                                <br />
                                                8km → 0.45 &nbsp; 15km → 0.22 &nbsp; 30km → 0.05
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#722ed1', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>（{opt?.desc}）</span>
                                    )}
                                    {!isDetailMode && (
                                      <DeleteOutlined
                                        style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }}
                                        onClick={() => setDimensionItems(dimensionItems.filter((_, i) => i !== index))}
                                      />
                                    )}
                                  </div>
                                  {/* 第二行：权重滑块 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 0 }}>
                                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>權重:</span>
                                    <div className="ws-wrapper">
                                      {/* 原生滑块 + 气泡 */}
                                      <div className="ws-slider-box">
                                        {/* 气泡 - 绝对定位在滑块上方 */}
                                        <div className="ws-tooltip" style={{ left: `${((item.weight ?? 1) - 1) / 9 * 100}%`, opacity: tooltipVisible[item.id] ? 1 : 0, transition: 'opacity 0.25s ease, left 0.25s ease-out', pointerEvents: 'none' }}>
                                          <div className="ws-tooltip-box">{item.weight ?? 1}</div>
                                          <div className="ws-tooltip-arrow" />
                                        </div>
                                        <div className="ws-rail">
                                          <div className="ws-fill" style={{ width: `${((item.weight ?? 1) - 1) / 9 * 100}%` }} />
                                        </div>
                                        <input
                                          type="range"
                                          className="ws-input"
                                          min={1}
                                          max={10}
                                          value={item.weight ?? 1}
                                          disabled={isDetailMode}
                                          onMouseDown={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onMouseUp={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onTouchStart={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onTouchEnd={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onChange={(e) => {
                                            const val = Number(e.target.value)
                                            const newItems = [...dimensionItems]
                                            newItems[index].weight = val
                                            setDimensionItems(newItems)
                                          }}
                                        />
                                      </div>
                                      {/* 刻度 */}
                                      <div className="ws-ticks">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                          <div key={n} className="ws-tick">
                                            <div className={`ws-tick-bar ${n <= (item.weight ?? 1) ? 'on' : ''}`} />
                                            <span className={`ws-tick-num ${n === (item.weight ?? 1) ? 'on' : ''}`}>{n}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 计算公式 */}
                          <div style={{ marginTop: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>計算公式：</div>
                                <div>最終得分 = (質量分/5 × W₁) + (修正完成率 × W₂) + (扶持分 × W₃) + (距離分 × W₄)</div>
                                <div style={{ marginTop: 4, color: '#8c8c8c' }}>扶持分 = max(0, (8-首投天數)/7)；距離分 = e^(-0.1×距離km)</div>
                              </div>
                              <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', paddingLeft: 16 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#52c41a' }}>示例：</div>
                                <div style={{ marginBottom: 8 }}>假設權重：W₁=6, W₂=3, W₃=1, W₄=4（α=5, β=10 固定）</div>
                                <div style={{ display: 'flex', gap: 16 }}>
                                  <div style={{ flex: 1 }}>
                                    <div>商家A：質量4分 + 20單完成10單 + 首投15天 + 距離2km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(10+5)/(20+10)=50%，距離分=e^(-0.1×2)=0.82</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.8×6 + 0.5×3 + 0×1 + 0.82×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>9.58</span></div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div>商家B：質量3分 + 1單完成1單 + 首投2天 + 距離8km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(1+5)/(1+10)=54.5%，距離分=e^(-0.1×8)=0.45</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.6×6 + 0.545×3 + 0.857×1 + 0.45×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>7.7</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 曝光分配策略 */}
                            <div style={{ padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: '#d46b08', fontSize: 12 }}>
                                🎯 曝光分配策略：加權隨機（輪盤賭）
                              </div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                                單坑位場景下，每次用戶請求到達時，按商家得分權重隨機抽取一個商家展示。分數越高，被抽中概率越大，但低分商家也有機會曝光。
                              </div>
                              <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>分配公式：</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(商家i) = score_i / Σ(所有商家得分)</span>
                                  <Popover
                                    trigger="click"
                                    placement="right"
                                    title={<span style={{ fontWeight: 600, color: '#d46b08' }}>📊 分配示例</span>}
                                    content={
                                      <div style={{ maxWidth: 320, fontSize: 12 }}>
                                        <div style={{ color: '#595959', marginBottom: 8 }}>
                                          假設 5 個商家得分：A=6, B=7, C=10, D=5, E=9.5，總分=37.5
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                          {[
                                            { name: 'C', score: 10, color: '#1890ff' },
                                            { name: 'E', score: 9.5, color: '#722ed1' },
                                            { name: 'B', score: 7, color: '#52c41a' },
                                            { name: 'A', score: 6, color: '#fa8c16' },
                                            { name: 'D', score: 5, color: '#eb2f96' },
                                          ].map(m => (
                                            <div key={m.name} style={{ flex: '1 1 70px', padding: '4px 6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                                              <div style={{ fontWeight: 600, color: m.color, fontSize: 12 }}>商家{m.name}</div>
                                              <div style={{ fontSize: 10, color: '#8c8c8c' }}>得分 {m.score}</div>
                                              <div style={{ fontSize: 11, fontWeight: 600, color: '#595959' }}>{(m.score / 37.5 * 100).toFixed(1)}%</div>
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '18px', padding: '4px 6px', background: '#f6ffed', borderRadius: 4 }}>
                                          💡 長期效果：請求 1000 次，C 約 267 次，E 約 253 次，B 約 187 次，A 約 160 次，D 約 133 次
                                        </div>
                                      </div>
                                    }
                                  >
                                    <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                                  </Popover>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
            </div>


          )}

          {/* ===== 獨家商家：計算訂單類型（獨立模塊） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>計算訂單類型:</span>
                <Form.Item name="orderTypeDelivery" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>配送訂單</Checkbox>
                </Form.Item>
                <Form.Item name="orderTypePickup" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>自取訂單</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  請選擇參與成交量統計的訂單履約方式，以保障商家訂單成交量統計的準確性
                </span>
              </div>
              {/* 店鋪等級保障單量配置（樣式與品牌商家店鋪等級配置保持一致） */}
              <div style={{ marginTop: 12, padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 4 }}>店鋪等級保障單量</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
                  按店鋪等級單獨配置保障單量：當用戶在該門店的下單數量達到所配置單量時，該門店將不再在獨家區域展示
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {STORE_LEVEL_BLOCK_OPTIONS.map(({ level, label, color, defaultOrders }) => (
                    <div key={level} style={{
                      background: '#fff',
                      border: `1px solid ${color}33`,
                      borderTop: `3px solid ${color}`,
                      borderRadius: 8,
                      padding: '12px 12px 14px',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <span style={{
                          padding: '0 12px', height: 24, lineHeight: '24px', borderRadius: 12,
                          fontSize: 13, fontWeight: 700, color: '#fff',
                          background: color, display: 'inline-block', whiteSpace: 'nowrap',
                        }}>{label}</span>
                      </div>
                      <Form.Item name={['levelBlockOrders', level]} noStyle initialValue={defaultOrders}>
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                          addonAfter="單"
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== 獨家商家：算法策略（獨立模塊，與盤活復蘇/無敵星星互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* ===== 品牌商家(KA)：流量曝光保障（獨立模塊，互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT && (
            <div style={{ marginBottom: 16 }}>
              {/* 店鋪等級保障流量配置 */}
              <div style={{ padding: '14px 16px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                {/* 標題區：明確提示這是店鋪等級配置 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(232,114,12,0.12)', color: '#E8720C', fontSize: 14,
                  }}>
                    <ShopOutlined />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>店鋪等級保障流量</span>
                  <span style={{
                    padding: '0 8px', height: 20, lineHeight: '20px', borderRadius: 10,
                    fontSize: 11, fontWeight: 500, color: '#E8720C',
                    background: 'rgba(232,114,12,0.08)', border: '1px solid rgba(232,114,12,0.3)',
                  }}>按店鋪等級配置</span>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12, paddingLeft: 36 }}>
                  店鋪等級不一樣，保障的流量不一樣：按店鋪等級單獨配置保障曝光流量，等級越高保障曝光越多
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {STORE_LEVEL_BLOCK_OPTIONS.map(({ level, label, color, defaultOrders }) => (
                    <div key={level} style={{
                      background: '#fff',
                      border: `1px solid ${color}33`,
                      borderTop: `3px solid ${color}`,
                      borderRadius: 8,
                      padding: '12px 12px 14px',
                      textAlign: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <span style={{
                          padding: '0 12px', height: 24, lineHeight: '24px', borderRadius: 12,
                          fontSize: 13, fontWeight: 700, color: '#fff',
                          background: color, display: 'inline-block', whiteSpace: 'nowrap',
                        }}>{label}</span>
                      </div>
                      <Form.Item name={['brandLevelTraffic', level]} noStyle initialValue={defaultOrders * 100}>
                        <InputNumber
                          min={1}
                          precision={0}
                          style={{ width: '100%' }}
                          addonAfter="次"
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== 品牌商家(KA)：算法策略（獨立模塊，複製自獨家商家，互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.BRAND_MERCHANT && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* ===== 人氣商家：算法策略（僅輪詢計算） ===== */}
          {selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>大小圖展示策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* 新店廣告：算法策略（波浪計算 + 輪詢曝光） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <div style={{
              border: '1px solid #d6e4ff',
              borderRadius: 8,
              background: '#f0f5ff',
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              {/* 標題欄 */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#1890ff',
                padding: '10px 20px',
                borderBottom: '1px solid #d6e4ff',
                background: '#e6f4ff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <SettingOutlined />
                算法策略
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* 商家曝光策略 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                  <Select
                    value="roundRobin"
                    style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                    options={[{ label: '輪詢計算', value: 'roundRobin' }]}
                    disabled={isDetailMode}
                  />
                </div>

                {/* 輪詢說明 */}
                <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                  <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                    系統自動統計各區域內符合新店週期的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保每位新店商家獲得均勻的曝光機會。過程中如有新開業商家，系統會自動納入候選集；如商家新店週期結束或取消推廣，系統會自動剔除，後續商家依次往前頂補位。
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : selectedAlgorithmType ? (
        /* 其它算法类型：显示提示 */
        <div style={{ border: '1px solid #ffe58f', borderRadius: 8, background: '#fffbe6', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#8c8c8c'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
              暫無參數配置
            </div>
            <div style={{ fontSize: 14 }}>
              當前廣告類型暫未開放參數配置，請聯繫管理員
            </div>
          </div>
        </div>
      ) : (
        /* 未选择算法类型：显示提示 */
        <div style={{ border: '1px solid #d6e4ff', borderRadius: 8, background: '#f0f5ff', padding: '20px 24px', marginBottom: 16 }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#595959'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👆</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#1890ff' }}>
              請先選擇廣告類型
            </div>
            <div style={{ fontSize: 14 }}>
              選擇廣告類型後，將顯示對應的參數配置項
            </div>
          </div>
        </div>
      )}

      </Form>

      {/* 底部操作按鈕（取消/保存） */}
      {selectedAlgorithmType && !isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>取消</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
          >
            保存
          </Button>
        </div>
      )}

      {/* 商家选择弹窗 */}
      <Modal
        title="選擇商家"
        open={merchantModalVisible}
        onOk={handleConfirmMerchants}
        onCancel={handleCloseMerchantModal}
        width={900}
        okText="確認選擇"
        cancelText="取消"
      >
        <Table
          rowKey="id"
          columns={merchantColumns}
          dataSource={mockMerchants}
          rowSelection={{
            selectedRowKeys: selectedMerchants,
            onChange: (selectedRowKeys: React.Key[]) => {
              setSelectedMerchants(selectedRowKeys as string[])
            },
          }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
          }}
        />
      </Modal>
    </div>
  )
}
