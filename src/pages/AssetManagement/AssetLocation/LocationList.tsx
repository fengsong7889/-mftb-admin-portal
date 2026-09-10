/**
 * 仓库维护列表（左右结构：左侧仓库树 + 右侧表格）
 *
 * - 左侧树：仓库 / 楼层 / 办公室
 * - 右侧：搜索条件 + 操作按钮 + 表格
 * - 默认展示全部数据，选中树节点后过滤
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tree } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, FolderOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchLocationList, deleteLocation, type AssetLocation } from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import '../AssetCategory/index.css'

type LocationRow = AssetLocation

interface LocationTreeNode extends TreeDataNode {
  key: number
  children?: LocationTreeNode[]
}

const TYPE_META: Record<AssetLocation['type'], { key: string; color: string }> = {
  warehouse: { key: 'asset.locWarehouse', color: 'blue' },
  floor:     { key: 'asset.locFloor',     color: 'cyan' },
  room:      { key: 'asset.locRoom',      color: 'green' },
}

const TYPE_OPTIONS = [
  { value: 'warehouse', label: '倉庫' },
  { value: 'floor', label: '樓層' },
  { value: 'room', label: '辦公室' },
]

interface Props {
  onAdd: (parentId?: number) => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  name?: string
  code?: string
  type?: string
  address?: string
  updatedBy?: string
}

/** 构建树数据 */
function buildTreeData(list: LocationRow[]): LocationTreeNode[] {
  const nodeMap = new Map<number, LocationTreeNode>()
  list.forEach(loc => {
    nodeMap.set(loc.id, { key: loc.id, title: loc.name, value: loc.id, children: [] } as LocationTreeNode)
  })
  const roots: LocationTreeNode[] = []
  list.forEach(loc => {
    const node = nodeMap.get(loc.id)!
    const parent = loc.parentId ? nodeMap.get(loc.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/** 收集某节点自身及所有后代 id */
function collectDescendantIds(list: LocationRow[], rootId: number): Set<number> {
  const childrenMap = new Map<number, number[]>()
  list.forEach(loc => {
    if (loc.parentId) {
      const arr = childrenMap.get(loc.parentId) ?? []
      arr.push(loc.id)
      childrenMap.set(loc.parentId, arr)
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

export default function LocationList({ onAdd, onEdit, onView }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])
  const [selectedLocId, setSelectedLocId] = useState<number>()

  // 搜索条件
  const [searchName, setSearchName] = useState<string>()
  const [searchCode, setSearchCode] = useState<string>()
  const [searchType, setSearchType] = useState<string>()
  const [searchAddress, setSearchAddress] = useState<string>()
  const [searchUpdatedBy, setSearchUpdatedBy] = useState<string>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLocationList({})
      setLocations(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  /** 树数据 */
  const treeData = useMemo(() => buildTreeData(locations), [locations])

  /** 数据加载后默认展开根节点 */
  useEffect(() => {
    if (treeData.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(treeData.map(node => node.key))
    }
  }, [treeData])

  /** 树节点渲染 */
  const renderTreeTitle = (node: TreeDataNode) => {
    const name = String(node.title)
    let level = 0
    let parentId = locations.find(l => l.id === node.key)?.parentId
    while (parentId) {
      level++
      parentId = locations.find(l => l.id === parentId)?.parentId
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

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setSearchName(v.name || undefined)
    setSearchCode(v.code || undefined)
    setSearchType(v.type || undefined)
    setSearchAddress(v.address || undefined)
    setSearchUpdatedBy(v.updatedBy || undefined)
  }
  const handleReset = () => { form.resetFields(); setSearchName(undefined); setSearchCode(undefined); setSearchType(undefined); setSearchAddress(undefined); setSearchUpdatedBy(undefined) }

  /** 表格数据：默认展示全部，选中树节点后过滤 */
  const tableData = useMemo(() => {
    let list = locations
    if (selectedLocId != null) {
      const scope = collectDescendantIds(locations, selectedLocId)
      list = list.filter(loc => scope.has(loc.id))
    }
    if (searchName) {
      list = list.filter(loc => loc.name.toLowerCase().includes(searchName.toLowerCase()))
    }
    if (searchCode) {
      list = list.filter(loc => loc.code.toLowerCase().includes(searchCode.toLowerCase()))
    }
    if (searchType) {
      list = list.filter(loc => loc.type === searchType)
    }
    if (searchAddress) {
      list = list.filter(loc => (loc.address ?? '').toLowerCase().includes(searchAddress.toLowerCase()))
    }
    if (searchUpdatedBy) {
      list = list.filter(loc => (loc.updatedBy ?? '').toLowerCase().includes(searchUpdatedBy.toLowerCase()))
    }
    return list
  }, [locations, selectedLocId, searchName, searchCode, searchType, searchUpdatedBy])

  const handleDelete = (record: LocationRow) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.name}（${record.code}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteLocation(record.id)
          message.success(t('asset.deleteSuccess'))
          if (selectedLocId === record.id) {
            setSelectedLocId(undefined)
          }
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning('暂无数据可导出')
      return
    }
    message.success('导出功能开发中')
  }

  /* ── 列字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'code', title: '編碼' },
    { key: 'name', title: '倉庫名稱' },
    { key: 'type', title: '位置類型' },
    { key: 'address', title: '倉庫地址' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-location', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<LocationRow> = [
    {
      title: '編碼', dataIndex: 'code', key: 'code', width: 120,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '倉庫名稱', dataIndex: 'name', key: 'name', width: 160,
    },
    {
      title: '位置類型', dataIndex: 'type', key: 'type', width: 100,
      render: (v: AssetLocation['type']) => {
        const m = TYPE_META[v]
        return <Tag color={m.color}>{t(m.key)}</Tag>
      },
    },
    {
      title: '倉庫地址', dataIndex: 'address', key: 'address', width: 200, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '備註', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 130,
      render: (_: unknown, record: LocationRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>
            {t('common.detail')}
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div className="cat-container">
        {/* 左侧仓库树 */}
        <div className="cat-tree-panel">
          <h3 className="cat-tree-panel-title">
            <FolderOutlined className="cat-tree-panel-title-icon" />
            仓库结构
          </h3>
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as number[])}
            blockNode
            titleRender={renderTreeTitle}
            selectedKeys={selectedLocId != null ? [selectedLocId] : []}
            onSelect={(keys) => setSelectedLocId(keys.length > 0 ? Number(keys[0]) : undefined)}
          />
        </div>

        {/* 右侧主区 */}
        <div className="cat-main">
          {/* 搜索区 */}
          <div className="search-section">
            <Form form={form} layout="inline">
              <Form.Item label="仓库名称" name="name">
                <Input placeholder="请输入仓库名称" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="编码" name="code">
                <Input placeholder="请输入编码" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="位置类型" name="type">
                <Select placeholder="全部" allowClear options={TYPE_OPTIONS} />
              </Form.Item>
              <Form.Item label="仓库地址" name="address">
                <Input placeholder="请输入仓库地址" allowClear onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label="最后更新人" name="updatedBy">
                <Input placeholder="请输入更新人" allowClear onPressEnter={handleSearch} />
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
            <div className="action-section-left">
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            </div>
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => onAdd(selectedLocId)}>
                新增倉庫
              </Button>
              {configComponent}
            </div>
          </div>

          {/* 表格 */}
          <Table<LocationRow>
            columns={applyConfig(columns)}
            dataSource={tableData}
            rowKey="id"
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
