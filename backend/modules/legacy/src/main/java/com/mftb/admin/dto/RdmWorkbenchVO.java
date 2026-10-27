package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 需求工作台视图（按登录人角色聚合待办）
 */
@Data
public class RdmWorkbenchVO {

    /** 登录人身份与角色 */
    private Identity identity;

    /** 待办分组（空组不返回，前端按序渲染） */
    private List<TodoGroup> todos;

    /** 指标统计 */
    private Stats stats;

    /** 身份 */
    @Data
    public static class Identity {
        private String name;
        private String empNo;
        private String deptName;
        /** 该登录人在 RDM 中承担的角色名称列表（已按角色标签翻译） */
        private List<String> roleNames;
    }

    /** 待办分组 */
    @Data
    public static class TodoGroup {
        private String key;
        private String title;
        private String hint;
        private Long total;
        private List<RdmRequirementVO> items;

        public TodoGroup(String key, String title, String hint, Long total, List<RdmRequirementVO> items) {
            this.key = key;
            this.title = title;
            this.hint = hint;
            this.total = total;
            this.items = items;
        }
    }

    /** 指标统计 */
    @Data
    public static class Stats {
        /** 我提交的需求总数 */
        private Long mineTotal;
        /** 我提交且未交付的需求数 */
        private Long mineProgress;
        /** 待我处理总数 */
        private Long todoTotal;
        /** 逾期需求数（我相关） */
        private Long overdueTotal;
        /** 待我验收数 */
        private Long toAcceptTotal;
        /** 我相关且已交付数 */
        private Long deliveredTotal;
    }
}
