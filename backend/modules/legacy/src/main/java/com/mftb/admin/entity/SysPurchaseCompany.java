package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 购买公司字典实体
 * 管理耗材/资产业务的「购买公司」（法人主体），支持按公司核算采购与消耗。
 * 与「所属品牌」(sys_company_brand 閃蜂/mFood) 为两个独立维度，不做强绑定。
 */
@Data
@TableName("sys_purchase_company")
public class SysPurchaseCompany {

    @TableId
    private Long id;

    /** 公司稳定编码（如 SFCO/MFCO） */
    private String code;

    /** 公司全称 */
    private String name;

    /** 公司简称 */
    private String shortName;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序号 */
    private Integer sortOrder;

    /** 备注 */
    private String remark;

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
