package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产归还记录实体
 */
@Data
@TableName("biz_eam_return")
public class EamReturn {

    @TableId
    private Long id;

    /** 归还编号（系统生成，唯一） */
    private String returnNo;

    /** 关联领用 ID */
    private Long claimId;

    /** 资产 ID */
    private Long assetId;

    /** 归还人 ID */
    private Long employeeId;

    /** 操作人姓名 */
    private String operatorName;

    /** 归还日期 */
    private LocalDate returnDate;

    /** 归还原因 */
    private String returnReason;

    /** 归还时资产状况说明 */
    private String conditionNote;

    /** 归还凭证 ID */
    private Long returnEvidenceId;

    /** 归还状态：completed/exception_pending/exception_closed */
    private String returnStatus;

    /** 归还时资产状况：normal/damaged/lost */
    private String assetCondition;

    /** 异常原因说明 */
    private String exceptionReason;

    /** 实物处置结果：idle/scrapped/written_off */
    private String disposition;

    /** 处置日期 */
    private LocalDate dispositionDate;

    /** 处置凭证 ID */
    private Long dispositionEvidenceId;

    /** 是否已找回：0=否 1=是 */
    private Integer recovered;

    /** 找回日期 */
    private LocalDate recoveredDate;

    /** 找回说明 */
    private String recoveredNote;

    /** 实际归还人 ID（代还场景） */
    private Long actualReturneeId;

    /** 实际归还人姓名 */
    private String actualReturneeName;

    /** 来源类型：claim/borrow */
    private String sourceType;

    /** 来源 ID（claim_id 或 borrow_id） */
    private Long sourceId;

    /** 关联赔付记录 ID */
    private Long compensationId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
