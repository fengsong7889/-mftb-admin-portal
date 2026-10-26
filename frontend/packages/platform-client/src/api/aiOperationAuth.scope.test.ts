import { describe, expect, it } from 'vitest'
import { parseToolScope, serializeToolScope } from './aiOperationAuth'

describe('工具可见范围序列化', () => {
  it('解析角色与部门，过滤脏值', () => {
    expect(parseToolScope('{"roles":["rdm_pm",1],"depts":[12,"15",null]}')).toEqual({
      roles: ['rdm_pm', '1'],
      depts: [12, 15],
    })
  })

  it('缺失或损坏时按全员可见处理', () => {
    expect(parseToolScope(null)).toEqual({ roles: [], depts: [] })
    expect(parseToolScope('not-json')).toEqual({ roles: [], depts: [] })
    expect(parseToolScope('{"roles":"x"}')).toEqual({ roles: [], depts: [] })
  })

  it('空范围也要保留字段，方便运营看出“未限制”', () => {
    expect(serializeToolScope({ roles: [], depts: [] })).toBe('{"roles":[],"depts":[]}')
    expect(serializeToolScope({ roles: ['rdm_pm'], depts: [3] })).toBe('{"roles":["rdm_pm"],"depts":[3]}')
  })

  it('序列化后可无损解析', () => {
    const scope = { roles: ['rdm_pm', 'rdm_dev'], depts: [7, 9] }
    expect(parseToolScope(serializeToolScope(scope))).toEqual(scope)
  })
})
