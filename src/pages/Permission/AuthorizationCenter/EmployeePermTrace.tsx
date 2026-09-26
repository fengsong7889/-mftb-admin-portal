/**
 * 授权中心 · 员工权限透视。
 *
 * 选择员工后展示其"运行时生效规则"下的最终权限并集（启用角色 ∪ 有效部门，仅启用菜单），
 * 每条菜单动作与系统准入均标注来源，用于快速回答"他为什么看得到 / 看不到"。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Card, Collapse, Empty, Select, Space, Spin, Table, Tag, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchEmployees } from '../../../api/employee'
import type { EmployeeItem } from '../../../api/employee'
import { fetchPermissionTrace } from '../../../api/authorizationCenter'
import type { EmpPermissionTrace, TraceMenu } from '../../../api/authorizationCenter'
import { ACTION_LABEL_MAP } from '../types'
import { translateMenuName } from '../../../i18n/menuNameEn'

/** 未归属系统菜单的分组 key */
const UNGROUPED = '__ungrouped__'

export default function EmployeePermTrace() {
  const { t } = useTranslation()

  const [employeeOptions, setEmployeeOptions] = useState<Array<{ value: number; label: string }>>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [trace, setTrace] = useState<EmpPermissionTrace | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [loadingTrace, setLoadingTrace] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 员工远程搜索（在职，前 50 条） */
  const handleSearch = useCallback((keyword: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLoadingOptions(true)
      try {
        const res = await fetchEmployees({ page: 1, size: 50, keyword: keyword || undefined, employmentStatus: 'active' })
        setEmployeeOptions((res.records ?? []).map((e: EmployeeItem) => ({
          value: e.id,
          label: `${e.name} (${e.empId})${e.department ? ` · ${e.department}` : ''}`,
        })))
      } catch {
        // 错误提示由请求层统一处理
      } finally {
        setLoadingOptions(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    handleSearch('')
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [handleSearch])

  /** 选择员工 → 拉取权限透视 */
  useEffect(() => {
    if (selectedUserId == null) {
      setTrace(null)
      return
    }
    let cancelled = false
    setLoadingTrace(true)
    fetchPermissionTrace(selectedUserId)
      .then((data) => { if (!cancelled) setTrace(data) })
      .catch(() => { if (!cancelled) setTrace(null) })
      .finally(() => { if (!cancelled) setLoadingTrace(false) })
    return () => { cancelled = true }
  }, [selectedUserId])

  /** 系统编码 → 名称（准入列表优先，缺失时回落编码本身） */
  const systemNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of trace?.systems ?? []) {
      map.set(s.code, s.name || s.code)
    }
    return map
  }, [trace])

  /** 菜单按归属系统分组（保持后端返回顺序：系统 sort + 菜单 sort） */
  const groupedMenus = useMemo(() => {
    const groups: Array<{ systemCode: string; menus: TraceMenu[] }> = []
    const index = new Map<string, number>()
    for (const menu of trace?.menus ?? []) {
      const code = menu.systemCode || UNGROUPED
      const at = index.get(code)
      if (at == null) {
        index.set(code, groups.length)
        groups.push({ systemCode: code, menus: [menu] })
      } else {
        groups[at].menus.push(menu)
      }
    }
    return groups
  }, [trace])

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div className="authz-trace-picker">
          <UserOutlined style={{ color: '#E8720C' }} />
          <span className="authz-field-label">{t('authorizationCenter.trace.pickEmployee', '選擇員工')}:</span>
          <Select
            style={{ minWidth: 360 }}
            showSearch
            filterOption={false}
            onSearch={handleSearch}
            loading={loadingOptions}
            placeholder={t('authorizationCenter.trace.placeholder', '輸入姓名/工号搜索員工')}
            value={selectedUserId ?? undefined}
            onChange={(v) => setSelectedUserId(v ?? null)}
            options={employeeOptions}
            notFoundContent={loadingOptions ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          />
          {trace && !trace.superAdmin ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('authorizationCenter.trace.summary',
                '最終權限 = 啟用角色 ∪ 部門授權；共 {{menus}} 個菜單、{{systems}} 個系統准入',
                { menus: trace.menus.length, systems: trace.systems.length })}
            </Typography.Text>
          ) : null}
        </div>

        {trace?.superAdmin ? (
          <Alert
            type="warning"
            showIcon
            message={t('authorizationCenter.trace.adminTitle', '該員工為系統超級管理員')}
            description={t('authorizationCenter.trace.adminDesc', '超管賬號直通所有菜單與系統准入，無需（也不應）逐項授權。')}
          />
        ) : null}
      </Card>

      {loadingTrace ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin size="large" /></div>
      ) : !trace ? (
        <Empty description={t('authorizationCenter.trace.empty', '請先選擇員工查看其權限來源')} />
      ) : trace.superAdmin ? null : (
        <>
          {/* 系统准入来源 */}
          <Card
            size="small"
            title={t('authorizationCenter.trace.systemAccess', '系統准入')}
            style={{ marginBottom: 16 }}
          >
            {trace.systems.length === 0 ? (
              <span className="authz-audit-empty">{t('authorizationCenter.trace.noSystem', '該員工暫無任何系統准入')}</span>
            ) : (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {trace.systems.map((s) => (
                  <div key={s.code} className="authz-trace-summary">
                    <Tag color="geekblue">{s.name || s.code}</Tag>
                    {s.sources.map((src) => <Tag key={src} color="default">{src}</Tag>)}
                  </div>
                ))}
              </Space>
            )}
          </Card>

          {/* 菜单动作按系统分组 */}
          {groupedMenus.length === 0 ? (
            <Empty description={t('authorizationCenter.trace.noMenu', '該員工暫無任何菜單授權')} />
          ) : (
            <Collapse
              className="authz-trace-collapse"
              defaultActiveKey={groupedMenus.map((g) => g.systemCode)}
              items={groupedMenus.map((group) => ({
                key: group.systemCode,
                label: (
                  <span>
                    <b>{group.systemCode === UNGROUPED
                      ? t('authorizationCenter.trace.ungrouped', '未歸屬系統')
                      : systemNameMap.get(group.systemCode) ?? group.systemCode}</b>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t('authorizationCenter.trace.menuCount', '{{count}} 個菜單', { count: group.menus.length })}
                    </Typography.Text>
                  </span>
                ),
                children: (
                  <Table<TraceMenu>
                    rowKey="menuKey"
                    size="small"
                    pagination={false}
                    dataSource={group.menus}
                    columns={[
                      {
                        title: t('authorizationCenter.trace.colMenu', '菜單'),
                        dataIndex: 'menuKey',
                        width: 240,
                        render: (_: string, record) => translateMenuName(record.menuKey, record.menuName, record.menuNameEn),
                      },
                      {
                        title: t('authorizationCenter.trace.colActions', '最終動作'),
                        dataIndex: 'actions',
                        width: 280,
                        render: (actions: string[]) => (
                          <Space size={4} wrap>
                            {actions.map((a) => <Tag key={a} color="blue">{ACTION_LABEL_MAP[a] ?? a}</Tag>)}
                          </Space>
                        ),
                      },
                      {
                        title: t('authorizationCenter.trace.colSources', '權限來源'),
                        dataIndex: 'sources',
                        render: (sources: string[]) => (
                          <Space size={4} wrap>
                            {sources.map((s) => <Tag key={s} color={s.startsWith('角色') ? 'green' : 'purple'}>{s}</Tag>)}
                          </Space>
                        ),
                      },
                    ]}
                  />
                ),
              }))}
            />
          )}
        </>
      )}
    </div>
  )
}
