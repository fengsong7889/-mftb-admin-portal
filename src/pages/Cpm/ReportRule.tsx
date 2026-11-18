/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Modal, Select, Space, Switch, Tag, message } from 'antd'
import { ClockCircleOutlined, NotificationOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons'
import RemarkTextArea from '@/components/RemarkTextArea'
import EmployeeSelect from '@/components/EmployeeSelect'
import { fetchCpmRule, saveCpmRule, type CpmRuleVO } from '@/api/cpm'
import CpmFormHeader from './CpmFormHeader'

/**
 * P5 匯報規則（cpm-rule，治理侧）。
 *
 * 一期为全局单行配置（biz_cpm_rule rule_slot='default'，对齐 rdm_daily_report_config 先例）；
 * 部门级多规则二期再拆。追加接收人按 AGENTS.md 约束 5 用 EmployeeSelect（姓名+工号，禁拼部门）。
 *
 * dry-run 是环境级开关（CPM_NOTIFY_DRY_RUN，验收红线），不在页面上提供关闭入口——
 * 能在生产页面里一键真发全员钉钉的开关，迟早会被当成普通选项误拨。
 */

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map(d => ({ value: d, label: `星期${['一', '二', '三', '四', '五', '六', '日'][d - 1]}` }))
const TIME_OPTIONS = ['17:00', '17:30', '18:00', '19:00', '20:00'].map(v => ({ value: v, label: v }))
const REMIND_OPTIONS = [1, 2, 4, 8].map(v => ({ value: v, label: `提前 ${v} 小時` }))

interface FormValues {
  enabled: boolean
  deadlineDay: number
  deadlineTime: string
  remindBeforeHours: number
  receiverManager: boolean
  extraReceiverIds: number[]
  groupPush: boolean
  personalPush: boolean
  remark?: string
}

export default function ReportRule() {
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const [rule, setRule] = useState<CpmRuleVO | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [receiverSeeds, setReceiverSeeds] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    let alive = true
    fetchCpmRule()
      .then(vo => {
        if (!alive) return
        setRule(vo)
        form.setFieldsValue({
          enabled: vo.enabled,
          deadlineDay: vo.deadlineDay,
          deadlineTime: vo.deadlineTime,
          remindBeforeHours: vo.remindBeforeHours,
          receiverManager: vo.receiverManager,
          extraReceiverIds: vo.extraReceiverIds,
          groupPush: vo.groupPush,
          personalPush: vo.personalPush,
          remark: vo.remark ?? undefined,
        })
        // 回显已保存的追加接收人：id 与姓名后端一并给出，避免下拉先空白
        setReceiverSeeds(vo.extraReceiverIds.map((id, i) => ({ id, name: vo.extraReceiverNames[i] ?? String(id) })))
      })
      .catch(err => alive && setLoadError(err instanceof Error ? err.message : '載入失敗'))
    return () => { alive = false }
  }, [form])

  const handleSave = async () => {
    const values = await form.validateFields()
    Modal.confirm({
      title: '確認保存匯報規則？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>影響：</span><b>全員週報截止、催辦與送達即時生效</b></div>
          <div className="confirm-info-row"><span>釘釘 dry-run：</span><b>{rule?.notifyDryRun ? '開啟（不真發）' : '關閉（真實投遞！）'}</b></div>
        </div>
      ),
      okText: '確認保存',
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          const saved = await saveCpmRule({
            enabled: values.enabled,
            periodTypes: ['week'],
            deadlineDay: values.deadlineDay,
            deadlineTime: values.deadlineTime,
            remindBeforeHours: values.remindBeforeHours,
            receiverManager: values.receiverManager,
            extraReceiverIds: values.extraReceiverIds ?? [],
            groupPush: values.groupPush,
            personalPush: values.personalPush,
            remark: values.remark,
          })
          setRule(saved)
          message.success('規則已保存（即時生效，定時作業下一輪讀新值）')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <div className="content-area">
      <CpmFormHeader title="匯報規則" />

      {loadError && <Alert type="error" showIcon style={{ marginBottom: 14 }} message="規則載入失敗" description={loadError} />}
      {rule && !rule.notifyDryRun && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }}
          message="釘釘 dry-run 已關閉：本頁保存的推送設定會真實投遞全員消息。驗收環境請保持開啟。" />
      )}

      <Form form={form} layout="vertical">
        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--warn"><ClockCircleOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">週期與截止</span>
            <div className="cpm-card__line" />
            <span className="cpm-card__extra">週報按週一起算（Asia/Shanghai）；一期自動週期僅開放週報，月/季報手動生成</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>規則總開關:</span>
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>停用後催辦與推送全停，頁面生成不受影響</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="deadlineDay" label="週報截止日" rules={[{ required: true }]}>
              <Select options={WEEKDAY_OPTIONS} />
            </Form.Item>
            <Form.Item name="deadlineTime" label="截止時刻" rules={[{ required: true }]}>
              <Select options={TIME_OPTIONS} />
            </Form.Item>
            <Form.Item name="remindBeforeHours" label="未交提醒" rules={[{ required: true }]} extra="同一天只提醒一次">
              <Select options={REMIND_OPTIONS} />
            </Form.Item>
          </div>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--info"><TeamOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">接收人策略</span>
            <div className="cpm-card__line" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>直屬上級:</span>
            <Form.Item name="receiverManager" valuePropName="checked" noStyle>
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>按部門主管關係自動推導（資料不全時以顯式授權為準，推不出僅站內可見）</span>
          </div>
          <Form.Item name="extraReceiverIds" label="追加接收人"
            extra="只顯示姓名+工號（組織歸屬不暴露給任意能打開本頁的人）">
            <EmployeeSelect placeholder="選擇追加接收人（可留空）" seed={receiverSeeds} style={{ maxWidth: 480 }} />
          </Form.Item>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--purple"><NotificationOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">釘釘推送</span>
            <div className="cpm-card__line" />
            <Space size={6}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>dry-run:</span>
              <Tag color={rule?.notifyDryRun ? 'green' : 'red'}>{rule?.notifyDryRun ? '開啟（不真發）' : '關閉'}</Tag>
            </Space>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>群報卡片:</span>
            <Form.Item name="groupPush" valuePropName="checked" noStyle>
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>僅摘要+站內連結，正文需登錄查閱</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', minWidth: 96, textAlign: 'right', flexShrink: 0 }}>個人通知:</span>
            <Form.Item name="personalPush" valuePropName="checked" noStyle>
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>按接收人釘釘帳號送工作通知</span>
          </div>
        </div>

        <div className="cpm-card">
          <div className="cpm-card__title-row">
            <div className="cpm-card__icon cpm-card__icon--ok"><ClockCircleOutlined style={{ fontSize: 14 }} /></div>
            <span className="cpm-card__title">備註</span>
            <div className="cpm-card__line" />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder="規則變更原因等（選填，200 字以内）" />
          </Form.Item>
        </div>
      </Form>

      <div className="form-footer">
        <Space>
          <Button onClick={() => navigate(-1)}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} disabled={!rule}>保存</Button>
        </Space>
      </div>
    </div>
  )
}
