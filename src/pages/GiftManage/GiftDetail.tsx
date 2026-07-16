import { useState } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, InputNumber, message, Popconfirm } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  MinusCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'

const { RangePicker } = DatePicker

/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '無敵星星', value: 'invincible_star' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '推廣通', value: 'promotion' },
]

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 狀態 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '有效', value: 'active' },
  { label: '已扣除', value: 'deducted' },
  { label: '已過期', value: 'expired' },
]

const adTypeMap: Record<string, string> = {
  invincible_star: '無敵星星',
  revival: '盤活復蘇',
  promotion: '推廣通',
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }

const statusMap: Record<string, string> = {
  active: '有效',
  deducted: '已扣除',
  expired: '已過期',
}

const statusColorMap: Record<string, string> = {
  active: 'success',
  deducted: 'default',
  expired: 'warning',
}

interface GiftDetailRecord {
  key: string
  merchantId: string
  merchantName: string
  brand: string
  adType: string
  totalDays: number
  usedDays: number
  remainingDays: number
  giftTime: string
  expireTime: string
  status: string
  reason: string
}

/** Mock 數據 */
const mockData: GiftDetailRecord[] = [
  {
    key: '1',
    merchantId: 'M001',
    merchantName: '美味餐廳',
    brand: 'mFood',
    adType: 'invincible_star',
    totalDays: 30,
    usedDays: 12,
    remainingDays: 18,
    giftTime: '2024-01-15',
    expireTime: '2024-07-15',
    status: 'active',
    reason: '新商戶入駐扶持',
  },
  {
    key: '2',
    merchantId: 'M002',
    merchantName: '生鮮超市',
    brand: 'flashBee',
    adType: 'revival',
    totalDays: 60,
    usedDays: 60,
    remainingDays: 0,
    giftTime: '2023-10-01',
    expireTime: '2024-04-01',
    status: 'deducted',
    reason: '商戶盤活復蘇計劃',
  },
  {
    key: '3',
    merchantId: 'M003',
    merchantName: '時尚百貨',
    brand: 'mFood',
    adType: 'promotion',
    totalDays: 90,
    usedDays: 45,
    remainingDays: 45,
    giftTime: '2024-01-01',
    expireTime: '2024-12-31',
    status: 'active',
    reason: '大促活動支持',
  },
  {
    key: '4',
    merchantId: 'M004',
    merchantName: '速遞物流',
    brand: 'flashBee',
    adType: 'invincible_star',
    totalDays: 15,
    usedDays: 0,
    remainingDays: 15,
    giftTime: '2023-06-01',
    expireTime: '2023-12-01',
    status: 'expired',
    reason: '合作夥伴獎勵',
  },
]

export default function GiftDetail() {
  const [form] = Form.useForm()
  const [deductModalVisible, setDeductModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
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
    setCurrentRecord(record)
    setDetailModalVisible(true)
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
      title: '商戶ID',
      dataIndex: 'merchantId',
      key: 'merchantId',
      width: 100,
    },
    {
      title: '商戶名稱',
      dataIndex: 'merchantName',
      key: 'merchantName',
      width: 150,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (brand: string) => brandMap[brand] || brand,
    },
    {
      title: '廣告類型',
      dataIndex: 'adType',
      key: 'adType',
      width: 120,
      render: (adType: string) => adTypeMap[adType] || adType,
    },
    {
      title: '總贈送天數',
      dataIndex: 'totalDays',
      key: 'totalDays',
      width: 110,
      render: (days: number) => `${days} 天`,
    },
    {
      title: '已使用天數',
      dataIndex: 'usedDays',
      key: 'usedDays',
      width: 110,
      render: (days: number) => `${days} 天`,
    },
    {
      title: '剩餘天數',
      dataIndex: 'remainingDays',
      key: 'remainingDays',
      width: 110,
      render: (days: number) => (
        <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
          {days} 天
        </span>
      ),
    },
    {
      title: '贈送時間',
      dataIndex: 'giftTime',
      key: 'giftTime',
      width: 120,
    },
    {
      title: '過期時間',
      dataIndex: 'expireTime',
      key: 'expireTime',
      width: 120,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColorMap[status]}>
          {statusMap[status] || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            詳情
          </Button>
          {record.status === 'active' && record.remainingDays > 0 && (
            <Button type="link" size="small" danger icon={<MinusCircleOutlined />} onClick={() => handleDeduct(record)}>
              扣除
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面標題 */}
      <div style={{
        background: '#fff',
        marginBottom: 16,
        padding: '16px 20px',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#262626' }}>
          贈送明細
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8C8C8C' }}>
          查看商戶廣告贈送數據，支持扣除操作
        </p>
      </div>

      {/* 搜索區域 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ width: '100%' }}>
          <Form.Item name="merchantId" label="商戶ID">
            <Input placeholder="請輸入商戶ID" allowClear />
          </Form.Item>
          <Form.Item name="merchantName" label="商戶名稱">
            <Input placeholder="請輸入商戶名稱" allowClear />
          </Form.Item>
          <Form.Item name="brand" label="所屬品牌">
            <Select placeholder="全部" allowClear options={brandOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select placeholder="全部" allowClear options={adTypeOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="狀態">
            <Select placeholder="全部" allowClear options={statusOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="dateRange" label="贈送時間">
            <RangePicker style={{ width: '100%' }} />
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
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ExportOutlined />} onClick={handleExport}>
          導出
        </Button>
      </div>

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 條`,
          pageSize: 10,
        }}
        scroll={{ x: 1400 }}
      />

      {/* 詳情彈窗 */}
      <Modal
        title="贈送詳情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            關閉
          </Button>,
        ]}
        width={600}
      >
        {currentRecord && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>商戶ID</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.merchantId}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>商戶名稱</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.merchantName}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>所屬品牌</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{brandMap[currentRecord.brand]}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>廣告類型</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{adTypeMap[currentRecord.adType]}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>總贈送天數</div>
                <div style={{ fontSize: 14, color: '#262626', fontWeight: 600 }}>{currentRecord.totalDays} 天</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>已使用天數</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.usedDays} 天</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>剩餘天數</div>
                <div style={{ fontSize: 16, color: currentRecord.remainingDays > 0 ? '#52C41A' : '#8C8C8C', fontWeight: 700 }}>
                  {currentRecord.remainingDays} 天
                </div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>狀態</div>
                <Tag color={statusColorMap[currentRecord.status]}>
                  {statusMap[currentRecord.status]}
                </Tag>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>贈送時間</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.giftTime}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>過期時間</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.expireTime}</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>贈送原因</div>
              <div style={{ fontSize: 14, color: '#262626', padding: '8px 12px', background: '#FAFAFA', borderRadius: 6 }}>
                {currentRecord.reason}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 扣除彈窗 */}
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
                <span>商戶：</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{currentRecord.merchantName}</span>
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
