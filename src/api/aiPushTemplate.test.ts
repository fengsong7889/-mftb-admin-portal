import { describe, expect, it } from 'vitest'
import { renderTemplate } from './aiPushTemplate'

describe('推送模板占位符渲染', () => {
  it('替换已知占位符，保留换行与 Markdown', () => {
    const tpl = '## {{projectName}}（{{projectNo}}）\n- PM：{{pm}}'
    const out = renderTemplate(tpl, {
      projectName: '會員增長',
      projectNo: 'SP202610001',
      pm: '李四',
    })
    expect(out).toBe('## 會員增長（SP202610001）\n- PM：李四')
  })

  it('未知占位符渲染为 --，避免把 {{xxx}} 直接发到群里', () => {
    expect(renderTemplate('負責人：{{unknownKey}}', {})).toBe('負責人：--')
  })

  it('容忍占位符内的空格', () => {
    expect(renderTemplate('{{ projectName }}', { projectName: 'A' })).toBe('A')
  })

  it('值为空时同样回落 --', () => {
    expect(renderTemplate('{{note}}', { note: '' })).toBe('--')
  })
})
