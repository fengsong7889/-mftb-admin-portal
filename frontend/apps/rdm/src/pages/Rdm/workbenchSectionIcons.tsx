/**
 * 產研交付个人工作台 —— 区块图标登记表
 *
 * 单独成文件的原因：图标映射是常量而不是组件，放在面板文件里会破坏 React Fast Refresh
 * （eslint react-refresh/only-export-components），开发时改一行面板就得整页重载丢状态。
 * <p>配色遵循 §A.1 设计令牌：执行类蓝、质量类紫、发布类橙、需求类品牌橙、结果类绿。
 */
import {
  AlertOutlined,
  AuditOutlined,
  BranchesOutlined,
  BugOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  FileAddOutlined,
  FileTextOutlined,
  InboxOutlined,
  ProjectOutlined,
  RocketOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import type { RdmIdentity, RdmSectionKey } from './workbenchLayout'

/** 区块图标：配置面板与区块标题共用一份，避免两处各写一套导致语义漂移 */
export const RDM_SECTION_ICON: Record<RdmSectionKey, React.ReactNode> = {
  metrics: <DashboardOutlined />,
  'delivery-metrics': <RocketOutlined />,
  'todo-board': <AuditOutlined />,
  'dev-tasks': <CodeOutlined />,
  'test-batches': <BugOutlined />,
  issues: <ExclamationCircleOutlined />,
  'release-batches': <CloudUploadOutlined />,
  'role-todos': <SolutionOutlined />,
  'need-action': <AlertOutlined />,
  'my-projects': <ProjectOutlined />,
  'my-tracking': <FileTextOutlined />,
  activity: <BranchesOutlined />,
}

/** 兜底图标：新增区块忘记登记图标时不至于渲染成空白 */
export const DEFAULT_SECTION_ICON = <InboxOutlined />

/**
 * 工作身份图标：横幅上的「工作视图」标签用。
 * <p>与区块图标同源（研发=代码、测试=缺陷、发布=上传），让同一个人从身份标签到区块标题
 * 看到的是同一套视觉语义，不必再猜「测试工程师」和「我的测试批次」是不是两回事。
 */
export const RDM_IDENTITY_ICON: Record<RdmIdentity, React.ReactNode> = {
  submitter: <FileAddOutlined />,
  approver: <AuditOutlined />,
  dispatcher: <UserSwitchOutlined />,
  product: <SolutionOutlined />,
  developer: <CodeOutlined />,
  tester: <BugOutlined />,
  acceptor: <CheckCircleOutlined />,
  releaser: <CloudUploadOutlined />,
  projectMgr: <TeamOutlined />,
}

/** 身份兜底图标：新增身份忘记登记时横幅不至于渲染出空洞 */
export const DEFAULT_IDENTITY_ICON = <ProjectOutlined />
