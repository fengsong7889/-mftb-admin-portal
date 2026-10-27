package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 资产遗失单实体
 */
@Data
@TableName("biz_eam_loss")
public class EamLoss {

    @TableId
    private Long id;

    /** 遗失编号（系统生成，唯一） */
    private String lossNo;

    /** 来源类型：claim/borrow/return/direct */
    private String sourceType;

    /** 来源 ID（claim_id / borrow_id / return_id / 0=直接报失） */
    private Long sourceId;

    /** 关联归还记录 ID（来源为归还时有值） */
    private Long returnId;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 资产分类（快照） */
    private String assetType;

    /** 品牌（快照） */
    private String brand;

    /** 遗失时资产状态快照（idle/in_use） */
    private String assetStatusAtLoss;

    /** 原持有人 ID（快照） */
    private Long originalHolderId;

    /** 原持有人姓名（快照） */
    private String originalHolderName;

    /** 原归属部门（快照） */
    private String originalDepartment;

    /** 最后已知位置 */
    private String lastKnownLocation;

    /** 遗失日期 */
    private LocalDate lossDate;

    /** 报失原因 */
    private String lossReason;

    /** 报失登记人 ID */
    private Long reporterId;

    /** 报失登记人姓名 */
    private String reporterName;

    /** 状态：searching/found_pending/recovered/written_off */
    private String status;

    /** 找回日期 */
    private LocalDate recoveredDate;

    /** 找回地点 */
    private String recoveredLocation;

    /** 找回登记人 ID */
    private Long recoveredById;

    /** 找回登记人姓名 */
    private String recoveredByName;

    /** 找回说明 */
    private String recoveredNote;

    /** 验收结果：normal/damaged/scrapped */
    private String inspectionResult;

    /** 验收日期 */
    private LocalDate inspectionDate;

    /** 验收说明 */
    private String inspectionNote;

    /** 核销日期 */
    private LocalDate writeOffDate;

    /** 核销原因 */
    private String writeOffReason;

    /** 核销凭证 ID */
    private Long writeOffEvidenceId;

    /** 关联赔付记录 ID */
    private Long compensationId;

    /** 关联维修记录 ID */
    private Long repairId;

    /** 关联报废记录 ID */
    private Long scrapId;

    /** 乐观锁版本号 */
    @Version
    private Long version;

    /** 幂等请求键 */
    private String requestKey;

    /** 是否历史回填：0=否 1=是 */
    private Integer fromMigration;

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
