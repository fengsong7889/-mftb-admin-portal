import { describe, expect, it } from 'vitest'
import {
  DOC_CLEARANCE_LEVEL, DOC_CONFIDENTIALITY, DOC_CONTENT_KIND, formatDocKnowledgeTime,
  newDocKnowledgeKey, splitDocTags,
} from './docKnowledge'

describe('知识库 API 纯函数', () => {
  it('标签快照按逗号拆分并去空', () => {
    expect(splitDocTags('入职, 结算, , 接口')).toEqual(['入职', '结算', '接口'])
    expect(splitDocTags(undefined)).toEqual([])
  })

  it('枚举值与后端整型契约一致', () => {
    expect(DOC_CONTENT_KIND.MARKDOWN).toBe(1)
    expect(DOC_CONTENT_KIND.PDF).toBe(2)
    expect(DOC_CONTENT_KIND.OFFICE).toBe(3)
    expect(DOC_CONTENT_KIND.LINK).toBe(4)
    expect(DOC_CONFIDENTIALITY.PUBLIC).toBe(1)
    expect(DOC_CONFIDENTIALITY.RESTRICTED).toBe(4)
    expect(DOC_CLEARANCE_LEVEL.SENSITIVE).toBe(3)
  })

  it('时间格式化兼容毫秒时间戳与空值', () => {
    expect(formatDocKnowledgeTime(null)).toBe('—')
    expect(formatDocKnowledgeTime(1792720800000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('幂等键带前缀且长度足够', () => {
    const key = newDocKnowledgeKey('knowledge')
    expect(key.startsWith('knowledge-')).toBe(true)
    expect(key.length).toBeGreaterThanOrEqual(18)
  })
})
