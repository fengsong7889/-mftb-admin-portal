import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Tabs, Button, Tag, Table, Alert, Divider, Space,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'

// ============================
// 類型定義（與 SearchVerify 共用）
// ============================

interface ScoreDetail {
  name: string
  score: number
  description: string
  enabled: boolean
}

interface DimensionScore {
  dimension: string
  score: number
  maxScore: number
  weight: number
  details: ScoreDetail[]
}

interface MerchantResult {
  key: string
  rank: number
  merchantName: string
  merchantId: string
  category: string
  totalScore: number
  dimensionScores: DimensionScore[]
  tags: string[]
}

// ============================
// Mock 數據（按 merchantId 查找）
// ============================

const MOCK_MERCHANTS: MerchantResult[] = [
  {
    key: '1', rank: 1, merchantName: '澳門正宗漢堡王', merchantId: 'M100001',
    category: '外賣-漢堡', totalScore: 892,
    tags: ['S級店鋪', '品牌連鎖', '金牌店標'],
    dimensionScores: [
      {
        dimension: '搜索詞匹配得分', score: 313, maxScore: 400, weight: 32,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中店名「漢堡」', enabled: true },
          { name: '精準匹配', score: 60, description: '模糊匹配命中', enabled: true },
          { name: '匹配商品所屬類目', score: 25, description: '命中漢堡類目', enabled: true },
          { name: '商家名稱命中', score: 50, description: '店名包含關鍵詞「漢堡」+50分', enabled: true },
          { name: '商家標籤命中', score: 22, description: '標籤匹配搜索詞 +22分', enabled: true },
          { name: '商品名稱命中', score: 50, description: '商品名包含「漢堡」+50分', enabled: true },
          { name: '商品類目匹配', score: 30, description: '漢堡類目匹配 +30分', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 280, maxScore: 400, weight: 26,
        details: [
          { name: '購買熱搜詞', score: 200, description: '商家購買「漢堡」熱搜詞 +200分', enabled: true },
          { name: '購買關鍵字', score: 80, description: '商家購買「漢堡包」關鍵字 +150分(權重×0.53)', enabled: true },
          { name: '廣告曝光', score: 0, description: '本期無廣告曝光', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 230, maxScore: 400, weight: 22,
        details: [
          { name: '店鋪等級S', score: 100, description: 'S級店鋪 +100分', enabled: true },
          { name: '店鋪口碑', score: 50, description: '口碑評分4.8 +50分', enabled: true },
          { name: '品牌連鎖', score: 35, description: '品牌連鎖店 +35分', enabled: true },
          { name: '金牌店標', score: 50, description: '金牌店標 +50分', enabled: true },
          { name: '月銷量', score: -5, description: '本月銷量排名中等', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 120, maxScore: 200, weight: 12,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '收藏過的店鋪', score: 30, description: '用戶收藏此店 +30分', enabled: true },
          { name: '經常購買', score: 40, description: '用戶經常購買此店 +40分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 77, maxScore: 100, weight: 8,
        details: [
          { name: '營業中加分', score: 20, description: '當前營業中 +20分', enabled: true },
          { name: '距離衰減', score: -5, description: '距離1.2km 衰減扣分', enabled: true },
          { name: '主營時段匹配', score: 15, description: '當前午餐時段匹配 +15分', enabled: true },
          { name: '商品可售', score: 10, description: '商品正常可售 +10分', enabled: true },
          { name: '暗推動態加分', score: 37, description: '暗推狀態良好 +37分', enabled: true },
        ],
      },
    ],
  },
  {
    key: '2', rank: 2, merchantName: '漢堡包工坊', merchantId: 'M100002',
    category: '外賣-漢堡', totalScore: 756,
    tags: ['A級店鋪', '獨家店標'],
    dimensionScores: [
      {
        dimension: '搜索詞匹配得分', score: 279, maxScore: 400, weight: 32,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中店名「漢堡包」', enabled: true },
          { name: '不分詞模糊匹配', score: 50, description: '原始輸入模糊匹配命中', enabled: true },
          { name: '匹配商品副標題', score: 20, description: '副標題命中', enabled: true },
          { name: '商家名稱命中', score: 50, description: '店名包含關鍵詞「漢堡包」+50分', enabled: true },
          { name: '商家標籤命中', score: 18, description: '標籤匹配搜索詞 +18分', enabled: true },
          { name: '商品名稱命中', score: 50, description: '商品名包含「漢堡包」+50分', enabled: true },
          { name: '商品類目匹配', score: 25, description: '漢堡類目匹配 +25分', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 180, maxScore: 400, weight: 26,
        details: [
          { name: '購買關鍵字', score: 150, description: '商家購買「漢堡包」關鍵字 +150分', enabled: true },
          { name: '活動免運費', score: 30, description: '參加免運費活動 +30分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 210, maxScore: 400, weight: 22,
        details: [
          { name: '店鋪等級A', score: 80, description: 'A級店鋪 +80分', enabled: true },
          { name: '店鋪口碑', score: 50, description: '口碑評分4.6 +50分', enabled: true },
          { name: '獨家店標', score: 45, description: '獨家店標 +45分', enabled: true },
          { name: '日銷量', score: 35, description: '日銷量排名前20% +35分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 100, maxScore: 200, weight: 12,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '最近購買', score: 50, description: '用戶近期購買過 +50分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 96, maxScore: 100, weight: 8,
        details: [
          { name: '營業中加分', score: 20, description: '當前營業中 +20分', enabled: true },
          { name: '距離衰減', score: 16, description: '距離0.5km 衰減較少', enabled: true },
          { name: '主營時段匹配', score: 15, description: '當前午餐時段匹配 +15分', enabled: true },
          { name: '商品可售', score: 10, description: '商品正常可售 +10分', enabled: true },
          { name: '暗推動態加分', score: 35, description: '暗推狀態良好 +35分', enabled: true },
        ],
      },
    ],
  },
  {
    key: '3', rank: 3, merchantName: '超級漢堡站', merchantId: 'M100003',
    category: '外賣-漢堡', totalScore: 645,
    tags: ['B級店鋪'],
    dimensionScores: [
      {
        dimension: '搜索詞匹配得分', score: 246, maxScore: 400, weight: 32,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中「漢堡」', enabled: true },
          { name: '不分詞模糊匹配', score: 60, description: '原始輸入模糊匹配命中', enabled: true },
          { name: '商家名稱命中', score: 50, description: '店名包含關鍵詞「漢堡」+50分', enabled: true },
          { name: '商家標籤命中', score: 12, description: '標籤匹配搜索詞 +12分', enabled: true },
          { name: '商品名稱命中', score: 50, description: '商品名包含「漢堡」+50分', enabled: true },
          { name: '商品類目匹配', score: 18, description: '漢堡類目匹配 +18分', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 100, maxScore: 400, weight: 26,
        details: [
          { name: '活動免運費', score: 50, description: '參加免運費活動 +50分', enabled: true },
          { name: '發紅包', score: 50, description: '發放滿減紅包 +50分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 180, maxScore: 400, weight: 22,
        details: [
          { name: '店鋪等級B', score: 60, description: 'B級店鋪 +60分', enabled: true },
          { name: '店鋪口碑', score: 40, description: '口碑評分4.2 +40分', enabled: true },
          { name: '月銷量', score: 40, description: '月銷量排名靠前 +40分', enabled: true },
          { name: '至低標識', score: 25, description: '至低標識 +25分', enabled: true },
          { name: '暗推動態加分', score: 15, description: '暗推狀態一般 +15分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 80, maxScore: 200, weight: 12,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '搜索過的關鍵字', score: 30, description: '用戶近期搜索相關詞 +30分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 85, maxScore: 100, weight: 8,
        details: [
          { name: '營業中加分', score: 20, description: '當前營業中 +20分', enabled: true },
          { name: '距離衰減', score: 25, description: '距離0.3km 衰減極少', enabled: true },
          { name: '主營時段匹配', score: 15, description: '當前午餐時段匹配 +15分', enabled: true },
          { name: '商品可售', score: 10, description: '商品正常可售 +10分', enabled: true },
          { name: '暗推動態加分', score: 30, description: '暗推狀態良好 +30分', enabled: true },
          { name: '超時未接單', score: 25, description: '無超時記錄 +25分', enabled: true },
        ],
      },
    ],
  },
  {
    key: '4', rank: 4, merchantName: '漢堡小子', merchantId: 'M100004',
    category: '外賣-漢堡', totalScore: 520,
    tags: ['C級店鋪'],
    dimensionScores: [
      {
        dimension: '搜索詞匹配得分', score: 245, maxScore: 400, weight: 32,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中「漢堡」', enabled: true },
          { name: '不分詞模糊匹配', score: 30, description: '模糊匹配部分命中', enabled: true },
          { name: '商家名稱命中', score: 50, description: '店名包含關鍵詞「漢堡」+50分', enabled: true },
          { name: '商家標籤命中', score: 5, description: '標籤部分匹配 +5分', enabled: true },
          { name: '商品名稱命中', score: 50, description: '商品名包含「漢堡」+50分', enabled: true },
          { name: '商品類目匹配', score: 10, description: '漢堡類目匹配 +10分', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 80, maxScore: 400, weight: 26,
        details: [
          { name: '發紅包', score: 50, description: '發放新人紅包 +50分', enabled: true },
          { name: '活動免運費', score: 30, description: '限時免運費 +30分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 150, maxScore: 400, weight: 22,
        details: [
          { name: '店鋪等級C', score: 40, description: 'C級店鋪 +40分', enabled: true },
          { name: '店鋪口碑', score: 30, description: '口碑評分3.8 +30分', enabled: true },
          { name: '月銷量', score: 30, description: '月銷量一般 +30分', enabled: true },
          { name: '格價標識', score: 25, description: '格價標識 +25分', enabled: true },
          { name: '暗推動態加分', score: 25, description: '暗推狀態一般 +25分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 60, maxScore: 200, weight: 12,
        details: [
          { name: '搜索過的關鍵字', score: 30, description: '用戶近期搜索相關詞 +30分', enabled: true },
          { name: '瀏覽過的店鋪', score: 30, description: '用戶偶爾瀏覽 +30分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 70, maxScore: 100, weight: 8,
        details: [
          { name: '營業中加分', score: 20, description: '當前營業中 +20分', enabled: true },
          { name: '距離衰減', score: 10, description: '距離2km 衰減較多', enabled: true },
          { name: '商品可售', score: 10, description: '商品正常可售 +10分', enabled: true },
          { name: '暗推動態加分', score: 20, description: '暗推狀態一般 +20分', enabled: true },
          { name: '超時未接單', score: -20, description: '有超時記錄 -20分', enabled: true },
        ],
      },
    ],
  },
]

// ============================
// 維度顏色
// ============================

const dimensionColors: Record<string, string> = {
  '搜索詞匹配得分': '#1890ff',
  '商業得分': '#faad14',
  '店鋪得分': '#52c41a',
  '用戶得分': '#722ed1',
  '平台得分': '#13c2c2',
}

// ============================
// 圓形儀表盤組件 (完整圓形設計)
// ============================

interface ThermometerProps {
  score: number
  maxScore: number
  dimension: string
  color: string
}

const Thermometer = ({ score, maxScore, dimension, color }: ThermometerProps) => {
  const pct = maxScore > 0 ? Math.min(Math.max((score / maxScore) * 100, 0), 100) : 0
  const [animatedPct, setAnimatedPct] = useState(0)
  const [animatedAngle, setAnimatedAngle] = useState(-60)
  
  // 指針動畫效果：從0開始緩慢旋轉
  useEffect(() => {
    // 延遲啟動動畫
    const timer = setTimeout(() => {
      const startAngle = -60
      const endAngle = 240
      const totalAngle = 300
      const targetAngle = startAngle + (totalAngle * pct) / 100
      
      // 使用 requestAnimationFrame 實現流暢動畫
      const duration = 3000 // 3秒動畫
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // 緩動函數: easeOutCubic
        const easeProgress = 1 - Math.pow(1 - progress, 3)
        
        const currentAngle = startAngle + (targetAngle - startAngle) * easeProgress
        const currentPct = pct * easeProgress
        
        setAnimatedAngle(currentAngle)
        setAnimatedPct(currentPct)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      requestAnimationFrame(animate)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [pct])
  
  // 仪表盤參數
  const size = 160
  const centerX = size / 2
  const centerY = size / 2
  const radius = 65
  
  // 角度計算 (從-60度到240度，共300度)
  const startAngle = -60
  const endAngle = 240
  const totalAngle = 300
  const currentAngle = animatedAngle
  
  // 角度轉弧度
  const degToRad = (deg: number) => (deg * Math.PI) / 180
  
  // 計算座標
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const angleRad = degToRad(angleDeg)
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    }
  }
  
  // 生成SVG路徑
  const describeArc = (cx: number, cy: number, r: number, start: number, end: number) => {
    const startPt = polarToCartesian(cx, cy, r, end)
    const endPt = polarToCartesian(cx, cy, r, start)
    const largeArcFlag = end - start <= 180 ? 0 : 1
    return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${endPt.x} ${endPt.y}`
  }
  
  // 計算指針位置
  const pointerPos = polarToCartesian(centerX, centerY, radius - 18, currentAngle)
  
  // 生成11根標記柱子 (0, 10, 20, ..., 100)
  const renderTicks = () => {
    const ticks = []
    for (let i = 0; i <= 100; i += 10) {
      const tickAngle = startAngle + (totalAngle * i) / 100
      const innerR = radius - 10
      const outerR = radius - 2
      const innerPos = polarToCartesian(centerX, centerY, innerR, tickAngle)
      const outerPos = polarToCartesian(centerX, centerY, outerR, tickAngle)
      
      // 根据分数选择颜色
      const tickColor = i <= animatedPct ? color : '#d9d9d9'
      
      ticks.push(
        <line
          key={i}
          x1={innerPos.x}
          y1={innerPos.y}
          x2={outerPos.x}
          y2={outerPos.y}
          stroke={tickColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )
    }
    return ticks
  }
  
  return (
    <div style={{ textAlign: 'center', minWidth: 220 }}>
      <div style={{ fontSize: 14, color: '#666', marginBottom: 16, fontWeight: 500 }}>
        {dimension}
      </div>
      
      {/* 仪表盤SVG - 包含得分框 */}
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size}>
          <defs>
            {/* 從0分到指針位置的漸變色 - 使用主題色 */}
            <linearGradient id={`grad-${dimension.replace(/\s/g, '')}`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          
          {/* 圆盤白色背景 */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="#fff"
            stroke="#e8e8e8"
            strokeWidth={2}
          />
          
          {/* 漸變色填充：從0分到指針位置 (動態跟隨指針) */}
          {animatedPct > 0 && (
            <path
              d={describeArc(centerX, centerY, radius - 2, startAngle, currentAngle)}
              fill="none"
              stroke={`url(#grad-${dimension.replace(/\s/g, '')})`}
              strokeWidth={8}
              strokeLinecap="round"
            />
          )}
          
          {/* 11根標記柱子 */}
          {renderTicks()}
          
          {/* 指針中心軸外環 */}
          <circle
            cx={centerX}
            cy={centerY}
            r={12}
            fill="#f5f5f5"
            stroke="#d9d9d9"
            strokeWidth={1.5}
          />
          
          {/* 指針中心軸内圓 */}
          <circle cx={centerX} cy={centerY} r={7} fill={color} />
          <circle cx={centerX} cy={centerY} r={3.5} fill="#fff" />
          
          {/* 指針 - 三角形 */}
          <polygon
            points={`${centerX},${centerY - 5} ${pointerPos.x},${pointerPos.y} ${centerX},${centerY + 5}`}
            fill={color}
            style={{
              transition: 'all 3s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
            }}
          />
        </svg>
        
        {/* 得分框 - 嵌入表盘顶部 */}
        <div style={{
          position: 'absolute',
          top: -15,
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          zIndex: 10,
        }}>
          {/* 标题: 得分/滿分 */}
          <div style={{
            fontSize: 9,
            color: '#999',
            marginBottom: 1,
          }}>
            得分/滿分
          </div>
          {/* 分数框 */}
          <div style={{
            background: '#fff',
            border: `1.5px solid ${color}`,
            borderRadius: 4,
            padding: '2px 8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.3,
            }}>
              <span style={{ color: color }}>{score}</span>
              <span style={{ color: '#999' }}>/{maxScore}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================
// 動感生成商家明細數據（與列表頁保持一致）
// ============================

// 商家名稱池（與列表頁 generateMerchantResults 一致）
const TAKEAWAY_NAMES = [
  '澳門正宗漢堡王', '漢堡包工坊', '超級漢堡站', '漢堡小子', '必勝客外賣',
  '壽司之神', '麻辣火鍋王', '珍珠奶茶專門店', '咖喱魚蛋檔', '葡撻皇',
  '水蟹粥大王', '酸辣粉之家', '煲仔飯老店', '楊枝甘露工坊', '雞蛋仔小站',
  '雲吞麵世家', '燒臘專門店', '炒粉小館', '甜品屋', '粥品專家',
  '快餐便当店', '日式拉麵', '泰式料理', '韓式炸雞', '西式簡餐',
]
const SUPERMARKET_NAMES = [
  '新苗超市', '來來超市', '泰豐超市', '萬利超市', '便利生活',
  '惠民超市', '百佳超市', '大生超市', '永華超市', '利源超市',
  '興發超市', '昌盛超市', '和記超市', '裕豐超市', '順利超市',
]
const GROUP_BUY_NAMES = [
  '威尼斯人團購', '金沙團購', '新濠團購', '銀河團購', '美高梅團購',
  '永利團購', '英皇團購', '星際團購', '金都團購', '皇冠團購',
]
const TAG_POOL = ['S級店鋪', 'A級店鋪', 'B級店鋪', 'C級店鋪', '品牌連鎖', '金牌店標', '獨家店標', '至低標識', '格價標識']

function generateMerchantDetail(merchantId: string): MerchantResult {
  // 根據ID確定性計算數值（每次進入產生相同結果）
  const seed = parseInt(merchantId.replace(/[^\d]/g, '')) || 1
  const pseudoRandom = (offset: number, min: number, max: number) => {
    const hash = ((seed * 2654435761 + offset * 40503) >>> 0) % 1000
    return min + Math.round((hash / 1000) * (max - min))
  }

  // 確定商家名稱與頻道
  let merchantName: string
  let businessChannel: string
  if (merchantId.startsWith('M')) {
    const idx = (seed - 100001) % TAKEAWAY_NAMES.length
    merchantName = TAKEAWAY_NAMES[idx]
    businessChannel = '外賣'
  } else if (merchantId.startsWith('S')) {
    const idx = (seed - 100001) % SUPERMARKET_NAMES.length
    merchantName = SUPERMARKET_NAMES[idx]
    businessChannel = '超市'
  } else {
    const idx = (seed - 100001) % GROUP_BUY_NAMES.length
    merchantName = GROUP_BUY_NAMES[idx]
    businessChannel = '團購'
  }

  const totalScore = pseudoRandom(0, 150, 900)
  const rel = Math.round(totalScore * 0.32)
  const com = Math.round(totalScore * 0.26)
  const sto = Math.round(totalScore * 0.22)
  const usr = Math.round(totalScore * 0.12)
  const plt = totalScore - rel - com - sto - usr

  const makeDetails = (dimName: string, score: number) => [
    { name: `${dimName}-基礎分`, score: Math.round(score * 0.6), description: `${dimName}基礎得分`, enabled: true },
    { name: `${dimName}-額外加分`, score: Math.round(score * 0.3), description: `${dimName}額外貢獻加分`, enabled: true },
    { name: `${dimName}-調整分`, score: score - Math.round(score * 0.6) - Math.round(score * 0.3), description: `${dimName}微調分`, enabled: true },
  ]

  const dimensionScores: DimensionScore[] = [
    { dimension: '搜索詞匹配得分', score: rel, maxScore: 400, weight: 32, details: makeDetails('搜索詞匹配', rel) },
    { dimension: '商業得分', score: com, maxScore: 400, weight: 26, details: makeDetails('商業', com) },
    { dimension: '店鋪得分', score: sto, maxScore: 400, weight: 22, details: makeDetails('店鋪', sto) },
    { dimension: '用戶得分', score: usr, maxScore: 200, weight: 12, details: makeDetails('用戶', usr) },
    { dimension: '平台得分', score: plt, maxScore: 100, weight: 8, details: makeDetails('平台', plt) },
  ]

  // 選擇標籤
  const tagCount = pseudoRandom(99, 1, 3)
  const tags = Array.from({ length: tagCount }, (_, i) => TAG_POOL[pseudoRandom(100 + i, 0, TAG_POOL.length - 1)])

  return {
    key: String(seed),
    rank: Math.max(1, Math.round((900 - totalScore) / 15)),
    merchantName,
    merchantId,
    category: `${businessChannel}`,
    totalScore,
    dimensionScores,
    tags,
  }
}

// ============================
// 主組件
// ============================

export default function SearchVerifyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [animationKey, setAnimationKey] = useState(0)

  // 優先查找靜態Mock數據，沒有則動態生成（確保每個商家都能查看明細）
  const merchant = MOCK_MERCHANTS.find(m => m.merchantId === id)
    || (id ? generateMerchantDetail(id) : undefined)

  if (!merchant) {
    return (
      <div className="content-area">
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 15, color: '#999', marginBottom: 16 }}>未找到該商家的得分數據</div>
          <Button type="primary" onClick={() => navigate('/search-verify')}>返回搜索校驗</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頁面標題欄 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/search-verify')}
          style={{ fontSize: 14 }}
        >
          返回
        </Button>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
            商家得分明細
          </h2>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            {merchant.merchantName}（{merchant.merchantId}）· {merchant.category}
          </div>
        </div>
      </div>

      {/* 總分概要卡片 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              textAlign: 'center', padding: '16px 32px',
              background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)',
              borderRadius: 12, minWidth: 130, cursor: 'pointer',
              transition: 'all 0.3s ease',
              border: '2px solid transparent',
            }}
            onClick={() => setAnimationKey((prev: number) => prev + 1)}
            onMouseEnter={(e) => {
              e.currentTarget.style.border = '2px solid #1890ff'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.border = '2px solid transparent'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 13, color: '#999', marginBottom: 6 }}>
              加權總分
              <span style={{ fontSize: 10, marginLeft: 4, color: '#1890ff', opacity: 0.6 }}>點擊刷新</span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, color: '#1890ff' }}>
              {merchant.dimensionScores.reduce((sum, ds) => sum + Math.round(ds.score * ds.weight / 100), 0)}
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>排名 第{merchant.rank}名</div>
          </div>
          <Divider type="vertical" style={{ height: 120 }} />
          <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-around' }}>
            {merchant.dimensionScores.map(ds => (
              <Thermometer
                key={`${ds.dimension}-${animationKey}`}
                score={ds.score}
                maxScore={ds.maxScore}
                dimension={ds.dimension}
                color={dimensionColors[ds.dimension] || '#999'}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* 權重公式計算展示 */}
      <Card title="權重公式計算" style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '20px' }}>
        {/* 計算公式說明 - 單行 */}
        <div style={{ 
          padding: '8px 16px', 
          background: '#f6ffed', 
          borderRadius: 6, 
          border: '1px solid #b7eb8f',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 13, color: '#52c41a', fontWeight: 600 }}>
            計算公式:
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            加權總分 = Σ（維度得分 × 權重比例）
          </div>
        </div>

        {/* 各維度加權得分 - 橫向排列 */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(5, 1fr)', 
          gap: 8,
          marginBottom: 16,
        }}>
          {merchant.dimensionScores.map((ds) => {
            const weightedScore = Math.round(ds.score * ds.weight / 100)
            return (
              <div
                key={ds.dimension}
                style={{
                  padding: '8px 10px',
                  background: '#fafafa',
                  borderRadius: 6,
                  border: `1.5px solid ${dimensionColors[ds.dimension]}30`,
                  textAlign: 'center',
                }}
              >
                {/* 維度名稱 */}
                <div style={{ 
                  fontSize: 11, 
                  fontWeight: 600, 
                  color: dimensionColors[ds.dimension],
                  marginBottom: 4,
                }}>
                  {ds.dimension.replace('得分', '')}
                </div>

                {/* 計算過程 - 單行 */}
                <div style={{ fontSize: 12, color: '#666' }}>
                  <span style={{ color: dimensionColors[ds.dimension], fontWeight: 600 }}>{ds.score}</span>
                  <span style={{ margin: '0 2px' }}>*</span>
                  <span>{ds.weight}%</span>
                  <span style={{ margin: '0 2px' }}>=</span>
                  <span style={{ 
                    color: dimensionColors[ds.dimension], 
                    fontWeight: 700, 
                    fontSize: 16,
                  }}>
                    {weightedScore}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 加權總分匯總 */}
        <div style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)',
          borderRadius: 8,
          border: '2px solid #1890ff',
        }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
            原始得分: {merchant.dimensionScores.map((ds) => ds.score).join(' + ')} = {merchant.dimensionScores.reduce((sum, ds) => sum + ds.score, 0)}
          </div>
          <div style={{ 
            fontSize: 14, 
            color: '#333', 
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              加權得分: {merchant.dimensionScores.map((ds) => {
                const weightedScore = Math.round(ds.score * ds.weight / 100)
                return (
                  <span key={ds.dimension} style={{ color: dimensionColors[ds.dimension], fontWeight: 700 }}>
                    {weightedScore}
                  </span>
                )
              }).reduce((prev, curr, idx) => (
                <>{prev}{idx > 0 && <span style={{ color: '#666', margin: '0 4px' }}>+</span>}{curr}</>
              ), <></>)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1890ff' }}>
              = {merchant.dimensionScores.reduce((sum, ds) => sum + Math.round(ds.score * ds.weight / 100), 0)}
            </div>
          </div>
        </div>
      </Card>

      {/* 維度 Tab 切換 */}
      <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: '0 16px 16px' }}>
        <Tabs
          defaultActiveKey={merchant.dimensionScores[0]?.dimension}
          type="card"
          items={merchant.dimensionScores.map(ds => ({
            key: ds.dimension,
            label: (
              <span>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: dimensionColors[ds.dimension] || '#999', marginRight: 6,
                }} />
                {ds.dimension}
                <span style={{
                  marginLeft: 6, padding: '1px 8px', borderRadius: 10, fontSize: 11,
                  background: dimensionColors[ds.dimension] || '#999', color: '#fff',
                }}>
                  {ds.score}/{ds.maxScore}
                </span>
              </span>
            ),
            children: (
              <div>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`${ds.dimension}：得分 ${ds.score} / ${ds.maxScore}，權重佔比 ${ds.weight}%`}
                />
                <Table
                  size="small"
                  pagination={false}
                  dataSource={ds.details.filter(d => d.enabled)}
                  columns={[
                    {
                      title: '計分项', dataIndex: 'name', width: 180,
                      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
                    },
                    {
                      title: '得分', dataIndex: 'score', width: 100, align: 'center',
                      render: (v: number) => (
                        <span style={{
                          fontWeight: 700, fontSize: 15,
                          color: v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : '#999',
                        }}>
                          {v > 0 ? '+' : ''}{v}
                        </span>
                      ),
                    },
                    {
                      title: '得分說明', dataIndex: 'description',
                      render: (v: string) => <span style={{ color: '#666' }}>{v}</span>,
                    },
                  ]}
                  rowKey="name"
                  summary={() => {
                    const total = ds.details.filter(d => d.enabled).reduce((sum, d) => sum + d.score, 0)
                    return (
                      <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                        <Table.Summary.Cell index={0}>小計</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="center">
                          <span style={{ color: '#1890ff', fontWeight: 700 }}>{total}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          <span style={{ color: '#999' }}>
                            {ds.dimension}維度共計 {ds.details.filter(d => d.enabled).length} 項計分因子
                          </span>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )
                  }}
                />
              </div>
            ),
          }))}
        />
      </Card>
    </div>
  )
}
