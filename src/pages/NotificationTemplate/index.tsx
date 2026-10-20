/**
 * 通知模板（顶级菜单，紧邻「通知渠道配置」）。
 *
 * 只改"怎么写"，不改"发不发"（后者在「推送開關」）。两者拆开是因为使用者常不是同一个人：
 * 行政改文案、值班人静音，合成一页会互相覆盖。
 *
 * 模板只支持 ${var} 字面替换；变量清单来自后端登记，不允许前端自造。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../components/DetailPageHeader'
import HelpPopover from '../../components/HelpPopover'
import { fetchNotifyTemplates, saveNotifyTemplate, type NotifyTemplateVO } from '../../api/meetingNotify'

interface EditorValues {
  titleTpl: string
  bodyTpl: string
  enabled: boolean
}

export default function NotificationTemplate() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<NotifyTemplateVO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<NotifyTemplateVO>()
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<EditorValues>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setRows(await fetchNotifyTemplates())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.loadFailed', { defaultValue: '加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const columns: TableColumnsType<NotifyTemplateVO> = [
    { title: t('notification.template.scene', { defaultValue: '場景' }), key: 'scene', width: 220,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.sceneName}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{row.sceneKey}</div>
        </div>
      ) },
    { title: t('notification.template.titleTpl', { defaultValue: '標題模板' }), dataIndex: 'titleTpl', key: 'titleTpl', width: 240 },
    {
      title: t('notification.template.enabled', { defaultValue: '啟用' }), key: 'enabled', width: 100,
      render: (_, row) => (row.enabled ? <Tag color="green">{t('common.enabled', { defaultValue: '啟用' })}</Tag>
        : <Tag color="default">{t('notification.template.fallback', { defaultValue: '回落內置文案' })}</Tag>),
    },
    {
      title: t('notification.template.updatedBy', { defaultValue: '最後更新' }), key: 'updated',
      render: (_, row) => `${row.updatedBy || '-'}${row.updatedAt ? ` · ${row.updatedAt}` : ''}`,
    },
    {
      title: t('meeting.action', { defaultValue: '操作' }), key: 'action', width: 100,
      render: (_, row) => <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
        setEditing(row)
        form.setFieldsValue({ titleTpl: row.titleTpl, bodyTpl: row.bodyTpl, enabled: row.enabled })
      }}>{t('common.edit', { defaultValue: '編輯' })}</Button>,
    },
  ]

  return (
    <div className="content-area">
      <DetailPageHeader title={t('notification.template.pageTitle', { defaultValue: '通知模板' })} onBack={() => history.back()} />

      {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('common.loadFailed', { defaultValue: '加載失敗' })} description={error} />}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('notification.template.intro', { defaultValue: '修改後下一次發送立即生效；停用模板會回落到系統內置文案，不會導致通知發不出去。' })}
      />

      <div className="action-section">
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('meeting.refresh', { defaultValue: '重新整理' })}</Button>
          <HelpPopover
            title={t('notification.template.varsTitle', { defaultValue: '可用變量' })}
            ariaLabel={t('notification.template.varsAria', { defaultValue: '模板變量說明' })}
            content={[
              { tone: 'info', label: '會議邀約 / 提醒 / 釋放', body: '${meetingTitle} ${meetingNo} ${startTime} ${endTime} ${roomName} ${roomLocation} ${organizer} ${delegateLine} ${agendaLine} ${onlineLine} ${extraLine} ${reason} ${viewUrl}' },
              { tone: 'success', label: '會議紀要', body: '${minutesNo} ${meetingTime} ${recorder} ${absenteeLine} ${agenda} ${actions} ${followUps} ${nextMeetingLine} ${remarkLine} ${linksLine} ${batchNote}' },
              { tone: 'warn', label: '跟進事項', body: '${itemContent} ${dueDate} ${overdueDays} ${ownerName} ${ownerEmpNo} ${resultLabel} ${doneByName} ${noteLine}' },
              { tone: 'danger', label: '注意', body: '釘釘 markdown 不支援表格與字體顏色；負責人用 👤 **姓名（工號）** 凸顯。變量寫錯會被清空，不會中斷發送。' },
            ]}
          />
        </Space>
      </div>

      <Table<NotifyTemplateVO>
        rowKey="sceneKey"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: row => (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#595959' }}>{row.bodyTpl}</pre>
          ),
          rowExpandable: row => Boolean(row.bodyTpl),
        }}
        locale={{ emptyText: error ? t('notification.template.forbidden', { defaultValue: '載入失敗：請確認目前帳號有「通知模板」的查看權限' }) : t('notification.template.empty', { defaultValue: '尚無模板，請先執行資料庫遷移' }) }}
      />

      <Modal
        open={Boolean(editing)}
        title={editing ? t('notification.template.editTitle', { defaultValue: `編輯模板：${editing.sceneName}`, sceneName: editing.sceneName }) : ''}
        width={760}
        onCancel={() => setEditing(undefined)}
        okText={t('common.save', { defaultValue: '保存' })}
        confirmLoading={saving}
        onOk={async () => {
          try {
            await form.validateFields()
          } catch {
            return
          }
          setSaving(true)
          try {
            const values = form.getFieldsValue()
            setRows(await saveNotifyTemplate(editing!.sceneKey, {
              sceneName: editing!.sceneName,
              titleTpl: values.titleTpl,
              bodyTpl: values.bodyTpl,
              enabled: values.enabled,
            }))
            message.success(t('notification.template.saved', { defaultValue: '模板已保存，下一次發送立即生效' }))
            setEditing(undefined)
          } catch {
            /* request.ts 已统一弹错 */
          } finally {
            setSaving(false)
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t('notification.template.titleTpl', { defaultValue: '標題模板' })} name="titleTpl"
            rules={[{ required: true, message: t('notification.template.titleRequired', { defaultValue: '請填寫標題模板' }) }]}>
            <Input maxLength={200} showCount />
          </Form.Item>
          <Form.Item label={t('notification.template.bodyTpl', { defaultValue: '正文模板（釘釘 markdown）' })} name="bodyTpl"
            rules={[{ required: true, message: t('notification.template.bodyRequired', { defaultValue: '請填寫正文模板' }) }]}
            extra={t('notification.template.bodyHint', { defaultValue: '加粗用 **文字**，分區用加粗小標題並空行；不支援表格與顏色。' })}>
            <Input.TextArea autoSize={{ minRows: 12, maxRows: 24 }} maxLength={8000} showCount style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item label={t('notification.template.enabled', { defaultValue: '啟用模板' })} name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
