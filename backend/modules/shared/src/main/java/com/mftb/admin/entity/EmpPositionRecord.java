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

    /**
     * 操作类型名称快照（入职/转正/调动/晋升/降职/离职/重新入职）。
     * <p>自 {@code hr:effective-engine:v1.0} 起只用于展示与历史回溯，
     * 任何状态判定都必须走 {@link #operationCode}（方案 §5.3）。
     */
    private String operation;

    /**
     * 异动动作 code（真值见 {@link com.mftb.admin.constant.HrOperationCode}）。
     * <p>OTHER 表示未回填/无法识别的历史值，此时派生逻辑退回名称判定。
     */
    private String operationCode;

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

    // ── 稳定 ID（方案 §7.1「补部门/职位/上级/导师/法人/地点 ID，保留历史名称快照」） ──
    /*
     * 上面一排是「发生时的名称快照」，下面一排是「现在指向哪条主数据」。
     * 两者必须共存：只存名称，部门改名/岗位重建后历史就挂不回去；只存 ID，
     * 那次异动当时写的是什么就丢了。名称用于展示与回溯，ID 用于关联与统计。
     * 全部可空：按名称解析不到唯一主数据时留 NULL（宁缺勿错挂），由雇佣数据差异报告暴露。
     */

    /** 所属雇佣期间(hr_employment_period.id)，由雇佣期间服务反向挂接 */
    private Long employmentPeriodId;

    /** 服务部门ID(sys_department.id)，名称快照留在 service_dept */
    private Long deptId;

    /** 职位ID(sys_position.id)，名称快照留在 position_name */
    private Long positionId;

    /** 雇主法人字典ID(sys_hr_dict EMPLOYER_COMPANY) */
    private Long employerCompanyId;

    /** 工作地点字典ID(sys_hr_dict WORK_LOCATION) */
    private Long workLocationId;

    /** 直属上级员工ID(sys_user.id) */
    private Long managerUserId;

    /** 导师员工ID(sys_user.id) */
    private Long mentorUserId;

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
