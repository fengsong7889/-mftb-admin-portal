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
 * 证明开具申请单（员工自助发起，OA 审批通过后由人事线下出具）。
 * <p>
 * 状态机与请假/入转调离同口径：draft → pending → (rejected | cancelled) / approved → completed。
 * 参考 SQL: backend/sql/198_hr_certificate.sql
 */
@Data
@TableName("hr_certificate_request")
public class HrCertificateRequest {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 申请单编号（ZM+YYYYMMDD+4位序号） */
    private String reqNo;

    /** 申请人 sys_user.id */
    private Long userId;

    /** 申请人姓名快照 */
    private String empName;

    /** 申请人工号快照 */
    private String empNo;

    /** 部门名称快照 */
    private String deptName;

    /** 证明类型（HR 字典 CERT_TYPE 的 code） */
    private String certType;

    /** 用途（如签证、贷款、资格审查） */
    private String purpose;

    /** 证明抬头（致XX单位），留空表示「不详证明抬头」 */
    private String recipient;

    /** 证明语种：ZH/EN/BOTH */
    private String language;

    /** 需要份数 */
    private Integer copies;

    /** 期望取得日期 */
    private LocalDate expectDate;

    /** 补充说明（申请人填写） */
    private String remark;

    /** 状态：draft/pending/approved/rejected/cancelled/completed */
    private String status;

    /** 关联 OA 流程编号 */
    private String flowNo;

    /** 办理结果（审批通过后由回调写入领取指引） */
    private String resultRemark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
