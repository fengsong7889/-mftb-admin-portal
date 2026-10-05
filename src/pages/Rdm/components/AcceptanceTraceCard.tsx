/**
 * AcceptanceTraceCard —— 需求详情右侧的「业务验收与版本追溯」卡片
 *
 * 设计口径：详情页原来只显示"最后一次验收结论"，业务看不到
 * 「这条需求被退过几次、每次哪几条用例没过、最后上了哪个版本」。
 * 本卡片把验收历史 + 返工次数 + 版本追溯入口收在一起。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Space, Tag, Tooltip, message } from 'antd'
import {
  BranchesOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  fetchAcceptanceHistory,
  type RdmAcceptanceRecord,
  type RdmRequirementDetail,
} from '../../../api/rdm'
import {
  RDM_ACCEPT_RESULT,
  RDM_ACCEPT_RESULT_COLOR,
  RDM_ACCEPT_RESULT_LABEL,
  RDM_TEST_ENV_LABEL,
  type RdmAcceptResult,
  type RdmTestEnv,
} from '../../../constants/rdm'

interface AcceptanceTraceCardProps {
  detail: RdmRequirementDetail
}

/** 验收结论标签 */
function ResultTag({ result }: { result: string }) {
  const key = result as RdmAcceptResult
  return (
    <Tag color={RDM_ACCEPT_RESULT_COLOR[key] ?? 'default'} style={{ margin: 0 }}>
      {RDM_ACCEPT_RESULT_LABEL[key] ?? result}
    </Tag>
  )
}

export default function AcceptanceTraceCard({ detail }: AcceptanceTraceCardProps) {
  const navigate = useNavigate()
  const [history, setHistory] = useState<RdmAcceptanceRecord[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setHistory(await fetchAcceptanceHistory(detail.id))
    } catch {
      message.error('驗收歷史載入失敗')
    } finally {
      setLoading(false)
    }
  }, [detail.id])

  useEffect(() => { void load() }, [load])

  // 单据上的验收字段兜底：后端历史接口不可用时，至少还能看到当前结论
  const records = history.length > 0
    ? history
    : detail.acceptance?.result
      ? [{
        id: -1,
        acceptNo: '-',
        reqId: detail.id,
        attempt: 1,
        acceptorName: detail.acceptance.acceptorName,
        result: detail.acceptance.result,
        score: detail.acceptance.score,
        caseTotal: detail.acceptance.caseTotal,
        casePass: detail.acceptance.casePass,
      } as RdmAcceptanceRecord]
      : []

  const reworkCount = records.filter(r => r.result === RDM_ACCEPT_RESULT.FAIL).length

  return (
    <div className="rdm-card">
      <div className="rdm-card-title">
        <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><CheckCircleOutlined /></span>
        業務驗收與追溯
        <span className="rdm-card-title-split" />
        {reworkCount > 0 && (
          <Tooltip title="驗收不通過的累計次數，計入質量口徑的一次通過率">
            <Tag color="error" style={{ margin: 0 }}>返工 {reworkCount} 次</Tag>
          </Tooltip>
        )}
      </div>

      {records.length === 0 && (
        <div style={{ fontSize: 12, color: '#8C8C8C' }}>
          {loading ? '載入中…' : '尚未提交驗收結論，上線前需由業務驗收人逐項確認用例。'}
        </div>
      )}

      {records.map(r => (
        <div key={r.id} className="rdm-acceptance-history">
          <ResultTag result={r.result} />
          <span className="rdm-acceptance-history-main">
            <span style={{ color: '#262626' }}>第 {r.attempt} 次{r.acceptorName ? ` · ${r.acceptorName}` : ''}</span>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              {r.acceptTime ? dayjs(r.acceptTime).format('YYYY-MM-DD HH:mm') : ''}
              {r.testEnv ? ` · ${RDM_TEST_ENV_LABEL[r.testEnv as RdmTestEnv] ?? r.testEnv}` : ''}
              {r.caseTotal != null ? ` · 用例 ${r.casePass ?? 0}/${r.caseTotal}` : ''}
              {r.score != null ? ` · 滿意度 ${r.score}/5` : ''}
            </div>
            {(r.issues || r.opinion) && (
              <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>{r.issues ?? r.opinion}</div>
            )}
            {r.followUpReqNo && (
              <div style={{ fontSize: 12, color: '#1890FF', marginTop: 2 }}>遺留事項已轉：{r.followUpReqNo}</div>
            )}
          </span>
        </div>
      ))}

      <Space size={8} wrap style={{ marginTop: records.length > 0 ? 10 : 4 }}>
        <Button
          size="small"
          icon={<BranchesOutlined />}
          onClick={() => navigate(`/rdm-version-trace?reqId=${detail.id}`)}
        >
          版本追溯
        </Button>
        {detail.versionNo ? (
          <Tag color="blue" style={{ margin: 0 }} icon={<RocketOutlined />}>已上線 {detail.versionNo}</Tag>
        ) : (
          <Tag style={{ margin: 0 }} icon={<HistoryOutlined />}>未關聯版本</Tag>
        )}
      </Space>
    </div>
  )
}
