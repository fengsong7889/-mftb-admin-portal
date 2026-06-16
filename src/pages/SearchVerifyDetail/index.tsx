import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Tabs, Button, Tag, Table, Progress, Alert, Divider, Space,
} from 'antd'
import { ShopOutlined, ArrowLeftOutlined } from '@ant-design/icons'

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
        dimension: '相關性得分', score: 185, maxScore: 200, weight: 20,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中店名「漢堡」', enabled: true },
          { name: '精準匹配', score: 60, description: '模糊匹配命中', enabled: true },
          { name: '匹配商品所屬類目', score: 25, description: '命中漢堡類目', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 280, maxScore: 400, weight: 30,
        details: [
          { name: '購買熱搜詞', score: 200, description: '商家購買「漢堡」熱搜詞 +200分', enabled: true },
          { name: '購買關鍵字', score: 80, description: '商家購買「漢堡包」關鍵字 +150分(權重×0.53)', enabled: true },
          { name: '廣告曝光', score: 0, description: '本期無廣告曝光', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 230, maxScore: 400, weight: 25,
        details: [
          { name: '店鋪等級S', score: 100, description: 'S級店鋪 +100分', enabled: true },
          { name: '店鋪口碑', score: 50, description: '口碑評分4.8 +50分', enabled: true },
          { name: '品牌連鎖', score: 35, description: '品牌連鎖店 +35分', enabled: true },
          { name: '金牌店標', score: 50, description: '金牌店標 +50分', enabled: true },
          { name: '月銷量', score: -5, description: '本月銷量排名中等', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 120, maxScore: 200, weight: 15,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '收藏過的店鋪', score: 30, description: '用戶收藏此店 +30分', enabled: true },
          { name: '經常購買', score: 40, description: '用戶經常購買此店 +40分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 77, maxScore: 100, weight: 10,
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
        dimension: '相關性得分', score: 170, maxScore: 200, weight: 20,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中店名「漢堡包」', enabled: true },
          { name: '不分詞模糊匹配', score: 50, description: '原始輸入模糊匹配命中', enabled: true },
          { name: '匹配商品副標題', score: 20, description: '副標題命中', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 180, maxScore: 400, weight: 30,
        details: [
          { name: '購買關鍵字', score: 150, description: '商家購買「漢堡包」關鍵字 +150分', enabled: true },
          { name: '活動免運費', score: 30, description: '參加免運費活動 +30分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 210, maxScore: 400, weight: 25,
        details: [
          { name: '店鋪等級A', score: 80, description: 'A級店鋪 +80分', enabled: true },
          { name: '店鋪口碑', score: 50, description: '口碑評分4.6 +50分', enabled: true },
          { name: '獨家店標', score: 45, description: '獨家店標 +45分', enabled: true },
          { name: '日銷量', score: 35, description: '日銷量排名前20% +35分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 100, maxScore: 200, weight: 15,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '最近購買', score: 50, description: '用戶近期購買過 +50分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 96, maxScore: 100, weight: 10,
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
        dimension: '相關性得分', score: 160, maxScore: 200, weight: 20,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中「漢堡」', enabled: true },
          { name: '不分詞模糊匹配', score: 60, description: '原始輸入模糊匹配命中', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 100, maxScore: 400, weight: 30,
        details: [
          { name: '活動免運費', score: 50, description: '參加免運費活動 +50分', enabled: true },
          { name: '發紅包', score: 50, description: '發放滿減紅包 +50分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 180, maxScore: 400, weight: 25,
        details: [
          { name: '店鋪等級B', score: 60, description: 'B級店鋪 +60分', enabled: true },
          { name: '店鋪口碑', score: 40, description: '口碑評分4.2 +40分', enabled: true },
          { name: '月銷量', score: 40, description: '月銷量排名靠前 +40分', enabled: true },
          { name: '至低標識', score: 25, description: '至低標識 +25分', enabled: true },
          { name: '暗推動態加分', score: 15, description: '暗推狀態一般 +15分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 80, maxScore: 200, weight: 15,
        details: [
          { name: '瀏覽過的店鋪', score: 50, description: '用戶近30天瀏覽過此店 +50分', enabled: true },
          { name: '搜索過的關鍵字', score: 30, description: '用戶近期搜索相關詞 +30分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 125, maxScore: 100, weight: 10,
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
        dimension: '相關性得分', score: 130, maxScore: 200, weight: 20,
        details: [
          { name: '分詞命中', score: 100, description: '分詞後命中「漢堡」', enabled: true },
          { name: '不分詞模糊匹配', score: 30, description: '模糊匹配部分命中', enabled: true },
        ],
      },
      {
        dimension: '商業得分', score: 80, maxScore: 400, weight: 30,
        details: [
          { name: '發紅包', score: 50, description: '發放新人紅包 +50分', enabled: true },
          { name: '活動免運費', score: 30, description: '限時免運費 +30分', enabled: true },
        ],
      },
      {
        dimension: '店鋪得分', score: 150, maxScore: 400, weight: 25,
        details: [
          { name: '店鋪等級C', score: 40, description: 'C級店鋪 +40分', enabled: true },
          { name: '店鋪口碑', score: 30, description: '口碑評分3.8 +30分', enabled: true },
          { name: '月銷量', score: 30, description: '月銷量一般 +30分', enabled: true },
          { name: '格價標識', score: 25, description: '格價標識 +25分', enabled: true },
          { name: '暗推動態加分', score: 25, description: '暗推狀態一般 +25分', enabled: true },
        ],
      },
      {
        dimension: '用戶得分', score: 60, maxScore: 200, weight: 15,
        details: [
          { name: '搜索過的關鍵字', score: 30, description: '用戶近期搜索相關詞 +30分', enabled: true },
          { name: '瀏覽過的店鋪', score: 30, description: '用戶偶爾瀏覽 +30分', enabled: true },
        ],
      },
      {
        dimension: '平台得分', score: 100, maxScore: 100, weight: 10,
        details: [
          { name: '營業中加分', score: 20, description: '當前營業中 +20分', enabled: true },
          { name: '距離衰減', score: 10, description: '距離2km 衰減較多', enabled: true },
          { name: '商品可售', score: 10, description: '商品正常可售 +10分', enabled: true },
          { name: '暗推動態加分', score: 20, description: '暗推狀態一般 +20分', enabled: true },
          { name: '超時未接單', score: -20, description: '有超時記錄 -20分', enabled: true },
          { name: '打烊不接單', score: -50, description: '打烊不接單 -50分', enabled: false },
        ],
      },
    ],
  },
]

// ============================
// 維度顏色
// ============================

const dimensionColors: Record<string, string> = {
  '相關性得分': '#1890ff',
  '商業得分': '#faad14',
  '店鋪得分': '#52c41a',
  '用戶得分': '#722ed1',
  '平台得分': '#13c2c2',
}

// ============================
// 主組件
// ============================

export default function SearchVerifyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const merchant = MOCK_MERCHANTS.find(m => m.merchantId === id)

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
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/search-verify')}
            style={{ fontSize: 14 }}
          >
            返回搜索校驗
          </Button>
          <Divider type="vertical" style={{ height: 24 }} />
          <ShopOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
              商家得分明細
            </h2>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {merchant.merchantName}（{merchant.merchantId}）· {merchant.category}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {merchant.tags.map(tag => <Tag key={tag} color="cyan">{tag}</Tag>)}
          </div>
        </div>
      </div>

      {/* 總分概要卡片 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{
            textAlign: 'center', padding: '12px 28px',
            background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)',
            borderRadius: 12, minWidth: 120,
          }}>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 6 }}>加權總分</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: '#1890ff' }}>{merchant.totalScore}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>排名 第{merchant.rank}名</div>
          </div>
          <Divider type="vertical" style={{ height: 80 }} />
          <div style={{ flex: 1, display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'space-around' }}>
            {merchant.dimensionScores.map(ds => {
              const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0
              return (
                <div key={ds.dimension} style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>{ds.dimension}</div>
                  <Progress
                    type="circle"
                    percent={pct}
                    size={64}
                    strokeColor={dimensionColors[ds.dimension] || '#999'}
                    format={() => <span style={{ fontSize: 13, fontWeight: 600 }}>{ds.score}</span>}
                  />
                  <div style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                    滿分 {ds.maxScore} · 權重 {ds.weight}%
                  </div>
                </div>
              )
            })}
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
