import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Form, Input, Modal, Popover, Select, Switch, Table, Tabs, Tag, message, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, TeamOutlined, IdcardOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchModels, type AiModel } from '../../api'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, POSITION_SEQUENCE_TAG_COLOR } from '../../api/position'
import {
  loadPosRules,
  loadRoleAuthConfigs,
  clampModelConfigs,
  POS_RULE_STORAGE_KEY,
  ROLE_AUTH_STORAGE_KEY,
  CAPABILITY_SHORT_FIELDS,
  type PosAuthRule,
  type RoleAuthConfig,
  type ModelAuthConfig,
} from './empAuth/modelAuthCapability'
import {
  fetchPosStrategies,
  createPosStrategy,
  togglePosStrategyStatus,
  deletePosStrategy,
  fetchRoleAuths,
  createRoleAuth,
  toggleRoleAuthStatus,
  deleteRoleAuth,
  type PosStrategyItem,
  type RoleAuthItem,
} from '../../api/empAuth'

/**
 * 员工模型权控 - 两种授权方式融合页
 * Tab1 按职位授权：根据职位序列 + 职级批量授权（如 M5+ 可访问所有模型）
 * Tab2 角色授权：选择角色 + 绑员工 + 配模型
 * 新增/编辑/详情均为独立页面（全局统一，取消弹窗，参考部门模型权控）：
 * - /ai-pos-auth-edit、/ai-pos-auth-detail
 * - /ai-role-auth-edit、/ai-role-auth-detail
 * 授权模型细化到模型能力顆粒度（视觉/工具/JSON/流式/思考）
 */
export default function AiEmployeeAuthControl() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /* ── 基础数据 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchModels({ status: 1 })
      .then((m) => { if (!cancelled) setModels(m) })
      .catch(() => { if (!cancelled) message.error('加载数据失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 顯示名 */
  const modelName = useMemo(() => {
    const map: Record<number, string> = {}
    models.forEach((m) => { map[m.id] = m.name })
    return map
  }, [models])

  /* ═══════════ Tab1: 按职位授权 ═══════════ */
  const [posRules, setPosRules] = useState<PosAuthRule[]>([])
  const [ruleQuery, setRuleQuery] = useState('')
  const [ruleSeqFilter, setRuleSeqFilter] = useState<string | undefined>(undefined)
  const [ruleLevelFilter, setRuleLevelFilter] = useState<string[]>([])
  const [ruleStatusFilter, setRuleStatusFilter] = useState<string | undefined>(undefined)

  /** localStorage 歷史配置（mock 階段）一次性遷移到後端：盡力逐條上傳，完成後清空本地並標記，避免重複遷移 */
  const MIGRATED_KEY = 'emp_auth_migrated_v1'
  const migrateLegacyData = async () => {
    if (localStorage.getItem(MIGRATED_KEY) === '1') return
    const legacyRules = loadPosRules(models)
    for (const r of legacyRules) {
      try {
        await createPosStrategy({
          strategyName: r.ruleName, sequences: r.sequence, jobLevels: r.jobLevels,
          modelConfigs: r.modelConfigs, dataResidency: r.dataResidency,
          description: r.description, status: r.status,
        })
      } catch { /* 單條失敗跳過，不阻斷整體遷移 */ }
    }
    const legacyRoles = loadRoleAuthConfigs(models)
    for (const c of legacyRoles) {
      try {
        await createRoleAuth({
          roleCode: c.roleId, roleName: c.roleName, description: c.description,
          userIds: c.userIds, modelConfigs: c.modelConfigs,
          dataResidency: c.dataResidency, status: c.status,
        })
      } catch { /* 角色編碼衝突或失敗跳過 */ }
    }
    localStorage.removeItem(POS_RULE_STORAGE_KEY)
    localStorage.removeItem(ROLE_AUTH_STORAGE_KEY)
    localStorage.setItem(MIGRATED_KEY, '1')
  }

  /** 從後端載入職位授權策略（首次進入先執行歷史數據遷移） */
  const reloadPosRules = async () => {
    const list = await fetchPosStrategies()
    setPosRules(list.map((item: PosStrategyItem) => ({
      id: item.id,
      configCode: item.configCode,
      ruleName: item.ruleName,
      sequence: item.sequence ?? [],
      jobLevels: item.jobLevels ?? [],
      modelConfigs: clampModelConfigs(item.modelConfigs ?? [], models),
      dataResidency: item.dataResidency,
      description: item.description ?? '',
      status: item.status,
      createdAt: item.createdAt ?? '',
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt,
    })))
  }

  /** 模型就緒後：遷移 localStorage 歷史數據 → 載入後端策略（能力開關按模型上限收斂） */
  useEffect(() => {
    if (models.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        await migrateLegacyData()
        if (!cancelled) await reloadPosRules()
      } catch {
        if (!cancelled) message.error(t('aiQuotaAuth.loadPosFailed'))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  const filteredRules = useMemo(() => posRules.filter((r) => {
    if (ruleQuery && !r.ruleName.toLowerCase().includes(ruleQuery.toLowerCase())) return false
    if (ruleSeqFilter && !r.sequence.includes(ruleSeqFilter)) return false
    if (ruleLevelFilter.length && !r.jobLevels.some((l) => ruleLevelFilter.includes(l))) return false
    if (ruleStatusFilter !== undefined && r.status !== Number(ruleStatusFilter)) return false
    return true
  }), [posRules, ruleQuery, ruleSeqFilter, ruleLevelFilter, ruleStatusFilter])

  /* ── 导航至独立页面（全局统一：取消弹窗） ── */
  const handleRuleCreate = () => navigate('/ai-pos-auth-edit?type=add')
  const handleRuleEdit = (rule: PosAuthRule) => navigate(`/ai-pos-auth-edit?id=${rule.id}`)
  const handleRuleDetail = (rule: PosAuthRule) => navigate(`/ai-pos-auth-detail?id=${rule.id}`)

  const handleRuleDelete = (rule: PosAuthRule) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeleteAuth'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: t('aiQuotaAuth.deleteAuthContent', { name: rule.ruleName }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deletePosStrategy(rule.id)
        await reloadPosRules()
        message.success(t('aiQuotaAuth.strategyDeleted'))
      },
    })
  }

  /** 切换规则启用/停用状态（带二次确认弹窗，遵循全局统一规范） */
  const handleRuleToggleStatus = (rule: PosAuthRule) => {
    const isEnable = rule.status !== 1
    Modal.confirm({
      title: isEnable ? t('aiQuotaAuth.confirmEnableAuth') : t('aiQuotaAuth.confirmDisableAuth'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? t('aiQuotaAuth.enableAuthContent', { name: rule.ruleName })
        : t('aiQuotaAuth.disableAuthContent', { name: rule.ruleName }),
      okText: t('aiQuotaAuth.confirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: isEnable ? undefined : { danger: true },
      onOk: async () => {
        await togglePosStrategyStatus(rule.id, isEnable ? 1 : 0)
        await reloadPosRules()
        message.success(isEnable ? t('aiQuotaAuth.authStrategyEnabled') : t('aiQuotaAuth.authStrategyDisabled'))
      },
    })
  }

  /* ── 表格列定义（职位授权规则） ── */
  const posColumnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'ruleName', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'sequence', title: t('aiQuotaAuth.sequencesCol') },
    { key: 'jobLevel', title: t('aiQuotaAuth.jobLevelCol') },
    { key: 'modelConfigs', title: t('aiQuotaAuth.authModelCol') },
    { key: 'capabilities', title: t('aiQuotaAuth.capabilityCol') },
    { key: 'dataResidency', title: t('aiQuotaAuth.dataResidencyTag') },
    { key: 'description', title: t('aiQuotaAuth.descCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]
  const { configComponent: posConfigComponent } = useColumnConfig('ai-pos-auth', posColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  /** 授權模型列渲染：僅展示模型名稱 Tag */
  const renderModelNameColumn = (configs: ModelAuthConfig[]) => {
    if (!configs?.length) return <Tag>{t('aiQuotaAuth.notConfiguredTag')}</Tag>
    return (
      <Space size={4} wrap>
        {configs.slice(0, 3).map((c) => (
          <Tag key={c.modelId} color="processing">{modelName[c.modelId] ?? `#${c.modelId}`}</Tag>
        ))}
        {configs.length > 3 && (
          <Tag style={{ color: '#E8720C', borderColor: '#E8720C' }}>+{configs.length - 3}</Tag>
        )}
      </Space>
    )
  }

  /** 授權能力列渲染：去重能力標籤 + 點擊查看每個模型的能力明細 */
  const renderCapabilityColumn = (configs: ModelAuthConfig[]) => {
    if (!configs?.length) return <Tag>{t('aiQuotaAuth.notConfiguredTag')}</Tag>
    // 去重：收集所有模型中已啟用的能力
    const enabledCaps = CAPABILITY_SHORT_FIELDS.filter(({ key }) =>
      configs.some((c) => c[key] === 1),
    )
    if (!enabledCaps.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>{t('aiQuotaAuth.noCapability')}</span>
    return (
      <Popover
        trigger="click"
        title={t('aiQuotaAuth.capabilityDetailTitle')}
        content={
          <div style={{ maxWidth: 380 }}>
            {configs.map((c) => {
              const caps = CAPABILITY_SHORT_FIELDS.filter(({ key }) => c[key] === 1)
              return (
                <div key={c.modelId} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{modelName[c.modelId] ?? `#${c.modelId}`}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {caps.length > 0
                      ? caps.map(({ key, labelKey, color }) => (
                          <Tag key={key} color={color} style={{ fontSize: 11 }}>{t('aiQuotaAuth.' + labelKey)}</Tag>
                        ))
                      : <span style={{ fontSize: 11, color: '#BFBFBF' }}>{t('aiQuotaAuth.noCapability')}</span>
                    }
                  </div>
                </div>
              )
            })}
          </div>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'pointer' }}>
          {enabledCaps.map(({ key, labelKey, color }) => (
            <Tag key={key} color={color} style={{ fontSize: 11 }}>{t('aiQuotaAuth.' + labelKey)}</Tag>
          ))}
        </div>
      </Popover>
    )
  }

  const posColumns: ColumnsType<PosAuthRule> = [
    {
      title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', key: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'ruleName', key: 'ruleName', width: 160 },
    {
      title: t('aiQuotaAuth.sequencesCol'), dataIndex: 'sequence', key: 'sequence', width: 130, align: 'center',
      render: (seqs: string[]) => (seqs?.length
        ? <Space size={4} wrap>{seqs.map((v) => <Tag key={v} color={POSITION_SEQUENCE_TAG_COLOR[v]}>{v}</Tag>)}</Space>
        : <Tag>{t('aiQuotaAuth.notSetTag')}</Tag>),
    },
    {
      title: t('aiQuotaAuth.jobLevelCol'), dataIndex: 'jobLevels', key: 'jobLevel', width: 150, align: 'center',
      render: (levels: string[]) => (levels?.length
        ? <Space size={4} wrap>{levels.map((l) => <Tag key={l}>{l}</Tag>)}</Space>
        : <Tag>{t('aiQuotaAuth.notSetTag')}</Tag>),
    },
    {
      title: t('aiQuotaAuth.authModelCol'), dataIndex: 'modelConfigs', key: 'modelConfigs', width: 200,
      render: (configs: PosAuthRule['modelConfigs']) => renderModelNameColumn(configs),
    },
    {
      title: t('aiQuotaAuth.capabilityCol'), dataIndex: 'modelConfigs', key: 'capabilities', width: 220,
      render: (configs: PosAuthRule['modelConfigs']) => renderCapabilityColumn(configs),
    },
    {
      title: t('aiQuotaAuth.dataResidencyTag'), dataIndex: 'dataResidency', key: 'dataResidency', width: 100, align: 'center',
      render: (v: number) => (v === 1 ? <Tag color="purple">{t('aiQuotaAuth.enabledTag')}</Tag> : <Tag color="default">{t('aiQuotaAuth.disabledTag')}</Tag>),
    },
    { title: t('aiQuotaAuth.descCol'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PosAuthRule) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handleRuleToggleStatus(row)}
        />
      ),
    },
    { title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('common.action'), key: 'action', width: 170, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleRuleDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handleRuleEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleRuleDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  const positionContent = (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            {t('aiQuotaAuth.posAuthAlert')}
            <span style={{ color: '#8C8C8C' }}>
              {t('aiQuotaAuth.posAuthAlertHint')}
            </span>
          </span>
        }
      />
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.strategyNameCol')}>
            <Input value={ruleQuery} placeholder={t('aiQuotaAuth.strategyNamePh')} allowClear onChange={(e) => setRuleQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.sequencesCol')}>
            <Select value={ruleSeqFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear onChange={(v) => setRuleSeqFilter(v)} options={POSITION_SEQUENCE_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.jobLevelCol')}>
            <Select mode="multiple" value={ruleLevelFilter} placeholder={t('aiQuotaAuth.allOption')} allowClear onChange={(v) => setRuleLevelFilter(v)} options={POSITION_RANK_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}>
            <Select
              value={ruleStatusFilter}
              placeholder={t('aiQuotaAuth.allOption')}
              allowClear
              options={[
                { value: '1', label: t('aiQuotaAuth.enableText') },
                { value: '0', label: t('aiQuotaAuth.disableText') },
              ]}
              onChange={(v) => setRuleStatusFilter(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setRuleQuery(''); setRuleSeqFilter(undefined); setRuleLevelFilter([]); setRuleStatusFilter(undefined); }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>{t('aiQuotaAuth.authStrategyCount', { count: filteredRules.length })}</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRuleCreate}>{t('common.add')}</Button>
          {posConfigComponent}
        </div>
      </div>
      {/* 规则列表 */}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={posColumns}
        dataSource={filteredRules}
        scroll={{ x: 1370 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.totalStrategies', { total }) }}
      />
    </>
  )

  /* ═══════════ Tab2: 角色授权 ═══════════ */
  const [roleConfigs, setRoleConfigs] = useState<RoleAuthConfig[]>([])
  const [roleQuery, setRoleQuery] = useState('')

  /** 從後端載入角色授權配置（能力開關按模型上限收斂） */
  const reloadRoleConfigs = async () => {
    const list = await fetchRoleAuths()
    setRoleConfigs(list.map((item: RoleAuthItem) => ({
      roleId: item.roleId,
      configCode: item.configCode,
      roleName: item.roleName,
      description: item.description ?? '',
      modelConfigs: clampModelConfigs(item.modelConfigs ?? [], models),
      userIds: item.userIds ?? [],
      dataResidency: item.dataResidency,
      status: item.status,
      createdAt: item.createdAt ?? '',
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt,
    })))
  }

  /** 模型就緒後載入後端角色授權（localStorage 遷移已在 Tab1 的加載流程中統一執行） */
  useEffect(() => {
    if (models.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        await migrateLegacyData()
        if (!cancelled) await reloadRoleConfigs()
      } catch {
        if (!cancelled) message.error(t('aiQuotaAuth.loadRoleFailed'))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models])

  const filteredRoles = useMemo(() => roleConfigs.filter((c) => {
    if (roleQuery && !c.roleName.toLowerCase().includes(roleQuery.toLowerCase())) return false
    return true
  }), [roleConfigs, roleQuery])

  /* ── 导航至独立页面（全局统一：取消弹窗） ── */
  const handleRoleCreate = () => navigate('/ai-role-auth-edit?type=add')
  const handleRoleEdit = (config: RoleAuthConfig) => navigate(`/ai-role-auth-edit?roleId=${config.roleId}`)
  const handleRoleDetail = (config: RoleAuthConfig) => navigate(`/ai-role-auth-detail?roleId=${config.roleId}`)

  /** 移除角色的模型授权配置 */
  const handleRoleConfigRemove = (config: RoleAuthConfig) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmRemoveRole'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: t('aiQuotaAuth.removeRoleContent', { name: config.roleName }),
      okText: t('aiQuotaAuth.removeBtn'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteRoleAuth(config.roleId)
        await reloadRoleConfigs()
        message.success(t('aiQuotaAuth.roleAuthRemoved'))
      },
    })
  }

  /** 切換角色授權啟用/停用狀態（帶二次確認彈窗，遵循全局統一規範） */
  const handleRoleToggleStatus = (config: RoleAuthConfig) => {
    const isEnable = config.status !== 1
    Modal.confirm({
      title: isEnable ? t('aiQuotaAuth.confirmEnableAuth') : t('aiQuotaAuth.confirmDisableAuth'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? t('aiQuotaAuth.enableRoleContent', { name: config.roleName })
        : t('aiQuotaAuth.disableRoleContent', { name: config.roleName }),
      okText: t('aiQuotaAuth.confirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: isEnable ? undefined : { danger: true },
      onOk: async () => {
        await toggleRoleAuthStatus(config.roleId, isEnable ? 1 : 0)
        await reloadRoleConfigs()
        message.success(isEnable ? t('aiQuotaAuth.roleAuthEnabled') : t('aiQuotaAuth.roleAuthDisabled'))
      },
    })
  }

  /* ── 表格列定义（角色授权） ── */
  const roleColumnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'roleName', title: t('aiQuotaAuth.roleNameCol') },
    { key: 'modelConfigs', title: t('aiQuotaAuth.authModelCol') },
    { key: 'capabilities', title: t('aiQuotaAuth.capabilityCol') },
    { key: 'dataResidency', title: t('aiQuotaAuth.dataResidencyTag') },
    { key: 'userCount', title: t('aiQuotaAuth.bindEmpCount') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]
  const { configComponent: roleConfigComponent } = useColumnConfig('ai-role-auth', roleColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const roleColumns: ColumnsType<RoleAuthConfig> = [
    {
      title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', key: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { title: t('aiQuotaAuth.roleNameCol'), dataIndex: 'roleName', width: 180 },
    {
      title: t('aiQuotaAuth.authModelCol'), dataIndex: 'modelConfigs', key: 'modelConfigs', width: 200,
      render: (configs: RoleAuthConfig['modelConfigs']) => renderModelNameColumn(configs),
    },
    {
      title: t('aiQuotaAuth.capabilityCol'), dataIndex: 'modelConfigs', key: 'capabilities', width: 220,
      render: (configs: RoleAuthConfig['modelConfigs']) => renderCapabilityColumn(configs),
    },
    {
      title: t('aiQuotaAuth.dataResidencyTag'), dataIndex: 'dataResidency', key: 'dataResidency', width: 100, align: 'center',
      render: (v: number) => (v === 1 ? <Tag color="purple">{t('aiQuotaAuth.enabledTag')}</Tag> : <Tag color="default">{t('aiQuotaAuth.disabledTag')}</Tag>),
    },
    {
      title: t('aiQuotaAuth.bindEmpCount'), key: 'userCount', width: 110, align: 'center',
      render: (_, row) => t('aiQuotaAuth.personCount2', { count: row.userIds.length }),
    },
    {
      title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (_: unknown, row: RoleAuthConfig) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handleRoleToggleStatus(row)}
        />
      ),
    },
    {
      title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      title: t('common.action'), key: 'action', width: 170, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleRoleDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handleRoleEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleRoleConfigRemove(row)}>{t('aiQuotaAuth.removeBtn')}</Button>
        </Space>
      ),
    },
  ]

  const roleContent = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiQuotaAuth.roleAuthAlert')}
      />
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiQuotaAuth.roleNameCol')}>
            <Input value={roleQuery} placeholder={t('aiQuotaAuth.roleNamePh')} allowClear onChange={(e) => setRoleQuery(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>{t('common.query')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setRoleQuery(''); }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：左侧统计文字，右侧新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>{t('aiQuotaAuth.customRoleCount', { count: filteredRoles.length })}</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleCreate}>{t('common.add')}</Button>
          {roleConfigComponent}
        </div>
      </div>

      {/* 角色列表表格 */}
      <Table
        rowKey="roleId"
        size="middle"
        loading={loading}
        columns={roleColumns}
        dataSource={filteredRoles}
        scroll={{ x: 1460 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.totalRoles', { total }) }}
      />
    </>
  )

  const tabItems = [
    { key: 'position', label: <Space><IdcardOutlined /><span>{t('aiQuotaAuth.posAuthTab')}</span></Space>, children: positionContent },
    { key: 'role', label: <Space><TeamOutlined /><span>{t('aiQuotaAuth.roleAuthTab')}</span></Space>, children: roleContent },
  ]

  /** 支持 hash 定位 Tab（如 /ai-emp-model-auth#role） */
  const defaultTab = window.location.hash.includes('#role') ? 'role' : 'position'

  return (
    <div className="content-area">
      <Tabs defaultActiveKey={defaultTab} items={tabItems} />
    </div>
  )
}
