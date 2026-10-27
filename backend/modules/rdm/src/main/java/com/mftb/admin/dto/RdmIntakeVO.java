package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 准入策略与裁决视图对象（阶段 2B）。
 * <p>策略是配置态，裁决是某一轮提交的结果快照：两者分开，
 * 才能在需求上留下「当时按哪条规则、哪个版本判定」的凭证，而不是只剩一个布尔值。
 */
public class RdmIntakeVO {

    /** 准入策略（rdm_intake_policy） */
    @Data
    public static class Policy {
        private Long id;
        /** 策略名称（会出现在需求的准入判定说明里） */
        private String name;
        /** FORCE_APPROVE / APPROVE / EXEMPT */
        private String mode = "APPROVE";
        /** 适用部门名称（空=不限部门） */
        private List<String> scopeDepts = new ArrayList<>();
        /** 是否含下级部门 */
        private Boolean includeSubDept = false;
        /** 适用角色编码或名称（空=不限角色） */
        private List<String> scopeRoles = new ArrayList<>();
        /** 适用系统编码或名称（空=不限系统） */
        private List<String> scopeSystems = new ArrayList<>();
        /** 适用需求类型（空=不限类型） */
        private List<String> scopeReqTypes = new ArrayList<>();
        /** 审批节点（按顺序执行） */
        private List<String> approvalNodes = new ArrayList<>();
        private Long dispatcherUserId;
        private String dispatcherName;
        private Integer priority = 10;
        private String effectiveFrom;
        private String effectiveTo;
        private String version = "v1";
        /** 新建默认停用：半套条件不能直接对全公司生效 */
        private Boolean enabled = false;
        private String remark;
    }

    /** 一次准入裁决结果（含命中链路，可审计） */
    @Data
    public static class Decision {
        /** 是否需要审批：服务端唯一权威结论 */
        private boolean needApproval = true;
        /** APPROVE / FORCE_APPROVE / EXEMPT */
        private String mode = "APPROVE";
        private Long policyId;
        private String policyName;
        private String policyVersion;
        private List<String> approvalNodes = new ArrayList<>();
        private Long dispatcherUserId;
        private String dispatcherName;
        /** 命中链路（给人看的解释，也是审计留痕） */
        private List<String> explain = new ArrayList<>();
        /** 需审批但没配节点：该轮要进异常待办，不能自动放行 */
        private boolean abnormal;
        /** 是否使用了内置默认策略（未命中任何规则） */
        private boolean fallback;

        /** 免审时不需要准入单 */
        public boolean flowRequired() {
            return needApproval;
        }
    }

    /** 模拟入参：不写库，只回答「这个人提这样一条需求会走哪条路」 */
    @Data
    public static class SimulateRequest {
        /** 模拟的登录员工工号（不传=当前登录人） */
        private String empNo;
        private String reqType;
        private String systemCode;
    }
}
