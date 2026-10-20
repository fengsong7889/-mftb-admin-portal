/**
 * 纪要展示元数据与投递明细口径的回归用例。
 *
 * <p>会议域踩过两次同一形状的坑：后端词表加了一个取值而前端映射表没跟上，
 * 界面就直接吐裸英文码（`sent`/`partial` 那次是全模块一起改的）。
 * 这里把"后端可能出现的每个取值都必须有中文标签"钉成断言，
 * 而不是等下一次加状态时再由用户看见。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import { minutesStatusMeta, minutesTargetTypeLabels, notifyStatusMeta } from '../meetingMeta'
import { minutesContentLength, minutesDeliveryTarget, emptyMinutesContent } from '../../../api/meetingMinutes'
import type { MinutesDeliveryVO } from '../../../api/meetingMinutes'
import i18nZh from '../../../i18n/locales/zh-TW.json'
import i18nEn from '../../../i18n/locales/en.json'

/** 后端 MeetingConstants 里纪要批次与明细可能给出的全部取值（加状态必须同步这张表） */
const SEND_STATUSES = ['pending', 'sending', 'success', 'partial', 'skipped', 'failed']
const MINUTES_STATUSES = ['draft', 'sent']

describe('會議紀要詞表與明細口徑', () => {
  // 测试环境的初始语言不是繁中，不显式切语言时“后端每个取值都要有中文标签”这类断言会打空
  beforeEach(async () => { await i18n.changeLanguage('zh-TW') })

  it('每个投递状态都有可读标签，不会吐裸英文码', () => {
    const meta = notifyStatusMeta()
    SEND_STATUSES.forEach(status => {
      expect(meta[status]?.label, `缺少投遞態標籤：${status}`).toBeTruthy()
      expect(meta[status].label, `標籤與取值同字：${status}`).not.toBe(status)
    })
  })

  it('纪要主状态与投递态分开：单据状态读作「已發送」而不是渠道结论「已送達」', () => {
    const minutes = minutesStatusMeta()
    MINUTES_STATUSES.forEach(status => {
      expect(minutes[status]?.label, `缺少紀要狀態標籤：${status}`).toBeTruthy()
    })
    expect(minutes.sent.label).toBe('已發送')
    expect(notifyStatusMeta().success.label).toBe('已送達')
  })

  it('投递目标两种都有名称', () => {
    const labels = minutesTargetTypeLabels()
    expect(labels.GROUP).toBe('釘釘群')
    expect(labels.USER).toBeTruthy()
  })

  it('群行用群名占位「接收人」列，个人行带工号：两种目标在一张表里必须分得开', () => {
    const group: MinutesDeliveryVO = {
      id: 1, targetType: 'GROUP', sendStatus: 'success', groupName: '行政通知群',
    }
    const person: MinutesDeliveryVO = {
      id: 2, targetType: 'USER', sendStatus: 'skipped', receiverName: '張三', receiverEmpNo: 'MF00001',
    }
    expect(minutesDeliveryTarget(group)).toBe('行政通知群')
    expect(minutesDeliveryTarget(person)).toBe('張三（MF00001）')
  })

  it('字数统计按可读正文而不是 JSON 长度：上限校验才不会随字段名变化而漂移', () => {
    const content = emptyMinutesContent()
    content.items = [{ topic: '甲', discussion: '乙', conclusion: '丙' }]
    content.actions = [{ content: '丁', ownerName: '張三' }]
    // 甲/乙/丙/丁 + 負責人两个字 = 6（只算正文文字，负责人 id 与日期不计）
    expect(minutesContentLength(content)).toBe(6)
  })

  it('新增的纪要键在繁中与英文两语都登记（门禁要求 key 集合对齐）', () => {
    const zhMinutes = i18nZh.meeting.minutes as Record<string, unknown>
    const enMinutes = i18nEn.meeting.minutes as Record<string, unknown>
    const zhMeta = i18nZh.meeting.meta as Record<string, Record<string, unknown>>
    const enMeta = i18nEn.meeting.meta as Record<string, Record<string, unknown>>
    expect(Object.keys(zhMinutes).length).toBeGreaterThan(80)
    Object.keys(zhMinutes).forEach(key => expect(enMinutes[key], `英文缺 key：meeting.minutes.${key}`).toBeDefined())
    Object.keys(zhMeta.minutesStatus).forEach(key => expect(enMeta.minutesStatus[key], `英文缺 minutesStatus.${key}`).toBeDefined())
    Object.keys(zhMeta.minutesTarget).forEach(key => expect(enMeta.minutesTarget[key]).toBeDefined())
    expect(zhMeta.event.minutesCreate).toBeTruthy()
    expect(enMeta.event.minutesSend).toBeTruthy()
    expect(zhMeta.scenario.minutes).toBeTruthy()
  })

  it('标签在切换语言后跟着变（模块级常量会在 import 时冻结语言）', async () => {
    await i18n.changeLanguage('en')
    expect(notifyStatusMeta().partial.label).toBe('Partly delivered')
    expect(minutesStatusMeta().draft.label).toBe('Draft')
    await i18n.changeLanguage('zh-TW')
    expect(notifyStatusMeta().partial.label).toBe('部分送達')
  })
})
