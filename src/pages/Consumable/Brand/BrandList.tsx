/**
 * 耗材品牌列表页（左侧耗材分类树 + 右侧品牌表格）
 *
 * 对齐资产品牌产品（AssetModel/ModelList.tsx）的左树右表交互模式：
 * - 左侧：耗材分类树面板
 * - 右侧：搜索区 + 操作区 + 品牌表格
 * - 品牌编码（CB 前缀）独立展示
 * - 状态 Switch 切换（二次确认）
 * - useColumnConfig 列配置
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tree, Tag, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { FolderOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  fetchConsumableBrands, deleteConsumableBrand, toggleConsumableBrandStatus,
  type ConsumableBrand,
} from '../../../api/consumable'
import {
  fetchConsumableCategories,
  type ConsumableCategory,
} from '../../../api/consumable'
import '../../AssetManagement/AssetCategory/index.css'

const CATEGORY_TYPE_COLOR: Record<string, string> = { CONSUMABLE: 'blue', BOTH: 'purple', ASSET: 'default' }
const CATEGORY_TYPE_LABEL: Record<string, string> = { CONSUMABLE: '僅耗材', BOTH: '資產+耗材', ASSET: '僅資產' }

/** 树节点 */
interface CatTreeNode extends TreeDataNode {
  key: number
  children?: CatTreeNode[]
}

/** 构建树数据 */
function buildTreeData(list: ConsumableCategory[]): CatTreeNode[] {
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

interface BrandListProps {
  onAdd: () => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

export default function BrandList({ onAdd, onEdit, onView }: BrandListProps) {
  const [brands, setBrands] = useState<ConsumableBrand[]>([])
  const [categories, setCategories] = useState<ConsumableCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [searchForm] = Form.useForm()

  // 左侧树
  const [treeData, setTreeData] = useState<CatTreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchType, setSearchType] = useState<string>()
  const [searchUpdatedBy, setSearchUpdatedBy] = useState<string>()
  const [searchUpdatedAt, setSearchUpdatedAt] = useState<string>()

  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /** 加载数据 */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [brandList, catList] = await Promise.all([
        fetchConsumableBrands(),
        fetchConsumableCategories(),
      ])
      setBrands(brandList)
      setCategories(catList)
      setTreeData(buildTreeData(catList))
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  /** 表格数据：按搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = brands
    if (searchName) {
      const kw = searchName.toLowerCase()
      list = list.filter(b =>
        b.name.toLowerCase().includes(kw) ||
        (b.nameEn ?? '').toLowerCase().includes(kw) ||
        (b.code ?? '').toLowerCase().includes(kw)
      )
    }
    if (searchType) {
      list = list.filter(b => b.categoryType === searchType)
    }
    if (searchUpdatedBy) {
      list = list.filter(b => (b.updatedBy ?? '').toLowerCase().includes(searchUpdatedBy.toLowerCase()))
    }
    if (searchUpdatedAt) {
      list = list.filter(b => (b.updatedAt ?? '').startsWith(searchUpdatedAt))
    }
    return list
  }, [brands, searchName, searchType, searchUpdatedBy, searchUpdatedAt])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchName(values.name?.trim() || undefined)
    setSearchType(values.categoryType || undefined)
    setSearchUpdatedBy(values.updatedBy?.trim() || undefined)
    setSearchUpdatedAt(values.updatedAt?.format('YYYY-MM-DD') || undefined)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchName(undefined)
    setSearchType(undefined)
    setSearchUpdatedBy(undefined)
    setSearchUpdatedAt(undefined)
  }

  /** 禁用/启用 */
  const handleToggleStatus = (record: ConsumableBrand) => {
    const isEnable = record.status === 'disabled'
    Modal.confirm({
      title: isEnable ? '確認啟用' : '確認停用',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: isEnable
        ? `確定啟用品牌「${record.name}」？`
        : `確定停用品牌「${record.name}」？停用後該品牌將不可使用。`,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await toggleConsumableBrandStatus(record.id)
          message.success(isEnable ? '已啟用' : '已停用')
          fetchData()
        } catch {
          // 错误提示由请求层统一处理
        }
      },
    })
  }

  /** 删除 */
  const handleDelete = async (record: ConsumableBrand) => {
    try {
      await deleteConsumableBrand(record.id)
      message.success('刪除成功')
      fetchData()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<ConsumableBrand> = [
    { title: '品牌編碼', dataIndex: 'code', key: 'code', width: 100,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v || '-'}</span> },
    { title: '品牌名稱', dataIndex: 'name', key: 'name', width: 140,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }) },
    { title: '英文名', dataIndex: 'nameEn', key: 'nameEn', width: 120,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => v || '-' },
    { title: '適用範圍', dataIndex: 'categoryType', key: 'categoryType', width: 110,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => <Tag color={CATEGORY_TYPE_COLOR[v]}>{CATEGORY_TYPE_LABEL[v] ?? v}</Tag> },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (status: string, record: ConsumableBrand) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 140,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => v || '-' },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 160,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>詳情</Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>編輯</Button>
          <Popconfirm
            title="確認刪除"
            description={`確定刪除品牌「${record.name}」？`}
            onConfirm={() => handleDelete(record)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>刪除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { config, configComponent, applyConfig } = useColumnConfig('consumable-brand', columnMeta)

  /** 根據可見列動態計算 scroll 寬度 */
  const scrollX = useMemo(() => {
    const visibleKeys = new Set(config.filter(c => c.visible).map(c => c.key))
    return columns.reduce((sum, col) => sum + (visibleKeys.has(col.key as string) ? (col.width as number) : 0), 0)
  }, [config, columns])

  return (
    <div className="cat-container">
      {/* 左侧耗材分类树 */}
      <div className="cat-tree-panel">
        <h3 className="cat-tree-panel-title">
          <FolderOutlined className="cat-tree-panel-title-icon" />
          耗材分類結構
        </h3>
        <Tree
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as number[])}
          blockNode
          titleRender={renderTreeTitle}
        />
      </div>

      {/* 右侧主区 */}
      <div className="cat-main">
        {/* 搜索区 */}
        <div className="search-section">
          <Form form={searchForm} layout="inline">
            <Form.Item label="關鍵字" name="name">
              <Input placeholder="編碼/名稱/英文" allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label="適用範圍" name="categoryType">
              <Select placeholder="全部" allowClear options={[
                { value: 'CONSUMABLE', label: '僅耗材' },
                { value: 'BOTH', label: '資產+耗材' },
                { value: 'ASSET', label: '僅資產' },
              ]} />
            </Form.Item>
            <Form.Item label="最後更新人" name="updatedBy">
              <Input placeholder="請輸入更新人" allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label="更新日期" name="updatedAt">
              <DatePicker placeholder="選擇日期" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {/* 操作区 */}
        <div className="action-section">
          <div className="action-section-left" />
          <div className="action-section-right">
            <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>新增品牌</Button>
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
            showTotal: (total) => `共 ${total} 條`,
          }}
        />
      </div>
    </div>
  )
}
