import { useId, type ReactNode } from 'react'
import { DownOutlined, SettingOutlined } from '@ant-design/icons'
import './index.css'

interface Props {
  title: ReactNode
  icon?: ReactNode
  tone?: 'info' | 'strategy' | 'advanced'
  children: ReactNode
  extra?: ReactNode
  readOnly?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  headingId?: string
  bodyId?: string
  className?: string
}

/** 算法库所有类型共用的模块外观；折叠不卸载字段，不影响表单状态。 */
export default function AlgorithmSection({ title, icon = <SettingOutlined />, tone = 'strategy', children, extra,
  readOnly = false, expanded = true, onExpandedChange, headingId, bodyId, className = '' }: Props) {
  const id = useId()
  const labelId = headingId ?? `algorithm-heading-${id}`
  const contentId = bodyId ?? `algorithm-body-${id}`
  const heading = <>
    <span aria-hidden="true" className={`algorithm-section__icon algorithm-section__icon--${tone}`}>{icon}</span>
    <span className="algorithm-section__title">{title}</span>
    <span className="algorithm-section__divider" />
  </>
  return (
    <section className={`algorithm-section${readOnly ? ' algorithm-section--detail' : ''} ${className}`} aria-labelledby={labelId}>
      <div className="algorithm-section__header">
        <h3 className="algorithm-section__heading">
          {onExpandedChange ? (
            <button id={labelId} type="button" aria-label={typeof title === 'string' ? title : undefined}
              aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpandedChange(!expanded)}>
              {heading}
              <DownOutlined aria-hidden="true" className={`algorithm-section__chevron${expanded ? ' algorithm-section__chevron--expanded' : ''}`} />
            </button>
          ) : <span id={labelId} className="algorithm-section__static-heading">{heading}</span>}
        </h3>
        {extra && <div className="algorithm-section__extra">{extra}</div>}
      </div>
      <div id={contentId} hidden={!expanded} className="algorithm-section__body">{children}</div>
    </section>
  )
}
