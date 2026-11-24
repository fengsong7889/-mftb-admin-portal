/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it } from 'vitest'
import { escapeHtml, noteToDisplayHtml, noteToText, sanitizeNoteHtml } from './noteRich'

/**
 * 備註富文本的净化与降级单测。
 *
 * 备注是「用户输入 → 存本地 → 再渲染」的路径，界面用 dangerouslySetInnerHTML 展示，
 * 所以净化必须双保险（存储可能被旧版本或外部写入污染）；
 * 同时导出/搜索/汇报走纯文本降级，保证「导出文本 = 页面文本」不被标签污染。
 */

describe('sanitizeNoteHtml 白名单', () => {
  it('放行排版标签与有限 style，其余标签只剥壳不丢内容', () => {
    expect(sanitizeNoteHtml('<b>粗</b><i>斜</i><u>底線</u>')).toBe('<b>粗</b><i>斜</i><u>底線</u>')
    expect(sanitizeNoteHtml('<h1>標題</h1>')).toBe('標題')
    expect(sanitizeNoteHtml('<span style="color:#ff0000">紅</span>')).toBe('<span style="color:#ff0000">紅</span>')
  })

  it('script/style/iframe 连内容一起丢弃', () => {
    expect(sanitizeNoteHtml('<script>alert(1)</script>安全')).toBe('安全')
    expect(sanitizeNoteHtml('<style>body{color:red}</style>文字')).toBe('文字')
    expect(sanitizeNoteHtml('<iframe src="https://evil"></iframe>正文')).toBe('正文')
  })

  it('事件属性与危险 style 值一律不进白名单', () => {
    expect(sanitizeNoteHtml('<span onclick="alert(1)">文字</span>')).toBe('<span>文字</span>')
    expect(sanitizeNoteHtml('<span style="color:red;position:absolute;background:url(javascript:1)">文字</span>'))
      .toBe('<span style="color:red">文字</span>')
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">連結</a>')).toBe('連結')
    expect(sanitizeNoteHtml('<img src="x" onerror="alert(1)">')).toBe('')
  })

  it('FONT 降级为带色 span，颜色值只收十六进制与颜色名', () => {
    expect(sanitizeNoteHtml('<font color="#00f">藍</font>')).toBe('<span style="color:#00f">藍</span>')
    expect(sanitizeNoteHtml('<font color="red">紅</font>')).toBe('<span style="color:red">紅</span>')
    expect(sanitizeNoteHtml('<font color="javascript:alert(1)">壞</font>')).toBe('<span>壞</span>')
  })

  it('文本里的尖括号被转义，不会被当成标签吞掉', () => {
    expect(sanitizeNoteHtml('a &lt; b &amp; c')).toBe('a &lt; b &amp; c')
    expect(sanitizeNoteHtml('')).toBe('')
  })
})

describe('noteToText 纯文本降级', () => {
  it('旧版纯文本原样返回（含换行），不做二次转义', () => {
    expect(noteToText('1，需求已上線。\n2，等待驗收。')).toBe('1，需求已上線。\n2，等待驗收。')
  })

  it('富文本按块换行，标签与样式全部消失', () => {
    expect(noteToText('<div>第一段</div><div>第二段</div>')).toBe('第一段\n第二段')
    expect(noteToText('第一行<br>第二行')).toBe('第一行\n第二行')
    expect(noteToText('<b>加粗</b>與<span style="color:red">紅色</span>')).toBe('加粗與紅色')
    expect(noteToText('<script>alert(1)</script>安全')).toBe('安全')
    expect(noteToText('')).toBe('')
  })

  it('连续空行收敛为最多一个空行，导出不会出现整屏空白', () => {
    const text = noteToText('<div>a</div><div></div><div></div><div></div><div>b</div>')
    expect(text).toBe('a\n\nb')
    expect(/\n{3,}/.test(text)).toBe(false)
  })
})

describe('noteToDisplayHtml 展示', () => {
  it('旧纯文本转义后把换行变 br，长文悬停仍能分行读', () => {
    expect(noteToDisplayHtml('行一\n行二')).toBe('行一<br>行二')
    expect(noteToDisplayHtml('5 < 7 & 8 > 1')).toBe('5 &lt; 7 &amp; 8 &gt; 1')
  })

  it('富文本走净化后再渲染，脚本不会进 DOM', () => {
    const html = noteToDisplayHtml('<b>粗</b><script>evil()</script>')
    expect(html).toBe('<b>粗</b>')
    expect(html).not.toContain('script')
  })

  it('escapeHtml 覆盖 & < > " 四个字符', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
  })
})
