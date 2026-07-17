import { useState, useEffect } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, InputNumber, message, Popconfirm, Upload, Radio } from 'antd'
import type { TableColumnsType } from 'antd'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions, BRAND_SHANFENG_LABEL } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  UploadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

/** 廣告類型 */
const adTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家(KA)', value: 'ka' },
]

/** 狀態（含審批流程狀態） */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待審批', value: 'pending' },
  { label: '已通過', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
  { label: '有效', value: 'active' },
  { label: '已扣除', value: 'deducted' },
  { label: '已過期', value: 'expired' },
]

const adTypeMap: Record<string, string> = {
  new_store: '新店廣告',
  revival: '盤活復蘇',
  exclusive: '獨家商家',
  gold: '金牌商家',
  ka: '人氣商家(KA)',
}

const statusMap: Record<string, string> = {
  pending: '待審批',
  approved: '已通過',
  rejected: '已駁回',
  active: '有效',
  deducted: '已扣除',
  expired: '已過期',
}

const statusColorMap: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  active: 'success',
  deducted: 'default',
  expired: 'warning',
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
  const [form] = Form.useForm()
  const [addForm] = Form.useForm()
  const [deductModalVisible, setDeductModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [isGiftMode, setIsGiftMode] = useState(false)
  const [successModalVisible, setSuccessModalVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)
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

  const handleAdd = () => {
    addForm.resetFields()
    setIsGiftMode(false)
    setAddModalVisible(true)
  }

  const handleGift = (record: GiftDetailRecord) => {
    setCurrentRecord(record)
    addForm.resetFields()
    // 品牌值轉換：1 -> flashBee, 2 -> mFood
    const brandValue = record.brand === '1' ? 'flashBee' : record.brand === '2' ? 'mFood' : record.brand
    addForm.setFieldsValue({
      groupDisplay: `${record.groupId} - ${record.groupName}`,
      storeDisplay: `${record.storeId} - ${record.storeName}`,
      brand: brandValue,
      adType: record.adType,
    })
    setIsGiftMode(true)
    setAddModalVisible(true)
  }

  const handleAddOk = async () => {
    try {
      await addForm.validateFields()
      const values = addForm.getFieldsValue()
      console.log('提交贈送申請:', values)
      setAddModalVisible(false)
      setCountdown(5)
      setSuccessModalVisible(true)
    } catch (error) {
      console.error('表單驗證失敗:', error)
    }
  }

  // 倒計時邏輯
  useEffect(() => {
    if (!successModalVisible) return
    if (countdown <= 0) {
      setSuccessModalVisible(false)
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successModalVisible, countdown])

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
      title: '贈送天數',
      dataIndex: 'totalDays',
      key: 'totalDays',
      width: 100,
      render: (days: number) => `${days} 天`,
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
      title: '贈送原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 180,
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
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            詳情
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
          為商戶贈送廣告推廣天數，提交後進入審批流程，審核通過後自動加天數
        </p>
      </div>

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
          <Form.Item name="brand" label="所屬品牌">
            <Select placeholder="全部" allowClear options={brandOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="adType" label="廣告類型">
            <Select placeholder="全部" allowClear options={adTypeOptions} style={{ width: '100%' }} />
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
          <Form.Item name="applicant" label="申請人">
            <Input placeholder="請輸入申請人" allowClear />
          </Form.Item>
          <Form.Item name="applyTime" label="申請時間">
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

      {/* 新增贈送彈窗 */}
      <Modal
        title="新增推廣贈送"
        open={addModalVisible}
        onOk={handleAddOk}
        onCancel={() => setAddModalVisible(false)}
        okText="提交申請"
        cancelText="取消"
        width={600}
        okButtonProps={{ icon: <SendOutlined /> }}
      >
        <div style={{
          padding: '10px 16px',
          background: '#FFF7E6',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: '#8C6D1F',
          lineHeight: 1.8,
        }}>
          提交後將進入審批中心，審核通過後系統自動為商戶增加對應廣告天數。
        </div>
        <Form form={addForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="groupDisplay" label="集團ID/名稱" rules={[{ required: true, message: '請選擇集團ID/名稱' }]}>
            {isGiftMode ? (
              <Input disabled />
            ) : (
              <Select
                showSearch
                allowClear
                placeholder="支持ID和名稱搜索查詢"
                optionFilterProp="label"
                options={[
                  { label: 'G001 - 美味餐廳集團', value: 'G001 - 美味餐廳集團' },
                  { label: 'G002 - 生鮮超市集團', value: 'G002 - 生鮮超市集團' },
                  { label: 'G003 - 時尚百貨集團', value: 'G003 - 時尚百貨集團' },
                  { label: 'G004 - 速遞物流集團', value: 'G004 - 速遞物流集團' },
                  { label: 'G005 - 甜品屋集團', value: 'G005 - 甜品屋集團' },
                  { label: 'G006 - 火鍋城集團', value: 'G006 - 火鍋城集團' },
                ]}
              />
            )}
          </Form.Item>

          <Form.Item name="storeDisplay" label="門店ID/名稱" rules={[{ required: true, message: '請選擇門店ID/名稱' }]}>
            {isGiftMode ? (
              <Input disabled />
            ) : (
              <Select
                showSearch
                allowClear
                placeholder="支持ID和名稱搜索查詢"
                optionFilterProp="label"
                options={[
                  { label: 'S1001 - 澳門總店', value: 'S1001 - 澳門總店' },
                  { label: 'S1002 - 氹仔分店', value: 'S1002 - 氹仔分店' },
                  { label: 'S1003 - 新馬路店', value: 'S1003 - 新馬路店' },
                  { label: 'S1004 - 黑沙環店', value: 'S1004 - 黑沙環店' },
                  { label: 'S1005 - 官也街老店', value: 'S1005 - 官也街老店' },
                  { label: 'S1006 - 珠海旗艦店', value: 'S1006 - 珠海旗艦店' },
                ]}
              />
            )}
          </Form.Item>

          <Form.Item
            name="brand"
            label="所屬品牌"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Radio.Group disabled={isGiftMode}>
              <Radio value="flashBee">閃蜂</Radio>
              <Radio value="mFood">mFood</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="adType"
            label="廣告類型"
            rules={[{ required: true, message: '請選擇廣告類型' }]}
          >
            <Select
              placeholder="請選擇廣告類型"
              options={adTypeOptions.filter(o => o.value !== 'all')}
              disabled={isGiftMode}
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
            label="相關憑證"
            required
            rules={[{
              validator: (_, value) => {
                const fileList = addForm.getFieldValue('certificate')
                if (!fileList || (Array.isArray(fileList) && fileList.length === 0)) {
                  return Promise.reject(new Error('請上傳相關憑證'))
                }
                return Promise.resolve()
              }
            }]}
          >
            <Upload
              beforeUpload={() => false}
              maxCount={5}
              accept=".png,.jpg,.webp,.jpeg,.pdf"
              listType="picture-card"
              onChange={({ fileList }) => {
                addForm.setFieldsValue({ certificate: fileList })
                addForm.validateFields(['certificate'])
              }}
            >
              <div>
                <PlusOutlined style={{ fontSize: 20, color: '#8C8C8C' }} />
                <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>上傳憑證</div>
              </div>
            </Upload>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              支持 png、jpg、webp、jpeg、pdf；最大 10MB；最多上傳 5 張
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 提交成功彈窗 */}
      <Modal
        open={successModalVisible}
        onCancel={() => setSuccessModalVisible(false)}
        footer={null}
        width={420}
        centered
      >
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #52C41A, #73D13D)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
          }}>
            <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
            提交成功
          </h3>
          <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
            該流程已經進入審批，可到<span style={{ color: '#E8720C', fontWeight: 500 }}>審批中心</span>菜單查看審批進度
          </p>
          <Button
            type="primary"
            size="large"
            onClick={() => setSuccessModalVisible(false)}
            style={{ minWidth: 120, height: 40, borderRadius: 8 }}
          >
            我知道了{countdown > 0 && ` (${countdown}s)`}
          </Button>
        </div>
      </Modal>

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
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>集團ID</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.groupId}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>集團名稱</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.groupName}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>所屬品牌</div>
                <div style={{ fontSize: 14, color: '#262626' }}><BrandTag value={currentRecord.brand} /></div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>廣告類型</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{adTypeMap[currentRecord.adType]}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>贈送天數</div>
                <div style={{ fontSize: 14, color: '#262626', fontWeight: 600 }}>{currentRecord.totalDays} 天</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>狀態</div>
                <Tag color={statusColorMap[currentRecord.status]}>
                  {statusMap[currentRecord.status]}
                </Tag>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>申請人</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.applicant || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>申請時間</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.applyTime || '-'}</div>
              </div>
              {currentRecord.status !== 'pending' && currentRecord.status !== 'rejected' && (
                <>
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
                    <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>贈送時間</div>
                    <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.giftTime}</div>
                  </div>
                  <div>
                    <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 4 }}>過期時間</div>
                    <div style={{ fontSize: 14, color: '#262626' }}>{currentRecord.expireTime}</div>
                  </div>
                </>
              )}
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
