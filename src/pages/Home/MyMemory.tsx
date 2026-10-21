import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Empty, Input, List, Modal, Popconfirm, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createMemory,
  deleteMemory,
  fetchMemories,
  updateMemory,
  type AiUserMemory,
} from '../../api/aiMemory'

/**
 * 我的記憶抽屉：用户显式保存的长期偏好/事实，可查看/编辑/停用/删除。
 * <p>记忆只影响回答偏好，不覆盖权限与安全规则；内容含手机/邮箱/证件/银行卡/密码会被服务端拒绝。
 */
export function MyMemoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiUserMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<AiUserMemory | null>(null)
  const [editingText, setEditingText] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetchMemories()
      .then(setRows)
      .catch(() => message.error(t('home.memoryLoadFailed', { defaultValue: '記憶加載失敗' })))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const add = async () => {
    const content = text.trim()
    if (!content) return
    setSaving(true)
    try {
      await createMemory(content)
      setText('')
      message.success(t('home.memorySaved', { defaultValue: '已記住，30 秒內生效' }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.memorySaveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (row: AiUserMemory) => {
    try {
      await updateMemory(row.id, { status: row.status === 'active' ? 'disabled' : 'active' })
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.memorySaveFailed', { defaultValue: '保存失敗' }))
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const content = editingText.trim()
    if (!content) return
    setSaving(true)
    try {
      await updateMemory(editing.id, { content })
      setEditing(null)
      message.success(t('home.memorySaved', { defaultValue: '已記住，30 秒內生效' }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.memorySaveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: AiUserMemory) => {
    try {
      await deleteMemory(row.id)
      message.success(t('home.memoryDeleted', { defaultValue: '已刪除' }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.memoryDeleteFailed', { defaultValue: '刪除失敗' }))
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={440}
        title={t('home.memoryTitle', { defaultValue: '我的記憶' })}
        styles={{ body: { paddingTop: 12 } }}
      >
        <div className="home-memory-add">
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('home.memoryPlaceholder', {
              defaultValue: '例如：以後回答盡量用表格；我負責會員專案。',
            })}
          />
          <div className="home-memory-add-footer">
            <span className="home-memory-hint">
              {t('home.memoryHint', { defaultValue: '只保存你主動確認的偏好；不要填手機、郵箱、證件、銀行卡或密碼。' })}
            </span>
            <Button type="primary" icon={<PlusOutlined />} loading={saving} disabled={!text.trim()} onClick={add}>
              {t('home.memoryAdd', { defaultValue: '記住' })}
            </Button>
          </div>
        </div>

        <List
          loading={loading}
          dataSource={rows}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.memoryEmpty', { defaultValue: '還沒有記憶' })} /> }}
          renderItem={(row) => (
            <List.Item
              actions={[
                <Button key="edit" type="link" size="small" icon={<EditOutlined />}
                  onClick={() => { setEditing(row); setEditingText(row.content) }}>
                  {t('common.edit', { defaultValue: '編輯' })}
                </Button>,
                <Button key="toggle" type="link" size="small" onClick={() => toggle(row)}>
                  {row.status === 'active'
                    ? t('home.memoryDisable', { defaultValue: '停用' })
                    : t('home.memoryEnable', { defaultValue: '啟用' })}
                </Button>,
                <Popconfirm key="delete" title={t('home.memoryDeleteConfirm', { defaultValue: '確認刪除這條記憶？' })}
                  onConfirm={() => remove(row)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={<Space><Tag color={row.status === 'active' ? 'success' : 'default'}>
                  {row.status === 'active' ? t('home.memoryActive', { defaultValue: '生效中' }) : t('home.memoryDisabled', { defaultValue: '已停用' })}
                </Tag></Space>}
                description={<span className="home-memory-content">{row.content}</span>}
              />
            </List.Item>
          )}
        />
      </Drawer>

      <Modal
        open={!!editing}
        title={t('home.memoryEditTitle', { defaultValue: '編輯記憶' })}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        confirmLoading={saving}
        okText={t('common.save', { defaultValue: '保存' })}
        destroyOnClose
      >
        <Input.TextArea rows={4} maxLength={500} showCount value={editingText}
          onChange={(e) => setEditingText(e.target.value)} />
      </Modal>
    </>
  )
}

/** “記住這條”弹窗：预填当前助手回复，用户确认/编辑后才落库。 */
export function RememberMemoryModal({
  open,
  initialContent,
  onClose,
  onSaved,
}: {
  open: boolean
  initialContent: string
  onClose: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(initialContent)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setText(initialContent)
  }, [open, initialContent])

  const save = async () => {
    const content = text.trim()
    if (!content) return
    setSaving(true)
    try {
      await createMemory(content)
      message.success(t('home.memorySaved', { defaultValue: '已記住，30 秒內生效' }))
      onSaved?.()
      onClose()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('home.memorySaveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('home.rememberTitle', { defaultValue: '記住這條' })}
      onCancel={onClose}
      onOk={save}
      confirmLoading={saving}
      okText={t('home.memoryAdd', { defaultValue: '記住' })}
      destroyOnClose
    >
      <Input.TextArea rows={5} maxLength={500} showCount value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('home.memoryPlaceholder', { defaultValue: '例如：以後回答盡量用表格；我負責會員專案。' })} />
      <div className="home-memory-hint" style={{ marginTop: 8 }}>
        {t('home.memoryHint', { defaultValue: '只保存你主動確認的偏好；不要填手機、郵箱、證件、銀行卡或密碼。' })}
      </div>
    </Modal>
  )
}
