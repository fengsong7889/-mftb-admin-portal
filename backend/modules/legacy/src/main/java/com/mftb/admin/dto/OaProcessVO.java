package com.mftb.admin.dto;

import com.mftb.admin.entity.OaProcess;
import lombok.Data;

/**
 * OA流程定义视图（流程中心列表项）
 */
@Data
public class OaProcessVO {

    private Long id;

    /** 流程编码 */
    private String processCode;

    /** 流程名称 */
    private String processName;

    /** 分类: office/finance/hr/general */
    private String category;

    /** 图标标识 */
    private String icon;

    /** 流程说明 */
    private String description;

    /** 关联审批流程类型 */
    private String workflowType;

    /** 表单字段定义JSON */
    private String formSchema;

    /** 排序 */
    private Integer sortOrder;

    public static OaProcessVO from(OaProcess process) {
        OaProcessVO vo = new OaProcessVO();
        vo.setId(process.getId());
        vo.setProcessCode(process.getProcessCode());
        vo.setProcessName(process.getProcessName());
        vo.setCategory(process.getCategory());
        vo.setIcon(process.getIcon());
        vo.setDescription(process.getDescription());
        vo.setWorkflowType(process.getWorkflowType());
        vo.setFormSchema(process.getFormSchema());
        vo.setSortOrder(process.getSortOrder());
        return vo;
    }
}
