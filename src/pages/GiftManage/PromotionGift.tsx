import { useState } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, Upload, message, InputNumber } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  UploadOutlined,
  SendOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

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

/** 申請狀態 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待審批', value: 'pending' },
  { label: '已通過', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
]

const adTypeMap: Record<string, string> = {
  invincible_star: '無敵星星',
  revival: '盤活復蘇',
  promotion: '推廣通',
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }

const statusMap: Record<string, string> = {
  pending: '待審批',
  approved: '已通過',
  rejected: '已駁回',
}

const statusColorMap: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
}

interface GiftRecord {
  key: string
  merchantId: string
  merchantName: string
  brand: string
  adType: string
  giftDays: number
  reason: string
  applicant: string
  applyTime: string
  status: string
}

/** Mock 數據 */
const mockData: GiftRecord[] = [
  {
    key: '1',
    merchantId: 'M001',
    merchantName: '美味餐廳',
    brand: 'mFood',
    adType: 'invincible_star',
    giftDays: 7,
    reason: '新商戶入駐扶持',
    applicant: '張三',
    applyTime: '2024-01-15 10:30:00',
    status: 'approved',
  },
  {
    key: '2',
    merchantId: 'M002',
    merchantName: '生鮮超市',
    brand: 'flashBee',
    adType: 'revival',
    giftDays: 14,
    reason: '商戶盤活復蘇計劃',
    applicant: '李四',
    applyTime: '2024-01-16 14:20:00',
    status: 'pending',
  },
  {
    key: '3',
    merchantId: 'M003',
    merchantName: '時尚百貨',
    brand: 'mFood',
    adType: 'promotion',
    giftDays: 30,
    reason: '大促活動支持',
    applicant: '王五',
    applyTime: '2024-01-17 09:15:00',
    status: 'rejected',
  },
]

export default function PromotionGift() {
  const [form] = Form.useForm()
  const [modalForm] = Form.useForm()
  const [modalVisible, setModalVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dataSource] = useState<GiftRecord[]>(mockData)

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

  const handleAdd = () => {
    modalForm.resetFields()
    setModalVisible(true)
  }

  const handleModalOk = async () => {
    try {
      await modalForm.validateFields()
      const values = modalForm.getFieldsValue()
      console.log('提交贈送申請:', values)
      message.success('贈送申請已提交，等待審批')
      setModalVisible(false)
    } catch (error) {
      console.error('表單驗證失敗:', error)
    }
  }

  const handleModalCancel = () => {
    setModalVisible(false)
  }

  const columns: TableColumnsType<GiftRecord> = [
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
      title: '贈送天數',
      dataIndex: 'giftDays',
      key: 'giftDays',
      width: 100,
      render: (days: number) => `${days} 天`,
    },
    {
      title: '贈送原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      ellipsis: true,
    },
    {
      title: '申請人',
      dataIndex: 'applicant',
      key: 'applicant',
      width: 100,
    },
    {
      title: '申請時間',
      dataIndex: 'applyTime',
      key: 'applyTime',
      width: 180,
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
          推廣贈送
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8C8C8C' }}>
          為商戶贈送廣告推廣天數，支持無敵星星、盤活復蘇等廣告類型
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
          <Form.Item className="search-actions">
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
              >
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
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAdd}
        >
          新增贈送
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
        scroll={{ x: 1200 }}
      />

      {/* 新增贈送彈窗 */}
      <Modal
        title="新增推廣贈送"
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText="提交申請"
        cancelText="取消"
        width={600}
        okButtonProps={{ icon: <SendOutlined /> }}
      >
        <Form
          form={modalForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="merchantId"
            label="商戶ID"
            rules={[{ required: true, message: '請輸入商戶ID' }]}
          >
            <Input placeholder="請輸入商戶ID" />
          </Form.Item>

          <Form.Item
            name="brand"
            label="所屬品牌"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              placeholder="請選擇所屬品牌"
              options={brandOptions.filter(o => o.value !== 'all')}
            />
          </Form.Item>

          <Form.Item
            name="adType"
            label="廣告類型"
            rules={[{ required: true, message: '請選擇廣告類型' }]}
          >
            <Select
              placeholder="請選擇廣告類型"
              options={adTypeOptions.filter(o => o.value !== 'all')}
            />
          </Form.Item>

          <Form.Item
            name="giftDays"
            label="贈送天數"
            rules={[{ required: true, message: '請輸入贈送天數' }]}
          >
            <InputNumber
              placeholder="請輸入贈送天數"
              min={1}
              max={365}
              style={{ width: '100%' }}
              addonAfter="天"
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="贈送原因"
            rules={[{ required: true, message: '請輸入贈送原因' }]}
          >
            <TextArea
              placeholder="請輸入贈送原因，例如：新商戶入駐扶持、商戶盤活復蘇計劃等"
              rows={3}
              maxLength={200}
              showCount
            />
          </Form.Item>

          <Form.Item
            name="certificate"
            label="申請憑證"
            rules={[{ required: true, message: '請上傳申請憑證' }]}
          >
            <Upload
              beforeUpload={() => false}
              maxCount={3}
              accept="image/*,.pdf"
            >
              <Button icon={<UploadOutlined />}>上傳憑證</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
