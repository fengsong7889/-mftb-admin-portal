import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { DataTargetType } from '../types'
import { DATA_TARGET_TYPE } from '../types'
import { DEPT_STATUS } from '../../../api/department'
import {
  fetchDataAuthorizations,
  batchCreateAuthorizations,
  batchDeleteAuthorizations,
  fetchDataAuthRoleOptions,
  fetchDataAuthDepartmentOptions,
  fetchDataAuthMerchantGroupOptions,
} from '../../../api/dataAuthorization'
import type {
  DataAuthorizationItem,
  DataAuthRoleOption,
  DataAuthDeptOption,
  DataAuthGroupOption,
} from '../../../api/dataAuthorization'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import './index.css'

/** 分组后的列表行（一个角色/部门 = 一行） */
interface GroupedAuthRow {
  targetType: string
  targetId: number
  targetName: string
  parentName?: string
  userCount: number
  groups: { id: number; groupCode: string; groupName?: string; status: number; updatedAt?: string }[]
  groupCount: number
  latestUpdatedAt?: string | number
  latestUpdatedBy?: string
}

/** 平铺部门列表构建 TreeSelect 树数据 */
interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DataAuthDeptOption[], getDeptName?: (dept: DataAuthDeptOption) => string): DeptTreeOption[] {
  const nameFn = getDeptName ?? ((d: DataAuthDeptOption) => d.name)
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: nameFn(dept),
      disabled: dept.status !== DEPT_STATUS.ENABLED,
      children: [],
    })
  })
  const roots: DeptTreeOption[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

export default function DataPermission() {
  const { t, i18n } = useTranslation()

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取部門顯示名稱 */
  const getDeptDisplayName = (dept: DataAuthDeptOption) =>
    isNonZh ? (dept.nameEn || dept.name) : dept.name

  // 功能权限校验（菜单 key: data-permission）
  const { hasPermission } = useAuth()
  const [roles, setRoles] = useState<DataAuthRoleOption[]>([])
  const [departments, setDepartments] = useState<DataAuthDeptOption[]>([])
  const [merchantGroups, setMerchantGroups] = useState<DataAuthGroupOption[]>([])
  const [loading, setLoading] = useState(false)
  const [authorizations, setAuthorizations] = useState<DataAuthorizationItem[]>([])
  const [activeTab, setActiveTab] = useState<DataTargetType>(DATA_TARGET_TYPE.ROLE)

  // 新增/编辑授权弹窗
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTargetId, setEditingTargetId] = useState<number | null>(null) // null=新增, number=编辑某target
  const [targetId, setTargetId] = useState<number>()
  const [groupCodes, setGroupCodes] = useState<string[]>([])
  const [existingAuthIds, setExistingAuthIds] = useState<number[]>([]) // 编辑时已有记录的ID
  const [submitting, setSubmitting] = useState(false)

  // 授权详情弹窗（显示某target下所有商家集团）
  const [detailGroup, setDetailGroup] = useState<GroupedAuthRow | null>(null)

  /** 加载角色、部门、商家集团列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const [roleList, deptList, groupList] = await Promise.all([
        fetchDataAuthRoleOptions(),
        fetchDataAuthDepartmentOptions(),
        fetchDataAuthMerchantGroupOptions(),
      ])
      setRoles(roleList)
      setDepartments(deptList)
      setMerchantGroups(groupList)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  /** 加载数据授权列表 */
  const loadAuthorizations = useCallback(async () => {
    try {
      const list = await fetchDataAuthorizations()
      setAuthorizations(list)
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [])

  useEffect(() => {
    fetchList()
    loadAuthorizations()
  }, [fetchList, loadAuthorizations])

  /** 按授权对象分组：一个角色/部门 = 一行，聚合其下所有商家集团 */
  const groupedRoleRows = useMemo<GroupedAuthRow[]>(() => {
    const map = new Map<string, GroupedAuthRow>()
    authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.ROLE)
      .forEach(a => {
        const key = `${a.targetType}_${a.targetId}`
        let group = map.get(key)
        if (!group) {
          const role = roles.find(r => r.id === a.targetId)
          group = {
            targetType: a.targetType,
            targetId: a.targetId,
            targetName: role?.name || t('dataPermission.roleDeleted'),
            userCount: role?.userCount ?? 0,
            groups: [],
            groupCount: 0,
          }
          map.set(key, group)
        }
        group.groups.push({
          id: a.id,
          groupCode: a.groupCode,
          groupName: a.groupName,
          status: a.status,
          updatedAt: a.updatedAt,
        })
        if (!group.latestUpdatedAt || (a.updatedAt && a.updatedAt > group.latestUpdatedAt)) {
          group.latestUpdatedAt = a.updatedAt
          group.latestUpdatedBy = a.updatedBy
        }
      })
    return Array.from(map.values()).map(g => ({ ...g, groupCount: g.groups.length }))
      .sort((a, b) => String(b.latestUpdatedAt || '').localeCompare(String(a.latestUpdatedAt || '')))
  }, [authorizations, roles, t])

  const groupedDeptRows = useMemo<GroupedAuthRow[]>(() => {
    const map = new Map<string, GroupedAuthRow>()
    authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.DEPARTMENT)
      .forEach(a => {
        const key = `${a.targetType}_${a.targetId}`
        let group = map.get(key)
        if (!group) {
          const dept = departments.find(d => d.id === a.targetId)
          group = {
            targetType: a.targetType,
            targetId: a.targetId,
            targetName: dept ? getDeptDisplayName(dept) : t('dataPermission.deptDeleted'),
            parentName: (() => { const p = dept?.parentId ? departments.find(d => d.id === dept.parentId) : undefined; return p ? getDeptDisplayName(p) : undefined })(),
            userCount: dept?.userCount ?? 0,
            groups: [],
            groupCount: 0,
          }
          map.set(key, group)
        }
        group.groups.push({
          id: a.id,
          groupCode: a.groupCode,
          groupName: a.groupName,
          status: a.status,
          updatedAt: a.updatedAt,
        })
        if (!group.latestUpdatedAt || (a.updatedAt && a.updatedAt > group.latestUpdatedAt)) {
          group.latestUpdatedAt = a.updatedAt
          group.latestUpdatedBy = a.updatedBy
        }
      })
    return Array.from(map.values()).map(g => ({ ...g, groupCount: g.groups.length }))
      .sort((a, b) => String(b.latestUpdatedAt || '').localeCompare(String(a.latestUpdatedAt || '')))
  }, [authorizations, departments, isNonZh, t]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 新增授权时可选的角色（后端已只返回启用状态） */
  const availableRoles = roles

  /** 打开新增授权弹窗 */
  const handleCreate = () => {
    setEditingTargetId(null)
    setTargetId(undefined)
    setGroupCodes([])
    setExistingAuthIds([])
    setModalVisible(true)
  }

  /** 打开配置授权弹窗（编辑某角色/部门的商家授权） */
  const handleConfigure = (record: GroupedAuthRow) => {
    setEditingTargetId(record.targetId)
    setTargetId(record.targetId)
    setGroupCodes(record.groups.map(g => g.groupCode))
    setExistingAuthIds(record.groups.map(g => g.id))
    setModalVisible(true)
  }

  /** 保存授权（批量创建 + 批量删除 diff） */
  const handleSave = async () => {
    if (targetId == null) {
      message.warning(activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.selectRole') : t('dataPermission.selectDept'))
      return
    }
    if (groupCodes.length === 0) {
      message.warning(t('dataPermission.selectGroup'))
      return
    }

    setSubmitting(true)
    try {
      const oldCodes = new Set(
        authorizations
          .filter(a => a.targetType === activeTab && a.targetId === targetId)
          .map(a => a.groupCode)
      )
      const newCodes = new Set(groupCodes)

      // 需要新增的（在新选中但不在旧数据中）
      const toCreate = groupCodes.filter(c => !oldCodes.has(c))
      // 需要删除的（在旧数据中但不在新选中）
      const toDeleteIds = authorizations
        .filter(a => a.targetType === activeTab && a.targetId === targetId && !newCodes.has(a.groupCode))
        .map(a => a.id)

      const ops: Promise<unknown>[] = []
      if (toCreate.length > 0) {
        ops.push(batchCreateAuthorizations({ targetType: activeTab, targetId, groupCodes: toCreate }))
      }
      if (toDeleteIds.length > 0) {
        ops.push(batchDeleteAuthorizations(toDeleteIds))
      }

      if (ops.length > 0) {
        await Promise.all(ops)
        message.success(
          editingTargetId != null
            ? t('dataPermission.authUpdated')
            : t('dataPermission.batchAuthCreated', { count: toCreate.length })
        )
      }

      setModalVisible(false)
      loadAuthorizations()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除某角色/部门的全部授权 */
  const handleDeleteAll = async (record: GroupedAuthRow) => {
    try {
      const ids = record.groups.map(g => g.id)
      await batchDeleteAuthorizations(ids)
      message.success(t('common.deleteSuccess'))
      loadAuthorizations()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 操作列 */
  const renderActions = (record: GroupedAuthRow) => (
    <Space size={4}>
      <Button type="link" size="small" onClick={() => setDetailGroup(record)}>
        {t('common.detail')}
      </Button>
      {hasPermission('data-permission:edit') && (
        <Button type="link" size="small" onClick={() => handleConfigure(record)}>
          {t('common.edit')}
        </Button>
      )}
      {hasPermission('data-permission:delete') && (
        <Popconfirm
          title={t('common.confirmDelete')}
          description={t('dataPermission.confirmDeleteAllContent', { name: record.targetName, count: record.groupCount })}
          onConfirm={() => handleDeleteAll(record)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button type="link" size="small" danger>
            {t('common.delete')}
          </Button>
        </Popconfirm>
      )}
    </Space>
  )

  /** 授权商家列（显示数量 + 前几个标签） */
  const renderGroupSummary = (_: unknown, record: GroupedAuthRow) => (
    <Space wrap size={[4, 4]}>
      <Tag color="blue">{t('dataPermission.groupCountLabel', { count: record.groupCount })}</Tag>
      {record.groups.slice(0, 3).map(g => (
        <Tag key={g.id} color="geekblue">{g.groupName || g.groupCode}</Tag>
      ))}
      {record.groupCount > 3 && (
        <Tag color="default">+{record.groupCount - 3}</Tag>
      )}
    </Space>
  )

  /** 状态列 */
  const renderStatus = (status: number) => (
    <Tag color={status === 1 ? 'green' : 'default'}>
      {status === 1 ? t('dataPermission.statusEnabled') : t('dataPermission.statusDisabled')}
    </Tag>
  )

  const roleColumns: TableColumnsType<GroupedAuthRow> = [
    { title: t('dataPermission.colRoleName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('dataPermission.colGroupName'), key: 'groupName', render: renderGroupSummary },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'latestUpdatedBy', key: 'latestUpdatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'latestUpdatedAt',
      key: 'latestUpdatedAt',
      width: 170,
      render: (date: string) => (date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<GroupedAuthRow> = [
    { title: t('dataPermission.colDeptName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('organization.colParentDept'), dataIndex: 'parentName', key: 'parentName', width: 150, render: (v: string) => v || '-' },
    { title: t('dataPermission.colGroupName'), key: 'groupName', render: renderGroupSummary },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'latestUpdatedBy', key: 'latestUpdatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'latestUpdatedAt',
      key: 'latestUpdatedAt',
      width: 170,
      render: (date: string) => (date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  /** 列字段配置 */
  const roleColumnMeta = roleColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: roleConfigComponent, applyConfig: roleApplyConfig } = useColumnConfig('data-permission-role', roleColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])
  const deptColumnMeta = deptColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: deptConfigComponent, applyConfig: deptApplyConfig } = useColumnConfig('data-permission-dept', deptColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 授权列表（角色/部门 Tab 内容） */
  const renderTabContent = (type: DataTargetType) => {
    const rows = type === DATA_TARGET_TYPE.ROLE ? groupedRoleRows : groupedDeptRows
    const cols = type === DATA_TARGET_TYPE.ROLE ? roleColumns : deptColumns
    const apply = type === DATA_TARGET_TYPE.ROLE ? roleApplyConfig : deptApplyConfig
    const config = type === DATA_TARGET_TYPE.ROLE ? roleConfigComponent : deptConfigComponent
    return (
      <div>
        <div className="action-section">
          <div className="action-section-right">
            {hasPermission('data-permission:create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                {t('common.add')}
              </Button>
            )}
            {config}
          </div>
        </div>
        <Table
          columns={apply(cols)}
          dataSource={rows}
          rowKey={(r) => `${r.targetType}_${r.targetId}`}
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
          }}
          locale={{
            emptyText: type === DATA_TARGET_TYPE.ROLE
              ? t('dataPermission.emptyRole')
              : t('dataPermission.emptyDept'),
          }}
        />
      </div>
    )
  }

  /** 弹窗中编辑对象的名称（编辑模式展示） */
  const editingName = editingTargetId != null
    ? (activeTab === DATA_TARGET_TYPE.ROLE ? groupedRoleRows : groupedDeptRows).find(r => r.targetId === editingTargetId)?.targetName
    : undefined

  /** 商家集团下拉选项 */
  const groupSelectOptions = merchantGroups.map(g => ({
    value: g.groupCode,
    label: `${g.groupName}（${g.groupCode}）`,
  }))

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as DataTargetType)}
        items={[
          { key: DATA_TARGET_TYPE.ROLE, label: t('dataPermission.tabRoleAuth'), children: renderTabContent(DATA_TARGET_TYPE.ROLE) },
          { key: DATA_TARGET_TYPE.DEPARTMENT, label: t('dataPermission.tabDeptAuth'), children: renderTabContent(DATA_TARGET_TYPE.DEPARTMENT) },
        ]}
      />

      {/* 新增/编辑授权弹窗 — 多选商家集团 */}
      <Modal
        title={
          editingTargetId != null
            ? t('dataPermission.editTitle', { name: editingName ?? '' })
            : (activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.addRoleTitle') : t('dataPermission.addDeptTitle'))
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        width={680}
        destroyOnClose
      >
        {/* 授权对象选择（编辑模式锁定） */}
        <div className="data-auth-target-bar">
          <span className="data-auth-label">
            {activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.targetRole') : t('dataPermission.targetDept')}
          </span>
          {activeTab === DATA_TARGET_TYPE.ROLE ? (
            <Select
              className="data-auth-target-select"
              placeholder={t('dataPermission.selectRolePlaceholder')}
              showSearch
              optionFilterProp="label"
              disabled={editingTargetId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              options={(editingTargetId != null ? roles : availableRoles).map(r => ({
                value: r.id,
                label: r.name,
              }))}
            />
          ) : (
            <TreeSelect
              className="data-auth-target-select"
              placeholder={t('dataPermission.selectDeptPlaceholder')}
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              disabled={editingTargetId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              treeData={buildDeptTreeData(departments, getDeptDisplayName)}
            />
          )}
          <Tag color={activeTab === DATA_TARGET_TYPE.ROLE ? 'blue' : 'purple'}>
            {activeTab === DATA_TARGET_TYPE.ROLE
              ? t('dataPermission.roleTip')
              : t('dataPermission.deptTip')}
          </Tag>
        </div>

        {/* 授权商家集团 — 多选 */}
        <div className="data-auth-field">
          <span className="data-auth-label">{t('dataPermission.groupLabel')}</span>
          <Select
            mode="multiple"
            className="data-auth-group-select"
            placeholder={t('dataPermission.groupMultiPlaceholder')}
            showSearch
            optionFilterProp="label"
            value={groupCodes}
            onChange={(codes) => setGroupCodes(codes)}
            options={groupSelectOptions}
            maxTagCount="responsive"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }
          />
        </div>
        <div className="data-auth-tip">
          {editingTargetId != null
            ? t('dataPermission.editGroupTip', { count: groupCodes.length })
            : t('dataPermission.createGroupTip', { count: groupCodes.length })}
        </div>
      </Modal>

      {/* 授权详情弹窗 — 显示该角色/部门下所有商家集团 */}
      <Modal
        title={t('dataPermission.detailTitle', { name: detailGroup?.targetName ?? '' })}
        open={detailGroup != null}
        onCancel={() => setDetailGroup(null)}
        footer={null}
        width={640}
      >
        {detailGroup && (
          <>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.colGroupName')}</span>
              <Tag color="blue">{t('dataPermission.groupCountLabel', { count: detailGroup.groupCount })}</Tag>
            </div>
            <div className="data-auth-group-list">
              {detailGroup.groups.map(g => (
                <Tag key={g.id} color="geekblue" className="data-auth-group-tag">
                  {g.groupName || g.groupCode}
                </Tag>
              ))}
            </div>
            <div className="data-auth-field" style={{ marginTop: 16 }}>
              <span className="data-auth-label">{t('dataPermission.colUpdatedBy')}</span>
              <span>{detailGroup.latestUpdatedBy || '-'}</span>
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.colUpdatedAt')}</span>
              <span>{detailGroup.latestUpdatedAt ? dayjs(detailGroup.latestUpdatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
