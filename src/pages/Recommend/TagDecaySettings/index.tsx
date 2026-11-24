/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分，属专有代码。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState, type ReactNode } from 'react'
import { Alert, Button, Form, InputNumber, Modal, message } from 'antd'
import { SettingOutlined, SaveOutlined, TagsOutlined, ShopOutlined, UserOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import HelpPopover from '@/components/HelpPopover'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'
import { PrototypeHeader } from '../SimilarRecommendationConfig/PrototypeParts'
import { DecayTrial } from '../TrafficAlgorithmConfig/trialCalc'
import {
  SATURATION_CAP_FIELDS, TAG_DECAY_FIELDS, decayFieldError, decayFieldKey, decayUnitKey,
  saveTagDecayPolicy, useTagDecayPolicy, type DecayField, type TagDecayValues,
} from './store'
import './index.css'

/**
 * 加分规则展示：商家／用户分栏、编号步骤、关键数字凸显；纯说明不产生表单字段。
 * 步骤正文含句中高亮，必须整句可译，因此走 <Trans> 组件插值（<c> 映射品牌色数字徽标），
 * 而不是把句子拆成碎段拼接——碎段在英文里会语序错乱。
 */
function TagScoringRules() {
  const { t } = useTranslation()
  const num = <span className="tag-scoring-num" />
  // 显式标注行类型：t() 返回 string、正文是 JSX，不标注会被推成 (string | Element)[]，
  // 解构出的 title 就不再是合法的 React key。
  const sides: Array<{ key: 'merchant' | 'user'; icon: ReactNode; title: string; badge: string; sub: string; steps: Array<[string, ReactNode]>; metrics: Array<[string, string]> }> = [
    {
      key: 'merchant', icon: <ShopOutlined aria-hidden />,
      title: t('recommend.tagDecay.rules.merchantTitle', { defaultValue: '商家側・供給熱度' }),
      badge: t('recommend.tagDecay.rules.merchantBadge', { defaultValue: '供給畫像' }),
      sub: t('recommend.tagDecay.rules.merchantSub', { defaultValue: '商家標籤熱度來自真實成交供給，以商品標準標籤為唯一畫像來源。' }),
      steps: [
        [t('recommend.tagDecay.rules.m1Title', { defaultValue: '商品帶標・畫像來源' }),
          <span key="m1">{t('recommend.tagDecay.rules.m1Body', { defaultValue: '商品自帶標準標籤，系統據此為商家建立供給側標籤畫像；標籤 ID 與用戶側同一套標準，保證跨側可匹配。' })}</span>],
        [t('recommend.tagDecay.rules.m2Title', { defaultValue: '逐件計分・完成即加' }),
          <Trans key="m2" i18nKey="recommend.tagDecay.rules.m2Body" components={{ c: num }}
            defaults="每賣出 <c>1</c> 件已完成訂單商品，其標準標籤為商家有效分 <c>+1</c>；按<c>走量</c>累加，真實交付越多、該標籤供給熱度越高。" />],
        [t('recommend.tagDecay.rules.m3Title', { defaultValue: '復購沉澱・線性累計' }),
          <Trans key="m3" i18nKey="recommend.tagDecay.rules.m3Body" components={{ c: num }}
            defaults="同標籤隨完成商品件數<c>線性</c>累加，沉澱為原始累計分，刻畫供給熱度與經營穩定度。" />],
        [t('recommend.tagDecay.rules.m4Title', { defaultValue: '有效訂單口徑' }),
          <Trans key="m4" i18nKey="recommend.tagDecay.rules.m4Body" components={{ c: num }}
            defaults="僅<c>已完成</c>訂單計分；取消、全額退款訂單不產生自增。" />],
      ],
      metrics: [
        [t('recommend.tagDecay.rules.mMetric1Value', { defaultValue: '+1' }), t('recommend.tagDecay.rules.mMetric1Label', { defaultValue: '每件完成商品' })],
        [t('recommend.tagDecay.rules.mMetric2Value', { defaultValue: '走量' }), t('recommend.tagDecay.rules.mMetric2Label', { defaultValue: '按交付件數' })],
        [t('recommend.tagDecay.rules.mMetric3Value', { defaultValue: '僅已完成' }), t('recommend.tagDecay.rules.mMetric3Label', { defaultValue: '訂單計分' })],
      ],
    },
    {
      key: 'user', icon: <UserOutlined aria-hidden />,
      title: t('recommend.tagDecay.rules.userTitle', { defaultValue: '用戶側・偏好強度' }),
      badge: t('recommend.tagDecay.rules.userBadge', { defaultValue: '偏好畫像' }),
      sub: t('recommend.tagDecay.rules.userSub', { defaultValue: '用戶偏好強度來自真實成交行為，與商家側共用同一套標籤與衰變口徑。' }),
      steps: [
        [t('recommend.tagDecay.rules.u1Title', { defaultValue: '行為帶標・偏好畫像' }),
          <span key="u1">{t('recommend.tagDecay.rules.u1Body', { defaultValue: '用戶每完成一筆訂單，商品標準標籤寫入用戶偏好畫像，不依賴點擊或瀏覽等輕行為。' })}</span>],
        [t('recommend.tagDecay.rules.u2Title', { defaultValue: '同類去重・異類累計' }),
          <Trans key="u2" i18nKey="recommend.tagDecay.rules.u2Body" components={{ c: num }}
            defaults="同一訂單中，<c>不同</c>商品命中同一標籤各 <c>+1</c>（珍珠奶茶＋芋圓奶茶＋紅豆奶茶→奶茶<c>+3</c>）；同一商品多件只計 <c>1</c> 次，避免單筆囤貨灌分。" />],
        [t('recommend.tagDecay.rules.u3Title', { defaultValue: '復購強化・強度刻畫' }),
          <Trans key="u3" i18nKey="recommend.tagDecay.rules.u3Body" components={{ c: num }}
            defaults="單內去重、單外累加：跨訂單重複購買同類標籤<c>線性</c>累計，刻畫偏好廣度與強度。" />],
        [t('recommend.tagDecay.rules.u4Title', { defaultValue: '有效訂單口徑' }),
          <Trans key="u4" i18nKey="recommend.tagDecay.rules.u4Body" components={{ c: num }}
            defaults="僅<c>已完成</c>訂單計分；與商家側共用同一衰變與閒置清理口徑。" />],
      ],
      metrics: [
        [t('recommend.tagDecay.rules.uMetric1Value', { defaultValue: '+1' }), t('recommend.tagDecay.rules.uMetric1Label', { defaultValue: '每種商品' })],
        [t('recommend.tagDecay.rules.uMetric2Value', { defaultValue: '同類去重' }), t('recommend.tagDecay.rules.uMetric2Label', { defaultValue: '異類累計' })],
        [t('recommend.tagDecay.rules.uMetric3Value', { defaultValue: '僅已完成' }), t('recommend.tagDecay.rules.uMetric3Label', { defaultValue: '訂單計分' })],
      ],
    },
  ]
  return <AlgorithmSection title={t('recommend.tagDecay.rulesSection', { defaultValue: '標籤加分規則' })} icon={<TagsOutlined />} tone="info">
    <div className="tag-scoring-grid">
      {sides.map(side => <div key={side.key} className="tag-scoring-card">
        <div className="tag-scoring-card__head">{side.icon}<span>{side.title}</span><span className="tag-scoring-card__side">{side.badge}</span></div>
        <p className="tag-scoring-card__sub">{side.sub}</p>
        {side.steps.map(([title, body], i) => <div key={title} className="tag-scoring-step">
          <span className="tag-scoring-step__index">{i + 1}</span>
          <div className="tag-scoring-step__body"><span className="tag-scoring-step__title">{title}：</span>{body}</div>
        </div>)}
        <div className="tag-scoring-metrics">
          {side.metrics.map(([n, l]) => <span key={n} className="tag-scoring-metric"><span className="tag-scoring-metric__number">{n}</span><span className="tag-scoring-metric__label">{l}</span></span>)}
        </div>
      </div>)}
    </div>
    <p className="tag-scoring-footnote">{t('recommend.tagDecay.rulesFootnote', { defaultValue: '原始累計與衰減後有效分分離儲存：衰變與閒置清理只作用於推薦有效分，不刪除原始訂單計數歷史；商家／用戶匹配門檻仍由各算法獨立設定。全局衰變保留線性基線，並提供 A 增量刷新時鐘（每次有效新增重置該標籤衰變計時，活躍標籤不被誤衰）與 B 飽和壓縮（有效分按上限非線性收斂，抑制商家走量造成的頭部膨脹）兩項可選增強，第二階段接入後端計算。' })}</p>
  </AlgorithmSection>
}

/** 算法只展示同一引用，不再提供私有衰减编辑器。 */
export function TagDecayReference() {
  const { t } = useTranslation()
  const { policy } = useTagDecayPolicy()
  const v = policy.values
  // 闲置清理可关：拆成两个 key 而不是 i18next select，避免嵌套花括号在简中生成与工作台链路上出错。
  // key 一律写字面量：动态拼接的 key 不在 check:i18n 的引用解析射程内，会变成无人看守的缺口。
  const sideBody = (side: 'merchant' | 'user') => {
    const days = side === 'merchant' ? v.merchantDecayDays : v.userDecayDays
    const points = side === 'merchant' ? v.merchantDecayPoints : v.userDecayPoints
    const clearDays = side === 'merchant' ? v.merchantTagIdleClearDays : v.userTagIdleClearDays
    if (clearDays === null) {
      return side === 'merchant'
        ? t('recommend.tagDecay.refMerchantOff', { days, points, defaultValue: `每 ${days} 天減 ${points} 分；不按閒置天數清理。` })
        : t('recommend.tagDecay.refUserOff', { days, points, defaultValue: `每 ${days} 天減 ${points} 分；不按閒置天數清理。` })
    }
    return side === 'merchant'
      ? t('recommend.tagDecay.refMerchant', { days, points, clearDays, defaultValue: `每 ${days} 天減 ${points} 分；${clearDays} 天無新增清理。` })
      : t('recommend.tagDecay.refUser', { days, points, clearDays, defaultValue: `每 ${days} 天減 ${points} 分；${clearDays} 天無新增清理。` })
  }
  return <div className="traffic-config__formula-row" role="note" aria-label={t('recommend.tagDecay.referenceAria', { defaultValue: '全局標籤衰變規則引用' })}>
    {/* locale 仍用 {{revision}} 插值供真实 i18next 翻译语序；defaultValue 写模板串，
        因为测试替身的 t() 不插值，而投流/衰变页概览断言依赖渲染后的实际版本号。 */}
    <span>{t('recommend.tagDecay.referenceLabel', { revision: policy.revision, defaultValue: `引用全局標籤衰變規則 · V${policy.revision}` })}</span>
    <HelpPopover title={t('recommend.tagDecay.title', { defaultValue: '全局標籤衰變規則' })} ariaLabel={t('recommend.tagDecay.referenceHelpAria', { defaultValue: '全局標籤衰變規則說明' })} content={[
      { label: t('recommend.tagDecay.refSingleSourceTitle', { defaultValue: '統一来源' }), body: t('recommend.tagDecay.refSingleSource', { defaultValue: '在算法庫頂部「全局標籤衰變規則」集中配置，投流及相似推薦共用，業務 Tab 不另外產生副本。' }), tone: 'info' },
      { label: t('recommend.tagDecay.sideMerchant', { defaultValue: '商家' }), body: sideBody('merchant'), tone: 'neutral' },
      { label: t('recommend.tagDecay.sideUser', { defaultValue: '用戶' }), body: sideBody('user'), tone: 'neutral' },
      { label: t('recommend.tagDecay.refBoundaryTitle', { defaultValue: '接入邊界' }), body: t('recommend.tagDecay.refBoundary', { defaultValue: '本輪只統一前端配置來源，尚未發布到真實標籤計算服務。既有後端參數待第二階段遷移，原始訂單計數不變。' }), tone: 'warn' },
    ]} />
  </div>
}
export function TagDecayEntry() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return <Button icon={<SettingOutlined />} onClick={() => {
    const next = new URLSearchParams(params)
    next.set('settings', 'tag-decay')
    navigate(`/promotion-algorithm?${next}`)
  }}>{t('recommend.tagDecay.title', { defaultValue: '全局標籤衰變規則' })}</Button>
}
export default function TagDecaySettings() {
  const { account, policy } = useTagDecayPolicy()
  return <SettingsForm key={account} account={account} initial={policy.values} revision={policy.revision} />
}
function SettingsForm({ account, initial, revision }: { account: string; initial: Readonly<TagDecayValues>; revision: number }) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [form] = Form.useForm<TagDecayValues>()
  const [values, setValues] = useState<TagDecayValues>({ ...initial })
  const [expectedRevision] = useState(revision)
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState(false)
  const canEdit = !!account && hasPermission('promotion-algorithm:edit')
  // 进入默认只读查看；仅持有编辑权限且点「编辑」后才可调整。
  const disabled = !canEdit || !editing
  const back = () => { const next = new URLSearchParams(params); next.delete('settings'); navigate(`/promotion-algorithm?${next}`) }
  const handleBack = () => {
    if (!dirty) { back(); return }
    Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></div>,
      title: t('recommend.tagDecay.discardTitle', { defaultValue: '放棄尚未保存的變更？' }), content: t('recommend.tagDecay.discardLeaveBody', { defaultValue: '全局規則尚未更新，離開將放棄本次調整。' }),
      okText: t('recommend.tagDecay.discardOk', { defaultValue: '放棄變更' }), cancelText: t('recommend.tagDecay.keepEditing', { defaultValue: '繼續編輯' }), okButtonProps: { danger: true }, onOk: back })
  }
  const handleCancel = () => {
    const revert = () => { form.setFieldsValue(initial); setValues({ ...initial }); setDirty(false); setEditing(false) }
    if (!dirty) { revert(); return }
    Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></div>,
      title: t('recommend.tagDecay.discardTitle', { defaultValue: '放棄尚未保存的變更？' }), content: t('recommend.tagDecay.discardCancelBody', { defaultValue: '全局規則尚未更新，取消將放棄本次調整並回到查看。' }),
      okText: t('recommend.tagDecay.discardOk', { defaultValue: '放棄變更' }), cancelText: t('recommend.tagDecay.keepEditing', { defaultValue: '繼續編輯' }), okButtonProps: { danger: true }, onOk: revert })
  }
  const doSave = () => {
    try { saveTagDecayPolicy(account, form.getFieldsValue(true), expectedRevision) }
    catch (error) { message.error(error instanceof Error ? error.message : t('recommend.tagDecay.saveFailed', { defaultValue: '保存失敗' })); return }
    message.success(t('recommend.tagDecay.saved', { defaultValue: '已更新本分頁共用規則，尚未發佈至後端' }))
    back()
  }
  const handleSave = async () => {
    if (disabled) return
    try { await form.validateFields() } catch { return }
    Modal.confirm({ className: 'custom-confirm-modal', icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('recommend.tagDecay.saveConfirmTitle', { defaultValue: '確認更新全局標籤衰變規則？' }), content: t('recommend.tagDecay.saveConfirmBody', { defaultValue: '保存後本分頁共用規則立即生效（所有算法引用同一全局規則，尚未發佈至後端）。' }),
      okText: t('recommend.tagDecay.saveConfirmOk', { defaultValue: '確認保存' }), cancelText: t('recommend.tagDecay.saveConfirmCancel', { defaultValue: '返回編輯' }), onOk: doSave })
  }
  return <div className="content-area similar-prototype algorithm-form-page">
    <PrototypeHeader title={t('recommend.tagDecay.title', { defaultValue: '全局標籤衰變規則' })} onBack={handleBack}>
      {!editing && canEdit && <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>{t('recommend.tagDecay.edit', { defaultValue: '編輯' })}</Button>}
    </PrototypeHeader>
    <Alert className="similar-prototype__notice" type="info" showIcon message={t('recommend.tagDecay.notice', { defaultValue: '全局規則原型：目前只在本分頁保留，刷新後清空，尚未接入後端。' })} />
    <Form form={form} layout="vertical" disabled={disabled} initialValues={initial} onValuesChange={(_, next: TagDecayValues) => { setValues(next); setDirty(true) }}>
      <TagScoringRules />
      {/* 试算入口并入模块标题行右侧（与相似推荐引擎「推薦模式」同行同口径），不再独占一行。 */}
      <AlgorithmSection title={t('recommend.tagDecay.decaySection', { defaultValue: '標籤有效分衰變' })} extra={<>
        <HelpPopover title={t('recommend.tagDecay.decayHelpTitle', { defaultValue: '衰變口徑' })} ariaLabel={t('recommend.tagDecay.decayHelpAria', { defaultValue: '衰變口徑說明' })} content={[
          { label: t('recommend.tagDecay.linearTitle', { defaultValue: '線性衰變' }), body: t('recommend.tagDecay.linear', { defaultValue: '有效分 = max(0, 初始有效分 − floor(經過天數 / 週期) × 每次減分)。原始訂單累計不刪除。' }), tone: 'info' },
          { label: t('recommend.tagDecay.idleTitle', { defaultValue: '閒置清理' }), body: t('recommend.tagDecay.idle', { defaultValue: '從最後一次有效訂單新增標籤計數起算，定時衰變不刷新該時間。清理天數留空代表不按閒置清零。' }), tone: 'neutral' },
          { label: t('recommend.tagDecay.sharedTitle', { defaultValue: '共用執行' }), body: t('recommend.tagDecay.shared', { defaultValue: '各算法只引用這套全局規則和同一份有效標籤結果，不重複衰變；匹配門檻仍由各算法獨立設定。' }), tone: 'warn' },
          { label: t('recommend.tagDecay.strategyTitle', { defaultValue: '策略組合' }), body: t('recommend.tagDecay.strategy', { defaultValue: '線性基線 + 可選 A 增量刷新衰變時鐘 + B 飽和壓縮；A 保護活躍標籤、B 抑制商家走量頭部膨脹，第二階段於後端落地。' }), tone: 'warn' },
        ]} />
        <DecayTrial values={values} />
      </>}>
        {(['merchant', 'user'] as const).map(side => <div key={side}>
          <h4 className="traffic-config__subtitle">{side === 'merchant'
            ? t('recommend.tagDecay.merchantGroup', { defaultValue: '商家標籤' })
            : t('recommend.tagDecay.userGroup', { defaultValue: '用戶標籤' })}</h4>
          <div className="tag-decay-fields">
            {(Object.keys(TAG_DECAY_FIELDS) as DecayField[]).filter(name => name.startsWith(side) && !name.endsWith('SaturationCap')).map(name => {
              const { unit, min, max } = TAG_DECAY_FIELDS[name]
              return <Form.Item key={name} name={name} label={t(decayFieldKey(name), { defaultValue: TAG_DECAY_FIELDS[name].label })} layout="horizontal" rules={[{ validator: (_, value: unknown) => {
                const error = decayFieldError(name, value); return error ? Promise.reject(new Error(error)) : Promise.resolve()
              } }]}><InputNumber min={min} max={max} precision={0} placeholder={name.endsWith('IdleClearDays') ? t('recommend.tagDecay.placeholderNoClear', { defaultValue: '留空不啟用' }) : undefined} suffix={<span className="tag-decay-unit">{t(decayUnitKey(unit), { defaultValue: unit })}</span>} /></Form.Item>
            })}
          </div>
        </div>)}
        <h4 className="traffic-config__subtitle">{t('recommend.tagDecay.saturationGroup', { defaultValue: '飽和壓縮上限' })}</h4>
        <div className="tag-decay-fields">
          {SATURATION_CAP_FIELDS.map(name => {
            const { unit, min, max } = TAG_DECAY_FIELDS[name]
            return <Form.Item key={name} name={name} label={t(decayFieldKey(name), { defaultValue: TAG_DECAY_FIELDS[name].label })} layout="horizontal" rules={[{ validator: (_, value: unknown) => {
              const error = decayFieldError(name, value); return error ? Promise.reject(new Error(error)) : Promise.resolve()
            } }]}><InputNumber min={min} max={max} precision={0} suffix={<span className="tag-decay-unit">{t(decayUnitKey(unit), { defaultValue: unit })}</span>} /></Form.Item>
          })}
        </div>
        <p className="traffic-config__hint">{t('recommend.tagDecay.saturationHint', { defaultValue: 'B 以該上限為漸近線：原始 +1 持續累計，推薦有效分 = 上限 ×(1−e^(−原始分/上限))，非線性收斂且恆不超過上限，用以抑制商家走量造成的頭部膨脹；默認為基礎上限（商家 50000／用戶 1000），第二階段於後端計算。' })}</p>
      </AlgorithmSection>
    </Form>
    {editing && canEdit && <div className="form-footer">
      <Button onClick={handleCancel}>{t('recommend.tagDecay.cancel', { defaultValue: '取消' })}</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>{t('recommend.tagDecay.save', { defaultValue: '保存' })}</Button>
    </div>}
  </div>
}
