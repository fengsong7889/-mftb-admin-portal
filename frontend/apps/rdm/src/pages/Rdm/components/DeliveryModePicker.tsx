/**
 * 交付流程选择器 —— 分配 / 认领 / 详情分配动作唯一的确定点。
 *
 * 设计口径：
 * - 业务方提交时不选（他们不知道两种方式的差别），由产研在分配/认领时确定；
 * - 界面只出现「整單交付 / 分批交付」这两个能读懂的名字，不出现 V1/V2/V3 版本号；
 * - 说明走 HelpPopover（AGENTS.md 问号面板规范）：含义 + 节点流转 + 示例 + 锁定规则，
 *   点击打开、可停留滚动，不用 Tooltip 塞长文本。
 * - 文案全部走 t()：rdm 域已纳入硬编码中文棘轮，新增文案必须带 defaultValue 兜底。
 */
import { useEffect, useMemo, useState } from 'react'
import { Radio, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import { RDM_DELIVERY_MODE, type RdmDeliveryMode } from '@/constants/rdm'

/** 问号说明面板：各选择处共用同一份文案，避免三处口径漂移 */
export function DeliveryModeHelp() {
  const { t } = useTranslation()
  const sections = useMemo<HelpSection[]>(() => [
    {
      tone: 'info',
      label: t('rdm.deliveryMode.batchLabel', { defaultValue: '分批交付（默認）' }),
      body: t('rdm.deliveryMode.batchBody', {
        defaultValue: '含義：需求受理後拆成多個「交付項」，每個交付項獨立準備、開發、測試、驗收、發布。\n節點流轉：受理後需求狀態停在「已受理」，不再逐段變化；交付項按「待準備 → 開發中 → 測試中 → 待驗收 → 待發布 → 已上線待完成 → 已完成」各自推進；上線由發布批次彙總，需過測試、驗收、缺陷、依賴、範圍五類門禁與灰度開關。\n示例：一個「會員中心改版」需求拆成登入改版、權益頁、消息中心三個交付項，登入改版先驗收上線，其餘繼續開發，互不阻塞。',
      }),
    },
    {
      tone: 'neutral',
      label: t('rdm.deliveryMode.wholeLabel', { defaultValue: '整單交付' }),
      body: t('rdm.deliveryMode.wholeBody', {
        defaultValue: '含義：不拆交付項，整條需求就是一個交付單位，PRD、開發、提測、驗收、上線一路走完再一起交付。\n節點流轉：受理後由需求狀態逐段推進（寫 PRD → 評審 → 排期 → 設計 → 開發 → 聯調 → 測試 → UAT → 上線 → 驗收），發布按單條需求放行。\n示例：一條「緊急文案修正」需求，從評審到上線只有一條線，一次驗收、一次上線。',
      }),
    },
    {
      tone: 'warn',
      label: t('rdm.deliveryMode.lockLabel', { defaultValue: '什麼時候能選、選完能不能改' }),
      body: t('rdm.deliveryMode.lockBody', {
        defaultValue: '只在需求池、已分配、評估中能確定；受理後鎖定。\n已建立任務的需求不能改為分批交付（會出現「整單任務 + 分批交付項」混合態）；鎖定後要換方式，請在需求詳情「複製需求」重走流程。\n歷史導入的需求默認按整單交付展示，第一次分配 / 認領時可以改。',
      }),
    },
  ], [t])

  return (
    <HelpPopover
      title={t('rdm.deliveryMode.helpTitle', { defaultValue: '交付流程怎麼選' })}
      ariaLabel={t('rdm.deliveryMode.helpAria', { defaultValue: '交付流程說明' })}
      placement="bottomLeft"
      width={420}
      content={sections}
    />
  )
}

interface DeliveryModePickerProps {
  /** 受控值；不传时组件自己维护内部状态（Modal.confirm 里用 defaultValue + onChange 读取） */
  value?: RdmDeliveryMode
  defaultValue?: RdmDeliveryMode
  onChange?: (value: RdmDeliveryMode) => void
  disabled?: boolean
}

export default function DeliveryModePicker({
  value, defaultValue, onChange, disabled,
}: DeliveryModePickerProps) {
  const { t } = useTranslation()
  const [inner, setInner] = useState<RdmDeliveryMode>(value ?? defaultValue ?? RDM_DELIVERY_MODE.BATCH)
  useEffect(() => {
    if (value != null) setInner(value)
  }, [value])
  const current = value ?? inner

  /** 卡片上只留能让人做决定的一句话，完整解释在问号面板 */
  const options = useMemo(() => [
    {
      value: RDM_DELIVERY_MODE.BATCH,
      label: t('rdm.deliveryMode.batchLabel', { defaultValue: '分批交付（默認）' }),
      desc: t('rdm.deliveryMode.optionBatchDesc', { defaultValue: '拆成交付項，各自排期 / 驗收 / 上線（默認）' }),
    },
    {
      value: RDM_DELIVERY_MODE.WHOLE,
      label: t('rdm.deliveryMode.wholeLabel', { defaultValue: '整單交付' }),
      desc: t('rdm.deliveryMode.optionWholeDesc', { defaultValue: '整條需求一個交付單位，一次驗收、一次上線' }),
    },
  ], [t])

  return (
    <Radio.Group
      value={current}
      disabled={disabled}
      style={{ width: '100%' }}
      onChange={e => {
        const next = e.target.value as RdmDeliveryMode
        if (value == null) setInner(next)
        onChange?.(next)
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {options.map(option => (
          <Radio key={option.value} value={option.value} style={{ alignItems: 'flex-start' }}>
            <span style={{ display: 'block', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600, color: '#262626' }}>{option.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#8C8C8C' }}>{option.desc}</span>
            </span>
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  )
}
