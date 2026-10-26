import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Modal, Result, Select, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DOC_NATIVE_PERMISSION, fetchDocNativeMembers, parseDocNativeId, removeDocNativeMember, saveDocNativeMember } from '@/api/docNative'
import type { DocNativeMember } from '@/api/docNative'
import EmployeeSelect from '@/components/EmployeeSelect'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

const PERMISSION_OPTIONS = [1, 3, 5, 7, 15]

function permissionLabel(t: (key: string) => string, bits: number): string {
  if (bits >= 15) return t('docNative.perm15')
  if (bits === 7) return t('docNative.perm7')
  if (bits === 5) return t('docNative.perm5')
  if (bits === 3) return t('docNative.perm3')
  return t('docNative.perm1')
}

/** 空间成员维护：只授予资源位集，不改变员工的菜单/系统准入。 */
export default function DocGovernanceMembers() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const spaceId = parseDocNativeId(search, 'spaceId')
  const [members, setMembers] = useState<DocNativeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [permissions, setPermissions] = useState<number>(3)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (spaceId === null) { setLoading(false); setFailed(true); return }
    setLoading(true); setFailed(false)
    void fetchDocNativeMembers(spaceId).then(rows => setMembers(rows)).catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [spaceId])
  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (spaceId === null) return
    const userId = selected[0]
    if (!userId) { message.warning(t('docNative.employeeRequired')); return }
    setSaving(true)
    try {
      await saveDocNativeMember(spaceId, { userId, permissions })
      message.success(t('docNative.memberSaved'))
      setSelected([])
      load()
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = (member: DocNativeMember) => {
    if (spaceId === null) return
    Modal.confirm({
      title: t('docNative.removeMemberTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.member')}：</span><b>{member.empId ? `${member.name}(${member.empId})` : member.name}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.removeMemberHint')}</span></div>
      </div>,
      okText: t('docNative.removeMember'),
      okButtonProps: { danger: true },
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        await removeDocNativeMember(spaceId, member.userId)
        message.success(t('docNative.removeMemberSuccess'))
        load()
      },
    })
  }

  const columns: ColumnsType<DocNativeMember> = [
    { key: 'name', title: t('docNative.member'), render: (_, row) => row.empId ? `${row.name}(${row.empId})` : row.name },
    { key: 'permissions', title: t('docNative.permissions'), render: (_, row) => <Space size={4} wrap>
      <Tag color={(row.permissions & DOC_NATIVE_PERMISSION.MANAGE) !== 0 ? 'purple' : 'blue'}>{permissionLabel(t, row.permissions)}</Tag>
    </Space> },
    { key: 'action', title: t('docNative.action'), render: (_, row) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" danger onClick={() => handleRemove(row)}>{t('docNative.removeMember')}</Button>
    </Space> },
  ]

  if (spaceId === null) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.membersTitle')} onBack={() => navigate('/doc-governance')} />
    <Result status="warning" title={t('docNative.invalidLink')} subTitle={t('docNative.spaceMissing')} />
  </div>
  if (failed) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.membersTitle')} onBack={() => navigate('/doc-governance')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.membersTitle')} onBack={() => navigate('/doc-governance')} />
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('docNative.memberScopeHint')} />
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<UserAddOutlined />} title={t('docNative.addMemberSection')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('docNative.member')}</div>
          {/* 员工选择统一走 EmployeeSelect（单选），值语义是 sys_user.id */}
          <EmployeeSelect single value={selected} onChange={setSelected} placeholder={t('docNative.selectEmployee')} />
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('docNative.permissions')}</div>
          <Select style={{ width: '100%' }} value={permissions} onChange={setPermissions}
            options={PERMISSION_OPTIONS.map(bits => ({ value: bits, label: permissionLabel(t, bits) }))} />
        </div>
        <Button type="primary" icon={<TeamOutlined />} loading={saving} onClick={handleSave}>{t('docNative.saveMember')}</Button>
      </div>
    </div>
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<TeamOutlined />} title={t('docNative.memberList')} />
      <Table<DocNativeMember> rowKey="userId" size="middle" loading={loading} dataSource={members} columns={columns}
        scroll={{ x: 'max-content' }} pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docNative.emptyMembers')} /> }} />
    </div>
  </div>
}
