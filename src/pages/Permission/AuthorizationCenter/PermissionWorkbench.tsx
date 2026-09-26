/**
 * 授权中心 · 授权配置工作台。
 *
 * 以「目标（角色/部门）× 系统」为最小原子单位维护系统准入 + 该系统内的菜单动作：
 *  1. 左侧系统列表（准入状态徽标 + 未保存红点）替代横向 Tab，12+ 系统不拥挤；
 *  2. 右侧主体为可勾选菜单树（checkStrictly：勾选=授予该菜单，默认 view；
 *     不做父→子级联，避免"给分组授予入口"被放大成全子菜单越权）；
 *  3. 选中菜单节点后在右列「功能操作」面板微调动作；取消 view 即撤销该菜单授权；
 *  4. 快捷操作：全选菜单 / 清空本系统；dirty 系统红点 + 「保存全部變更」串行链式
 *     传递最新全局 revision；冲突失败保留草稿不静默丢弃。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Empty, Modal, Select, Space, Spin, Switch, Tag, Tree, message } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { CopyOutlined, SaveOutlined } from '@ant-design/icons'
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
  saveRoleAuthorization,
  saveDepartmentAuthorization,
  type AuthorizationTargetType,
  type SystemAuthorizationPayload,
  type SystemCatalogItem,
} from '../../../api/systemAuthorization'
import {
  fetchRoleOverview,
  fetchDepartmentOverview,
} from '../../../api/authorizationCenter'
import { translateMenuName } from '../../../i18n/menuNameEn'
import { invalidateSystemNavigation } from '../../../hooks/useSystemNavigation'

/** 目标类型：与后端 SystemAuthorizationService.TARGET_* 常量一致 */
const TARGET_ROLE: AuthorizationTargetType = 'role'
const TARGET_DEPARTMENT: AuthorizationTargetType = 'department'

/** Portal 哨兵系统：个人工作台入口，不作为业务系统被授权（后端 save 也会拒绝） */
const PORTAL_SENTINEL = 'portal'

/** 系统准入撤销时的行为提示，避免管理员误以为"仅关闭开关不动菜单" */
const REVOKE_HINT = '撤銷准入將同時清除該系統內的菜單授權記錄（不影響其他系統）；如需保留菜單請僅取消勾選需要的動作。'

/** 单系统编辑状态：initial* 为服务端快照（dirty 判定基准），当前值为用户编辑态 */
interface SystemDraft {
  systemAccess: boolean
  /** menuKey → 已选动作数组（不含未勾选） */
  actionsByMenu: Record<string, string[]>
  /** 读取时的 revision，用于乐观锁 */
  revision: number
  initialAccess: boolean
  initialActionsByMenu: Record<string, string[]>
}

/** 从后端菜单树中筛选出属于指定系统的子树（顶级 systemCode 匹配 → 保留整棵） */
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

/** 拍平系统树：menuKey → MenuVO + 是否叶子 */
function flattenTree(nodes: MenuVO[], out: Map<string, MenuVO> = new Map()): Map<string, MenuVO> {
  for (const n of nodes) {
    if (n.menuKey) out.set(n.menuKey, n)
    if (n.children?.length) flattenTree(n.children, out)
  }
  return out
}

/** 收集系统树全部 menuKey（含父节点，树内可见集） */
function collectTreeKeys(nodes: MenuVO[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    if (n.menuKey) out.add(n.menuKey)
    if (n.children?.length) collectTreeKeys(n.children, out)
  }
  return out
}

/** 快照 JSON 归一化（键排序），用于 dirty 对比 */
function stableStringifyActionsByMenu(map: Record<string, string[]>): string {
  const keys = Object.keys(map).sort()
  return JSON.stringify(keys.map((k) => [k, [...map[k]].sort()]))
}

/** 收集系统内所有已选动作非空的 menuKey → 提交给后端的 permissions 数组 */
function collectPermissions(actionsByMenu: Record<string, string[]>): MenuPermission[] {
  const list: MenuPermission[] = []
  for (const [menuKey, actions] of Object.entries(actionsByMenu)) {
    if (actions && actions.length > 0) {
      list.push({ menuKey, actions: [...actions] })
    }
  }
  return list
}

/** draft 是否有未保存修改 */
function isDirty(draft: SystemDraft): boolean {
  return draft.systemAccess !== draft.initialAccess
    || stableStringifyActionsByMenu(draft.actionsByMenu) !== stableStringifyActionsByMenu(draft.initialActionsByMenu)
}

/** draft → 提交载荷；批量保存时可传入刷新后的全局 revision */
function toPayload(draft: SystemDraft, expectedRevision?: number): SystemAuthorizationPayload {
  return {
    systemAccess: draft.systemAccess,
    permissions: draft.systemAccess ? collectPermissions(draft.actionsByMenu) : [],
    expectedRevision: expectedRevision ?? draft.revision,
  }
}

export default function PermissionWorkbench() {
  const { t } = useTranslation()
  /** t 引用随语言包刷新，仅用于提示文案；用 ref 避免成为 effect 依赖触发重复拉取 */
  const tRef = useRef(t)
  tRef.current = t

  /** 授权目标：类型+ID 合并为单一复合态，切换类型时原子清空 id，
   *  避免两个独立 state 在同一提交内出现「新类型 + 旧 ID」的错配请求 */
  const [target, setTarget] = useState<{ type: AuthorizationTargetType; id: number | null }>({ type: TARGET_ROLE, id: null })
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [systems, setSystems] = useState<SystemCatalogItem[]>([])
  const [menuTree, setMenuTree] = useState<MenuVO[]>([])
  const [activeSystem, setActiveSystem] = useState<string | null>(null)
  const [draftBySystem, setDraftBySystem] = useState<Record<string, SystemDraft>>({})
  const [selectedMenuKey, setSelectedMenuKey] = useState<string | null>(null)
  const [loadingPage, setLoadingPage] = useState(true)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [saving, setSaving] = useState(false)

  // 角色复制弹窗
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copySourceId, setCopySourceId] = useState<number | null>(null)
  const [copying, setCopying] = useState(false)

  /** 初次加载：角色 / 部门 / 系统目录 / 菜单树 */
  useEffect(() => {
    let cancelled = false
    setLoadingPage(true)
    Promise.all([fetchRoles(), fetchDepartments(), fetchSystemsCatalog(), fetchMenuTree()])
      .then(([roleList, deptList, sysList, tree]) => {
        if (cancelled) return
        setRoles(roleList ?? [])
        setDepartments(deptList ?? [])
        const configurable = (sysList ?? []).filter((s) => s.code !== PORTAL_SENTINEL)
        setSystems(configurable)
        setMenuTree(tree ?? [])
      })
      .catch(() => {
        if (!cancelled) message.error(tRef.current('authorizationCenter.loadFailed', '加載授權資料失敗'))
      })
      .finally(() => {
        if (!cancelled) setLoadingPage(false)
      })
    return () => { cancelled = true }
  }, [])

  /** 切换目标类型：原子重置目标/草稿/选中位 */
  const handleTypeChange = (type: AuthorizationTargetType) => {
    setTarget({ type, id: null })
    setDraftBySystem({})
    setSelectedMenuKey(null)
    setActiveSystem(null)
  }

  /** 载入序号：快速切换目标时丢弃过期响应，避免旧请求污染新目标的草稿 */
  const loadSeqRef = useRef(0)

  /** 选定目标后一次性载入其全部系统授权快照 */
  const loadOverview = useCallback(async (type: AuthorizationTargetType, id: number) => {
    const seq = ++loadSeqRef.current
    setLoadingDraft(true)
    try {
      const snapshots = type === TARGET_ROLE
        ? await fetchRoleOverview(id)
        : await fetchDepartmentOverview(id)
      if (seq !== loadSeqRef.current) return
      const next: Record<string, SystemDraft> = {}
      for (const snap of snapshots ?? []) {
        const actionsByMenu: Record<string, string[]> = {}
        for (const perm of snap.permissions ?? []) {
          actionsByMenu[perm.menuKey] = [...perm.actions]
        }
        next[snap.systemCode] = {
          systemAccess: snap.systemAccess,
          actionsByMenu,
          revision: snap.revision,
          initialAccess: snap.systemAccess,
          initialActionsByMenu: { ...actionsByMenu },
        }
      }
      setDraftBySystem(next)
      setSelectedMenuKey(null)
      // 首次载入目标后才默认选中第一个系统（未选目标时左侧列表不高亮，避免误导）
      setActiveSystem((prev) => prev ?? (snapshots?.[0]?.systemCode ?? null))
    } catch (err) {
      if (seq !== loadSeqRef.current) return
      message.error(err instanceof Error ? err.message : tRef.current('authorizationCenter.readFailed', '讀取授權快照失敗'))
      setDraftBySystem({})
    } finally {
      if (seq === loadSeqRef.current) setLoadingDraft(false)
    }
  }, [])

  /** 目标下拉选项（内置 admin 角色后端直通且拒绝系统授权，不作为可配置目标） */
  const targetOptions = useMemo(() => {
    if (target.type === TARGET_ROLE) {
      return roles
        .filter((r) => r.code?.toLowerCase() !== 'admin')
        .map((r) => ({ value: r.id, label: `${r.name} (${r.code ?? r.id})` }))
    }
    return departments.map((d) => ({ value: d.id, label: d.name }))
  }, [target.type, roles, departments])

  /** 目标变更时载入快照；仅在列表已加载完成时校验 id 归属，杜绝错配请求且不误清加载中的目标 */
  useEffect(() => {
    if (!target.id) return
    const list = target.type === TARGET_ROLE ? roles : departments
    if (list.length === 0) return
    // 角色目标须是可配置目标（admin 角色已过滤），否则清空，防止深链直载超管角色
    const selectable = target.type === TARGET_ROLE
      ? targetOptions.some((o) => o.value === target.id)
      : list.some((x) => x.id === target.id)
    if (!selectable) {
      setTarget((prev) => ({ ...prev, id: null }))
      setDraftBySystem({})
      return
    }
    void loadOverview(target.type, target.id)
  }, [target, roles, departments, targetOptions, loadOverview])

  /** 当前目标成员数（角色 userCount / 部门 userCount） */
  const targetMemberCount = useMemo(() => {
    if (target.id == null) return null
    if (target.type === TARGET_ROLE) {
      return roles.find((r) => r.id === target.id)?.userCount ?? null
    }
    return departments.find((d) => d.id === target.id)?.userCount ?? null
  }, [target, roles, departments])

  /** 目标切换（有未保存修改时先确认） */
  const handleTargetChange = (id: number | null) => {
    const dirtyCount = Object.values(draftBySystem).filter(isDirty).length
    const doSwitch = () => {
      setTarget((prev) => ({ ...prev, id }))
      setDraftBySystem({})
      setSelectedMenuKey(null)
    }
    if (dirtyCount > 0) {
      Modal.confirm({
        title: t('authorizationCenter.discardTitle', '放棄未保存的修改？'),
        content: t('authorizationCenter.discardContent', '當前有 {{count}} 個系統的授權修改尚未保存，切換目標後將丟棄。', { count: dirtyCount }),
        okText: t('authorizationCenter.discardOk', '放棄並切換'),
        cancelText: t('common.cancel', '取消'),
        okButtonProps: { danger: true },
        onOk: doSwitch,
      })
      return
    }
    doSwitch()
  }

  /** 系统准入 toggle */
  const updateSystemAccess = (systemCode: string, next: boolean) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      return { ...prev, [systemCode]: { ...draft, systemAccess: next } }
    })
  }

  /**
   * 勾选变更（checkStrictly）：新增节点默认授予 view（已有授权则保留动作配置）；
   * 取消勾选即撤销该菜单授权。仅处理树内可见节点，未加载/已停用菜单的存量授权原样保留。
   */
  const handleTreeCheck = (systemCode: string, visibleKeys: Set<string>, checkedSet: Set<string>) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      const next: Record<string, string[]> = { ...draft.actionsByMenu }
      for (const key of Object.keys(next)) {
        if (visibleKeys.has(key) && !checkedSet.has(key)) {
          delete next[key]
        }
      }
      for (const key of checkedSet) {
        if (!(key in next)) {
          next[key] = ['view']
        }
      }
      return { ...prev, [systemCode]: { ...draft, actionsByMenu: next } }
    })
  }

  /** 菜单动作 toggle；勾选动作隐含 view，取消 view 即撤销该菜单授权 */
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
          // 取消 view = 失去页面入口，联动撤销该菜单全部动作
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

  /** 快捷操作：勾选本系统全部菜单（新授予默认 view，已授权保留动作） */
  const handleSelectAllMenus = (systemCode: string, visibleKeys: Set<string>) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      const next: Record<string, string[]> = { ...draft.actionsByMenu }
      for (const key of visibleKeys) {
        if (!(key in next)) {
          next[key] = ['view']
        }
      }
      return { ...prev, [systemCode]: { ...draft, actionsByMenu: next } }
    })
  }

  /** 快捷操作：清空本系统全部菜单授权（不动准入开关） */
  const handleClearSystem = (systemCode: string) => {
    setDraftBySystem((prev) => {
      const draft = prev[systemCode]
      if (!draft) return prev
      return { ...prev, [systemCode]: { ...draft, actionsByMenu: {} } }
    })
    setSelectedMenuKey(null)
  }

  /**
   * 保存单个系统（原子写）。
   * <p>revision 是全局单调计数器：保存成功会使其 +1，因此成功后必须把新值
   * 同步到其余全部 draft（含本次未保存系统的基准），否则批量保存/后续单存必然 1006 冲突。
   * @returns 保存后的最新全局 revision；失败返回 null
   */
  const saveOne = useCallback(async (
    systemCode: string,
    draft: SystemDraft,
    expectedRevision?: number,
  ): Promise<number | null> => {
    if (target.id == null) return null
    try {
      const updated = target.type === TARGET_ROLE
        ? await saveRoleAuthorization(target.id, systemCode, toPayload(draft, expectedRevision))
        : await saveDepartmentAuthorization(target.id, systemCode, toPayload(draft, expectedRevision))
      invalidateSystemNavigation(systemCode)
      setDraftBySystem((prev) => {
        const actionsByMenu: Record<string, string[]> = {}
        for (const perm of updated.permissions ?? []) {
          actionsByMenu[perm.menuKey] = [...perm.actions]
        }
        const next: Record<string, SystemDraft> = {}
        for (const [code, d] of Object.entries(prev)) {
          next[code] = code === systemCode
            ? {
                systemAccess: updated.systemAccess,
                actionsByMenu,
                revision: updated.revision,
                initialAccess: updated.systemAccess,
                initialActionsByMenu: { ...actionsByMenu },
              }
            // 其余系统：仅刷新 revision 基准，保留用户编辑态
            : { ...d, revision: updated.revision }
        }
        return next
      })
      return updated.revision
    } catch {
      // 后端 CONFLICT (1006) 等错误由请求层统一提示
      return null
    }
  }, [target])

  /** 保存当前系统（失败保留草稿供重试，不重载覆盖用户编辑） */
  const handleSaveCurrent = async () => {
    if (!activeSystem) return
    const draft = draftBySystem[activeSystem]
    if (!draft) return
    if (!isDirty(draft)) {
      message.info(t('authorizationCenter.noChange', '當前系統授權無未保存的修改'))
      return
    }
    setSaving(true)
    const rev = await saveOne(activeSystem, draft)
    setSaving(false)
    if (rev != null) {
      message.success(t('authorizationCenter.saveSuccess', '系統授權已保存'))
    } else {
      message.error(t('authorizationCenter.saveConflictKeepDraft', '保存失敗（可能他人已同時修改授權），您的編輯已保留，請重試或點「重置」重新載入'))
    }
  }

  /** 保存全部有变更的系统（串行链式传递最新全局 revision，避免连环冲突） */
  const handleSaveAll = async () => {
    const dirtySystems = Object.entries(draftBySystem).filter(([, d]) => isDirty(d))
    if (dirtySystems.length === 0) {
      message.info(t('authorizationCenter.noChange', '當前系統授權無未保存的修改'))
      return
    }
    setSaving(true)
    let successCount = 0
    let currentRevision: number | undefined
    for (const [systemCode, draft] of dirtySystems) {
      // 上一笔保存后的新 revision 作为下一笔的 expectedRevision（全局计数器单调递增）
      const rev = await saveOne(systemCode, draft, currentRevision)
      if (rev != null) {
        successCount += 1
        currentRevision = rev
      }
    }
    setSaving(false)
    if (successCount === dirtySystems.length) {
      message.success(t('authorizationCenter.saveAllSuccess', '已保存 {{count}} 個系統的授權變更', { count: successCount }))
    } else {
      // 失败系统保留草稿与红点，用户可直接重试（不重载，不丢未保存编辑）
      message.warning(t('authorizationCenter.saveAllPartial', '部分系統保存失敗（成功 {{ok}}/{{total}}），失敗系統的編輯已保留，請重試', { ok: successCount, total: dirtySystems.length }))
    }
  }

  /** 丢弃当前目标全部未保存修改，重新拉取服务端快照 */
  const handleReset = () => {
    if (target.id == null) return
    void loadOverview(target.type, target.id)
  }

  /** 从已有角色复制授权 → 灌入当前草稿（不落库） */
  const copySourceOptions = useMemo(
    () => roles.filter((r) => r.id !== target.id).map((r) => ({ value: r.id, label: `${r.name} (${r.code ?? r.id})` })),
    [roles, target.id],
  )

  const handleApplyCopy = async () => {
    if (copySourceId == null || target.id == null) {
      message.warning(t('authorizationCenter.pickSourceRole', '請先選擇要複制的來源角色'))
      return
    }
    setCopying(true)
    try {
      const snapshots = await fetchRoleOverview(copySourceId)
      const sourceBySystem = new Map((snapshots ?? []).map((s) => [s.systemCode, s]))
      setDraftBySystem((prev) => {
        const next = { ...prev }
        for (const [systemCode, draft] of Object.entries(next)) {
          const src = sourceBySystem.get(systemCode)
          if (!src) continue
          const actionsByMenu: Record<string, string[]> = {}
          for (const perm of src.permissions ?? []) {
            actionsByMenu[perm.menuKey] = [...perm.actions]
          }
          next[systemCode] = { ...draft, systemAccess: src.systemAccess, actionsByMenu }
        }
        return next
      })
      setCopyModalOpen(false)
      setCopySourceId(null)
      message.success(t('authorizationCenter.copyApplied', '已載入來源角色授權，請檢查後保存（尚未落庫）'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('authorizationCenter.copyFailed', '複製授權失敗'))
    } finally {
      setCopying(false)
    }
  }

  const dirtySystems = useMemo(
    () => new Set(Object.entries(draftBySystem).filter(([, d]) => isDirty(d)).map(([k]) => k)),
    [draftBySystem],
  )

  /** 当前系统的树/勾选/动作面板数据 */
  const activeDraft = activeSystem ? draftBySystem[activeSystem] : undefined
  const systemTree = useMemo(
    () => (activeSystem ? pickSystemTree(menuTree, activeSystem) : []),
    [menuTree, activeSystem],
  )
  const systemFlatMap = useMemo(() => flattenTree(systemTree), [systemTree])
  const systemVisibleKeys = useMemo(() => collectTreeKeys(systemTree), [systemTree])
  const menuAccessDisabled = !!activeDraft && !activeDraft.systemAccess

  const treeData = useMemo((): DataNode[] => {
    const build = (nodes: MenuVO[]): DataNode[] => nodes.map((n) => ({
      key: n.menuKey,
      title: translateMenuName(n.menuKey, n.name, n.nameEn),
      disableCheckbox: menuAccessDisabled,
      children: n.children?.length ? build(n.children) : undefined,
    }))
    return build(systemTree)
  }, [systemTree, menuAccessDisabled])

  const checkedKeys = useMemo(() => Object.keys(activeDraft?.actionsByMenu ?? {}), [activeDraft])

  /** 选中节点的动作面板数据 */
  const selectedNode = selectedMenuKey ? systemFlatMap.get(selectedMenuKey) : undefined
  const selectedActions = selectedMenuKey && activeDraft
    ? activeDraft.actionsByMenu[selectedMenuKey] ?? null
    : null
  const selectedAvailable = selectedNode
    ? getMenuActions(selectedNode.menuKey, selectedNode.actions ?? null)
    : []
  /** 目录分组（有子节点且自身无路由 path）：仅作结构层级，不提供可授权的功能动作 */
  const isDirectoryNode = !!selectedNode?.children?.length && !selectedNode.path

  return (
    <div>
      {/* 授权目标 */}
      <div className="authz-target-bar">
        <div className="authz-target-row">
          <span className="authz-field">
            <span className="authz-field-label">{t('authorizationCenter.targetType', '目標類型')}</span>
            <Select
              value={target.type}
              onChange={(v) => handleTypeChange(v)}
              style={{ width: 160 }}
              options={[
                { value: TARGET_ROLE, label: t('authorizationCenter.roleType', '功能角色') },
                { value: TARGET_DEPARTMENT, label: t('authorizationCenter.deptType', '部門') },
              ]}
            />
            {/* 占位：与「授權目標」字段下方的已绑人数提示等高，保证两个选择框顶边对齐 */}
            <span className="authz-field-spacer" aria-hidden />
          </span>
          <span className="authz-field">
            <span className="authz-field-label">{t('authorizationCenter.targetName', '授權目標')}</span>
            <Select
              value={target.id ?? undefined}
              onChange={(v) => handleTargetChange(v ?? null)}
              showSearch
              optionFilterProp="label"
              placeholder={t('authorizationCenter.selectTarget', '請選擇')}
              style={{ minWidth: 280 }}
              options={targetOptions}
              disabled={targetOptions.length === 0}
            />
            {targetMemberCount != null ? (
              <span className="authz-member-count">
                {t('authorizationCenter.memberCount', '已綁 {{count}} 人', { count: targetMemberCount })}
              </span>
            ) : (
              <span className="authz-field-spacer" aria-hidden />
            )}
          </span>
          <Tag color={target.type === TARGET_ROLE ? 'blue' : 'purple'}>
            {target.type === TARGET_ROLE
              ? t('authorizationCenter.roleTag', '角色')
              : t('authorizationCenter.deptTag', '部門')}
          </Tag>
          {target.type === TARGET_ROLE && target.id != null ? (
            <Button icon={<CopyOutlined />} onClick={() => setCopyModalOpen(true)}>
              {t('authorizationCenter.copyFromRole', '從角色複製')}
            </Button>
          ) : null}
        </div>
        <div className="authz-target-hint">
          {t('authorizationCenter.targetHint', '切換目標會載入其全部系統的授權快照；未保存修改以紅點標示')}
          {dirtySystems.size > 0 ? (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              {t('authorizationCenter.dirtyCount', '{{count}} 個系統有未保存修改', { count: dirtySystems.size })}
            </Tag>
          ) : null}
        </div>
      </div>

      {/* 系统列表 + 授权工作台 */}
      {loadingPage ? (
        <div className="authz-loading"><Spin size="large" /></div>
      ) : systems.length === 0 ? (
        <Empty description={t('authorizationCenter.noSystem', '尚無可配置的業務系統')} />
      ) : (
        <Spin spinning={loadingDraft}>
          <div className="authz-workbench">
            {/* 左：系统列表 */}
            <div className="authz-sys-panel">
              <div className="authz-sys-panel-title">{t('authorizationCenter.systemsSection', '業務系統')}</div>
              <div className="authz-sys-list">
                {systems.map((sys) => {
                  const draft = draftBySystem[sys.code]
                  const isActive = sys.code === activeSystem
                  return (
                    <div
                      key={sys.code}
                      className={`authz-sys-item${isActive ? ' authz-sys-item--active' : ''}`}
                      onClick={() => { setActiveSystem(sys.code); setSelectedMenuKey(null) }}
                    >
                      <span
                        className={`authz-sys-access-dot${draft?.systemAccess ? ' authz-sys-access-dot--on' : ''}`}
                        title={draft?.systemAccess
                          ? t('authorizationCenter.onAccess', '准入')
                          : t('authorizationCenter.offAccess', '禁止')}
                      />
                      <span className="authz-sys-name">{sys.name}</span>
                      {draft && Object.keys(draft.actionsByMenu).length > 0 ? (
                        <span className="authz-sys-count">{Object.keys(draft.actionsByMenu).length}</span>
                      ) : null}
                      {dirtySystems.has(sys.code) ? <span className="authz-sys-dirty-dot" /> : null}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 右：单系统授权工作台 */}
            <div className="authz-sys-detail">
              {!target.id ? (
                <Alert
                  type="info"
                  showIcon
                  message={t('authorizationCenter.pickTargetFirst', '請先在上方選擇授權目標')}
                />
              ) : !activeDraft ? (
                <Alert
                  type="warning"
                  showIcon
                  message={t('authorizationCenter.loadingDraft', '正在載入該系統的授權快照...')}
                />
              ) : (
                <>
                  <div className="authz-detail-header">
                    <span className="authz-detail-title">
                      {systems.find((s) => s.code === activeSystem)?.name ?? activeSystem}
                    </span>
                    <span className="authz-access-switch">
                      <span className="authz-field-label">{t('authorizationCenter.access', '系統准入')}</span>
                      <Switch
                        checked={activeDraft.systemAccess}
                        onChange={(next) => updateSystemAccess(activeSystem!, next)}
                        checkedChildren={t('authorizationCenter.onAccess', '准入')}
                        unCheckedChildren={t('authorizationCenter.offAccess', '禁止')}
                      />
                    </span>
                    {!activeDraft.systemAccess ? (
                      <span className="authz-revoke-hint">{REVOKE_HINT}</span>
                    ) : null}
                    <span className="authz-quick-actions">
                      <Button
                        size="small"
                        disabled={!activeDraft.systemAccess || systemVisibleKeys.size === 0}
                        onClick={() => handleSelectAllMenus(activeSystem!, systemVisibleKeys)}
                      >
                        {t('authorizationCenter.selectAllMenus', '全選菜單')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        disabled={Object.keys(activeDraft.actionsByMenu).length === 0}
                        onClick={() => handleClearSystem(activeSystem!)}
                      >
                        {t('authorizationCenter.clearSystem', '清空本系統')}
                      </Button>
                    </span>
                  </div>

                  <div className="authz-detail-body">
                    {/* 菜单勾选树 */}
                    <div className="authz-menu-tree">
                      {treeData.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t('authorizationCenter.noMenuInSystem', '該系統下暫無可授予的菜單')}
                        />
                      ) : (
                        <Tree
                          key={activeSystem ?? 'none'}
                          checkable
                          checkStrictly
                          selectable
                          defaultExpandAll
                          treeData={treeData}
                          checkedKeys={checkedKeys}
                          selectedKeys={selectedMenuKey ? [selectedMenuKey] : []}
                          onCheck={(keys) => {
                            const arr = Array.isArray(keys) ? keys : keys.checked
                            handleTreeCheck(activeSystem!, systemVisibleKeys, new Set(arr as string[]))
                          }}
                          onSelect={(keys) => {
                            setSelectedMenuKey(keys.length > 0 ? String(keys[0]) : null)
                          }}
                        />
                      )}
                    </div>

                    {/* 动作微调面板 */}
                    <div className="authz-action-panel">
                      <div className="authz-action-panel-title">
                        {t('authorizationCenter.selectFunctionTitle', '功能操作')}
                      </div>
                      {!selectedMenuKey || !selectedNode ? (
                        <div className="authz-action-panel-tip">
                          {t('authorizationCenter.actionPanelHint', '點選左側菜單節點，可在此勾選具體操作權限；勾選菜單僅授予「查看」。')}
                        </div>
                      ) : isDirectoryNode ? (
                        <div className="authz-action-panel-tip">
                          {t('authorizationCenter.directoryNodeTip', '該節點為分組目錄，僅作結構層級，無功能權限可配置；請在其下菜單授權。')}
                        </div>
                      ) : (
                        <>
                          <div className="authz-action-panel-menu">
                            {translateMenuName(selectedNode.menuKey, selectedNode.name, selectedNode.nameEn)}
                          </div>
                          {selectedActions === null ? (
                            <>
                              <div className="authz-action-panel-tip">
                                {t('authorizationCenter.notGranted', '該菜單尚未授予權限')}
                              </div>
                              {activeDraft.systemAccess && selectedAvailable.length > 0 ? (
                                <Button
                                  type="primary"
                                  size="small"
                                  onClick={() => setDraftBySystem((prev) => {
                                    const draft = prev[activeSystem!]
                                    if (!draft) return prev
                                    return {
                                      ...prev,
                                      [activeSystem!]: {
                                        ...draft,
                                        actionsByMenu: { ...draft.actionsByMenu, [selectedMenuKey]: ['view'] },
                                      },
                                    }
                                  })}
                                >
                                  {t('authorizationCenter.grantView', '授予權限（查看）')}
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <div className="authz-action-list">
                              {selectedAvailable.map((action) => (
                                <Checkbox
                                  key={action.key}
                                  checked={selectedActions.includes(action.key)}
                                  disabled={!activeDraft.systemAccess}
                                  onChange={(e) => toggleAction(activeSystem!, selectedMenuKey, action.key, e.target.checked)}
                                >
                                  {action.label}
                                </Checkbox>
                              ))}
                              <div className="authz-action-panel-tip" style={{ marginTop: 12 }}>
                                {t('authorizationCenter.viewRuleTip', '取消「查看」將同步撤銷該菜單的全部操作授權。')}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </Spin>
      )}

      {/* 底部操作 */}
      {target.id != null && activeDraft ? (
        <div className="form-footer">
          <Button onClick={handleReset} disabled={saving}>
            {t('authorizationCenter.resetTarget', '重置全部')}
          </Button>
          {dirtySystems.size > 1 ? (
            <Button loading={saving} onClick={handleSaveAll}>
              {t('authorizationCenter.saveAll', '保存全部變更 ({{count}})', { count: dirtySystems.size })}
            </Button>
          ) : null}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSaveCurrent}
          >
            {t('authorizationCenter.saveCurrent', '保存當前系統')}
          </Button>
        </div>
      ) : null}

      {/* 从角色复制授权 */}
      <Modal
        title={t('authorizationCenter.copyModalTitle', '從已有角色複製授權')}
        open={copyModalOpen}
        onCancel={() => { setCopyModalOpen(false); setCopySourceId(null) }}
        onOk={handleApplyCopy}
        confirmLoading={copying}
        okText={t('authorizationCenter.copyApply', '載入到草稿')}
        cancelText={t('common.cancel', '取消')}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('authorizationCenter.copyModalHint', '複製僅載入到當前編輯草稿，確認無誤後仍需手動保存才會落庫。')}
        />
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>{t('authorizationCenter.copySourceLabel', '來源角色')}</span>
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            placeholder={t('authorizationCenter.pickSourceRole', '請先選擇要複制的來源角色')}
            value={copySourceId ?? undefined}
            onChange={(v) => setCopySourceId(v)}
            options={copySourceOptions}
          />
        </Space>
      </Modal>
    </div>
  )
}
