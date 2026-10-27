package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 系統權限申請單（企業門戶「我要申請」→ OA 审批 → 绑定授权角色）。
 * <p>
 * 与 {@link OaRequest} 的关系：OA 流程实例承载「审批流转事实」（节点/审批人/状态），
 * 本表承载「申请业务事实 + 授权兑现结果」。两者用 {@code flow_no} 一对一绑定，
 * 状态由 OA 回调同步，不允许前端直接改。
 * <p>
 * 申请事实只记「业务诉求」（场景 + 期限 + 说明），<b>不记菜单清单</b>：
 * 菜单级申请会把目标系统的功能全貌暴露给零权限用户，且诱导全选（过度授权），
 * 已改为陈述诉求 + 可选参考角色（见 {@code SystemAccessConstants} 类注释）。
 * {@code requestedMenus} 是 2026-10 前的历史列，只为旧单回看保留，新单不再写入。
 * <p>
 * 凭证存 MEDIUMTEXT 列而不是塞进 {@code biz_oa_request.form_data}：
 * 后者是 TEXT(64KB)，base64 凭证会撑爆列宽（AI 使用申请已有此隐患），故这里单独落列。
 */
@Data
@TableName("biz_system_access_request")
public class SystemAccessRequest {

    @TableId
    private Long id;

    /** OA 流程编号（XTSQ + YYYYMMDD + 2 位日流水），唯一 */
    private String flowNo;

    /** 申请的业务系统编码 sys_system.code */
    private String systemCode;

    /** 系统名称快照（申请时刻的 DB 值，不随后续改名漂移） */
    private String systemName;

    /** 申请人 sys_user.id（服务端取登录态，绝不接受前端传入） */
    private Long userId;

    /** 申请人姓名快照 */
    private String applicantName;

    /** 申请人工号快照 */
    private String applicantEmpId;

    /** 申请人部门名称快照 */
    private String deptName;

    /**
     * 【历史列】申请的菜单功能 JSON：[{"menuKey":"asset-list","name":"資產台账"}]。
     * <p>2026-10 改口径后新单不再写入（留 NULL），仅为旧单回看保留；不得据此重建申请事实。
     */
    private String requestedMenus;

    /** 使用场景 code，逗号分隔（白名单见 SystemAccessConstants.ALLOWED_SCENARIOS） */
    private String scenarios;

    /** 使用期限类型：permanent=长期 / until=至指定日期 */
    private String durationType;

    /** 期限截止日（durationType=until 时必填）。
     * <p>到期当天仍可用，次日起由 SystemAccessExpiryJob 自动回收本单绑上的角色；permanent 永不回收。 */
    private LocalDate durationUntil;

    /** 申请人建议的参考角色 sys_role.id（只能取自开放自助申请的目录；纯建议值，不参与授权写入） */
    private Long preferredRoleId;

    /** 参考角色名称快照（申请时刻的 DB 值） */
    private String preferredRoleName;

    /** 使用诉求说明（必填） */
    private String reason;

    /** 相关凭证 JSON：[{"name":"a.png","type":"image","size":1234,"dataUrl":"data:image/png;base64,..."}] */
    private String attachments;

    /** 单据状态：pending/approved/rejected/cancelled（与 OA flow_status 同源，由回调写入） */
    private String status;

    /** 授权对象类型：role（部门授权无落点，暂不支持） */
    private String grantTargetType;

    /** 授权角色 sys_role.id（审批人在流程上指定） */
    private Long grantTargetId;

    /** 授权角色名称快照 */
    private String grantTargetName;

    /** 授权兑现状态：none/granted；granted 是幂等闸门，重复回调直接跳过 */
    private String grantStatus;

    /** 授权兑现时间 */
    private LocalDateTime grantedAt;

    /** 兑现时的审批人签名（姓名(工号)） */
    private String grantedBy;

    /**
     * 本次兑现是否真的新绑了角色：1=由本单绑上，0=申请人此前已持有（绑它是空操作）。
     * <p>它是到期回收的<b>唯一资格凭据</b>：只收回本单带来的权限，
     * 管理员从其他地方给同一账号绑的同角色绝不因为本单到期而被抽走。
     * <p>迁移前存量单据固定为 0（fail-safe）：不因一次发布就静默收回已有权限。
     */
    private Integer grantNewlyBound;

    /** 到期回收状态：none=未回收 / revoked=已回收 / kept=仍被其他有效授权覆盖，不回收 */
    private String revokeStatus;

    /** 回收时间 */
    private LocalDateTime revokedAt;

    /** 回收执行者（定时任务写 system-expiry；与真人签名区分） */
    private String revokedBy;

    /** 驳回理由 */
    private String rejectReason;

    /** 申请时间 */
    private LocalDateTime applyTime;

    /** 审结时间（通过/驳回/撤销） */
    private LocalDateTime completeTime;

    private String createdBy;

    private String updatedBy;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
