import { describe, expect, it } from 'vitest'
import {
  RDM_SUBMIT_FROM_MENUS,
  RDM_SUBMIT_PATH,
  buildRdmSubmitPath,
  keyToPath,
  pathToKey,
  isPathBackendConnected,
  resolveRdmSubmitBackMenuKey,
} from './menuDataSource'
import { CONTROLLED_MENU_KEYS, MENU_ACTIONS_MAP, ROUTE_MENU_KEY_MAP } from '../pages/Permission/types'

/**
 * 「提交需求」表单页返回落点的解析规则。
 *
 * 钉住三件事：
 *  1. 返回跟随进入来源（提需求菜单 / 需求跟进清单 / 工作台），修掉「从提需求进来点返回却落工作台」；
 *  2. from 是 URL 可控参数，白名单外的值一律当无来源，不得被拿去当跳转路径（开放重定向）；
 *  3. 无来源时的默认落点保持历史口径：草稿回「提需求」（草稿只在那张页展示），新建回工作台。
 */

describe('Doc Native 菜单登记', () => {
  it.each([['doc-plans', '/doc-plans'], ['doc-governance', '/doc-governance']])('菜单 %s 同步导航、受控清单和离线阻断', (key, path) => {
    expect(keyToPath[key]).toBe(path)
    expect(pathToKey[path]).toBe(key)
    expect(ROUTE_MENU_KEY_MAP[path]).toBe(key)
    expect(CONTROLLED_MENU_KEYS).toContain(key)
    expect(isPathBackendConnected(path)).toBe(true)
  })
  it('知识库详情与分类治理子页复用父菜单锚点', () => {
    expect(pathToKey['/doc-center/knowledge']).toBe('doc-library')
    expect(ROUTE_MENU_KEY_MAP['/doc-center/knowledge']).toBe('doc-library')
    expect(isPathBackendConnected('/doc-center/knowledge')).toBe(true)
    expect(pathToKey['/doc-center/my-acks']).toBe('doc-library')
    expect(ROUTE_MENU_KEY_MAP['/doc-center/my-acks']).toBe('doc-library')
    expect(isPathBackendConnected('/doc-center/my-acks')).toBe(true)
    expect(pathToKey['/doc-governance/taxonomy']).toBe('doc-governance')
    expect(ROUTE_MENU_KEY_MAP['/doc-governance/taxonomy']).toBe('doc-governance')
    expect(isPathBackendConnected('/doc-governance/taxonomy')).toBe(true)
    expect(pathToKey['/doc-governance/clearance']).toBe('doc-governance')
    expect(ROUTE_MENU_KEY_MAP['/doc-governance/clearance']).toBe('doc-governance')
    expect(isPathBackendConnected('/doc-governance/clearance')).toBe(true)
  })
  it('回执详情只复用方案菜单，不要求旧文档库权限', () => {
    expect(pathToKey['/doc-plans/detail']).toBe('doc-plans')
    expect(ROUTE_MENU_KEY_MAP['/doc-plans/detail']).toBe('doc-plans')
    expect(isPathBackendConnected('/doc-plans/detail')).toBe(true)
    expect(MENU_ACTIONS_MAP['doc-plans'].map(action => action.key)).toEqual(['view', 'edit', 'confirm', 'export'])
    expect(MENU_ACTIONS_MAP['doc-governance'].map(action => action.key)).toEqual(['view'])
  })
})

describe('提交需求页返回落点解析', () => {
  it('from 命中白名单时返回落在点进来的那张菜单', () => {
    RDM_SUBMIT_FROM_MENUS.forEach(menuKey => {
      expect(resolveRdmSubmitBackMenuKey(`from=${menuKey}`)).toBe(menuKey)
      // 落点必须还能查回真实路由，否则按钮点了会跳到 undefined
      expect(keyToPath[menuKey]).toMatch(/^\/rdm-/)
    })
  })

  it('来源与草稿标记可以共存：带 from 时以 from 为准', () => {
    expect(resolveRdmSubmitBackMenuKey('id=91&from=rdm-requirement', true)).toBe('rdm-requirement')
  })

  it('伪造/拼错的 from 视为没有来源，不跟随 URL 参数跳转', () => {
    expect(resolveRdmSubmitBackMenuKey('from=//evil.com/x')).toBe('rdm-workbench')
    expect(resolveRdmSubmitBackMenuKey('from=rdm-intake', true)).toBe('rdm-intake-approval')
  })

  it('无来源时按草稿/新建回落：草稿回提需求，新建回工作台', () => {
    expect(resolveRdmSubmitBackMenuKey('')).toBe('rdm-workbench')
    expect(resolveRdmSubmitBackMenuKey('id=91', true)).toBe('rdm-intake-approval')
  })
})

describe('提交需求页入口 URL 构造', () => {
  it('带来源的入口把 from 拼进查询串', () => {
    expect(buildRdmSubmitPath({ from: 'rdm-intake-approval' })).toBe(`${RDM_SUBMIT_PATH}?from=rdm-intake-approval`)
    expect(buildRdmSubmitPath({ id: 91, from: 'rdm-requirement' })).toBe(`${RDM_SUBMIT_PATH}?id=91&from=rdm-requirement`)
  })

  it('无来源与白名单外来源都保持裸地址，不动历史链接形状', () => {
    expect(buildRdmSubmitPath()).toBe(RDM_SUBMIT_PATH)
    expect(buildRdmSubmitPath({ id: 91, from: 'rdm-intake' })).toBe(`${RDM_SUBMIT_PATH}?id=91`)
  })
})
