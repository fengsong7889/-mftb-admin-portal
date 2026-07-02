import { useCallback, useMemo } from 'react'
import { Button, Space, Tag, Tooltip } from 'antd'
import { ArrowLeftOutlined, ZoomInOutlined, ZoomOutOutlined, ExpandOutlined } from '@ant-design/icons'
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
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/** 节点样式类型 */
const nodeStyleMap: Record<string, { bg: string; border: string; color: string }> = {
  start: { bg: '#F6FFED', border: '#52C41A', color: '#389E0D' },
  end: { bg: '#FFF2E8', border: '#FA541C', color: '#CF1322' },
  process: { bg: '#E6F7FF', border: '#1890FF', color: '#096DD9' },
  decision: { bg: '#FFF7E6', border: '#FAAD14', color: '#D48806' },
  data: { bg: '#F9F0FF', border: '#722ED1', color: '#531DAB' },
  system: { bg: '#FFF0F6', border: '#EB2F96', color: '#C41D7F' },
}

/** 通用节点工厂 */
const createNode = (
  id: string,
  label: string,
  type: string,
  position: { x: number; y: number },
  description?: string
): Node => ({
  id,
  type: 'default',
  position,
  data: {
    label: (
      <div style={{
        padding: '10px 16px',
        borderRadius: 8,
        border: `2px solid ${nodeStyleMap[type]?.border || '#D9D9D9'}`,
        background: nodeStyleMap[type]?.bg || '#fff',
        minWidth: 140,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 500,
        color: nodeStyleMap[type]?.color || '#333',
      }}>
        <div>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 4, fontWeight: 400 }}>
            {description}
          </div>
        )}
      </div>
    ),
  },
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
})

/** 初始节点 - 算法推荐业务流程（待讨论完善） */
const initialNodes: Node[] = [
  // 第一行：入口
  createNode('1', '用戶發起請求', 'start', { x: 300, y: 0 }, 'APP/小程序/H5'),

  // 第二行：召回层
  createNode('2', '召回層', 'process', { x: 300, y: 100 }, '多路召回合并'),
  createNode('2a', '無敵星星召回', 'data', { x: 50, y: 210 }, '黃金坑位引流'),
  createNode('2b', '盤活復蘇召回', 'data', { x: 200, y: 210 }, '熱門商家激活'),
  createNode('2c', '新店廣告召回', 'data', { x: 350, y: 210 }, '新店專屬推廣'),
  createNode('2d', '猜你喜歡召回', 'data', { x: 500, y: 210 }, '個性化推薦'),

  // 第三行：排序层
  createNode('3', '排序層', 'process', { x: 300, y: 320 }, '粗排 → 精排 → 重排'),
  createNode('3a', '粗排配置', 'decision', { x: 120, y: 430 }, '快速篩選候選集'),
  createNode('3b', '精排配置', 'decision', { x: 300, y: 430 }, '精細化打分排序'),
  createNode('3c', '重排策略', 'decision', { x: 480, y: 430 }, '業務規則調整'),

  // 第四行：策略层
  createNode('4', '策略層', 'system', { x: 300, y: 540 }, '廣告策略編排'),
  createNode('4a', '時段策略', 'data', { x: 120, y: 650 }, '分時段投放規則'),
  createNode('4b', '廣告類型策略', 'data', { x: 300, y: 650 }, '類型匹配規則'),
  createNode('4c', 'A/B測試', 'data', { x: 480, y: 650 }, '實驗分流對比'),

  // 第五行：投放层
  createNode('5', '投放層', 'process', { x: 300, y: 760 }, '坑位分配與定價'),
  createNode('5a', '坑位管理', 'data', { x: 180, y: 870 }, '瀑布流策略配置'),
  createNode('5b', '定價策略', 'data', { x: 420, y: 870 }, '銷售定價規則'),

  // 第六行：结果
  createNode('6', '返回推薦結果', 'end', { x: 300, y: 980 }, '展示給用戶'),
]

/** 初始边 */
const initialEdges: Edge[] = [
  // 入口 → 召回
  { id: 'e1-2', source: '1', target: '2', animated: true, stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },

  // 召回 → 各召回源
  { id: 'e2-2a', source: '2', target: '2a', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-2b', source: '2', target: '2b', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-2c', source: '2', target: '2c', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-2d', source: '2', target: '2d', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },

  // 召回源 → 排序
  { id: 'e2a-3', source: '2a', target: '3', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2b-3', source: '2b', target: '3', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2c-3', source: '2c', target: '3', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2d-3', source: '2d', target: '3', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },

  // 排序 → 各排序阶段
  { id: 'e3-3a', source: '3', target: '3a', stroke: '#FAAD14', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-3b', source: '3', target: '3b', stroke: '#FAAD14', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-3c', source: '3', target: '3c', stroke: '#FAAD14', markerEnd: { type: MarkerType.ArrowClosed } },

  // 排序 → 策略
  { id: 'e3a-4', source: '3a', target: '4', stroke: '#EB2F96', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3b-4', source: '3b', target: '4', stroke: '#EB2F96', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3c-4', source: '3c', target: '4', stroke: '#EB2F96', markerEnd: { type: MarkerType.ArrowClosed } },

  // 策略 → 各策略
  { id: 'e4-4a', source: '4', target: '4a', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4-4b', source: '4', target: '4b', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4-4c', source: '4', target: '4c', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },

  // 策略 → 投放
  { id: 'e4a-5', source: '4a', target: '5', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4b-5', source: '4b', target: '5', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4c-5', source: '4c', target: '5', stroke: '#1890FF', markerEnd: { type: MarkerType.ArrowClosed } },

  // 投放 → 子模块
  { id: 'e5-5a', source: '5', target: '5a', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5-5b', source: '5', target: '5b', stroke: '#722ED1', markerEnd: { type: MarkerType.ArrowClosed } },

  // 投放 → 结果
  { id: 'e5a-6', source: '5a', target: '6', animated: true, stroke: '#FA541C', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5b-6', source: '5b', target: '6', animated: true, stroke: '#FA541C', markerEnd: { type: MarkerType.ArrowClosed } },
]

export default function AlgorithmFlow() {
  const navigate = useNavigate()
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

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
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回算法庫
          </Button>
        </Space>
      </div>

      {/* 图例 */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 24px',
        background: '#FAFAFA',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {[
          { label: '起始/結束', type: 'start' },
          { label: '處理流程', type: 'process' },
          { label: '配置/數據', type: 'data' },
          { label: '決策/判斷', type: 'decision' },
          { label: '系統模塊', type: 'system' },
        ].map(item => (
          <Space key={item.type} size={4}>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: nodeStyleMap[item.type].bg,
              border: `2px solid ${nodeStyleMap[item.type].border}`,
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          proOptions={proOptions}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        >
          <Background color="#e8e8e8" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const type = node.data?.label?.props?.children?.[0]?.props?.style?.border?.split(' ')[2] || '#D9D9D9'
              return type
            }}
            style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
