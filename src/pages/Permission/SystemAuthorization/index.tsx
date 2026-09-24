/**
 * 权限中心 · 系统授权配置页（Round 4）。
 *
 * 目标：让管理员在界面上以「目标（角色/部门）× 单系统」为最小单位维护系统准入 + 该系统内的菜单动作，
 * 与旧的「功能授权」全量写接口共存但边界更清晰；保存只影响选中的系统，不会覆盖其他系统的既有授权。
 *
 * 交互：
 *  1. 顶部选目标类型 + 具体目标（角色 / 部门）。
 *  2. Tabs 展示所有启用系统；每个 Tab 内含：系统准入 Switch + 该系统内的菜单勾选树 + 每叶子动作 checkbox 组。
 *  3. 底部保存：按当前 Tab 提交，携带 revision 做乐观锁；后端返回 CONFLICT 时提示刷新。
 *  4. 撤销系统准入时不删除该系统内的菜单授权记录（后端 save 里会 DELETE sys_role_menu in 本系统 menuIds），
 *     与前端提示一致："撤销准入 = 同时清除该系统内菜单授权"。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Select,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tree,
  message,
} from 'antd'
import type { DataNode } from 'antd/es/tree'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MenuPermission } from '../types'
import { getMenuActions } from '../types'
import { fetchMenuTree } from '../../../api/menu'
import type { MenuVO } from '../../../api/menu'
import { fetchRoles } from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { fetchDepartments } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import {
  fetchSystemsCatalog,
  readDepartmentAuthorization,
  readRoleAuthorization,
  saveDepartmentAuthorization,
  saveRoleAuthorization,
  type AuthorizationTargetType,
  type SystemCatalogItem,
} from '../../../api/systemAuthorization'
import { translateMenuName } from '../../../i18n/menuNameEn'
import { invalidateSystemNavigation } from '../../../hooks/useSystemNavigation'
import './index.css'

/** 目标类型：与后端 SystemAuthorizationService.TARGET_* 常量一致 */
const TARGET_ROLE: AuthorizationTargetType = 'role'
const TARGET_DEPARTMENT: AuthorizationTargetType = 'department'

/** 系统准入撤销时的行为提示，避免管理员误以为"仅关闭开关不动菜单" */
const REVOKE_HINT = '撤銷准入將同時清除該系統內的菜單授權記錄（不影響其他系統）；如需保留菜單請僅取消勾選需要的動作。'

/** 从后端菜单树中筛选出属于指定系统的子树（顶级 systemCode 匹配 → 保留整棵；子节点继承） */
function pickSystemTree(tree: MenuVO[], systemCode: string): MenuVO[] {
  const visit = (nodes: MenuVO[]): MenuVO[] => {
    return nodes
      .filter((n) => n.status === 1)
      .map((n) => ({ ...n, children: n.children ? visit(n.children) : undefined }))
      .filter((n) => n.menuKey && (n.systemCode === systemCode || (n.children && n.children.length > 0)))
  }
  const roots = tree.filter((n) => n.parentId == null && n.systemCode === systemCode)
  return visit(roots)
}

/** 收集树上所有叶子 menuKey（无 children 的节点） */
function collectLeafKeys(nodes: MenuVO[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (!n.children || n.children.length === 0) {
      out.push(n.menuKey)
    } else {
      collectLeafKeys(n.children, out)
    }
  }
  return out
}

/** 把当前系统的菜单树映射到 antd Tree 结构；title 用节点渲染函数注入动作 checkbox */
function buildTreeData(
  nodes: MenuVO[],
  actionsByMenu: Record<string, string[]>,
  onToggleAction: (menuKey: string, action: string, checked: boolean) => void,
  disabled: boolean,
): DataNode[] {
  return nodes.map((n) => {
    const available = getMenuActions(n.menuKey)
    const selected = new Set(actionsByMenu[n.menuKey] ?? [])
    const title = (
      <div className="sys-authz-tree-node">
        <span className="sys-authz-tree-node-label">
          {translateMenuName(n.menuKey, n.name, n.nameEn)}
        </span>
        {available.length > 0 ? (
          <span className="sys-authz-tree-node-actions">
            {available.map((a) => (
              <Checkbox
                key={a.key}
                checked={selected.has(a.key)}
                disabled={disabled}
                onChange={(e) => onToggleAction(n.menuKey, a.key, e.target.checked)}
              >
                {a.label}
              </Checkbox>
            ))}
          </span>
        ) : null}
      </div>
    )
    return {
      key: n.menuKey,
      title,
      children: n.children?.length
        ? buildTreeData(n.children, actionsByMenu, onToggleAction, disabled)
        : undefined,
    }
  })
}

/** 收集当前系统内所有已选动作非空的 menuKey → 提交给后端的 permissions 数组 */
function collectPermissions(actionsByMenu: Record<string, string[]>): MenuPermission[] {
  const list: MenuPermission[] = []
  for (const [menuKey, actions] of Object.entries(actionsByMenu)) {
    if (actions && actions.length > 0) {
      list.push({ menuKey, actions: [...actions] })
    }
  }
  return list
}

/** 单系统 Tab 内的编辑状态 */
interface SystemDraft {
  systemAccess: boolean
  /** menuKey → 已选动作数组（不含未勾选） */
  actionsByMenu: Record<string, string[]>
  /** 读取时的 revision，用于乐观锁 */
  revision: number
  loaded: boolean
}

export default function SystemAuthorizationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [targetType, setTargetType] = useState<AuthorizationTargetType>(TARGET_ROLE)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [systems, setSystems] = useState<SystemCatalogItem[]>([])
  const [menuTree, setMenuTree] = useState<MenuVO[]>([])
  const [activeSystem, setActiveSystem] = useState<string | null>(null)
  const [draftBySystem, setDraftBySystem] = useState<Record<string, SystemDraft>>({})
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [saving, setSaving] = useState(false)

  /** 初次加载：角色 / 部门 / 系统目录 / 菜单树 */
  useEffect(() => {
    let cancelled = false
    setLoadingPage(true)
    Promise.all([fetchRoles(), fetchDepartments(), fetchSystemsCatalog(), fetchMenuTree()])
      .then(([roleList, deptList, sysList, tree]) => {
        if (cancelled) return
        setRoles(roleList ?? [])
        setDepartments(deptList ?? [])
        setSystems(sysList ?? [])
        setMenuTree(tree ?? [])
        if ((sysList?.length ?? 0) > 0) {
          setActiveSystem(sysList[0].code)
        }
      })
      .catch(() => {
        if (!cancelled) message.error(t('systemAuthz.loadFailed', '加載系統授權資料失敗'))
      })
      .finally(() => {
        if (!cancelled) setLoadingPage(false)
      })
    return () => { cancelled = true }
  }, [t])

  /** 切换目标类型时清空目标 ID 与 draft */
  useEffect(() => {
    setTargetId(null)
    setDraftBySystem({})
  }, [targetType])

  /** 读取当前 Tab 系统的授权快照（首次进入 Tab 时） */
  const ensureDraft = useCallback(async (systemCode: string) => {
    if (!targetId) return
    if (draftBySystem[systemCode]?.loaded) return
    setLoadingDraft(true)
    try {
      const snapshot = targetType === TARGET_ROLE
        ? await readRoleAuthorization(targetId, systemCode)
        : await readDepartmentAuthorization(targetId, systemCode)
      const actionsByMenu: Record<string, string[]> = {}
      for (const perm of snapshot.permissions) {
        actionsByMenu[perm.menuKey] = [...perm.actions]
      }
      setDraftBySystem((prev) => ({
        ...prev,
        [systemCode]: {
          systemAccess: snapshot.systemAccess,
          actionsByMenu,
          revision: snapshot.revision,
          loaded: true,
        },
      }))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('systemAuthz.readFailed', '讀取授權失敗'))
    } finally {
      setLoadingDraft(false)
    }
  }, [targetId, targetType, draftBySystem, t])

  /** Tab 切换 / 目标切换 → 加载当前 draft */
  useEffect(() => {
    if (!targetId || !activeSystem) return
    void ensureDraft(activeSystem)
  }, [targetId, activeSystem, ensureDraft])

  /** 目标 ID 切换时清空 draft（避免遗留旧目标数据） */
  const handleTargetChange = (id: number | null) => {
    setTargetId(id)
    setDraftBySystem({})
  }

  /** 系统准入 toggle */
  const updateSystemAccess = (systemCode: string, next: boolean) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      return { ...prev, [systemCode]: { ...draft, systemAccess: next } }
    })
  }

  /** 菜单动作 toggle；勾选非 view 动作时自动补 view，避免"只给 edit 不给 view"的错配 */
  const toggleAction = (systemCode: string, menuKey: string, action: string, checked: boolean) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      const current = new Set(draft.actionsByMenu[menuKey] ?? [])
      if (checked) {
        current.add(action)
        // 任何动作被勾选时隐含 view：无 view 则接口能调但页面看不到；对齐后端 merge 语义
        current.add('view')
      } else {
        current.delete(action)
        if (action === 'view') {
          // 取消 view 时联动取消所有其他动作（保持"view 是入口"的直觉）
          current.clear()
        }
      }
      const next: Record<string, string[]> = { ...draft.actionsByMenu }
      if (current.size === 0) {
        delete next[menuKey]
      } else {
        next[menuKey] = Array.from(current)
      }
      return { ...prev, [systemCode]: { ...draft, actionsByMenu: next } }
    })
  }

  /** 保存当前 Tab 的授权 */
  const handleSave = async () => {
    if (!targetId || !activeSystem) {
      message.warning(t('systemAuthz.missingTarget', '請先選擇授權目標'))
      return
    }
    const draft = draftBySystem[activeSystem]
    if (!draft?.loaded) {
      message.warning(t('systemAuthz.notReady', '授權資料尚未載入完成'))
      return
    }
    const payload = {
      systemAccess: draft.systemAccess,
      permissions: draft.systemAccess ? collectPermissions(draft.actionsByMenu) : [],
      expectedRevision: draft.revision,
    }
    setSaving(true)
    try {
      const updated = targetType === TARGET_ROLE
        ? await saveRoleAuthorization(targetId, activeSystem, payload)
        : await saveDepartmentAuthorization(targetId, activeSystem, payload)
      message.success(t('systemAuthz.saveSuccess', '系統授權已保存'))
      // 丢弃当前系统的服务端导航缓存，其他已登录用户下次拉 Sidebar 时自动看到新菜单；
      // 自己重新进门户/切换系统时也不会拿到旧菜单。
      invalidateSystemNavigation(activeSystem)
      setDraftBySystem((prev) => ({
        ...prev,
        [activeSystem]: {
          ...prev[activeSystem],
          revision: updated.revision,
          systemAccess: updated.systemAccess,
          actionsByMenu: Object.fromEntries(
            (updated.permissions ?? []).map((p) => [p.menuKey, [...p.actions]]),
          ),
        },
      }))
    } catch (err) {
      // 后端 CONFLICT (1006) 由 request.ts 弹提示；这里补一次重载
      message.error(err instanceof Error ? err.message : t('systemAuthz.saveFailed', '保存失敗'))
      setDraftBySystem((prev) => {
        const copy = { ...prev }
        delete copy[activeSystem]
        return copy
      })
      void ensureDraft(activeSystem)
    } finally {
      setSaving(false)
    }
  }

  /** 丢弃当前 Tab 的编辑，重新从后端读 */
  const handleReset = () => {
    if (!activeSystem) return
    setDraftBySystem((prev) => {
      const copy = { ...prev }
      delete copy[activeSystem]
      return copy
    })
    void ensureDraft(activeSystem)
  }

  /** 目标下拉选项 */
  const targetOptions = useMemo(() => {
    if (targetType === TARGET_ROLE) {
      return roles.map((r) => ({ value: r.id, label: `${r.name} (${r.code ?? r.id})` }))
    }
    return departments.map((d) => ({ value: d.id, label: d.name }))
  }, [targetType, roles, departments])

  const activeDraft = activeSystem ? draftBySystem[activeSystem] : undefined
  const systemTree = useMemo(
    () => (activeSystem ? pickSystemTree(menuTree, activeSystem) : []),
    [menuTree, activeSystem],
  )
  const treeData = useMemo(
    () => (activeSystem
      ? buildTreeData(
          systemTree,
          activeDraft?.actionsByMenu ?? {},
          (menuKey, action, checked) => toggleAction(activeSystem, menuKey, action, checked),
          !activeDraft?.systemAccess,
        )
      : []),
    [systemTree, activeDraft, activeSystem],
  )
  const allLeafKeys = useMemo(() => collectLeafKeys(systemTree), [systemTree])
  const checkedLeafKeys = useMemo(() => {
    if (!activeDraft) return []
    return allLeafKeys.filter((key) => (activeDraft.actionsByMenu[key] ?? []).length > 0)
  }, [activeDraft, allLeafKeys])

  return (
    <div className="sys-authz-page">
      {/* 页面头部：全局统一风格（橙色顶条 + 返回按钮 + 标题） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back', '返回')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#262626' }}>
              {t('systemAuthz.title', '系統授權')}
            </h2>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              {t('systemAuthz.subtitle', '按業務系統為角色/部門授予准入與菜單動作；保存僅影響當前 Tab 所選系統')}
            </span>
          </div>
        </div>
      </div>

      {/* 目标选择模块 */}
      <div className="sys-authz-card">
        <div className="sys-authz-card-header">
          <span className="sys-authz-card-title">{t('systemAuthz.targetSection', '授權目標')}</span>
          <span className="sys-authz-card-hint">
            {t('systemAuthz.targetHint', '切換目標會丟棄當前未保存的編輯')}
          </span>
        </div>
        <div className="sys-authz-target-row">
          <span className="sys-authz-label">{t('systemAuthz.targetType', '目標類型')}:</span>
          <Select
            value={targetType}
            onChange={(v) => setTargetType(v)}
            style={{ width: 160 }}
            options={[
              { value: TARGET_ROLE, label: t('systemAuthz.roleType', '功能角色') },
              { value: TARGET_DEPARTMENT, label: t('systemAuthz.deptType', '部門') },
            ]}
          />
          <span className="sys-authz-label" style={{ marginLeft: 16 }}>
            {t('systemAuthz.targetName', '授權目標')}:
          </span>
          <Select
            value={targetId ?? undefined}
            onChange={(v) => handleTargetChange(v ?? null)}
            showSearch
            optionFilterProp="label"
            placeholder={t('systemAuthz.selectTarget', '請選擇')}
            style={{ minWidth: 280 }}
            options={targetOptions}
            disabled={targetOptions.length === 0}
          />
        </div>
      </div>

      {/* 系统 Tab + 内容 */}
      <div className="sys-authz-card">
        <div className="sys-authz-card-header">
          <span className="sys-authz-card-title">{t('systemAuthz.systemsSection', '按系統配置')}</span>
          {targetId ? (
            <Tag color="blue">{targetType === TARGET_ROLE
              ? t('systemAuthz.roleTag', '角色')
              : t('systemAuthz.deptTag', '部門')}</Tag>
          ) : null}
        </div>
        {loadingPage ? (
          <div className="sys-authz-loading"><Spin size="large" /></div>
        ) : systems.length === 0 ? (
          <Empty description={t('systemAuthz.noSystem', '尚無可配置的業務系統')} />
        ) : (
          <Tabs
            activeKey={activeSystem ?? undefined}
            onChange={(key) => setActiveSystem(key)}
            items={systems.map((sys) => ({
              key: sys.code,
              label: sys.name,
              children: (
                <Spin spinning={loadingDraft}>
                  {!targetId ? (
                    <Alert
                      type="info"
                      showIcon
                      message={t('systemAuthz.pickTargetFirst', '請先在上方選擇授權目標')}
                    />
                  ) : !activeDraft?.loaded ? (
                    <Alert
                      type="warning"
                      showIcon
                      message={t('systemAuthz.loadingDraft', '正在載入該系統的授權快照...')}
                    />
                  ) : (
                    <div className="sys-authz-body">
                      <div className="sys-authz-switch-row">
                        <span className="sys-authz-label">{t('systemAuthz.access', '系統准入')}:</span>
                        <Switch
                          checked={activeDraft.systemAccess}
                          onChange={(next) => updateSystemAccess(sys.code, next)}
                          checkedChildren={t('systemAuthz.onAccess', '准入')}
                          unCheckedChildren={t('systemAuthz.offAccess', '禁止')}
                        />
                        {!activeDraft.systemAccess ? (
                          <span className="sys-authz-revoke-hint">{REVOKE_HINT}</span>
                        ) : null}
                      </div>
                      {treeData.length === 0 ? (
                        <Empty description={t('systemAuthz.noMenuInSystem', '該系統下暫無可授予的菜單')} />
                      ) : (
                        <Tree
                          checkable={false}
                          selectable={false}
                          defaultExpandAll
                          treeData={treeData}
                          checkedKeys={checkedLeafKeys}
                          className="sys-authz-tree"
                        />
                      )}
                    </div>
                  )}
                </Spin>
              ),
            }))}
          />
        )}
      </div>

      {/* 底部：保存 / 重置 */}
      {targetId && activeSystem && activeDraft?.loaded ? (
        <div className="form-footer">
          <Button onClick={handleReset}>
            {t('common.reset', '重置')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
          >
            {t('systemAuthz.saveCurrent', '保存當前系統')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
