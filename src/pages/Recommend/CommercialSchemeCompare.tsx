import { useMemo, type CSSProperties } from 'react'
import { Alert, Table, Tag } from 'antd'
import { ThunderboltOutlined, TrophyOutlined, SafetyCertificateOutlined, ExperimentOutlined } from '@ant-design/icons'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import { computePreview, PREVIEW_CASES } from './CouponIntensityConfig'
import { createDefaultCouponIntensityConfig, DEFAULT_ORGANIC_SCORE_RULES } from './organicTrafficConfig'

/**
 * 券类计分口径评审 Demo（只读对照，不参与保存与计分）。
 * 目的：把「现行双表×系数」与两种简化口径放在同一批真实场景上跑分，
 * 让业务用分数差异直观判断该选哪种，而不是靠文字描述争论。
 * 评审结束后本文件整体删除。
 */

/** 方案 B：门槛倍率 → 力度降档（用「数档位」替代「乘系数」） */
const DOWNGRADE_RULES = [
  { maxMultiplier: 1, downgrade: 0, label: '門檻 ≤ 1 倍基準', note: '不降档' },
  { maxMultiplier: 1.5, downgrade: 1, label: '1 < 門檻 ≤ 1.5 倍', note: '力度降 1 檔' },
  { maxMultiplier: 2, downgrade: 2, label: '1.5 < 門檻 ≤ 2 倍', note: '力度降 2 檔' },
  { maxMultiplier: 3, downgrade: 3, label: '2 < 門檻 ≤ 3 倍', note: '力度降 3 檔' },
]
/** 护栏倍数：门槛超过基准客单价该倍数视为「顾客够不着」，力度分整体不发放（对应现行末档系数 0） */
const GUARD_MULTIPLIER = 3

const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 18px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 方案 B 得分：命中力度档后按门槛倍率降档，降穿则归零 */
function computeSchemeB(intensityTiers: { score: number }[], tierIndex: number, multiplier: number): number {
  if (tierIndex < 0 || multiplier > GUARD_MULTIPLIER) return 0
  const rule = DOWNGRADE_RULES.find(r => multiplier <= r.maxMultiplier) ?? DOWNGRADE_RULES[DOWNGRADE_RULES.length - 1]
  const hit = tierIndex - rule.downgrade
  return hit >= 0 ? intensityTiers[hit].score : 0
}

interface Scenario extends Record<string, number | string> {
  name: string
  B: number
  T: number
  amount: number
}

/** 现행 试算案例之外，补两个「门槛压在基准之上」的边界场景，专门暴露三套口径的分歧 */
const SCENARIOS: Scenario[] = [
  ...PREVIEW_CASES,
  { name: '餐廳滿 150 減 30（門檻 1.5 倍）', B: 100, T: 150, amount: 30 },
  { name: '餐廳滿 200 減 20（門檻 2 倍）', B: 100, T: 200, amount: 20 },
]

const DELTA_TONE = { same: '#52C41A', near: '#FA8C16', diff: '#FF4D4F' }

export default function CommercialSchemeCompare() {
  const cfg = useMemo(() => createDefaultCouponIntensityConfig(), [])
  const com01 = useMemo(() => DEFAULT_ORGANIC_SCORE_RULES.find(r => r.id === 'COM_01'), [])

  /** 逐场景跑三套口径；方案 C（分值矩阵）按定义与现行等价，故直接取现行得分 */
  const rows = useMemo(() => SCENARIOS.map(s => {
    const cur = computePreview(cfg, s.B, s.T, s.amount)
    const tierIndex = cur.intensityTier ? cfg.intensityTiers.indexOf(cur.intensityTier) : -1
    const bIntensity = computeSchemeB(cfg.intensityTiers, tierIndex, cur.M)
    const bTotal = cur.canCompute ? cur.enrollmentScore + Math.min(bIntensity, cfg.intensityCap) : 0
    const delta = Math.round((bTotal - cur.total) * 100) / 100
    return {
      ...s,
      x: cur.X, r: cur.R, m: cur.M, coef: cur.coefficient,
      cur: cur.total, schemeB: bTotal, schemeC: cur.total, delta,
    }
  }), [cfg])

  const matrixColumns = DOWNGRADE_RULES.map(rule => ({
    title: rule.label,
    dataIndex: `m${rule.maxMultiplier}`,
    align: 'center' as const,
    render: (v: number) => <span style={{ fontWeight: 600, color: v > 0 ? '#262626' : '#8C8C8C' }}>{v}</span>,
  }))
  /** 矩阵单元值 = 力度档分 × 门槛系数，与现行完全等价，可作为零漂移迁移的预填数据 */
  const matrixRows = cfg.intensityTiers.map((tier, i) => {
    const row: Record<string, number | string> = { key: i, tier: `${tier.minRate}% ~ ${tier.maxRate}%`, base: tier.score }
    DOWNGRADE_RULES.forEach(rule => {
      const coef = cfg.thresholdTiers.find(t => t.maxMultiplier >= rule.maxMultiplier)?.coefficient ?? 0
      row[`m${rule.maxMultiplier}`] = Math.round(tier.score * coef)
    })
    return row
  })

  return (
    <div style={{ marginBottom: 16 }}>
      <Alert
        type="info"
        showIcon
        icon={<ExperimentOutlined />}
        message="計分口径評審 Demo（只讀）"
        description="以下對照不參與保存、不影響線上配置；URL 去掉 schemeDemo=1 即完全隱藏。评审定稿后本组件与开关一并删除。"
        style={{ marginBottom: 16 }}
      />

      <AlgorithmSection title="參照：滿額立減為何好理解（COM_01 現行配置）" icon={<TrophyOutlined />} tone="info">
        <div className="organic-score-panel organic-score-list">
          <ScoreRow label="門檻 ≤ 基準客單價（直接達標）" score={com01?.thresholdScore ?? 0}
            hint="一次除法 + 一次查表，結果可心算" />
          {(com01?.multiplierTiers ?? []).map((tier, i) => (
            <ScoreRow key={i} index={i} label={`門檻 ≤ ${tier.multiplier} 倍基準客單價`} score={tier.score} />
          ))}
        </div>
      </AlgorithmSection>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Tag color="purple" style={{ margin: 0 }}>現行</Tag>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>比例檔 × 門檻係數</span>
          </div>
          <div style={{ fontSize: 12, color: '#595959', lineHeight: '22px' }}>
            X = max(B, T) → D = min(券面, X) → R = D/X 查力度檔 → M = T/B 查係數 → 力度分 × 係數 → 截斷上限 → + 報名分
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#8C8C8C' }}>
            配置要素 4 塊：報名分 / 力度 6 檔 / 力度上限 / 門檻係數 5 檔
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Tag color="green" style={{ margin: 0 }}>方案 B</Tag>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>比例檔 + 門檻降檔</span>
          </div>
          <div className="organic-score-panel organic-score-list">
            {DOWNGRADE_RULES.map((rule, i) => (
              <div key={i} className="organic-score-row">
                <div className="organic-score-row__condition">
                  <span className="organic-score-row__index">#{i + 1}</span>
                  <div className="organic-score-row__label">{rule.label}</div>
                </div>
                <span className="organic-score-value organic-score-value--multiplier">
                  <span className="organic-score-value__badge">力度降檔</span>
                  <span className="organic-score-value__number">{rule.downgrade === 0 ? '不降' : `降 ${rule.downgrade} 檔`}</span>
                </span>
              </div>
            ))}
            <div className="organic-score-row">
              <div className="organic-score-row__condition">
                <span className="organic-score-row__index">#{DOWNGRADE_RULES.length + 1}</span>
                <div className="organic-score-row__label">門檻 {`>`} {GUARD_MULTIPLIER} 倍基準（護欄）</div>
              </div>
              <span className="organic-score-value organic-score-value--disabled">
                <span className="organic-score-value__badge">力度不發放</span>
                <span className="organic-score-value__number">0 分</span>
              </span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#8C8C8C' }}>
            配置要素 3 塊：報名分 / 力度 6 檔 / 降檔表（去掉係數表與乘法）
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Tag color="blue" style={{ margin: 0 }}>方案 C／D</Tag>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>力度 × 門檻 分值矩陣</span>
          </div>
          <Table
            size="small"
            pagination={false}
            dataSource={matrixRows}
            columns={[
              { title: '力度 R', dataIndex: 'tier', align: 'center' as const },
              ...matrixColumns,
            ]}
          />
          <div style={{ marginTop: 10, fontSize: 12, color: '#8C8C8C' }}>
            格子值即最終得分，與現行 100% 等價。<b>D</b>＝只當只讀展示（底層仍用力度檔 + 係數）；<b>C</b>＝直接當配置源（24 格先生成後微調）
          </div>
        </div>
      </div>

      <AlgorithmSection title="同一批場景跑分對照" icon={<ThunderboltOutlined />} tone="strategy"
        extra={<span style={{ fontSize: 12, color: '#8C8C8C' }}>基準客單價 B / 使用門檻 T / 券面金額 D 全部為示例門店口徑</span>}>
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 1080 }}
          dataSource={rows}
          rowKey="name"
          columns={[
            { title: '場景', dataIndex: 'name', width: 200 },
            { title: 'B', dataIndex: 'B', width: 70, align: 'right' },
            { title: 'T', dataIndex: 'T', width: 80, align: 'right' },
            { title: 'D', dataIndex: 'amount', width: 70, align: 'right' },
            { title: '計價基數 X', dataIndex: 'x', width: 100, align: 'right' },
            { title: '力度 R', dataIndex: 'r', width: 80, render: (v: number) => `${v}%`, align: 'right' },
            { title: '門檻倍率 M', dataIndex: 'm', width: 96, render: (v: number) => `${v} 倍`, align: 'right' },
            { title: '現行係數', dataIndex: 'coef', width: 84, render: (v: number) => `×${v}`, align: 'right' },
            { title: '現行得分', dataIndex: 'cur', width: 88, align: 'right', render: (v: number) => <b>{v}</b> },
            {
              title: '方案 B', dataIndex: 'schemeB', width: 88, align: 'right',
              render: (v: number, row: Scenario) => {
                const delta = row.delta as number
                const tone = delta === 0 ? DELTA_TONE.same : Math.abs(delta) <= 10 ? DELTA_TONE.near : DELTA_TONE.diff
                return (
                  <span style={{ color: tone, fontWeight: 600 }}>
                    {v}{delta !== 0 && <span style={{ fontSize: 11, fontWeight: 400 }}> ({delta > 0 ? '+' : ''}{delta})</span>}
                  </span>
                )
              },
            },
            { title: '方案 C／D', dataIndex: 'schemeC', width: 96, align: 'right', render: (v: number) => <span>{v} <span style={{ fontSize: 11, color: DELTA_TONE.same }}>＝現行</span></span> },
          ]}
        />
      </AlgorithmSection>

      <AlgorithmSection title="結論與待拍板" icon={<SafetyCertificateOutlined />} tone="advanced">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#595959', lineHeight: '22px' }}>
          <div>1. 現行口徑的「X = max(基準, 門檻)」是防刷分的關鍵（超高門檻大額券不得算高力度），<b>任何簡化方案都不得去掉</b>。</div>
          <div>2. 方案 B 把「乘係數」換成「數檔降檔」，配置界面從 4 塊減到 3 塊、公式減到 2 步，與滿額立減同構；但與現行<b>非完全等價</b>，上表括號即偏差，需按現網分布做一次標定。</div>
          <div>3. 方案 C／D 的矩陣是「把乘法結果實時展成表」，<b>零口徑漂移</b>；差異只在於它是只讀展示（D）還是可編輯配置源（C）。</div>
          <div>4. 上表實測：方案 B 在 8 個場景中 5 個與現行完全一致，3 個偏低 10～15 分，<b>偏差方向恆定：門檻越高、力度越低則越嚴</b>——原因是離散降檔無法表達 ×0.8 / ×0.5 的連續精度。</div>
          <div>5. 建議：<b>先做 D（只加一張分值矩陣視圖，理解成本立刻降下來，不動數據、不動口徑）</b>；若還要把配置結構也簡化，再選 B 並接受一次標定（或把降檔規則改為「降 N% 分值」以消除跳變）。</div>
          <div style={{ color: '#8C8C8C', fontSize: 12 }}>註：目前後端僅存儲規則、無計分實現，COM_03~07 的力度配置也尚未落庫，因此現在改口徑不需要遷移歷史分數。</div>
        </div>
      </AlgorithmSection>
    </div>
  )
}
