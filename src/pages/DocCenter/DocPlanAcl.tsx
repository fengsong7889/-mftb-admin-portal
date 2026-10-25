import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Modal, Result, Select, Space, Spin, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SafetyCertificateOutlined, SaveOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DOC_NATIVE_PERMISSION, fetchDocNativeAcl, fetchDocNativeMembers, fetchDocNativeView,
  isDocNativeConflict, parseDocNativeId, saveDocNativeAcl,
} from '@/api/docNative'
import type { DocNativeMember, DocNativeView } from '@/api/docNative'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

interface AclRow { userId: number; name: string; empId?: string | null; permissions: number }

export default function DocPlanAcl() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = parseDocNativeId(search)
  const [view, setView] = useState<DocNativeView>()
  const [members, setMembers] = useState<DocNativeMember[]>([])
  const [rows, setRows] = useState<AclRow[]>([])
  const [restricted, setRestricted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pickUserId, setPickUserId] = useState<number>()
  const [pickPermission, setPickPermission] = useState<number>(1)

  const load = useCallback(() => {
    if (id === null) { setLoading(false); setFailed(true); return }
    setLoading(true); setFailed(false)
    void Promise.all([fetchDocNativeView(id), fetchDocNativeAcl(id)])
      .then(([data, acl]) => {
        setView(data)
        setRestricted(acl.restricted)
        setRows(acl.members.map(member => ({ userId: member.userId, name: member.name, empId: member.empId, permissions: member.permissions })))
        if (data.document.spaceId) {
          void fetchDocNativeMembers(data.document.spaceId).then(setMembers).catch(() => setMembers([]))
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [id])
  useEffect(() => { load() }, [load])

  const addRow = () => {
    const member = members.find(item => item.userId === pickUserId)
    if (!member) { message.warning(t('docNative.aclSelectMember')); return }
    if (rows.some(row => row.userId === member.userId)) { message.warning(t('docNative.aclDuplicate')); return }
    setRows(previous => [...previous, { userId: member.userId, name: member.name, empId: member.empId, permissions: pickPermission }])
    setPickUserId(undefined)
    setPickPermission(1)
  }

  const handleSave = () => {
    if (!view || id === null) return
    Modal.confirm({
      title: t('docNative.aclSaveConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.aclRestricted')}：</span><b>{restricted ? t('docNative.yes') : t('docNative.no')}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.aclMembers')}：</span><b>{rows.length}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.aclReplaceHint')}</span></div>
      </div>,
      okText: t('docNative.aclSave'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setSaving(true)
        try {
          await saveDocNativeAcl(id, {
            expectedVersion: view.document.version,
            restricted,
            members: rows.map(row => ({ userId: row.userId, permissions: row.permissions })),
          })
          message.success(t('docNative.aclSaveSuccess'))
          load()
        } catch (error) {
          if (isDocNativeConflict(error)) load()
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  if (loading) return <div className="content-area"><div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }} role="status"><Spin size="large" /></div></div>
  if (failed || !view) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.aclTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  const columns: ColumnsType<AclRow> = [
    { key: 'name', title: t('docNative.member'), render: (_, row) => row.empId ? `${row.name}(${row.empId})` : row.name },
    { key: 'permissions', title: t('docNative.permissions'), render: (_, row) => <Tag color={row.permissions === 3 ? 'blue' : 'default'}>
      {row.permissions === 3 ? t('docNative.perm3') : t('docNative.perm1')}</Tag> },
    { key: 'action', title: t('docNative.action'), render: (_, row) => <Button type="link" size="small" danger
      onClick={() => setRows(previous => previous.filter(item => item.userId !== row.userId))}>{t('docNative.aclRemove')}</Button> },
  ]
  return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.aclTitle')} onBack={() => navigate('/doc-plans')} />
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('docNative.aclHint')} />
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<SafetyCertificateOutlined />} title={t('docNative.aclSection')}
        extra={<Switch checked={restricted} onChange={setRestricted}
          checkedChildren={t('docNative.aclOn')} unCheckedChildren={t('docNative.aclOff')} />} />
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>{t('docNative.aclRestrictedHint')}</div>
      <Space wrap style={{ marginBottom: 16 }} align="end">
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('docNative.member')}</div>
          <Select style={{ minWidth: 260 }} value={pickUserId} onChange={setPickUserId} showSearch optionFilterProp="label"
            placeholder={t('docNative.aclSelectMember')}
            options={members
              .filter(member => (member.permissions & DOC_NATIVE_PERMISSION.READ) !== 0 && !rows.some(row => row.userId === member.userId))
              .map(member => ({ value: member.userId, label: member.empId ? `${member.name}(${member.empId})` : member.name }))} />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('docNative.permissions')}</div>
          <Select style={{ width: 180 }} value={pickPermission} onChange={setPickPermission}
            options={[{ value: 1, label: t('docNative.perm1') }, { value: 3, label: t('docNative.perm3') }]} />
        </div>
        <Button onClick={addRow}>{t('docNative.aclAdd')}</Button>
      </Space>
      <Table<AclRow> rowKey="userId" size="small" dataSource={rows} columns={columns} pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docNative.aclEmpty')} /> }} />
    </div>
    <div className="form-footer">
      <Button onClick={() => navigate('/doc-plans')}>{t('docNative.cancel')}</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>{t('docNative.aclSave')}</Button>
    </div>
  </div>
}
