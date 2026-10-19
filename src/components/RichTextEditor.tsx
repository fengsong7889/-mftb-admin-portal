/**
 * 轻量富文本编辑器（contentEditable + execCommand 实现，不引入第三方编辑器依赖）
 *
 * 为什么自研：项目暂无富文本依赖，为一个「需求说明」输入框引入重量级编辑器包不划算；
 * 内容在保存/渲染侧统一用 DOMPurify 净化（见 UI 规范 B.6），编辑器本身只做录入。
 * 非受控设计：DOM 只在外部 value 变化（编辑回填、AI 草稿注入）时写入，
 * 用户输入过程直接读 innerHTML 上报，避免受控重渲染导致光标跳位。
 */
import { useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import {
  BoldOutlined,
  ClearOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import './RichTextEditor.css'

interface RichTextEditorProps {
  /** HTML 字符串内容 */
  value: string
  onChange: (html: string) => void
  placeholder?: string
  /** 只读态（fieldset 的 disabled 管不到 contentEditable，必须显式传） */
  disabled?: boolean
  /** 编辑区最小高度，默认 360px */
  minHeight?: number
  ariaLabel?: string
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  minHeight = 360,
  ariaLabel,
}: RichTextEditorProps) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  /** 最近一次由本组件写入/上报的 HTML，用于区分「外部变更」与「用户输入」 */
  const lastHtmlRef = useRef(value)

  // 仅外部 value 变化（回填 / AI 草稿）时写 DOM；用户打字时不碰 DOM，光标不跳
  // 外部内容可能来自服务端/AI，写 DOM 前先净化，防粘贴内容携带脚本标签
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== lastHtmlRef.current) {
      el.innerHTML = DOMPurify.sanitize(value || '')
      lastHtmlRef.current = value
    }
  }, [value])

  useEffect(() => {
    const el = editorRef.current
    if (el) el.contentEditable = disabled ? 'false' : 'true'
  }, [disabled])

  /** 读取 DOM 内容上报；清空残留 <br> 让 placeholder 能重新显示 */
  const emit = () => {
    const el = editorRef.current
    if (!el) return
    if (!el.textContent?.trim() && !el.querySelector('li,img,blockquote')) el.innerHTML = ''
    lastHtmlRef.current = el.innerHTML
    onChange(el.innerHTML)
  }

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  /** 清除格式：inline 样式与块级标题一起复位为正文段落 */
  const clearFormat = () => {
    editorRef.current?.focus()
    document.execCommand('removeFormat')
    document.execCommand('formatBlock', false, '<p>')
    emit()
  }

  // mousedown 阻止默认，避免工具栏抢焦点导致选区丢失
  const hold = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() }

  return (
    <div className={`rte${disabled ? ' rte--disabled' : ''}`}>
      <div className="rte__toolbar">
        <button type="button" className="rte__btn" title={t('common.richText.bold', { defaultValue: '粗體' })} aria-label={t('common.richText.bold', { defaultValue: '粗體' })} {...hold} onClick={() => exec('bold')}>
          <BoldOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.italic', { defaultValue: '斜體' })} aria-label={t('common.richText.italic', { defaultValue: '斜體' })} {...hold} onClick={() => exec('italic')}>
          <ItalicOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.underline', { defaultValue: '底線' })} aria-label={t('common.richText.underline', { defaultValue: '底線' })} {...hold} onClick={() => exec('underline')}>
          <UnderlineOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.strike', { defaultValue: '刪除線' })} aria-label={t('common.richText.strike', { defaultValue: '刪除線' })} {...hold} onClick={() => exec('strikeThrough')}>
          <StrikethroughOutlined />
        </button>
        <span className="rte__split" />
        <button type="button" className="rte__btn" title={t('common.richText.paragraph', { defaultValue: '正文段落' })} {...hold} onClick={() => exec('formatBlock', '<p>')}>
          {t('common.richText.paragraphShort', { defaultValue: '正文' })}
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.h2', { defaultValue: '標題二' })} {...hold} onClick={() => exec('formatBlock', '<h2>')}>
          H2
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.h3', { defaultValue: '標題三' })} {...hold} onClick={() => exec('formatBlock', '<h3>')}>
          H3
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.quote', { defaultValue: '引用塊' })} {...hold} onClick={() => exec('formatBlock', '<blockquote>')}>
          {t('common.richText.quoteShort', { defaultValue: '引用' })}
        </button>
        <span className="rte__split" />
        <button type="button" className="rte__btn" title={t('common.richText.ol', { defaultValue: '有序清單' })} aria-label={t('common.richText.ol', { defaultValue: '有序清單' })} {...hold} onClick={() => exec('insertOrderedList')}>
          <OrderedListOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.ul', { defaultValue: '無序清單' })} aria-label={t('common.richText.ul', { defaultValue: '無序清單' })} {...hold} onClick={() => exec('insertUnorderedList')}>
          <UnorderedListOutlined />
        </button>
        <span className="rte__split" />
        <button type="button" className="rte__btn" title={t('common.richText.undo', { defaultValue: '撤銷' })} aria-label={t('common.richText.undo', { defaultValue: '撤銷' })} {...hold} onClick={() => exec('undo')}>
          <UndoOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.redo', { defaultValue: '重做' })} aria-label={t('common.richText.redo', { defaultValue: '重做' })} {...hold} onClick={() => exec('redo')}>
          <RedoOutlined />
        </button>
        <button type="button" className="rte__btn" title={t('common.richText.clear', { defaultValue: '清除格式' })} aria-label={t('common.richText.clear', { defaultValue: '清除格式' })} {...hold} onClick={clearFormat}>
          <ClearOutlined />
        </button>
      </div>
      <div
        ref={editorRef}
        className="rte__editor"
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? t('common.richText.editor', { defaultValue: '富文本編輯器' })}
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}
