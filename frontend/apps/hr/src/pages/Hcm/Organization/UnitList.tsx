/**
 * 管理組織列表（/hcm-org-unit）
 *
 * 以樹表呈現「法人 → 組織」的管理層級。為什麼不像普通列表那樣分頁：管理組織是主數據，
 * 一次要看清整棵樹才好判斷編制掛在哪一層；條數受法人數量約束（不是業務流水），
 * 樹查詢由後端 path 物化路徑保證一條 SQL 出全量。
 * 統計卡口徑跟隨「法人 + 關鍵字 + 狀態」篩選，與列表同源。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, TagsOutlined, CheckCircleOutlined,
  StopOutlined, ApartmentOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import StatCards, { type StatCardItem } from '@/components/StatCards'
import {
  UNIT_TYPE_OPTIONS,
  deleteUnit,
  listLegalEntities,
  unitTree,
  type OrgLegalEntity,
  type OrgUnitNode,
} from '@/api/hcmOrganization'

interface Filters {
  legalEntityId?: number
  keyword?: string
  status?: number
}

/** 樹的扁平化只用于统计口径：卡片要数「全部节点」而不是「顶层节点」 */
function flatten(nodes: OrgUnitNode[]): OrgUnitNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

export default function HcmOrgUnitList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tree, setTree] = useState<OrgUnitNode[]>([])
  const [legalEntities, setLegalEntities] = useState<OrgLegalEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()

  const loadData = useCallback(async (nextFilters: Filters) => {
    setLoading(true)
    try {
      setTree(await unitTree(nextFilters))
    } catch {
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(filters)
  }, [filters, loadData])

  useEffect(() => {
    // 法人下拉只需要启用中的法人：停用法人下不允许再挂组织（服务层同样拒绝）
    listLegalEntities({ page: 1, size: 200, status: 1 })
      .then((res) => setLegalEntities(res.records ?? []))
      .catch(() => setLegalEntities([]))
  }, [])

  const handleSearch = () => {
    setFilters(form.getFieldsValue())
  }

  const handleReset = () => {
    form.resetFields()
    setFilters({})
  }

  const handleDelete = (record: OrgUnitNode) => {
    Modal.confirm({
      title: t('hcmOrg.unit.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hcmOrg.unit.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('hcmOrg.unit.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteUnit(record.id)
        message.success(t('hcmOrg.unit.deleteSuccess'))
        void loadData(filters)
      },
    })
  }

  const columns: ColumnsType<OrgUnitNode> = ([
    { key: 'code', title: t('hcmOrg.unit.code'), dataIndex: 'code', width: 180 },
    { key: 'name', title: t('hcmOrg.unit.name'), dataIndex: 'name' },
    {
      key: 'legalEntityName', title: t('hcmOrg.unit.legalEntity'), dataIndex: 'legalEntityName', width: 220,
    },
    {
      key: 'unitType', title: t('hcmOrg.unit.unitType'), dataIndex: 'unitType', width: 120,
      render: (value: string) => (
        <Tag color="blue">{UNIT_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value}</Tag>
      ),
    },
    { key: 'leaderName', title: t('hcmOrg.unit.leaderName'), dataIndex: 'leaderName', width: 120 },
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
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-unit-detail?id=${record.id}`)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-unit-form?id=${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-org-unit-form?parentId=${record.id}&legalEntityId=${record.legalEntityId}`)}>
            {t('hcmOrg.unit.addChild')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ])

  const all = useMemo(() => flatten(tree), [tree])
  const statItems: StatCardItem[] = [
    { key: 'total', icon: <TagsOutlined />, value: all.length, label: t('hcmOrg.unit.statTotal'), color: 'info' },
    { key: 'enabled', icon: <CheckCircleOutlined />, value: all.filter((unit) => unit.status === 1).length, label: t('hcmOrg.unit.statEnabled'), color: 'success' },
    { key: 'disabled', icon: <StopOutlined />, value: all.filter((unit) => unit.status !== 1).length, label: t('hcmOrg.unit.statDisabled'), color: 'danger' },
    { key: 'roots', icon: <ApartmentOutlined />, value: tree.length, label: t('hcmOrg.unit.statRoots'), color: 'system' },
  ]

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={handleSearch}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="legalEntityId" label={t('hcmOrg.unit.legalEntity')} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('hcmOrg.all')}
                options={legalEntities.map((item) => ({ value: item.id, label: `${item.name}(${item.code})` }))}
              />
            </Form.Item>
            <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
              <Input placeholder={t('hcmOrg.unit.keywordPlaceholder')} allowClear />
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

      <div style={{ marginBottom: 16 }}>
        <StatCards
          items={statItems}
          animationKey={`${filters.legalEntityId ?? ''}-${filters.keyword ?? ''}-${filters.status ?? ''}`}
          columns={4}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-org-unit-form')}>
            {t('hcmOrg.unit.add')}
          </Button>
        </div>
      </div>

      <Table<OrgUnitNode>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={tree}
        scroll={{ x: 'max-content' }}
        expandable={{ defaultExpandAllRows: true }}
        pagination={false}
      />
    </div>
  )
}
