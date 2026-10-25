/**
 * 法人主體列表（/hcm-org-legal）
 *
 * 组织编制系统的第一个真实页面：法人是雇佣关系的法律一方，后面 Person/Employment
 * 都要挂到它上面，所以这里必须能看清「哪些法人还没核实、哪些已停用」。
 * 结构遵守列表页规范：搜索区 → 统计卡（口径跟随筛选）→ 操作区 → 表格；
 * 统计卡与列表共用同一份 filters，杜绝「列表已筛、卡片仍是全量」的误读。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, TagsOutlined, CheckCircleOutlined,
  SafetyCertificateOutlined, GlobalOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import StatCards, { type StatCardItem } from '../../../components/StatCards'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  JURISDICTION_OPTIONS,
  deleteLegalEntity,
  legalEntityStats,
  listLegalEntities,
  updateLegalEntity,
  type OrgLegalEntity,
  type OrgLegalEntityStats,
} from '../../../api/hcmOrganization'

interface Filters {
  keyword?: string
  status?: number
  jurisdiction?: string
}

export default function HcmOrgLegalEntityList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<OrgLegalEntity[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [stats, setStats] = useState<OrgLegalEntityStats | null>(null)
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextPage = page, nextSize = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const [list, stat] = await Promise.all([
        listLegalEntities({ page: nextPage, size: nextSize, ...nextFilters }),
        legalEntityStats(nextFilters),
      ])
      setRows(list.records ?? [])
      setTotal(list.total ?? 0)
      setStats(stat)
    } catch {
      // request 层已统一弹错，这里只保证表格回到可交互状态
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    void loadData(page, pageSize, filters)
    // 依赖收敛在三个显式参数上，避免把 loadData 的引用变化当成数据变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters])

  const handleSearch = () => {
    const values = form.getFieldsValue()
    setPage(1)
    setFilters(values)
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleDelete = (record: OrgLegalEntity) => {
    Modal.confirm({
      title: t('hcmOrg.legal.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmOrg.legal.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('hcmOrg.legal.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteLegalEntity(record.id as number)
        message.success(t('hcmOrg.legal.deleteSuccess'))
        void loadData()
      },
    })
  }

  const handleToggleStatus = (record: OrgLegalEntity) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateLegalEntity(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'code', title: t('hcmOrg.legal.code') },
    { key: 'name', title: t('hcmOrg.legal.name') },
    { key: 'jurisdiction', title: t('hcmOrg.legal.jurisdiction') },
    { key: 'registrationNo', title: t('hcmOrg.legal.registrationNo') },
    { key: 'verifyStatus', title: t('hcmOrg.legal.verifyStatus') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-org-legal', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<OrgLegalEntity> = ([
    { key: 'code', title: t('hcmOrg.legal.code'), dataIndex: 'code', width: 160 },
    { key: 'name', title: t('hcmOrg.legal.name'), dataIndex: 'name' },
    {
      key: 'jurisdiction', title: t('hcmOrg.legal.jurisdiction'), dataIndex: 'jurisdiction', width: 110,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    { key: 'registrationNo', title: t('hcmOrg.legal.registrationNo'), dataIndex: 'registrationNo' },
    {
      key: 'verifyStatus', title: t('hcmOrg.legal.verifyStatus'), dataIndex: 'verifyStatus', width: 110,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.legal.verified')}</Tag>
        : <Tag color="orange">{t('hcmOrg.legal.pendingVerify')}</Tag>),
    },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    { key: 'updatedBy', title: t('hcmOrg.updatedBy'), dataIndex: 'updatedBy', width: 130 },
    {
      key: 'action', title: t('common.action'), width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-legal-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-legal-form?id=${record.id}`)}>
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
  ])

  const statItems: StatCardItem[] = [
    { key: 'total', icon: <TagsOutlined />, value: stats?.total ?? 0, label: t('hcmOrg.legal.statTotal'), color: 'info' },
    { key: 'enabled', icon: <CheckCircleOutlined />, value: stats?.enabled ?? 0, label: t('hcmOrg.legal.statEnabled'), color: 'success' },
    { key: 'pending', icon: <SafetyCertificateOutlined />, value: stats?.pendingVerify ?? 0, label: t('hcmOrg.legal.statPending'), color: 'danger' },
    { key: 'jurisdictions', icon: <GlobalOutlined />, value: stats?.jurisdictions ?? 0, label: t('hcmOrg.legal.statJurisdictions'), color: 'system' },
  ]

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('hcmOrg.legal.keywordPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('hcmOrg.legal.jurisdiction')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} style={{ marginBottom: 0 }}>
              <Select allowClear placeholder={t('hcmOrg.all')} options={[
                { value: 1, label: t('hcmOrg.enabled') },
                { value: 0, label: t('hcmOrg.disabled') },
              ]} />
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

      {/* 统计卡必须在搜索区下方，且口径跟随 filters */}
      <div style={{ marginBottom: 16 }}>
        <StatCards items={statItems} animationKey={`${filters.keyword ?? ''}-${filters.status ?? ''}-${filters.jurisdiction ?? ''}`} columns={4} />
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-org-legal-form')}>
            {t('hcmOrg.legal.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<OrgLegalEntity>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<OrgLegalEntity>}
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
