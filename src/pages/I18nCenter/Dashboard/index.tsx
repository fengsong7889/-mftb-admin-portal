import { useState, useEffect, useMemo, useCallback } from 'react'
import { Empty, Tag, Progress } from 'antd'
import {
  GlobalOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchLanguages, fetchTranslations, fetchCoverage } from '@/api/translation'
import type { LanguageVO, TranslationVO } from '@/api/translation'
import { buildCoverageRows, averageRate, type CoverageRow } from '@/utils/coverageRows'
import { useCountUp } from '@/hooks/useCountUp'

/* ---- 动画数字组件 ---- */
function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}</>
}

/* ---- 分类标签颜色 ---- */
const CATEGORY_LABEL: Record<string, string> = {
  common: '公共',
  status: '狀態',
  action: '操作',
  menu: '菜單',
  biz: '業務',
  ui: '界面',
}

const CATEGORY_COLOR: Record<string, string> = {
  common: 'blue',
  status: 'green',
  action: 'orange',
  menu: 'purple',
  biz: 'cyan',
  ui: 'magenta',
}

/* ---- 完成率色阶 ---- */
function rateColor(rate: number): string {
  if (rate >= 80) return '#52C41A'
  if (rate >= 60) return '#73D13D'
  if (rate >= 40) return '#FAAD14'
  if (rate >= 20) return '#FF7A45'
  return '#FF4D4F'
}

interface LangStat extends CoverageRow {
  byCategory: Record<string, { total: number; translated: number; rate: number }>
}

export default function TranslationDashboard() {
  const { i18n } = useTranslation()
  const _sysLang = i18n.language || 'en'

  const [langs, setLangs] = useState<LanguageVO[]>([])
  const [fields, setFields] = useState<TranslationVO[]>([])
  /** 全站口径完成率（分母来自后端 coverage：语言包镜像 key ∪ 库里字段） */
  const [coverages, setCoverages] = useState<Array<CoverageRow>>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [l, f] = await Promise.all([fetchLanguages(), fetchTranslations()])
      if (l) setLangs(l)
      if (f) setFields(f)
      // 完成率单独取：某个语言的 coverage 不可用不会拖垮整页，buildCoverageRows 会标 estimated
      if (l) {
        const rows = buildCoverageRows(l, await Promise.all(l.map(lang => fetchCoverage(lang.code))), f ?? [])
        setCoverages(rows)
      }
    } catch { /* 全局拦截器 */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* 统计计算 */
  const stats = useMemo(() => {
    const totalFields = fields.length
    const categories = [...new Set(fields.map(f => f.category))]

    // 分母与完成率一律取后端 coverage（语言包镜像 key ∪ 库里字段）。
    // 旧版这里用 fields.length 当分母，于是「前端有、但没同步入库」的词条
    // 根本不进分母 —— 库里 8504 条全翻完时六语都报 ~100%，而简体中文
    // 真实只能解析 51.4%（2026-11-05 实测）。
    const langStats: LangStat[] = coverages.map(row => {
      // byCategory 仍按库里已收录字段拆：它回答的是「已入库各分类翻了多少」，
      // 不能拿来当全站完成率
      const byCategory: Record<string, { total: number; translated: number; rate: number }> = {}
      for (const cat of categories) {
        const catFields = fields.filter(f => f.category === cat)
        const catTranslated = catFields.filter(f => (f.translations?.[row.code] ?? '').trim()).length
        byCategory[cat] = {
          total: catFields.length,
          translated: catTranslated,
          rate: catFields.length > 0 ? Math.round((catTranslated / catFields.length) * 100) : 0,
        }
      }
      return { ...row, byCategory }
    })

    // 同一套需译 key 在各语言应该同宽：取最大值，避免某个 coverage 不可用时
    // 兜底口径（只算库记录）把全站分母拉小
    const universeTotal = langStats.reduce((max, row) => Math.max(max, row.total), 0)
    const missingInDb = langStats.reduce((max, row) => Math.max(max, row.missingInDb), 0)
    const estimated = langStats.some(row => row.estimated)

    const completeFields = fields.filter(f =>
      langs.every(l => (f.translations?.[l.code] ?? '').trim())
    ).length
    const incompleteFields = totalFields - completeFields
    // 按 key 加权，而不是把各语百分比再算术平均（那会把 100% 和 10% 平均成 55%）
    const avgRate = averageRate(langStats)

    // 分类分布
    const catDistribution = categories.map(cat => ({
      category: cat,
      count: fields.filter(f => f.category === cat).length,
    })).sort((a, b) => b.count - a.count)

    // 待处理 TOP 10（空缺最多的字段）
    const topIncomplete = fields
      .map(f => ({
        fieldKey: f.fieldKey,
        fieldName: f.fieldName,
        category: f.category,
        missing: langs.filter(l => !(f.translations?.[l.code] ?? '').trim()).length,
      }))
      .filter(f => f.missing > 0)
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 10)

    return {
      totalFields, universeTotal, missingInDb, estimated,
      completeFields, incompleteFields, avgRate,
      langStats, catDistribution, topIncomplete, categories,
    }
  }, [fields, langs, coverages])

  if (loading && langs.length === 0) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Empty description="加載中..." /></div>
  }

  return (
    <div className="content-area">
      {/* 顶部统计卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: '需譯詞條（全站）', value: stats.universeTotal, color: '#1890FF', bgColor: '#E6F7FF', icon: <FileTextOutlined /> },
          { label: '已收錄進翻譯庫', value: stats.totalFields, color: '#52C41A', bgColor: '#F6FFED', icon: <CheckCircleOutlined /> },
          // 这一张卡就是本次事故的仪表：前端加了文案但没跑同步，它就不是 0
          // 颜色不拿 var()：下面拼的 `${card.color}22` 需要完整色值才能加透明度
          { label: '尚未同步入庫', value: stats.missingInDb, color: '#FA8C16', bgColor: '#FFF7E6', icon: <ExclamationCircleOutlined /> },
          { label: '已註冊語言', value: langs.length, color: '#722ED1', bgColor: '#F9F0FF', icon: <GlobalOutlined /> },
        ].map((card, i) => (
          <div
            key={i}
            className="home-section"
            style={{
              padding: 16,
              textAlign: 'center',
              cursor: 'default',
              background: card.bgColor,
              border: `1px solid ${card.color}22`,
              borderRadius: 12,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 20, color: card.color, marginBottom: 4 }}>{card.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>
              <AnimatedNumber value={card.value} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* 语言完成率矩阵 */}
      <div className="detail-card" style={{ borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TranslationOutlined style={{ color: '#E8720C' }} />
          語言完成率矩陣
        </h3>
        {/* 口径自述：完成率的分母是全站需译词条，不是库里记录数 */}
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          分母 = 前端語言包 ∪ 後端翻譯庫的全站需譯詞條（{stats.universeTotal.toLocaleString()} 個）；
          分類列只拆已入庫字段。
          {stats.estimated && <span style={{ color: 'var(--warning)' }}> 後端 coverage 不可用，目前按庫內記錄估算，讀數會偏高。</span>}
          {stats.missingInDb > 0 && (
            <span style={{ color: 'var(--danger)' }}> 有 {stats.missingInDb.toLocaleString()} 個前端詞條尚未同步入庫。</span>
          )}
        </div>
        {stats.langStats.length > 0 && stats.categories.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 120 }}>語言</th>
                  {stats.categories.map(cat => (
                    <th key={cat} style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, minWidth: 80 }}>
                      <Tag color={CATEGORY_COLOR[cat]}>{CATEGORY_LABEL[cat] || cat}</Tag>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, minWidth: 100 }}>整體</th>
                </tr>
              </thead>
              <tbody>
                {stats.langStats.map(lang => (
                  <tr key={lang.code} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                      <span style={{ marginRight: 6 }}>{lang.flag}</span>
                      {lang.name}
                      <span style={{ color: '#8C8C8C', fontSize: 11, marginLeft: 4 }}>({lang.code})</span>
                    </td>
                    {stats.categories.map(cat => {
                      const cell = lang.byCategory[cat]
                      return (
                        <td key={cat} style={{ textAlign: 'center', padding: '8px 12px' }}>
                          <span style={{ color: rateColor(cell.rate), fontWeight: 600 }}>
                            {cell.rate}%
                          </span>
                          <div style={{ fontSize: 11, color: '#8C8C8C' }}>
                            {cell.translated}/{cell.total}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                      <Progress
                        type="circle"
                        percent={lang.rate}
                        size={40}
                        strokeColor={rateColor(lang.rate)}
                        format={p => <span style={{ fontSize: 11, fontWeight: 600 }}>{p}%</span>}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty description="暫無數據" />
        )}
      </div>

      {/* 下方两列布局：分类分布 + 待处理 TOP 10 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 分类分布 */}
        <div className="detail-card" style={{ borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            <FileTextOutlined style={{ color: '#E8720C', marginRight: 8 }} />
            分類分布
          </h3>
          {stats.catDistribution.length > 0 ? (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {stats.catDistribution.map(item => {
                const pct = stats.totalFields > 0 ? Math.round((item.count / stats.totalFields) * 100) : 0
                return (
                  <div key={item.category} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Tag color={CATEGORY_COLOR[item.category]}>
                        {CATEGORY_LABEL[item.category] || item.category}
                      </Tag>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{item.count} 個字段 ({pct}%)</span>
                    </div>
                    <Progress
                      percent={pct}
                      showInfo={false}
                      strokeColor={CATEGORY_COLOR[item.category] === 'blue' ? '#1890FF' : undefined}
                      size="small"
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty description="暫無數據" />
          )}
        </div>

        {/* 待处理 TOP 10 */}
        <div className="detail-card" style={{ borderRadius: 8, border: '1px solid #f0f0f0', padding: '20px 24px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
            <ExclamationCircleOutlined style={{ color: '#FA8C16', marginRight: 8 }} />
            待翻譯 TOP 10
          </h3>
          {stats.topIncomplete.length > 0 ? (
            <div>
              {stats.topIncomplete.map((item, idx) => (
                <div
                  key={item.fieldKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: idx < stats.topIncomplete.length - 1 ? '1px solid #f5f5f5' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: idx < 3 ? '#FFF1F0' : '#F5F5F5',
                      color: idx < 3 ? '#FF4D4F' : '#8C8C8C',
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.fieldName || item.fieldKey}
                      </div>
                      <code style={{ fontSize: 11, color: '#8C8C8C' }}>{item.fieldKey}</code>
                    </div>
                  </div>
                  <Tag color="warning" style={{ flexShrink: 0, marginLeft: 8 }}>
                    缺 {item.missing} 語言
                  </Tag>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="所有字段翻譯已完成" />
          )}
        </div>
      </div>
    </div>
  )
}
