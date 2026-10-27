package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 消耗统计报表顶部汇总指标 */
@Data
public class EamConsumableReportSummaryVO {
    /** 采购入库金额 */
    private BigDecimal purchaseAmount = BigDecimal.ZERO;
    /** 采购入库数量 */
    private Integer purchaseQty = 0;
    /** 手工/期初入库金额 */
    private BigDecimal manualInboundAmount = BigDecimal.ZERO;
    /** 入库总金额（采购+手工+期初+调整盈+退料） */
    private BigDecimal inboundTotalAmount = BigDecimal.ZERO;
    /** 领用消耗金额（出库领用的绝对值） */
    private BigDecimal consumeAmount = BigDecimal.ZERO;
    /** 领用消耗数量 */
    private Integer consumeQty = 0;
    /** 退料回库金额 */
    private BigDecimal returnAmount = BigDecimal.ZERO;
    /** 盘亏调整金额 */
    private BigDecimal adjustOutAmount = BigDecimal.ZERO;
    /** 当前库存总金额（不受时间过滤影响，实时值） */
    private BigDecimal stockAmount = BigDecimal.ZERO;
    /** 当前库存总数量 */
    private Integer stockQty = 0;
    /** 部门数（有消耗的） */
    private Integer deptCount = 0;
    /** 员工数（有消耗的） */
    private Integer applicantCount = 0;
}
