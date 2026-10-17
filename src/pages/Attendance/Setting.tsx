/**
 * 假勤设置 —— 考勤计算口径与对接参数
 *
 * 边界（必须写在界面上，避免 HR 误以为这里能改审批流程）：
 * 本页只维护「考勤怎么算、数据从哪来、什么时候交给薪酬」；
 * 审批节点、审批人、流程模板由流程审批系统的「流程配置」统一维护。
 *
 * 交互采用分组独立编辑（与规则配置菜单一致）：一次只放开一个分组，保存后回到只读态，
 * 避免整页长期可编辑造成误改其它口径。
 *
 * 契约：后端只给 key/值/editable，**所有文案在本页按 key 从语言包取**（见 settingMeta.ts）。
 * 只读项分两类——`valueKey` 是口径说明（要翻译），`value` 是运行时数据（如同步 cron，原样展示）。
 *
 * 不提供「变更说明」输入框：后端没有承载它的字段，收了却丢掉比没有这个框更糟。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, InputNumber, Modal, message } from 'antd'
import { EditOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAttendanceSettings, saveAttendanceSettings, type SettingItem } from '../../api/attendance'
import { SETTING_GROUP_META, SETTING_HINT_KEY, SETTING_LABEL_KEY, orderedGroups } from './settingMeta'
import '@/styles/components.css'

const cardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function AttendanceSetting() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('attendance-setting:edit')

  const [items, setItems] = useState<SettingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<Record<string, string>>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await fetchAttendanceSettings())
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => orderedGroups(Array.from(new Set(items.map(i => i.group)))), [items])

  const labelOf = (item: SettingItem) => t(SETTING_LABEL_KEY[item.key] ?? 'common.underDev')
  const hintOf = (item: SettingItem) => {
    const key = SETTING_HINT_KEY[item.key]
    return key ? t(key) : ''
  }
  /** 只读项的展示值：口径说明走翻译，运行时数据（cron）原样显示 */
  const displayValue = (item: SettingItem) => (item.valueKey ? t(item.valueKey) : (item.value ?? '-'))

  const startEdit = (group: string) => {
    setEditingGroup(group)
    const values: Record<string, string> = {}
    items.filter(i => i.group === group && i.editable).forEach(i => { values[i.key] = i.value ?? '' })
    form.setFieldsValue(values)
  }

  const cancelEdit = () => {
    setEditingGroup(null)
    form.resetFields()
  }

  /** 口径参数影响全员考勤结论，保存前必须二次确认并把「不回溯」讲清楚 */
  const saveGroup = async () => {
    if (!editingGroup) return
    const values = await form.validateFields()
    const changed = items
      .filter(i => i.group === editingGroup && i.editable && values[i.key] !== undefined
        && String(values[i.key]) !== (i.value ?? ''))
      .map(i => ({ label: labelOf(i), from: i.value ?? '-', to: String(values[i.key]), key: i.key }))
    if (changed.length === 0) {
      message.info(t('attendance.settingNoChange'))
      cancelEdit()
      return
    }
    Modal.confirm({
      title: t('attendance.settingConfirmTitle', {
        group: t(SETTING_GROUP_META[editingGroup]?.titleKey ?? 'common.underDev'),
      }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('attendance.settingConfirmOk'),
      cancelText: t('attendance.settingConfirmCancel'),
      content: (
        <div className="confirm-info-card">
          {changed.map(c => (
            <div className="confirm-info-row" key={c.key}>
              <span>{c.label}：</span><b>{c.from} → {c.to}</b>
            </div>
          ))}
          <div className="confirm-info-row">
            <span>{t('attendance.settingEffectScopeLabel')}</span><b>{t('attendance.settingEffectScope')}</b>
          </div>
        </div>
      ),
      onOk: async () => {
        setSaving(true)
        try {
          // 只提交本分组里真变了的项：后端按 key 白名单校验，混入只读项会整批拒绝
          const payload: Record<string, string> = {}
          changed.forEach(c => { payload[c.key] = c.to })
          const result = await saveAttendanceSettings(payload)
          message.success(result.needRecalculate
            ? t('attendance.settingSavedNeedRecalculate', { count: result.updated ?? changed.length })
            : t('attendance.settingSaved', { count: result.updated ?? changed.length }))
          cancelEdit()
          await load()
        } catch {
          // 请求层已统一提示（越界、非整数、只读项混入等）
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('attendance.settingPageAlert')}
        description={t('attendance.settingPageAlertDesc')}
      />

      {/* 加载期间锁住表单：否则用户可能在值还没回来时先改了默认值，保存后又被重新拉回 */}
      <Form form={form} layout="vertical" disabled={loading}>
        {groups.map(group => {
          const meta = SETTING_GROUP_META[group] ?? { titleKey: 'common.underDev', color: '#8c8c8c', bg: '#f5f5f5' }
          const editing = editingGroup === group
          const groupItems = items.filter(i => i.group === group)
          const hasEditable = groupItems.some(i => i.editable)
          return (
            <div key={group} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: meta.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 14, color: meta.color }}><EditOutlined /></span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t(meta.titleKey)}</span>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                {editing ? (
                  <span style={{ fontSize: 12, color: '#E8720C' }}>{t('common.editingTag')}</span>
                ) : (
                  // 全是只读说明的分组不给编辑按钮：点进去什么都改不了只会让人以为坏了
                  canEdit && hasEditable && (
                    <Button type="link" size="small" disabled={editingGroup !== null} onClick={() => startEdit(group)}>
                      {t('common.edit')}
                    </Button>
                  )
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {groupItems.map(item => (
                  <div key={item.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 13, color: '#595959' }}>{labelOf(item)}</span>
                    {editing && item.editable ? (
                      <Form.Item
                        name={item.key}
                        rules={[{ required: true, message: t('attendance.settingValueRequired') }]}
                        style={{ marginBottom: 0 }}
                      >
                        {/* 可见标题是上方独立 span（为控制网格字号/颜色），Form.Item 未带 label，
                            故给输入框显式 aria-label，保证读屏/表单可访问名称不为空（缺陷 D12）。 */}
                        <InputNumber min={0} style={{ width: '100%' }} stringMode={false} aria-label={labelOf(item)} />
                      </Form.Item>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{displayValue(item)}</span>
                    )}
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>{hintOf(item)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </Form>

      {editingGroup && (
        <div className="form-footer">
          <Button onClick={cancelEdit}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveGroup}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
