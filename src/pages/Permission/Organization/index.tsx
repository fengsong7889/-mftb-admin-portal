import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tree, TreeSelect, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  DEPT_STATUS,
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
  updateDepartmentStatus,
} from '../../../api/department'
import type { DepartmentItem, DepartmentPayload } from '../../../api/department'
import './index.css'

const statusOptions = [
  { value: DEPT_STATUS.ENABLED, label: '有效' },
  { value: DEPT_STATUS.DISABLED, label: '無效' },
]

/** 新增/编辑表单值 */
interface DepartmentFormValues {
  parentId?: number
  code: string
  name: string
  leader?: string
  sort?: number
}

/** 树节点（带业务数据） */
interface DeptTreeNode extends TreeDataNode {
  key: number
  children?: DeptTreeNode[]
}

/** 平铺部门列表构建 antd 树数据 */
function buildTreeData(list: DepartmentItem[], excludeId?: number): DeptTreeNode[] {
  const nodeMap = new Map<number, DeptTreeNode>()
  list.forEach(dept => {
    nodeMap.set(dept.id, { key: dept.id, title: dept.name, value: dept.id, children: [] } as DeptTreeNode)
  })
  const roots: DeptTreeNode[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  // 编辑部门时，上级部门下拉需排除自身及其所有下级（防止成环）
  if (excludeId != null) {
    const prune = (nodes: DeptTreeNode[]): DeptTreeNode[] =>
      nodes.filter(n => n.key !== excludeId).map(n => ({ ...n, children: n.children ? prune(n.children) : [] }))
    return prune(roots)
  }
  return roots
}

/** 收集某部门自身及所有后代 id */
function collectDescendantIds(list: DepartmentItem[], rootId: number): Set<number> {
  const childrenMap = new Map<number, number[]>()
  list.forEach(dept => {
    if (dept.parentId != null) {
      const arr = childrenMap.get(dept.parentId) ?? []
      arr.push(dept.id)
      childrenMap.set(dept.parentId, arr)
    }
  })
  const result = new Set<number>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const childId of childrenMap.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

export default function OrganizationManagement() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  // 左侧树选中的部门（过滤右侧表格）
  const [selectedDeptId, setSelectedDeptId] = useState<number>()
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [leaderKeyword, setLeaderKeyword] = useState<string>()
  const [status, setStatus] = useState<number>()
  const [searchForm] = Form.useForm()

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<DepartmentItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<DepartmentFormValues>()

  /** 加载部门列表（平铺） */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchDepartments()
      setDepartments(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 左侧组织架构树数据 */
  const treeData = useMemo(() => buildTreeData(departments), [departments])

  /** 表格数据：按树选中节点 + 搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = departments
    if (selectedDeptId != null) {
      const scope = collectDescendantIds(departments, selectedDeptId)
      list = list.filter(dept => scope.has(dept.id))
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(dept => dept.name.toLowerCase().includes(kw) || dept.code.toLowerCase().includes(kw))
    }
    if (leaderKeyword) {
      const kw = leaderKeyword.toLowerCase()
      list = list.filter(dept => (dept.leader ?? '').toLowerCase().includes(kw))
    }
    if (status !== undefined) {
      list = list.filter(dept => dept.status === status)
    }
    return list
  }, [departments, selectedDeptId, keyword, leaderKeyword, status])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setLeaderKeyword(values.leader?.trim() || undefined)
    setStatus(values.status)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setLeaderKeyword(undefined)
    setStatus(undefined)
  }

  /** 新增部门（默认上级为当前树选中节点） */
  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    if (selectedDeptId != null) {
      form.setFieldsValue({ parentId: selectedDeptId })
    }
    setEditModalVisible(true)
  }

  /** 编辑部门 */
  const handleEdit = (record: DepartmentItem) => {
    setEditing(record)
    form.setFieldsValue({
      parentId: record.parentId ?? undefined,
      code: record.code,
      name: record.name,
      leader: record.leader,
      sort: record.sort,
    })
    setEditModalVisible(true)
  }

  /** 提交新增/编辑 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: DepartmentPayload = {
      code: values.code.trim(),
      name: values.name.trim(),
      parentId: values.parentId ?? null,
      leader: values.leader?.trim(),
      sort: values.sort,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateDepartment(editing.id, payload)
        message.success('部門信息已更新')
      } else {
        await createDepartment(payload)
        message.success('部門創建成功')
      }
      setEditModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 停用/启用 */
  const handleToggleStatus = async (record: DepartmentItem) => {
    const next = record.status === DEPT_STATUS.ENABLED ? DEPT_STATUS.DISABLED : DEPT_STATUS.ENABLED
    try {
      await updateDepartmentStatus(record.id, next)
      message.success(next === DEPT_STATUS.ENABLED ? '部門已啟用' : '部門已停用')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 删除 */
  const handleDelete = async (record: DepartmentItem) => {
    try {
      await deleteDepartment(record.id)
      message.success('部門已刪除')
      if (selectedDeptId === record.id) {
        setSelectedDeptId(undefined)
      }
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<DepartmentItem> = [
    {
      title: '部門狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === DEPT_STATUS.ENABLED
          ? <Tag color="success">有效</Tag>
          : <Tag color="error">無效</Tag>
      ),
    },
    { title: '部門編碼', dataIndex: 'code', key: 'code', width: 140 },
    { title: '部門名稱', dataIndex: 'name', key: 'name', width: 180 },
    { title: '部門對接人', dataIndex: 'leader', key: 'leader', width: 130, render: (v: string) => v || '-' },
    { title: '上級部門', dataIndex: 'parentName', key: 'parentName', width: 160, render: (v: string) => v || '-' },
    { title: '在編人數', dataIndex: 'userCount', key: 'userCount', width: 100 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === DEPT_STATUS.ENABLED ? '停用' : '啟用'}
          </Button>
          <Popconfirm
            title="確認刪除"
            description={`確定要刪除部門「${record.name}」嗎？`}
            onConfirm={() => handleDelete(record)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              刪除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="org-container">
      {/* 左侧组织架构树 */}
      <div className="org-tree-panel">
        <h3 className="org-tree-panel-title">組織架構</h3>
        <Tree
          treeData={treeData}
          defaultExpandAll
          selectedKeys={selectedDeptId != null ? [selectedDeptId] : []}
          onSelect={(keys) => setSelectedDeptId(keys.length > 0 ? Number(keys[0]) : undefined)}
        />
      </div>

      {/* 右侧主区 */}
      <div className="org-main">
        {/* 搜索区 */}
        <div className="search-section">
          <Form form={searchForm} layout="inline">
            <Form.Item label="部門名稱/編碼" name="keyword">
              <Input placeholder="請輸入部門名稱或編碼" allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label="部門對接人" name="leader">
              <Input placeholder="請輸入部門對接人" allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label="部門狀態" name="status">
              <Select placeholder="全部" allowClear options={statusOptions} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                  查詢
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {/* 操作区：仅新增，放右侧 */}
        <div className="action-section">
          <div className="action-section-right">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新增
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 條數據`,
          }}
        />
      </div>

      {/* 新增/编辑部门弹窗 */}
      <Modal
        title={editing ? '編輯部門' : '新增部門'}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label="上級部門" extra="不選擇則作為頂級部門">
            <TreeSelect
              treeData={buildTreeData(departments, editing?.id)}
              placeholder="請選擇上級部門"
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item name="code" label="部門編碼" rules={[{ required: true, message: '請輸入部門編碼' }]}>
            <Input placeholder="例如：D0001" allowClear />
          </Form.Item>
          <Form.Item name="name" label="部門名稱" rules={[{ required: true, message: '請輸入部門名稱' }]}>
            <Input placeholder="請輸入部門名稱" allowClear />
          </Form.Item>
          <Form.Item name="leader" label="部門對接人">
            <Input placeholder="請輸入部門對接人姓名" allowClear />
          </Form.Item>
          <Form.Item name="sort" label="排序" extra="數字越小越靠前">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="請輸入排序值" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
