import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Tag, Input, Modal } from 'antd'
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  UndoOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import './ApprovalDetail.css'

/** 审批历史记录 */
interface ApprovalTimelineItem {
  node: string
  time: string
  approver: string
  status: 'approved' | 'rejected' | 'submitted' | 'pending'
  comment: string
  rejectReason?: string
}

/** 审批详情数据 */
interface ApprovalDetailData {
  approvalType: 'recharge' | 'deduct' | 'transfer' | 'merge'
  applicant: string
  applyDate: string
  flowNo: string
  flowStatus: string
  brand: string
  // 充值
  settlementMethod?: string
  businessType?: string
  rechargeAmount?: number
  bankTransfer?: number
  bdPerson?: string
  discountAmount?: number
  // 扣款
  deductMethod?: string
  deductAmount?: number
  // 转账
  fromGroupId?: string
  fromGroupName?: string
  fromBrand?: string
  fromAmount?: number
  toGroupId?: string
  toGroupName?: string
  toBrand?: string
  toAmount?: number
  // 合并
  mergeGroupId?: string
  mergeGroupName?: string
  mergeBrand?: string
  mergeAmount?: number
  mergeToGroupId?: string
  mergeToGroupName?: string
  mergeToBrand?: string
  mergeToAmount?: number
  debtNote?: string
  repaymentStores?: { store: string; channel: string; amount: number; bd: string }[]
  // 通用
  groupId?: string
  groupName?: string
  documents?: { type: 'image' | 'pdf' | 'view'; name?: string }[]
  notes?: string
  timeline: ApprovalTimelineItem[]
  hasRevoke?: boolean
}

/** 模拟数据 */
const mockDetails: Record<string, ApprovalDetailData> = {
  recharge: {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-06-01 09:16:21',
    flowNo: 'CZ20260601000000',
    flowStatus: '審核中',
    brand: '2閃蜂',
    groupId: '100000000000',
    groupName: '廣州酒家',
    settlementMethod: '對公轉賬',
    businessType: '外賣',
    rechargeAmount: 100000,
    bankTransfer: 90000,
    bdPerson: '關山月(001)',
    discountAmount: 1000,
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合同文件1.pdf' }, { type: 'pdf', name: '合同文件2.pdf' },
      { type: 'view' },
    ],
    notes: '請領導迅速審批，老闆等著推廣金到賬，消費一波，謝謝！',
    hasRevoke: false,
    timeline: [
      { node: '財務主管審批', time: '2026-01-18 10:18:26', approver: '贏政(999)', status: 'rejected', comment: '下次一定要拍攝清晰，紙質合同請保留好，避免後續出現糾紛。', rejectReason: '相關證明一定要清晰，快速可查……' },
      { node: '運營主管審批', time: '2026-01-17 10:18:26', approver: '劉邦(000)', status: 'approved', comment: '相關證明一定要清晰，快速可查，後續如還需要依賴紙質合同快速核對問題，有多少時間和精力，能確保100%找到嗎，保障O風險，駁回重新提交。' },
      { node: '業務主管審批', time: '2026-01-16 09:19:21', approver: '朱元璋(001)', status: 'approved', comment: '合同拍攝不是很清晰，但我已經線下核對無誤，本次先審核通過，請下一節點審批人通過。' },
      { node: '流程創建', time: '2026-01-16 09:19:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  deduct: {
    approvalType: 'deduct',
    applicant: '朱棟(002)',
    applyDate: '2026-06-01 09:16:21',
    flowNo: 'KK20260601000000',
    flowStatus: '審核中',
    brand: '1mFood',
    groupId: '100000000000',
    groupName: '廣州酒家',
    deductMethod: '賬戶扣款',
    deductAmount: -100021.21,
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '扣款協議.pdf' },
      { type: 'view' },
    ],
    notes: '商家需要再巴士進行打廣告，委託我們進行操作，與商家達成協議，扣取推廣金100021.21元；',
    hasRevoke: true,
    timeline: [
      { node: '財務主管審批', time: '2026-01-18 10:18:26', approver: '贏政(999)', status: 'rejected', comment: '下次一定要拍攝清晰，紙質合同請保留好，避免後續出現糾紛。' },
      { node: '運營主管審批', time: '2026-01-17 10:18:26', approver: '劉邦(000)', status: 'approved', comment: '相關證明一定要清晰，快速可查，後續如還需要依賴紙質合同快速核對問題，有多少時間和精力，能確保100%找到嗎，保障O風險，駁回重新提交。' },
      { node: '業務主管審批', time: '2026-01-16 09:19:21', approver: '朱元璋(001)', status: 'approved', comment: '合同拍攝不是很清晰，但我已經線下核對無誤，本次先審核通過，請下一節點審批人通過。' },
      { node: '流程創建', time: '2026-01-16 09:19:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  transfer: {
    approvalType: 'transfer',
    applicant: '朱棟(002)',
    applyDate: '2026-06-01 09:16:21',
    flowNo: 'ZZ20260601000000',
    flowStatus: '審核中',
    brand: '1mFood',
    fromGroupId: '100000000000',
    fromGroupName: '廣州酒家',
    fromBrand: '1mFood',
    fromAmount: -100021.21,
    toGroupId: '100000000000',
    toGroupName: '北京烤鴨',
    toBrand: '1mFood',
    toAmount: 100021.21,
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '轉賬協議.pdf' },
      { type: 'view' },
    ],
    notes: '商戶A和商戶B已完成合併協議簽訂，現在申請將商戶A賬戶推廣金餘額全部轉入商戶B。',
    hasRevoke: true,
    timeline: [
      { node: '財務主管審批', time: '2026-01-18 10:18:26', approver: '贏政(999)', status: 'rejected', comment: '下次一定要拍攝清晰，紙質合同請保留好，避免後續出現糾紛。' },
      { node: '運營主管審批', time: '2026-01-17 10:18:26', approver: '劉邦(000)', status: 'approved', comment: '相關證明一定要清晰，快速可查，後續如還需要依賴紙質合同快速核對問題，有多少時間和精力，能確保100%找到嗎，保障O風險，駁回重新提交。' },
      { node: '業務主管審批', time: '2026-01-16 09:19:21', approver: '朱元璋(001)', status: 'approved', comment: '合同拍攝不是很清晰，但我已經線下核對無誤，本次先審核通過，請下一節點審批人通過。' },
      { node: '流程創建', time: '2026-01-16 09:19:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  merge: {
    approvalType: 'merge',
    applicant: '朱棣(002)',
    applyDate: '2026-06-01 09:16:21',
    flowNo: 'HB20260601000000',
    flowStatus: '審核中',
    brand: '1mFood',
    mergeGroupId: '100000000000',
    mergeGroupName: '廣州酒家',
    mergeBrand: '1mFood',
    mergeAmount: -100021.21,
    mergeToGroupId: '100000000000',
    mergeToGroupName: '北京烤鴨',
    mergeToBrand: '1mFood',
    mergeToAmount: 100021.21,
    debtNote: '欠款賬單 (被合併集團的欠款單遷移至當前集團門店退款)',
    repaymentStores: [
      { store: '廣州酒店天河店(123)', channel: '外賣', amount: 3000, bd: '古月(001)' },
      { store: '廣州酒店天河店(123)', channel: '團購', amount: 2000, bd: '浩源(002)' },
    ],
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合併協議.pdf' },
      { type: 'view' },
    ],
    notes: '商戶A和商戶B已完成合併協議簽訂，現在申請將商戶A賬戶推廣金餘額全部轉入商戶B。',
    hasRevoke: true,
    timeline: [
      { node: '財務主管審批', time: '2026-01-18 10:18:26', approver: '贏政(999)', status: 'rejected', comment: '下次一定要拍攝清晰，紙質合同請保留好，避免後續出現糾紛。' },
      { node: '運營主管審批', time: '2026-01-17 10:18:26', approver: '劉邦(000)', status: 'approved', comment: '相關證明一定要清晰，快速可查，後續如還需要依賴紙質合同快速核對問題，有多少時間和精力，能確保100%找到嗎，保障O風險，駁回重新提交。' },
      { node: '業務主管審批', time: '2026-01-16 09:19:21', approver: '朱元璋(001)', status: 'approved', comment: '合同拍攝不是很清晰，但我已經線下核對無誤，本次先審核通過，請下一節點審批人通過。' },
      { node: '流程創建', time: '2026-01-16 09:19:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
}

const typeTitleMap: Record<string, string> = {
  recharge: '充值審批',
  deduct: '扣款審批',
  transfer: '轉賬審批',
  merge: '合併審批',
}

export default function ApprovalDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type') || 'recharge'
  const data = mockDetails[type] || mockDetails.recharge

  const [approvalComment, setApprovalComment] = useState('')
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = () => {
    Modal.confirm({
      title: '審批確認',
      content: '確定要通過此審批申請嗎？',
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        console.log('Approved with comment:', approvalComment)
        navigate('/approval-center')
      },
    })
  }

  const handleReject = () => {
    setShowRejectModal(true)
  }

  const handleRejectConfirm = () => {
    if (!rejectReason.trim()) {
      return
    }
    console.log('Rejected with reason:', rejectReason)
    setShowRejectModal(false)
    navigate('/approval-center')
  }

  const handleRevoke = () => {
    setShowRevokeModal(true)
  }

  const handleRevokeConfirm = () => {
    console.log('Revoked')
    setShowRevokeModal(false)
    navigate('/approval-center')
  }

  const renderStatusTag = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      approved: { color: 'success', text: '通過' },
      rejected: { color: 'error', text: '駁回' },
      submitted: { color: 'processing', text: '提交' },
      pending: { color: 'default', text: '待審批' },
    }
    const info = map[status] || map.pending
    return <Tag color={info.color}>{info.text}</Tag>
  }

  const renderDocument = (doc: { type: string; name?: string }, index: number) => {
    if (doc.type === 'image') {
      return (
        <div key={index} className="approval-doc-thumb">
          <FileImageOutlined className="approval-doc-icon" style={{ color: '#1890ff' }} />
        </div>
      )
    }
    if (doc.type === 'pdf') {
      return (
        <div key={index} className="approval-doc-thumb">
          <FilePdfOutlined className="approval-doc-icon" style={{ color: '#e53935' }} />
          <span className="approval-doc-pdf-label">PDF</span>
        </div>
      )
    }
    return (
      <div key={index} className="approval-doc-thumb approval-doc-thumb--view">
        <EyeOutlined className="approval-doc-icon" style={{ color: '#666' }} />
        <span className="approval-doc-view-label">點擊查看</span>
      </div>
    )
  }

  return (
    <div className="approval-detail-page">
      {/* 顶部标题栏 */}
      <div className="approval-detail-header">
        <div className="approval-detail-title">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/approval-center')} className="approval-back-btn" />
          <span>{typeTitleMap[type]}-{data.brand}-{data.applyDate.split(' ')[0]}</span>
        </div>
        <div className="approval-detail-actions">
          <Button onClick={() => navigate('/approval-center')}>返回</Button>
          {data.hasRevoke && (
            <Button icon={<UndoOutlined />} onClick={handleRevoke}>撤銷</Button>
          )}
          <Button type="primary" onClick={handleApprove}>通過</Button>
          <Button danger onClick={handleReject}>駁回</Button>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="approval-detail-body">
        {/* 左侧信息 */}
        <div className="approval-detail-left">
          {/* 基本信息 */}
          <div className="approval-section">
            <div className="approval-section-title approval-section-title--blue">基本資訊</div>
            <div className="approval-info-grid">
              <div className="approval-info-item">
                <span className="approval-info-label">申請人</span>
                <span className="approval-info-value">{data.applicant}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">申請日期</span>
                <span className="approval-info-value">{data.applyDate}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">流程編號</span>
                <span className="approval-info-value">{data.flowNo}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">流程狀態</span>
                <span className="approval-info-value">
                  <Tag color="warning" className="approval-status-tag">{data.flowStatus}</Tag>
                </span>
              </div>
            </div>
          </div>

          {/* 充值类型 */}
          {type === 'recharge' && (
            <div className="approval-section">
              <div className="approval-section-title approval-section-title--purple">審核資訊</div>
              <div className="approval-info-grid">
                <div className="approval-info-item">
                  <span className="approval-info-label">集團ID</span>
                  <span className="approval-info-value">{data.groupId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">集團名稱</span>
                  <span className="approval-info-value">{data.groupName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">所屬品牌</span>
                  <span className="approval-info-value">{data.brand}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">結算方式</span>
                  <span className="approval-info-value">{data.settlementMethod}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">業務類型</span>
                  <span className="approval-info-value">{data.businessType}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">歸屬BD</span>
                  <span className="approval-info-value">{data.bdPerson}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">充值金額</span>
                  <span className="approval-info-value approval-amount--orange">{data.rechargeAmount?.toLocaleString()}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">銀行轉賬</span>
                  <span className="approval-info-value approval-amount--orange">{data.bankTransfer?.toLocaleString()}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">優惠金額</span>
                  <span className="approval-info-value approval-amount--green">{data.discountAmount?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* 扣款类型 */}
          {type === 'deduct' && (
            <div className="approval-section">
              <div className="approval-section-title approval-section-title--purple">扣款商戶</div>
              <div className="approval-info-grid">
                <div className="approval-info-item">
                  <span className="approval-info-label">集團ID</span>
                  <span className="approval-info-value">{data.groupId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">集團名稱</span>
                  <span className="approval-info-value">{data.groupName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">所屬品牌</span>
                  <span className="approval-info-value">{data.brand}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">扣款方式</span>
                  <span className="approval-info-value">{data.deductMethod}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">扣款金額</span>
                  <span className="approval-info-value approval-amount--red">{data.deductAmount?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* 转账类型 */}
          {type === 'transfer' && (
            <>
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">轉出商戶</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.fromGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.fromGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.fromBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">轉出金額</span>
                    <span className="approval-info-value approval-amount--red">{data.fromAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">轉入商戶</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.toGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.toGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.toBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">轉入金額</span>
                    <span className="approval-info-value approval-amount--orange">+{data.toAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 合并类型 */}
          {type === 'merge' && (
            <>
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">被合併集團資訊</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.mergeGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.mergeGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.mergeBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">合併金額</span>
                    <span className="approval-info-value approval-amount--red">{data.mergeAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">合併至以下集團</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.mergeToGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.mergeToGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.mergeToBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">供入金額</span>
                    <span className="approval-info-value approval-amount--orange">+{data.mergeToAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {/* 欠款賬單 */}
              <div className="approval-section">
                <div className="approval-section-title">欠款賬單</div>
                <div className="approval-debt-note">{data.debtNote}</div>
                {data.repaymentStores && data.repaymentStores.length > 0 && (
                  <div className="approval-repayment-title">還款門店選擇</div>
                )}
                {data.repaymentStores && (
                  <table className="approval-repayment-table">
                    <thead>
                      <tr>
                        <th>還款門店</th>
                        <th>業務頻道</th>
                        <th>還款金額</th>
                        <th>選擇BD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.repaymentStores.map((store, i) => (
                        <tr key={i}>
                          <td>{store.store}</td>
                          <td>{store.channel}</td>
                          <td className="approval-amount--orange">{store.amount.toLocaleString()}</td>
                          <td>{store.bd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* 相关凭证 */}
          <div className="approval-section">
            <div className="approval-section-title">相關憑證</div>
            <div className="approval-documents">
              {data.documents?.map((doc, i) => renderDocument(doc, i))}
            </div>
          </div>

          {/* 备注信息 */}
          <div className="approval-section">
            <div className="approval-section-title">備註信息</div>
            <div className="approval-notes">{data.notes}</div>
          </div>

          {/* 审批意见 */}
          <div className="approval-section">
            <div className="approval-section-title">審批意見</div>
            <Input.TextArea
              rows={3}
              placeholder="可備註審核意見，限制200字！"
              maxLength={200}
              showCount
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
            />
          </div>
        </div>

        {/* 右侧审批流 */}
        <div className="approval-detail-right">
          <div className="approval-timeline-title">審批流程</div>
          <div className="approval-timeline">
            {data.timeline.map((item, index) => (
              <div key={index} className={`approval-timeline-item approval-timeline-item--${item.status}`}>
                <div className="approval-timeline-dot" />
                <div className="approval-timeline-content">
                  <div className="approval-timeline-header">
                    <span className="approval-timeline-node">{item.node}</span>
                    <span className="approval-timeline-time">{item.time}</span>
                  </div>
                  <div className="approval-timeline-info">
                    {item.status === 'submitted' ? '申請人' : '審批人'}：{item.approver}
                  </div>
                  <div className="approval-timeline-status">
                    {renderStatusTag(item.status)}
                  </div>
                  {item.comment && (
                    <div className="approval-timeline-comment">
                      <span className="approval-timeline-comment-label">審批意見：</span>
                      {item.comment}
                    </div>
                  )}
                  {item.rejectReason && (
                    <div className="approval-timeline-reject">
                      <span className="approval-timeline-reject-label">駁回理由：</span>
                      {item.rejectReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="approval-detail-footer">
        <Button onClick={() => navigate('/approval-center')}>返回</Button>
        {data.hasRevoke && (
          <Button icon={<UndoOutlined />} onClick={handleRevoke}>撤銷</Button>
        )}
        <Button type="primary" onClick={handleApprove}>通過</Button>
        <Button danger onClick={handleReject}>駁回</Button>
      </div>

      {/* 撤销确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>撤銷確認</span>
            <Button type="link" size="small" onClick={() => setShowRevokeModal(false)} style={{ padding: 0 }}>關閉</Button>
          </div>
        }
        open={showRevokeModal}
        onCancel={() => setShowRevokeModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRevokeModal(false)}>取消</Button>
            <Button type="primary" onClick={handleRevokeConfirm}>確定撤銷</Button>
          </div>
        }
        width={440}
        centered
      >
        <div className="revoke-modal-content">
          <div className="revoke-modal-icon">
            <ExclamationCircleOutlined />
          </div>
          <div className="revoke-modal-question">您確定要撤銷本次申請嗎？</div>
          <div className="revoke-modal-warning">撤銷後，整個審批流程將立即終止，此操作不可恢復，請謹慎確認！</div>
        </div>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal
        title="駁回審批"
        open={showRejectModal}
        onCancel={() => setShowRejectModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRejectModal(false)}>取消</Button>
            <Button danger onClick={handleRejectConfirm} disabled={!rejectReason.trim()}>確定駁回</Button>
          </div>
        }
        width={480}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>駁回理由 <span style={{ color: '#E53935' }}>*</span></div>
          <Input.TextArea
            rows={4}
            placeholder="請輸入駁回理由（必填）"
            maxLength={200}
            showCount
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
