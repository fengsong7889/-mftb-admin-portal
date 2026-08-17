import { useState , useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EyeOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import HintCreateModal from '../HintCreate'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'

const { RangePicker } = DatePicker

interface HintRecord {
  key: string
  hintId: string
  brand: string
  hintSource: string
  searchChannel: string
  region: string[]
  terminal: string[]
  effectStartDate: string
  effectEndDate: string
  lastUpdater: string
  lastUpdateTime: string
  status: string
  // 彈窗用字段
  hintWord?: string
  hotSearchRank?: number
  jumpType?: string
  jumpTarget?: string
  timeSlot?: string
  crowd?: string
}

const mockData: HintRecord[] = [
  { key: '1', hintId: 'DW20261221', brand: 'mFood', hintSource: 'operation', searchChannel: 'home', region: ['macau'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '今日特惠外賣', jumpType: 'appPage', jumpTarget: 'checkInCenter', timeSlot: 'lunch', crowd: 'all' },
  { key: '2', hintId: 'DW20261222', brand: 'flashBee', hintSource: 'hotSearch', searchChannel: 'takeaway', region: ['macau', 'taipa'], terminal: ['app', 'mpayMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 5, timeSlot: 'allDay', crowd: 'all' },
  { key: '3', hintId: 'DW20261223', brand: 'mFood', hintSource: 'operation', searchChannel: 'home', region: ['costa'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '新鮮水果送到家', jumpType: 'h5', jumpTarget: 'https://m.flashbee.com/fruit', timeSlot: 'allDay', crowd: 'all' },
  { key: '4', hintId: 'DW20261224', brand: 'flashBee', hintSource: 'operation', searchChannel: 'takeaway', region: ['macau', 'taipa'], terminal: ['app', 'wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hintWord: '下午茶限時折扣', jumpType: 'appPage', jumpTarget: 'couponPage', timeSlot: 'afternoonTea', crowd: 'vip' },
  { key: '5', hintId: 'DW20261225', brand: 'mFood', hintSource: 'hotSearch', searchChannel: 'home', region: ['taipa', 'venetian'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 10, timeSlot: 'dinner', crowd: 'all' },
  { key: '6', hintId: 'DW20261226', brand: 'flashBee', hintSource: 'operation', searchChannel: 'groupBuy', region: ['macauUni'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '團購好券天天領', jumpType: 'appPage', jumpTarget: 'claimCenter', timeSlot: 'allDay', crowd: 'newUser' },
  { key: '7', hintId: 'DW20261227', brand: 'mFood', hintSource: 'operation', searchChannel: 'takeaway', region: ['macau'], terminal: ['wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hintWord: '限時火鍋優惠', jumpType: 'h5', jumpTarget: 'https://mfood.com/hotpot', timeSlot: 'dinner', crowd: 'oldUser' },
  { key: '8', hintId: 'DW20261228', brand: 'flashBee', hintSource: 'hotSearch', searchChannel: 'home', region: ['macau', 'costa'], terminal: ['app', 'mpayMini', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hotSearchRank: 5, timeSlot: 'lunch', crowd: 'all' },
  { key: '9', hintId: 'DW20261229', brand: 'mFood', hintSource: 'operation', searchChannel: 'takeaway', region: ['taipa'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '宵夜狂歡夜', jumpType: 'appPage', jumpTarget: 'shopDetail', timeSlot: 'midnightSnack', crowd: 'all' },
  { key: '10', hintId: 'DW20261230', brand: 'flashBee', hintSource: 'operation', searchChannel: 'home', region: ['macau', 'macauUni'], terminal: ['app', 'wechatH5'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '古月(001)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '早餐新選擇', jumpType: 'none', timeSlot: 'breakfast', crowd: 'newUser' },
  { key: '11', hintId: 'DW20261231', brand: 'mFood', hintSource: 'hotSearch', searchChannel: 'home', region: ['macau', 'taipa'], terminal: ['app', 'wechatMini'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '加侖(002)', lastUpdateTime: '2026-02-28 18:20:21', status: 'inactive', hotSearchRank: 10, timeSlot: 'allDay', crowd: 'all' },
  { key: '12', hintId: 'DW20261232', brand: 'flashBee', hintSource: 'operation', searchChannel: 'supermarket', region: ['costa', 'venetian'], terminal: ['app'], effectStartDate: '2026-02-28', effectEndDate: '2027-02-28', lastUpdater: '浩源(003)', lastUpdateTime: '2026-02-28 18:20:21', status: 'active', hintWord: '超市新人專享', jumpType: 'appPage', jumpTarget: 'personalCenter', timeSlot: 'allDay', crowd: 'newUser' },
]

export default function HintConfig() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HintRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<HintRecord | null>(null)
  const [hintType, setHintType] = useState<string>('operation')
  const [form] = Form.useForm()

  const _handleAdd = () => {
    setEditingRecord(null)
    setHintType('operation')
    form.resetFields()
    form.setFieldsValue({ hintSource: 'operation', status: 'active', timeSlot: 'allDay', crowd: 'all', region: ['macau'], terminal: ['app'] })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HintRecord) => {
    setEditingRecord(record)
    setHintType(record.hintSource)
    form.setFieldsValue({
      ...record,
      dateRange: record.effectStartDate && record.effectEndDate ? [record.effectStartDate, record.effectEndDate] : undefined,
    })
    setIsModalOpen(true)
  }

  const handleDetail = (record: HintRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleToggleStatus = (record: HintRecord) => {
    const newStatus = record.status === 'active' ? t('common.disable') : t('common.enable')
    Modal.confirm({
      title: t('common.confirmOperation'),
      content: t('hintConfig.toggleContent', { status: newStatus }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => message.success(t('hintConfig.toggled', { status: newStatus })),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? t('common.updateSuccess') : t('common.addSuccess'))
      setIsModalOpen(false)
    })
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'hintId', title: t('hintConfig.colHintId') },
    { key: 'brand', title: t('hintConfig.colBrand') },
    { key: 'hintSource', title: t('hintConfig.colHintSource') },
    { key: 'searchChannel', title: t('hintConfig.colSearchChannel') },
    { key: 'region', title: t('hintConfig.colRegion') },
    { key: 'terminal', title: t('hintConfig.colTerminal') },
    { key: 'timeSlot', title: t('hintConfig.colTimeSlot') },
    { key: 'effectDate', title: t('hintConfig.colEffectDate') },
    { key: 'lastUpdater', title: t('hintConfig.colLastUpdater') },
    { key: 'lastUpdateTime', title: t('hintConfig.colLastUpdateTime') },
    { key: 'status', title: t('hintConfig.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const regionOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.region.macau'), value: 'macau' },
    { label: t('dict.region.taipa'), value: 'taipa' },
    { label: t('dict.region.costa'), value: 'costa' },
    { label: t('dict.region.venetian'), value: 'venetian' },
    { label: t('dict.region.macauUni'), value: 'macauUni' },
  ]

  const terminalOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.terminal.app'), value: 'app' },
    { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
    { label: t('dict.terminal.mpayMini'), value: 'mpayMini' },
    { label: t('dict.terminal.wechatH5'), value: 'wechatH5' },
  ]

  const statusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.status.active'), value: 'active' },
    { label: t('dict.status.inactive'), value: 'inactive' },
  ]

  const hintSourceOptions = [
    { label: t('dict.hintSource.operation'), value: 'operation' },
    { label: t('dict.hintSource.hotSearch'), value: 'hotSearch' },
  ]

  const searchChannelOptions = [
    { label: t('dict.channel.home'), value: 'home' },
    { label: t('dict.channel.takeawayChannel'), value: 'takeaway' },
    { label: t('dict.channel.groupBuyChannel'), value: 'groupBuy' },
    { label: t('dict.channel.supermarketChannel'), value: 'supermarket' },
  ]

  const jumpTypeOptions = [
    { label: t('dict.jumpType.none'), value: 'none' },
    { label: t('dict.jumpType.h5'), value: 'h5' },
    { label: t('dict.jumpType.appPage'), value: 'appPage' },
  ]

  const appPageOptions = [
    { label: t('dict.jumpType.personalCenter'), value: 'personalCenter' },
    { label: t('dict.jumpType.checkInCenter'), value: 'checkInCenter' },
    { label: t('dict.jumpType.claimCenter'), value: 'claimCenter' },
    { label: t('dict.jumpType.couponPage'), value: 'couponPage' },
    { label: t('dict.jumpType.shopDetail'), value: 'shopDetail' },
  ]

  const hotSearchRankOptions = [
    { label: t('hintConfig.rankTop5'), value: 5 },
    { label: t('hintConfig.rankTop10'), value: 10 },
  ]

  const timeSlotOptions = [
    { label: t('dict.timeSlot.allDay'), value: 'allDay' },
    { label: t('dict.timeSlot.breakfast'), value: 'breakfast' },
    { label: t('dict.timeSlot.lunch'), value: 'lunch' },
    { label: t('dict.timeSlot.afternoonTea'), value: 'afternoonTea' },
    { label: t('dict.timeSlot.dinner'), value: 'dinner' },
    { label: t('dict.timeSlot.midnightSnack'), value: 'midnightSnack' },
  ]

  const crowdOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.crowd.newUser'), value: 'newUser' },
    { label: t('dict.crowd.oldUser'), value: 'oldUser' },
    { label: t('dict.crowd.vip'), value: 'vip' },
  ]

  const channelMap: Record<string, string> = { home: t('dict.channel.home'), takeaway: t('dict.channel.takeawayChannel'), groupBuy: t('dict.channel.groupBuyChannel'), supermarket: t('dict.channel.supermarketChannel') }
  const terminalMap: Record<string, string> = { app: t('dict.terminal.app'), wechatMini: t('dict.terminal.wechatMini'), mpayMini: t('dict.terminal.mpayMini'), wechatH5: t('dict.terminal.wechatH5') }
  const regionMap: Record<string, string> = { macau: t('dict.region.macau'), taipa: t('dict.region.taipa'), costa: t('dict.region.costa'), venetian: t('dict.region.venetian'), macauUni: t('dict.region.macauUni') }
  const hintSourceMap: Record<string, string> = { operation: t('dict.hintSource.operation'), hotSearch: t('dict.hintSource.hotSearch') }
  const timeSlotMap: Record<string, string> = { allDay: t('dict.timeSlot.allDay'), breakfast: t('dict.timeSlot.breakfast'), lunch: t('dict.timeSlot.lunch'), afternoonTea: t('dict.timeSlot.afternoonTea'), dinner: t('dict.timeSlot.dinner'), midnightSnack: t('dict.timeSlot.midnightSnack') }
  const crowdMap: Record<string, string> = { all: t('common.all'), newUser: t('dict.crowd.newUser'), oldUser: t('dict.crowd.oldUser'), vip: t('dict.crowd.vip') }

  const { configComponent, applyConfig } = useColumnConfig('hint-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<HintRecord> = [
    {
      title: t('hintConfig.colHintId'),
      dataIndex: 'hintId',
      key: 'hintId',
      width: 130,
    },
    {
      title: t('hintConfig.colBrand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    {
      title: t('hintConfig.colHintSource'),
      dataIndex: 'hintSource',
      key: 'hintSource',
      width: 100,
      render: (v: string) => <Tag color={v === 'operation' ? 'blue' : 'orange'}>{hintSourceMap[v]}</Tag>,
    },
    {
      title: t('hintConfig.colSearchChannel'),
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 100,
      render: (v: string) => channelMap[v] || v,
    },
    {
      title: t('hintConfig.colRegion'),
      dataIndex: 'region',
      key: 'region',
      width: 130,
      render: (v: string[]) => v.map(r => regionMap[r] || r).join('、'),
    },
    {
      title: t('hintConfig.colTerminal'),
      dataIndex: 'terminal',
      key: 'terminal',
      width: 170,
      render: (v: string[]) => v.map(t => terminalMap[t] || t).join('、'),
    },
    {
      title: t('hintConfig.colTimeSlot'),
      dataIndex: 'timeSlot',
      key: 'timeSlot',
      width: 100,
      render: (v: string) => timeSlotMap[v] || v,
    },
    {
      title: t('hintConfig.colEffectDate'),
      key: 'effectDate',
      width: 200,
      render: (_, r) => `${r.effectStartDate} - ${r.effectEndDate}`,
    },
    {
      title: t('hintConfig.colLastUpdater'),
      dataIndex: 'lastUpdater',
      key: 'lastUpdater',
      width: 120,
    },
    {
      title: t('hintConfig.colLastUpdateTime'),
      dataIndex: 'lastUpdateTime',
      key: 'lastUpdateTime',
      width: 170,
    },
    {
      title: t('hintConfig.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => v === 'active'
        ? <Tag color="success">{t('dict.status.active')}</Tag>
        : <Tag color="default">{t('dict.status.inactive')}</Tag>,
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            style={record.status !== 'active' ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? t('common.disable') : t('common.enable')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('hintConfig.searchHintId')}>
            <Input placeholder={t('hintConfig.searchHintIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchBrand')}>
            <Select placeholder={t('common.all')} allowClear options={brandOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchChannel')}>
            <Select placeholder={t('common.all')} allowClear options={searchChannelOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchTimeSlot')}>
            <Select placeholder={t('common.all')} allowClear options={timeSlotOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchRegion')}>
            <Select placeholder={t('common.all')} allowClear options={regionOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchStatus')}>
            <Select placeholder={t('common.all')} allowClear options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchEffectTime')}>
            <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchTerminal')}>
            <Select placeholder={t('common.all')} allowClear options={terminalOptions} />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchUpdater')}>
            <Input placeholder={t('hintConfig.searchUpdaterPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('hintConfig.searchUpdateTime')}>
            <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
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
          <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hint-verify')}>{t('common.preview')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>{t('common.add')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HintRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
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
          scroll={{ x: 1400 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? t('hintConfig.editTitle') : t('hintConfig.addTitle')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t('hintConfig.hintSourceLabel')} name="hintSource" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
            <Select options={hintSourceOptions} onChange={(v) => setHintType(v)} />
          </Form.Item>

          {hintType === 'operation' && (
            <>
              <Form.Item label={t('hintConfig.hintWordLabel')} name="hintWord" rules={[{ required: true, message: t('hintConfig.hintWordRequired') }]}>
                <Input placeholder={t('hintConfig.hintWordPlaceholder')} maxLength={20} showCount />
              </Form.Item>
              <Form.Item label={t('hintConfig.jumpTypeLabel')} name="jumpType">
                <Select options={jumpTypeOptions} placeholder={t('hintConfig.jumpTypePlaceholder')} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.jumpType !== cur.jumpType}>
                {({ getFieldValue }) => {
                  const jumpType = getFieldValue('jumpType')
                  if (jumpType === 'h5') {
                    return (
                      <Form.Item label={t('hintConfig.h5LinkLabel')} name="jumpTarget" rules={[{ required: true, message: t('hintConfig.h5LinkRequired') }]}>
                        <Input placeholder={t('hintConfig.h5LinkPlaceholder')} />
                      </Form.Item>
                    )
                  }
                  if (jumpType === 'appPage') {
                    return (
                      <Form.Item label={t('hintConfig.appPageLabel')} name="jumpTarget" rules={[{ required: true, message: t('hintConfig.appPageRequired') }]}>
                        <Select options={appPageOptions} placeholder={t('hintConfig.appPagePlaceholder')} />
                      </Form.Item>
                    )
                  }
                  return null
                }}
              </Form.Item>
            </>
          )}

          {hintType === 'hotSearch' && (
            <Form.Item label={t('hintConfig.hotSearchRankLabel')} name="hotSearchRank" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
              <Select options={hotSearchRankOptions} placeholder={t('hintConfig.hotSearchRankPlaceholder')} />
            </Form.Item>
          )}

          <Form.Item label={t('hintConfig.colBrand')} name="brand" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
            <Select options={brandOptions.filter(o => o.value !== 'all')} placeholder={t('hintConfig.selectRequired')} />
          </Form.Item>

          <Form.Item label={t('hintConfig.colTerminal')} name="terminal" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
            <Select mode="multiple" options={terminalOptions.filter(o => o.value !== 'all')} placeholder={t('hintConfig.terminalPlaceholder')} />
          </Form.Item>

          <Form.Item label={t('hintConfig.colRegion')} name="region" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
            <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} placeholder={t('hintConfig.regionPlaceholder')} />
          </Form.Item>

          <Space size={24}>
            <Form.Item label={t('hintConfig.colTimeSlot')} name="timeSlot" rules={[{ required: true, message: t('hintConfig.selectRequired') }]}>
              <Select options={timeSlotOptions} placeholder={t('hintConfig.selectRequired')} />
            </Form.Item>
            <Form.Item label={t('hintConfig.crowdLabel')} name="crowd">
              <Select options={crowdOptions} placeholder={t('hintConfig.selectRequired')} />
            </Form.Item>
          </Space>

          <Form.Item label={t('hintConfig.effectDateLabel')} name="dateRange" rules={[{ required: true, message: t('hintConfig.effectDateRequired') }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title={t('hintConfig.detailTitle')}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlHintId')}</span>{detailRecord.hintId}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlBrand')}</span><BrandTag value={detailRecord.brand} /></div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlHintSource')}</span>{hintSourceMap[detailRecord.hintSource]}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlHintWord')}</span>{detailRecord.hintWord || (detailRecord.hotSearchRank ? t('hintConfig.dlRank', { rank: detailRecord.hotSearchRank }) : '-')}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlRegion')}</span>{detailRecord.region.map(r => regionMap[r]).join('、')}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlTerminal')}</span>{detailRecord.terminal.map(t => terminalMap[t]).join('、')}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlEffectDate')}</span>{detailRecord.effectStartDate} - {detailRecord.effectEndDate}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlStatus')}</span>{detailRecord.status === 'active' ? <Tag color="success">{t('dict.status.active')}</Tag> : <Tag color="default">{t('dict.status.inactive')}</Tag>}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlUpdater')}</span>{detailRecord.lastUpdater}</div>
              <div><span style={{ color: '#999' }}>{t('hintConfig.dlUpdateTime')}</span>{detailRecord.lastUpdateTime}</div>
              {detailRecord.jumpType && detailRecord.jumpType !== 'none' && (
                <>
                  <div><span style={{ color: '#999' }}>{t('hintConfig.dlJumpType')}</span>{jumpTypeOptions.find(o => o.value === detailRecord.jumpType)?.label}</div>
                  <div><span style={{ color: '#999' }}>{t('hintConfig.dlJumpTarget')}</span>{detailRecord.jumpTarget}</div>
                </>
              )}
              {detailRecord.timeSlot && <div><span style={{ color: '#999' }}>{t('hintConfig.dlTimeSlot')}</span>{timeSlotMap[detailRecord.timeSlot]}</div>}
              {detailRecord.crowd && <div><span style={{ color: '#999' }}>{t('hintConfig.dlCrowd')}</span>{crowdMap[detailRecord.crowd]}</div>}
            </div>
          </div>
        )}
      </Modal>

      {/* 新增底纹词弹窗 */}
      <HintCreateModal
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          message.success(t('common.addSuccess'))
          // 这里可以添加刷新列表的逻辑
        }}
      />
    </div>
  )
}
