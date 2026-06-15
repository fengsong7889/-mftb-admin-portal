import { useState } from 'react'
import { Card, Tabs, Form, Switch, InputNumber, Slider, Button, Table, Modal, Input, Select, Tag, Space, Checkbox, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'

const { TextArea } = Input

/** 適用APP選項 */
const appOptions = [
  { label: '閃蜂', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
  { label: '兩者', value: 'both' },
]

/** APP標籤顏色映射 */
const appTagMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
  flashBee: { label: '閃蜂', color: '#d4b106', bg: '#fffbe6', border: '#fadb14' },
  mFood: { label: 'mFood', color: '#d46b08', bg: '#fff7e6', border: '#fa8c16' },
  both: { label: '兩者', color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
}

interface RegionRule {
  key: string
  ruleName: string
  description: string
  app: string
  score: number
  enabled: boolean
}

const mockRegionRules: RegionRule[] = [
  { key: '1', ruleName: '跨區懲罰規則', description: '氹仔商家跨區澳門不加分', app: 'both', score: -50, enabled: true },
  { key: '2', ruleName: '特殊區域加分', description: '指定區域內的商家額外加分', app: 'both', score: 30, enabled: true },
  { key: '3', ruleName: '短單範圍加分', description: '配送距離短的商家加分', app: 'flashBee', score: 20, enabled: true },
]

export default function GlobalConfig() {
  // 詞庫管理狀態
  const [synonymEnabled, setSynonymEnabled] = useState(true)
  const [aliasEnabled, setAliasEnabled] = useState(true)
  const [stopWordEnabled, setStopWordEnabled] = useState(false)
  const [segmentStrength, setSegmentStrength] = useState(60)

  // 匹配策略狀態
  const [minMatchRatio, setMinMatchRatio] = useState<number>(70)
  const [fuzzyPinyin, setFuzzyPinyin] = useState(true)
  const [fuzzySimplifiedTraditional, setFuzzySimplifiedTraditional] = useState(true)
  const [fuzzyTolerance, setFuzzyTolerance] = useState(true)
  const [searchProductForShop, setSearchProductForShop] = useState(true)

  // 區域規則狀態
  const [regionRules, setRegionRules] = useState<RegionRule[]>(mockRegionRules)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RegionRule | null>(null)
  const [form] = Form.useForm()

  // 區域規則操作
  const handleAddRule = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({ app: 'both', score: 0, enabled: true })
    setIsModalOpen(true)
  }

  const handleEditRule = (record: RegionRule) => {
    setEditingRule(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDeleteRule = (record: RegionRule) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除規則「${record.ruleName}」嗎？此操作不可恢復。`,
      okText: '確定',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setRegionRules(prev => prev.filter(r => r.key !== record.key))
        message.success('刪除成功')
      },
    })
  }

  const handleToggleRule = (record: RegionRule) => {
    setRegionRules(prev =>
      prev.map(r =>
        r.key === record.key ? { ...r, enabled: !r.enabled } : r
      )
    )
    const actionText = record.enabled ? '停用' : '啟用'
    message.success(`已${actionText}規則「${record.ruleName}」`)
  }

  const handleSaveRule = () => {
    form.validateFields().then((values) => {
      if (editingRule) {
        setRegionRules(prev =>
          prev.map(r => r.key === editingRule.key ? { ...r, ...values } : r)
        )
        message.success('編輯成功')
      } else {
        const newRule: RegionRule = {
          key: Date.now().toString(),
          ...values,
        }
        setRegionRules(prev => [...prev, newRule])
        message.success('新增成功')
      }
      setIsModalOpen(false)
    })
  }

  // 區域規則表格列
  const regionColumns: TableColumnsType<RegionRule> = [
    {
      title: '規則名稱',
      dataIndex: 'ruleName',
      key: 'ruleName',
      width: 180,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: '說明',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
    },
    {
      title: '適用APP',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (v: string) => {
        const tag = appTagMap[v]
        return tag ? (
          <Tag style={{
            margin: 0,
            padding: '2px 10px',
            border: `1px solid ${tag.border}`,
            color: tag.color,
            background: tag.bg,
            borderRadius: 4,
            fontWeight: 500,
          }}>
            {tag.label}
          </Tag>
        ) : v
      },
    },
    {
      title: '加分值',
      dataIndex: 'score',
      key: 'score',
      width: 100,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#389e0d' : '#cf1322', fontWeight: 600 }}>
          {v >= 0 ? `+${v}` : v}
        </span>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean, record) => (
        <Switch
          checked={v}
          size="small"
          onChange={() => handleToggleRule(record)}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRule(record)}>
            編輯
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteRule(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'library',
      label: '詞庫管理',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 同義詞庫 */}
          <Card title="同義詞庫" size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <Switch
                  checked={synonymEnabled}
                  onChange={setSynonymEnabled}
                  checkedChildren="開啟"
                  unCheckedChildren="關閉"
                />
                <span style={{ color: synonymEnabled ? '#389e0d' : '#999', fontWeight: 500 }}>
                  {synonymEnabled ? '已開啟' : '已關閉'}
                </span>
              </Space>
              <Button type="primary" ghost>管理詞庫</Button>
            </div>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>
              啟用後，搜索時會自動匹配同義詞，擴大召回範圍。例如搜「漢堡」可召回「burger」。
            </div>
          </Card>

          {/* 商家別名庫 */}
          <Card title="商家別名庫" size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <Switch
                  checked={aliasEnabled}
                  onChange={setAliasEnabled}
                  checkedChildren="開啟"
                  unCheckedChildren="關閉"
                />
                <span style={{ color: aliasEnabled ? '#389e0d' : '#999', fontWeight: 500 }}>
                  {aliasEnabled ? '已開啟' : '已關閉'}
                </span>
              </Space>
              <Button type="primary" ghost>管理詞庫</Button>
            </div>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>
              啟用後，搜索商家別名可匹配到對應商家。例如搜「KFC」可召回「肯德基」。
            </div>
          </Card>

          {/* 分詞匹配力度 */}
          <Card title="分詞匹配力度" size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Slider
                min={0}
                max={100}
                value={segmentStrength}
                onChange={setSegmentStrength}
                style={{ flex: 1, margin: 0 }}
              />
              <InputNumber
                min={0}
                max={100}
                value={segmentStrength}
                onChange={(v) => setSegmentStrength(v ?? 0)}
                formatter={(v) => `${v}%`}
                parser={(v) => Number(v?.replace('%', '')) || 0}
                style={{ width: 90 }}
              />
            </div>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>
              數值越小搜索結果將泛化（內容變多），數值越大匹配結果越準確（內容變少）
            </div>
          </Card>

          {/* 停用詞庫 */}
          <Card title="停用詞庫" size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <Switch
                  checked={stopWordEnabled}
                  onChange={setStopWordEnabled}
                  checkedChildren="開啟"
                  unCheckedChildren="關閉"
                />
                <span style={{ color: stopWordEnabled ? '#389e0d' : '#999', fontWeight: 500 }}>
                  {stopWordEnabled ? '已開啟' : '已關閉'}
                </span>
              </Space>
              <Button type="primary" ghost>管理詞庫</Button>
            </div>
            <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 13 }}>
              啟用後，搜索時會自動過濾停用詞，避免無意義詞干擾搜索結果。
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'strategy',
      label: '匹配策略',
      children: (
        <Form layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item
            label="最少匹配比例"
            tooltip="搜索詞至少需要匹配的比例，低於此比例的結果將被過濾"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0}
                max={100}
                value={minMatchRatio}
                onChange={(v) => setMinMatchRatio(v ?? 0)}
                formatter={(v) => `${v}%`}
                parser={(v) => Number(v?.replace('%', '')) || 0}
                style={{ width: 120 }}
              />
            </div>
            <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: 13 }}>
              各頻道可單獨覆蓋此全局默認值
            </div>
          </Form.Item>

          <Form.Item label="模糊匹配">
            <Space direction="vertical">
              <Checkbox
                checked={fuzzyPinyin}
                onChange={(e) => setFuzzyPinyin(e.target.checked)}
              >
                拼音匹配
              </Checkbox>
              <Checkbox
                checked={fuzzySimplifiedTraditional}
                onChange={(e) => setFuzzySimplifiedTraditional(e.target.checked)}
              >
                簡繁體匹配
              </Checkbox>
              <Checkbox
                checked={fuzzyTolerance}
                onChange={(e) => setFuzzyTolerance(e.target.checked)}
              >
                容錯匹配
              </Checkbox>
            </Space>
          </Form.Item>

          <Form.Item label="商品名搜店鋪">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Switch
                checked={searchProductForShop}
                onChange={setSearchProductForShop}
                checkedChildren="是"
                unCheckedChildren="否"
              />
              <span style={{ color: '#8c8c8c', fontSize: 13 }}>
                是否支持搜商品名召回其所屬店鋪
              </span>
            </div>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'region',
      label: '區域規則',
      children: (
        <>
          <div className="action-section">
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRule}>
                新增規則
              </Button>
            </Space>
          </div>
          <div className="table-section">
            <Table<RegionRule>
              columns={regionColumns}
              dataSource={regionRules}
              pagination={{
                total: regionRules.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 10,
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 800 }}
            />
          </div>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 頁面描述 */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: '#f6f8fa', border: '1px solid #e8e8e8' }}
      >
        <span style={{ color: '#595959', fontSize: 13 }}>
          全局通用配置對閃蜂和mFood兩個APP共同生效，所有頻道共享此配置
        </span>
      </Card>

      <Tabs defaultActiveKey="library" items={tabItems} size="large" />

      {/* 新增/編輯區域規則彈窗 */}
      <Modal
        title={editingRule ? '編輯區域規則' : '新增區域規則'}
        open={isModalOpen}
        onOk={handleSaveRule}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="規則名稱"
            name="ruleName"
            rules={[{ required: true, message: '請輸入規則名稱' }]}
          >
            <Input placeholder="請輸入規則名稱" />
          </Form.Item>
          <Form.Item
            label="說明"
            name="description"
            rules={[{ required: true, message: '請輸入規則說明' }]}
          >
            <TextArea rows={3} placeholder="請輸入規則說明" maxLength={200} showCount />
          </Form.Item>
          <Form.Item
            label="適用APP"
            name="app"
            rules={[{ required: true, message: '請選擇適用APP' }]}
          >
            <Select options={appOptions} placeholder="請選擇適用APP" />
          </Form.Item>
          <Form.Item
            label="加分值"
            name="score"
            rules={[{ required: true, message: '請輸入加分值' }]}
            extra="負數為懲罰扣分，正數為加分"
          >
            <InputNumber style={{ width: '100%' }} placeholder="請輸入加分值" />
          </Form.Item>
          <Form.Item label="狀態" name="enabled" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
