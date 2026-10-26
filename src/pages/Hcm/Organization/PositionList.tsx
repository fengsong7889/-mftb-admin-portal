/**
 * 崗位與編制列表（/hcm-org-position）
 *
 * 一個崗位 = 組織裡的一個坑位：掛在哪級組織、要求什麼職位、核定幾個編制。
 * 本頁只顯示「核定編制」；「在職佔用」要等 C2 的任職事實（Assignment）反算，
 * 屆時在同一張表上補兩列即可，不在本期用手填數字冒充。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  deletePosition,
  jobGradeOptions,
  listPositions,
  unitTree,
  updatePosition,
  type OrgJobGrade,
  type OrgPosition,
  type OrgUnitNode,
} from '@/api/hcmOrganization'

interface Filters {
  keyword?: string
  status?: number
  unitId?: number
  jobGradeId?: number
}

/** 组织树拍平成下拉选项，用缩进表示层级（TreeSelect 在搜索区里太占高度） */
function flattenUnits(nodes: OrgUnitNode[], depth = 0): Array<{ value: number; label: string }> {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}(${node.code})` },
    ...flattenUnits(node.children ?? [], depth + 1),
  ])
}

export default function HcmOrgPositionList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<OrgPosition[]>([])
  const [units, setUnits] = useState<OrgUnitNode[]>([])
  const [grades, setGrades] = useState<OrgJobGrade[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const res = await listPositions({ page: nextPage, size: nextSize, ...nextFilters })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    void loadData(page, pageSize, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  useEffect(() => {
    unitTree({}).then(setUnits).catch(() => setUnits([]))
    jobGradeOptions().then(setGrades).catch(() => setGrades([]))
  }, [])

  const unitOptions = useMemo(() => flattenUnits(units), [units])
  const unitNames = useMemo(() => new Map(unitOptions.map((item) => [item.value, item.label.trim()])), [unitOptions])
  const gradeNames = useMemo(
    () => new Map(grades.filter((item) => item.id).map((item) => [item.id as number, `${item.name}(${item.code})`])),
    [grades],
  )

  const handleSearch = () => {
    setPage(1)
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: OrgPosition) => {
    Modal.confirm({
      title: t('hcmOrg.position.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmOrg.position.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('hcmOrg.position.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deletePosition(record.id as number)
        message.success(t('hcmOrg.position.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggleStatus = (record: OrgPosition) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updatePosition(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = [
    { key: 'code', title: t('hcmOrg.position.code') },
    { key: 'name', title: t('hcmOrg.position.name') },
    { key: 'unitId', title: t('hcmOrg.position.unit') },
    { key: 'jobGradeId', title: t('hcmOrg.position.jobGrade') },
    { key: 'headcount', title: t('hcmOrg.position.headcount') },
    { key: 'occupiedCount', title: t('hcmOrg.position.occupied') },
    { key: 'vacancy', title: t('hcmOrg.position.vacancy') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } = useColumnConfig('hcm-org-position', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<OrgPosition> = [
    { key: 'code', title: t('hcmOrg.position.code'), dataIndex: 'code', width: 170 },
    { key: 'name', title: t('hcmOrg.position.name'), dataIndex: 'name' },
    {
      key: 'unitId', title: t('hcmOrg.position.unit'), dataIndex: 'unitId', width: 220,
      render: (value: number) => unitNames.get(value) ?? '-',
    },
    {
      key: 'jobGradeId', title: t('hcmOrg.position.jobGrade'), dataIndex: 'jobGradeId', width: 200,
      render: (value: number) => gradeNames.get(value) ?? '-',
    },
    {
      key: 'headcount', title: t('hcmOrg.position.headcount'), dataIndex: 'headcount', width: 120,
      render: (value: number) => (value > 0 ? value : <Tag color="default">{t('hcmOrg.position.notSet')}</Tag>),
    },
    {
      key: 'occupiedCount', title: t('hcmOrg.position.occupied'), dataIndex: 'occupiedCount', width: 110,
      render: (value: number) => value ?? 0,
    },
    {
      key: 'vacancy', title: t('hcmOrg.position.vacancy'), dataIndex: 'vacancy', width: 140,
      render: (value: number, record) => {
        if (record.overHeadcount) {
          return <Tag color="red">{t('hcmOrg.position.over', { count: Math.abs(value) })}</Tag>
        }
        if (!record.headcount) {
          return <Tag color="default">{t('hcmOrg.position.notSet')}</Tag>
        }
        return value
      },
    },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    {
      key: 'action', title: t('common.action'), width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-position-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-position-form?id=${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 1 ? t('hcmOrg.disable') : t('hcmOrg.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('hcmOrg.position.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="unitId" label={t('hcmOrg.position.unit')} style={{ marginBottom: 0 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder={t('hcmOrg.all')} options={unitOptions} />
            </Form.Item>
            <Form.Item name="jobGradeId" label={t('hcmOrg.position.jobGrade')} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.all')}
                options={grades.map((item) => ({ value: item.id, label: `${item.name}(${item.code})` }))}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <div className="search-actions" style={{ paddingTop: 26 }}>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-org-position-form')}>
            {t('hcmOrg.position.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<OrgPosition>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<OrgPosition>}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
          onChange: (nextPage, nextSize) => {
            setPage(nextSize !== pageSize ? 1 : nextPage)
            setPageSize(nextSize || 20)
          },
        }}
      />
    </div>
  )
}
