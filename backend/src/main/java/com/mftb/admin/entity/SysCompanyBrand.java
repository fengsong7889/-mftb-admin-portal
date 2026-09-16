package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 公司品牌配置实体
 * 管理公司品牌（闪蜂/mFood 等）的编码、标签等信息
 * 前端从 API 动态加载，不再硬编码
 */
@Data
@TableName("sys_company_brand")
public class SysCompanyBrand {

    @TableId
    private Long id;

    /** 品牌编码（用于资产编号前缀，如 TB/MF） */
    private String code;

    /** 品牌中文名称 */
    private String labelZh;

    /** 品牌英文名称 */
    private String labelEn;

    /** 排序号 */
    private Integer sortOrder;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
