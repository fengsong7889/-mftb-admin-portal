import { useState } from 'react'
import {
  Card, Tabs, Table, Tag, Button, Space, Modal, Form, Input, InputNumber,
  Select, Radio, Switch, Alert, Segmented, message, Tooltip,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, InfoCircleOutlined, DeleteOutlined } from '@ant-design/icons'

// ======== TypeScript 接口定義 ========

/** 加分方式 */
type BoostMethod = 'fixed' | 'weight_multiply'

/** 適用APP */
type AppType = 'flashBee' | 'mFood' | 'both'

/** 適用頻道 */
type ChannelType = 'takeaway' | 'supermarket' | 'groupBuy' | 'homePage'

/** 活動加分配置 */
interface ActivityRecord {
  key: string
  activityName: string
  activityCode: string
  appType: AppType
  channels: ChannelType[]
  boostValue: number
  boostMethod: BoostMethod
  status: boolean
  priority: number
  weightValue?: number
  multiplyValue?: number
}

/** 熱搜詞購買記錄 */
interface HotSearchPurchase {
  key: string
  brand: 'flashBee' | 'mFood'
  hotSearchWord: string
  merchantName: string
  channel: ChannelType
  validPeriod: [string, string]
  status: 'active' | 'expired'
}

// ======== 常量映射 ========

const appTypeMap: Record<AppType, string> = {
  flashBee: '閃蜂',
  mFood: 'mFood',
  both: '兩者',
}

const appTypeColorMap: Record<AppType, string> = {
  flashBee: 'blue',
  mFood: 'orange',
  both: 'green',
}

const channelMap: Record<ChannelType, string> = {
  takeaway: '外賣',
  supermarket: '超市',
  groupBuy: '團購',
  homePage: '大首頁',
}

const boostMethodMap: Record<BoostMethod, string> = {
  fixed: '固定加分',
  weight_multiply: '權重×倍數',
}

const boostMethodColorMap: Record<BoostMethod, string> = {
  fixed: 'blue',
  weight_multiply: 'purple',
}

const channelOptions = [
  { label: '外賣', value: 'takeaway' },
  { label: '超市', value: 'supermarket' },
  { label: '團購', value: 'groupBuy' },
  { label: '大首頁', value: 'homePage' },
]

const appTypeOptions = [
  { label: '閃蜂', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
  { label: '兩者', value: 'both' },
]

// ======== Mock 數據 ========

const initialActivities: ActivityRecord[] = [
  { key: '1', activityName: '滿額立減', activityCode: 'FULL_REDUCE', appType: 'both', channels: ['takeaway', 'supermarket'], boostValue: 30, boostMethod: 'fixed', status: true, priority: 1 },
  { key: '2', activityName: '減免運費', activityCode: 'FREE_DELIVERY', appType: 'both', channels: ['takeaway'], boostValue: 25, boostMethod: 'fixed', status: true, priority: 2 },
  { key: '3', activityName: '進店領券', activityCode: 'STORE_COUPON', appType: 'both', channels: ['takeaway', 'supermarket', 'groupBuy'], boostValue: 20, boostMethod: 'fixed', status: true, priority: 3 },
  { key: '4', activityName: '新客立減', activityCode: 'NEW_USER_REDUCE', appType: 'both', channels: ['takeaway', 'supermarket'], boostValue: 35, boostMethod: 'fixed', status: true, priority: 4 },
  { key: '5', activityName: '收藏送券', activityCode: 'FAV_COUPON', appType: 'flashBee', channels: ['takeaway'], boostValue: 15, boostMethod: 'fixed', status: true, priority: 5 },
  { key: '6', activityName: '官方勝券', activityCode: 'OFFICIAL_COUPON', appType: 'flashBee', channels: ['takeaway', 'supermarket'], boostValue: 40, boostMethod: 'fixed', status: true, priority: 6 },
  { key: '7', activityName: '會員紅包', activityCode: 'MEMBER_BONUS', appType: 'both', channels: ['takeaway', 'supermarket', 'groupBuy'], boostValue: 25, boostMethod: 'fixed', status: true, priority: 7 },
  { key: '8', activityName: '會員紅包按金額', activityCode: 'MEMBER_AMOUNT', appType: 'flashBee', channels: ['takeaway'], boostValue: 0, boostMethod: 'weight_multiply', status: true, priority: 8, weightValue: 10, multiplyValue: 2 },
  { key: '9', activityName: '人氣搜索', activityCode: 'POPULAR_SEARCH', appType: 'both', channels: ['takeaway', 'supermarket'], boostValue: 50, boostMethod: 'weight_multiply', status: true, priority: 9, weightValue: 15, multiplyValue: 3 },
  { key: '10', activityName: '神券補貼', activityCode: 'SUBSIDY_COUPON', appType: 'mFood', channels: ['groupBuy'], boostValue: 30, boostMethod: 'fixed', status: true, priority: 10 },
  { key: '11', activityName: '免費新店', activityCode: 'FREE_NEW_STORE', appType: 'both', channels: ['groupBuy'], boostValue: 20, boostMethod: 'fixed', status: true, priority: 11 },
  { key: '12', activityName: '付費新店', activityCode: 'PAID_NEW_STORE', appType: 'both', channels: ['groupBuy'], boostValue: 35, boostMethod: 'fixed', status: true, priority: 12 },
]

const initialHotSearchPurchases: HotSearchPurchase[] = [
  { key: '1', brand: 'flashBee', hotSearchWord: '奶茶', merchantName: '奈雪的茶', channel: 'takeaway', validPeriod: ['2026-06-01', '2026-09-01'], status: 'active' },
  { key: '2', brand: 'flashBee', hotSearchWord: '漢堡', merchantName: '麥當勞', channel: 'takeaway', validPeriod: ['2026-05-15', '2026-08-15'], status: 'active' },
  { key: '3', brand: 'flashBee', hotSearchWord: '咖啡', merchantName: '星巴克', channel: 'supermarket', validPeriod: ['2026-03-01', '2026-06-01'], status: 'expired' },
  { key: '4', brand: 'mFood', hotSearchWord: '壽司', merchantName: '壽司郎', channel: 'takeaway', validPeriod: ['2026-06-10', '2026-12-10'], status: 'active' },
  { key: '5', brand: 'mFood', hotSearchWord: '披薩', merchantName: '必勝客', channel: 'takeaway', validPeriod: ['2026-04-01', '2026-07-01'], status: 'expired' },
  { key: '6', brand: 'mFood', hotSearchWord: '火鍋', merchantName: '海底撈', channel: 'groupBuy', validPeriod: ['2026-06-01', '2026-12-31'], status: 'active' },
]

// ======== Tab 1：活動加分配置 ========

function ActivityTab() {
  const [dataSource, setDataSource] = useState<ActivityRecord[]>(initialActivities)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ActivityRecord | null>(null)
  const [currentBoostMethod, setCurrentBoostMethod] = useState<BoostMethod>('fixed')
  const [form] = Form.useForm()

  /** 新增活動 */
  const handleAdd = () => {
    setEditingRecord(null)
    setCurrentBoostMethod('fixed')
    form.resetFields()
    form.setFieldsValue({ appType: 'both', channels: ['takeaway'], boostMethod: 'fixed', status: true, priority: 1 })
    setIsModalOpen(true)
  }

  /** 編輯 */
  const handleEdit = (record: ActivityRecord) => {
    setEditingRecord(record)
    setCurrentBoostMethod(record.boostMethod)
    setIsModalOpen(true)
    setTimeout(() => {
      form.setFieldsValue({
        activityName: record.activityName,
        activityCode: record.activityCode,
        appType: record.appType,
        channels: record.channels,
        boostMethod: record.boostMethod,
        boostValue: record.boostValue,
        weightValue: record.weightValue,
        multiplyValue: record.multiplyValue,
        priority: record.priority,
        status: record.status,
      })
    }, 0)
  }

  /** 刪除 */
  const handleDelete = (record: ActivityRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除活動「${record.activityName}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setDataSource(prev => prev.filter(item => item.key !== record.key))
        message.success('刪除成功')
      },
    })
  }

  /** 切換狀態 */
  const handleToggleStatus = (record: ActivityRecord) => {
    setDataSource(prev =>
      prev.map(item =>
        item.key === record.key ? { ...item, status: !item.status } : item
      )
    )
    message.success(record.status ? '已停用' : '已啟用')
  }

  /** 保存 */
  const handleSave = () => {
    form.validateFields().then(values => {
      if (editingRecord) {
        setDataSource(prev =>
          prev.map(item =>
            item.key === editingRecord.key
              ? { ...item, ...values }
              : item
          )
        )
        message.success('編輯成功')
      } else {
        const newRecord: ActivityRecord = {
          key: String(Date.now()),
          ...values,
        }
        setDataSource(prev => [...prev, newRecord])
        message.success('新增成功')
      }
      setIsModalOpen(false)
    })
  }

  const columns: TableColumnsType<ActivityRecord> = [
    {
      title: '活動名稱',
      dataIndex: 'activityName',
      key: 'activityName',
      width: 140,
    },
    {
      title: '活動編碼',
      dataIndex: 'activityCode',
      key: 'activityCode',
      width: 150,
    },
    {
      title: '適用APP',
      dataIndex: 'appType',
      key: 'appType',
      width: 90,
      render: (v: AppType) => (
        <Tag style={{ margin: 0, padding: '2px 10px', borderRadius: 4, fontWeight: 500 }}>
          {appTypeMap[v]}
        </Tag>
      ),
    },
    {
      title: '適用頻道',
      dataIndex: 'channels',
      key: 'channels',
      width: 180,
      render: (v: ChannelType[]) => (
        <Space size={[4, 4]} wrap>
          {v.map(c => <Tag key={c}>{channelMap[c]}</Tag>)}
        </Space>
      ),
    },
    {
      title: '加分值',
      dataIndex: 'boostValue',
      key: 'boostValue',
      width: 80,
      render: (v: number, record: ActivityRecord) =>
        record.boostMethod === 'weight_multiply'
          ? `${record.weightValue ?? '-'} × ${record.multiplyValue ?? '-'}`
          : v,
    },
    {
      title: '加分方式',
      dataIndex: 'boostMethod',
      key: 'boostMethod',
      width: 110,
      render: (v: BoostMethod) => (
        <Tag color={boostMethodColorMap[v]} style={{ margin: 0 }}>{boostMethodMap[v]}</Tag>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: boolean, record: ActivityRecord) => (
        <Switch
          size="small"
          checked={v}
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.preventDefault(); handleEdit(record) }}>
            編輯
          </Button>
          <Button type="link" size="small" danger onClick={(e) => { e.preventDefault(); handleDelete(record) }}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="action-section">
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增活動
        </Button>
      </div>

      <div className="table-section">
        <Table<ActivityRecord>
          columns={columns}
          dataSource={dataSource}
          rowKey="key"
          pagination={{
            total: dataSource.length,
            pageSize: 10,
            showTotal: total => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1100 }}
        />
      </div>

      {/* 新增/編輯 Modal */}
      <Modal
        title={editingRecord ? '編輯活動' : '新增活動'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              label="活動名稱"
              name="activityName"
              rules={[{ required: true, message: '請輸入活動名稱' }]}
            >
              <Input placeholder="請輸入活動名稱" />
            </Form.Item>

            <Form.Item
              label="活動編碼"
              name="activityCode"
              rules={[
                { required: true, message: '請輸入活動編碼' },
                { pattern: /^[A-Z_]+$/, message: '僅支持英文大寫字母和下劃線' },
              ]}
            >
              <Input placeholder="如：FULL_REDUCE" disabled={!!editingRecord} />
            </Form.Item>

            <Form.Item
              label="適用APP"
              name="appType"
              rules={[{ required: true, message: '請選擇適用APP' }]}
            >
              <Select options={appTypeOptions} placeholder="請選擇" />
            </Form.Item>

            <Form.Item
              label="適用頻道"
              name="channels"
              rules={[{ required: true, message: '請選擇適用頻道' }]}
            >
              <Select mode="multiple" options={channelOptions} placeholder="請選擇頻道" />
            </Form.Item>
          </div>

          <Form.Item
            label="加分方式"
            name="boostMethod"
            rules={[{ required: true, message: '請選擇加分方式' }]}
          >
            <Radio.Group onChange={e => setCurrentBoostMethod(e.target.value)}>
              <Radio value="fixed">固定加分</Radio>
              <Radio value="weight_multiply">權重×倍數</Radio>
            </Radio.Group>
          </Form.Item>

          {currentBoostMethod === 'fixed' ? (
            <Form.Item
              label="加分值"
              name="boostValue"
              rules={[{ required: true, message: '請輸入加分值' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={9999} placeholder="請輸入固定加分值" />
            </Form.Item>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Form.Item
                label="權重值"
                name="weightValue"
                rules={[{ required: true, message: '請輸入權重值' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} max={9999} placeholder="請輸入權重值" />
              </Form.Item>
              <Form.Item
                label="倍數"
                name="multiplyValue"
                rules={[{ required: true, message: '請輸入倍數' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} max={99} placeholder="請輸入倍數" />
              </Form.Item>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="優先級" name="priority">
              <InputNumber style={{ width: '100%' }} min={1} max={999} placeholder="數字越小優先級越高" />
            </Form.Item>
            <Form.Item label="狀態" name="status" valuePropName="checked">
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ======== Tab 2：廣告與關鍵詞 ========

function AdKeywordTab() {
  const [form] = Form.useForm()

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success('保存成功')
    })
  }

  return (
    <Form form={form} layout="vertical">
      <Card title="廣告配置" style={{ marginBottom: 20 }} size="small">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item
            label="廣告權重"
            name="adWeight"
            initialValue={100}
            rules={[{ required: true, message: '請輸入廣告權重' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} max={9999} placeholder="0-9999" />
          </Form.Item>
          <Form.Item
            label="廣告倍數"
            name="adMultiplier"
            initialValue={1}
            rules={[{ required: true, message: '請輸入廣告倍數' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} max={99} placeholder="0-99" />
          </Form.Item>
        </div>
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="分值 = 廣告權重 × 倍數，再加權重佔比計算總分"
          style={{ marginTop: 4 }}
        />
      </Card>

      <Card title="關鍵詞購買配置" style={{ marginBottom: 20 }} size="small">
        <Form.Item
          label="關鍵詞命中加分"
          name="keywordBoostScore"
          initialValue={50}
          rules={[{ required: true, message: '請輸入關鍵詞命中加分' }]}
          style={{ marginBottom: 8 }}
        >
          <InputNumber style={{ width: 300 }} min={0} max={9999} placeholder="0-9999" />
        </Form.Item>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          商家購買了關鍵詞，當用戶搜索內容匹配到該關鍵詞時，該商家額外加此分值
        </div>
      </Card>

      <div style={{ textAlign: 'right' }}>
        <Button type="primary" onClick={handleSave}>保存配置</Button>
      </div>
    </Form>
  )
}

// ======== Tab 3：熱搜詞商業化 ========

function HotSearchCommercialTab() {
  const [dataSource, setDataSource] = useState<HotSearchPurchase[]>(initialHotSearchPurchases)
  const [brandFilter, setBrandFilter] = useState<string>('閃蜂')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchPurchase | null>(null)
  const [form] = Form.useForm()

  const filteredData = dataSource.filter(item =>
    item.brand === (brandFilter === '閃蜂' ? 'flashBee' : 'mFood')
  )

  /** 新增 */
  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ brand: brandFilter === '閃蜂' ? 'flashBee' : 'mFood', channel: 'takeaway' })
    setIsModalOpen(true)
  }

  /** 編輯 */
  const handleEdit = (record: HotSearchPurchase) => {
    setEditingRecord(record)
    setIsModalOpen(true)
    setTimeout(() => {
      form.setFieldsValue({
        hotSearchWord: record.hotSearchWord,
        merchantName: record.merchantName,
        brand: record.brand,
        channel: record.channel,
        validStartDate: record.validPeriod[0],
        validEndDate: record.validPeriod[1],
      })
    }, 0)
  }

  /** 刪除 */
  const handleDelete = (record: HotSearchPurchase) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.hotSearchWord}」的購買記錄嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setDataSource(prev => prev.filter(item => item.key !== record.key))
        message.success('刪除成功')
      },
    })
  }

  /** 保存 */
  const handleSave = () => {
    form.validateFields().then(values => {
      if (editingRecord) {
        setDataSource(prev =>
          prev.map(item =>
            item.key === editingRecord.key
              ? {
                  ...item,
                  hotSearchWord: values.hotSearchWord,
                  merchantName: values.merchantName,
                  brand: values.brand,
                  channel: values.channel,
                  validPeriod: [values.validStartDate, values.validEndDate] as [string, string],
                }
              : item
          )
        )
        message.success('編輯成功')
      } else {
        const newRecord: HotSearchPurchase = {
          key: String(Date.now()),
          hotSearchWord: values.hotSearchWord,
          merchantName: values.merchantName,
          brand: values.brand,
          channel: values.channel,
          validPeriod: [values.validStartDate, values.validEndDate],
          status: 'active',
        }
        setDataSource(prev => [...prev, newRecord])
        message.success('新增成功')
      }
      setIsModalOpen(false)
    })
  }

  const columns: TableColumnsType<HotSearchPurchase> = [
    {
      title: '熱搜詞',
      dataIndex: 'hotSearchWord',
      key: 'hotSearchWord',
      width: 120,
    },
    {
      title: '購買商家',
      dataIndex: 'merchantName',
      key: 'merchantName',
      width: 140,
    },
    {
      title: '購買頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 100,
      render: (v: ChannelType) => <Tag>{channelMap[v]}</Tag>,
    },
    {
      title: '有效期',
      key: 'validPeriod',
      width: 200,
      render: (_, r) => `${r.validPeriod[0]} ~ ${r.validPeriod[1]}`,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'red'}>
          {v === 'active' ? '生效中' : '已過期'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.preventDefault(); handleEdit(record) }}>
            編輯
          </Button>
          <Button type="link" size="small" danger onClick={(e) => { e.preventDefault(); handleDelete(record) }}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card title="購買加分配置" style={{ marginBottom: 20 }} size="small">
        <Form layout="vertical">
          <Form.Item
            label="購買熱搜詞命中加分"
            initialValue={80}
            style={{ marginBottom: 8 }}
          >
            <InputNumber style={{ width: 300 }} min={0} max={9999} placeholder="0-9999" />
          </Form.Item>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>
            商家購買了熱搜詞，用戶搜索匹配到時該商家額外加此分值
          </div>
        </Form>
      </Card>

      <Card
        title="已購買熱搜詞列表"
        size="small"
        extra={
          <Space>
            <Segmented
              options={['閃蜂', 'mFood']}
              value={brandFilter}
              onChange={val => setBrandFilter(val as string)}
            />
            <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>
              新增
            </Button>
          </Space>
        }
      >
        <Table<HotSearchPurchase>
          columns={columns}
          dataSource={filteredData}
          rowKey="key"
          pagination={{
            total: filteredData.length,
            pageSize: 10,
            showTotal: total => `共 ${total} 條`,
          }}
          size="middle"
          bordered={false}
        />
      </Card>

      {/* 新增/編輯 Modal */}
      <Modal
        title={editingRecord ? '編輯購買記錄' : '新增購買記錄'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="熱搜詞"
            name="hotSearchWord"
            rules={[{ required: true, message: '請輸入熱搜詞' }]}
          >
            <Input placeholder="請輸入熱搜詞" />
          </Form.Item>
          <Form.Item
            label="購買商家"
            name="merchantName"
            rules={[{ required: true, message: '請輸入購買商家' }]}
          >
            <Input placeholder="請輸入商家名稱" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="所屬品牌" name="brand">
              <Select options={appTypeOptions.filter(o => o.value !== 'both')} placeholder="請選擇" />
            </Form.Item>
            <Form.Item label="購買頻道" name="channel" rules={[{ required: true, message: '請選擇頻道' }]}>
              <Select options={channelOptions} placeholder="請選擇" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              label="生效日期"
              name="validStartDate"
              rules={[{ required: true, message: '請輸入生效日期' }]}
            >
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item
              label="失效日期"
              name="validEndDate"
              rules={[{ required: true, message: '請輸入失效日期' }]}
            >
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ======== 主頁面 ========

export default function CommercialConfig() {
  const tabItems = [
    {
      key: 'activity',
      label: '活動加分配置',
      children: <ActivityTab />,
    },
    {
      key: 'ad-keyword',
      label: '廣告與關鍵詞',
      children: <AdKeywordTab />,
    },
    {
      key: 'hot-search',
      label: '熱搜詞商業化',
      children: <HotSearchCommercialTab />,
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面描述 */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderLeft: '3px solid #1976D2' }}
      >
        <span style={{ color: '#636E72', fontSize: 13 }}>
          商業化管理用於配置搜索結果中的商業加分規則，推動商家購買廣告和營銷活動
        </span>
      </Card>

      {/* Tabs 區域 */}
      <Tabs defaultActiveKey="activity" items={tabItems} />
    </div>
  )
}
