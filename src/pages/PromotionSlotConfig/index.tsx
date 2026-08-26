import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, Space, Table, Tag, Select, Form, Input, message, Modal, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import BrandTag from '../../components/BrandTag'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchWaterfallList, updateWaterfallStatus, deleteWaterfall,
  fetchAdAlgorithms,
} from '../../api/adPromotion'
import { isBackendUnavailable } from '../../api/request'
import type { WaterfallStrategy } from '../../api/adPromotion'

export default function PromotionSlotConfig() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  /** 状态标签: 1=启用 2=停用（依赖 t，定义在组件内以便响应语言切换） */
  const statusLabel = (v: number) => (v === 1 ? t('common.enable') : t('common.disable'))
  const [searchForm] = Form.useForm()
  const [data, setData] = useState<WaterfallStrategy[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  /** 算法名称筛选选项（来自算法库） */
  const [algoOptions, setAlgoOptions] = useState<{ label: string; value: number }[]>([])

  /** 算法名称选项: 来自算法库已启用算法（当前仅无敌星星接入） */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, status: 1 })
      .then(res => {
        if (res.records.length > 0) {
          setAlgoOptions(res.records.map(a => ({ label: a.algoName, value: a.id as number })))
        }
      })
      .catch(() => { /* 保留降级选项 */ })
  }, [])

  /** 加载列表: 始终优先尝试后端 API，失败时降级本地 Mock */
  const loadingRef = useRef(false)
  const load = useCallback(async (p: number, s: number, values?: Record<string, unknown>) => {
    if (loadingRef.current) {
      console.log('[WaterfallList] load 被跳过（上一次仍在进行）')
      return
    }
    loadingRef.current = true
    const v = values ?? searchForm.getFieldsValue()
    console.log('[WaterfallList] load 开始, page=', p, 'pageSize=', s, new Error().stack?.split('\n').slice(1, 4).join(' | '))
    setLoading(true)
    try {
      try {
        const res = await fetchWaterfallList({
          page: p, size: s,
          id: v.id ? Number(v.id) : undefined,
          strategyCode: v.strategyCode || undefined,
          strategyName: v.strategyName || undefined,
          brand: v.brand || undefined,
          status: v.status,
          algoId: v.algoId,
          updatedBy: v.updatedBy || undefined,
          updatedAtStart: Array.isArray(v.updatedAtRange) && v.updatedAtRange[0] ? (v.updatedAtRange[0] as dayjs.Dayjs).startOf('day').format('YYYY-MM-DD HH:mm:ss') : undefined,
          updatedAtEnd: Array.isArray(v.updatedAtRange) && v.updatedAtRange[1] ? (v.updatedAtRange[1] as dayjs.Dayjs).endOf('day').format('YYYY-MM-DD HH:mm:ss') : undefined,
        })
        console.log('[WaterfallList] API 成功, records=', res?.records?.length ?? 'null/undefined', 'total=', res?.total)
        setData(res?.records ?? [])
        setTotal(res?.total ?? 0)
      } catch (apiErr) {
        if (isBackendUnavailable(apiErr)) {
          console.warn('[WaterfallList] 后端不可用，顯示空白列表')
        } else {
          const status = (apiErr as { response?: { status?: number } })?.response?.status
          const msg = (apiErr as Error)?.message || '未知错误'
          console.error('[WaterfallList] API 业务错误:', status, msg)
          if (status === 403) {
            message.error('沒有權限訪問瀑布流配置，請聯繫管理員授權')
          } else {
            message.error(`加載列表失敗: ${msg}`)
          }
        }
        setData([])
        setTotal(0)
      }
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [searchForm])

  // 初始化查询（仅挂载时执行一次）
  useEffect(() => {
    load(1, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 稳定的分页 onChange 引用（避免每次渲染创建新函数导致 Table 重复触发）
  const loadRef = useRef(load)
  loadRef.current = load
  const handlePaginationChange = useCallback((p: number, s: number) => {
    setPage(p)
    setPageSize(s)
    loadRef.current(p, s)
  }, [])

  // 编辑
  const handleEdit = (record: WaterfallStrategy) => {
    navigate(`/promotion-slot-config-add?id=${record.id}`)
  }

  // 查看详情
  const handleViewDetail = (record: WaterfallStrategy) => {
    navigate(`/promotion-slot-config-add?id=${record.id}&mode=detail`)
  }

  // 启用/停用
  const handleToggleStatus = (record: WaterfallStrategy) => {
    const newStatus = record.status === 1 ? 2 : 1
    const actionText = newStatus === 1 ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('promotionSlotConfig.confirmToggleTitle', { action: actionText }),
      content: t('promotionSlotConfig.confirmToggleContent', { action: actionText, name: record.strategyName }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateWaterfallStatus(record.id as number, newStatus)
        message.success(t('promotionSlotConfig.toggleSuccess', { action: actionText, name: record.strategyName }))
        load(page, pageSize)
      },
    })
  }

  // 删除
  const handleDelete = (record: WaterfallStrategy) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('promotionSlotConfig.confirmDeleteContent', { name: record.strategyName }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteWaterfall(record.id as number)
        message.success(t('common.deleteSuccess'))
        load(page, pageSize)
      },
    })
  }

  // 搜索处理
  const handleSearch = () => {
    setPage(1)
    load(1, pageSize)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setPage(1)
    load(1, pageSize, {})
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'strategyCode', title: t('promotionSlotConfig.colConfigId') },
    { key: 'strategyName', title: t('promotionSlotConfig.colWaterfallName') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'updatedBy', title: t('promotionSlotConfig.colLastUpdater') },
    { key: 'updatedAt', title: t('promotionSlotConfig.colLastUpdateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('promotionSlotConfig', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 列定义
  const columns: ColumnsType<WaterfallStrategy> = [
    {
      title: t('promotionSlotConfig.colConfigId'),
      dataIndex: 'strategyCode',
      key: 'strategyCode',
      width: 160,
      align: 'center',
      render: (v: string) => (
        <Tag color="blue">{v || '-'}</Tag>
      ),
    },
    {
      title: t('promotionSlotConfig.colWaterfallName'),
      dataIndex: 'strategyName',
      key: 'strategyName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: t('common.colBrand'),
      dataIndex: 'brand',
      key: 'app',
      width: 100,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: number) => (
        <Tag color={v === 1 ? 'success' : 'default'}>
          {statusLabel(v)}
        </Tag>
      ),
    },
    {
      title: t('promotionSlotConfig.colLastUpdater'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '-'}</span>,
    },
    {
      title: t('promotionSlotConfig.colLastUpdateTime'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string | number) => <span style={{ whiteSpace: 'nowrap' }}>{v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>,
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            {t('promotionSlotConfig.detail')}
          </Button>
          <Button 
            type="link" 
            size="small"
            danger={record.status === 1}
            style={record.status !== 1 ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 1 ? t('common.disable') : t('common.enable')}
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleEdit(record)}
          >
            {t('common.edit')}
          </Button>
          <Button 
            type="link" 
            size="small"
            danger
            onClick={() => handleDelete(record)}
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
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
            <Select 
              placeholder={t('common.all')} 
              allowClear
              style={{ width: 120 }}
              options={[
                { label: t('common.flashBee'), value: 'flashBee' },
                { label: 'mFood', value: 'mFood' },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('promotionSlotConfig.colAlgorithmName')} name="algoId">
            <Select 
              placeholder={t('promotionSlotConfig.placeholderSelectAlgorithm')} 
              allowClear
              showSearch
              style={{ width: 220 }}
              optionFilterProp="label"
              options={algoOptions}
            />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select 
              placeholder={t('common.all')}
              allowClear
              style={{ width: 100 }}
              options={[
                { label: t('common.enable'), value: 1 },
                { label: t('common.disable'), value: 2 },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('promotionSlotConfig.colLastUpdater')} name="updatedBy">
            <Input placeholder={t('promotionSlotConfig.placeholderUpdater')} allowClear />
          </Form.Item>
          <Form.Item label={t('promotionSlotConfig.colLastUpdateTime')} name="updatedAtRange">
            <DatePicker.RangePicker style={{ width: '100%' }} allowClear />
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
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate('/promotion-slot-config-add')}
          >
            {t('promotionSlotConfig.addStrategy')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallStrategy>
          columns={applyConfig(columns)}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
            onChange: handlePaginationChange,
          }}
          size="small"
          rowKey="id"
          scroll={{ x: 1200 }}
        />
      </div>


    </div>
  )
}
