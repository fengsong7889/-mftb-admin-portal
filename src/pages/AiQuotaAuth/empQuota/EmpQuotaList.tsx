import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popover, Progress, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, IdcardOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchModels, type AiModel } from '../../../api'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR, POSITION_SEQUENCE_OPTIONS } from '../../../api/position'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import {
  usagePercent,
  usageColor,
  usedText,
  quotaText,
  QUOTA_PERIOD_LABEL,
  OVER_LIMIT_ACTION_LABEL,
  OVER_LIMIT_TAG,
  type QuotaPeriod,
  type OverLimitAction,
} from './empQuotaStore'
import {
  usagePercent as roleUsagePercent,
  usageColor as roleUsageColor,
  usedText as roleUsedText,
  quotaText as roleQuotaText,
} from './roleQuotaStore'
import {
  fetchPosQuotas, savePosQuota, deletePosQuota, togglePosQuotaStatus,
  fetchRoleQuotas, deleteRoleQuota, toggleRoleQuotaStatus,
  type PosQuotaVO, type RoleQuotaVO,
} from '../../../api/empQuota'

/**
 * 員工額度 - 兩種額度方式融合頁（對標員工模型權控 AiEmployeeAuthControl）
 * Tab1 按職位額度：以職級序列 + 職級批量配置額度
 * Tab2 角色額度：自定義角色 + 綁定員工 + 配額度
 * 新增/編輯/詳情均為獨立頁面（全局統一，取消彈窗）
 */
export default function EmpQuotaList() {
  const navigate = useNavigate()

  /* ── 基础数据 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      fetchEmployees({ page: 1, size: 200 }).catch(() => ({ records: [] as EmployeeItem[] }) as any),
    ]).then(([m, e]) => {
      if (cancelled) return
      setModels(m)
      setEmployees(e.records || [])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 名稱 */
  const modelName = useMemo(() => {
    const map: Record<number, string> = {}
    models.forEach((m) => { map[m.id] = m.name })
    return map
  }, [models])

  /* ═══════════ Tab1: 按职位额度 ═══════════ */
  const [posPolicies, setPosPolicies] = useState<PosQuotaVO[]>([])

  useEffect(() => {
    if (models.length > 0) fetchPosQuotas().then(setPosPolicies).catch(() => setPosPolicies([]))
  }, [models])

  const [posQuery, setPosQuery] = useState('')
  const [posSeqFilter, setPosSeqFilter] = useState<string | undefined>(undefined)
  const [posPeriodFilter, setPosPeriodFilter] = useState<QuotaPeriod | undefined>(undefined)
  const [posStatusFilter, setPosStatusFilter] = useState<number | undefined>(undefined)
  const [posApplied, setPosApplied] = useState({
    name: '', sequence: undefined as string | undefined,
    period: undefined as QuotaPeriod | undefined, status: undefined as number | undefined,
  })

  const handlePosSearch = () => setPosApplied({ name: posQuery.trim(), sequence: posSeqFilter, period: posPeriodFilter, status: posStatusFilter })
  const handlePosReset = () => {
    setPosQuery(''); setPosSeqFilter(undefined); setPosPeriodFilter(undefined); setPosStatusFilter(undefined)
    setPosApplied({ name: '', sequence: undefined, period: undefined, status: undefined })
  }

  const filteredPosPolicies = useMemo(() => posPolicies.filter((p) => {
    if (posApplied.name && !p.name.toLowerCase().includes(posApplied.name.toLowerCase())) return false
    if (posApplied.sequence && !p.sequences.includes(posApplied.sequence)) return false
    if (posApplied.period && p.period !== posApplied.period) return false
    if (posApplied.status !== undefined && p.status !== posApplied.status) return false
    return true
  }), [posPolicies, posApplied])

  const totalPosEmployeeCount = useMemo(() => posPolicies.reduce((s, p) => s + p.totalEmployeeCount, 0), [posPolicies])

  /* ── 導航 ── */
  const handlePosCreate = () => navigate('/ai-emp-quota-edit?type=add')
  const handlePosEdit = (row: PosQuotaVO) => navigate(`/ai-emp-quota-edit?id=${row.id}`)
  const handlePosDetail = (row: PosQuotaVO) => navigate(`/ai-emp-quota-detail?id=${row.id}`)

  /* ── 刪除 ── */
  const handlePosDelete = (row: PosQuotaVO) => {
    Modal.confirm({
      title: '確認刪除該額度策略？',
      content: `刪除後「${row.name}」立即失效，關聯的 ${row.totalEmployeeCount} 名員工不再受此限額約束。`,
      okText: '刪除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        deletePosQuota(row.id).then(() => {
          message.success(`策略「${row.name}」已刪除`)
          fetchPosQuotas().then(setPosPolicies)
        })
      },
    })
  }

  /* ── 啟停 ── */
  const handlePosToggle = (row: PosQuotaVO) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該額度策略？`,
      content: `${actionText}後「${row.name}」關聯的 ${row.totalEmployeeCount} 名員工${toDisable ? '不再受此限額約束' : '將恢復限額約束'}。`,
      okText: '確認', cancelText: '取消',
      onOk: () => {
        togglePosQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(`策略「${row.name}」已${actionText}`)
          fetchPosQuotas().then(setPosPolicies)
        })
      },
    })
  }

  /* ── 列字段配置（職位額度） ── */
  const posColumnMeta = [
    { key: 'configCode', title: '配置ID' },
    { key: 'name', title: '策略名稱' },
    { key: 'positions', title: '適用職位' },
    { key: 'totalEmployeeCount', title: '覆蓋人數' },
    { key: 'quota', title: '限額' },
    { key: 'usage', title: '本期用量' },
    { key: 'softThreshold', title: '軟提醒' },
    { key: 'overLimitAction', title: '超額動作' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: posConfigComponent, applyConfig: posApplyConfig } = useColumnConfig('ai-emp-quota-position', posColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const posColumns: ColumnsType<PosQuotaVO> = [
    {
      key: 'configCode', title: '配置ID', dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'name', title: '策略名稱', dataIndex: 'name', width: 180 },
    {
      key: 'positions', title: '適用職位', width: 240,
      render: (_, row) => {
        const seqTags = row.sequences.map((s) => (
          <Tag key={`seq-${s}`} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ marginRight: 4, marginBottom: 2 }}>
            {POSITION_SEQUENCE[s] ?? s}
          </Tag>
        ))
        const lvlTags = row.jobLevels.slice(0, 3).map((l) => (
          <Tag key={`lvl-${l}`} style={{ marginRight: 4, marginBottom: 2 }}>{l}</Tag>
        ))
        const extra = row.jobLevels.length > 3 ? (
          <Popover
            content={<div style={{ maxWidth: 300 }}>{row.jobLevels.map((l) => <Tag key={`all-${l}`} style={{ marginRight: 4, marginBottom: 4 }}>{l}</Tag>)}</div>}
            title={`全部職級（${row.jobLevels.length}）`} trigger="click"
          >
            <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{row.jobLevels.length - 3}</Tag>
          </Popover>
        ) : null
        return <span>{seqTags}{lvlTags}{extra}</span>
      },
    },
    { key: 'totalEmployeeCount', title: '覆蓋人數', dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => `${v.toLocaleString()} 人` },
    { key: 'quota', title: '限額', width: 180, align: 'right', render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{quotaText(row)}</span> },
    {
      key: 'usage', title: '本期用量', width: 200,
      render: (_, row) => {
        const pct = usagePercent(row)
        return (
          <div>
            <Progress percent={Math.min(pct, 100)} size="small" showInfo={false} strokeColor={usageColor(row)} style={{ marginBottom: 2 }} />
            <div style={{ fontSize: 12, color: '#595959', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#8C8C8C' }}>{usedText(row)}</span>
              <span style={{ color: usageColor(row), fontWeight: 600 }}>{pct}%</span>
            </div>
          </div>
        )
      },
    },
    { key: 'softThreshold', title: '軟提醒', dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: '超額動作', dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: string, row) => (
        <Tag color={OVER_LIMIT_TAG[v as OverLimitAction]}>{OVER_LIMIT_ACTION_LABEL[v as OverLimitAction]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}</Tag>
      ),
    },
    {
      key: 'status', title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren="啟用" unCheckedChildren="停用" onChange={() => handlePosToggle(row)} />,
    },
    { key: 'updatedBy', title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: '操作', width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handlePosDetail(row)}>詳情</Button>
          <Button type="link" onClick={() => handlePosEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handlePosDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  const positionContent = (
    <>
      <Alert
        type="warning" showIcon style={{ marginBottom: 16 }}
        message={
          <span>
            按職位額度以規則維度根據職級序列和職級批量配置訪問限額，系統根據每位員工的職位自動匹配序列與職級，自動生效對應額度。
            <span style={{ color: '#8C8C8C' }}>同一員工符合多條職位規則時，取限額值最大的規則生效。</span>
          </span>
        }
      />
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="策略名稱"><Input value={posQuery} placeholder="請輸入策略名稱" allowClear onChange={(e) => setPosQuery(e.target.value)} /></Form.Item>
          <Form.Item label="職級序列"><Select value={posSeqFilter} placeholder="全部" allowClear options={POSITION_SEQUENCE_OPTIONS} onChange={(v) => setPosSeqFilter(v)} /></Form.Item>
          <Form.Item label="限額周期"><Select value={posPeriodFilter} placeholder="全部" allowClear options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} onChange={(v) => setPosPeriodFilter(v)} /></Form.Item>
          <Form.Item label="狀態"><Select value={posStatusFilter} placeholder="全部" allowClear options={[{ value: 1, label: '啟用' }, { value: 0, label: '停用' }]} onChange={(v) => setPosStatusFilter(v)} /></Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handlePosSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handlePosReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left"><span style={{ fontSize: 13, color: '#595959' }}>共 {filteredPosPolicies.length} 條策略，覆蓋 {totalPosEmployeeCount.toLocaleString()} 人</span></div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handlePosCreate}>新增</Button>
          {posConfigComponent}
        </div>
      </div>
      <Table rowKey="id" size="middle" loading={loading} columns={posApplyConfig(posColumns)} dataSource={filteredPosPolicies} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條策略` }} />
    </>
  )

  /* ═══════════ Tab2: 角色額度 ═══════════ */
  const [rolePolicies, setRolePolicies] = useState<RoleQuotaVO[]>([])

  useEffect(() => {
    if (models.length > 0) fetchRoleQuotas().then(setRolePolicies).catch(() => setRolePolicies([]))
  }, [models])

  const [roleQuery, setRoleQuery] = useState('')
  const filteredRolePolicies = useMemo(() => rolePolicies.filter((p) => {
    if (roleQuery && !p.roleName.toLowerCase().includes(roleQuery.toLowerCase())) return false
    return true
  }), [rolePolicies, roleQuery])

  const totalRoleEmployeeCount = useMemo(() => rolePolicies.reduce((s, p) => s + p.totalEmployeeCount, 0), [rolePolicies])

  /* ── 導航 ── */
  const handleRoleCreate = () => navigate('/ai-role-quota-edit?type=add')
  const handleRoleEdit = (row: RoleQuotaVO) => navigate(`/ai-role-quota-edit?id=${row.id}`)
  const handleRoleDetail = (row: RoleQuotaVO) => navigate(`/ai-role-quota-detail?id=${row.id}`)

  /* ── 刪除 ── */
  const handleRoleDelete = (row: RoleQuotaVO) => {
    Modal.confirm({
      title: '確認刪除該額度策略？',
      content: `刪除後「${row.roleName}」立即失效，綁定的 ${row.totalEmployeeCount} 名員工不再受此限額約束。`,
      okText: '刪除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: () => {
        deleteRoleQuota(row.id).then(() => {
          message.success(`策略「${row.roleName}」已刪除`)
          fetchRoleQuotas().then(setRolePolicies)
        })
      },
    })
  }

  /* ── 啟停 ── */
  const handleRoleToggle = (row: RoleQuotaVO) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該額度策略？`,
      content: `${actionText}後「${row.roleName}」綁定的 ${row.totalEmployeeCount} 名員工${toDisable ? '不再受此限額約束' : '將恢復限額約束'}。`,
      okText: '確認', cancelText: '取消',
      onOk: () => {
        toggleRoleQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(`策略「${row.roleName}」已${actionText}`)
          fetchRoleQuotas().then(setRolePolicies)
        })
      },
    })
  }

  /* ── 列字段配置（角色額度） ── */
  const roleColumnMeta = [
    { key: 'configCode', title: '配置ID' },
    { key: 'roleName', title: '角色名稱' },
    { key: 'name', title: '策略名稱' },
    { key: 'userNames', title: '綁定員工' },
    { key: 'quota', title: '限額' },
    { key: 'usage', title: '本期用量' },
    { key: 'softThreshold', title: '軟提醒' },
    { key: 'overLimitAction', title: '超額動作' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: roleConfigComponent, applyConfig: roleApplyConfig } = useColumnConfig('ai-emp-quota-role', roleColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const roleColumns: ColumnsType<RoleQuotaVO> = [
    {
      key: 'configCode', title: '配置ID', dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'roleName', title: '角色名稱', dataIndex: 'roleName', width: 140, render: (v: string) => <Tag color="purple">{v}</Tag> },
    { key: 'name', title: '策略名稱', dataIndex: 'name', width: 180 },
    {
      key: 'userNames', title: '綁定員工', width: 200,
      render: (_, row) => {
        const names = row.userNames.slice(0, 3)
        return (
          <span>
            {names.map((n) => <Tag key={n} style={{ marginRight: 4, marginBottom: 2, fontSize: 12 }}>{n}</Tag>)}
            {row.userNames.length > 3 && (
              <Popover
                content={<div style={{ maxWidth: 300 }}>{row.userNames.map((n) => <Tag key={n} style={{ marginRight: 4, marginBottom: 4, fontSize: 12 }}>{n}</Tag>)}</div>}
                title={`全部員工（${row.totalEmployeeCount} 人）`} trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C', fontSize: 12 }}>+{row.userNames.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    { key: 'quota', title: '限額', width: 180, align: 'right', render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{roleQuotaText(row)}</span> },
    {
      key: 'usage', title: '本期用量', width: 200,
      render: (_, row) => {
        const pct = roleUsagePercent(row)
        return (
          <div>
            <Progress percent={Math.min(pct, 100)} size="small" showInfo={false} strokeColor={roleUsageColor(row)} style={{ marginBottom: 2 }} />
            <div style={{ fontSize: 12, color: '#595959', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#8C8C8C' }}>{roleUsedText(row)}</span>
              <span style={{ color: roleUsageColor(row), fontWeight: 600 }}>{pct}%</span>
            </div>
          </div>
        )
      },
    },
    { key: 'softThreshold', title: '軟提醒', dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: '超額動作', dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: RoleQuotaVO['overLimitAction'], row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>{OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}</Tag>
      ),
    },
    {
      key: 'status', title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren="啟用" unCheckedChildren="停用" onChange={() => handleRoleToggle(row)} />,
    },
    { key: 'updatedBy', title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: '操作', width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleRoleDetail(row)}>詳情</Button>
          <Button type="link" onClick={() => handleRoleEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleRoleDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  const roleContent = (
    <>
      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="角色額度為特定角色綁定員工並批量配置訪問限額，適合為相似崗位的員工統一設定額度標準。角色額度與職位額度同時生效，取兩者中較大的值。"
      />
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="角色/策略名稱"><Input value={roleQuery} placeholder="請輸入名稱" allowClear onChange={(e) => setRoleQuery(e.target.value)} /></Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => setRoleQuery('')}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left"><span style={{ fontSize: 13, color: '#595959' }}>共 {filteredRolePolicies.length} 條策略，綁定 {totalRoleEmployeeCount.toLocaleString()} 人</span></div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleCreate}>新增</Button>
          {roleConfigComponent}
        </div>
      </div>
      <Table rowKey="id" size="middle" loading={loading} columns={roleApplyConfig(roleColumns)} dataSource={filteredRolePolicies} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條策略` }} />
    </>
  )

  const tabItems = [
    { key: 'position', label: <Space><IdcardOutlined /><span>按職位額度</span></Space>, children: positionContent },
    { key: 'role', label: <Space><TeamOutlined /><span>角色額度</span></Space>, children: roleContent },
  ]

  /** 支持 hash 定位 Tab */
  const defaultTab = window.location.hash.includes('#role') ? 'role' : 'position'

  return (
    <div className="content-area">
      <Tabs defaultActiveKey={defaultTab} items={tabItems} />
    </div>
  )
}
