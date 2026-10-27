package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 供应商实体（EAM 基础数据，采购入库的供货方）
 * <p>
 * 编码由系统按规则自动生成（CGSJ + 6位全局自增，见 sys_biz_seq_rule.eam_supplier_code），
 * 新增/修改接口均不接受前端传码。
 */
@Data
@TableName("biz_eam_supplier")
public class EamSupplier {

    @TableId
    private Long id;

    /** 供应商编码（系统自动生成，格式 CGSJ + 6位自增数字，如 CGSJ000001） */
    private String code;

    /** 供应商名称 */
    private String name;

    /** 联系人 */
    private String contactPerson;

    /** 联系电话 */
    private String contactPhone;

    /** 开户银行 */
    private String bankName;

    /** 银行账号 */
    private String bankAccount;

    /** 备注 */
    private String remark;

    /** 状态: enabled/disabled */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
