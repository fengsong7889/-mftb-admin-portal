package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 发布放行请求体（阶段 4）。
 * <p>只承载人的决定（豁免、驳回原因），检查项结果一律由服务端计算，
 * 不接受前端传"已检查通过"——否则闸门形同虚设。
 */
public class RdmReleaseDTO {

    /** 发起放行单 */
    @Data
    public static class Apply {
        /** 目标环境: prod/pre/uat */
        private String env;
        /** 发布版本号/迭代号 */
        private String versionNo;
        /** 计划上线时间 yyyy-MM-dd HH:mm */
        private String planTime;
        /** 豁免的检查项编码（必须同时给理由） */
        private List<String> waivedCodes;
        /** 豁免理由（存在豁免时必填） */
        private String waiveReason;
    }

    /** 放行 / 驳回 */
    @Data
    public static class Decide {
        /** true=放行 false=驳回 */
        private Boolean passed;
        /** 放行说明或驳回原因（驳回必填） */
        private String summary;
    }
}
