package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 人事通用字典
 * <p>
 * 单表多类型：dict_type 区分雇主法人（{@link #TYPE_EMPLOYER_COMPANY}）、
 * 工作地点（{@link #TYPE_WORK_LOCATION}，parent_code 关联国家 code）、
 * 人员类别（{@link #TYPE_EMPLOYEE_CATEGORY}）等。
 * <p>
 * 与购买公司字典 {@code sys_purchase_company} 保持独立：法人身份 ≠ 采购主体，
 * 也不与所属品牌（sys_company_brand）、商家集团混用，避免语义污染。
 */
@Data
@TableName("sys_hr_dict")
public class SysHrDict {

    /** 雇主法人（劳动合同/任职公司） */
    public static final String TYPE_EMPLOYER_COMPANY = "EMPLOYER_COMPANY";
    /** 工作地点（国家为顶级，parent_code=null；城市/区 parent_code 指向国家 code） */
    public static final String TYPE_WORK_LOCATION = "WORK_LOCATION";
    /** 人员类别（正式员工 / 实习生 / 劳务派遣 / 外包 等） */
    public static final String TYPE_EMPLOYEE_CATEGORY = "EMPLOYEE_CATEGORY";

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 字典类型 */
    private String dictType;

    /** 稳定编码（同一 dictType 内唯一；用作跨表引用键） */
    private String code;

    /** 中文名称 */
    private String name;

    /** 英文名称（可空） */
    private String nameEn;

    /** 上级 code（WORK_LOCATION 用于关联国家 code；其它类型可空） */
    private String parentCode;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序号（升序） */
    private Integer sortOrder;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
