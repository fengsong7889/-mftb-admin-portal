import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RdmDailyReportView from './index'
import i18n from '../../i18n'

const fetchView = vi.fn()

vi.mock('../../api/rdmDailyReportPublic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/rdmDailyReportPublic')>()
  return { ...actual, fetchDailyReportPublicView: (token: string) => fetchView(token) }
})

const SNAPSHOT = {
  reportDate: '2026-10-20',
  reportType: 'morning',
  reportTypeLabel: '晨報',
  generatedAt: '2026-10-20 09:00:03',
  scopeLabel: '項目#1 / 全部迭代',
  summary: {
    projectCount: 1,
    todayDueItemCount: 2,
    overdueItemCount: 3,
    tomorrowDueItemCount: 0,
    riskProjectCount: 1,
    normalProjectCount: 0,
    todayDoneItemCount: 1,
    todayReleasedCount: 0,
    todayChangedCount: 4,
    requirementTotal: 2,
    deliveryItemTotal: 4,
    deliveryItemCompleted: 1,
    todoTotal: 0,
    iterationActiveCount: 2,
    overdueReqCount: 2,
    blockedReqCount: 1,
    overdueRiskReqCount: 2,
  },
  projects: [
    {
      projectId: 1,
      projectNo: 'PROJ2026102001',
      projectName: '門戶改版',
      status: 'active',
      pmUserId: 7,
      pmUserName: '張三',
      productOwnerUserId: 8,
      productOwnerUserName: '李四',
      techLeadUserName: '研發甲',
      qaLeadUserName: '測試乙',
      uiDesignerUserName: '設計丙',
      opsLeadUserName: '運維丁',
      riskFlag: 1,
      overdueFlag: 0,
      pausedFlag: 0,
      requirementTotal: 2,
      deliveryItemTotal: 4,
      deliveryItemCompleted: 1,
      deliveryProgressPercent: 25,
      remainingCount: 3,
      deliveryItemOverdue: 2,
      deliveryItemBlocked: 1,
      deliveryItemTesting: 1,
      deliveryItemPendingAcceptance: 0,
      taskTotal: 0,
      taskCompleted: 0,
      todoTotal: 0,
      attention: true,
      detailUrl: '/rdm-project-detail?id=1&mode=view',
      iterations: [
        {
          iterationId: 5,
          projectId: 1,
          code: 'SP202610001',
          name: '十月迭代',
          iterationType: 'sprint',
          status: 'active',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          ownerName: '李四',
          requirementCount: 1,
          requirementDoneCount: 0,
          capacityHours: 80,
          taskHours: 18,
          capacityUsagePercent: 23,
          progressPercent: 82,
          taskTotal: 2,
          taskDone: 1,
          requirements: [
            {
              reqId: 11,
              reqNo: 'XQ202610001',
              title: '登錄改版',
              status: 'developing',
              statusLabel: '開發中',
              complexity: 'MEDIUM',
              priority: 'P1',
              assigneePmName: '張三',
              stayDays: 7,
              planReleaseDate: '2026-10-30',
              overdueFlag: 0,
              blockedFlag: 0,
              progress: 40,
              detailUrl: '/rdm-detail?id=11&mode=view',
              tasks: [
                {
                  taskId: 31, taskNo: 'TASK-31', title: '登錄頁重構', taskType: 'frontend', roleCode: 'DEV', ownerName: '研發甲',
                  ownerEmpNo: 'MF001', progress: 100,
                  planHours: 10,
                  planStartDate: '2026-10-05', planFinishDate: '2026-10-18', status: 'done',
                },
                {
                  taskId: 32, taskNo: 'TASK-32', title: '登錄回歸測試', taskType: 'qa', roleCode: 'QA', ownerName: '測試乙',
                  ownerEmpNo: 'MF002', progress: 60,
                  planHours: 8,
                  planStartDate: '2026-10-19', planFinishDate: '2026-10-26', status: 'testing',
                },
              ],
            },
          ],
        },
      ],
      unscheduledRequirements: [],
    },
  ],
  unassignedIterations: [],
}

function openPage(entry = '/rdm-daily-view?token=abc') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/rdm-daily-view" element={<RdmDailyReportView />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('進度日報看板（開放頁）', () => {
  beforeEach(async () => {
    // 必须是 mockReset 而不是 clearAllMocks：后者只清调用记录，
    // 上一个用例设的 mockRejectedValue 会泄漏到下一个用例，
    // 表现为「明明给了正常数据却报网络异常」的随机失败。
    fetchView.mockReset()
    await i18n.changeLanguage('zh-TW')
  })

  it('有效令牌：渲染固定模板的项目、负责人与需求明细', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: '2026-11-19 09:00:03',
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    // 品牌与集团 Logo 固定在看板页头，不允许按项目改
    expect(document.querySelector('.rdm-board-brand-name')?.textContent).toBe('麦峰集团·项目汇报')
    expect(document.querySelector('.rdm-board-logo svg')).not.toBeNull()
    // 顶部署名保密提示，页脚说明非实时数据与生成时刻
    expect(screen.getByText(/集團核心機密數據/)).toBeInTheDocument()
    expect(screen.getByText(/截至當日 09:00 生成/)).toBeInTheDocument()
    expect(screen.getByText(/非實時數據/)).toBeInTheDocument()
    expect(screen.getByText('PROJ2026102001')).toBeInTheDocument()
    expect(screen.getAllByText(/張三/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/登錄改版/).length).toBeGreaterThan(0)
    expect(screen.getByText('XQ202610001')).toBeInTheDocument()
    expect(screen.getAllByText(/2026-11-19 09:00:03/).length).toBeGreaterThan(0)
    // 顶部四指标：在途项目 / 迭代版本 / 需求总数 / 逾期风险
    expect(screen.getByText('迭代版本')).toBeInTheDocument()
    expect(screen.getByText('需求總數')).toBeInTheDocument()
    expect(screen.getByText('逾期風險')).toBeInTheDocument()
    // 项目负责人芯片：有配置才展示
    expect(screen.getByText('測試 測試乙')).toBeInTheDocument()
    expect(screen.getByText('停留 7 天')).toBeInTheDocument()
  })

  it('項目卡展示交付進度；迭代行展示進度與產能，並提供口徑說明入口', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: '2026-11-19 09:00:03',
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    // 項目交付進度：1/4 = 25%，一眼看到完成比例與剩餘項數
    expect(screen.getByText('交付進度')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    const deliveryMeta = document.querySelector('.rdm-board-delivery-meta')?.textContent ?? ''
    expect(deliveryMeta).toContain('已完成 1/4 項')
    expect(deliveryMeta).toContain('剩餘 3 項')
    // 迭代行：進度按任務計劃工時加權，產能為已排工時/產能
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.getByText('23%')).toBeInTheDocument()
    expect(screen.getAllByText('進度').length).toBeGreaterThan(0)
    expect(screen.getAllByText('產能').length).toBeGreaterThan(0)
    // 口徑說明走 HelpPopover（點擊問號），不是移開即消失的 Tooltip
    expect(screen.getByLabelText('迭代進度與產能口徑說明')).toBeInTheDocument()
    // 迭代類型胶囊本身也是說明入口（衝刺/版本/熱修釋義）
    expect(screen.getByRole('button', { name: '衝刺' })).toBeInTheDocument()
  })

  it('舊快照沒有迭代進度欄位：不展示進度/產能，也不誤報「尚無任務」', async () => {
    const legacyIteration = {
      iterationId: 5, projectId: 1, code: 'SP202610001', name: '十月迭代', iterationType: 'sprint',
      status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', ownerName: '李四',
      requirementCount: 1, requirementDoneCount: 0,
      requirements: SNAPSHOT.projects[0].iterations[0].requirements,
    }
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: {
        ...SNAPSHOT,
        projects: [{ ...SNAPSHOT.projects[0], iterations: [legacyIteration] }],
      },
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.queryByText('尚無任務')).not.toBeInTheDocument()
    expect(screen.queryByText('未設定')).not.toBeInTheDocument()
  })

  it('已歸檔需求：預設不展示，切到「已完成」後展示但不展示停留天數（歸檔後數字只增不減）', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: '2026-11-19 09:00:03',
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: {
        ...SNAPSHOT,
        projects: [{
          ...SNAPSHOT.projects[0],
          iterations: [{
            ...SNAPSHOT.projects[0].iterations[0],
            requirements: [{
              ...SNAPSHOT.projects[0].iterations[0].requirements[0],
              status: 'closed',
              statusLabel: '已歸檔',
              stayDays: 1,
            }],
          }],
        }],
      },
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    // 默认只看未完成需求：已归档需求不占默认视图的空间
    expect(screen.queryByText('已歸檔')).not.toBeInTheDocument()
    // 切到「已完成」后才展示，且仍不出现停留天数
    const reqFilter = document.querySelector('[data-filter="req"]') as HTMLElement
    fireEvent.click(within(reqFilter).getByText('已完成'))
    await waitFor(() => expect(screen.getByText('已歸檔')).toBeInTheDocument())
    expect(screen.getAllByText(/登錄改版/).length).toBeGreaterThan(0)
    expect(screen.queryByText('停留 1 天')).not.toBeInTheDocument()
  })

  it('已關閉迭代：預設隱藏，切到「已完成」後展示且推進中的迭代隱藏', async () => {
    const closedIteration = {
      ...SNAPSHOT.projects[0].iterations[0],
      iterationId: 6,
      code: 'SP202609001',
      name: '九月迭代',
      status: 'closed',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      requirements: [{
        ...SNAPSHOT.projects[0].iterations[0].requirements[0],
        reqId: 12,
        reqNo: 'XQ202609001',
        title: '舊版登錄',
        status: 'closed',
        statusLabel: '已歸檔',
      }],
    }
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: {
        ...SNAPSHOT,
        projects: [{
          ...SNAPSHOT.projects[0],
          iterations: [closedIteration, SNAPSHOT.projects[0].iterations[0]],
        }],
      },
    })
    openPage()

    await waitFor(() => expect(screen.getByText('十月迭代')).toBeInTheDocument())
    expect(screen.queryByText('九月迭代')).not.toBeInTheDocument()

    const iterFilter = document.querySelector('[data-filter="iter"]') as HTMLElement
    fireEvent.click(within(iterFilter).getByText('已完成'))
    await waitFor(() => expect(screen.getByText('九月迭代')).toBeInTheDocument())
    expect(screen.queryByText('十月迭代')).not.toBeInTheDocument()
    // 已完成迭代下默认只看未完成需求，空态必须提示可切筛选，而不是谎报「本迭代尚無需求」
    expect(screen.getByText(/本口徑下無需求/)).toBeInTheDocument()
  })

  it('歷史迭代遺留未完成需求：預設給出可點擊提示，點擊後定位到「已完成迭代 + 未完成需求」', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: {
        ...SNAPSHOT,
        projects: [{
          ...SNAPSHOT.projects[0],
          iterations: [{
            ...SNAPSHOT.projects[0].iterations[0],
            iterationId: 7,
            code: 'SP202608001',
            name: '八月迭代',
            status: 'closed',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
            requirements: [{
              ...SNAPSHOT.projects[0].iterations[0].requirements[0],
              reqId: 13,
              reqNo: 'XQ202608001',
              title: '遗留登录改造',
              status: 'developing',
              statusLabel: '開發中',
            }],
          }],
        }],
      },
    })
    openPage()

    const hint = await screen.findByRole('button', { name: /歷史迭代仍有 1 個未完成需求/ })
    fireEvent.click(hint)
    await waitFor(() => expect(screen.getByText('遗留登录改造')).toBeInTheDocument())
  })

  it('關閉需求明細：不展示需求篩選器', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: false,
      showOwners: false,
      showUnassigned: false,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    expect(document.querySelector('[data-filter="iter"]')).not.toBeNull()
    expect(document.querySelector('[data-filter="req"]')).toBeNull()
  })

  it('项目区视图切换：默认卡片，切到列表后容器改为单列口径', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    const projects = document.querySelector('.rdm-board-projects') as HTMLElement
    expect(projects.getAttribute('data-view')).toBe('card')
    // 切换器在「項目進度」标题行右侧，不占用下方筛选条
    const viewSwitch = document.querySelector('.rdm-board-section-extra') as HTMLElement
    fireEvent.click(within(viewSwitch).getByText('列表'))
    await waitFor(() => expect(projects.getAttribute('data-view')).toBe('list'))
    // 筛选条仍在，视图与口径互不影响
    expect(document.querySelector('[data-filter="iter"]')).not.toBeNull()
  })

  it('晚報：焦點條切換為當日復盤，KPI 仍為一組四卡', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: '2026-11-19 18:00:00',
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: {
        ...SNAPSHOT,
        reportType: 'evening',
        reportTypeLabel: '晚報',
      },
    })
    openPage()

    await waitFor(() => expect(screen.getByText('今日完成')).toBeInTheDocument())
    expect(screen.getByText('今日上線')).toBeInTheDocument()
    expect(screen.getByText('狀態變更')).toBeInTheDocument()
    expect(screen.getByText('明日到期')).toBeInTheDocument()
    // 模板差异只体现在焦点条：KPI 始终一组四卡，不随档位增删
    expect(document.querySelectorAll('.rdm-board-kpis')).toHaveLength(1)
    expect(document.querySelectorAll('.rdm-board-focus')).toHaveLength(1)
    expect(document.querySelector('.rdm-board-focus')?.getAttribute('data-evening')).toBe('true')
  })

  it('点击需求展开甘特：展示任务、角色、负责人与起止日期', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    openPage()

    const reqButton = await screen.findByRole('button', { name: /登錄改版/ })
    fireEvent.click(reqButton)

    await waitFor(() => expect(screen.getAllByText('登錄頁重構').length).toBeGreaterThan(0))
    expect(screen.getByText('研發成員')).toBeInTheDocument()
    // 负责人按统一口径渲染「姓名（工号）」，不再只显示姓名
    expect(screen.getByText('研發甲（MF001）')).toBeInTheDocument()
    expect(screen.getAllByText('登錄回歸測試').length).toBeGreaterThan(0)
    expect(screen.getByText('測試')).toBeInTheDocument()
    expect(screen.getByText('測試乙（MF002）')).toBeInTheDocument()
    // 复用「我的甘特圖」：需求行 + 任务条、进度徽标、今天线都在
    expect(document.querySelector('.rdm-g2')).not.toBeNull()
    expect(document.querySelector('.rdm-g2-spanbar')).not.toBeNull()
    expect(screen.getByText('60%')).toBeInTheDocument()

    // 左栏默认紧凑（只留姓名 + 角色），可手动切到宽栏；任务可收合/展开（与「我的甘特圖」同一套操作）
    expect(document.querySelector('.rdm-g2-head')?.textContent).not.toContain('開始')
    fireEvent.click(screen.getByRole('button', { name: /收合/ }))
    await waitFor(() => expect(document.querySelectorAll('.rdm-g2-row')).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: /展開$/ }))
    await waitFor(() => expect(document.querySelectorAll('.rdm-g2-row')).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: /展開左欄/ }))
    await waitFor(() => expect(document.querySelector('.rdm-g2-head')?.textContent).toContain('開始'))
    // 宽栏才展示起止日期列，紧凑模式把宽度让给时间轴
    expect(screen.getByText('2026-10-19')).toBeInTheDocument()
  })

  it('展示参数关闭需求明细：不渲染需求行，但项目与指标仍在', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: false,
      showOwners: false,
      showUnassigned: false,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    expect(screen.queryAllByText(/登錄改版/)).toHaveLength(0)
    expect(screen.queryAllByText(/張三/)).toHaveLength(0)
  })

  it('缺少令牌：不请求接口，整页说明从通知重新进入', async () => {
    openPage('/rdm-daily-view')
    await waitFor(() => expect(screen.getByText('缺少查看令牌')).toBeInTheDocument())
    expect(fetchView).not.toHaveBeenCalled()
  })

  it('令牌失效：展示后端返回的原因，而不是空白页', async () => {
    fetchView.mockResolvedValue({
      valid: false,
      message: '連結已過期，請聯繫推送人重新發送',
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
    })
    openPage('/rdm-daily-view?token=expired')
    await waitFor(() => expect(screen.getByText('連結不可用')).toBeInTheDocument())
    expect(screen.getByText('連結已過期，請聯繫推送人重新發送')).toBeInTheDocument()
  })

  it('接口异常：页面自己承接错误并给出重试入口', async () => {
    fetchView.mockRejectedValue(new Error('網絡異常'))
    openPage()
    await waitFor(() => expect(screen.getByText('看板載入失敗')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /重\s*試/ })).toBeInTheDocument()
  })

  it('工具條：可在頁面內切換中英，並持久化選擇', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    // 免登頁必須自帶語言入口：全局默認英文，但看板讀者以中文為主
    expect(screen.getByRole('radiogroup', { name: '切換語言' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /在瀏覽器打開/ })).toBeInTheDocument()

    fireEvent.click(screen.getByText('EN'))
    await waitFor(() => expect(screen.getByText('Project progress')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Open in browser/ })).toBeInTheDocument()
    // 切換後持久化，下一次從釘釘點開不必重新選擇
    expect(localStorage.getItem('app_language')).toBe('en')
  })

  it('非釘釘環境：「在瀏覽器打開」用新窗口打開當前看板連結', async () => {
    fetchView.mockResolvedValue({
      valid: true,
      expireAt: null,
      showRequirements: true,
      showOwners: true,
      showUnassigned: true,
      snapshot: SNAPSHOT,
    })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    openPage()

    await waitFor(() => expect(screen.getAllByText(/門戶改版/).length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: /在瀏覽器打開/ }))
    // 帶 token 的完整地址必須原樣交給瀏覽器，不能重新拼接
    expect(openSpy).toHaveBeenCalledWith(window.location.href, '_blank', 'noopener')
    openSpy.mockRestore()
  })
})
