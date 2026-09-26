/**
 * 授权中心 · 授权变更审计。
 *
 * 分页查询 sys_permission_audit_log：谁、何时、对哪个目标（角色/部门）的哪个系统
 * 做了什么类型的授权变更；展开行显示变更前后快照 diff。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { fetchRoles } from '../../../api/role'
import { fetchDepartments } from '../../../api/department'
import { fetchMenuTree } from '../../../api/menu'
import type { MenuVO } from '../../../api/menu'
import {
  fetchPermissionAudit,
  AUDIT_CHANGE_TYPES,
  type PermissionAuditItem,
} from '../../../api/authorizationCenter'
import { fetchSystemsCatalog } from '../../../api/systemAuthorization'
import { translateMenuName } from '../../../i18n/menuNameEn'

const { RangePicker } = DatePicker

/** 目标类型选项（与后端 PermissionAuditService.TARGET_* 对齐） */
const TARGET_OPTIONS = [
  { value: 'role', color: 'blue' },
  { value: 'department', color: 'purple' },
] as const

/** 变更类型 → Tag 颜色 */
const CHANGE_COLOR: Record<string, string> = {
  [AUDIT_CHANGE_TYPES.GRANT]: 'green',
  [AUDIT_CHANGE_TYPES.REVOKE]: 'red',
  [AUDIT_CHANGE_TYPES.UPDATE]: 'blue',
  [AUDIT_CHANGE_TYPES.DELETE]: 'volcano',
  [AUDIT_CHANGE_TYPES.COPY]: 'cyan',
  [AUDIT_CHANGE_TYPES.BIND]: 'gold',
  [AUDIT_CHANGE_TYPES.STATUS]: 'default',
}

/** 菜单权限快照条目 */
interface SnapshotPerm {
  menuKey: string
  actions?: string[]
}

/** 菜单 key → 展示名映射（含中英文，由外层菜单树拍平） */
export interface MenuNameMap {
  [menuKey: string]: { name: string; nameEn?: string | null }
}

/** 解析审计快照 JSON 并渲染成人读明细；解析失败回退原文展示 */
function SnapshotPanel({ raw, title, menuNames }: { raw?: string | null; title: string; menuNames: MenuNameMap }) {
  const { t } = useTranslation()
  const parsed = useMemo<{ value: unknown; error: boolean }>(() => {
    if (!raw) return { value: null, error: false }
    try {
      return { value: JSON.parse(raw), error: false }
    } catch {
      return { value: raw, error: true }
    }
  }, [raw])

  const body = () => {
    if (!raw) {
      return <span className="authz-audit-empty">{t('authorizationCenter.audit.noSnapshot', '無快照（首次操作或歷史記錄）')}</span>
    }
    if (parsed.error || typeof parsed.value === 'string') {
      return <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{String(parsed.value)}</pre>
    }
    const value = parsed.value
    if (Array.isArray(value)) {
      return <PermList perms={value as SnapshotPerm[]} menuNames={menuNames} />
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const rows: React.ReactNode[] = []
      if (typeof obj.systemAccess === 'boolean') {
        rows.push(
          <div key="access" className="authz-audit-perm-row">
            <span>{t('authorizationCenter.audit.systemAccess', '系統准入')}:</span>
            <Tag color={obj.systemAccess ? 'green' : 'red'}>
              {obj.systemAccess ? t('authorizationCenter.audit.on', '准入') : t('authorizationCenter.audit.off', '禁止')}
            </Tag>
          </div>,
        )
      }
      if (Array.isArray(obj.permissions)) {
        rows.push(<PermList key="perms" perms={obj.permissions as SnapshotPerm[]} menuNames={menuNames} />)
      }
      if (Array.isArray(obj.userIds)) {
        rows.push(
          <div key="users" className="authz-audit-perm-row">
            <span>{t('authorizationCenter.audit.boundUsers', '綁定賬號數')}:</span>
            <b>{(obj.userIds as unknown[]).length}</b>
          </div>,
        )
      }
      if (obj.status !== undefined) {
        rows.push(
          <div key="status" className="authz-audit-perm-row">
            <span>{t('authorizationCenter.audit.status', '狀態')}:</span>
            <b>{Number(obj.status) === 1
              ? t('authorizationCenter.audit.statusEnabled', '啟用')
              : t('authorizationCenter.audit.statusDisabled', '停用')}</b>
          </div>,
        )
      }
      if (obj.fromRoleName !== undefined) {
        rows.push(
          <div key="from" className="authz-audit-perm-row">
            <span>{t('authorizationCenter.audit.copiedFrom', '複製來源角色')}:</span>
            <b>{String(obj.fromRoleName)}</b>
          </div>,
        )
      }
      if (obj.menuCopied !== undefined || obj.systemCopied !== undefined) {
        rows.push(
          <div key="copied" className="authz-audit-perm-row">
            <span>{t('authorizationCenter.audit.copiedCounts', '複製結果')}:</span>
            <b>
              {t('authorizationCenter.audit.copiedDetail',
                '菜單 {{menu}} 項 / 系統准入 {{system}} 項',
                { menu: String(obj.menuCopied ?? 0), system: String(obj.systemCopied ?? 0) })}
            </b>
          </div>,
        )
      }
      if (rows.length === 0) {
        return <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(value, null, 2)}</pre>
      }
      return <div>{rows}</div>
    }
    return <span className="authz-audit-empty">-</span>
  }

  return (
    <div className="authz-audit-snapshot-col">
      <div className="authz-audit-snapshot-title">{title}</div>
      {body()}
    </div>
  )
}

/** 菜单权限列表渲染（menuKey 经菜单树映射翻译，无映射时回退 key） */
function PermList({ perms, menuNames }: { perms: SnapshotPerm[]; menuNames: MenuNameMap }) {
  const { t } = useTranslation()
  if (!perms || perms.length === 0) {
    return <span className="authz-audit-empty">{t('authorizationCenter.audit.noPerms', '無菜單授權')}</span>
  }
  return (
    <div>
      {perms.map((p) => {
        const meta = menuNames[p.menuKey]
        return (
          <div key={p.menuKey} className="authz-audit-perm-row">
            <span>
              {translateMenuName(p.menuKey, meta?.name ?? p.menuKey, meta?.nameEn ?? null)}
              {meta ? null : <span className="authz-audit-empty"> ({p.menuKey})</span>}
            </span>
            <Space size={4} wrap>
              {(p.actions ?? []).map((a) => <Tag key={a} color="blue">{a}</Tag>)}
            </Space>
          </div>
        )
      })}
    </div>
  )
}

export default function ChangeAuditLog() {
  const { t } = useTranslation()

  const [searchForm] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<PermissionAuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [roleOptions, setRoleOptions] = useState<Array<{ value: number; label: string }>>([])
  const [deptOptions, setDeptOptions] = useState<Array<{ value: number; label: string }>>([])
  /** 系统编码 → 展示名（审计列表“業務系統”列用） */
  const [systemNameMap, setSystemNameMap] = useState<Record<string, string>>({})
  /** 菜单 key → 展示名（审计 diff 快照里的 menuKey 翻译用） */
  const [menuNames, setMenuNames] = useState<MenuNameMap>({})

  /** 目标下拉数据（角色/部门全量列表）+ 系统目录 + 菜单树 */
  useEffect(() => {
    Promise.all([fetchRoles(), fetchDepartments(), fetchSystemsCatalog(), fetchMenuTree()])
      .then(([roles, depts, sysList, tree]) => {
        setRoleOptions((roles ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.code ?? r.id})` })))
        setDeptOptions((depts ?? []).map((d) => ({ value: d.id, label: d.name })))
        setSystemNameMap(Object.fromEntries((sysList ?? []).map((s) => [s.code, s.name || s.code])))
        const names: MenuNameMap = {}
        const walk = (nodes: MenuVO[]) => {
          for (const n of nodes) {
            if (n.menuKey) names[n.menuKey] = { name: n.name, nameEn: n.nameEn }
            if (n.children?.length) walk(n.children)
          }
        }
        walk(tree ?? [])
        setMenuNames(names)
      })
      .catch(() => {
        // 错误提示由请求层统一处理
      })
  }, [])

  const fetchList = useCallback(async (targetPage = page, targetSize = pageSize) => {
    const values = searchForm.getFieldsValue()
    const range: [Dayjs, Dayjs] | undefined = values.range
    setLoading(true)
    try {
      const res = await fetchPermissionAudit({
        targetType: values.targetType || undefined,
        targetId: values.targetId ?? undefined,
        changeType: values.changeType || undefined,
        operator: values.operator?.trim() || undefined,
        start: range?.[0] ? range[0].startOf('day').valueOf() : undefined,
        end: range?.[1] ? range[1].endOf('day').valueOf() : undefined,
        page: targetPage,
        pageSize: targetSize,
      })
      setRecords(res.records ?? [])
      setTotal(res.total ?? 0)
      setPage(targetPage)
      setPageSize(targetSize)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchForm])

  useEffect(() => {
    fetchList(1, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 目标类型切换时清空已选目标 */
  const handleTargetTypeChange = () => {
    searchForm.setFieldsValue({ targetId: undefined })
  }

  const targetTypeValue = Form.useWatch('targetType', searchForm)
  const targetOptions = targetTypeValue === 'role' ? roleOptions : targetTypeValue === 'department' ? deptOptions : []

  const columns: TableColumnsType<PermissionAuditItem> = useMemo(() => [
    {
      title: t('authorizationCenter.audit.colTime', '變更時間'),
      dataIndex: 'createdAt',
      width: 170,
      render: (v?: number | null) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('authorizationCenter.audit.colTarget', '授權目標'),
      dataIndex: 'targetName',
      width: 220,
      render: (_: string, record) => {
        const typeMeta = TARGET_OPTIONS.find((o) => o.value === record.targetType)
        return (
          <Space size={6}>
            <Tag color={typeMeta?.color}>
              {record.targetType === 'role'
                ? t('authorizationCenter.roleTag', '角色')
                : t('authorizationCenter.deptTag', '部門')}
            </Tag>
            <span>{record.targetName || `#${record.targetId}`}</span>
          </Space>
        )
      },
    },
    {
      title: t('authorizationCenter.audit.colSystem', '業務系統'),
      dataIndex: 'systemCode',
      width: 140,
      render: (v?: string | null) => (v ? (
        <Tooltip title={v}>
          <Tag color="geekblue">{systemNameMap[v] ?? v}</Tag>
        </Tooltip>
      ) : <span className="authz-audit-empty">{t('authorizationCenter.audit.crossSystem', '跨系統')}</span>),
    },
    {
      title: t('authorizationCenter.audit.colChange', '變更類型'),
      dataIndex: 'changeType',
      width: 110,
      render: (v: string) => (
        <Tag color={CHANGE_COLOR[v] ?? 'default'}>
          {v ? t(`authorizationCenter.audit.change.${v}`, v) : '-'}
        </Tag>
      ),
    },
    {
      title: t('authorizationCenter.audit.colOperator', '操作人'),
      dataIndex: 'operator',
      width: 140,
      render: (v?: string | null) => v || '-',
    },
  ], [t, systemNameMap])

  return (
    <div>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={() => fetchList(1, pageSize)}>
          <Form.Item name="targetType" label={t('authorizationCenter.audit.filterTargetType', '目標類型')}>
            <Select
              allowClear
              style={{ width: 120 }}
              placeholder={t('authorizationCenter.audit.all', '全部')}
              options={[
                { value: 'role', label: t('authorizationCenter.roleType', '功能角色') },
                { value: 'department', label: t('authorizationCenter.deptType', '部門') },
              ]}
              onChange={handleTargetTypeChange}
            />
          </Form.Item>
          <Form.Item name="targetId" label={t('authorizationCenter.audit.filterTarget', '授權目標')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 200 }}
              placeholder={targetTypeValue ? t('authorizationCenter.selectTarget', '請選擇') : t('authorizationCenter.audit.pickTypeFirst', '先選目標類型')}
              options={targetOptions}
              disabled={!targetTypeValue}
            />
          </Form.Item>
          <Form.Item name="changeType" label={t('authorizationCenter.audit.colChange', '變更類型')}>
            <Select
              allowClear
              style={{ width: 120 }}
              placeholder={t('authorizationCenter.audit.all', '全部')}
              options={Object.values(AUDIT_CHANGE_TYPES).map((v) => ({ value: v, label: t(`authorizationCenter.audit.change.${v}`, v) }))}
            />
          </Form.Item>
          <Form.Item name="operator" label={t('authorizationCenter.audit.colOperator', '操作人')}>
            <Input allowClear style={{ width: 140 }} placeholder={t('authorizationCenter.audit.operatorPlaceholder', '操作人帳號')} />
          </Form.Item>
          <Form.Item name="range" label={t('authorizationCenter.audit.colTime', '變更時間')}>
            <RangePicker allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.query', '查詢')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { searchForm.resetFields(); fetchList(1, pageSize) }}>{t('common.reset', '重置')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      {/* 审计列表 */}
      <Table<PermissionAuditItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={records}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (n) => t('common.total', { count: n }),
          onChange: (p, s) => fetchList(p, s),
        }}
        expandable={{
          expandedRowRender: (record) => (
            <div className="authz-audit-snapshot">
              <SnapshotPanel title={t('authorizationCenter.audit.before', '變更前')} raw={record.beforeSnapshot} menuNames={menuNames} />
              <SnapshotPanel title={t('authorizationCenter.audit.after', '變更後')} raw={record.afterSnapshot} menuNames={menuNames} />
            </div>
          ),
        }}
        locale={{ emptyText: t('authorizationCenter.audit.empty', '暫無授權變更記錄') }}
      />
    </div>
  )
}
