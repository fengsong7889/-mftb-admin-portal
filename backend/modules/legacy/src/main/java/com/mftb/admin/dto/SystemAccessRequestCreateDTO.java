package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 系統權限申請提交请求体。
 * <p>
 * 安全口径：<b>不接受申请人身份字段</b>（userId/empId/部门等一律由服务端从登录态解析），
 * 也不接受授权角色字段——「给谁授什么权」只能由审批人在审批环节配置。
 * {@code preferredRoleId} 是申请人的<b>建议值</b>，只落申请单供审批人参考，
 * 不进入任何授权写入路径（兑现前仍由 {@code SystemAccessGrantServiceImpl.requireGrantableRole} 逐条复核）。
 * <p>
 * 2026-10 起<b>不再采集勾选菜单</b>：菜单级申请会把目标系统的功能全貌暴露给对它零权限的申请人，
 * 且勾选树诱导全选（与最小权限反向）。改为陈述使用场景 + 期限 + 诉求，可选指向一个参考角色。
 */
@Data
public class SystemAccessRequestCreateDTO {

    /** 申请的业务系统编码（sys_system.code），必须是启用中的业务系统 */
    @NotBlank(message = "請選擇要申請的系統")
    private String systemCode;

    /**
     * 使用场景 code 列表（必填至少 1 项）。
     * <p>只接受 {@code SystemAccessConstants.ALLOWED_SCENARIOS} 内的值，服务端去重后落库，
     * 未知 code 一律拒绝——否则申请单上会出现前端造出来的场景名。
     */
    @NotEmpty(message = "請選擇使用場景")
    private List<String> scenarios;

    /** 使用期限类型：permanent / until（必填，白名单校验） */
    @NotBlank(message = "請選擇使用期限")
    private String durationType;

    /**
     * 期限截止日（{@code durationType=until} 时必填）。
     * <p>ISO 日期串（yyyy-MM-dd）由 Jackson 解析；服务端校验必须晚于今天且不超过
     * {@code SystemAccessConstants.MAX_DURATION_YEARS} 年。
     * <p>到期当天仍可用，次日起系统自动收回本单绑上的角色（见 SystemAccessExpiryJob），
     * 所以前端必须按这个承诺写文案，不能当成「只是审批人参考」。无期限请选 permanent。
     */
    private LocalDate durationUntil;

    /** 申请人建议的参考角色 ID（可选）；必须是「开放自助申请」且已持该系统准入的启用角色 */
    private Long preferredRoleId;

    /** 使用诉求说明（必填，长度上限见 SystemAccessConstants.REASON_MAX_LENGTH） */
    @NotBlank(message = "請填寫使用訴求")
    private String reason;

    /** 相关凭证（base64 Data URL，与其它流程一致；数量与体积上限由服务端强制） */
    private List<Attachment> attachments;

    /** 凭证项 */
    @Data
    public static class Attachment {
        /** 原始文件名 */
        private String name;
        /** 归类：image / pdf */
        private String type;
        /** 原始文件字节数（服务端按 dataUrl 实际长度复核，不信任此值） */
        private Long size;
        /** MIME 类型（须在白名单内） */
        private String contentType;
        /** base64 Data URL：data:{mime};base64,xxxx */
        private String dataUrl;
    }
}
