import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tree, TreeSelect, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { DatabaseOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { fetchCategoryList, fetchParamTypeList, deleteParamType, updateParamType, fetchParamValuesByType, createParamType, createParamValue, deleteParamValue } from '../../../api/eam'
import type { AssetCategory, ParamType, ParamValue } from '../../../api/eam'
import './index.css'

/** 树节点 */
interface CatTreeNode extends TreeDataNode {
  key: number
  title: string
  children?: CatTreeNode[]
}

/** 构建树数据 */
function buildTreeData(list: AssetCategory[]): CatTreeNode[] {
  const nodeMap = new Map<number, CatTreeNode>()
  list.forEach(cat => {
    nodeMap.set(cat.id, { key: cat.id, title: cat.name, value: cat.id, children: [] } as CatTreeNode)
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

/** 收集某分类自身及所有后代 code */
function collectDescendantCodes(list: AssetCategory[], rootId: number): Set<string> {
  const childrenMap = new Map<number, number[]>()
  list.forEach(cat => {
    if (cat.parentId) {
      const arr = childrenMap.get(cat.parentId) ?? []
      arr.push(cat.id)
      childrenMap.set(cat.parentId, arr)
    }
  })
  const idToCode = new Map(list.map(c => [c.id, c.code]))
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const code = idToCode.get(current)
    if (code) result.add(code)
    for (const childId of childrenMap.get(current) ?? []) {
      if (!result.has(idToCode.get(childId) ?? '')) {
        queue.push(childId)
      }
    }
  }
  return result
}

export default function ParamLibraryList() {
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [paramTypes, setParamTypes] = useState<ParamType[]>([])
  const [paramValues, setParamValues] = useState<ParamValue[]>([])
  const [loading, setLoading] = useState(false)
  const [valuesLoading, setValuesLoading] = useState(false)
  const [searchForm] = Form.useForm()
  const [valueSearchForm] = Form.useForm()

  // 左侧树选中
  const [selectedCatId, setSelectedCatId] = useState<number>()
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>()
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchCode, setSearchCode] = useState<string>()
  const [searchStatus, setSearchStatus] = useState<string>()

  // 参数值搜索
  const [valueSearch, setValueSearch] = useState<string>()

  // 弹窗
  const [addTypeModalOpen, setAddTypeModalOpen] = useState(false)
  const [addTypeModalCategoryDisabled, setAddTypeModalCategoryDisabled] = useState(false)
  const [addValueModalOpen, setAddValueModalOpen] = useState(false)
  const [addTypeForm] = Form.useForm()
  const [addValueForm] = Form.useForm()

  /** 加载分类数据 */
  const fetchCategories = useCallback(async () => {
    try {
      const data = await fetchCategoryList()
      setCategories(data)
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [])

  /** 加载参数类型数据 */
  const fetchParamTypes = useCallback(async (categoryCode?: string) => {
    setLoading(true)
    try {
      const result = await fetchParamTypeList({ categoryCode, size: 9999 })
      setParamTypes(result.records || [])
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  /** 加载参数值 */
  const fetchParamValues = useCallback(async (paramTypeCode: string) => {
    setValuesLoading(true)
    try {
      const data = await fetchParamValuesByType(paramTypeCode)
      setParamValues(data)
    } catch {
      setParamValues([])
    } finally {
      setValuesLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
    fetchParamTypes()
  }, [fetchCategories, fetchParamTypes])

  /** 树数据 */
  const treeData = useMemo(() => buildTreeData(categories), [categories])

  /** 数据加载后默认展开根节点 */
  useEffect(() => {
    if (treeData.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(treeData.map(node => node.key))
    }
  }, [treeData]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 树节点渲染 */
  const renderTreeTitle = (node: TreeDataNode) => {
    const name = String(node.title)
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

  /** 树节点选中 */
  const handleTreeSelect = (keys: React.Key[]) => {
    const key = keys.length > 0 ? Number(keys[0]) : undefined
    setSelectedCatId(key)
    if (key) {
      const cat = categories.find(c => c.id === key)
      setSelectedCategory(cat)
      // 收集该分类及所有子分类的 code
      const codes = collectDescendantCodes(categories, key)
      // 过滤参数类型
      const allTypes = paramTypes.filter(t => codes.has(t.categoryCode))
      // 这里简化处理，直接重新请求
      fetchParamTypesByCodes(codes)
    } else {
      setSelectedCategory(undefined)
      fetchParamTypes()
    }
  }

  const fetchParamTypesByCodes = async (codes: Set<string>) => {
    setLoading(true)
    try {
      const result = await fetchParamTypeList({ size: 9999 })
      const all = result.records || []
      setParamTypes(all.filter((t: ParamType) => codes.has(t.categoryCode)))
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }

  /** 表格数据过滤 */
  const tableData = useMemo(() => {
    let list = paramTypes
    if (searchName) list = list.filter(t => t.name.includes(searchName))
    if (searchCode) list = list.filter(t => t.code.includes(searchCode))
    if (searchStatus) list = list.filter(t => t.status === searchStatus)
    return list
  }, [paramTypes, searchName, searchCode, searchStatus])

  /** 参数值过滤 */
  const filteredValues = useMemo(() => {
    let list = paramValues
    if (valueSearch) list = list.filter(v => v.value.includes(valueSearch))
    return list
  }, [paramValues, valueSearch])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchName(values.name?.trim() || undefined)
    setSearchCode(values.code?.trim() || undefined)
    setSearchStatus(values.status || undefined)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchName(undefined)
    setSearchCode(undefined)
    setSearchStatus(undefined)
  }

  /** 构建分类 TreeSelect 数据（仅叶子分类可添加参数） */
  const categoryTreeSelectData = useMemo(() => {
    const parentIds = new Set(categories.filter(c => c.parentId === 0).map(c => c.id))
    const leafCats = categories.filter(c => !parentIds.has(c.id))
    // 按一级分类分组
    const groupMap = new Map<number, AssetCategory[]>()
    leafCats.forEach(cat => {
      // 找到其一级父分类
      let parentId = cat.parentId
      while (parentId) {
        const parent = categories.find(c => c.id === parentId)
        if (parent && parent.parentId === 0) {
          const arr = groupMap.get(parent.id) ?? []
          arr.push(cat)
          groupMap.set(parent.id, arr)
          break
        }
        parentId = parent?.parentId ?? 0
      }
    })
    return Array.from(groupMap.entries()).map(([parentId, children]) => {
      const parent = categories.find(c => c.id === parentId)!
      return {
        label: parent.name,
        options: children.map(c => ({ label: c.name, value: c.code })),
      }
    })
  }, [categories])

  /** 打开新增参数类型弹窗 */
  const handleOpenAddType = () => {
    addTypeForm.resetFields()
    if (selectedCategory) {
      addTypeForm.setFieldsValue({ categoryCode: selectedCategory.code })
      setAddTypeModalCategoryDisabled(true)
    } else {
      setAddTypeModalCategoryDisabled(false)
    }
    setAddTypeModalOpen(true)
  }

  /** 新增参数类型 */
  const handleAddType = async () => {
    try {
      const values = await addTypeForm.validateFields()
      await createParamType({
        categoryCode: values.categoryCode.trim(),
        code: values.code.trim(),
        name: values.name.trim(),
        unit: values.unit?.trim() || undefined,
        valueType: values.valueType || 'select',
        status: 'enabled',
        sort: values.sort || 0,
        description: values.description?.trim() || undefined,
        updatedBy: '冯松',
        updatedAt: new Date().toLocaleString('zh-CN'),
      })
      message.success('新增成功')
      setAddTypeModalOpen(false)
      setAddTypeModalCategoryDisabled(false)
      addTypeForm.resetFields()
      if (selectedCatId) {
        const codes = collectDescendantCodes(categories, selectedCatId)
        fetchParamTypesByCodes(codes)
      } else {
        fetchParamTypes()
      }
    } catch {
      // 表单校验失败
    }
  }

  /** 新增参数值 */
  const handleAddValue = async () => {
    try {
      const values = await addValueForm.validateFields()
      if (!selectedType) {
        message.warning('请先选择参数类型')
        return
      }
      await createParamValue({
        paramTypeCode: selectedType.code,
        value: values.value.trim(),
        sort: values.sort || 0,
        status: 'enabled',
        updatedBy: '冯松',
        updatedAt: new Date().toLocaleString('zh-CN'),
      })
      message.success('新增成功')
      setAddValueModalOpen(false)
      addValueForm.resetFields()
      fetchParamValues(selectedType.code)
    } catch {
      // 表单校验失败
    }
  }

  /** 删除参数类型 */
  const handleDeleteType = async (record: ParamType) => {
    try {
      await deleteParamType(record.id)
      message.success('删除成功')
      if (selectedCatId) {
        const codes = collectDescendantCodes(categories, selectedCatId)
        fetchParamTypesByCodes(codes)
      } else {
        fetchParamTypes()
      }
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 删除参数值 */
  const handleDeleteValue = async (record: ParamValue) => {
    try {
      await deleteParamValue(record.id)
      message.success('删除成功')
      if (selectedType) fetchParamValues(selectedType.code)
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 启用/停用参数类型 */
  const handleToggleTypeStatus = async (record: ParamType) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    try {
      await updateParamType(record.id, { status: newStatus })
      message.success(newStatus === 'enabled' ? '已启用' : '已停用')
      if (selectedCatId) {
        const codes = collectDescendantCodes(categories, selectedCatId)
        fetchParamTypesByCodes(codes)
      } else {
        fetchParamTypes()
      }
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 选中的参数类型（用于显示参数值） */
  const [selectedType, setSelectedType] = useState<ParamType>()

  /** 点击参数类型行，加载其参数值 */
  const handleTypeRowClick = (record: ParamType) => {
    setSelectedType(record)
    fetchParamValues(record.code)
    setValueSearch(undefined)
    valueSearchForm.resetFields()
  }

  const typeColumns: TableColumnsType<ParamType> = [
    { title: '参数编码', dataIndex: 'code', key: 'code', width: 120 },
    { title: '参数名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: string) => v || '-' },
    {
      title: '值类型',
      dataIndex: 'valueType',
      key: 'valueType',
      width: 100,
      render: (v: string) => {
        const map: Record<string, string> = { select: '下拉选择', text: '文本', number: '数字' }
        return map[v] || v
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: ParamType) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => handleToggleTypeStatus(record)}
        />
      ),
    },
    { title: '描述', dataIndex: 'description', key: 'description', width: 160, render: (v: string) => v || '-' },
    { title: '最后更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最后更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleTypeRowClick(record)}>参数值</Button>
          <Popconfirm
            title="确认删除"
            description={`确认删除参数类型「${record.name}」？`}
            onConfirm={() => handleDeleteType(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const valueColumns: TableColumnsType<ParamValue> = [
    { title: '序号', key: 'index', width: 60, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '参数值', dataIndex: 'value', key: 'value', width: 200 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <span style={{ color: status === 'enabled' ? '#52C41A' : '#8C8C8C' }}>
          {status === 'enabled' ? '启用' : '停用'}
        </span>
      ),
    },
    { title: '最后更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最后更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="确认删除"
          description={`确认删除参数值「${record.value}」？`}
          onConfirm={() => handleDeleteValue(record)}
          okText="确认"
          cancelText="取消"
        >
          <Button type="link" size="small" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <div className="cat-container">
        {/* 左侧分类树 */}
        <div className="cat-tree-panel">
          <h3 className="cat-tree-panel-title">
            <DatabaseOutlined className="cat-tree-panel-title-icon" />
            分类结构
          </h3>
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as number[])}
            blockNode
            titleRender={renderTreeTitle}
            selectedKeys={selectedCatId != null ? [selectedCatId] : []}
            onSelect={handleTreeSelect}
          />
        </div>

        {/* 右侧主区 */}
        <div className="cat-main">
          {/* 搜索区 */}
          <div className="search-section">
            <Form form={searchForm} layout="inline">
              <Form.Item label="参数名称" name="name">
                <Input placeholder="请输入参数名称" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="参数编码" name="code">
                <Input placeholder="请输入参数编码" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="状态" name="status">
                <Select placeholder="全部" allowClear options={[
                  { value: 'enabled', label: '启用' },
                  { value: 'disabled', label: '停用' },
                ]} />
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
            <div className="action-section-left"></div>
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddType}>
                新增参数类型
              </Button>
            </div>
          </div>

          {/* 参数类型表格 */}
          <Table
            columns={typeColumns}
            dataSource={tableData}
            rowKey="id"
            loading={loading}
            rowClassName={(record) => selectedType?.id === record.id ? 'param-type-selected' : ''}
            onRow={(record) => ({
              onClick: () => handleTypeRowClick(record),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />

          {/* 参数值表格 */}
          {selectedType && (
            <div className="param-values-section">
              <h3 className="param-values-title">
                <DatabaseOutlined style={{ color: '#E8720C', marginRight: 8 }} />
                参数值管理 — {selectedType.name}
                {selectedType.unit && <span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 8 }}>({selectedType.unit})</span>}
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddValueModalOpen(true)} style={{ marginLeft: 'auto' }}>
                  新增参数值
                </Button>
              </h3>
              <div className="param-values-search">
                <Input
                  placeholder="搜索参数值"
                  allowClear
                  value={valueSearch}
                  onChange={(e) => setValueSearch(e.target.value)}
                  style={{ width: 240 }}
                />
              </div>
              <Table
                columns={valueColumns}
                dataSource={filteredValues}
                rowKey="id"
                loading={valuesLoading}
                size="small"
                pagination={{
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 条`,
                  pageSize: 10,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 新增参数类型弹窗 */}
      <Modal
        title="新增参数类型"
        open={addTypeModalOpen}
        onOk={handleAddType}
        onCancel={() => { setAddTypeModalOpen(false); setAddTypeModalCategoryDisabled(false); addTypeForm.resetFields() }}
        okText="确认"
        cancelText="取消"
        width={520}
      >
        <Form form={addTypeForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="categoryCode" label="所属分类" rules={[{ required: true, message: '请选择所属分类' }]}>
            <TreeSelect
              placeholder="请选择所属分类"
              allowClear={!addTypeModalCategoryDisabled}
              disabled={addTypeModalCategoryDisabled}
              treeDefaultExpandAll
              treeNodeFilterProp="label"
              listHeight={240}
              treeData={categoryTreeSelectData}
            />
          </Form.Item>
          <Form.Item name="code" label="参数编码" rules={[{ required: true, message: '请输入参数编码' }]}>
            <Input placeholder="如 cpu / memory / storage" />
          </Form.Item>
          <Form.Item name="name" label="参数名称" rules={[{ required: true, message: '请输入参数名称' }]}>
            <Input placeholder="如 CPU / 内存 / 存储" />
          </Form.Item>
          <Form.Item name="unit" label="计量单位">
            <Input placeholder="如 GB / 英寸 / W（可选）" />
          </Form.Item>
          <Form.Item name="valueType" label="值类型" initialValue="select">
            <Select options={[
              { value: 'select', label: '下拉选择' },
              { value: 'text', label: '文本' },
              { value: 'number', label: '数字' },
            ]} />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="参数描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增参数值弹窗 */}
      <Modal
        title={`新增参数值 — ${selectedType?.name || ''}`}
        open={addValueModalOpen}
        onOk={handleAddValue}
        onCancel={() => { setAddValueModalOpen(false); addValueForm.resetFields() }}
        okText="确认"
        cancelText="取消"
        width={480}
      >
        <Form form={addValueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="value" label="参数值" rules={[{ required: true, message: '请输入参数值' }]}>
            <Input placeholder={`如 ${selectedType?.code === 'memory' ? '16' : '示例值'}`} />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
