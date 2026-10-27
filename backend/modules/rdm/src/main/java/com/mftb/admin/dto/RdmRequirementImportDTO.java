package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 存量需求导入请求体（云效迁移）。
 *
 * <p>字段与前端导入模板一一对应，状态用产研交付系统的状态码（前端已按状态字典归一）。
 * 这里不接收 reqNo / flowVersion / 审批标记：正式编号由服务端发号，流程版本固定按
 * 历史记录（V1）落库，避免客户端伪造版本绕过发布闸门。
 */
@Data
public class RdmRequirementImportDTO {

    /** 待导入行（上限由服务层校验，防止单次请求拖垮事务与内存） */
    private List<Row> rows;

    /** 单行导入数据 */
    @Data
    public static class Row {

        /** Excel 行号，仅用于把错误定位回用户表格 */
        private Integer rowNo;

        /** 需求名称 */
        private String title;

        /** 云效编号（幂等键，必填） */
        private String externalNo;

        /** 产研交付系统状态码（如 developing / testing） */
        private String status;

        /** 项目经理，格式「姓名(工号)」或姓名 */
        private String projectManager;

        /** 产品经理，格式「姓名(工号)」或姓名 */
        private String productManager;

        /**
         * 提出人（业务归属人），格式「姓名(工号)」/姓名/工号。
         * <p>留空时沿用导入操作人：存量清单通常由对接人统一导入，
         * 但业务提出人应可由模板指定，否则导入后需要再逐条改归属。
         */
        private String submitter;

        /** 所属项目名称（必须已存在） */
        private String projectName;

        /** 所属迭代名称或编码（必须已存在且属于该项目） */
        private String iterationName;

        /** 需求描述（落 description，并同步生成一份 PRD） */
        private String description;
    }
}
