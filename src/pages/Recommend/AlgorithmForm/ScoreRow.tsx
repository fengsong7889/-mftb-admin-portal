import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import './index.css'

type ScoreKind = 'bonus' | 'deduction' | 'multiplier' | 'coefficient' | 'decay' | 'base' | 'dynamic-bonus' | 'dynamic-deduction'

interface ScoreValueProps {
  score: number
  kind?: ScoreKind
  enabled?: boolean
  children?: ReactNode
}

const SCORE_LABELS: Record<ScoreKind, string> = {
  bonus: '固定加分',
  deduction: '固定減分',
  multiplier: '動態加分',
  coefficient: '折減係數',
  decay: '衰減係數',
  base: '基礎分值',
  'dynamic-bonus': '動態加分',
  'dynamic-deduction': '動態減分',
}

/** 只统一展示语义，不改变保存值或计分计算。 */
export function ScoreValue({ score, kind = score < 0 ? 'deduction' : 'bonus', enabled = true, children }: ScoreValueProps) {
  const { t } = useTranslation()
  const isDeduction = kind === 'deduction' || kind === 'dynamic-deduction'
  const isMultiplier = kind === 'multiplier' || kind === 'coefficient'
  const tone = !enabled ? 'disabled' : isDeduction ? 'deduction' : isMultiplier || kind === 'decay' ? 'multiplier' : 'bonus'
  const value = isMultiplier ? `×${score}` : kind === 'decay' ? String(score) : kind === 'base' ? `${score} 分`
    : `${score === 0 ? '' : isDeduction ? '-' : '+'}${Math.abs(score)} 分`
  return (
    <span className={`organic-score-value organic-score-value--${tone}`}>
      <span className="organic-score-value__badge">{t(`organicTrafficScore.display.${kind}`, { defaultValue: SCORE_LABELS[kind] })}</span>
      <span className="organic-score-value__number">{children ?? value}</span>
    </span>
  )
}

interface ScoreRowProps extends ScoreValueProps {
  label: ReactNode
  index?: number
  control?: ReactNode
  hint?: ReactNode
}

/** 所有维度共用条件、计分类型、分值与说明的对齐方式。 */
export default function ScoreRow({ label, index, control, hint, ...valueProps }: ScoreRowProps) {
  return (
    <div className="organic-score-row">
      <div className="organic-score-row__condition">
        {index !== undefined && <span className="organic-score-row__index">#{index + 1}</span>}
        <div className="organic-score-row__label">{label}</div>
        {control}
      </div>
      <ScoreValue {...valueProps} />
      {hint && <div className="organic-score-row__hint">{hint}</div>}
    </div>
  )
}
