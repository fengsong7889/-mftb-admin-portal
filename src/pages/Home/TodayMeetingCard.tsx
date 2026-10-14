/**
 * 首页「今日會議」卡片
 *
 * 只在用户持有「我的會議」菜单时渲染：没有该菜单的人调 /meeting/my/summary 会拿到 403，
 * 卡片若把 403 当"今天没会"显示，就是拿错误当空数据——比报错更糟，因为它看起来完全正常。
 *
 * 三种状态分开处理（§F.2 空数据要有空态）：
 *   - 加载中 / 请求失败：整卡不渲染，首页是聚合视图，一个子模块不可用不该留下红框；
 *   - 今天确实没会：仍然渲染空态并给出「去預約會議室」入口——早期版本在这里直接 return null，
 *     结果是"今天没会"和"这个功能不存在"长得一模一样，入口也跟着消失，员工反而找不到预约在哪。
 * 数据全部来自后端 GET /meeting/my/summary（含组织者与受邀两种身份），前端不再自己判"今天有没有会"。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarOutlined, RightOutlined } from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { fetchMyMeetingSummary, type MeetingMySummary } from '../../api/meeting'

type LoadState = 'loading' | 'ready' | 'failed'

export default function TodayMeetingCard() {
  const { hasMenuPermission } = useAuth()
  const navigate = useNavigate()
  const visible = hasMenuPermission('meeting-my')
  const [data, setData] = useState<MeetingMySummary>()
  const [state, setState] = useState<LoadState>('loading')

  const load = useCallback(async (firstLoad: boolean) => {
    try {
      const next = await fetchMyMeetingSummary()
      setData(next)
      setState('ready')
    } catch {
      // 静默：后端不可用时首页其他模块也不该被这块拖住，卡片整体不渲染
      if (firstLoad) setState('failed')
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    void load(true)
    // 首页停留期间会议状态会变（别人取消、系统释放），30 秒一次轻量轮询取最新结论
    const timer = window.setInterval(() => { void load(false) }, 30000)
    return () => window.clearInterval(timer)
  }, [visible, load])

  if (!visible || state !== 'ready' || !data) return null

  const empty = data.todayCount === 0 && data.pendingResponseCount === 0 && !data.nextTitle

  return (
    <div
      className="home-today-meeting"
      role="button"
      tabIndex={0}
      onClick={() => navigate('/meeting-my')}
      onKeyDown={event => { if (event.key === 'Enter') navigate('/meeting-my') }}
      style={{
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        padding: '12px 18px', marginBottom: 14, borderRadius: 10,
        background: 'linear-gradient(90deg, #F0F7FF 0%, #FFFFFF 100%)',
        border: '1px solid #E6F0FB', cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13, color: '#595959' }}>今日會議</span>
      {empty ? (
        <span style={{ fontSize: 13, color: '#8C8C8C' }}>
          今天沒有與你相關的會議，
          <span style={{ color: '#E8720C' }}>去預約會議室</span>
        </span>
      ) : (
        <>
          <strong style={{ fontSize: 18, color: '#1890FF' }}>{data.todayCount}</strong>
          <span style={{ fontSize: 13, color: '#595959' }}>場</span>
          {data.pendingResponseCount > 0 && (
            <span style={{ fontSize: 13, color: '#E8720C' }}>
              待你響應 <strong>{data.pendingResponseCount}</strong> 則
            </span>
          )}
          {data.nextTitle && (
            <span style={{ fontSize: 13, color: '#595959' }}>
              下一場：{data.nextTitle}
              {data.nextStartTime && <span style={{ color: '#8C8C8C' }}> · {data.nextStartTime.slice(11, 16)}</span>}
              {data.nextRoomName && <span style={{ color: '#8C8C8C' }}> · {data.nextRoomName}</span>}
            </span>
          )}
        </>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C', display: 'inline-flex', alignItems: 'center' }}>
        {empty
          ? <><CalendarOutlined style={{ fontSize: 11, marginRight: 4 }} />前往我的會議</>
          : <>查看我的會議 <RightOutlined style={{ fontSize: 11 }} /></>}
      </span>
    </div>
  )
}
