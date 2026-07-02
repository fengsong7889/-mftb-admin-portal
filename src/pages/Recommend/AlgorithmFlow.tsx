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

/** 初始节点 - 实际业务流程 */
const initialNodes: Node[] = [
  // ===== 阶段1：算法库 =====
  createNode('s1', '① 算法庫 - 配置廣告算法', 'start', { x: 250, y: 0 }, '運營人員操作'),
  createNode('1a', '創建算法', 'data', { x: 100, y: 110 }, '如：無敵星星'),
  createNode('1b', '配置算法參數', 'data', { x: 300, y: 110 }, '召回/排序/策略規則'),
  createNode('1c', '啟用算法', 'decision', { x: 500, y: 110 }, '狀態設為可用'),

  // ===== 阶段2：瀑布流策略 =====
  createNode('s2', '② 瀑布流策略 - 引用算法+分配位置', 'process', { x: 250, y: 230 }, '運營人員操作'),
  createNode('2a', '引用算法', 'data', { x: 100, y: 340 }, '選擇已創建的算法'),
  createNode('2b', '選擇瀑布流', 'data', { x: 300, y: 340 }, '如：大首頁瀑布流'),
  createNode('2c', '分配展示位', 'decision', { x: 500, y: 340 }, '如：第2位或第5位'),

  // ===== 阶段3：销售定价 =====
  createNode('s3', '③ 銷售定價 - 創建活動+配置價格', 'system', { x: 250, y: 460 }, '運營人員操作'),
  createNode('3a', '新增廣告售賣', 'data', { x: 0, y: 570 }, '如：無敵星星類型'),
  createNode('3b', '選擇展示位', 'data', { x: 170, y: 570 }, '如：2號位'),
  createNode('3c', '選擇區域', 'data', { x: 340, y: 570 }, '威尼斯人/皇朝/黑馬仕等'),
  createNode('3d', '配置區域價格', 'decision', { x: 510, y: 570 }, '每個區域單獨定價'),

  // ===== 阶段4：广告购买 =====
  createNode('s4', '④ 廣告購買 - 商家下單', 'start', { x: 250, y: 690 }, '商家操作'),
  createNode('4a', '選擇廣告類型', 'data', { x: 0, y: 800 }, '如：無敵星星'),
  createNode('4b', '選擇可購買活動', 'data', { x: 170, y: 800 }, '已上架的活動'),
  createNode('4c', '選擇投放區域', 'data', { x: 340, y: 800 }, '商家所在區域'),
  createNode('4d', '選擇日期時段', 'data', { x: 510, y: 800 }, '某天某個時段'),
  createNode('4e', '提交並支付', 'decision', { x: 250, y: 910 }, '訂單支付'),

  // ===== 阶段5：订单管理 =====
  createNode('s5', '⑤ 訂單管理 - 推送狀態', 'process', { x: 250, y: 1020 }, '系統自動 + 商家查看'),
  createNode('5a', '訂單提交', 'data', { x: 130, y: 1130 }, '支付完成'),
  createNode('5b', '系統推送', 'system', { x: 370, y: 1130 }, '系統處理推送'),
  createNode('5c', '推送完成', 'end', { x: 250, y: 1240 }, '廣告上線'),

  // ===== 阶段6：报表分析 =====
  createNode('s6', '⑥ 報表分析 - 推廣效果', 'end', { x: 250, y: 1350 }, '商家查看'),
  createNode('6a', '數據概覽', 'data', { x: 100, y: 1460 }, '整體推廣數據'),
  createNode('6b', '訂單效果報表', 'data', { x: 300, y: 1460 }, '訂單級別效果'),
  createNode('6c', '類型對比', 'data', { x: 500, y: 1460 }, '不同廣告類型對比'),
]

/** 初始边 */
const initialEdges = [
  // 阶段1：算法库内部
  { id: 'es1-1a', source: 's1', target: '1a', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es1-1b', source: 's1', target: '1b', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es1-1c', source: 's1', target: '1c', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },

  // 阶段1 → 阶段2
  { id: 'e1c-s2', source: '1c', target: 's2', animated: true, style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed }, label: '算法啟用後' },

  // 阶段2：瀑布流策略内部
  { id: 'es2-2a', source: 's2', target: '2a', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es2-2b', source: 's2', target: '2b', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es2-2c', source: 's2', target: '2c', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },

  // 阶段2 → 阶段3
  { id: 'e2c-s3', source: '2c', target: 's3', animated: true, style: { stroke: '#722ED1' }, markerEnd: { type: MarkerType.ArrowClosed }, label: '位置分配完成' },

  // 阶段3：销售定价内部
  { id: 'es3-3a', source: 's3', target: '3a', style: { stroke: '#EB2F96' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3a-3b', source: '3a', target: '3b', style: { stroke: '#EB2F96' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3b-3c', source: '3b', target: '3c', style: { stroke: '#EB2F96' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3c-3d', source: '3c', target: '3d', style: { stroke: '#EB2F96' }, markerEnd: { type: MarkerType.ArrowClosed } },

  // 阶段3 → 阶段4
  { id: 'e3d-s4', source: '3d', target: 's4', animated: true, style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed }, label: '活動上架' },

  // 阶段4：广告购买内部
  { id: 'es4-4a', source: 's4', target: '4a', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4a-4b', source: '4a', target: '4b', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4b-4c', source: '4b', target: '4c', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4c-4d', source: '4c', target: '4d', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e4d-4e', source: '4d', target: '4e', style: { stroke: '#52C41A' }, markerEnd: { type: MarkerType.ArrowClosed } },

  // 阶段4 → 阶段5
  { id: 'e4e-s5', source: '4e', target: 's5', animated: true, style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed }, label: '支付完成' },

  // 阶段5：订单管理内部
  { id: 'es5-5a', source: 's5', target: '5a', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5a-5b', source: '5a', target: '5b', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e5b-5c', source: '5b', target: '5c', style: { stroke: '#1890FF' }, markerEnd: { type: MarkerType.ArrowClosed } },

  // 阶段5 → 阶段6
  { id: 'e5c-s6', source: '5c', target: 's6', animated: true, style: { stroke: '#FA541C' }, markerEnd: { type: MarkerType.ArrowClosed }, label: '推送完成後' },

  // 阶段6：报表分析内部
  { id: 'es6-6a', source: 's6', target: '6a', style: { stroke: '#FA541C' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es6-6b', source: 's6', target: '6b', style: { stroke: '#FA541C' }, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'es6-6c', source: 's6', target: '6c', style: { stroke: '#FA541C' }, markerEnd: { type: MarkerType.ArrowClosed } },
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
          defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
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
