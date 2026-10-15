package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 发布部署记录实体
 */
@Data
@TableName("rdm_release_deployment")
public class RdmReleaseDeployment {

    @TableId
    private Long id;

    /** 发布批次ID */
    private Long releaseBatchId;

    /** 系统编码 */
    private String systemCode;

    /** 系统名称 */
    private String systemName;

    /** 构建标识 */
    private String buildId;

    /** 部署顺序 */
    private Integer deployOrder;

    /** 部署状态:pending/deploying/success/failed/rolled_back */
    private String deployStatus;

    /** 部署时间 */
    private LocalDateTime deployTime;

    /** 验证状态:pending/passed/failed */
    private String verifyStatus;

    /** 验证时间 */
    private LocalDateTime verifyTime;

    /** 开放状态:pending/opened/not_opened */
    private String openStatus;

    /** 开放时间 */
    private LocalDateTime openTime;

    /** 回滚原因 */
    private String rollbackReason;

    /** 尝试次数 */
    private Integer attemptNo;

    /** 操作人ID */
    private Long operatorUserId;

    /** 操作人姓名 */
    private String operatorUserName;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
