import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Space, Table, Tag, Select, Form, Input, message, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../components/BrandTag'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  fetchWaterfallList, updateWaterfallStatus, deleteWaterfall,
  fetchAdAlgorithms, withAdFallback,
} from '../../api/adPromotion'
import type { WaterfallStrategy } from '../../api/adPromotion'

/** 伪随机数生成器（本地演示数据用） */
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** 推广名称虚拟数据 */
const PROMOTION_NAMES = [
  '无敌星星国庆推广', '新店广告中秋特惠', '盘活广告双十一狂欢',
  '独家商家周年庆', '流量广告圣诞特卖', '猜你喜欢新年推荐',
  '自然流量春季大促', '搜索算法开学季', '无敌星星情人节专场',
  '新店广告夏季清凉', '盘活广告秋季美食', '独家商家冬季暖锅',
  '流量广告周末特惠', '猜你喜欢月末冲刺', '自然流量节日庆典',
  '搜索算法品牌周',
]

/** Mock数据 - 后端不可用时降级展示 */
// eslint-disable-next-line react-refresh/only-export-components
export const mockData: WaterfallStrategy[] = (() => {
  const appPool = ['flashBee', 'mFood']
  const data: WaterfallStrategy[] = []
  for (let i = 0; i < 24; i++) {
    const id = i + 1
    data.push({
      id,
      strategyName: PROMOTION_NAMES[i % PROMOTION_NAMES.length],
      brand: appPool[i % appPool.length],
      status: pseudoRandom(id * 100 + 5) > 0.2 ? 1 : 2,
      updatedBy: 'admin',
      updatedAt: `2024-01-${String(20 + Math.floor(id / 3)).padStart(2, '0')} 10:00:00`,
      slots: [],
    })
  }
  return data
})()

/** 算法名称筛选选项（后端不可用时降级） */
const MOCK_ALGO_OPTIONS = [
  { label: '無敵星星-首頁黃金展位', value: 1 },
]

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
  /** 后端不可用降级标记: true 时查询走本地 Mock 过滤 */
  const [mockMode, setMockMode] = useState(false)
  /** 算法名称筛选选项（来自算法库） */
  const [algoOptions, setAlgoOptions] = useState<{ label: string; value: number }[]>(MOCK_ALGO_OPTIONS)

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

  /** 加载列表: 后端可用走服务端分页, 不可用降级本地 Mock 过滤 */
  const load = useCallback(async (p: number, s: number, values?: Record<string, unknown>) => {
    const v = values ?? searchForm.getFieldsValue()
    setLoading(true)
    try {
      if (mockMode) {
        let result = [...mockData]
        if (v.id) result = result.filter(item => String(item.id).includes(String(v.id)))
        if (v.strategyName) result = result.filter(item => item.strategyName.includes(String(v.strategyName)))
        if (v.brand) result = result.filter(item => item.brand === v.brand)
        if (v.status) result = result.filter(item => item.status === v.status)
        setData(result)
        setTotal(result.length)
      } else {
        const res = await withAdFallback(
          () => fetchWaterfallList({
            page: p, size: s,
            id: v.id ? Number(v.id) : undefined,
            strategyName: v.strategyName || undefined,
            brand: v.brand || undefined,
            status: v.status,
            algoId: v.algoId,
          }),
          async () => {
            setMockMode(true)
            return { records: mockData, total: mockData.length }
          },
        )
        setData(res.records)
        setTotal(res.total)
      }
    } finally {
      setLoading(false)
    }
  }, [mockMode, searchForm])

  // 初始化查询
  useEffect(() => {
    load(1, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (mockMode) {
          setData(prev => prev.map(item =>
            item.id === record.id ? { ...item, status: newStatus } : item
          ))
          message.success(t('promotionSlotConfig.toggleSuccess', { action: actionText, name: record.strategyName }))
          return
        }
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
        if (mockMode) {
          setData(prev => prev.filter(item => item.id !== record.id))
          message.success(t('common.deleteSuccess'))
          return
        }
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
    { key: 'id', title: t('promotionSlotConfig.colConfigId') },
    { key: 'strategyName', title: t('promotionSlotConfig.colWaterfallName') },
    { key: 'app', title: t('common.colBrand') },
    { key: 'status', title: t('common.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('promotionSlotConfig', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 列定义
  const columns: ColumnsType<WaterfallStrategy> = [
    {
      title: t('promotionSlotConfig.colConfigId'),
      dataIndex: 'id',
      key: 'id',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="blue">{String(v).padStart(6, '0')}</Tag>
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
          <Form.Item label={t('promotionSlotConfig.colConfigId')} name="id">
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
            onChange: (p, s) => {
              setPage(p)
              setPageSize(s)
              load(p, s)
            },
          }}
          size="small"
          rowKey="id"
          scroll={{ x: 1200 }}
        />
      </div>


    </div>
  )
}
