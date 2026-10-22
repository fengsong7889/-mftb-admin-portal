import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 钉钉消息卡片效果预览。
 *
 * <p><b>为什么不用现成的 markdown 渲染器</b>：后端产出的正文只用到极少数语法
 * （`**粗体**`、行首 `- `、行首 `> `、空行），为此引入 marked / react-markdown
 * 会让包里多一个几百 KB 的依赖；更关键的是钉钉本身也不渲染通用 markdown（表格、嵌套列表都不支持），
 * 用通用渲染器预览反而会「预览好看、真机难看」。这里只实现钉钉真正会渲染的那几种。
 *
 * <p><b>为什么预览要画卡片壳</b>：配置页过去只显示一段带 `**` 的源码，
 * 管理员无法判断「发出去到底长什么样」；固定版式是卡片消息，必须有标题区与按钮，
 * 否则调完字段开关也不知道读者看到的是什么。
 */
export interface DingTalkCardPreviewProps {
  title: string
  content: string
  /** fixed=卡片（带底部按钮）；template=纯文字气泡（无按钮） */
  mode?: 'fixed' | 'template'
  /** 卡片按钮文案；fixed 模式不传则不画按钮 */
  buttonText?: string
  /** 消息时间文本（预览传固定值，避免每次渲染都变） */
  timeText?: string
}

/** 行内粗体切分：`**文字**` → <strong>，其余原样输出 */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    return <span key={key}>{part}</span>
  })
}

/** 正文按行转成预览节点：空行留白、`> ` 引用、`- ` 列表、其余段落 */
function renderPreviewBody(content: string): ReactNode[] {
  return content.split('\n').flatMap((raw, index) => {
    const line = raw.replace(/\s+$/, '')
    const key = `line-${index}`
    if (!line.trim()) {
      return [<div key={key} className="rdm-dingtalk-preview__gap" aria-hidden="true" />]
    }
    if (line.startsWith('>')) {
      return [
        <div key={key} className="rdm-dingtalk-preview__quote">
          {renderInline(line.replace(/^>\s?/, ''), key)}
        </div>,
      ]
    }
    if (/^[-*]\s+/.test(line)) {
      return [
        <div key={key} className="rdm-dingtalk-preview__item">
          <span className="rdm-dingtalk-preview__dot" aria-hidden="true" />
          <span>{renderInline(line.replace(/^[-*]\s+/, ''), key)}</span>
        </div>,
      ]
    }
    return [<div key={key} className="rdm-dingtalk-preview__line">{renderInline(line, key)}</div>]
  })
}

export default function DingTalkCardPreview({
  title,
  content,
  mode = 'fixed',
  buttonText,
  timeText,
}: DingTalkCardPreviewProps) {
  const { t } = useTranslation()
  const isCard = mode === 'fixed'
  return (
    <div className="rdm-dingtalk-preview">
      <div className="rdm-dingtalk-preview__meta">
        <span className="rdm-dingtalk-preview__app">{t('rdm.dailyTemplate.previewAppName')}</span>
        {timeText && <span className="rdm-dingtalk-preview__time">{timeText}</span>}
      </div>
      <div className={isCard
        ? 'rdm-dingtalk-preview__bubble rdm-dingtalk-preview__bubble--card'
        : 'rdm-dingtalk-preview__bubble'}>
        <div className="rdm-dingtalk-preview__title">{title}</div>
        <div className="rdm-dingtalk-preview__body">{renderPreviewBody(content)}</div>
        {isCard && buttonText && (
          <div className="rdm-dingtalk-preview__footer">
            <span className="rdm-dingtalk-preview__button">{buttonText}</span>
          </div>
        )}
        {!isCard && (
          <div className="rdm-dingtalk-preview__hint">{t('rdm.dailyTemplate.previewTemplateNoButton')}</div>
        )}
      </div>
    </div>
  )
}
