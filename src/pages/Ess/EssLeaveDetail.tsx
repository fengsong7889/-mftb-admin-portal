import LeaveDetail from '../Permission/HrLeave/LeaveDetail'
import { ESS_LEAVE_SCOPE } from '../Permission/HrLeave/meta'

/** 自助端「请假单详情」页：复用人事端详情组件，操作按钮按 ess-leave 授权渲染 */
export default function EssLeaveDetail() {
  return <LeaveDetail scope={ESS_LEAVE_SCOPE} />
}
