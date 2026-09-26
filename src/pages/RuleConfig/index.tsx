/**
 * 規則總覽（rule-config 菜单）
 *
 * 规则菜单拆分后，本页作为只读聚合入口：按用户子菜单权限展示「规则中心」各版块的摘要，
 * 并提供跳转到对应版塊编辑页的入口。保留旧 /rule-config 路由，历史收藏/深链不失效。
 */
import { Card, Tag, Empty, Button } from 'antd'
import { SettingOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { RULE_CENTER_MENU_KEYS, getRuleGroupByMenu } from '../../constants/ruleConfig'

/** 子菜单 menuKey → 版塊编辑页路由 */
const MENU_ROUTE: Record<string, string> = {
  'rule-ad-sales': '/rule-center/ad-sales',
  'rule-gift': '/rule-center/gift',
  'rule-security': '/rule-center/security',
  'rule-algorithm': '/rule-center/algorithm',
  'rule-seq': '/rule-center/seq',
}

export default function RuleConfig() {
  const navigate = useNavigate()
  const { hasMenuPermission } = useAuth()

  const visibleMenus = RULE_CENTER_MENU_KEYS.filter(key => hasMenuPermission(key))

  return (
    <div className="content-area">
      {/* ── 頂部標題 ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #E8720C, #F59432)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
            }}>
              <SettingOutlined style={{ fontSize: 18, color: '#fff' }} />
            </div>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>規則總覽</h2>
              <span style={{ fontSize: 14, color: '#595959' }}>選擇下方版塊進入對應的規則維護頁</span>
            </div>
          </div>
        </div>
      </div>

      {visibleMenus.length === 0 ? (
        <Empty description="暫無可管理的規則版塊權限，請聯繫管理員" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {visibleMenus.map(menuKey => {
            const group = getRuleGroupByMenu(menuKey)
            if (!group) return null
            return (
              <Card
                key={menuKey}
                hoverable
                onClick={() => navigate(MENU_ROUTE[menuKey])}
                style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                styles={{ body: { padding: 20 } }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, fontSize: 16,
                    background: `${group.color}15`, color: group.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{group.icon}</div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{group.title}</span>
                  <Tag color={group.color} style={{ marginLeft: 'auto', fontSize: 11 }}>{group.rules.length} 項</Tag>
                  <RightOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#8C8C8C', minHeight: 34 }}>
                  {group.description}
                </div>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, marginTop: 6, color: '#E8720C' }}
                  onClick={(e) => { e.stopPropagation(); navigate(MENU_ROUTE[menuKey]) }}
                >
                  進入維護
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
