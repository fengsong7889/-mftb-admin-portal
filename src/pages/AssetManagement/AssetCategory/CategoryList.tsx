import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tree, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { ExportOutlined, FolderOutlined, ImportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchCategoryList, deleteCategory, toggleCategoryStatus, createCategory } from '../../../api/eam'
import type { AssetCategory } from '../../../api/eam'
import CategoryImportModal from './CategoryImportModal'
import type { ParsedCategoryRow } from '../../../utils/categoryImport'
import './index.css'

/** 树节点 */
interface CatTreeNode extends TreeDataNode {
  key: number
  children?: CatTreeNode[]
}

/** 构建树数据 */
function buildTreeData(list: AssetCategory[]): CatTreeNode[] {
  const nodeMap = new Map<number, CatTreeNode>()
  list.forEach(cat => {
    nodeMap.set(cat.id, { key: cat.id, title: `${cat.code}-${cat.name}`, value: cat.id, children: [] } as CatTreeNode)
  })
  const roots: CatTreeNode[] = []
  list.forEach(cat => {
    const node = nodeMap.get(cat.id)!
    const parent = cat.parentId ? nodeMap.get(cat.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/** 收集某分类自身及所有后代 id */
function collectDescendantIds(list: AssetCategory[], rootId: number): Set<number> {
  const childrenMap = new Map<number, number[]>()
  list.forEach(cat => {
    if (cat.parentId != null) {
      const arr = childrenMap.get(cat.parentId) ?? []
      arr.push(cat.id)
      childrenMap.set(cat.parentId, arr)
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

interface CategoryListProps {
  onAdd: (parentId?: number) => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

export default function CategoryList({ onAdd, onEdit, onView }: CategoryListProps) {
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [searchForm] = Form.useForm()

  // 左侧树选中
  const [selectedCatId, setSelectedCatId] = useState<number>()
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 搜索条件
  const [searchCode, setSearchCode] = useState<string>()
  const [searchName, setSearchName] = useState<string>()
  const [searchStatus, setSearchStatus] = useState<string>()
  const [searchUpdatedBy, setSearchUpdatedBy] = useState<string>()
  const [searchUpdatedAt, setSearchUpdatedAt] = useState<string>()

  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 批量导入弹窗
  const [importVisible, setImportVisible] = useState(false)

  /** 加载数据 */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCategoryList()
      setCategories(data)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /** 树数据 */
  const treeData = useMemo(() => buildTreeData(categories), [categories])

  /** 数据加载后默认展开根节点 */
  useEffect(() => {
    if (treeData.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(treeData.map(node => node.key))
    }
  }, [treeData]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 树节点渲染：层级图标 + 名称 */
  const renderTreeTitle = (node: TreeDataNode) => {
    const name = String(node.title)
    // 判断层级
    let level = 0
    let parentId = categories.find(c => c.id === node.key)?.parentId
    while (parentId) {
      level++
      parentId = categories.find(c => c.id === parentId)?.parentId
    }
    const icon = level === 0
      ? <FolderOutlined className="cat-tree-node-icon cat-tree-node-icon-root" />
      : <FolderOutlined className="cat-tree-node-icon cat-tree-node-icon-branch" />
    return (
      <span className="cat-tree-node" title={name}>
        {icon}
        <span className="cat-tree-node-name">{name}</span>
      </span>
    )
  }

  /** 表格数据：默认展示全部，选中树节点后过滤 */
  const tableData = useMemo(() => {
    let list = categories
    if (selectedCatId != null) {
      const scope = collectDescendantIds(categories, selectedCatId)
      list = list.filter(cat => scope.has(cat.id))
    }
    if (searchCode) {
      list = list.filter(cat => cat.code.toLowerCase().includes(searchCode.toLowerCase()))
    }
    if (searchName) {
      list = list.filter(cat => cat.name.toLowerCase().includes(searchName.toLowerCase()))
    }
    if (searchStatus) {
      list = list.filter(cat => cat.status === searchStatus)
    }
    if (searchUpdatedBy) {
      list = list.filter(cat => (cat.updatedBy ?? '').toLowerCase().includes(searchUpdatedBy.toLowerCase()))
    }
    if (searchUpdatedAt) {
      list = list.filter(cat => (cat.updatedAt ?? '').startsWith(searchUpdatedAt))
    }
    return list
  }, [categories, selectedCatId, searchCode, searchName, searchStatus, searchUpdatedBy, searchUpdatedAt])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchCode(values.code?.trim() || undefined)
    setSearchName(values.name?.trim() || undefined)
    setSearchStatus(values.status || undefined)
    setSearchUpdatedBy(values.updatedBy?.trim() || undefined)
    setSearchUpdatedAt(values.updatedAt?.format('YYYY-MM-DD') || undefined)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchCode(undefined)
    setSearchName(undefined)
    setSearchStatus(undefined)
    setSearchUpdatedBy(undefined)
    setSearchUpdatedAt(undefined)
  }

  /** 禁用/启用 */
  const handleToggleStatus = async (record: AssetCategory) => {
    const isEnable = record.status === 'disabled'
    Modal.confirm({
      title: isEnable ? '确认启用该分类？' : '确认禁用该分类？',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? `启用后，该分类「${record.name}」将恢复可用。`
        : `禁用后，该分类「${record.name}」将不可用于新增资产。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await toggleCategoryStatus(record.id)
          message.success(isEnable ? '已启用' : '已禁用')
          fetchData()
        } catch {
          // 错误提示由请求层统一处理
        }
      },
    })
  }

  /** 删除 */
  const handleDelete = async (record: AssetCategory) => {
    try {
      await deleteCategory(record.id)
      message.success('删除成功')
      if (selectedCatId === record.id) {
        setSelectedCatId(undefined)
      }
      fetchData()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 导出 */
  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning('暂无数据可导出')
      return
    }
    message.success('导出功能开发中')
  }

  /** 批量导入 */
  const handleImportClick = () => {
    setImportVisible(true)
  }

  /** 执行批量导入 */
  const handleBatchImport = async (rows: ParsedCategoryRow[]) => {
    // 构建 code -> id 映射，用于解析上级分类
    const codeToId = new Map(categories.map(c => [c.code, c.id]))
    let successCount = 0
    for (const row of rows) {
      const parentId = row.parentCode ? (codeToId.get(row.parentCode) ?? 0) : 0
      await createCategory({
        code: row.code,
        name: row.name,
        parentId,
        status: row.status,
        remark: row.remark || '',
        paramTemplate: [],
        sort: 0,
      })
      successCount++
    }
    if (successCount > 0) {
      await fetchData()
    }
  }

  const columns: TableColumnsType<AssetCategory> = [
    { title: '分类编码', dataIndex: 'code', key: 'code', width: 120, onCell: () => ({ style: { whiteSpace: 'nowrap' } }) },
    { title: '分类名称', dataIndex: 'name', key: 'name', width: 160, onCell: () => ({ style: { whiteSpace: 'nowrap' } }) },
    {
      title: '上级分类',
      dataIndex: 'parentId',
      key: 'parentId',
      width: 140,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (parentId: number) => {
        if (!parentId) return '-'
        const parent = categories.find(c => c.id === parentId)
        return parent ? parent.name : '-'
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (status: string, record: AssetCategory) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 140, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (v: string) => v || '-' },
    { title: '最后更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (v: string) => v || '-' },
    {
      title: '最后更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>详情</Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>修改</Button>
          <Popconfirm
            title="确认删除"
            description={`确认删除该分类「${record.name}」？`}
            onConfirm={() => handleDelete(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { config, configComponent, applyConfig } = useColumnConfig('asset-category', columnMeta)

  /** 根據可見列動態計算 scroll 寬度 */
  const scrollX = useMemo(() => {
    const visibleKeys = new Set(config.filter(c => c.visible).map(c => c.key))
    return columns.reduce((sum, col) => sum + (visibleKeys.has(col.key as string) ? (col.width as number) : 0), 0)
  }, [config, columns])

  return (
    <>
      <div className="cat-container">
        {/* 左侧分类树 */}
        <div className="cat-tree-panel">
          <h3 className="cat-tree-panel-title">
            <FolderOutlined className="cat-tree-panel-title-icon" />
            分类结构
          </h3>
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as number[])}
            blockNode
            titleRender={renderTreeTitle}
            selectedKeys={selectedCatId != null ? [selectedCatId] : []}
            onSelect={(keys) => setSelectedCatId(keys.length > 0 ? Number(keys[0]) : undefined)}
          />
        </div>

        {/* 右侧主区 */}
        <div className="cat-main">
          {/* 搜索区 */}
          <div className="search-section">
            <Form form={searchForm} layout="inline">
              <Form.Item label="分类编码" name="code">
                <Input placeholder="请输入分类编码" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="分类名称" name="name">
                <Input placeholder="请输入分类名称" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="状态" name="status">
                <Select placeholder="全部" allowClear options={[
                  { value: 'enabled', label: '启用' },
                  { value: 'disabled', label: '禁用' },
                ]} />
              </Form.Item>
              <Form.Item label="最后更新人" name="updatedBy">
                <Input placeholder="请输入更新人" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="最后更新时间" name="updatedAt">
                <DatePicker placeholder="请选择日期" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 操作区 */}
          <div className="action-section">
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
              <Button className="btn-import" icon={<ImportOutlined />} onClick={handleImportClick}>批量导入分类</Button>
            </div>
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => onAdd(selectedCatId)}>新增分類</Button>
              {configComponent}
            </div>
          </div>

          <Table
            columns={applyConfig(columns)}
            dataSource={tableData}
            rowKey="id"
            loading={loading}
            scroll={{ x: scrollX }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        </div>
      </div>

      {/* 批量导入弹窗 */}
      <CategoryImportModal
        open={importVisible}
        onClose={() => setImportVisible(false)}
        onImport={handleBatchImport}
        existingCategories={categories.map(c => ({ code: c.code, name: c.name }))}
      />
    </>
  )
}
