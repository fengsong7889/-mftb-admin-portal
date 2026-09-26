import { useCallback, useEffect, useState } from 'react'
import { Card, Empty, Space, Spin, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { fetchLeaveBalances, type LeaveBalance } from '../../api/hrLeave'
import LeaveList from '../Permission/HrLeave/LeaveList'
import { ESS_LEAVE_SCOPE, LEAVE_TYPE_LABEL_KEY, LEAVE_TYPE_ORDER } from '../Permission/HrLeave/meta'

/**
 * 員工自助「我的假期」：本人各假别额度概览 + 我的请假单列表。
 * <p>
 * 列表直接复用人事端的 LeaveList，仅注入自助作用域（权限 key 与路由前缀）；
 * 数据范围由服务端强制为登录人，前端不做任何"是否本人"的判断。
 */
export default function MyLeave() {
  const { t } = useTranslation()
  const year = dayjs().year()
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(false)

  const loadBalances = useCallback(async () => {
    setLoading(true)
    try {
      // 自助身份下后端只会返回本人的额度行
      const res = await fetchLeaveBalances({ page: 1, size: 50, year, mineOnly: true })
      setBalances(res.records || [])
    } catch {
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { loadBalances() }, [loadBalances])

  const typeLabel = (code: string) => (LEAVE_TYPE_LABEL_KEY[code] ? t(LEAVE_TYPE_LABEL_KEY[code]) : code)
  /** 按固定假别顺序展示，未授予的假别排最后（避免每年顺序跳动） */
  const ordered = [...balances].sort((a, b) => {
    const ia = LEAVE_TYPE_ORDER.indexOf(a.leaveType as never)
    const ib = LEAVE_TYPE_ORDER.indexOf(b.leaveType as never)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return (
    <>
      <div className="content-area" style={{ paddingBottom: 0 }}>
        <Card
          size="small"
          title={t('hrEss.quotaTitle', { year })}
          extra={<span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hrEss.quotaTip')}</span>}
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : ordered.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('hrEss.quotaEmpty')} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {ordered.map(b => {
                const left = b.remainingDays ?? 0
                return (
                  <div
                    key={`${b.id}`}
                    style={{
                      border: '1px solid #e8eaed', borderRadius: 8, padding: '12px 16px',
                      background: '#fff', transition: 'all 0.2s',
                    }}
                  >
                    <Space size={8} style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{typeLabel(b.leaveType)}</span>
                      <Tag color={left < 0 ? 'error' : left <= 1 ? 'warning' : 'success'}>{left} {t('hrLeave.dayUnit')}</Tag>
                    </Space>
                    <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                      {t('hrEss.quotaSummary', {
                        total: b.totalDays,
                        used: b.usedDays,
                        occupied: b.occupiedDays ?? 0,
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <LeaveList scope={ESS_LEAVE_SCOPE} />
    </>
  )
}
