package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 门店绑定BD关系实体（一家门店可绑定多个BD）
 */
@Data
@TableName("biz_store_bd")
public class BizStoreBd {

    @TableId
    private Long id;

    /** 门店主键 (关联 biz_store.id) */
    private Long storeId;

    /** BD员工工号 (关联 sys_user.emp_id) */
    private String bdEmpId;

    /** BD员工姓名快照 */
    private String bdName;

    /** 绑定人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
