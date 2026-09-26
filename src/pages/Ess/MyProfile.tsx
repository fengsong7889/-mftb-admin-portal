import { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Descriptions, Spin, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import { fetchMyProfile, type EssProfile } from '../../api/hrEss'
import { useAuth } from '../../contexts/AuthContext'
import DetailPageHeader from '../../components/DetailPageHeader'

/** 空值统一展示占位符，避免自助页面出现空白单元格 */
const show = (v?: string | null) => (v && String(v).trim() ? String(v) : '-')

/**
 * 員工自助「我的檔案」：登录人身份信息 + 人事档案（服务端脱敏视图）。
 * <p>
 * 不提供自助改档：性别/证件/住址等属人事职能字段，变更走人事单据或联系 HR，
 * 因此本页只读，敏感字段即使在自助端也保持服务端脱敏口径。
 */
export default function MyProfile() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [profile, setProfile] = useState<EssProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfile(await fetchMyProfile())
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const col = { xs: 1 as const, sm: 2 as const, md: 3 as const }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrEss.profileTitle')}
        tags={user ? <Tag color="blue">{user.empId}</Tag> : undefined}
        meta={user ? `${user.name} · ${user.department || '-'}` : undefined}
        onBack={() => window.history.back()}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('hrEss.profileEditTip')}
      />

      {loading && !profile && (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      )}

      <Card size="small" className="detail-card" title={t('hrEss.identitySection')} style={{ marginBottom: 16 }}>
        <Descriptions column={col} size="small">
          <Descriptions.Item label={t('hrEss.fieldName')}>{show(user?.name)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldEmpNo')}>{show(user?.empId)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldAccount')}>{show(user?.username)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldDept')}>{show(user?.department)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldPosition')}>{show(user?.position)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldJobLevel')}>{show(user?.jobLevel)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" className="detail-card" title={t('hrEss.personalSection')} style={{ marginBottom: 16 }}>
        <Descriptions column={col} size="small">
          <Descriptions.Item label={t('hrEss.fieldGender')}>{show(profile?.personalInfo?.gender)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldBirthDate')}>{show(profile?.personalInfo?.birthDate)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldNationality')}>{show(profile?.personalInfo?.nationality)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldEthnicity')}>{show(profile?.personalInfo?.ethnicity)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldMaritalStatus')}>{show(profile?.personalInfo?.maritalStatus)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldPoliticalStatus')}>{show(profile?.personalInfo?.politicalStatus)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" className="detail-card" title={t('hrEss.idSection')} style={{ marginBottom: 16 }}>
        <Descriptions column={col} size="small">
          <Descriptions.Item label={t('hrEss.fieldIdType')}>{show(profile?.idInfo?.idType)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldIdNumber')}>{show(profile?.idInfo?.idNumber)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldNativePlace')}>{show(profile?.idInfo?.nativePlace)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldHouseholdType')}>{show(profile?.idInfo?.householdType)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldHouseholdLocation')}>{show(profile?.idInfo?.householdLocation)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldIdAddress')} span={3}>{show(profile?.idInfo?.idAddress)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" className="detail-card" title={t('hrEss.contactSection')}>
        <Descriptions column={col} size="small">
          <Descriptions.Item label={t('hrEss.fieldMobile')}>{show(profile?.contactInfo?.mobile)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldEmail')}>{show(profile?.contactInfo?.email)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldDingtalk')}>{show(profile?.accountInfo?.dingtalkUserId)}</Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldAddressCity')}>
            {[profile?.contactInfo?.addressCountry, profile?.contactInfo?.addressCity].filter(Boolean).join(' / ') || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('hrEss.fieldAddressDetail')} span={2}>{show(profile?.contactInfo?.addressDetail)}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}
