/**
 * 項目總覽全量報告導出（前端生成 Excel，多 Sheet）
 *
 * 口徑：消費 `export-bundle`（一次拿全量 projects/items/todos/cards/reconciliation），
 * 導出的是**範圍內全部行**（後端已按當前 filters 圈定 scope），不是當前頁/已加載行 —— 
 * 所以分頁、翻頁都不影響導出完整性；filters 由調用方帶進 export-bundle 請求，導出與頁面同一組條件。
 *
 * 為什麼前端生成：與頁面同源（同一個 bundle），經理拿到的就是頁面確認過的數字，
 * 避免「導出與頁面不一致」的扯皮；同時把 reconciliation 一併落一個 Sheet，留下對賬證據。
 */
import ExcelJS from 'exceljs'
import type { RdmExportBundle } from '@/api/rdm'

/** 布爾 → 繁中是/否 */
const yn = (v: boolean | null | undefined) => (v ? '是' : '否')

/** 寫一個「鍵值摘要」區塊 */
function appendSummary(ws: ExcelJS.Worksheet, title: string, rows: [string, string | number][]) {
  ws.addRow([title])
  ws.lastRow!.font = { bold: true, size: 12 }
  rows.forEach(([label, value]) => ws.addRow([label, value]))
  ws.addRow([])
}

/**
 * 生成項目全量報告工作簿並觸發下載。
 *
 * @param bundle export-bundle 全量數據包（projects/items/todos/cards/reconciliation）
 * @param filterLabel 當前 filters 的可讀描述（落進摘要，證明導出與頁面同一組條件）
 */
export async function exportProjectBundle(bundle: RdmExportBundle, filterLabel: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '產研交付(RDM)'
  wb.created = new Date()

  const c = bundle.cards
  const overview = wb.addWorksheet('總覽摘要')
  overview.columns = [
    { header: '指標', key: 'label', width: 26 },
    { header: '數值', key: 'value', width: 20 },
    { header: '說明', key: 'memo', width: 48 },
  ]
  overview.addRow(['導出範圍', filterLabel, '與頁面同一組 filters；全量非當前頁'])
  overview.addRow(['數據口徑時間', bundle.computedAt ?? '-', '後端聚合計算時刻'])
  overview.addRow([])
  appendSummary(overview, '一、項目口徑', [
    ['項目總數', c.totalProjects],
    ['進行中項目', c.inProgressCount],
    ['需關注項目', c.attentionCount],
    ['全部交付完成', c.allDeliveredProjects],
    ['已關閉項目', c.closedProjects],
    ['已暫停項目', c.pausedProjects],
    ['待裁決事項', c.pendingDecisionCount],
    ['延期殘留', c.deferResidualCount],
  ])
  appendSummary(overview, '二、交付項口徑', [
    ['交付項總數', c.totalDeliveryItems],
    ['已交付', c.deliveredItems],
    ['阻塞', c.blockedCount],
    ['測試通過', c.testPassedItemCount],
    ['產品驗收通過', c.productAcceptedItemCount],
    ['業務驗收通過', c.bizAcceptedItemCount],
    ['未決問題', c.issueOpen],
    ['嚴重問題', c.issueCritical],
  ])
  appendSummary(overview, '三、待辦口徑（已去重）', [
    ['待辦總數(去重)', c.todoTotal],
    ['我負責', c.todoMineCount],
    ['等待他人', c.todoWaitingOthersCount],
    ['未指派', c.todoUnassignedCount],
  ])

  // ── 對賬 Sheet：留證據（路徑A 逐行相加 vs 路徑B 直接查庫） ──
  const rec = bundle.reconciliation
  const recWs = wb.addWorksheet('對賬')
  recWs.columns = [
    { header: '項', key: 'k', width: 28 },
    { header: '值', key: 'v', width: 20 },
  ]
  recWs.addRow(['對賬是否一致', rec.consistent ? '一致' : '不一致'])
  recWs.lastRow!.font = { bold: true, color: { argb: rec.consistent ? 'FF389E0D' : 'FFCF1322' } }
  recWs.addRow(['不一致條目', rec.mismatches.length ? rec.mismatches.join('；') : '無'])
  recWs.addRow([])
  appendSummary(recWs, '逐行相加 vs 直接查庫', [
    ['項目數(卡片/行數)', `${rec.projectCount} / ${rec.projectRowCount}`],
    ['交付項數(卡片/行數)', `${rec.deliveryItemCount} / ${rec.deliveryItemRowCount}`],
    ['待裁決(相加/直查)', `${rec.pendingDecisionSum} / ${rec.pendingDecisionDirect}`],
    ['延期殘留(相加/直查)', `${rec.deferResidualSum} / ${rec.deferResidualDirect}`],
    ['待辦總數(去重/行數)', `${rec.todoTotal} / ${rec.todoRowCount}`],
    ['待辦分桶相加', rec.todoBucketSum],
    ['待辦原始命中(未去重)', rec.todoRawReasonHits],
    ['已關閉項目數', rec.closedProjectCount],
    ['全部交付項目數', rec.allDeliveredProjectCount],
  ])

  // ── 項目明細（全量） ──
  const projWs = wb.addWorksheet('項目明細')
  projWs.columns = [
    { header: '項目編號', key: 'no', width: 16 },
    { header: '項目名稱', key: 'name', width: 30 },
    { header: '目標', key: 'obj', width: 36 },
    { header: '狀態', key: 'status', width: 12 },
    { header: '負責人', key: 'pm', width: 12 },
    { header: '產品負責人', key: 'po', width: 12 },
    { header: '計劃開始', key: 'start', width: 12 },
    { header: '計劃結束', key: 'end', width: 12 },
    { header: '交付項(完成/總)', key: 'deliv', width: 16 },
    { header: '阻塞', key: 'blocked', width: 8 },
    { header: '待裁決', key: 'pending', width: 8 },
    { header: '已暫停', key: 'paused', width: 8 },
    { header: '風險', key: 'risk', width: 8 },
    { header: '全部交付', key: 'allDelivered', width: 10 },
    { header: '已關閉', key: 'closed', width: 8 },
    { header: '下次交付', key: 'next', width: 12 },
  ]
  bundle.projects.forEach(p => projWs.addRow([
    p.projectNo, p.projectName, p.objective ?? '-', p.status,
    p.pmUserName ?? '-', p.productOwnerUserName ?? '-',
    p.planStartDate ?? '-', p.planEndDate ?? '-',
    `${p.deliveryItemCompleted}/${p.deliveryItemTotal}`,
    p.deliveryItemBlocked, p.pendingDecisionCount,
    yn(!!p.pausedFlag), yn(!!p.riskFlag), yn(p.allDelivered), yn(p.closed),
    p.nextDeliveryDate ?? '-',
  ]))

  // ── 交付項明細（全量） ──
  const itemWs = wb.addWorksheet('交付項明細')
  itemWs.columns = [
    { header: '交付項編號', key: 'no', width: 16 },
    { header: '標題', key: 'title', width: 32 },
    { header: '所屬項目ID', key: 'pid', width: 12 },
    { header: '狀態', key: 'status', width: 12 },
    { header: '協調人', key: 'coord', width: 12 },
    { header: '測試通過', key: 'test', width: 10 },
    { header: '產品驗收', key: 'prod', width: 10 },
    { header: '業務驗收', key: 'biz', width: 10 },
    { header: '阻塞', key: 'blocked', width: 8 },
    { header: '逾期', key: 'overdue', width: 8 },
    { header: '未決問題', key: 'issue', width: 10 },
    { header: '已交付', key: 'delivered', width: 10 },
    { header: '待辦原因', key: 'reasons', width: 28 },
  ]
  bundle.items.forEach(it => itemWs.addRow([
    it.itemNo, it.title, it.projectId ?? '-', it.status,
    it.coordinatorUserName ?? '-',
    yn(it.testPassed), yn(it.productAccepted), yn(it.bizAccepted),
    yn(it.blocked), yn(it.overdue), it.openIssueCount, yn(it.delivered),
    it.todoReasons.join('；') || '-',
  ]))

  // ── 待辦明細（全量，已去重） ──
  const todoWs = wb.addWorksheet('待辦明細')
  todoWs.columns = [
    { header: '對象類型', key: 'obj', width: 14 },
    { header: '關聯編號', key: 'refNo', width: 16 },
    { header: '標題', key: 'title', width: 32 },
    { header: '分桶', key: 'bucket', width: 14 },
    { header: '責任人', key: 'resp', width: 12 },
    { header: '原因', key: 'reasons', width: 28 },
    { header: '到期日', key: 'due', width: 12 },
    { header: '逾期', key: 'overdue', width: 8 },
    { header: '逾期工作日', key: 'odDays', width: 12 },
  ]
  bundle.todos.forEach(t => todoWs.addRow([
    t.objectType, t.refNo, t.title, t.bucket,
    t.responsibleName ?? '-', t.reasons.join('；') || '-',
    t.dueDate ?? '-', yn(t.overdue), t.overdueWorkingDays ?? '-',
  ]))

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const day = new Date().toISOString().slice(0, 10)
  link.download = `RDM項目全量報告_${day}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
