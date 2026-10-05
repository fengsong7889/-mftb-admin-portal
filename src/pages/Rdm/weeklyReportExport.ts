/**
 * 周报导出（前端生成 Excel，多 Sheet）
 *
 * 为什么不后端生成：周报口径与看板完全同源（一次查询即可），前端导出省一个接口，
 * 且项目经理拿到的就是页面上确认过的数字 —— 避免「导出与页面不一致」的扯皮。
 */
import ExcelJS from 'exceljs'
import type { RdmWeeklyReport } from '../../api/rdm'

/** 百分比文本 */
const pct = (v: number) => `${Math.round(v * 100)}%`

/** 写一个「键值摘要」区块 */
function appendSummary(ws: ExcelJS.Worksheet, title: string, rows: [string, string | number][]) {
  ws.addRow([title])
  ws.lastRow!.font = { bold: true, size: 12 }
  rows.forEach(([label, value]) => ws.addRow([label, value]))
  ws.addRow([])
}

/** 写一个「表格区块」 */
function appendTable(ws: ExcelJS.Worksheet, title: string, headers: string[], data: (string | number)[][]) {
  ws.addRow([title])
  ws.lastRow!.font = { bold: true, size: 12 }
  ws.addRow(headers)
  ws.lastRow!.font = { bold: true }
  data.forEach(row => ws.addRow(row))
  ws.addRow([])
}

/**
 * 生成周报工作簿并触发下载
 *
 * @param report 页面正在展示的周报数据（保证导出与所见一致）
 */
export async function exportWeeklyReport(report: RdmWeeklyReport): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '產研協同(RDM)'
  wb.created = new Date()

  const overview = wb.addWorksheet('週報摘要')
  overview.columns = [
    { header: '指標', key: 'label', width: 26 },
    { header: '數值', key: 'value', width: 18 },
    { header: '說明', key: 'memo', width: 44 },
  ]
  const s = report.summary
  overview.addRow(['週報區間', `${report.range.startDate} ~ ${report.range.endDate}`, '按需求提交/上線時間統計'])
  overview.addRow([])
  appendSummary(overview, '一、本週結果', [
    ['新提交需求', s.submitted],
    ['產品受理', s.accepted],
    ['已排期', s.scheduled],
    ['已上線', s.released],
    ['驗收通過', `${s.acceptancePass}（一次通過率 ${pct(s.firstPassRate)}）`],
  ])
  appendSummary(overview, '二、交付效率', [
    ['平均交付天數', s.avgDeliveryDays],
    ['按時上線率', pct(s.onTimeRate)],
  ])
  appendSummary(overview, '三、風險與質量', [
    ['逾期需求', s.overdue],
    ['阻塞需求', s.blocked],
    ['需求變更', s.changes],
    ['驗收返工', s.rework],
  ])

  const dept = wb.addWorksheet('部門產出')
  dept.columns = [
    { header: '部門', key: 'deptName', width: 22 },
    { header: '本週提交', key: 'submitted', width: 12 },
    { header: '已交付', key: 'delivered', width: 12 },
    { header: '逾期', key: 'overdue', width: 10 },
    { header: '平均交付天數', key: 'avgDays', width: 16 },
  ]
  report.byDept.forEach(r => dept.addRow([r.deptName, r.submitted, r.delivered, r.overdue, r.avgDays]))

  const pm = wb.addWorksheet('產品經理負載')
  pm.columns = [
    { header: '產品經理', key: 'pmName', width: 18 },
    { header: '在途需求', key: 'active', width: 12 },
    { header: '已交付', key: 'delivered', width: 12 },
    { header: '逾期', key: 'overdue', width: 10 },
  ]
  report.byPm.forEach(r => pm.addRow([r.pmName, r.active, r.delivered, r.overdue]))

  appendTable(
    wb.addWorksheet('上線清單'),
    '本期上線需求',
    ['需求編號', '標題', '關聯版本', '產品經理', '上線日期', '滿意度'],
    report.released.map(r => [r.reqNo, r.title, r.versionNo ?? '-', r.pmName ?? '-', r.actualReleaseDate ?? '-', r.acceptanceScore ?? '-']),
  )

  appendTable(
    wb.addWorksheet('風險清單'),
    '需關注的風險需求',
    ['需求編號', '標題', '狀態', '當前處理人', '停留天數', '風險類型'],
    report.risks.map(r => [r.reqNo, r.title, r.status, r.handler ?? '-', r.days, r.riskType]),
  )

  appendTable(
    wb.addWorksheet('下週計劃'),
    '下週預計上線',
    ['需求編號', '標題', '計劃上線日期', '當前狀態'],
    report.nextWeek.map(r => [r.reqNo, r.title, r.planReleaseDate ?? '-', r.status]),
  )

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `RDM週報_${report.range.startDate}_${report.range.endDate}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
