/**
 * 品牌产品维护列表（左右结构：左侧分类树 + 右侧品牌/产品表格）
 *
 * - 左侧：资产分类树（与资产分类页面一致）
 * - 右侧：选中分类 → 显示品牌列表；选中品牌 → 显示产品列表
 * - 新增：选中分类时新增品牌；选中品牌时新增产品
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tooltip, DatePicker, Tree } from 'antd'
import type { TableColumnsType, TablePaginationConfig, TreeDataNode } from 'antd'
import type { Dayjs } from 'dayjs'
import { SearchOutlined, ReloadOutlined, PlusOutlined, FolderOutlined, ShopOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchModelList, fetchBrandList, fetchCategoryList, deleteModel, deleteBrand,
  type AssetModel, type AssetBrand, type AssetCategory, type BrandQuery,
} from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import '../AssetCategory/index.css'

interface Props {
  onAddBrand: (categoryCode: string) => void
  onAddProduct: (categoryCode: string, brandId: number) => void
  onEditBrand: (id: number) => void
  onEditProduct: (id: number) => void
  onDetailBrand: (id: number) => void
  onDetailProduct: (id: number) => void
}

interface SearchFormValues {
  name?: string
  brandZh?: string
  updatedBy?: string
  updatedAtRange?: [Dayjs, Dayjs]
}

/** 树节点 */
interface CatTreeNode extends TreeDataNode {
  key: number
  title: string
  value: number
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

export default function ModelList({
  onAddBrand, onAddProduct,
  onEditBrand, onEditProduct,
  onDetailBrand, onDetailProduct,
}: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [brandForm] = Form.useForm<{ brandZh?: string; updatedBy?: string; updatedAtRange?: [Dayjs, Dayjs] }>()
  const [loading, setLoading] = useState(false)

  // 数据源
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [products, setProducts] = useState<AssetModel[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [treeData, setTreeData] = useState<CatTreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 选中状态
  const [selectedCatId, setSelectedCatId] = useState<number>()
  const [selectedBrandId, setSelectedBrandId] = useState<number>()
  const [viewMode, setViewMode] = useState<'brands' | 'products'>('brands')

  // 分页
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 搜索过滤
  const [brandFilters, setBrandFilters] = useState<BrandQuery>({})
  const [filters, setFilters] = useState<{
    name?: string
    brandZh?: string
    updatedBy?: string
    updatedAtStart?: string
    updatedAtEnd?: string
  }>({})

  const loadBrands = useCallback(async (catCode?: string) => {
    setLoading(true)
    try {
      const params: BrandQuery = { ...brandFilters }
      if (catCode) params.categoryCode = catCode
      const list = await fetchBrandList(params)
      setBrands(list)
      setTotal(list.length)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载品牌失败')
    } finally {
      setLoading(false)
    }
  }, [brandFilters])

  const loadProducts = useCallback(async (brandId?: number) => {
    setLoading(true)
    try {
      const res = await fetchModelList({ ...filters, brandId, page, size })
      setProducts(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载产品失败')
    } finally {
      setLoading(false)
    }
  }, [filters, page, size])

  useEffect(() => {
    fetchCategoryList().then((list) => {
      setCategories(list)
      setTreeData(buildTreeData(list))
    }).catch(() => undefined)
    // 默认加载全部品牌
    loadBrands()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    setSelectedBrandId(undefined)
    setViewMode('brands')
    form.resetFields()
    setPage(1)
    if (key) {
      const cat = categories.find(c => c.id === key)
      if (cat) {
        loadBrands(cat.code)
      }
    } else {
      loadBrands()
    }
  }

  /** 品牌搜索 */
  const handleBrandSearch = () => {
    const v = brandForm.getFieldsValue()
    const next: BrandQuery = {}
    if (v.brandZh) next.brandZh = v.brandZh
    if (v.updatedBy) next.updatedBy = v.updatedBy
    if (v.updatedAtRange) {
      next.updatedAtStart = v.updatedAtRange[0].format('YYYY-MM-DD 00:00:00')
      next.updatedAtEnd = v.updatedAtRange[1].format('YYYY-MM-DD 23:59:59')
    }
    setBrandFilters(next)
    setPage(1)
    if (selectedCatId) {
      const cat = categories.find(c => c.id === selectedCatId)
      loadBrands(cat?.code)
    } else {
      loadBrands()
    }
  }
  const handleBrandReset = () => {
    brandForm.resetFields()
    setBrandFilters({})
    setPage(1)
    if (selectedCatId) {
      const cat = categories.find(c => c.id === selectedCatId)
      loadBrands(cat?.code)
    } else {
      loadBrands()
    }
  }

  /** 品牌行点击 → 切换到产品视图 */
  const handleBrandClick = (brand: AssetBrand) => {
    setSelectedBrandId(brand.id)
    setViewMode('products')
    setFilters({})
    setPage(1)
    loadProducts(brand.id)
  }

  const handleSearch = () => {
    if (viewMode !== 'products') return
    const v = form.getFieldsValue()
    const next: typeof filters = {
      name: v.name || undefined,
      updatedBy: v.updatedBy || undefined,
    }
    if (v.updatedAtRange) {
      next.updatedAtStart = v.updatedAtRange[0].format('YYYY-MM-DD 00:00:00')
      next.updatedAtEnd = v.updatedAtRange[1].format('YYYY-MM-DD 23:59:59')
    }
    setFilters(next)
    setPage(1)
    if (selectedBrandId) loadProducts(selectedBrandId)
  }
  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setPage(1)
    if (selectedBrandId) loadProducts(selectedBrandId)
  }

  const handleDeleteBrand = (record: AssetBrand) => {
    Modal.confirm({
      title: '确认删除品牌',
      content: `${record.brandZh}（${record.brandEn}）`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteBrand(record.id)
          message.success('删除成功')
          if (selectedCatId) {
            const cat = categories.find(c => c.id === selectedCatId)
            loadBrands(cat?.code)
          }
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '删除失败')
        }
      },
    })
  }

  const handleDeleteProduct = (record: AssetModel) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.brandZh} ${record.name}`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteModel(record.id)
          message.success(t('asset.deleteSuccess'))
          if (selectedBrandId) loadProducts(selectedBrandId)
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const categoryName = (code: string) => categories.find((c) => c.code === code)?.name || code

  /* ── 品牌表格列 ─ */
  const brandColumns: TableColumnsType<AssetBrand> = [
    {
      title: '品牌', key: 'brand', width: 200,
      render: (_: unknown, r: AssetBrand) => (
        <Space size={6}>
          <span style={{ fontWeight: 600 }}>{r.brandZh}</span>
          {r.brandEn && <span style={{ color: '#8C8C8C', fontSize: 12 }}>{r.brandEn}</span>}
        </Space>
      ),
    },
    {
      title: '所属分类', dataIndex: 'categoryCode', key: 'categoryCode', width: 140,
      render: (v: string) => <Tag color="blue">{categoryName(v)}</Tag>,
    },
    {
      title: '最后更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最后更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 160,
      render: (_: unknown, record: AssetBrand) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetailBrand(record.id)}>详情</Button>
          <Button type="link" size="small" onClick={() => onEditBrand(record.id)}>修改</Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteBrand(record)}>删除</Button>
        </Space>
      ),
    },
  ]

  /* ── 产品表格列 ─ */
  const productColumns: TableColumnsType<AssetModel> = [
    {
      title: '产品名称', dataIndex: 'name', key: 'name', width: 220, ellipsis: true,
    },
    {
      title: '型号编码', dataIndex: 'modelNo', key: 'modelNo', width: 160,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '品牌', key: 'brand', width: 150,
      render: (_: unknown, r: AssetModel) => (
        <span>{r.brandZh}</span>
      ),
    },
    { title: t('asset.colUnit'), dataIndex: 'unit', key: 'unit', width: 70 },
    {
      title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最后更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '最后更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 160,
      render: (_: unknown, record: AssetModel) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetailProduct(record.id)}>详情</Button>
          <Button type="link" size="small" onClick={() => onEditProduct(record.id)}>修改</Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteProduct(record)}>删除</Button>
        </Space>
      ),
    },
  ]

  const selectedCategory = categories.find(c => c.id === selectedCatId)
  const selectedBrand = brands.find(b => b.id === selectedBrandId)

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
            onSelect={handleTreeSelect}
          />
        </div>

        {/* 右侧主区 */}
        <div className="cat-main">
          {/* 面包屑导航 */}
          <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8C8C8C' }}>
            <FolderOutlined style={{ color: '#E8720C' }} />
            <span>{selectedCategory?.name || '全部'}</span>
            {selectedBrand && (
              <>
                <span>/</span>
                <ShopOutlined style={{ color: '#E8720C' }} />
                <span style={{ color: '#262626', fontWeight: 600 }}>{selectedBrand.brandZh}</span>
              </>
            )}
          </div>

          {/* 搜索区（品牌视图） */}
          {viewMode === 'brands' && (
            <div className="search-section">
              <Form form={brandForm} layout="inline">
                <Form.Item label="品牌名称" name="brandZh">
                  <Input placeholder="请输入品牌名称" allowClear onPressEnter={handleBrandSearch} />
                </Form.Item>
                <Form.Item label="最后更新人" name="updatedBy">
                  <Input placeholder="请输入最后更新人" allowClear onPressEnter={handleBrandSearch} />
                </Form.Item>
                <Form.Item label="最后更新时间" name="updatedAtRange">
                  <DatePicker.RangePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item>
                  <div className="search-actions">
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleBrandSearch}>{t('common.search')}</Button>
                    <Button icon={<ReloadOutlined />} onClick={handleBrandReset}>{t('common.reset')}</Button>
                  </div>
                </Form.Item>
              </Form>
            </div>
          )}

          {/* 搜索区（产品视图） */}
          {viewMode === 'products' && (
            <div className="search-section">
              <Form form={form} layout="inline">
                <Form.Item label="产品名称" name="name">
                  <Input placeholder="请输入产品名称" allowClear onPressEnter={handleSearch} />
                </Form.Item>
                <Form.Item label="最后更新人" name="updatedBy">
                  <Input placeholder="请输入最后更新人" allowClear onPressEnter={handleSearch} />
                </Form.Item>
                <Form.Item label="最后更新时间" name="updatedAtRange">
                  <DatePicker.RangePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item>
                  <div className="search-actions">
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
                    <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
                  </div>
                </Form.Item>
              </Form>
            </div>
          )}

          {/* 操作区 */}
          <div className="action-section">
            <div className="action-section-left">
              {viewMode === 'products' && selectedBrand && (
                <Button
                  type="link"
                  size="small"
                  icon={<ShopOutlined />}
                  onClick={() => { setSelectedBrandId(undefined); setViewMode('brands'); if (selectedCatId) { const cat = categories.find(c => c.id === selectedCatId); loadBrands(cat?.code) } }}
                >
                  返回品牌列表
                </Button>
              )}
            </div>
            <div className="action-section-right">
              {viewMode === 'brands' && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddBrand(selectedCategory?.code || '')}>
                  新增品牌
                </Button>
              )}
              {viewMode === 'products' && selectedBrand && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => onAddProduct(selectedBrand.categoryCode, selectedBrand.id)}>
                  新增产品
                </Button>
              )}
            </div>
          </div>

          {/* 提示文字 */}
          {viewMode === 'brands' && brands.length > 0 && (
            <div style={{ padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#D46B08' }}>
              💡 点击品牌行可查看该品牌下的产品列表
            </div>
          )}

          {/* 表格 */}
          {viewMode === 'brands' ? (
            <Table<AssetBrand>
              columns={brandColumns}
              dataSource={brands}
              rowKey="id"
              loading={loading}
              size="middle"
              pagination={false}
              onRow={(record) => ({
                onClick: () => handleBrandClick(record),
                style: {
                  cursor: 'pointer',
                  background: selectedBrandId === record.id ? '#FFF7E6' : undefined,
                },
              })}
            />
          ) : (
            <Table<AssetModel>
              columns={productColumns}
              dataSource={products}
              rowKey="id"
              loading={loading}
              size="middle"
              pagination={{
                current: page, pageSize: size, total, showSizeChanger: true,
                showTotal: (tt) => `${t('common.total', { count: tt })}`,
              }}
              onChange={handleTableChange}
            />
          )}
        </div>
      </div>
    </>
  )
}
