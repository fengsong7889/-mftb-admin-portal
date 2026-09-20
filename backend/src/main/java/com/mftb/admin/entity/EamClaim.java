package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产领用登记实体
 */
@Data
@TableName("biz_eam_claim")
public class EamClaim {

    @TableId
    private Long id;

    /** 领用编号（系统生成，唯一） */
    private String claimNo;

    /** 资产 ID */
    private Long assetId;

    /** 调拨承接来源，不覆盖原领用人的签署记录。 */
    private Long sourceTransferId;
    private Long previousClaimId;

    /** 领用人 ID（sys_user.id） */
    private Long employeeId;

    /** 操作人 ID（代办时与 employeeId 不同） */
    private Long operatorId;

    /** 操作人姓名快照 */
    private String operatorName;

    /** 状态：pending_signature / claimed / returned / cancelled */
    private String status;

    /** 签署状态：pending / signed / proxy_pending / not_required */
    private String signatureStatus;

    /** 领用日期 */
    private LocalDate claimDate;

    /** 领用用途/原因 */
    private String claimReason;

    /** 备注 */
    private String remark;

    /** 是否代办：0=本人 1=管理员代办 */
    private Integer proxyMode;

    /** 代办原因 */
    private String proxyReason;

    /** 实际签署时间 */
    private LocalDateTime signedAt;

    /** 签名凭证 ID */
    private Long signatureEvidenceId;

    /** 归还日期 */
    private LocalDate returnDate;

    /** 归还原因 */
    private String returnReason;

    /** 关联归还记录 ID */
    private Long returnId;

    /** 取消原因 */
    private String cancelledReason;

    /** 领用内容 SHA-256 摘要 */
    private String contentHash;

    /** 领用配件快照 JSON（领用时从资产复制，支持删减） */
    private String accessories;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
