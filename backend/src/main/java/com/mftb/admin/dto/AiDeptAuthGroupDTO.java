package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.io.Serializable;
import java.util.List;

/**
 * 部门模型授权策略 DTO 聚合
 */
public class AiDeptAuthGroupDTO {

    /**
     * 列表响应 VO（含关联部门名称、模型名称聚合）
     */
    @Data
    public static class GroupVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String name;
        private Integer dataResidency;
        private Integer status;
        private Integer totalEmployeeCount;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;

        /** 关联部门 ID 列表 */
        private List<Long> deptIds;
        /** 关联部门名称列表 */
        private List<String> deptNames;
        /** 授权模型 ID 列表 */
        private List<Long> modelIds;
        /** 授权模型名称列表（与 modelIds 一一对应） */
        private List<String> modelNames;
    }

    /**
     * 详情响应 VO（含完整部门列表 + 模型列表 + 能力配置）
     */
    @Data
    public static class GroupDetailVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long id;
        private String name;
        private Integer dataResidency;
        private Integer status;
        private Integer totalEmployeeCount;
        private String updatedBy;
        private String createdAt;
        private String updatedAt;

        /** 关联部门列表 */
        private List<DeptItem> departments;
        /** 授权模型配置列表（含能力开关） */
        private List<ModelConfigItem> modelConfigs;
    }

    /**
     * 部门项（详情用）
     */
    @Data
    public static class DeptItem implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long deptId;
        private String deptName;
        private Integer employeeCount;
    }

    /**
     * 模型配置项（含能力开关）
     */
    @Data
    public static class ModelConfigItem implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotNull(message = "模型 ID 不能为空")
        private Long modelId;
        /** 视觉理解 */
        private Integer visionSupport;
        /** 工具调用 */
        private Integer functionCalling;
        /** JSON 模式 */
        private Integer jsonMode;
        /** 流式响应 */
        private Integer streaming;
        /** 思考模式 */
        private Integer thinkingMode;
        /** 优先级 */
        private Integer priority;
    }

    /**
     * 新增/编辑请求
     */
    @Data
    public static class GroupSaveRequest implements Serializable {
        private static final long serialVersionUID = 1L;

        @NotBlank(message = "策略名称不能为空")
        private String name;

        /** 数据不出域 */
        private Integer dataResidency;

        /** 状态 */
        private Integer status;

        /** 关联部门 ID 列表 */
        @NotEmpty(message = "请至少选择一个部门")
        private List<Long> deptIds;

        /** 模型配置列表 */
        @NotEmpty(message = "请至少授权一个模型")
        private List<ModelConfigItem> modelConfigs;

        /** 更新人 */
        private String updatedBy;
    }

    /**
     * 部门选项 VO（供前端树状选择组件使用）
     */
    @Data
    public static class DeptOptionVO implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long deptId;
        private String deptName;
        /** 部门编码（用于展示与搜索，重名部门靠编码/层级区分） */
        private String deptCode;
        /** 父部门 ID（用于构建树状结构，根节点为 0 或 null） */
        private Long parentId;
        private Integer employeeCount;
    }
}
