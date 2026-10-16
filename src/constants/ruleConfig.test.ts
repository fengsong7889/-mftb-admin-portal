import { describe, expect, it } from 'vitest'
import { formatSeqExample } from './ruleConfig'

/**
 * 编号示例与后端发号口径的一致性测试（需求提交/需求管理拆分 · 未完成清单第 3 项）。
 *
 * <p>为什么单独测这个纯函数：「編號生成規則」页的示例是管理员唯一能看见的编号形态，
 * 而 {@code BizSeqService} 对 seq_start=0 与 seq_start=1 的处理完全不同
 * （前者表内从 1 计数但编号从 0000 起，后者直接用表内值）。示例算错，配置页和实际
 * 发出的号就是两套口径 —— XQSP 每日从 01 起，被展成 00 时没人会发现发号器其实是对的。
 */
describe('formatSeqExample', () => {
  it('seqStart=1 时首号从 01 起，不再统一补零成 00', () => {
    // XQSP：每日从 01 起、最少 2 位
    expect(formatSeqExample('XQSP', 'YYYYMMDD', 2, 1)).toBe('XQSP2026081201')
    // XQ：正式需求号 4 位，同样 0001 起步
    expect(formatSeqExample('XQ', 'YYYYMMDD', 4, 1)).toBe('XQ202608120001')
  })

  it('seqStart 为 0 或缺省时保持既有「从 0000 起」口径，不顺手改全部规则的首号', () => {
    expect(formatSeqExample('DDWD', 'YYYYMMDD', 4, 0)).toBe('DDWD202608120000')
    expect(formatSeqExample('DDWD', 'YYYYMMDD', 4)).toBe('DDWD202608120000')
    expect(formatSeqExample('DDWD', 'YYYYMMDD', 4, undefined)).toBe('DDWD202608120000')
  })

  it('seqStart 大于 1 时按该起点展示（照实反映表内值，不假装从 01 起）', () => {
    expect(formatSeqExample('ZZ', 'YYYYMMDD', 4, 100)).toBe('ZZ202608120100')
  })

  it('无日期维度的规则不拼日期段', () => {
    expect(formatSeqExample('MD', '', 6, 1)).toBe('MD000001')
    expect(formatSeqExample('JT', undefined, 6, 1)).toBe('JT000001')
  })

  it('YYYYMM / YYMM 各按自己的日期段长度展示', () => {
    expect(formatSeqExample('JSED', 'YYYYMM', 3, 0)).toBe('JSED202608000')
    expect(formatSeqExample('AG', 'YYYYMM', 4, 1)).toBe('AG2026080001')
    expect(formatSeqExample('XX', 'YYMM', 3, 1)).toBe('XX2608001')
  })

  it("人工编码（前缀 '-'）不生成示例，避免把无规则的编码伪造成可推导格式", () => {
    expect(formatSeqExample('-', 'YYYYMMDD', 4, 1)).toBe('')
  })
})
