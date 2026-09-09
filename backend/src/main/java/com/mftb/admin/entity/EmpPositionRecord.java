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
 * 员工职务记录
 */
@Data
@TableName("emp_position_record")
public class EmpPositionRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联 sys_user.id */
    private Long userId;

    // ── 变动信息 ──

    /** 生效日期 */
    private LocalDate effectiveDate;

    /** 生效序号（0起递增） */
    private Integer effectiveSeq;

    /** 操作类型（入职/调动/晋升/降职/离职/重新入职） */
    private String operation;

    /** 变动原因 */
    private String reason;

    // ── 任职信息 ──

    /** 服务部门 */
    private String serviceDept;

    /** 职级序列(M/T/P) */
    private String sequenceType;

    /** 职级(如P2) */
    private String positionLevel;

    /** 职等(R1-R5) */
    @TableField("`rank_code`")
    private String rankCode;

    /** 任职公司 */
    private String company;

    /** 员工类别 */
    private String employeeCategory;

    /** 工时制 */
    private String workSystem;

    /** 职位 */
    private String positionName;

    /** 直属上级 */
    private String directSuperior;

    /** 导师 */
    private String mentor;

    // ── 工作信息 ──

    /** 工作国家 */
    private String workCountry;

    /** 工作城市 */
    private String workCity;

    /** 办公地址 */
    private String officeAddress;

    /** 合同签订地 */
    private String contractLocation;

    /** 创建人 */
    private String createdBy;

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
