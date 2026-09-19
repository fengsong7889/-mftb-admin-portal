import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tree, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { DatabaseOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchCategoryList, fetchParamTypeList, deleteParamType, updateParamType } from '../../../api/eam'
import type { AssetCategory, ParamType } from '../../../api/eam'
import { useTranslation } from 'react-i18next'
import './index.css'

interface ParamLibraryListProps {
  onAddType: (categoryCode?: string) => void
  onEditType: (id: number) => void
}

/**
 * 参数库列表页
 *
 * 左侧为资产分类树（选中后右侧过滤），右侧为参数类型列表。
 * 参数值管理已移至编辑页面内。
 */

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

export default function ParamLibraryList({ onAddType, onEditType }: ParamLibraryListProps) {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [paramTypes, setParamTypes] = useState<ParamType[]>([])
  const [loading, setLoading] = useState(false)
  const [searchForm] = Form.useForm()

  // 左侧树选中
  const [selectedCatId, setSelectedCatId] = useState<number>()
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>()
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchCode, setSearchCode] = useState<string>()
  const [searchStatus, setSearchStatus] = useState<string>()

  /** 加载分类数据 */
  const fetchCategories = useCallback(async () => {
    try {
      const data = await fetchCategoryList({ bizType: 'ALL' })
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
      const codes = collectDescendantCodes(categories, key)
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

  /** 新增参数类型 → 跳转独立页面 */
  const handleOpenAddType = () => {
    onAddType(selectedCategory?.code)
  }

  /** 删除参数类型 */
  const handleDeleteType = async (record: ParamType) => {
    try {
      await deleteParamType(record.id)
      message.success(t('common.deleteSuccess'))
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

  /** 启用/停用参数类型（二次确认） */
  const handleToggleTypeStatus = (record: ParamType) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    const actionText = newStatus === 'enabled' ? t('asset.enabledStatus') : t('asset.disabledStatus')
    Modal.confirm({
      title: `${actionText}「${record.name}」？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await updateParamType(record.id, { status: newStatus })
          message.success(newStatus === 'enabled' ? t('asset.enabledLabel') : t('asset.disabledLabel'))
          if (selectedCatId) {
            const codes = collectDescendantCodes(categories, selectedCatId)
            fetchParamTypesByCodes(codes)
          } else {
            fetchParamTypes()
          }
        } catch {
          // 错误提示由请求层统一处理
        }
      },
    })
  }

  const typeColumns: TableColumnsType<ParamType> = [
    { title: t('asset.paramCodeLabel'), dataIndex: 'code', key: 'code', width: 120 },
    { title: t('asset.paramNameLabel'), dataIndex: 'name', key: 'name', width: 140 },
    { title: t('asset.colUnitLabel'), dataIndex: 'unit', key: 'unit', width: 80, render: (v: string) => v || '-' },
    {
      title: t('asset.colValueType'),
      dataIndex: 'valueType',
      key: 'valueType',
      width: 100,
      render: (v: string) => {
        const map: Record<string, string> = { select: t('asset.valueTypeSelect'), text: t('asset.valueTypeText'), number: t('asset.valueTypeNumber') }
        return map[v] || v
      },
    },
    {
      title: t('asset.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: ParamType) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren={t('asset.switchEnabled')}
          unCheckedChildren={t('asset.switchDisabled')}
          onChange={() => handleToggleTypeStatus(record)}
        />
      ),
    },
    { title: t('asset.colDescLabel'), dataIndex: 'description', key: 'description', width: 160, render: (v: string) => v || '-' },
    { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('asset.colAction'),
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onEditType(record.id) }}>{t('common.edit')}</Button>
          <Popconfirm
            title={t('asset.confirmDeleteParamType')}
            description={t('asset.deleteParamTypeHint', { name: record.name })}
            onConfirm={(e) => { e?.stopPropagation(); handleDeleteType(record) }}
            onCancel={(e) => e?.stopPropagation()}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger onClick={(e) => e.stopPropagation()}>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const typeColumnMeta = typeColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { config: typeConfig, configComponent: typeConfigComponent, applyConfig: applyTypeConfig } = useColumnConfig('param-type', typeColumnMeta)
  const typeScrollX = useMemo(() => {
    const visibleKeys = new Set(typeConfig.filter(c => c.visible).map(c => c.key))
    return typeColumns.reduce((sum, col) => sum + (visibleKeys.has(col.key as string) ? (col.width as number) : 0), 0)
  }, [typeConfig, typeColumns])

  return (
    <div className="cat-container">
      {/* 左侧分类树 */}
      <div className="cat-tree-panel">
        <h3 className="cat-tree-panel-title">
          <DatabaseOutlined className="cat-tree-panel-title-icon" />
          {t('asset.catStructureTitle')}
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
            <Form.Item label={t('asset.paramNameLabel')} name="name">
              <Input placeholder={t('asset.paramNamePh')} allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label={t('asset.paramCodeLabel')} name="code">
              <Input placeholder={t('asset.paramCodePh')} allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label={t('asset.colStatus')} name="status">
              <Select placeholder={t('common.all')} allowClear options={[
                { value: 'enabled', label: t('asset.statusEnabled') },
                { value: 'disabled', label: t('asset.statusDisabled') },
              ]} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {/* 操作区 */}
        <div className="action-section">
          <div className="action-section-left"></div>
          <div className="action-section-right">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddType}>
              {t('asset.addParamTypeBtn')}
            </Button>
            {typeConfigComponent}
          </div>
        </div>

        {/* 参数类型表格 */}
        <Table
          columns={applyTypeConfig(typeColumns)}
          dataSource={tableData}
          rowKey="id"
          loading={loading}
          scroll={{ x: typeScrollX }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('asset.totalItems', { total }),
          }}
        />
      </div>
    </div>
  )
}
