package com.mftb.admin.dto;

import lombok.Data;

/**
 * RDM 项目管理写入请求体（Batch 1）。
 * <p>日期统一用字符串 yyyy-MM-dd（与前端 DatePicker 输出一致），服务层解析后落库。
 * <p>Update 携带 expectedVersion 走乐观锁：项目字段会被 PM／产品负责人多方并发编辑，
 * 后写覆盖先写会把别人刚改的计划日期悄悄吞掉。
 */
public class RdmProjectDTO {

    /** 创建项目 */
    @Data
    public static class Create {
        /** 项目名称（必填） */
        private String name;
        /** 项目目标 */
        private String objective;
        private Long pmUserId;
        private String pmUserName;
        private Long productOwnerUserId;
        private String productOwnerUserName;
        /** yyyy-MM-dd */
        private String planStartDate;
        /** yyyy-MM-dd */
        private String planEndDate;
        /** 默认验收路径：A=先验收后上线，B=先上线后验收（缺省 A） */
        private String defaultAcceptancePath;
    }

    /** 编辑项目（乐观锁） */
    @Data
    public static class Update {
        private String name;
        private String objective;
        private Long pmUserId;
        private String pmUserName;
        private Long productOwnerUserId;
        private String productOwnerUserName;
        /** yyyy-MM-dd */
        private String planStartDate;
        /** yyyy-MM-dd */
        private String planEndDate;
        private String defaultAcceptancePath;
        /** preparing/in_progress/partial_delivered/all_delivered/closed */
        private String status;
        private Integer pausedFlag;
        private Integer riskFlag;
        /** 乐观锁期望版本（必填，不匹配即拒绝） */
        private Integer expectedVersion;
    }

    /** 添加项目成员 */
    @Data
    public static class MemberAdd {
        /** 用户ID（必填） */
        private Long userId;
        private String empNo;
        private String userName;
        /** 角色（必填）：pm/product/dev_lead/dev/qa/designer/pmo */
        private String roleCode;
    }

    /** 项目列表查询 */
    @Data
    public static class Query {
        /** 关键字（匹配项目名称/编号） */
        private String keyword;
        private Long pmUserId;
        private String status;
        private Integer pageNo = 1;
        private Integer pageSize = 20;
    }
}
