/**
 * 用户密级授权（P0 补口）：只有 doc-space:edit 可维护。
 *
 * 语义：
 * - 密级只约束“非负责人”的敏感/机密文档访问；负责人始终可读自己的文档；
 * - 撤销不是删除审计，而是回落到默认 INTERNAL(2)；
 * - 这里是全局主体属性，不挂在某个空间下。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Empty, Input, InputNumber, Modal, Select, Space, Table, Tag, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SafetyCertificateOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  DOC_CONFIDENTIALITY_COLOR, DOC_CONFIDENTIALITY_VALUES,
  fetchDocClearances, formatDocKnowledgeTime, revokeDocClearance, saveDocClearance,
  searchDocClearanceUsers, type DocClearance, type DocClearanceUser,
} from '@/api/docKnowledge'
import { useAuth } from '@/contexts/AuthContext'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

const LEVEL_KEY: Record<number, string> = { 1: 'public', 2: 'internal', 3: 'sensitive', 4: 'restricted' }

export default function DocClearance() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-space:edit')
  const [rows, setRows] = useState<DocClearance[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [userId, setUserId] = useState<number | null>(null)
  const [userOptions, setUserOptions] = useState<DocClearanceUser[]>([])
  const [userLoading, setUserLoading] = useState(false)
  const [level, setLevel] = useState(3)
  const [days, setDays] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!canEdit) return
    setLoading(true)
    try {
      setRows(await fetchDocClearances(keyword))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [canEdit, keyword, t])

  useEffect(() => { void load() }, [load])

  const loadUsers = useCallback(async (keyword = '') => {
    if (!canEdit) return
    setUserLoading(true)
    try {
      setUserOptions(await searchDocClearanceUsers(keyword))
    } catch {
      setUserOptions([])
    } finally {
      setUserLoading(false)
    }
  }, [canEdit])

  useEffect(() => { void loadUsers('') }, [loadUsers])

  const handleGrant = async () => {
    if (userId == null) {
      message.warning(t('docKnowledge.clearanceRequiredUser'))
      return
    }
    setSaving(true)
    try {
      await saveDocClearance(userId, { maxLevel: level, days: days ?? null })
      message.success(t('docKnowledge.clearanceGranted'))
      setUserId(null)
      setDays(null)
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.clearanceSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = (row: DocClearance) => {
    Modal.confirm({
      title: t('docKnowledge.clearanceRevoke'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('docKnowledge.clearanceRevokeHint', { name: row.name }),
      okText: t('docKnowledge.clearanceRevoke'),
      okButtonProps: { danger: true },
      cancelText: t('docKnowledge.cancel'),
      onOk: async () => {
        try {
          await revokeDocClearance(row.userId)
          message.success(t('docKnowledge.clearanceRevoked'))
          await load()
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
          throw error
        }
      },
    })
  }

  const handleAdjust = (row: DocClearance) => {
    setUserOptions(prev => prev.some(item => item.userId === row.userId)
      ? prev
      : [...prev, { userId: row.userId, name: row.name, empId: row.empId, username: '' }])
    setUserId(row.userId)
    setLevel(row.maxLevel)
    setDays(null)
  }

  const columns: ColumnsType<DocClearance> = [
    {
      title: t('docKnowledge.clearanceUser'), dataIndex: 'name',
      render: (value: string, row) => (
        <Space size={6}><span>{value}</span>{row.empId && <span style={{ color: '#8C8C8C' }}>{row.empId}</span>}</Space>
      ),
    },
    {
      title: t('docKnowledge.clearanceLevelLabel'), dataIndex: 'maxLevel', width: 130,
      render: (value: number) => (
        <Tag color={DOC_CONFIDENTIALITY_COLOR[value as 1 | 2 | 3 | 4]}>
          {t(`docKnowledge.clearanceLevel.${LEVEL_KEY[value] ?? 'internal'}`)}
        </Tag>
      ),
    },
    {
      title: t('docKnowledge.clearanceGrantedBy'), dataIndex: 'grantedByName', width: 130,
      render: (value?: string | null) => value || '—',
    },
    {
      title: t('docKnowledge.clearanceGrantedAt'), dataIndex: 'grantedAt', width: 170,
      render: (value?: string | number | null) => formatDocKnowledgeTime(value),
    },
    {
      title: t('docKnowledge.clearanceExpiresAt'), dataIndex: 'expiresAt', width: 170,
      render: (value?: string | number | null) => value ? formatDocKnowledgeTime(value) : t('docKnowledge.clearanceLongTerm'),
    },
    {
      title: t('docKnowledge.colAction'), width: 150,
      render: (_, row) => (
        <Space size={0}>
          {canEdit && <Button type="link" size="small" onClick={() => handleAdjust(row)}>{t('docKnowledge.clearanceAdjust')}</Button>}
          {canEdit && <Button type="link" size="small" danger onClick={() => handleRevoke(row)}>{t('docKnowledge.clearanceRevoke')}</Button>}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.clearanceScope')} description={t('docKnowledge.clearanceScopeHint')} />
      {!canEdit && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('docKnowledge.clearanceNoPermission')} />
      )}

      {canEdit && (
        <div style={docPlanCardStyle}>
          <DocPlanSectionTitle icon={<SafetyCertificateOutlined />} title={t('docKnowledge.clearanceGrantTitle')} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) 160px 160px auto', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('docKnowledge.clearanceUser')}</div>
              {/* 密级作用于登录账号，可能包含没有 HR 档案的内置 admin，故用 sys_user 搜索而非 EmployeeSelect。 */}
              <Select
                showSearch
                filterOption={false}
                value={userId ?? undefined}
                loading={userLoading}
                onSearch={value => void loadUsers(value)}
                onChange={value => setUserId(value)}
                placeholder={t('docKnowledge.clearanceSelectUser')}
                options={userOptions.map(user => ({
                  value: user.userId,
                  label: `${user.name}${user.empId ? `(${user.empId})` : ''}`,
                }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('docKnowledge.clearanceLevelLabel')}</div>
              <Select style={{ width: '100%' }} value={level} onChange={setLevel}
                options={DOC_CONFIDENTIALITY_VALUES.map(value => ({
                  value, label: t(`docKnowledge.clearanceLevel.${LEVEL_KEY[value]}`),
                }))} />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('docKnowledge.clearanceDays')}</div>
              <InputNumber style={{ width: '100%' }} min={1} max={3650} value={days}
                onChange={value => setDays(value)} placeholder={t('docKnowledge.clearanceDaysHint')} />
            </div>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleGrant}>
              {t('docKnowledge.clearanceGrant')}
            </Button>
          </div>
        </div>
      )}

      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<SafetyCertificateOutlined />} title={t('docKnowledge.clearanceList')} />
        <Space style={{ marginBottom: 12 }}>
          <Input style={{ width: 240 }} value={keyword} allowClear
            placeholder={t('docKnowledge.clearanceSearchPlaceholder')}
            onChange={event => setKeyword(event.target.value)} onPressEnter={() => void load()} />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.search')}</Button>
        </Space>
        <Table rowKey="userId" size="small" dataSource={rows} columns={columns} loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.clearanceEmpty')} /> }} />
      </div>
    </div>
  )
}
