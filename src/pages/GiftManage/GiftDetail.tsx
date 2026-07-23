import { useState } from 'react'
import { Button, Space, Input, Select, Table, Modal, Form, InputNumber, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'


/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家(KA)', value: 'ka' },
]

const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家(KA)',
}


interface GiftDetailRecord {
  key: string
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  brand: string
  adType: string
  totalDays: number
  validDays: number
  usedDays: number
  remainingDays: number
  giftTime: string
  expireTime: string
  status: string
  reason: string
  applicant?: string
  applyTime?: string
}

/** Mock 數據 */
const mockData: GiftDetailRecord[] = [
  {
    key: '1',
    groupId: 'G001',
    groupName: '美味餐廳集團',
    storeId: 'S1001',
    storeName: '澳門總店',
    brand: '2',
    adType: 'new_store',
    totalDays: 30,
    validDays: 180,
    usedDays: 12,
    remainingDays: 18,
    giftTime: '2024-01-15',
    expireTime: '2024-07-15',
    status: 'active',
    reason: '新集團入駐扶持',
    applicant: '張三',
    applyTime: '2024-01-15 10:30:00',
  },
  {
    key: '2',
    groupId: 'G002',
    groupName: '生鮮超市集團',
    storeId: 'S1002',
    storeName: '氹仔分店',
    brand: '1',
    adType: 'gold',
    totalDays: 60,
    validDays: 180,
    usedDays: 60,
    remainingDays: 0,
    giftTime: '2023-10-01',
    expireTime: '2024-04-01',
    status: 'deducted',
    reason: '集團盤活復蘇計劃',
    applicant: '李四',
    applyTime: '2023-10-01 14:20:00',
  },
  {
    key: '3',
    groupId: 'G003',
    groupName: '時尚百貨集團',
    storeId: 'S1003',
    storeName: '新馬路店',
    brand: '2',
    adType: 'exclusive',
    totalDays: 90,
    validDays: 365,
    usedDays: 45,
    remainingDays: 45,
    giftTime: '2024-01-01',
    expireTime: '2024-12-31',
    status: 'active',
    reason: '大促活動支持',
    applicant: '王五',
    applyTime: '2024-01-01 09:15:00',
  },
  {
    key: '4',
    groupId: 'G004',
    groupName: '速遞物流集團',
    storeId: 'S1004',
    storeName: '黑沙環店',
    brand: '1',
    adType: 'new_store',
    totalDays: 15,
    validDays: 90,
    usedDays: 0,
    remainingDays: 15,
    giftTime: '2023-06-01',
    expireTime: '2023-12-01',
    status: 'expired',
    reason: '合作夥伴獎勵',
    applicant: '趙六',
    applyTime: '2023-06-01 11:00:00',
  },
  {
    key: '5',
    groupId: 'G005',
    groupName: '甜品屋集團',
    storeId: 'S1005',
    storeName: '官也街老店',
    brand: '2',
    adType: 'new_store',
    totalDays: 7,
    validDays: 30,
    usedDays: 0,
    remainingDays: 0,
    giftTime: '-',
    expireTime: '-',
    status: 'pending',
    reason: '新集團開業扶持',
    applicant: '關羽',
    applyTime: '2024-01-20 16:30:00',
  },
  {
    key: '6',
    groupId: 'G006',
    groupName: '火鍋城集團',
    storeId: 'S1006',
    storeName: '珠海旗艦店',
    brand: '1',
    adType: 'ka',
    totalDays: 14,
    validDays: 60,
    usedDays: 0,
    remainingDays: 0,
    giftTime: '-',
    expireTime: '-',
    status: 'rejected',
    reason: '集團盤活復蘇計劃',
    applicant: '張飛',
    applyTime: '2024-01-18 09:45:00',
  },
]

export default function GiftDetail() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [deductModalVisible, setDeductModalVisible] = useState(false)
  const [currentRecord, setCurrentRecord] = useState<GiftDetailRecord | null>(null)
  const [deductForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource] = useState<GiftDetailRecord[]>(mockData)

  const handleSearch = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      message.success('查詢完成')
    }, 500)
  }

  const handleReset = () => {
    form.resetFields()
  }

  const handleExport = () => {
    message.success('導出功能開發中...')
  }

  const handleViewDetail = (record: GiftDetailRecord) => {
    navigate(`/gift-detail-view?key=${record.key}`)
  }

  const handleAdd = () => {
    navigate('/gift-add')
  }

  const handleGift = (record: GiftDetailRecord) => {
    const params = new URLSearchParams({
      mode: 'gift',
      group: `${record.groupId} - ${record.groupName}`,
      store: `${record.storeId} - ${record.storeName}`,
      brand: record.brand,
      adType: record.adType,
    })
    navigate(`/gift-add?${params.toString()}`)
  }

  const handleDeduct = (record: GiftDetailRecord) => {
    setCurrentRecord(record)
    deductForm.resetFields()
    setDeductModalVisible(true)
  }

  const handleDeductOk = async () => {
    try {
      await deductForm.validateFields()
      const values = deductForm.getFieldsValue()
      console.log('扣除操作:', { record: currentRecord, ...values })
      message.success('扣除成功')
      setDeductModalVisible(false)
    } catch (error) {
      console.error('表單驗證失敗:', error)
    }
  }

  const columns: TableColumnsType<GiftDetailRecord> = [
    {
      title: '集團ID/集團名稱',
      key: 'groupInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.groupId}</span>
          <span>{record.groupName}</span>
        </Space>
      ),
    },
    {
      title: '門店ID/門店名稱',
      key: 'storeInfo',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{record.storeId}</span>
          <span>{record.storeName}</span>
        </Space>
      ),
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => <BrandTag value={brand} />,
    },
    {
      title: '廣告類型',
      dataIndex: 'adType',
      key: 'adType',
      width: 110,
      render: (adType: string) => adTypeMap[adType] || adType,
    },

    {
      title: '剩餘天數',
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 100,
      render: (days: number) => (
        <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
          {days} 天
        </span>
      ),
    },

    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            贈送明細
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleGift(record)}
          >
            贈送
          </Button>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('gift-detail', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])
  const configuredColumns = applyConfig(columns)

  return (
    <div className="content-area">
      {/* 搜索區域 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ width: '100%' }}>
          <Form.Item name="groupInfo" label="集團ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'G001 - 美味餐廳集團', value: 'G001' },
                { label: 'G002 - 生鮮超市集團', value: 'G002' },
                { label: 'G003 - 時尚百貨集團', value: 'G003' },
                { label: 'G004 - 速遞物流集團', value: 'G004' },
                { label: 'G005 - 甜品屋集團', value: 'G005' },
                { label: 'G006 - 火鍋城集團', value: 'G006' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="storeInfo" label="門店ID/名稱">
            <Select
              placeholder="支持ID和名稱搜索查詢"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'S1001 - 澳門總店', value: 'S1001' },
                { label: 'S1002 - 氹仔分店', value: 'S1002' },
                { label: 'S1003 - 新馬路店', value: 'S1003' },
                { label: 'S1004 - 黑沙環店', value: 'S1004' },
                { label: 'S1005 - 官也街老店', value: 'S1005' },
                { label: 'S1006 - 珠海旗艦店', value: 'S1006' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="brand" label="所屬品牌">
            <Select placeholder="全部" allowClear options={brandOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select placeholder="全部" allowClear options={adTypeOptions} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item className="search-actions">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 操作按鈕 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增贈送
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table
        columns={configuredColumns}
        dataSource={dataSource}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 條`,
          pageSize: 10,
        }}
        scroll={{ x: 1500 }}
      />

      {/* 扣除彈窗（保留，扣除操作仍在列表頁進行） */}
      <Modal
        title="扣除贈送天數"
        open={deductModalVisible}
        onOk={handleDeductOk}
        onCancel={() => setDeductModalVisible(false)}
        okText="確認扣除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={500}
      >
        {currentRecord && (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: '12px 16px', background: '#FFF7E6', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#595959' }}>
                <span>集團：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{currentRecord.groupName}</span>
                <span style={{ margin: '0 12px' }}>|</span>
                <span>廣告類型：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{adTypeMap[currentRecord.adType]}</span>
              </div>
              <div style={{ fontSize: 13, color: '#595959', marginTop: 8 }}>
                <span>剩餘天數：</span>
                <span style={{ color: '#52C41A', fontWeight: 700, fontSize: 16 }}>{currentRecord.remainingDays} 天</span>
              </div>
            </div>
            <Form form={deductForm} layout="vertical">
              <Form.Item
                name="deductDays"
                label="扣除天數"
                rules={[
                  { required: true, message: '請輸入扣除天數' },
                  {
                    type: 'number',
                    min: 1,
                    max: currentRecord.remainingDays,
                    message: `扣除天數不能超過 ${currentRecord.remainingDays} 天`,
                  },
                ]}
              >
                <InputNumber
                  placeholder="請輸入扣除天數"
                  min={1}
                  max={currentRecord.remainingDays}
                  style={{ width: '100%' }}
                  addonAfter="天"
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label="扣除原因"
                rules={[{ required: true, message: '請輸入扣除原因' }]}
              >
                <Input.TextArea
                  placeholder="請輸入扣除原因"
                  rows={3}
                  maxLength={200}
                  showCount
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  )
}
