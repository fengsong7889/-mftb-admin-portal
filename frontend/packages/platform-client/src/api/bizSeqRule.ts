/**
 * 業務編號生成規則 API
 *
 * 真值在后端 sys_biz_seq_rule（BizSeqService 发号时按 rule_key 读取），
 * 前端「規則中心 › 編號生成規則」必须以此为准 —— 静态目录只用于补齐后端未管理的
 * 说明型条目与「所属菜单」归类展示，同 key 一律后端覆盖。
 *
 * 失败时不降级到静态样例冒充已生效配置：调用方要显式告警，
 * 否则管理员会看着一个早就被改掉的前缀以为它仍在生效。
 */
import request, { SILENT_HEADER } from './request'

/** 与后端 SysBizSeqRule 实体对齐 */
export interface BizSeqRuleVO {
  id: number
  ruleKey: string
  ruleName: string
  bizMenu?: string | null
  prefix: string
  /** YYYYMMDD / YYYYMM / YYMM / 空串=无日期维度 */
  dateFormat?: string | null
  /** 序号最少位数；BizSeqService 用 %0{seqLength}d 格式化，超过位数自然扩位 */
  seqLength?: number | null
  /**
   * 起始口径：0=表内从 1 计数但编号从 0000 起；1=编号直接用表内值（首号即 0…01）。
   * 示例必须按它算，否则 XQSP 这种「每日从 01 起」的规则会被显示成 00。
   */
  seqStart?: number | null
  status?: number | null
  remark?: string | null
}

/** 查询全部启用中的编号生成规则（按 id 升序，与后端 listActiveRules 同序） */
export async function fetchBizSeqRules(): Promise<BizSeqRuleVO[]> {
  const res = await request.get<unknown, BizSeqRuleVO[]>('/biz-seq-rules', {
    headers: { [SILENT_HEADER]: '1' },
  })
  return res ?? []
}
