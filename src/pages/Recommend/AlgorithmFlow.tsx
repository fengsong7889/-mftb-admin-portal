import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Space, Tag, Tooltip, message } from 'antd'
import { ArrowLeftOutlined, ZoomInOutlined, ZoomOutOutlined, ExpandOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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

  // ── 阶段4：广告购买 ──
  { id: 'stg4', type: 'stage', position: { x: 220, y: 790 }, data: { label: '階段四：廣告購買（商家操作）', desc: '商家端操作', color: '#FA8C16' } },
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

/* ===== 主组件 ===== */
export default function AlgorithmFlow() {
  const navigate = useNavigate()

  // 从 localStorage 加载已保存的位置
  const loadSavedPositions = useCallback((): Record<string, { x: number; y: number }> | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }, [])

  // 初始化节点：合并已保存的位置
  const getInitialNodes = useCallback(() => {
    const saved = loadSavedPositions()
    if (!saved) return initialNodes
    return initialNodes.map(node => ({
      ...node,
      position: saved[node.id] || node.position,
    }))
  }, [loadSavedPositions])

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes())
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)
  const [hasChanges, setHasChanges] = useState(false)

  // 节点拖动后保存位置
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    const dragChanges = changes.filter((c: any) => c.type === 'position' && c.dragging === false)
    if (dragChanges.length > 0) {
      setHasChanges(true)
    }
  }, [onNodesChange])

  // 保存位置到 localStorage
  const handleSave = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    nodes.forEach(node => {
      positions[node.id] = node.position
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
    setHasChanges(false)
    message.success('位置已保存')
  }, [nodes])

  // 重置位置
  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setNodes(initialNodes)
    setHasChanges(false)
    message.info('已重置为默认位置')
  }, [setNodes])

  // 页面卸载前自动保存未保存的更改
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasChanges) {
        const positions: Record<string, { x: number; y: number }> = {}
        nodes.forEach(node => {
          positions[node.id] = node.position
        })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
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
          <Tag color="processing">交互式流程圖</Tag>
        </Space>
        <Space>
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
          提示：可拖拽畫布、滾輪縮放、拖動節點調整位置
        </span>
      </div>

      {/* React Flow 画布 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          proOptions={proOptions}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.4 }}
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
  )
}
