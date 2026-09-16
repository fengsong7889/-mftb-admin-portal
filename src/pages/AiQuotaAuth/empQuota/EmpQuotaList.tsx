import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      title: t('aiQuotaAuth.confirmDeleteQuota'),
      content: t('aiQuotaAuth.deleteQuotaContent', { name: row.name, count: row.totalEmployeeCount }),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: () => {
        deletePosQuota(row.id).then(() => {
          message.success(t('aiQuotaAuth.quotaStrategyDeleted', { name: row.name }))
          fetchPosQuotas().then(setPosPolicies)
        })
      },
    })
  }

  /* ── 啟停 ── */
  const handlePosToggle = (row: PosQuotaVO) => {
    const toDisable = row.status === 1
    Modal.confirm({
      title: toDisable ? t('aiQuotaAuth.confirmDisableQuota') : t('aiQuotaAuth.confirmEnableQuota'),
      content: toDisable
        ? t('aiQuotaAuth.disableQuotaContent', { name: row.name, count: row.totalEmployeeCount })
        : t('aiQuotaAuth.enableQuotaContent', { name: row.name, count: row.totalEmployeeCount }),
      okText: t('aiQuotaAuth.confirmOk'), cancelText: t('common.cancel'),
      onOk: () => {
        togglePosQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(toDisable ? t('aiQuotaAuth.quotaStrategyDisabled', { name: row.name }) : t('aiQuotaAuth.quotaStrategyEnabled', { name: row.name }))
          fetchPosQuotas().then(setPosPolicies)
        })
      },
    })
  }

  /* ── 列字段配置（職位額度） ── */
  const posColumnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'positions', title: t('aiQuotaAuth.positionsCol') },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol') },
    { key: 'quota', title: t('aiQuotaAuth.quotaCol') },
    { key: 'usage', title: t('aiQuotaAuth.usageCol') },
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol') },
    { key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]
  const { configComponent: posConfigComponent, applyConfig: posApplyConfig } = useColumnConfig('ai-emp-quota-position', posColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const posColumns: ColumnsType<PosQuotaVO> = [
    {
      key: 'configCode', title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 180 },
    {
      key: 'positions', title: t('aiQuotaAuth.positionsCol'), width: 240,
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
            title={t('aiQuotaAuth.allJobLevelsPopover', { count: row.jobLevels.length })} trigger="click"
          >
            <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{row.jobLevels.length - 3}</Tag>
          </Popover>
        ) : null
        return <span>{seqTags}{lvlTags}{extra}</span>
      },
    },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol'), dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => t('aiQuotaAuth.coverCountRender', { count: v.toLocaleString() }) },
    { key: 'quota', title: t('aiQuotaAuth.quotaCol'), width: 180, align: 'right', render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{quotaText(row)}</span> },
    {
      key: 'usage', title: t('aiQuotaAuth.usageCol'), width: 200,
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
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol'), dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol'), dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: string, row) => (
        <Tag color={OVER_LIMIT_TAG[v as OverLimitAction]}>{OVER_LIMIT_ACTION_LABEL[v as OverLimitAction]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}</Tag>
      ),
    },
    {
      key: 'status', title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} onChange={() => handlePosToggle(row)} />,
    },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: t('common.action'), width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handlePosDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handlePosEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handlePosDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  const positionContent = (
    <>
      <Alert
        type="warning" showIcon style={{ marginBottom: 16 }}
        message={
          <span>
            {t('aiQuotaAuth.posQuotaAlertFull')}
            <span style={{ color: '#8C8C8C' }}>{t('aiQuotaAuth.posQuotaAlertMaxRule')}</span>
            <div style={{ color: '#8C8C8C', fontSize: 12, marginTop: 4 }}>{t('aiQuotaAuth.posQuotaGatewayNote')}</div>
          </span>
        }
      />
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.strategyNameCol')}><Input value={posQuery} placeholder={t('aiQuotaAuth.ruleNamePh')} allowClear onChange={(e) => setPosQuery(e.target.value)} /></Form.Item>
          <Form.Item label={t('aiQuotaAuth.sequencesCol')}><Select value={posSeqFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear options={POSITION_SEQUENCE_OPTIONS} onChange={(v) => setPosSeqFilter(v)} /></Form.Item>
          <Form.Item label={t('aiQuotaAuth.quotaPeriodLabel')}><Select value={posPeriodFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} onChange={(v) => setPosPeriodFilter(v)} /></Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}><Select value={posStatusFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear options={[{ value: 1, label: t('aiQuotaAuth.enableText') }, { value: 0, label: t('aiQuotaAuth.disableText') }]} onChange={(v) => setPosStatusFilter(v)} /></Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handlePosSearch}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handlePosReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left"><span style={{ fontSize: 13, color: '#595959' }}>{t('aiQuotaAuth.posStrategyCountCover', { count: filteredPosPolicies.length, empCount: totalPosEmployeeCount.toLocaleString() })}</span></div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handlePosCreate}>{t('common.add')}</Button>
          {posConfigComponent}
        </div>
      </div>
      <Table rowKey="id" size="middle" loading={loading} columns={posApplyConfig(posColumns)} dataSource={filteredPosPolicies} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.paginationTotal', { total }) }} />
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
      title: t('aiQuotaAuth.confirmDeleteQuota'),
      content: t('aiQuotaAuth.deleteQuotaContent', { name: row.roleName, count: row.totalEmployeeCount }),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: () => {
        deleteRoleQuota(row.id).then(() => {
          message.success(t('aiQuotaAuth.quotaStrategyDeleted', { name: row.roleName }))
          fetchRoleQuotas().then(setRolePolicies)
        })
      },
    })
  }

  /* ── 啟停 ── */
  const handleRoleToggle = (row: RoleQuotaVO) => {
    const toDisable = row.status === 1
    Modal.confirm({
      title: toDisable ? t('aiQuotaAuth.confirmDisableQuota') : t('aiQuotaAuth.confirmEnableQuota'),
      content: toDisable
        ? t('aiQuotaAuth.disableQuotaContent', { name: row.roleName, count: row.totalEmployeeCount })
        : t('aiQuotaAuth.enableQuotaContent', { name: row.roleName, count: row.totalEmployeeCount }),
      okText: t('aiQuotaAuth.confirmOk'), cancelText: t('common.cancel'),
      onOk: () => {
        toggleRoleQuotaStatus(row.id, toDisable ? 0 : 1).then(() => {
          message.success(toDisable ? t('aiQuotaAuth.quotaStrategyDisabled', { name: row.roleName }) : t('aiQuotaAuth.quotaStrategyEnabled', { name: row.roleName }))
          fetchRoleQuotas().then(setRolePolicies)
        })
      },
    })
  }

  /* ── 列字段配置（角色額度） ── */
  const roleColumnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'roleName', title: t('aiQuotaAuth.roleNameCol') },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'userNames', title: t('aiQuotaAuth.bindEmpCol') },
    { key: 'quota', title: t('aiQuotaAuth.quotaCol') },
    { key: 'usage', title: t('aiQuotaAuth.usageCol') },
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol') },
    { key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]
  const { configComponent: roleConfigComponent, applyConfig: roleApplyConfig } = useColumnConfig('ai-emp-quota-role', roleColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const roleColumns: ColumnsType<RoleQuotaVO> = [
    {
      key: 'configCode', title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'roleName', title: t('aiQuotaAuth.roleNameCol'), dataIndex: 'roleName', width: 140, render: (v: string) => <Tag color="purple">{v}</Tag> },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 180 },
    {
      key: 'userNames', title: t('aiQuotaAuth.bindEmpCol'), width: 200,
      render: (_, row) => {
        const names = row.userNames.slice(0, 3)
        return (
          <span>
            {names.map((n) => <Tag key={n} style={{ marginRight: 4, marginBottom: 2, fontSize: 12 }}>{n}</Tag>)}
            {row.userNames.length > 3 && (
              <Popover
                content={<div style={{ maxWidth: 300 }}>{row.userNames.map((n) => <Tag key={n} style={{ marginRight: 4, marginBottom: 4, fontSize: 12 }}>{n}</Tag>)}</div>}
                title={t('aiQuotaAuth.allEmpPopover', { count: row.totalEmployeeCount })} trigger="click"
              >
                <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C', fontSize: 12 }}>+{row.userNames.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    { key: 'quota', title: t('aiQuotaAuth.quotaCol'), width: 180, align: 'right', render: (_, row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{roleQuotaText(row)}</span> },
    {
      key: 'usage', title: t('aiQuotaAuth.usageCol'), width: 200,
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
    { key: 'softThreshold', title: t('aiQuotaAuth.softAlertCol'), dataIndex: 'softThreshold', width: 90, align: 'center', render: (v: number) => `${v}%` },
    {
      key: 'overLimitAction', title: t('aiQuotaAuth.overLimitCol'), dataIndex: 'overLimitAction', width: 150, align: 'center',
      render: (v: RoleQuotaVO['overLimitAction'], row) => (
        <Tag color={OVER_LIMIT_TAG[v]}>{OVER_LIMIT_ACTION_LABEL[v]}{v === 'downgrade' && row.downgradeModelId ? ` · ${modelName[row.downgradeModelId] ?? ''}` : ''}</Tag>
      ),
    },
    {
      key: 'status', title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_, row) => <Switch checked={row.status === 1} checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} onChange={() => handleRoleToggle(row)} />,
    },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      key: 'action', title: t('common.action'), width: 160, align: 'center', fixed: 'right',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleRoleDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handleRoleEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleRoleDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  const roleContent = (
    <>
      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message={<>{t('aiQuotaAuth.roleQuotaAlertFull')}<span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 4 }}>{t('aiQuotaAuth.roleQuotaGatewayNote')}</span></>}
      />
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.roleStrategyNameLabel')}><Input value={roleQuery} placeholder={t('aiQuotaAuth.roleNamePh')} allowClear onChange={(e) => setRoleQuery(e.target.value)} /></Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => setRoleQuery('')}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left"><span style={{ fontSize: 13, color: '#595959' }}>{t('aiQuotaAuth.roleStrategyCountCover', { count: filteredRolePolicies.length, empCount: totalRoleEmployeeCount.toLocaleString() })}</span></div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleCreate}>{t('common.add')}</Button>
          {roleConfigComponent}
        </div>
      </div>
      <Table rowKey="id" size="middle" loading={loading} columns={roleApplyConfig(roleColumns)} dataSource={filteredRolePolicies} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.paginationTotal', { total }) }} />
    </>
  )

  const tabItems = [
    { key: 'position', label: <Space><IdcardOutlined /><span>{t('aiQuotaAuth.posQuotaTab')}</span></Space>, children: positionContent },
    { key: 'role', label: <Space><TeamOutlined /><span>{t('aiQuotaAuth.roleQuotaTab')}</span></Space>, children: roleContent },
  ]

  /** 支持 hash 定位 Tab */
  const defaultTab = window.location.hash.includes('#role') ? 'role' : 'position'

  return (
    <div className="content-area">
      <Tabs defaultActiveKey={defaultTab} items={tabItems} />
    </div>
  )
}
