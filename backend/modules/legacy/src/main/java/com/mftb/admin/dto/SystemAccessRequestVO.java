package com.mftb.admin.dto;

import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 系統權限申請單 VO（申请页「我的申请」/ 审批详情共用）。
 * <p>时间统一格式化为字符串，避免全局 Jackson 把 LocalDateTime 序列化成毫秒数字（前端 .slice 会崩）。
 */
@Data
public class SystemAccessRequestVO {

    private Long id;
    private String flowNo;
    private String systemCode;
    private String systemName;

    /** 申请人姓名快照 */
    private String applicantName;
    /** 申请人工号快照 */
    private String applicantEmpId;
    /** 申请人部门快照 */
    private String deptName;

    /**
     * 【历史字段】2026-10 前的申请单曾采集勾选菜单，仅为旧单回看保留；
     * 新单固定为空列表（新口径不采集菜单，避免向申请人暴露系统功能分解）。
     */
    private List<MenuItem> requestedMenus = new ArrayList<>();

    /** 使用场景 code 列表（展示名由前端 i18n 负责） */
    private List<String> scenarios = new ArrayList<>();
    /** 使用期限类型：permanent / until */
    private String durationType;
    /** 期限截止日（yyyy-MM-dd）；permanent 或历史单据为 null */
    private String durationUntil;
    /** 申请人建议的参考角色 ID（可为空） */
    private Long preferredRoleId;
    /** 参考角色名称快照 */
    private String preferredRoleName;

    /** 使用诉求说明 */
    private String reason;
    /** 相关凭证（已解析；列表场景可传 withAttachments=false 省流量） */
    private List<AttachmentItem> attachments = new ArrayList<>();

    /** 单据状态：pending/approved/rejected/cancelled */
    private String status;

    /** 授权对象类型：role */
    private String grantTargetType;
    /** 授权角色 ID */
    private Long grantTargetId;
    /** 授权角色名称快照 */
    private String grantTargetName;
    /** 授权兑现状态：none/granted */
    private String grantStatus;
    private String grantedAt;

    /**
     * 到期回收状态：none=未回收 / revoked=已回收 / kept=仍被其他有效授权覆盖而不回收。
     * <p>前端靠它区分「已授权且长期有效」与「已授权但已到期收回」，不能拿 grantStatus 代替。
     */
    private String revokeStatus;
    /** 回收时间（仅 revoked/kept 时有值） */
    private String revokedAt;
    /** 回收执行者：定时任务为 system-expiry，与真人签名区分 */
    private String revokedBy;
    private String grantedBy;

    private String rejectReason;
    private String applyTime;
    private String completeTime;

    /* ==================== OA 流程侧冗余（一次调用即可渲染审批进度） ==================== */

    /** 当前待审节点名称 */
    private String currentNodeName;
    /** 当前审批人（多人逗号分隔） */
    private String currentApprover;

    public static SystemAccessRequestVO from(SystemAccessRequest entity, boolean withAttachments) {
        SystemAccessRequestVO vo = new SystemAccessRequestVO();
        vo.setId(entity.getId());
        vo.setFlowNo(entity.getFlowNo());
        vo.setSystemCode(entity.getSystemCode());
        vo.setSystemName(entity.getSystemName());
        vo.setApplicantName(entity.getApplicantName());
        vo.setApplicantEmpId(entity.getApplicantEmpId());
        vo.setDeptName(entity.getDeptName());
        vo.setRequestedMenus(parseMenus(entity.getRequestedMenus()));
        vo.setScenarios(parseScenarios(entity.getScenarios()));
        vo.setDurationType(entity.getDurationType());
        // LocalDate 走 ISO 字串，不用 DateTimeUtils（那套是给 LocalDateTime 的，且全局 Jackson
        // 会把时间类型序列化成毫秒数字，日期给字符串才能让前端直接展示）
        vo.setDurationUntil(entity.getDurationUntil() == null ? null : entity.getDurationUntil().toString());
        vo.setPreferredRoleId(entity.getPreferredRoleId());
        vo.setPreferredRoleName(entity.getPreferredRoleName());
        vo.setReason(entity.getReason());
        if (withAttachments) {
            vo.setAttachments(parseAttachments(entity.getAttachments()));
        }
        vo.setStatus(entity.getStatus());
        vo.setGrantTargetType(entity.getGrantTargetType());
        vo.setGrantTargetId(entity.getGrantTargetId());
        vo.setGrantTargetName(entity.getGrantTargetName());
        vo.setGrantStatus(entity.getGrantStatus());
        vo.setGrantedAt(DateTimeUtils.format(entity.getGrantedAt()));
        vo.setRevokeStatus(entity.getRevokeStatus());
        vo.setRevokedAt(DateTimeUtils.format(entity.getRevokedAt()));
        vo.setRevokedBy(entity.getRevokedBy());
        vo.setGrantedBy(entity.getGrantedBy());
        vo.setRejectReason(entity.getRejectReason());
        vo.setApplyTime(DateTimeUtils.format(entity.getApplyTime()));
        vo.setCompleteTime(DateTimeUtils.format(entity.getCompleteTime()));
        return vo;
    }

    /** 脏 JSON 一律按空列表处理：一条坏数据不该让整个列表/详情打不开 */
    private static List<MenuItem> parseMenus(String json) {
        List<MenuItem> result = new ArrayList<>();
        for (Map<String, Object> row : JsonUtils.parseMapList(json)) {
            MenuItem item = new MenuItem();
            item.setMenuKey(str(row.get("menuKey")));
            item.setName(str(row.get("name")));
            if (item.getMenuKey() != null) {
                result.add(item);
            }
        }
        return result;
    }

    /** 逗号分隔的场景 code → 列表；脏数据（空段/空白）直接丢掉，不抛错 */
    private static List<String> parseScenarios(String joined) {
        List<String> result = new ArrayList<>();
        if (joined == null || joined.isBlank()) {
            return result;
        }
        for (String part : joined.split(",")) {
            String code = part.trim();
            if (!code.isEmpty()) {
                result.add(code);
            }
        }
        return result;
    }

    private static List<AttachmentItem> parseAttachments(String json) {
        List<AttachmentItem> result = new ArrayList<>();
        for (Map<String, Object> row : JsonUtils.parseMapList(json)) {
            AttachmentItem item = new AttachmentItem();
            item.setName(str(row.get("name")));
            item.setType(str(row.get("type")));
            item.setContentType(str(row.get("contentType")));
            item.setDataUrl(str(row.get("dataUrl")));
            Object size = row.get("size");
            item.setSize(size instanceof Number n ? n.longValue() : null);
            result.add(item);
        }
        return result;
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /** 【历史】申请的菜单功能项（仅旧单有值） */
    @Data
    public static class MenuItem {
        private String menuKey;
        private String name;
    }

    /** 凭证项 */
    @Data
    public static class AttachmentItem {
        private String name;
        private String type;
        private String contentType;
        private Long size;
        private String dataUrl;
    }
}
