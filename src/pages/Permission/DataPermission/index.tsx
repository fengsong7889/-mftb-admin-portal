import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { DataTargetType } from '../types'
import { DATA_TARGET_TYPE } from '../types'
import { DEPT_STATUS } from '../../../api/department'
import {
  fetchDataAuthorizations,
  createDataAuthorization,
  updateDataAuthorization,
  deleteDataAuthorization,
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

/** 列表行（授权记录 + 授权对象信息） */
interface AuthRow extends DataAuthorizationItem {
  targetName: string
  parentName?: string
  userCount: number
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
  const [editingId, setEditingId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState<number>()
  const [groupCode, setGroupCode] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  // 授权详情弹窗
  const [detailRecord, setDetailRecord] = useState<AuthRow | null>(null)

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

  /** 角色授权列表 */
  const roleRows = useMemo<AuthRow[]>(
    () => authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.ROLE)
      .map(a => {
        const role = roles.find(r => r.id === a.targetId)
        return {
          ...a,
          targetName: a.targetName || role?.name || t('dataPermission.roleDeleted'),
          userCount: role?.userCount ?? 0,
        }
      }),
    [authorizations, roles, t],
  )

  /** 部门授权列表 */
  const deptRows = useMemo<AuthRow[]>(
    () => authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.DEPARTMENT)
      .map(a => {
        const dept = departments.find(d => d.id === a.targetId)
        return {
          ...a,
          targetName: a.targetName || (dept ? getDeptDisplayName(dept) : t('dataPermission.deptDeleted')),
          parentName: (() => { const p = dept?.parentId ? departments.find(d => d.id === dept.parentId) : undefined; return p ? getDeptDisplayName(p) : undefined })(),
          userCount: dept?.userCount ?? 0,
        }
      }),
    [authorizations, departments, isNonZh, t], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** 新增授权时可选的角色（后端已只返回启用状态） */
  const availableRoles = roles

  /** 打开新增授权弹窗 */
  const handleCreate = () => {
    setEditingId(null)
    setTargetId(undefined)
    setGroupCode(undefined)
    setModalVisible(true)
  }

  /** 打开编辑授权弹窗 */
  const handleEdit = (record: AuthRow) => {
    setEditingId(record.id)
    setTargetId(record.targetId)
    setGroupCode(record.groupCode)
    setModalVisible(true)
  }

  /** 保存授权（调用后端 API） */
  const handleSave = async () => {
    if (targetId == null) {
      message.warning(activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.selectRole') : t('dataPermission.selectDept'))
      return
    }
    if (!groupCode) {
      message.warning(t('dataPermission.selectGroup'))
      return
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await updateDataAuthorization(editingId, {
          targetType: activeTab,
          targetId,
          groupCode,
        })
        message.success(t('dataPermission.authUpdated'))
      } else {
        await createDataAuthorization({
          targetType: activeTab,
          targetId,
          groupCode,
        })
        message.success(t('dataPermission.authCreated'))
      }
      setModalVisible(false)
      loadAuthorizations()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除授权 */
  const handleDelete = async (record: AuthRow) => {
    try {
      await deleteDataAuthorization(record.id)
      message.success(t('common.deleteSuccess'))
      loadAuthorizations()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 操作列（角色/部门通用） */
  const renderActions = (record: AuthRow) => (
    <Space size={4}>
      <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
        {t('common.detail')}
      </Button>
      {hasPermission('data-permission:edit') && (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          {t('common.edit')}
        </Button>
      )}
      {hasPermission('data-permission:delete') && (
        <Popconfirm
          title={t('common.confirmDelete')}
          description={t('dataPermission.confirmDeleteContent', { name: record.targetName, groupName: record.groupName || record.groupCode })}
          onConfirm={() => handleDelete(record)}
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

  /** 商家集团名称列 */
  const renderGroupTag = (_: unknown, record: AuthRow) => (
    <Tag color="blue">{record.groupName || record.groupCode}</Tag>
  )

  /** 状态列 */
  const renderStatus = (status: number) => (
    <Tag color={status === 1 ? 'green' : 'default'}>
      {status === 1 ? t('dataPermission.statusEnabled') : t('dataPermission.statusDisabled')}
    </Tag>
  )

  const roleColumns: TableColumnsType<AuthRow> = [
    { title: t('dataPermission.colRoleName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('dataPermission.colGroupName'), key: 'groupName', width: 200, render: renderGroupTag },
    { title: t('dataPermission.colStatus'), dataIndex: 'status', key: 'status', width: 90, render: renderStatus },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<AuthRow> = [
    { title: t('dataPermission.colDeptName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('organization.colParentDept'), dataIndex: 'parentName', key: 'parentName', width: 150, render: (v: string) => v || '-' },
    { title: t('dataPermission.colGroupName'), key: 'groupName', width: 200, render: renderGroupTag },
    { title: t('dataPermission.colStatus'), dataIndex: 'status', key: 'status', width: 90, render: renderStatus },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
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
  const renderTabContent = (type: DataTargetType) => (
    <div>
      <div className="action-section">
        <div className="action-section-right">
          {hasPermission('data-permission:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
          {type === DATA_TARGET_TYPE.ROLE ? roleConfigComponent : deptConfigComponent}
        </div>
      </div>
      <Table
        columns={type === DATA_TARGET_TYPE.ROLE ? roleApplyConfig(roleColumns) : deptApplyConfig(deptColumns)}
        dataSource={type === DATA_TARGET_TYPE.ROLE ? roleRows : deptRows}
        rowKey="id"
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

  /** 弹窗中编辑对象的名称（编辑模式展示） */
  const editingName = editingId != null
    ? (activeTab === DATA_TARGET_TYPE.ROLE ? roleRows : deptRows).find(r => r.id === editingId)?.targetName
    : undefined

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

      {/* 新增/编辑授权弹窗 */}
      <Modal
        title={
          editingId
            ? t('dataPermission.editTitle', { name: editingName ?? '' })
            : (activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.addRoleTitle') : t('dataPermission.addDeptTitle'))
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        width={600}
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
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              options={(editingId != null ? roles : availableRoles).map(r => ({
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
              disabled={editingId != null}
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

        {/* 授权商家集团 */}
        <div className="data-auth-field">
          <span className="data-auth-label">{t('dataPermission.groupLabel')}</span>
          <Select
            className="data-auth-target-select"
            placeholder={t('dataPermission.groupPlaceholder')}
            showSearch
            optionFilterProp="label"
            value={groupCode}
            onChange={(code) => setGroupCode(code)}
            options={merchantGroups.map(g => ({
              value: g.groupCode,
              label: `${g.groupName}（${g.groupCode}）`,
            }))}
          />
        </div>
      </Modal>

      {/* 授权详情弹窗 */}
      <Modal
        title={t('dataPermission.detailTitle', { name: detailRecord?.targetName ?? '' })}
        open={detailRecord != null}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={520}
      >
        {detailRecord && (
          <>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.groupLabel')}</span>
              <Tag color="blue">{detailRecord.groupName || detailRecord.groupCode}</Tag>
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.colStatus')}</span>
              {renderStatus(detailRecord.status)}
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.colUpdatedBy')}</span>
              <span>{detailRecord.updatedBy || '-'}</span>
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.colUpdatedAt')}</span>
              <span>{detailRecord.updatedAt ? new Date(detailRecord.updatedAt).toLocaleString('zh-TW', { hour12: false }) : '-'}</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
