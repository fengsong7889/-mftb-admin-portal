import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Space, Tag, Tooltip, message, Modal, Input, Select, Popconfirm } from 'antd'
import {
  ArrowLeftOutlined, ZoomInOutlined, ZoomOutOutlined, ExpandOutlined,
  SaveOutlined, UndoOutlined, EditOutlined, EyeOutlined, PlusOutlined,
  DeleteOutlined, DragOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Position,
  MarkerType,
  Handle,
  type NodeProps,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/* ===== 专业流程图节点类型 ===== */

/** 开始/结束节点 - 椭圆胶囊形 */
function TerminalNode({ data }: NodeProps) {
  const isEnd = data.isEnd as boolean
  const desc = data.desc as string | undefined
  return (
    <div style={{
      padding: '10px 28px',
      borderRadius: 24,
      background: isEnd ? 'linear-gradient(135deg, #FFF1F0, #FFCCC7)' : 'linear-gradient(135deg, #F6FFED, #D9F7BE)',
      border: `2px solid ${isEnd ? '#FF4D4F' : '#52C41A'}`,
      textAlign: 'center',
      minWidth: 120,
      boxShadow: isEnd ? '0 2px 8px rgba(255,77,79,0.15)' : '0 2px 8px rgba(82,196,26,0.15)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: isEnd ? '#CF1322' : '#389E0D', letterSpacing: 2 }}>
        {data.label as string}
      </div>
      {desc ? <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{desc}</div> : null}
      <Handle type="source" position={Position.Bottom} style={{ background: isEnd ? '#FF4D4F' : '#52C41A' }} />
      <Handle type="target" position={Position.Top} style={{ background: isEnd ? '#FF4D4F' : '#52C41A' }} />
    </div>
  )
}

/** 阶段标题节点 - 横向色带 */
function StageNode({ data }: NodeProps) {
  const color = data.color as string
  const desc = data.desc as string | undefined
  return (
    <div style={{
      padding: '8px 24px',
      borderRadius: 6,
      background: `linear-gradient(90deg, ${color}12, ${color}08)`,
      border: `2px solid ${color}`,
      borderLeft: `6px solid ${color}`,
      textAlign: 'left',
      minWidth: 200,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{data.label as string}</div>
      {desc ? <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{desc}</div> : null}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
      <Handle type="target" position={Position.Top} style={{ background: color }} />
    </div>
  )
}

/** 流程步骤节点 - 标准矩形 */
function ProcessNode({ data }: NodeProps) {
  const color = data.color as string || '#1890FF'
  const icon = data.icon as string
  const desc = data.desc as string | undefined
  return (
    <div style={{
      padding: '10px 18px',
      borderRadius: 6,
      background: '#fff',
      border: `1.5px solid ${color}`,
      textAlign: 'center',
      minWidth: 130,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
        {data.label as string}
      </div>
      {desc ? <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 3 }}>{desc}</div> : null}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <Handle type="source" position={Position.Right} style={{ background: color }} />
      <Handle type="target" position={Position.Left} style={{ background: color }} />
    </div>
  )
}

/** 决策/判断节点 - 菱形效果 */
function DecisionNode({ data }: NodeProps) {
  const color = data.color as string || '#FAAD14'
  const desc = data.desc as string | undefined
  return (
    <div style={{
      padding: '10px 18px',
      borderRadius: 6,
      background: `linear-gradient(135deg, ${color}15, ${color}08)`,
      border: `2px solid ${color}`,
      textAlign: 'center',
      minWidth: 130,
      position: 'relative',
      boxShadow: `0 2px 6px ${color}25`,
    }}>
      <div style={{
        position: 'absolute', top: -1, right: -1,
        background: color, color: '#fff', fontSize: 10, padding: '1px 6px',
        borderRadius: '0 4px 0 4px', fontWeight: 600,
      }}>判斷</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
        {data.label as string}
      </div>
      {desc ? <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 3 }}>{desc}</div> : null}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <Handle type="source" position={Position.Right} style={{ background: color }} />
      <Handle type="target" position={Position.Left} style={{ background: color }} />
    </div>
  )
}

/** 系统自动处理节点 - 虚线边框 */
function SystemNode({ data }: NodeProps) {
  const desc = data.desc as string | undefined
  return (
    <div style={{
      padding: '10px 18px',
      borderRadius: 6,
      background: '#F9F0FF',
      border: '2px dashed #722ED1',
      textAlign: 'center',
      minWidth: 130,
      boxShadow: '0 1px 4px rgba(114,46,209,0.08)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#531DAB' }}>
        ⚙️ {data.label as string}
      </div>
      {desc ? <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 3 }}>{desc}</div> : null}
      <Handle type="source" position={Position.Bottom} style={{ background: '#722ED1' }} />
      <Handle type="target" position={Position.Top} style={{ background: '#722ED1' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#722ED1' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#722ED1' }} />
    </div>
  )
}

/** 自定义节点类型映射 */
const nodeTypes = {
  terminal: TerminalNode,
  stage: StageNode,
  process: ProcessNode,
  decision: DecisionNode,
  system: SystemNode,
}

/* ===== 构建节点 ===== */
const initialNodes: Node[] = [
  // ── 开始 ──
  { id: 'start', type: 'terminal', position: { x: 300, y: 0 }, data: { label: '開 始', desc: '運營人員登錄系統' }, sourcePosition: Position.Bottom },

  // ── 阶段1：算法库 ──
  { id: 'stg1', type: 'stage', position: { x: 220, y: 100 }, data: { label: '階段一：算法庫配置', desc: '運營人員操作', color: '#52C41A' } },
  { id: 'n1a', type: 'process', position: { x: 80, y: 210 }, data: { label: '創建算法', desc: '如：無敵星星', color: '#52C41A', icon: '📝' } },
  { id: 'n1b', type: 'process', position: { x: 280, y: 210 }, data: { label: '配置算法參數', desc: '召回/排序/策略規則', color: '#52C41A', icon: '⚙️' } },
  { id: 'n1c', type: 'decision', position: { x: 480, y: 210 }, data: { label: '啟用算法', desc: '狀態設為可用', color: '#52C41A' } },

  // ── 阶段2：瀑布流策略 ──
  { id: 'stg2', type: 'stage', position: { x: 220, y: 330 }, data: { label: '階段二：瀑布流策略配置', desc: '運營人員操作', color: '#1890FF' } },
  { id: 'n2a', type: 'process', position: { x: 80, y: 440 }, data: { label: '引用算法', desc: '選擇已創建的算法', color: '#1890FF', icon: '🔗' } },
  { id: 'n2b', type: 'process', position: { x: 280, y: 440 }, data: { label: '選擇瀑布流', desc: '如：大首頁瀑布流', color: '#1890FF', icon: '📋' } },
  { id: 'n2c', type: 'decision', position: { x: 480, y: 440 }, data: { label: '分配展示位', desc: '如：第2位或第5位', color: '#1890FF' } },

  // ── 阶段3：销售定价 ──
  { id: 'stg3', type: 'stage', position: { x: 220, y: 560 }, data: { label: '階段三：銷售定價配置', desc: '運營人員操作', color: '#EB2F96' } },
  { id: 'n3a', type: 'process', position: { x: 30, y: 670 }, data: { label: '新增廣告售賣', desc: '如：無敵星星類型', color: '#EB2F96', icon: '📦' } },
  { id: 'n3b', type: 'process', position: { x: 200, y: 670 }, data: { label: '選擇展示位', desc: '如：2號位', color: '#EB2F96', icon: '📍' } },
  { id: 'n3c', type: 'process', position: { x: 370, y: 670 }, data: { label: '選擇區域', desc: '威尼斯人/皇朝等', color: '#EB2F96', icon: '🗺️' } },
  { id: 'n3d', type: 'decision', position: { x: 540, y: 670 }, data: { label: '配置區域價格', desc: '每個區域單獨定價', color: '#EB2F96' } },

  // ── 阶段4：店铺推广 ──
  { id: 'stg4', type: 'stage', position: { x: 220, y: 790 }, data: { label: '階段四：店鋪推廣（商家操作）', desc: '商家端操作', color: '#FA8C16' } },
  { id: 'n4a', type: 'process', position: { x: 30, y: 900 }, data: { label: '選擇廣告類型', desc: '如：無敵星星', color: '#FA8C16', icon: '🏷️' } },
  { id: 'n4b', type: 'process', position: { x: 180, y: 900 }, data: { label: '選擇可購買活動', desc: '已上架的活動', color: '#FA8C16', icon: '🎯' } },
  { id: 'n4c', type: 'process', position: { x: 340, y: 900 }, data: { label: '選擇投放區域', desc: '商家所在區域', color: '#FA8C16', icon: '📍' } },
  { id: 'n4d', type: 'process', position: { x: 500, y: 900 }, data: { label: '選擇日期時段', desc: '某天某個時段', color: '#FA8C16', icon: '📅' } },
  { id: 'n4e', type: 'decision', position: { x: 300, y: 1010 }, data: { label: '提交並支付', desc: '訂單支付', color: '#FA8C16' } },

  // ── 阶段5：订单管理 ──
  { id: 'stg5', type: 'stage', position: { x: 220, y: 1120 }, data: { label: '階段五：訂單管理', desc: '系統自動 + 商家查看', color: '#722ED1' } },
  { id: 'n5a', type: 'process', position: { x: 150, y: 1230 }, data: { label: '訂單提交', desc: '支付完成', color: '#722ED1', icon: '📄' } },
  { id: 'n5b', type: 'system', position: { x: 380, y: 1230 }, data: { label: '系統推送', desc: '系統處理推送' } },
  { id: 'n5c', type: 'decision', position: { x: 260, y: 1340 }, data: { label: '推送完成', desc: '廣告上線', color: '#722ED1' } },

  // ── 阶段6：报表分析 ──
  { id: 'stg6', type: 'stage', position: { x: 220, y: 1450 }, data: { label: '階段六：報表分析', desc: '商家查看推廣效果', color: '#13C2C2' } },
  { id: 'n6a', type: 'process', position: { x: 80, y: 1560 }, data: { label: '數據概覽', desc: '整體推廣數據', color: '#13C2C2', icon: '📊' } },
  { id: 'n6b', type: 'process', position: { x: 280, y: 1560 }, data: { label: '訂單效果報表', desc: '訂單級別效果', color: '#13C2C2', icon: '📈' } },
  { id: 'n6c', type: 'process', position: { x: 480, y: 1560 }, data: { label: '類型對比', desc: '不同廣告類型對比', color: '#13C2C2', icon: '📉' } },

  // ── 结束 ──
  { id: 'end', type: 'terminal', position: { x: 300, y: 1680 }, data: { label: '結 束', desc: '流程完成', isEnd: true }, targetPosition: Position.Top },
]

/* ===== 构建边 ===== */
const edgeStyle = (color: string) => ({ stroke: color, strokeWidth: 2 })
const arrowEnd = (color: string) => ({ type: MarkerType.ArrowClosed, color, width: 16, height: 16 })

const initialEdges = [
  // 开始 → 阶段1
  { id: 'e-start', source: 'start', target: 'stg1', style: edgeStyle('#52C41A'), markerEnd: arrowEnd('#52C41A') },

  // 阶段1内部
  { id: 'e1a', source: 'stg1', target: 'n1a', style: edgeStyle('#52C41A'), markerEnd: arrowEnd('#52C41A') },
  { id: 'e1b', source: 'stg1', target: 'n1b', style: edgeStyle('#52C41A'), markerEnd: arrowEnd('#52C41A') },
  { id: 'e1c', source: 'stg1', target: 'n1c', style: edgeStyle('#52C41A'), markerEnd: arrowEnd('#52C41A') },

  // 阶段1 → 阶段2
  { id: 'e12', source: 'n1c', target: 'stg2', animated: true, style: edgeStyle('#1890FF'), markerEnd: arrowEnd('#1890FF'), label: '算法啟用後' },

  // 阶段2内部
  { id: 'e2a', source: 'stg2', target: 'n2a', style: edgeStyle('#1890FF'), markerEnd: arrowEnd('#1890FF') },
  { id: 'e2b', source: 'stg2', target: 'n2b', style: edgeStyle('#1890FF'), markerEnd: arrowEnd('#1890FF') },
  { id: 'e2c', source: 'stg2', target: 'n2c', style: edgeStyle('#1890FF'), markerEnd: arrowEnd('#1890FF') },

  // 阶段2 → 阶段3
  { id: 'e23', source: 'n2c', target: 'stg3', animated: true, style: edgeStyle('#EB2F96'), markerEnd: arrowEnd('#EB2F96'), label: '位置分配完成' },

  // 阶段3内部 - 链式流程
  { id: 'e3a', source: 'stg3', target: 'n3a', style: edgeStyle('#EB2F96'), markerEnd: arrowEnd('#EB2F96') },
  { id: 'e3ab', source: 'n3a', target: 'n3b', style: edgeStyle('#EB2F96'), markerEnd: arrowEnd('#EB2F96') },
  { id: 'e3bc', source: 'n3b', target: 'n3c', style: edgeStyle('#EB2F96'), markerEnd: arrowEnd('#EB2F96') },
  { id: 'e3cd', source: 'n3c', target: 'n3d', style: edgeStyle('#EB2F96'), markerEnd: arrowEnd('#EB2F96') },

  // 阶段3 → 阶段4
  { id: 'e34', source: 'n3d', target: 'stg4', animated: true, style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16'), label: '活動上架' },

  // 阶段4内部 - 链式流程
  { id: 'e4a', source: 'stg4', target: 'n4a', style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16') },
  { id: 'e4ab', source: 'n4a', target: 'n4b', style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16') },
  { id: 'e4bc', source: 'n4b', target: 'n4c', style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16') },
  { id: 'e4cd', source: 'n4c', target: 'n4d', style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16') },
  { id: 'e4de', source: 'n4d', target: 'n4e', style: edgeStyle('#FA8C16'), markerEnd: arrowEnd('#FA8C16') },

  // 阶段4 → 阶段5
  { id: 'e45', source: 'n4e', target: 'stg5', animated: true, style: edgeStyle('#722ED1'), markerEnd: arrowEnd('#722ED1'), label: '支付完成' },

  // 阶段5内部
  { id: 'e5a', source: 'stg5', target: 'n5a', style: edgeStyle('#722ED1'), markerEnd: arrowEnd('#722ED1') },
  { id: 'e5ab', source: 'n5a', target: 'n5b', style: edgeStyle('#722ED1'), markerEnd: arrowEnd('#722ED1') },
  { id: 'e5bc', source: 'n5b', target: 'n5c', style: edgeStyle('#722ED1'), markerEnd: arrowEnd('#722ED1') },

  // 阶段5 → 阶段6
  { id: 'e56', source: 'n5c', target: 'stg6', animated: true, style: edgeStyle('#13C2C2'), markerEnd: arrowEnd('#13C2C2'), label: '推送完成後' },

  // 阶段6内部
  { id: 'e6a', source: 'stg6', target: 'n6a', style: edgeStyle('#13C2C2'), markerEnd: arrowEnd('#13C2C2') },
  { id: 'e6b', source: 'stg6', target: 'n6b', style: edgeStyle('#13C2C2'), markerEnd: arrowEnd('#13C2C2') },
  { id: 'e6c', source: 'stg6', target: 'n6c', style: edgeStyle('#13C2C2'), markerEnd: arrowEnd('#13C2C2') },

  // 阶段6 → 结束
  { id: 'e-end', source: 'n6b', target: 'end', animated: true, style: edgeStyle('#FF4D4F'), markerEnd: arrowEnd('#FF4D4F') },
]

/* ===== localStorage 键名 ===== */
const STORAGE_KEY = 'algorithm-flow-node-positions'
const NODE_DATA_KEY = 'algorithm-flow-node-data'
const CUSTOM_NODES_KEY = 'algorithm-flow-custom-nodes'
const CUSTOM_EDGES_KEY = 'algorithm-flow-custom-edges'

/* ===== 节点面板配置 ===== */
const NODE_PALETTE = [
  { type: 'terminal', label: '開始/結束', icon: '🟢', color: '#52C41A', desc: '流程起止點' },
  { type: 'stage', label: '階段標題', icon: '📋', color: '#1890FF', desc: '階段分組標題' },
  { type: 'process', label: '流程步驟', icon: '📝', color: '#1890FF', desc: '具體操作步驟' },
  { type: 'decision', label: '決策/判斷', icon: '⚖️', color: '#FAAD14', desc: '判斷條件節點' },
  { type: 'system', label: '系統處理', icon: '⚙️', color: '#722ED1', desc: '系統自動處理' },
]

/* ===== 生成新節點 ID ===== */
let nodeIdCounter = 100
const genNodeId = () => `custom_${++nodeIdCounter}`

/* ===== 内部组件（使用 useReactFlow） ===== */
function FlowEditor() {
  const navigate = useNavigate()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const [messageApi, contextHolder] = message.useMessage()

  // 从 localStorage 加载已保存的位置和节点数据
  const loadSavedData = useCallback(() => {
    let positions: Record<string, { x: number; y: number }> | null = null
    let nodeDataMap: Record<string, { label?: string; desc?: string }> | null = null
    try {
      const savedPos = localStorage.getItem(STORAGE_KEY)
      positions = savedPos ? JSON.parse(savedPos) : null
    } catch { /* ignore */ }
    try {
      const savedData = localStorage.getItem(NODE_DATA_KEY)
      nodeDataMap = savedData ? JSON.parse(savedData) : null
    } catch { /* ignore */ }
    return { positions, nodeDataMap }
  }, [])

  // 初始化节点：合并已保存的位置和文字内容
  const getInitialNodes = useCallback(() => {
    const { positions, nodeDataMap } = loadSavedData()
    if (!positions && !nodeDataMap) return initialNodes
    return initialNodes.map(node => {
      const savedPos = positions?.[node.id]
      const savedData = nodeDataMap?.[node.id]
      return {
        ...node,
        position: savedPos || node.position,
        data: savedData ? { ...node.data, ...savedData } : node.data,
      }
    })
  }, [loadSavedData])

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [hasChanges, setHasChanges] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<{ id: string; label: string; desc: string } | null>(null)

  // 节点选择变化
  const handleSelectionChange = useCallback((params: any) => {
    const nodes = params.nodes || []
    setSelectedIds(nodes.map((n: Node) => n.id))
  }, [])

  // 节点拖动后标记变更
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    const dragChanges = changes.filter((c: any) => c.type === 'position' && c.dragging === false)
    if (dragChanges.length > 0) setHasChanges(true)
  }, [onNodesChange])

  // 删除选中节点
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    setNodes(nds => nds.filter(n => !selectedIds.includes(n.id)))
    setEdges(eds => eds.filter(e => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)))
    setSelectedIds([])
    setHasChanges(true)
    messageApi.success(`已刪除 ${selectedIds.length} 個節點`)
  }, [selectedIds, setNodes, setEdges, messageApi])

  // 双击节点编辑
  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setEditingNode({
      id: node.id,
      label: (node.data.label as string) || '',
      desc: (node.data.desc as string) || '',
    })
    setEditModalOpen(true)
  }, [])

  // 保存编辑
  const handleEditSave = useCallback(() => {
    if (!editingNode) return
    setNodes(nds => nds.map(n =>
      n.id === editingNode.id
        ? { ...n, data: { ...n.data, label: editingNode.label, desc: editingNode.desc || undefined } }
        : n
    ))
    setEditModalOpen(false)
    setEditingNode(null)
    setHasChanges(true)
    messageApi.success('節點已更新')
  }, [editingNode, setNodes, messageApi])

  // 拖拽添加节点
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow-type')
    const label = e.dataTransfer.getData('application/reactflow-label')
    if (!type || !reactFlowWrapper.current) return

    const position = screenToFlowPosition({
      x: e.clientX - reactFlowWrapper.current.getBoundingClientRect().left,
      y: e.clientY - reactFlowWrapper.current.getBoundingClientRect().top,
    })

    const paletteItem = NODE_PALETTE.find(p => p.type === type)
    const newNode: Node = {
      id: genNodeId(),
      type,
      position,
      data: {
        label,
        desc: paletteItem?.desc || '',
        color: paletteItem?.color || '#1890FF',
        icon: paletteItem?.icon || '',
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
    setNodes(nds => [...nds, newNode])
    setHasChanges(true)
    messageApi.success(`已添加「${label}」節點`)
  }, [screenToFlowPosition, setNodes, messageApi])

  // 键盘 Delete 删除
  useEffect(() => {
    if (!editMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0 && !editModalOpen) {
          handleDeleteSelected()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editMode, selectedIds, editModalOpen, handleDeleteSelected])

  // 保存位置和节点数据到 localStorage
  const handleSave = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const nodeDataMap: Record<string, { label?: string; desc?: string }> = {}
    nodes.forEach(node => {
      positions[node.id] = node.position
      nodeDataMap[node.id] = {
        label: node.data.label as string | undefined,
        desc: node.data.desc as string | undefined,
      }
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
    localStorage.setItem(NODE_DATA_KEY, JSON.stringify(nodeDataMap))
    setHasChanges(false)
    messageApi.success('已保存')
  }, [nodes, messageApi])

  // 重置位置和数据
  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(NODE_DATA_KEY)
    setNodes(initialNodes)
    setHasChanges(false)
    messageApi.info('已重置为默认位置')
  }, [setNodes, messageApi])

  // 页面卸载前自动保存未保存的更改
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasChanges) {
        const positions: Record<string, { x: number; y: number }> = {}
        const nodeDataMap: Record<string, { label?: string; desc?: string }> = {}
        nodes.forEach(node => {
          positions[node.id] = node.position
          nodeDataMap[node.id] = {
            label: node.data.label as string | undefined,
            desc: node.data.desc as string | undefined,
          }
        })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
        localStorage.setItem(NODE_DATA_KEY, JSON.stringify(nodeDataMap))
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges, nodes])

  const proOptions = useMemo(() => ({ hideAttribution: true }), [])

  const handleBack = useCallback(() => {
    navigate('/promotion-algorithm')
  }, [navigate])

  return (
    <div className="content-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 页面头部 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
      }}>
        <Space size={16}>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            <span style={{ marginRight: 8 }}>🔀</span>
            算法推薦業務流程
          </h2>
          <Tag color={editMode ? 'warning' : 'processing'}>{editMode ? '編輯模式' : '交互式流程圖'}</Tag>
        </Space>
        <Space>
          <Tooltip title={editMode ? '退出編輯' : '進入編輯'}>
            <Button
              type={editMode ? 'primary' : 'default'}
              icon={editMode ? <EyeOutlined /> : <EditOutlined />}
              onClick={() => { setEditMode(!editMode); setSelectedIds([]) }}
            />
          </Tooltip>
          {editMode && (
            <Popconfirm title="確定刪除選中節點？" onConfirm={handleDeleteSelected} disabled={selectedIds.length === 0}>
              <Tooltip title={`刪除選中 (${selectedIds.length})`}>
                <Button icon={<DeleteOutlined />} danger disabled={selectedIds.length === 0} />
              </Tooltip>
            </Popconfirm>
          )}
          <Tooltip title="縮小">
            <Button icon={<ZoomOutOutlined />} onClick={() => {}} />
          </Tooltip>
          <Tooltip title="放大">
            <Button icon={<ZoomInOutlined />} onClick={() => {}} />
          </Tooltip>
          <Tooltip title="適應屏幕">
            <Button icon={<ExpandOutlined />} onClick={() => {}} />
          </Tooltip>
          <Tooltip title="保存位置">
            <Button icon={<SaveOutlined />} onClick={handleSave} />
          </Tooltip>
          <Tooltip title="重置位置">
            <Button icon={<UndoOutlined />} onClick={handleReset} />
          </Tooltip>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回算法庫
          </Button>
        </Space>
      </div>

      {/* 图例 */}
      <div style={{
        display: 'flex',
        gap: 20,
        padding: '8px 24px',
        background: '#FAFAFA',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {[
          { label: '開始/結束', shape: 'ellipse', bg: '#F6FFED', border: '#52C41A' },
          { label: '階段標題', shape: 'rect', bg: '#F0F5FF', border: '#1890FF' },
          { label: '流程步驟', shape: 'rect', bg: '#FFFFFF', border: '#1890FF' },
          { label: '決策/判斷', shape: 'rect', bg: '#FFFBE6', border: '#FAAD14' },
          { label: '系統處理', shape: 'rect', bg: '#F9F0FF', border: '#722ED1', dashed: true },
        ].map(item => (
          <Space key={item.label} size={4}>
            <div style={{
              width: 16,
              height: 16,
              borderRadius: item.shape === 'ellipse' ? 8 : 3,
              background: item.bg,
              border: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.border}`,
            }} />
            <span style={{ fontSize: 12, color: '#595959' }}>{item.label}</span>
          </Space>
        ))}
        <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 'auto' }}>
          {editMode ? '編輯模式：從左側面板拖拽節點到畫布添加，雙擊節點編輯內容，選中後按 Delete 或點擊刪除按鈕移除' : '提示：可拖拽畫布、滾輪縮放、拖動節點調整位置'}
        </span>
      </div>

      {/* 主体区域：节点面板 + 画布 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* 节点面板（编辑模式显示） */}
        {editMode && (
          <div style={{
            width: 180,
            background: '#FAFAFA',
            borderRight: '1px solid #f0f0f0',
            padding: '12px 10px',
            overflowY: 'auto',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <DragOutlined /> 節點面板
            </div>
            <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 10 }}>
              拖拽到右側畫布添加節點
            </div>
            {NODE_PALETTE.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow-type', item.type)
                  e.dataTransfer.setData('application/reactflow-label', item.label)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                style={{
                  padding: '10px 12px',
                  marginBottom: 8,
                  borderRadius: 6,
                  background: '#fff',
                  border: `1.5px solid ${item.color}`,
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 2px 8px ${item.color}30`; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none' }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: '#8C8C8C' }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <div style={{
              marginTop: 16,
              padding: '8px 10px',
              background: '#FFF7E6',
              borderRadius: 6,
              border: '1px solid #FFD591',
              fontSize: 11,
              color: '#D46B08',
              lineHeight: 1.6,
            }}>
              💡 提示：雙擊已有節點可編輯標題和描述
            </div>
          </div>
        )}

        {/* React Flow 画布 */}
        <div
          ref={reactFlowWrapper}
          style={{ flex: 1, minHeight: 0 }}
          onDragOver={editMode ? handleDragOver : undefined}
          onDrop={editMode ? handleDrop : undefined}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDoubleClick={handleNodeDoubleClick}
            onSelectionChange={handleSelectionChange}
            nodeTypes={nodeTypes}
            proOptions={proOptions}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.2}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 0.4 }}
            nodesDraggable
            nodesConnectable={editMode}
          >
            <Background color="#e8e8e8" gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={() => '#E8720C'}
              style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
            />
          </ReactFlow>
        </div>
      </div>

      {/* 编辑节点弹窗 */}
      <Modal
        title="編輯節點"
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => { setEditModalOpen(false); setEditingNode(null) }}
        okText="保存"
        cancelText="取消"
        width={400}
      >
        {editingNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>節點標題</div>
              <Input
                value={editingNode.label}
                onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                placeholder="請輸入節點標題"
                maxLength={30}
                showCount
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>描述信息</div>
              <Input.TextArea
                value={editingNode.desc}
                onChange={(e) => setEditingNode({ ...editingNode, desc: e.target.value })}
                placeholder="請輸入描述信息（可選）"
                rows={2}
                maxLength={50}
                showCount
              />
            </div>
          </div>
        )}
      </Modal>
      {contextHolder}
    </div>
  )
}

/* ===== 导出组件（包裹 ReactFlowProvider） ===== */
export default function AlgorithmFlow() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}
