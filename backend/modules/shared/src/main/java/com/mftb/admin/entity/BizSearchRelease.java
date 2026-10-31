package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 搜索配置发布版本实体（方案 §6.4/§11.1「发布版本」）。
 * <p>不可变快照 + 审核 + 回退。回退只切配置版本，绝不回滚已发生的交易/财务账本。
 */
@Data
@TableName("biz_search_release")
public class BizSearchRelease {

    @TableId
    private Long id;

    private String versionNo;

    /** 版本名称（人类可读标识，方案 §11.1 定版的权威业务字段；服务层强制必填且 ≤60 字） */
    private String releaseName;

    private String changeSummary;

    /** 发布快照(JSON) */
    private String snapshot;

    private String checksum;

    /** 0草稿 1待审 2批准 3待生效 4生效 5替代 6回滚 */
    private Integer status;

    /** 兼容回退版本 */
    private String rollbackVersion;

    private String approver;

    private LocalDateTime approveTime;

    private LocalDateTime publishedAt;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
