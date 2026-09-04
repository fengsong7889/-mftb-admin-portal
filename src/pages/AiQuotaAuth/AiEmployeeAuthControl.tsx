import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Popover, Select, Switch, Table, Tabs, Tag, message, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, TeamOutlined, IdcardOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchModels, type AiModel } from '../../api'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, POSITION_SEQUENCE_TAG_COLOR } from '../../api/position'
import {
  loadPosRules,
  savePosRules,
  loadRoleAuthConfigs,
  saveRoleAuthConfigs,
  CAPABILITY_SHORT_FIELDS,
  type PosAuthRule,
  type RoleAuthConfig,
  type ModelAuthConfig,
} from './empAuth/modelAuthCapability'

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

  /** 模型就绪后从 localStorage 载入授权规则（含旧结构自动迁移） */
  useEffect(() => {
    if (models.length > 0) {
      setPosRules(loadPosRules(models))
    }
  }, [models])

  /** 更新规则并持久化（localStorage 模拟后端） */
  const persistPosRules = (rules: PosAuthRule[]) => {
    setPosRules(rules)
    savePosRules(rules)
  }

  const filteredRules = useMemo(() => posRules.filter((r) => {
    if (ruleQuery && !r.ruleName.toLowerCase().includes(ruleQuery.toLowerCase())) return false
    if (ruleSeqFilter && !r.sequence.includes(ruleSeqFilter)) return false
    if (ruleLevelFilter.length && !r.jobLevels.some((l) => ruleLevelFilter.includes(l))) return false
    if (ruleStatusFilter !== undefined && r.status !== Number(ruleStatusFilter)) return false
    return true
  }), [posRules, ruleQuery, ruleSeqFilter, ruleLevelFilter, ruleStatusFilter])

  /* ── 导航至独立页面（全局统一：取消弹窗） ── */
  const handleRuleCreate = () => navigate('/ai-pos-auth-edit')
  const handleRuleEdit = (rule: PosAuthRule) => navigate(`/ai-pos-auth-edit?id=${rule.id}`)
  const handleRuleDetail = (rule: PosAuthRule) => navigate(`/ai-pos-auth-detail?id=${rule.id}`)

  const handleRuleDelete = (rule: PosAuthRule) => {
    Modal.confirm({
      title: '确认删除',
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: `删除后授权规则「${rule.ruleName}」立即失效，匹配该职级序列/职级的职位不再获得此授权。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        persistPosRules(posRules.filter((r) => r.id !== rule.id))
        message.success('规则已删除')
      },
    })
  }

  /** 切换规则启用/停用状态（带二次确认弹窗，遵循全局统一规范） */
  const handleRuleToggleStatus = (rule: PosAuthRule) => {
    const isEnable = rule.status !== 1
    Modal.confirm({
      title: isEnable ? '确认启用' : '确认停用',
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? `确定要启用授权规则「${rule.ruleName}」吗？启用后匹配该职级序列/职级的职位将重新获得对应模型访问权。`
        : `确定要停用授权规则「${rule.ruleName}」吗？停用后匹配该职级序列/职级的职位将立即失去对应模型访问权。`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: isEnable ? undefined : { danger: true },
      onOk: () => {
        persistPosRules(posRules.map((r) => (r.id === rule.id ? { ...r, status: isEnable ? 1 : 0 } : r)))
        message.success(isEnable ? '规则已启用' : '规则已停用')
      },
    })
  }

  /* ── 表格列定义（职位授权规则） ── */
  const posColumnMeta = [
    { key: 'ruleName', title: '规则名称' },
    { key: 'sequence', title: '职级序列' },
    { key: 'jobLevel', title: '职级' },
    { key: 'modelConfigs', title: '授权模型' },
    { key: 'capabilities', title: '授權能力' },
    { key: 'dataResidency', title: '數據不出域' },
    { key: 'description', title: '描述' },
    { key: 'status', title: '状态' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: posConfigComponent } = useColumnConfig('ai-pos-auth', posColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  /** 授權模型列渲染：僅展示模型名稱 Tag */
  const renderModelNameColumn = (configs: ModelAuthConfig[]) => {
    if (!configs?.length) return <Tag>未配置</Tag>
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
    if (!configs?.length) return <Tag>未配置</Tag>
    // 去重：收集所有模型中已啟用的能力
    const enabledCaps = CAPABILITY_SHORT_FIELDS.filter(({ key }) =>
      configs.some((c) => c[key] === 1),
    )
    if (!enabledCaps.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>未開放任何能力</span>
    return (
      <Popover
        trigger="click"
        title="各模型授權能力明細"
        content={
          <div style={{ maxWidth: 380 }}>
            {configs.map((c) => {
              const caps = CAPABILITY_SHORT_FIELDS.filter(({ key }) => c[key] === 1)
              return (
                <div key={c.modelId} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{modelName[c.modelId] ?? `#${c.modelId}`}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {caps.length > 0
                      ? caps.map(({ key, label, color }) => (
                          <Tag key={key} color={color} style={{ fontSize: 11 }}>{label}</Tag>
                        ))
                      : <span style={{ fontSize: 11, color: '#BFBFBF' }}>未開放任何能力</span>
                    }
                  </div>
                </div>
              )
            })}
          </div>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'pointer' }}>
          {enabledCaps.map(({ key, label, color }) => (
            <Tag key={key} color={color} style={{ fontSize: 11 }}>{label}</Tag>
          ))}
        </div>
      </Popover>
    )
  }

  const posColumns: ColumnsType<PosAuthRule> = [
    { title: '规则名称', dataIndex: 'ruleName', key: 'ruleName', width: 160 },
    {
      title: '职级序列', dataIndex: 'sequence', key: 'sequence', width: 130, align: 'center',
      render: (seqs: string[]) => (seqs?.length
        ? <Space size={4} wrap>{seqs.map((v) => <Tag key={v} color={POSITION_SEQUENCE_TAG_COLOR[v]}>{v}</Tag>)}</Space>
        : <Tag>未设置</Tag>),
    },
    {
      title: '职级', dataIndex: 'jobLevels', key: 'jobLevel', width: 150, align: 'center',
      render: (levels: string[]) => (levels?.length
        ? <Space size={4} wrap>{levels.map((l) => <Tag key={l}>{l}</Tag>)}</Space>
        : <Tag>未设置</Tag>),
    },
    {
      title: '授权模型', dataIndex: 'modelConfigs', key: 'modelConfigs', width: 200,
      render: (configs: PosAuthRule['modelConfigs']) => renderModelNameColumn(configs),
    },
    {
      title: '授權能力', dataIndex: 'modelConfigs', key: 'capabilities', width: 220,
      render: (configs: PosAuthRule['modelConfigs']) => renderCapabilityColumn(configs),
    },
    {
      title: '數據不出域', dataIndex: 'dataResidency', key: 'dataResidency', width: 100, align: 'center',
      render: (v: number) => (v === 1 ? <Tag color="purple">已啟用</Tag> : <Tag color="default">未啟用</Tag>),
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PosAuthRule) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => handleRuleToggleStatus(row)}
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 170, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleRuleDetail(row)}>详情</Button>
          <Button type="link" onClick={() => handleRuleEdit(row)}>编辑</Button>
          <Button type="link" danger onClick={() => handleRuleDelete(row)}>删除</Button>
        </>
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
            按职位授权通过配置授权规则（职级序列 + 职级 + 授权模型）批量下发模型权限，匹配规则的职位下所有员工自动获得对应模型访问权，授权细化到模型能力顆粒度。
            <span style={{ color: '#8C8C8C' }}>
              当员工同时匹配多条职位规则或多个角色时，模型访问权限取所有角色授权的<b>并集</b>（即员工可访问所有角色授权的模型合集）；
              优先级：员工个人覆盖 &gt; 职位规则 &gt; 角色规则。
            </span>
          </span>
        }
      />
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="规则名称">
            <Input value={ruleQuery} placeholder="请输入规则名称" allowClear onChange={(e) => setRuleQuery(e.target.value)} />
          </Form.Item>
          <Form.Item label="职级序列">
            <Select value={ruleSeqFilter} placeholder="全部" allowClear onChange={(v) => setRuleSeqFilter(v)} options={POSITION_SEQUENCE_OPTIONS} />
          </Form.Item>
          <Form.Item label="职级">
            <Select mode="multiple" value={ruleLevelFilter} placeholder="全部" allowClear onChange={(v) => setRuleLevelFilter(v)} options={POSITION_RANK_OPTIONS} />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              value={ruleStatusFilter}
              placeholder="全部"
              allowClear
              options={[
                { value: '1', label: '启用' },
                { value: '0', label: '停用' },
              ]}
              onChange={(v) => setRuleStatusFilter(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setRuleQuery(''); setRuleSeqFilter(undefined); setRuleLevelFilter([]); setRuleStatusFilter(undefined); }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>共 {filteredRules.length} 条授权规则</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRuleCreate}>新增</Button>
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
        scroll={{ x: 1210 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条规则` }}
      />
    </>
  )

  /* ═══════════ Tab2: 角色授权 ═══════════ */
  const [roleConfigs, setRoleConfigs] = useState<RoleAuthConfig[]>([])
  const [roleQuery, setRoleQuery] = useState('')

  /** 模型就绪后从 localStorage 载入角色授权配置（含旧结构自动迁移） */
  useEffect(() => {
    if (models.length > 0) {
      setRoleConfigs(loadRoleAuthConfigs(models))
    }
  }, [models])

  const filteredRoles = useMemo(() => roleConfigs.filter((c) => {
    if (roleQuery && !c.roleName.toLowerCase().includes(roleQuery.toLowerCase())) return false
    return true
  }), [roleConfigs, roleQuery])

  /* ── 导航至独立页面（全局统一：取消弹窗） ── */
  const handleRoleCreate = () => navigate('/ai-role-auth-edit')
  const handleRoleEdit = (config: RoleAuthConfig) => navigate(`/ai-role-auth-edit?roleId=${config.roleId}`)
  const handleRoleDetail = (config: RoleAuthConfig) => navigate(`/ai-role-auth-detail?roleId=${config.roleId}`)

  /** 移除角色的模型授权配置 */
  const handleRoleConfigRemove = (config: RoleAuthConfig) => {
    Modal.confirm({
      title: '确认移除',
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: `移除后角色「${config.roleName}」的模型授权配置立即失效，绑定员工不再通过该角色获得模型访问权。`,
      okText: '移除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const next = roleConfigs.filter((c) => c.roleId !== config.roleId)
        setRoleConfigs(next)
        saveRoleAuthConfigs(next)
        message.success('角色授权配置已移除')
      },
    })
  }

  /* ── 表格列定义（角色授权） ── */
  const roleColumnMeta = [
    { key: 'roleName', title: '角色名称' },
    { key: 'modelConfigs', title: '授权模型' },
    { key: 'capabilities', title: '授權能力' },
    { key: 'dataResidency', title: '數據不出域' },
    { key: 'userCount', title: '绑定员工数' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]
  const { configComponent: roleConfigComponent } = useColumnConfig('ai-role-auth', roleColumnMeta, [{ key: 'action', visible: true, locked: 'tail' as const }])

  const roleColumns: ColumnsType<RoleAuthConfig> = [
    { title: '角色名称', dataIndex: 'roleName', width: 180 },
    {
      title: '授权模型', dataIndex: 'modelConfigs', key: 'modelConfigs', width: 200,
      render: (configs: RoleAuthConfig['modelConfigs']) => renderModelNameColumn(configs),
    },
    {
      title: '授權能力', dataIndex: 'modelConfigs', key: 'capabilities', width: 220,
      render: (configs: RoleAuthConfig['modelConfigs']) => renderCapabilityColumn(configs),
    },
    {
      title: '數據不出域', dataIndex: 'dataResidency', key: 'dataResidency', width: 100, align: 'center',
      render: (v: number) => (v === 1 ? <Tag color="purple">已啟用</Tag> : <Tag color="default">未啟用</Tag>),
    },
    {
      title: '绑定员工数', key: 'userCount', width: 110, align: 'center',
      render: (_, row) => `${row.userIds.length}人`,
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      title: '操作', key: 'action', width: 170, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleRoleDetail(row)}>详情</Button>
          <Button type="link" onClick={() => handleRoleEdit(row)}>配置</Button>
          <Button type="link" danger onClick={() => handleRoleConfigRemove(row)}>移除</Button>
        </>
      ),
    },
  ]

  const roleContent = (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="角色授权用于批量管理一组员工的模型权限，支持自定义角色名称、绑定员工并按模型能力顆粒度配置授权（角色与权限系统无关）"
      />
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="角色名称">
            <Input value={roleQuery} placeholder="请输入角色名称" allowClear onChange={(e) => setRoleQuery(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => {}}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setRoleQuery(''); }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：左侧统计文字，右侧新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#595959' }}>共 {filteredRoles.length} 个自定义角色</span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleRoleCreate}>新增</Button>
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
        scroll={{ x: 1220 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个角色` }}
      />
    </>
  )

  const tabItems = [
    { key: 'position', label: <Space><IdcardOutlined /><span>按职位授权</span></Space>, children: positionContent },
    { key: 'role', label: <Space><TeamOutlined /><span>角色授权</span></Space>, children: roleContent },
  ]

  /** 支持 hash 定位 Tab（如 /ai-emp-model-auth#role） */
  const defaultTab = window.location.hash.includes('#role') ? 'role' : 'position'

  return (
    <div className="content-area">
      <Tabs defaultActiveKey={defaultTab} items={tabItems} />
    </div>
  )
}
