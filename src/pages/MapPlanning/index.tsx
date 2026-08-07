import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Tree, Button, Space, Modal, Form, Input, Select, message, Switch, Popconfirm, Tag } from 'antd'
import { PlusOutlined, DeleteOutlined, DownOutlined, EditOutlined } from '@ant-design/icons'
import { MapContainer, TileLayer, Polygon } from 'react-leaflet'
import type { DataNode } from 'antd/es/tree'
import 'leaflet/dist/leaflet.css'

/** 修复Leaflet默认图标路径问题 */
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png?url'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png?url'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png?url'

const DefaultIcon = L.icon({
  iconUrl: iconUrl,
  iconRetinaUrl: iconRetinaUrl,
  shadowUrl: shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

/** 区域数据接口 */
interface RegionNode {
  id: number
  title: string
  level: 1 | 2
  parentId: number | null
  status: 'active' | 'inactive'
  children?: RegionNode[]
  coordinates?: Array<[number, number]>
}

/** 模拟树形数据 */
const mockTreeData: RegionNode[] = [
  {
    id: 1,
    title: '澳門區域',
    level: 1,
    parentId: null,
    status: 'active',
    coordinates: [],
    children: [
      {
        id: 2,
        title: '黑沙環區',
        level: 2,
        parentId: 1,
        status: 'active',
        coordinates: [],
      },
      {
        id: 3,
        title: '高士德區',
        level: 2,
        parentId: 1,
        status: 'active',
        coordinates: [],
      },
      {
        id: 4,
        title: '新馬路區',
        level: 2,
        parentId: 1,
        status: 'active',
        coordinates: [],
      },
      {
        id: 5,
        title: '新皇朝區',
        level: 2,
        parentId: 1,
        status: 'active',
        coordinates: [],
      },
      {
        id: 6,
        title: '港珠澳區',
        level: 2,
        parentId: 1,
        status: 'active',
        coordinates: [],
      },
    ],
  },
  {
    id: 7,
    title: '氹仔區域',
    level: 1,
    parentId: null,
    status: 'active',
    coordinates: [],
    children: [
      {
        id: 8,
        title: '花城市區',
        level: 2,
        parentId: 7,
        status: 'active',
        coordinates: [],
      },
      {
        id: 9,
        title: '北安機場',
        level: 2,
        parentId: 7,
        status: 'active',
        coordinates: [],
      },
      {
        id: 10,
        title: '左酒店區',
        level: 2,
        parentId: 7,
        status: 'active',
        coordinates: [],
      },
      {
        id: 11,
        title: '右酒店區',
        level: 2,
        parentId: 7,
        status: 'active',
        coordinates: [],
      },
      {
        id: 12,
        title: '澳大專區',
        level: 2,
        parentId: 7,
        status: 'active',
        coordinates: [],
      },
      {
        id: 13,
        title: '黑沙灘區',
        level: 2,
        parentId: 7,
        status: 'inactive',
        coordinates: [],
      },
    ],
  },
]

const MapPlanning: React.FC = () => {
  const { t } = useTranslation('common')
  const [treeData, setTreeData] = useState<RegionNode[]>(mockTreeData)
  const [selectedNode, setSelectedNode] = useState<RegionNode | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add-level1' | 'add-level2' | 'edit'>('add-level1')
  const [currentParent, setCurrentParent] = useState<RegionNode | null>(null)
  const [form] = Form.useForm()
  const [polygonCoords, setPolygonCoords] = useState<Array<[number, number]>>([])

  /** 将树形数据转换为Tree组件需要的格式 */
  const convertToTreeData = (nodes: RegionNode[]): DataNode[] => {
    return nodes.map((node) => ({
      key: String(node.id),
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 8 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.level === 1 ? (
              <>
                <span style={{ color: '#1890ff', fontWeight: 600 }}>{t('regionTag')}</span>
                <span>{node.title}</span>
              </>
            ) : (
              <>
                <span style={{ color: '#52c41a', fontWeight: 500 }}>{t('bizTag')}</span>
                <span>{node.title}</span>
              </>
            )}
          </span>
          {node.level === 1 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 140, justifyContent: 'flex-end', paddingLeft: 16 }}>
              <Switch
                size="small"
                checked={node.status === 'active'}
                onChange={(checked) => handleToggleStatus(node, checked)}
                style={{ width: 32 }}
              />
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit(node)
                }}
                style={{ padding: '0 4px', minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleAddLevel2(node)
                }}
                style={{ padding: '0 4px', minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
              <Popconfirm
                title={t('confirmDelete')}
                description={t('deleteRegionWithChildren', { name: node.title })}
                onConfirm={(e) => {
                  e?.stopPropagation()
                  handleDelete(node)
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText={t('confirm')}
                cancelText={t('cancel')}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: '0 4px', minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                />
              </Popconfirm>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 100, justifyContent: 'flex-end', paddingLeft: 16 }}>
              <Switch
                size="small"
                checked={node.status === 'active'}
                onChange={(checked) => handleToggleStatus(node, checked)}
                style={{ width: 32 }}
              />
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit(node)
                }}
                style={{ padding: '0 4px', minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
              <Popconfirm
                title={t('confirmDelete')}
                description={t('deleteRegionConfirm', { name: node.title })}
                onConfirm={(e) => {
                  e?.stopPropagation()
                  handleDelete(node)
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText={t('confirm')}
                cancelText={t('cancel')}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: '0 4px', minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                />
              </Popconfirm>
            </div>
          )}
        </div>
      ),
      children: node.children ? convertToTreeData(node.children) : undefined,
    }))
  }

  /** 查找节点 */
  const findNode = (nodes: RegionNode[], id: number): RegionNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  /** 选择树节点 */
  const handleSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      const nodeId = Number(selectedKeys[0])
      const node = findNode(treeData, nodeId)
      setSelectedNode(node)
      if (node?.coordinates && node.coordinates.length > 0) {
        setPolygonCoords(node.coordinates)
      } else {
        setPolygonCoords([])
      }
    } else {
      setSelectedNode(null)
      setPolygonCoords([])
    }
  }

  /** 新增一级区域 */
  const handleAddLevel1 = () => {
    setModalMode('add-level1')
    setCurrentParent(null)
    form.resetFields()
    setModalVisible(true)
  }

  /** 新增二级区域 */
  const handleAddLevel2 = (parentNode: RegionNode) => {
    setModalMode('add-level2')
    setCurrentParent(parentNode)
    form.resetFields()
    form.setFieldsValue({ parentId: parentNode.id })
    setModalVisible(true)
  }

  /** 编辑区域 */
  const handleEdit = (node: RegionNode) => {
    setModalMode('edit')
    setCurrentParent(node.parentId ? findNode(treeData, node.parentId) : null)
    form.resetFields()
    form.setFieldsValue({
      title: node.title,
      status: node.status,
      parentId: node.parentId,
    })
    setModalVisible(true)
  }

  /** 切换状态 */
  const handleToggleStatus = (node: RegionNode, checked: boolean) => {
    const updateNodeStatus = (nodes: RegionNode[]): RegionNode[] => {
      return nodes.map((n) => {
        if (n.id === node.id) {
          return { ...n, status: checked ? 'active' : 'inactive' }
        }
        if (n.children) {
          return { ...n, children: updateNodeStatus(n.children) }
        }
        return n
      })
    }
    
    setTreeData(updateNodeStatus(treeData))
    message.success(t(checked ? 'regionEnabled' : 'regionDisabled', { name: node.title }))
  }

  /** 删除区域 */
  const handleDelete = (node: RegionNode) => {
    const deleteNode = (nodes: RegionNode[]): RegionNode[] => {
      return nodes
        .filter((n) => n.id !== node.id)
        .map((n) => ({
          ...n,
          children: n.children ? deleteNode(n.children) : undefined,
        }))
    }
    
    setTreeData(deleteNode(treeData))
    if (selectedNode?.id === node.id) {
      setSelectedNode(null)
      setPolygonCoords([])
    }
    message.success(t('deleteRegionSuccess', { name: node.title }))
  }

  /** 提交表单 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      
      // 编辑模式
      if (modalMode === 'edit') {
        const updateNode = (nodes: RegionNode[]): RegionNode[] => {
          return nodes.map((n) => {
            if (n.id === selectedNode?.id) {
              return {
                ...n,
                title: values.title,
                status: values.status,
              }
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) }
            }
            return n
          })
        }
        
        setTreeData(updateNode(treeData))
        if (selectedNode) {
          setSelectedNode({ ...selectedNode, title: values.title, status: values.status })
        }
        message.success(t('updateRegionSuccess'))
        setModalVisible(false)
        form.resetFields()
        return
      }
      
      // 新增模式
      const newNode: RegionNode = {
        id: Date.now(),
        title: values.title,
        level: modalMode === 'add-level1' ? 1 : 2,
        parentId: modalMode === 'add-level2' ? values.parentId : null,
        status: values.status,
        coordinates: [],
      }

      if (modalMode === 'add-level1') {
        setTreeData([...treeData, newNode])
      } else if (modalMode === 'add-level2' && currentParent) {
        const addChild = (nodes: RegionNode[]): RegionNode[] => {
          return nodes.map((n) => {
            if (n.id === currentParent.id) {
              return { ...n, children: [...(n.children || []), newNode] }
            }
            if (n.children) {
              return { ...n, children: addChild(n.children) }
            }
            return n
          })
        }
        setTreeData(addChild(treeData))
      }

      message.success(t('addRegionSuccess'))
      setModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表單驗證失敗:', error)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 180px)' }}>
      {/* 左侧树形结构 */}
      <Card
        title={t('regionMgmt')}
        style={{ width: 350, flexShrink: 0 }}
      >
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <Input.Search placeholder={t('searchRegion')} allowClear style={{ flex: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddLevel1}>
            {t('add')}
          </Button>
        </div>
        
        <Tree
          treeData={convertToTreeData(treeData)}
          onSelect={handleSelect}
          defaultExpandAll
          showIcon={false}
          switcherIcon={<DownOutlined />}
        />

        {selectedNode && (
          <Card size="small" style={{ marginTop: 16 }} title={t('regionInfo')}>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div><strong>{t('regionNameLabel')}</strong> {selectedNode.title}</div>
              <div><strong>{t('regionLevel')}</strong> {selectedNode.level === 1 ? t('level1Region') : t('level2Region')}</div>
              {selectedNode.parentId && (
                <div><strong>{t('parentRegion')}</strong> {findNode(treeData, selectedNode.parentId)?.title}</div>
              )}
              <div><strong>{t('statusLabel')}</strong> {selectedNode.status === 'active' ? t('active') : t('inactive')}</div>
            </div>
          </Card>
        )}
      </Card>

      {/* 右侧地图区域 */}
      <Card
        title={
          <Space>
            <span>{t('mapFence')}</span>
            {selectedNode && (
              <Tag color="blue">{selectedNode.title}</Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <span style={{ fontSize: 12, color: '#999' }}>
              {polygonCoords.length > 0 ? t('drawnPoints', { count: polygonCoords.length }) : t('notDrawn')}
            </span>
          </Space>
        }
        style={{ flex: 1 }}
        bodyStyle={{ padding: 0, height: 'calc(100% - 57px)' }}
      >
        <MapContainer
          center={[22.1987, 113.5439]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.amap.com/">高德地图</a>'
            url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
            subdomains="1234"
          />
          {polygonCoords.length > 2 && (
            <Polygon positions={polygonCoords} color="blue" />
          )}
        </MapContainer>
      </Card>

      {/* 新增/编辑模态框 */}
      <Modal
        title={
          modalMode === 'add-level1'
            ? t('addLevel1Region')
            : modalMode === 'add-level2'
            ? t('addLevel2Region')
            : t('editRegion')
        }
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText={t('confirm')}
        cancelText={t('cancel')}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('regionNameField')}
            name="title"
            rules={[{ required: true, message: t('inputRegionName') }]}
          >
            <Input placeholder={t('inputRegionName')} />
          </Form.Item>

          {modalMode === 'add-level2' && (
            <Form.Item
              label={t('parentRegionField')}
              name="parentId"
            >
              <Input disabled value={currentParent?.title} />
            </Form.Item>
          )}

          <Form.Item
            label={t('statusField')}
            name="status"
            rules={[{ required: true, message: t('selectStatus') }]}
          >
            <Select
              placeholder={t('selectStatus')}
              options={[
                { label: t('active'), value: 'active' },
                { label: t('inactive'), value: 'inactive' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MapPlanning
