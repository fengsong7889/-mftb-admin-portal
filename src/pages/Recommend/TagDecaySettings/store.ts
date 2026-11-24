/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分，属专有代码。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useSyncExternalStore } from 'react'
import i18n from '@/i18n'
import { useAuth } from '@/contexts/AuthContext'

/** 全局标签衰变只有一套规则，不按算法、品牌或业务 Tab 分副本。 */
export const TAG_DECAY_POLICY = 'global-tag-decay' as const
/** label 不带单位：单位由输入框 suffix 展示在后方（AGENTS.md「配置参数单位置于输入框后方」）。 */
export const TAG_DECAY_FIELDS = {
  merchantDecayDays: { label: '商家衰變週期', unit: '天', min: 1, max: 365 },
  merchantDecayPoints: { label: '商家每次減分', unit: '分', min: 1, max: 100 },
  merchantTagIdleClearDays: { label: '商家無新增清理', unit: '天', min: 1, max: 365 },
  userDecayDays: { label: '用戶衰變週期', unit: '天', min: 1, max: 365 },
  userDecayPoints: { label: '用戶每次減分', unit: '分', min: 1, max: 100 },
  userTagIdleClearDays: { label: '用戶無新增清理', unit: '天', min: 1, max: 365 },
  merchantSaturationCap: { label: '商家有效分上限', unit: '分', min: 10, max: 100000 },
  userSaturationCap: { label: '用戶有效分上限', unit: '分', min: 10, max: 100000 },
} as const
/** 衰变三参数（周期/减分/闲置）与饱和上限（B）分属两组配置，UI 分开渲染。 */
export const SATURATION_CAP_FIELDS = ['merchantSaturationCap', 'userSaturationCap'] as const
export type DecayField = keyof typeof TAG_DECAY_FIELDS
/** 字段文案 key（与投流 trafficFieldKey 同口径）：label 只作 defaultValue 兜底，真源在 zh-TW/en 静态包。 */
export const decayFieldKey = (name: DecayField): string => `recommend.tagDecay.field.${name}`
/** 单位复用全站既有分值/天数键，避免同一单位两种译法；其余单位按码位编码。 */
export const decayUnitKey = (unit: string): string => unit === '天' ? 'recommend.dayUnit'
  : unit === '分' ? 'recommend.scoreUnit'
    : `recommend.tagDecay.unit.u${Array.from(unit, c => c.codePointAt(0)!.toString(16)).join('_')}`
export const decayFieldLabel = (name: DecayField): string => i18n.t(decayFieldKey(name), { defaultValue: TAG_DECAY_FIELDS[name].label })
export const decayUnitLabel = (unit: string): string => i18n.t(decayUnitKey(unit), { defaultValue: unit })
export interface TagDecayValues {
  merchantDecayDays: number
  merchantDecayPoints: number
  merchantTagIdleClearDays: number | null
  userDecayDays: number
  userDecayPoints: number
  userTagIdleClearDays: number | null
  merchantSaturationCap: number
  userSaturationCap: number
}
export interface TagDecayPolicy { values: Readonly<TagDecayValues>; revision: number }
const DEFAULT_POLICY: TagDecayPolicy = { revision: 1, values: {
  merchantDecayDays: 7, merchantDecayPoints: 1, merchantTagIdleClearDays: 30,
  userDecayDays: 14, userDecayPoints: 1, userTagIdleClearDays: 30,
  // 飽和壓縮（B）的默認基礎上線：商家日出單量大、走量累積極快，故給高預設避免過早觸頂；用戶去重增長較慢。
  merchantSaturationCap: 50000, userSaturationCap: 1000,
} }
/** P1 工作副本按操作者隔离，非业务分域；尚不写入生产全局设置。 */
const policies = new Map<string, TagDecayPolicy>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getTagDecayPolicy = (account: string) => policies.get(account) ?? DEFAULT_POLICY
export function decayFieldError(name: DecayField, value: unknown): string | undefined {
  if (name.endsWith('IdleClearDays') && value === null) return
  const { unit, min, max } = TAG_DECAY_FIELDS[name]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    // 插值位序交给译文本身：英文语序（between … and …）与繁中不同，不能在代码里拼句子。
    return i18n.t('recommend.tagDecay.error.integerRange', {
      label: decayFieldLabel(name), min, max, unit: decayUnitLabel(unit),
      defaultValue: '{{label}}須為 {{min}}–{{max}} {{unit}} 之間的整數',
    })
  }
}
export function saveTagDecayPolicy(account: string, values: TagDecayValues, expectedRevision: number) {
  if (!account || (Object.keys(TAG_DECAY_FIELDS) as DecayField[]).some(key => decayFieldError(key, values[key]))) {
    throw new Error(i18n.t('recommend.tagDecay.error.invalidPolicy', { defaultValue: '全局標籤衰變規則無效' }))
  }
  const current = getTagDecayPolicy(account)
  if (current.revision !== expectedRevision) throw new Error(i18n.t('recommend.tagDecay.error.revisionConflict', { defaultValue: '規則已更新，請重新載入後再保存' }))
  // 只存全局字段；不接受算法参数或记录副本。
  const next = { revision: current.revision + 1, values: Object.fromEntries(Object.keys(TAG_DECAY_FIELDS).map(key => [key, values[key as DecayField]])) as unknown as TagDecayValues }
  policies.set(account, next)
  listeners.forEach(listener => listener())
}
export function useTagDecayPolicy() {
  const { user } = useAuth()
  const account = user?.username ?? ''
  const policy = useSyncExternalStore(subscribe, () => getTagDecayPolicy(account))
  return { account, policy }
}
