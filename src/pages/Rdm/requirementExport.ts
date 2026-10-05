/**
 * 需求台账导出（前端生成 Excel）
 *
 * 与周报导出同一口径：导出就是页面上看到的这一份数据，不再单独开一个后端接口，
 * 避免出现「筛选条件传漏导致导出与页面不一致」的两套数字。
 * 因此调用方必须把**当前已筛选、已分页加载的行**传进来，而不是让它自己去取数。
 */
import ExcelJS from 'exceljs'
import type { RdmRequirementRow } from '../../api/rdm'
import {
  RDM_PRIORITY_LABEL,
  RDM_REQ_TYPE_LABEL,
  RDM_STAGE_LABEL,
  RDM_STATUS_LABEL,
  type RdmPriority,
  type RdmReqType,
  type RdmStage,
  type RdmStatus,
} from '../../constants/rdm'

/** 取标签：查不到映射时回显原值，绝不静默留空（留空会让使用者以为没有该字段） */
function label<T extends string>(map: Record<string, string>, value?: T | null): string {
  if (value === undefined || value === null || value === '') return ''
  return map[value] ?? value
}

/** 是/否：空值统一按「否」，避免导出里出现 1/0 让业务方猜 */
function yesNo(value?: boolean | number | null): string {
  return value ? '是' : '否'
}

/** 停留小时转天数（列表 VO 只有 stayHours，导出给人看的应该是天） */
function stayDays(stayHours?: number | null): number | '' {
  if (stayHours === undefined || stayHours === null) return ''
  return Math.round(stayHours / 24 * 10) / 10
}

/**
 * 导出需求台账。
 *
 * @param rows 当前列表数据（已按页面筛选条件过滤）
 * @param scopeLabel 范围说明，写进文件名与表头，便于区分「交付中台账」与全量台账
 */
export async function exportRequirementRows(rows: RdmRequirementRow[], scopeLabel: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '產研協同'
  const ws = wb.addWorksheet('需求台賬')

  ws.columns = [
    { header: '需求編號', key: 'reqNo', width: 18 },
    { header: '標題', key: 'title', width: 42 },
    { header: '類型', key: 'reqType', width: 12 },
    { header: '優先級', key: 'priority', width: 10 },
    { header: '狀態', key: 'status', width: 14 },
    { header: '所屬階段', key: 'stage', width: 12 },
    { header: '提出人', key: 'submitterName', width: 12 },
    { header: '提出人部門', key: 'submitDeptName', width: 16 },
    { header: '產品經理', key: 'pmName', width: 12 },
    { header: '研發負責人', key: 'devOwnerName', width: 12 },
    { header: '當前處理人', key: 'currentHandler', width: 12 },
    { header: '提交時間', key: 'submitTime', width: 18 },
    { header: '期望完成', key: 'expectDate', width: 12 },
    { header: 'PRD 承諾', key: 'promisedPrdDate', width: 12 },
    { header: '計劃上線', key: 'planReleaseDate', width: 12 },
    { header: '實際上線', key: 'actualReleaseDate', width: 12 },
    { header: '上線版本', key: 'versionNo', width: 12 },
    { header: '逾期', key: 'overdue', width: 8 },
    { header: '阻塞', key: 'blocked', width: 8 },
    { header: '當前狀態停留(天)', key: 'stayDays', width: 16 },
    { header: '狀態最後更新', key: 'updatedAt', width: 18 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).eachCell(cell => {
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7E6' } }
  })

  rows.forEach(r => {
    ws.addRow({
      reqNo: r.reqNo,
      title: r.title,
      reqType: label(RDM_REQ_TYPE_LABEL, r.reqType as RdmReqType),
      priority: label(RDM_PRIORITY_LABEL, r.priority as RdmPriority),
      status: label(RDM_STATUS_LABEL, r.status as RdmStatus),
      stage: label(RDM_STAGE_LABEL, r.stage as RdmStage),
      submitterName: r.submitterName ?? '',
      submitDeptName: r.submitDeptName ?? '',
      pmName: r.pmName ?? '',
      devOwnerName: r.devOwnerName ?? '',
      currentHandler: r.currentHandler ?? '',
      submitTime: r.submitTime ?? '',
      expectDate: r.expectDate ?? '',
      promisedPrdDate: r.promisedPrdDate ?? '',
      planReleaseDate: r.planReleaseDate ?? '',
      actualReleaseDate: r.actualReleaseDate ?? '',
      versionNo: r.versionNo ?? '',
      overdue: yesNo(r.overdueFlag),
      blocked: yesNo(r.blockedFlag),
      stayDays: stayDays(r.stayHours),
      updatedAt: r.updatedAt ?? '',
    })
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `RDM需求台賬_${scopeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
