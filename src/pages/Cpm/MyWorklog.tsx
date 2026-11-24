/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import WorklogGantt from './WorklogGantt'

/**
 * 工作記錄（cpm-my）统一入口：一个视图，没有标签页。
 *
 * <p>原来拆成「工作台账 / 日视图」两个 tab，读的是同一批 biz_cpm_item，只是两种投影；
 * 但用户看到的后果是同一件事要在两个地方各录一次，而且谁也不知道哪边才是最新的。
 * 日视图剩下的能力（AI 助手／关联导入／导入会议／RDM 回写徽标）已全部并入台账行内与功能区，
 * 快捷录入与「未完结带入今天」横幅按本轮要求直接撤掉——台账本身就是录入面。
 *
 * <p>不再保留任何一层容器：包一层 Tabs 就会重新长出「切走即销毁、回来重拉」的双份状态。
 */
export default function MyWorklog() {
  return (
    <div className="content-area">
      <WorklogGantt />
    </div>
  )
}
