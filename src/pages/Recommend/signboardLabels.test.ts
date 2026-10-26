import { describe, it, expect } from 'vitest'
import {
  formatSignboardPeopleCount,
  signboardTagText,
} from './signboardLabels'

/**
 * 金字招牌标签文案口径：
 * - 人数格式化收藏/顾客数同源（1~9 原值、10~99 起始整十、100+ 中文大数）
 * - 对比类文案仅在对比范围含「品類」且门店已配置品类时拼品类
 * - 统计类优先真实人数，缺失时退回通用示例值
 */
describe('formatSignboardPeopleCount', () => {
  it('按档位格式化人数', () => {
    expect(formatSignboardPeopleCount(5)).toBe('5')
    expect(formatSignboardPeopleCount(15)).toBe('10')
    expect(formatSignboardPeopleCount(29)).toBe('20')
    expect(formatSignboardPeopleCount(99)).toBe('90')
    expect(formatSignboardPeopleCount(100)).toBe('百')
    expect(formatSignboardPeopleCount(999)).toBe('百')
    expect(formatSignboardPeopleCount(1000)).toBe('千')
    expect(formatSignboardPeopleCount(12000)).toBe('萬')
    expect(formatSignboardPeopleCount(120000)).toBe('十萬')
    expect(formatSignboardPeopleCount(1200000)).toBe('百萬')
    expect(formatSignboardPeopleCount(12000000)).toBe('千萬')
  })
})

describe('signboardTagText · 对比类', () => {
  it('全澳场景不带品类时文案不含门店品类', () => {
    expect(signboardTagText({
      labelType: 'hot',
      scenario: 'all_macau',
      qualificationScope: 'allMerchants',
      categoryName: '火鍋',
    })).toBe('全澳熱門店鋪')
  })

  it('品类范围且门店有品类时拼上门店品类', () => {
    expect(signboardTagText({
      labelType: 'hot',
      scenario: 'all_macau',
      qualificationScope: 'macauCategoryMerchants',
      categoryName: '火鍋',
    })).toBe('全澳火鍋熱門店鋪')
  })

  it('品类范围但门店未配置品类时降级为不带品类', () => {
    expect(signboardTagText({
      labelType: 'hot',
      scenario: 'district',
      regionName: '高士德區',
      qualificationScope: 'districtCategoryMerchants',
      categoryName: null,
    })).toBe('高士德區熱門店鋪')
  })

  it('商圈名缺失时回退「商圈」，复购使用回头率超高文案', () => {
    expect(signboardTagText({
      labelType: 'repurchase',
      scenario: 'district',
      regionName: '',
      qualificationScope: 'districtMerchants',
    })).toBe('商圈回頭率超高店鋪')
  })

  it('销量按排名文案输出，且不带「店鋪」后缀', () => {
    expect(signboardTagText({
      labelType: 'sales',
      scenario: 'all_macau',
      qualificationScope: 'macauCategoryMerchants',
      categoryName: '火鍋',
      rankText: '前10%',
    })).toBe('全澳火鍋銷量前10%')
  })
})

describe('signboardTagText · 统计类', () => {
  it('收藏使用真实人数并按档位格式化', () => {
    expect(signboardTagText({ labelType: 'favorites', actualCount: 1234 }))
      .toBe('千人收藏好店')
    expect(signboardTagText({ labelType: 'favorites', actualCount: 18 }))
      .toBe('10人收藏好店')
  })

  it('顾客数使用真实人数并按档位格式化', () => {
    expect(signboardTagText({ labelType: 'customers', actualCount: 100 }))
      .toBe('近期百人下單')
    expect(signboardTagText({ labelType: 'customers', actualCount: 7 }))
      .toBe('近期7人下單')
  })

  it('无真实人数时退回通用示例值（收藏千人、顾客数百人）', () => {
    expect(signboardTagText({ labelType: 'favorites', actualCount: null }))
      .toBe('千人收藏好店')
    expect(signboardTagText({ labelType: 'customers', actualCount: null }))
      .toBe('近期百人下單')
  })
})
