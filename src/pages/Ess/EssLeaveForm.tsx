import LeaveForm from '../Permission/HrLeave/LeaveForm'
import { ESS_LEAVE_SCOPE } from '../Permission/HrLeave/meta'

/** 自助端「发起请假」页：复用人事端表单组件，注入自助作用域（权限 key=ess-leave、返回 /ess-leave） */
export default function EssLeaveForm() {
  return <LeaveForm scope={ESS_LEAVE_SCOPE} />
}
