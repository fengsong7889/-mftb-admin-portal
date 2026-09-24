import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, Space, Table, Tag, Select, Form, Input, message, Modal, Switch, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import BrandTag from '../../components/BrandTag'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchWaterfallList, updateWaterfallStatus, deleteWaterfall, fetchAdAlgorithms } from '../../api/adPromotion'
import { isBackendUnavailable } from '../../api/request'
import {
  mergeServerToStrategies, mergeLocalToStrategies, listLocalStrategies,
  getLocalStrategy, upsertLocalStrategy, removeLocalStrategy, removeExtension,
} from '../waterfallConfig/waterfallExtStore'
import type { WaterfallListView, WaterfallBusinessType, WaterfallBizChannel } from '../waterfallConfig/types'
import { BUSINESS_TYPE_LABEL_KEY, BIZ_CHANNEL_OPTIONS } from '../waterfallConfig/types'

export default function PromotionSlotConfig() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const { t } = useTranslation()
  const [searchForm] = Form.useForm()
  const [activeBiz, setActiveBiz] = useState<WaterfallBusinessType>(searchParams.get('biz') === 'groupBuy' ? 'groupBuy' : 'delivery')
  const [allMerged, setAllMerged] = useState<WaterfallListView[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  /** 搜索条件快照（驱动客户端过滤重算，避免在依赖数组里调用 getFieldsValue） */
  const [searchValues, setSearchValues] = useState<Record<string, unknown>>({})
  /** 算法筛选选项 + 编码->频道映射（业务线推断用） */
  const [algoOptions, setAlgoOptions] = useState<{ label: string; value: number }[]>([])
  const algoChannelByCodeRef = useRef<Record<string, number>>({})

  /** 加载算法库：构建 algoCode->channel 映射，供业务线推断 */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 500 })
      .then(res => {
        const map: Record<string, number> = {}
        for (const a of res.records ?? []) { if (a.algoCode) map[a.algoCode] = a.channel ?? 0 }
        algoChannelByCodeRef.current = map
        setAlgoOptions((res.records ?? []).map(a => ({ label: a.algoName, value: a.id as number })))
      })
      .catch(() => { /* 保留空选项 */ })
  }, [])

  /** 加载列表：一次性拉取后端全量（大分页）+ 本地团购策略，统一归类后再筛选/分页 */
  const loadingRef = useRef(false)
  const load = useCallback(async (algoId?: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      let serverViews: WaterfallListView[] = []
      try {
        const res = await fetchWaterfallList({ page: 1, size: 1000, algoId })
        serverViews = mergeServerToStrategies(res?.records ?? [], algoChannelByCodeRef.current)
      } catch (apiErr) {
        if (isBackendUnavailable(apiErr)) { message.warning(t('promotionSlotConfig:backendUnavailable')) }
        else { message.error(t('promotionSlotConfig:loadFailed')) }
      }
      const localViews = mergeLocalToStrategies(listLocalStrategies())
      setAllMerged([...serverViews, ...localViews])
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [t])

  useEffect(() => { void load() }, [load, location.key])

  useEffect(() => {
    if (searchParams.get('biz') === 'groupBuy') setActiveBiz('groupBuy')
  }, [searchParams])

  /** 客户端按业务线 + 搜索条件过滤 */
  const filtered = useMemo(() => {
    const v = searchValues as {
      strategyCode?: string; strategyName?: string; brand?: string
      status?: number; bizChannel?: WaterfallBizChannel
    }
    return allMerged.filter(item => {
      if (item.businessType !== activeBiz) return false
      if (v.strategyCode && !(item.strategyCode || '').toLowerCase().includes(String(v.strategyCode).toLowerCase())) return false
      if (v.strategyName && !item.strategyName.toLowerCase().includes(String(v.strategyName).toLowerCase())) return false
      if (v.brand && item.brand !== v.brand) return false
      if (v.status && item.status !== v.status) return false
      if (v.bizChannel && item.bizChannel !== v.bizChannel) return false
      return true
    })
  }, [allMerged, activeBiz, searchValues])

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize])

  const handleSearch = () => {
    setPage(1)
    const v = searchForm.getFieldsValue()
    setSearchValues(v)
    load(v.algoId)
  }
  const handleReset = () => { searchForm.resetFields(); setPage(1); setSearchValues({}); load() }

  const handleAdd = () => navigate(`/promotion-slot-config-add?biz=${activeBiz}`)
  const handleEdit = (r: WaterfallListView) => {
    if (r.source === 'local') navigate(`/promotion-slot-config-add?localId=${r.localId}`)
    else navigate(`/promotion-slot-config-add?id=${r.id}`)
  }
  const handleDetail = (r: WaterfallListView) => {
    if (r.source === 'local') navigate(`/promotion-slot-config-add?localId=${r.localId}&mode=detail`)
    else navigate(`/promotion-slot-config-add?id=${r.id}&mode=detail`)
  }

  const handleToggleStatus = (r: WaterfallListView) => {
    const newStatus = r.status === 1 ? 2 : 1
    const actionText = newStatus === 1 ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('promotionSlotConfig.confirmToggleTitle', { action: actionText }),
      content: t('promotionSlotConfig.confirmToggleContent', { action: actionText, name: r.strategyName }),
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      onOk: async () => {
        if (r.source === 'local') {
          const d = getLocalStrategy(r.localId as string)
          if (d) upsertLocalStrategy({ ...d, status: newStatus })
        } else {
          await updateWaterfallStatus(r.id as number, newStatus)
        }
        message.success(t('promotionSlotConfig.toggleSuccess', { action: actionText, name: r.strategyName }))
        load()
      },
    })
  }

  const handleDelete = (r: WaterfallListView) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('promotionSlotConfig.confirmDeleteContent', { name: r.strategyName }),
      okText: t('common.confirm'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
      onOk: async () => {
        if (r.source === 'local') removeLocalStrategy(r.localId as string)
        else { await deleteWaterfall(r.id as number); removeExtension(r.id as number) }
        message.success(t('common.deleteSuccess'))
        load()
      },
    })
  }

  const columnMeta = useMemo(() => [
    { key: 'strategyCode', title: t('promotionSlotConfig.colConfigId') },
    { key: 'strategyName', title: t('promotionSlotConfig.colWaterfallName') },
    { key: 'bizChannel', title: t('promotionSlotConfig.colBizChannel') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'updatedBy', title: t('promotionSlotConfig.colLastUpdater') },
    { key: 'updatedAt', title: t('promotionSlotConfig.colLastUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('promotionSlotConfig', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<WaterfallListView> = [
    {
      title: t('promotionSlotConfig.colConfigId'), dataIndex: 'strategyCode', key: 'strategyCode', width: 170, align: 'center',
      render: (v: string, r) => (
        <Space size={4}>
          <Tag color="blue">{v || (r.source === 'local' ? t('promotionSlotConfig.localTag') : '-')}</Tag>
          {(r.source === 'local' || r.localOnly) && <Tag color="orange">{t('promotionSlotConfig.unpublishedTag')}</Tag>}
        </Space>
      ),
    },
    { title: t('promotionSlotConfig.colWaterfallName'), dataIndex: 'strategyName', key: 'strategyName', width: 200, render: (text: string) => <strong>{text}</strong> },
    {
      title: t('promotionSlotConfig.colBizChannel'), dataIndex: 'bizChannel', key: 'bizChannel', width: 120, align: 'center',
      render: (v: WaterfallBizChannel, record) => (
        <Tag color={record.businessType === 'groupBuy' || v === 'food' ? 'orange' : 'cyan'}>
          {record.businessType === 'groupBuy' ? t('promotionSlotConfig:bizGroupBuy') : BIZ_CHANNEL_OPTIONS.find(o => o.value === v)?.labelKey ? t(BIZ_CHANNEL_OPTIONS.find(o => o.value === v)!.labelKey) : (v || '-')}
        </Tag>
      ),
    },
    { title: t('common.colBrand'), dataIndex: 'brand', key: 'app', width: 100, render: (v: string) => <BrandTag value={v} /> },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (_: unknown, r) => (
        <Switch checked={r.status === 1} checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} onChange={() => handleToggleStatus(r)} />
      ),
    },
    { title: t('promotionSlotConfig.colLastUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span> },
    { title: t('promotionSlotConfig.colLastUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180, render: (v: string | number) => <span style={{ whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'}</span> },
    {
      title: t('common.colAction'), key: 'action', width: 200, fixed: 'right' as const,
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(r)}>{t('promotionSlotConfig.detail')}</Button>
          <Button type="link" size="small" onClick={() => handleEdit(r)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(r)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  const isDelivery = activeBiz === 'delivery'

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeBiz}
        onChange={k => { setActiveBiz(k as WaterfallBusinessType); setPage(1) }}
        items={[
          { key: 'delivery', label: t(BUSINESS_TYPE_LABEL_KEY.delivery) },
          { key: 'groupBuy', label: t(BUSINESS_TYPE_LABEL_KEY.groupBuy) },
        ]}
        style={{ marginBottom: 8 }}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label={t('promotionSlotConfig.colConfigId')} name="strategyCode">
            <Input placeholder={t('promotionSlotConfig.placeholderConfigId')} allowClear />
          </Form.Item>
          <Form.Item label={t('promotionSlotConfig.colWaterfallName')} name="strategyName">
            <Input placeholder={t('promotionSlotConfig.placeholderWaterfallName')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} allowClear style={{ width: 120 }} options={[{ label: t('common.flashBee'), value: 'flashBee' }, { label: 'mFood', value: 'mFood' }]} />
          </Form.Item>
          {isDelivery && (
            <Form.Item label={t('promotionSlotConfig.colBizChannel')} name="bizChannel">
              <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={BIZ_CHANNEL_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value }))} />
            </Form.Item>
          )}
          {isDelivery && (
            <Form.Item label={t('promotionSlotConfig.colAlgorithmName')} name="algoId">
              <Select placeholder={t('promotionSlotConfig.placeholderSelectAlgorithm')} allowClear showSearch style={{ width: 220 }} optionFilterProp="label" options={algoOptions} />
            </Form.Item>
          )}
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 100 }} options={[{ label: t('common.enable'), value: 1 }, { label: t('common.disable'), value: 2 }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('promotionSlotConfig.addStrategy')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallListView>
          columns={applyConfig(columns)}
          dataSource={paged}
          loading={loading}
          rowKey="key"
          pagination={{
            current: page, pageSize, total: filtered.length,
            showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
            onChange: (p, s) => { setPage(p); setPageSize(s) },
          }}
          size="small"
          scroll={{ x: 1200 }}
        />
      </div>
    </div>
  )
}
