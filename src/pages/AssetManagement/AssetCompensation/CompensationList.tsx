/**
 * 赔付管理 — 列表页（接通真实 API）
 */
import { useState, useEffect, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import type { CompensationRow, CompensationQuery } from '../../../api/eamCompensation'

/* ----- 状态元数据 ----- */
const DAMAGE_LABEL: Record<string, string> = { damage: '损坏', loss: '遗失' }
const CAUSE_LABEL: Record<string, string> = { human: '人为', natural: '自然', third_party: '第三方', quality: '质量' }
const PARTY_LABEL: Record<string, string> = { employee: '员工', department: '部门', company: '公司', none: '未定' }
const STATUS_LABEL: Record<string, string> = {
  pending: '待定责', confirmed: '已定责', partially_paid: '部分收款',
  paid: '已结清', waived: '已免赔', refund_pending: '待退款',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'default', confirmed: 'processing', partially_paid: 'processing',
  paid: 'success', waived: 'default', refund_pending: 'error',
}

function formatMoney(cents: number): string {
  return `MOP ${(cents / 100).toFixed(2)}`
}

interface Props {
  data?: { records: CompensationRow[]; total: number }
  loading?: boolean
  error?: string
  onQuery?: (query: CompensationQuery) => void
  canEdit?: boolean
}

interface Filters { compNo?: string; assetName?: string; holderName?: string; status?: string; damageType?: string; party?: string }

export default function CompensationList({ data, loading = false, error, onQuery, canEdit: _canEdit = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<Filters>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<Filters>({})

  const dataSource = data?.records ?? []
  const total = data?.total ?? 0

  /* ----- 查询触发 ----- */
  useEffect(() => {
    onQuery?.({ ...filters, page, size })
  }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      compNo: v.compNo?.trim() || undefined,
      assetName: v.assetName?.trim() || undefined,
      holderName: v.holderName?.trim() || undefined,
      status: v.status || undefined,
      damageType: v.damageType || undefined,
      party: v.party || undefined,
    })
    setPage(1)
  }

  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  const handleTableChange = (p: { current?: number; pageSize?: number }) => {
    const nextSize = p.pageSize || 10
    setPage(nextSize === size ? p.current || 1 : 1)
    setSize(nextSize)
  }

  /* ----- 表格列定义 ----- */
  const allColumns: TableColumnsType<CompensationRow> = [
    {
      key: 'compNo', title: t('asset.colCompNo'), dataIndex: 'compNo', width: 175, fixed: 'left',
      render: (v: string, c) => <Button type="link" onClick={() => navigate(`/asset-compensation/detail?id=${c.id}`)}>{v}</Button>,
    },
    { key: 'asset', title: t('asset.colAssetName'), width: 200, render: (_, c) => <>{c.assetName}<div className="claim-muted">{c.assetNo}</div></> },
    { key: 'holderName', title: '原持有人', dataIndex: 'holderName', width: 130 },
    { key: 'damageType', title: '损失类型', dataIndex: 'damageType', width: 100, render: (v: string) => <Tag color={v === 'loss' ? 'error' : 'warning'}>{DAMAGE_LABEL[v] || v}</Tag> },
    { key: 'party', title: '责任对象', width: 130, render: (_, c) => c.party ? <Tag>{PARTY_LABEL[c.party] || c.party}</Tag> : '待定' },
    { key: 'cause', title: '原因', width: 110, render: (_, c) => c.cause ? CAUSE_LABEL[c.cause] : '待定' },
    { key: 'amount', title: '应赔金额', width: 130, align: 'right', render: (_, c) => c.status === 'pending' ? '待定' : formatMoney(c.amount) },
    { key: 'netPaid', title: '净收款', width: 130, align: 'right', render: (_, c) => formatMoney(c.netPaid) },
    {
      key: 'status', title: '状态', width: 120,
      render: (_, c) => c.reviewRequired
        ? <Tag color="warning">待找回复核</Tag>
        : <Tag color={STATUS_COLOR[c.status] || 'default'}>{STATUS_LABEL[c.status] || c.status}</Tag>,
    },
    {
      key: 'action', title: t('common.colAction'), width: 150, fixed: 'right',
      render: (_, c) => <Button type="link" onClick={() => navigate(`/asset-compensation/detail?id=${c.id}`)}>详情</Button>,
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'compNo', title: t('asset.colCompNo') },
    { key: 'asset', title: t('asset.colAssetName') },
    { key: 'holderName', title: '原持有人' },
    { key: 'damageType', title: '损失类型' },
    { key: 'party', title: '责任对象' },
    { key: 'cause', title: '原因' },
    { key: 'amount', title: '应赔金额' },
    { key: 'netPaid', title: '净收款' },
    { key: 'status', title: '状态' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-compensation', columnMeta, [
    { key: 'compNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return <>
    {/* ====== 搜索区 ====== */}
    <div className="search-section">
      <Form form={form} layout="inline" onFinish={handleSearch}>
        <Form.Item label={t('asset.colCompNo')} name="compNo">
          <Input allowClear placeholder="请输入赔付单号" />
        </Form.Item>
        <Form.Item label={t('asset.colAssetName')} name="assetName">
          <Input allowClear placeholder="请输入资产名称" />
        </Form.Item>
        <Form.Item label="原持有人" name="holderName">
          <Input allowClear placeholder="请输入原持有人" />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Select allowClear placeholder="全部状态" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        <Form.Item label="损失类型" name="damageType">
          <Select allowClear placeholder="全部类型" options={Object.entries(DAMAGE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        <Form.Item label="责任对象" name="party">
          <Select allowClear placeholder="全部" options={Object.entries(PARTY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        <Form.Item>
          <div className="search-actions">
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </div>
        </Form.Item>
      </Form>
    </div>

    {/* ====== 操作区 ====== */}
    <div className="action-section">
      <div className="action-section-left">赔付记录 {total > 0 ? `共 ${total} 条` : ''}</div>
      <div className="action-section-right">
        {configComponent}
      </div>
    </div>

    {/* ====== 表格 ====== */}
    <Table<CompensationRow>
      rowKey="id"
      columns={applyConfig(allColumns) as TableColumnsType<CompensationRow>}
      dataSource={error ? [] : dataSource}
      locale={{ emptyText: <Empty description={t('common.noData')} /> }}
      loading={loading}
      size="middle"
      scroll={{ x: 1585 }}
      onChange={handleTableChange}
      pagination={{
        current: page, pageSize: size, total,
        showSizeChanger: true, showQuickJumper: true,
        showTotal: (count) => t('common.total', { count }),
      }}
    />
  </>
}
