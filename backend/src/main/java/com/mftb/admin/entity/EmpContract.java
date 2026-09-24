package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工劳动合同/协议台账 (P1-B)
 * <p>
 * 一份员工可能先后有多份合同 (首次签订 / 续签 / 变更 / 兼有竞业协议等),
 * 本表按 user_id 记录每一段合同的编号、类型、期限与签约主体。
 * <p>
 * 生命周期由 HR 手工维护; 后续 P1-E 会把签订/续签/变更/解除登记为 OA 流程类型, 由流程驱动生效.
 */
@Data
@TableName("emp_contract")
public class EmpContract {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 sys_user.id */
    private Long userId;

    /** 合同编号 */
    private String contractNo;

    /** 合同类型 (劳动合同/劳务合同/实习协议/竞业协议 等) */
    private String contractType;

    /** 签约主体名称 (存 HR 字典 EMPLOYER_COMPANY 的 name; 与职务记录 company 字段口径一致) */
    private String company;

    /** 合同开始日期 */
    private LocalDate startDate;

    /** 合同结束日期 */
    private LocalDate endDate;

    /** 签订日期 */
    private LocalDate signDate;

    /** 状态 (生效中 / 已终止 / 已过期) */
    private String status;

    /** 备注 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
