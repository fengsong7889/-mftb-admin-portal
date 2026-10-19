package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 业务验收请求体
 */
@Data
public class RdmAcceptanceDTO {

    /** 结论: pass/conditional/fail */
    private String result;

    /** 交付满意度 1-5 */
    private Integer score;

    /** 验收用例总数 */
    private Integer caseTotal;

    /** 通过用例数 */
    private Integer casePass;

    /** 问题/遗留事项（不通过或有条件通过必填） */
    private String issues;

    /** 验收意见 */
    private String opinion;

    /** 验收环境: prod/pre/uat */
    private String testEnv;

    /** 逐条验收用例（M3）：空则退化为汇总式验收，但无法支撑缺陷统计 */
    private List<AcceptanceCaseDTO> cases;

    /** 有条件通过时是否把遗留事项自动转为后续需求 */
    private Boolean createFollowUp;

    /** 后续需求标题（留空则由服务端按原需求生成） */
    private String followUpTitle;

    /**
     * 单条验收用例
     */
    @Data
    public static class AcceptanceCaseDTO {

        /** 用例名称 */
        private String title;

        /** 预期结果 */
        private String expect;

        /** 实际结果 */
        private String actual;

        /** 用例结论: pass/fail/blocked */
        private String result;

        /** 缺陷严重度: critical/major/minor/trivial */
        private String severity;

        /** 备注 */
        private String remark;

        /**
         * 用例证据附件（截图/记录），可选。
         * <p>条数与单条体积由服务层钉住，避免一条用例被塞几十张图把验收表写爆。
         */
        private List<Evidence> evidences;
    }

    /**
     * 单条验收证据附件。
     * <p>dataUrl 为前端上传接口返回的 Base64 Data URL，服务端不落盘、不转存，
     * 因此它只能入库与单张取回，不得随验收历史批量下发。
     */
    @Data
    public static class Evidence {

        /** 文件名 */
        private String name;

        /** MIME 类型（如 image/png） */
        private String type;

        /** 字节数 */
        private Long size;

        /** Base64 Data URL 正文 */
        private String dataUrl;
    }
}
