import { useEffect } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Space, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AppType, AlgorithmType, RecommendChannel, ServiceStatus,
  APP_OPTIONS, SERVICE_STATUS_OPTIONS,
} from './constants'

const CHANNEL_OPTIONS = [
  { label: '大首頁瀑布流', value: RecommendChannel.HOME },
  { label: '外賣頻道瀑布流', value: RecommendChannel.DELIVERY },
  { label: '團購頻道瀑布流', value: RecommendChannel.GROUP_BUY },
  { label: '超市頻道瀑布流', value: RecommendChannel.SUPERMARKET },
]

const ALGORITHM_OPTIONS = [
  { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
  { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
  { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
  { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
  { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
  { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
  { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
  { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
]

// Mock 数据（与 Pricing 列表页一致）
interface PricingRecord {
  id: number
  app: AppType
  channel: RecommendChannel
  slotIndex: number
  algorithmType: AlgorithmType
  region: string
  dailyPrice: number
  minDays: number
  discountTiers: string
  status: ServiceStatus
}

const mockData: PricingRecord[] = [
  { id: 1, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 1, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '澳門', dailyPrice: 2800, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 2, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 1, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '氹仔', dailyPrice: 1800, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 3, app: AppType.MFOOD, channel: RecommendChannel.SUPERMARKET, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '珠海', dailyPrice: 1200, minDays: 1, discountTiers: '30天75折', status: ServiceStatus.ENABLED },
  { id: 4, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 2, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 2500, minDays: 7, discountTiers: '7天9折 / 30天85折', status: ServiceStatus.ENABLED },
  { id: 5, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 1, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', dailyPrice: 1500, minDays: 5, discountTiers: '15天8折', status: ServiceStatus.ENABLED },
  { id: 6, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 3, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 2200, minDays: 7, discountTiers: '30天8折', status: ServiceStatus.DISABLED },
  { id: 7, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 3, algorithmType: AlgorithmType.ORGANIC_TRAFFIC, region: '珠海', dailyPrice: 800, minDays: 1, discountTiers: '无折扣', status: ServiceStatus.ENABLED },
  { id: 8, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 1, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '澳門', dailyPrice: 1600, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 9, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 2, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '氹仔', dailyPrice: 2000, minDays: 7, discountTiers: '15天85折 / 30天75折', status: ServiceStatus.ENABLED },
  { id: 10, app: AppType.SHANFENG, channel: RecommendChannel.GROUP_BUY, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '澳門', dailyPrice: 1400, minDays: 5, discountTiers: '30天8折', status: ServiceStatus.ENABLED },
  { id: 11, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 4, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '珠海', dailyPrice: 2600, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 12, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 3, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 1100, minDays: 3, discountTiers: '15天85折', status: ServiceStatus.DISABLED },
  { id: 13, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 3, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', dailyPrice: 1300, minDays: 5, discountTiers: '30天75折', status: ServiceStatus.ENABLED },
  { id: 14, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 5, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 3000, minDays: 7, discountTiers: '15天8折 / 30天7折', status: ServiceStatus.ENABLED },
  { id: 15, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 4, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '珠海', dailyPrice: 1700, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
]

export default function PricingAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'
  const isEditMode = !!editId && !isDetailMode

  const [form] = Form.useForm()

  // 加载数据
  useEffect(() => {
    if (editId) {
      const record = mockData.find(item => item.id === Number(editId))
      if (record) {
        form.setFieldsValue({
          app: record.app,
          channel: record.channel,
          slotIndex: record.slotIndex,
          algorithmType: record.algorithmType,
          region: record.region,
          dailyPrice: record.dailyPrice,
          minDays: record.minDays,
          discountTiers: record.discountTiers,
          status: record.status,
        })
      }
    }
  }, [editId, form])

  const pageTitle = isDetailMode
    ? '價格詳情'
    : isEditMode
      ? '編輯價格'
      : '新增價格'

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success('保存成功')
      navigate('/recommend-pricing')
    })
  }

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/recommend-pricing')}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }}
            >
              返回
            </Button>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
              {pageTitle}
            </h2>
          </div>
          {!isDetailMode && (
            <Space size={12}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
              >
                保存
              </Button>
            </Space>
          )}
        </div>
      </Card>

      {/* 表单区域 */}
      <Card
        title="價格配置"
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Form
          form={form}
          layout="vertical"
          disabled={isDetailMode}
          style={{ maxWidth: 800 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="所屬品牌"
              name="app"
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
            >
              <Select placeholder="請選擇" options={APP_OPTIONS} />
            </Form.Item>

            <Form.Item
              label="業務頻道"
              name="channel"
              rules={[{ required: true, message: '請選擇業務頻道' }]}
            >
              <Select placeholder="請選擇" options={CHANNEL_OPTIONS} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="廣告類型"
              name="algorithmType"
              rules={[{ required: true, message: '請選擇廣告類型' }]}
            >
              <Select placeholder="請選擇" options={ALGORITHM_OPTIONS} />
            </Form.Item>

            <Form.Item
              label="坑位序號"
              name="slotIndex"
              rules={[{ required: true, message: '請輸入坑位序號' }]}
            >
              <InputNumber placeholder="請輸入" min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="區域"
              name="region"
              rules={[{ required: true, message: '請輸入區域' }]}
            >
              <Input placeholder="請輸入區域" />
            </Form.Item>

            <Form.Item
              label="單日單價 (MOP)"
              name="dailyPrice"
              rules={[{ required: true, message: '請輸入單日單價' }]}
            >
              <InputNumber placeholder="請輸入" min={0} style={{ width: '100%' }} addonAfter="MOP" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="最低購買天數"
              name="minDays"
              rules={[{ required: true, message: '請輸入最低購買天數' }]}
            >
              <InputNumber placeholder="請輸入" min={1} style={{ width: '100%' }} addonAfter="天" />
            </Form.Item>

            <Form.Item
              label="折扣階梯"
              name="discountTiers"
            >
              <Input placeholder="如：7天9折 / 30天8折" />
            </Form.Item>
          </div>

          <Form.Item
            label="狀態"
            name="status"
            rules={[{ required: true, message: '請選擇狀態' }]}
          >
            <Select placeholder="請選擇" options={SERVICE_STATUS_OPTIONS} style={{ width: 200 }} />
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
