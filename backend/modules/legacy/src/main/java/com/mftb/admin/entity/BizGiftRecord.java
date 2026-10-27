package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 赠送记录实体
 */
@Data
@TableName("biz_gift_record")
public class BizGiftRecord {

    @TableId
    private Long id;

    /** 赠送ID（业务生成） */
    private String giftId;

    /** 集团ID */
    private Long groupId;

    /** 集团名称快照 */
    private String groupName;

    /** 门店ID */
    private Long storeId;

    /** 门店名称快照 */
    private String storeName;

    /** 品牌 */
    private String brand;

    /** 广告类型 */
    private String adType;

    /** 赠送总天数 */
    private Integer totalDays;

    /** 有效天数 */
    private Integer validDays;

    /** 已使用天数 */
    private Integer usedDays;

    /** 剩余天数 */
    private Integer remainingDays;

    /** 赠送日期 */
    private LocalDate giftDate;

    /** 到期日期 */
    private LocalDate expireDate;

    /** 状态: 1=可用 2=已用完 3=已过期 */
    private Integer status;

    /** 赠送原因 */
    private String reason;

    /** 凭证URL JSON数组 */
    private String credentials;

    /** 审批流程编号 */
    private String approvalNo;

    /** 申请人 */
    private String applicant;

    /** 申请时间 */
    private LocalDateTime applyTime;

    /** 审批状态: 1=未审批 2=已审批 3=驳回 */
    private Integer approvalStatus;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
