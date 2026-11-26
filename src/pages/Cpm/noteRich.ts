/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 備註富文本的淨化與降級讀取。
 *
 * 備註以「淨化後的 HTML」存儲（編輯器 execCommand 產出），展示前必須再過一次
 * 白名單淨化（存儲可能被旧版本/外部写入污染）；搜索/匯報 Markdown/CSV 走
 * noteToText 純文本降級，保證「導出文本 = 頁面文本」不被標籤污染。
 * 白名單只放行排版標籤與有限 style 屬性，script/style/iframe 等連內容丟棄。
 */

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'BR', 'DIV', 'P', 'FONT', 'OL', 'UL', 'LI', 'H2', 'H3', 'BLOCKQUOTE', 'HR'])
const ALLOWED_STYLE = ['color', 'font-weight', 'font-size', 'font-style', 'text-decoration', 'font-family']
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META'])

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function sanitizeNoteHtml(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return escapeHtml(html)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const ser = (n: Node): string => {
    if (n.nodeType === 3) return escapeHtml(n.textContent || '')
    if (n.nodeType !== 1) return ''
    const el = n as Element
    const tag = el.tagName
    if (DROP_TAGS.has(tag)) return ''
    const kids = Array.from(el.childNodes).map(ser).join('')
    if (!ALLOWED_TAGS.has(tag)) return kids
    if (tag === 'BR') return '<br>'
    if (tag === 'HR') return '<hr>'
    const styles: string[] = []
    const rawStyle = el.getAttribute('style') || ''
    rawStyle.split(';').forEach(pair => {
      const idx = pair.indexOf(':')
      if (idx < 0) return
      const key = pair.slice(0, idx).trim().toLowerCase()
      // 值里的双引号必须剥：fontName 产出 font-family:"Microsoft YaHei"，
      // 带引号回写进 style="…" 会把属性截断成非法 HTML（后端同口径）
      const val = pair.slice(idx + 1).trim().replace(/"/g, '')
      if (ALLOWED_STYLE.includes(key) && val && !/url\(|expression|javascript:/i.test(val)) {
        styles.push(`${key}:${val}`)
      }
    })
    if (tag === 'FONT') {
      const color = el.getAttribute('color')
      if (color && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(color)) styles.push(`color:${color}`)
    }
    const styleAttr = styles.length ? ` style="${styles.join(';')}"` : ''
    const outTag = tag === 'FONT' ? 'span' : tag.toLowerCase()
    return `<${outTag}${styleAttr}>${kids}</${outTag}>`
  }
  return Array.from(doc.body.childNodes).map(ser).join('')
}

/** 純文本降級：搜索、匯報 Markdown、CSV 共用 */
export function noteToText(note: string): string {
  if (!note) return ''
  if (!/[<>&]/.test(note)) return note
  if (typeof DOMParser === 'undefined') return note.replace(/<[^>]*>/g, '')
  const prepared = sanitizeNoteHtml(note)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h2|h3|blockquote)>/gi, '\n')
  const doc = new DOMParser().parseFromString(prepared, 'text/html')
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

/** 展示用：旧版純文本備註自動 escape + 換行轉 br；富文本走淨化 */
export function noteToDisplayHtml(note: string): string {
  if (!note) return ''
  if (!note.includes('<')) return escapeHtml(note).replace(/\n/g, '<br>')
  return sanitizeNoteHtml(note)
}