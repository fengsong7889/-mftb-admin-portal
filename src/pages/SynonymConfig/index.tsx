import { useState , useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message, Switch } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  SwapOutlined,
  ImportOutlined,
  ExportOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

interface SynonymRecord {
  key: string
  id: number
  mainWord: string
  synonymWords: string[]
  type: 'bidirectional' | 'unidirectional'
  scenario: string
  status: 'active' | 'inactive'
  hitCount: number
  updatedBy: string
  updateTime: string
  remark: string
}

const mockData: SynonymRecord[] = [
  {
    key: '1', id: 1,
    mainWord: '漢堡',
    synonymWords: ['汉堡', '堡包', '漢堡包', 'burger'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 2356,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-05 10:30:00',
    remark: '常見拼寫變體',
  },
  {
    key: '2', id: 2,
    mainWord: '奶茶',
    synonymWords: ['珍珠奶茶', '波霸奶茶', '絲襪奶茶', '鴛鴦'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 4521,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-06-04 15:20:00',
    remark: '飲品類同義詞組',
  },
  {
    key: '3', id: 3,
    mainWord: '外賣',
    synonymWords: ['外送', '送餐', '到家', 'delivery'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 8902,
    updatedBy: '王建華(E10067)',
    updateTime: '2026-06-03 09:15:00',
    remark: '核心業務詞',
  },
  {
    key: '4', id: 4,
    mainWord: 'KFC',
    synonymWords: ['肯德基', '開封菜', '肯記'],
    type: 'unidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 1893,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-06-02 14:00:00',
    remark: '品牌簡稱→全稱',
  },
  {
    key: '5', id: 5,
    mainWord: '麥當勞',
    synonymWords: ['麥記', 'McDonald', '金拱門', 'M記'],
    type: 'bidirectional',
    scenario: '外賣搜索',
    status: 'active',
    hitCount: 3105,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-01 11:45:00',
    remark: '品牌別名',
  },
  {
    key: '6', id: 6,
    mainWord: '壽司',
    synonymWords: ['刺身', '日料', 'sushi'],
    type: 'unidirectional',
    scenario: '外賣搜索',
    status: 'inactive',
    hitCount: 567,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-05-30 16:30:00',
    remark: '日料類（已停用，精確度不足）',
  },
  {
    key: '7', id: 7,
    mainWord: '打折',
    synonymWords: ['優惠', '折扣', '特價', '減價', '促銷'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 6234,
    updatedBy: '王建華(E10067)',
    updateTime: '2026-05-29 08:20:00',
    remark: '促銷類通用詞',
  },
  {
    key: '8', id: 8,
    mainWord: '紙巾',
    synonymWords: ['紙手巾', '面巾紙', '抽紙', '濕巾'],
    type: 'bidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 1456,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-05-28 13:10:00',
    remark: '日用品類',
  },
  {
    key: '9', id: 9,
    mainWord: '啤酒',
    synonymWords: ['生力', '青島', '百威', '嘉士伯', 'beer'],
    type: 'unidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 2078,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-05-27 10:00:00',
    remark: '品牌→品類映射',
  },
  {
    key: '10', id: 10,
    mainWord: '洗衣液',
    synonymWords: ['洗衣粉', '洗衣劑', '衣物清潔劑'],
    type: 'bidirectional',
    scenario: '超市搜索',
    status: 'active',
    hitCount: 890,
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-05-26 14:30:00',
    remark: '清潔用品',
  },
  {
    key: '11', id: 11,
    mainWord: '快餐',
    synonymWords: ['速食', '快餐店', 'fast food'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 5678,
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-05-25 10:15:00',
    remark: '快餐類同義詞',
  },
  {
    key: '12', id: 12,
    mainWord: '甜點',
    synonymWords: ['甜品', '甜食', 'dessert'],
    type: 'bidirectional',
    scenario: '通用搜索',
    status: 'active',
    hitCount: 4230,
    updatedBy: '陳美琪(E10089)',
    updateTime: '2026-05-24 16:45:00',
    remark: '甜品類同義詞',
  },
]

export default function SynonymConfig() {
  const { t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SynonymRecord | null>(null)
  const [form] = Form.useForm()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [data, setData] = useState<SynonymRecord[]>(mockData)

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ type: 'bidirectional', status: true })
    setIsModalOpen(true)
  }

  const handleEdit = (record: SynonymRecord) => {
    setEditingRecord(record)
    form.setFieldsValue({
      ...record,
      synonymWords: record.synonymWords.join('、'),
      status: record.status === 'active',
    })
    setIsModalOpen(true)
  }

  const handleDelete = (record: SynonymRecord) => {
    Modal.confirm({
      title: t('synonymConfig.deleteTitle'),
      content: t('synonymConfig.deleteContent', { word: record.mainWord }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => message.success(t('common.deleteSuccess')),
    })
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('synonymConfig.batchDeleteWarning'))
      return
    }
    Modal.confirm({
      title: t('synonymConfig.batchDeleteTitle'),
      content: t('synonymConfig.batchDeleteContent', { count: selectedRowKeys.length }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        message.success(t('synonymConfig.batchDeleteDone', { count: selectedRowKeys.length }))
        setSelectedRowKeys([])
      },
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? t('common.updateSuccess') : t('common.addSuccess'))
      setIsModalOpen(false)
    })
  }

  const handleToggleStatus = (record: SynonymRecord) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? t('common.enable') : t('common.disable')
    
    // 更新数据
    setData(prevData =>
      prevData.map(item =>
        item.id === record.id
          ? { ...item, status: newStatus as 'active' | 'inactive' }
          : item
      )
    )
    
    message.success(t('synonymConfig.toggled', { word: record.mainWord, action: actionText }))
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'mainWord', title: t('synonymConfig.colMainWord') },
    { key: 'synonymWords', title: t('synonymConfig.colSynonymWords') },
    { key: 'type', title: t('synonymConfig.colType') },
    { key: 'scenario', title: t('synonymConfig.colScenario') },
    { key: 'status', title: t('synonymConfig.colStatus') },
    { key: 'updatedBy', title: t('synonymConfig.colUpdatedBy') },
    { key: 'updateTime', title: t('synonymConfig.colUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const synonymTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.synonymType.bidirectional'), value: 'bidirectional' },
    { label: t('dict.synonymType.unidirectional'), value: 'unidirectional' },
  ]

  const statusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.status.activeLong'), value: 'active' },
    { label: t('dict.status.inactive'), value: 'inactive' },
  ]

  const scenarioOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.scenario.takeaway'), value: 'takeaway' },
    { label: t('dict.scenario.supermarket'), value: 'supermarket' },
    { label: t('dict.scenario.groupBuy'), value: 'groupBuy' },
    { label: t('dict.scenario.general'), value: 'general' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('synonym-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<SynonymRecord> = [
    {
      title: t('synonymConfig.colMainWord'),
      dataIndex: 'mainWord',
      key: 'mainWord',
      width: 120,
      render: (val: string) => <span style={{ fontWeight: 600, color: '#2D3436' }}>{val}</span>,
    },
    {
      title: t('synonymConfig.colSynonymWords'),
      dataIndex: 'synonymWords',
      key: 'synonymWords',
      width: 280,
      render: (words: string[]) => (
        <Space size={[4, 4]} wrap>
          {words.map((w, i) => (
            <Tag key={i} color="orange" style={{ margin: 0 }}>{w}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: t('synonymConfig.colType'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'bidirectional' ? 'blue' : 'green'} icon={<SwapOutlined />}>
          {type === 'bidirectional' ? t('dict.synonymType.bidirectional') : t('dict.synonymType.unidirectional')}
        </Tag>
      ),
    },
    {
      title: t('synonymConfig.colScenario'),
      dataIndex: 'scenario',
      key: 'scenario',
      width: 100,
    },
    {
      title: t('synonymConfig.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'default'}>
          {status === 'active' ? t('dict.status.activeLong') : t('dict.status.inactive')}
        </Tag>
      ),
    },
    { title: t('synonymConfig.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 150 },
    { title: t('synonymConfig.colUpdateTime'), dataIndex: 'updateTime', key: 'updateTime', width: 180, render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-' },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'active' ? t('common.disable') : t('common.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('synonymConfig.searchMainWord')}>
            <Input placeholder={t('synonymConfig.searchMainWordPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('synonymConfig.searchType')}>
            <Select placeholder={t('common.all')} allowClear options={synonymTypeOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label={t('synonymConfig.searchScenario')}>
            <Select placeholder={t('common.all')} allowClear options={scenarioOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label={t('synonymConfig.searchStatus')}>
            <Select placeholder={t('common.all')} allowClear options={statusOptions} defaultValue="all" />
          </Form.Item>
          <Form.Item label={t('synonymConfig.searchUpdateTime')}>
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<DeleteOutlined />} danger onClick={handleBatchDelete}>{t('common.batchDelete')}</Button>
          <Button className="btn-import" icon={<ImportOutlined />}>{t('common.batchImport')}</Button>
          <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
          <span style={{ color: '#999', fontSize: 13 }}>
            {t('synonymConfig.totalPrefix')} <b style={{ color: '#E8720C' }}>{data.length}</b> {t('synonymConfig.totalSuffix')}
            {selectedRowKeys.length > 0 && <span>，{t('common.selectedCount', { count: selectedRowKeys.length })}</span>}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('synonymConfig.addSynonym')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<SynonymRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1300 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? t('synonymConfig.editTitle') : t('synonymConfig.addTitle')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={580}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label={t('synonymConfig.mainWordLabel')}
            name="mainWord"
            rules={[{ required: true, message: t('synonymConfig.mainWordRequired') }]}
            tooltip={t('synonymConfig.mainWordTooltip')}
          >
            <Input placeholder={t('synonymConfig.mainWordPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('synonymConfig.synonymLabel')}
            name="synonymWords"
            rules={[{ required: true, message: t('synonymConfig.synonymRequired') }]}
            tooltip={t('synonymConfig.synonymTooltip')}
          >
            <TextArea
              placeholder={t('synonymConfig.synonymPlaceholder')}
              rows={3}
              showCount
              maxLength={500}
            />
          </Form.Item>
          <Form.Item
            label={t('synonymConfig.typeLabel')}
            name="type"
            rules={[{ required: true, message: t('synonymConfig.typeRequired') }]}
          >
            <Select
              options={[
                { label: t('synonymConfig.typeOptionBidirectional'), value: 'bidirectional' },
                { label: t('synonymConfig.typeOptionUnidirectional'), value: 'unidirectional' },
              ]}
              placeholder={t('synonymConfig.typePlaceholder')}
            />
          </Form.Item>
          <Form.Item
            label={t('synonymConfig.scenarioLabel')}
            name="scenario"
            rules={[{ required: true, message: t('synonymConfig.scenarioRequired') }]}
          >
            <Select
              options={scenarioOptions.filter(o => o.value !== 'all')}
              placeholder={t('synonymConfig.scenarioPlaceholder')}
            />
          </Form.Item>
          <Form.Item label={t('synonymConfig.statusLabel')} name="status" valuePropName="checked">
            <Switch checkedChildren={t('synonymConfig.switchEnable')} unCheckedChildren={t('synonymConfig.switchDisable')} defaultChecked />
          </Form.Item>
          <Form.Item label={t('synonymConfig.remarkLabel')} name="remark">
            <TextArea placeholder={t('synonymConfig.remarkPlaceholder')} rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
