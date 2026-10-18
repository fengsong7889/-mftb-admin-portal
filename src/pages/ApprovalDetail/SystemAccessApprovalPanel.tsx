/**
 * 系統權限申請「審批操作區」
 *
 * 审批人在这里直接指定要授予申请人的**角色**：候选只包含「已持有该系统准入的启用角色」，
 * 因此选出来就一定能让人进系统；角色具体有哪些菜单权限仍在权限管理系统配置，本流程不改授权内容。
 *
 * 2026-10 改口径：申请人不再勾选菜单，所以这里也不再有「覆盖率 N/M」与「未覆盖菜单清单」
 * （菜单明细清单本身就是不该外泄的系统结构信息）。审批人改看三样东西判断够不够用：
 * ① 申请人的使用场景与诉求（在上方「申請資訊」区）② 角色业务说明 ③「已授权 N 项功能」这个数量。
 * 判断不足时应当驳回并注明原因，而不是先通过再去补角色配置——通过后权限已即时生效。
 *
 * 标有「申請人建議」的是申请人在门户自助目录里选的角色，默认已选中，审批人可以改选或不选。
 *
 * 不提供「授权部门」：用户只属于一个部门，改 department_id 等同调岗，会连带影响人事/考勤/
 * 数据范围归属，不能用一张权限申请单去动它。
 */
import { Alert, Radio, Tag } from 'antd'
import { SafetyOutlined, TeamOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { SystemAccessGrantOption } from '../../api/systemAccessRequest'
import HelpPopover from '../../components/HelpPopover'

interface Props {
  /** 授权角色候选（后端已过滤为「持该系统准入的启用角色」，并把申请人建议项排在首位） */
  options: SystemAccessGrantOption[]
  /** 后端拒绝读取候选（403）：当前人不是该节点的审批人，展示只读提示而不是「没角色可授」 */
  denied?: boolean
  /** 当前选中的角色 ID */
  value: number | null
  onChange: (roleId: number | null) => void
  /** 申请的系统名（说明文案用） */
  systemName: string
}

export default function SystemAccessApprovalPanel({ options, denied, value, onChange, systemName }: Props) {
  const { t } = useTranslation()

  return (
    <div className="approval-section approval-section--grant">
      <div className="approval-section-title approval-section-title--orange">
        <SafetyOutlined style={{ marginRight: 6 }} />
        {t('approvalDetail.saGrantTitle')}
        <HelpPopover
          title={t('approvalDetail.saGrantHelpTitle')}
          ariaLabel={t('approvalDetail.saGrantHelpAria')}
          placement="bottomRight"
          width={420}
          content={[
            { tone: 'info', label: t('approvalDetail.saGrantHelpSourceLabel'), body: t('approvalDetail.saGrantHelpSource', { system: systemName }) },
            { tone: 'neutral', label: t('approvalDetail.saGrantHelpScopeLabel'), body: t('approvalDetail.saGrantHelpScope') },
            { tone: 'warn', label: t('approvalDetail.saGrantHelpJudgeLabel'), body: t('approvalDetail.saGrantHelpJudge') },
            { tone: 'success', label: t('approvalDetail.saGrantHelpEffectLabel'), body: t('approvalDetail.saGrantHelpEffect') },
          ]}
        />
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <SafetyOutlined />
        {t('approvalDetail.saGrantAutoHint')}
      </div>

      {denied ? (
        /* 不是当前节点审批人（也不是超管）：后端 403，只给只读说明，不说「没角色可授」 */
        <Alert type="info" showIcon message={t('approvalDetail.saGrantDenied')} />
      ) : options.length === 0 ? (
        /* 没有候选 = 还没有任何角色持有该系统准入，这时候通过也没意义，直接给可操作指引 */
        <Alert
          type="warning"
          showIcon
          message={t('approvalDetail.saGrantNoOption')}
          description={t('approvalDetail.saGrantNoOptionDesc', { system: systemName })}
        />
      ) : (
        <Radio.Group
          value={value}
          /* antd 透传原生 DOM 事件，event.target.value 是字符串（input.value 不可能是数字）：
             不做 Number() 的话，选中后 Group 的 value 变成 "12" 而 Radio 的 value 是 12，
             严格相等比对失败 → 卡片不高亮，且上送给后端的 targetId 是字符串 */
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ width: '100%' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {options.map((option) => {
              const selected = option.targetId === value
              return (
                /*
                 * 卡片就是 antd Radio 自己渲染的那个 label（样式直接给 Radio），不再外套一层 <label>：
                 * 嵌套 label 不是合法 HTML，而且点击会被两层 label 各转发一次，行为不可控。
                 * width 100% + margin 0：.ant-radio-wrapper 默认 inline-flex 且带 margin-inline-end。
                 */
                <Radio
                  key={option.targetId}
                  value={option.targetId}
                  style={{
                    width: '100%', margin: 0, borderRadius: 8, padding: '12px 14px',
                    alignItems: 'flex-start', cursor: 'pointer',
                    border: `1px solid ${selected ? '#E8720C' : '#e8eaed'}`,
                    background: selected ? '#fff7e6' : '#fff',
                  }}
                >
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <TeamOutlined style={{ color: selected ? '#E8720C' : '#8C8C8C' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{option.targetName}</span>
                      {option.targetCode && (
                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>({option.targetCode})</span>
                      )}
                      {option.preferred && (
                        <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>
                          {t('approvalDetail.saGrantPreferred')}
                        </Tag>
                      )}
                      {option.alreadyBound && (
                        <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                          {t('approvalDetail.saGrantAlreadyBound')}
                        </Tag>
                      )}
                    </span>
                    {option.description && (
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>{option.description}</span>
                    )}
                    {/* 只给数量不给清单：审批人需要知道范围宽窄，但不需要（也不该）在这里看到功能明细 */}
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {t('approvalDetail.saGrantMenuCount', { count: option.grantedMenuCount })}
                    </span>
                  </span>
                </Radio>
              )
            })}
          </div>
        </Radio.Group>
      )}

      {options.length > 0 && (
        <div style={{
          marginTop: 12, fontSize: 12, color: '#8c8c8c', lineHeight: 1.7,
          borderTop: '1px dashed #f0f0f0', paddingTop: 10,
        }}>
          {t('approvalDetail.saGrantFooterHint')}
        </div>
      )}
    </div>
  )
}
