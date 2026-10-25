import { describe, expect, it } from 'vitest'
import type { DocApiCatalogEntry } from '@/api/docCatalog'
import { docGaps, parseRequestParams, parseResponseSchema } from './docApiSchema'

function entry(overrides: Partial<DocApiCatalogEntry> = {}): DocApiCatalogEntry {
  return {
    id: 1, systemCode: 'doc', systemName: '文檔中心系統', method: 'GET', path: '/api/doc/x',
    handler: 'XController#x', source: 'code', visibility: 1, docStatus: 1, active: true,
    syncedAt: 1792720800000, ...overrides,
  }
}

describe('parseRequestParams', () => {
  it('解析位置、必填、說明與 DTO 字段樹', () => {
    const rows = parseRequestParams(entry({
      requestSchema: JSON.stringify([
        { name: 'page', type: 'int', location: 'query', required: false, description: '頁碼，從 1 開始' },
        {
          name: 'body', type: 'DemoSave', location: 'body', required: true,
          children: [{ name: 'title', type: 'String', typeLabel: '字串', required: true, description: '標題', path: 'body.title' }],
        },
      ]),
    }))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'page', location: 'query', required: false, description: '頁碼，從 1 開始' })
    expect(rows[1].children?.[0]).toMatchObject({ name: 'title', required: true, description: '標題' })
  })

  it('舊數據或損壞 JSON 按空處理，不拋錯', () => {
    expect(parseRequestParams(null)).toEqual([])
    expect(parseRequestParams(entry({ requestSchema: 'not-json' }))).toEqual([])
    expect(parseRequestParams(entry({ requestSchema: JSON.stringify([{ type: 'int' }]) }))).toEqual([])
  })
})

describe('parseResponseSchema', () => {
  it('保留嵌套字段与枚舉值', () => {
    const schema = parseResponseSchema(entry({
      responseFields: JSON.stringify({
        raw: 'Result<PageResult<DemoVO>>',
        fields: [{
          path: 'data', name: 'data', type: 'PageResult<DemoVO>', typeLabel: '物件',
          children: [{
            path: 'data.records[]', name: 'records', type: 'List<DemoVO>', typeLabel: '陣列',
            children: [{ path: 'data.records[].status', name: 'status', type: 'DemoStatus', typeLabel: '枚舉', enumValues: ['ACTIVE', 'OFF'] }],
          }],
        }],
      }),
    }))
    expect(schema.raw).toBe('Result<PageResult<DemoVO>>')
    expect(schema.fields[0].children?.[0].children?.[0]).toMatchObject({ name: 'status', enumValues: ['ACTIVE', 'OFF'] })
  })

  it('缺字段或非法 JSON 返回空結構', () => {
    expect(parseResponseSchema(entry())).toEqual({ raw: '', fields: [] })
    expect(parseResponseSchema(entry({ responseFields: '{"fields":"x"}' }))).toEqual({ raw: '', fields: [] })
  })
})

describe('docGaps', () => {
  it('四項全缺時逐項列出', () => {
    expect(docGaps(entry())).toEqual(['name', 'schema', 'example', 'errors'])
  })

  it('補齊名稱、出參結構、響應示例、錯誤碼後為空', () => {
    const gaps = docGaps(entry({
      apiName: '查詢文檔', apiNameSource: 'manual',
      responseFields: JSON.stringify({ raw: 'Result<Void>', fields: [{ name: 'code', type: 'Integer' }] }),
      responseExample: '{"code":200}', errorCodes: '200 成功',
    }))
    expect(gaps).toEqual([])
  })
})
