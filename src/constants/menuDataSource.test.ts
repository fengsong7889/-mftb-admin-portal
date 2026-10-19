import { describe, expect, it } from 'vitest'
import {
  RDM_SUBMIT_FROM_MENUS,
  RDM_SUBMIT_PATH,
  buildRdmSubmitPath,
  keyToPath,
  resolveRdmSubmitBackMenuKey,
} from './menuDataSource'

/**
 * 「提交需求」表单页返回落点的解析规则。
 *
 * 钉住三件事：
 *  1. 返回跟随进入来源（提需求菜单 / 需求跟进清单 / 工作台），修掉「从提需求进来点返回却落工作台」；
 *  2. from 是 URL 可控参数，白名单外的值一律当无来源，不得被拿去当跳转路径（开放重定向）；
 *  3. 无来源时的默认落点保持历史口径：草稿回「提需求」（草稿只在那张页展示），新建回工作台。
 */

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
