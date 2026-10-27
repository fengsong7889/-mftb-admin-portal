package com.mftb.admin.dto;

import lombok.Data;

/**
 * V3 灰度管理（任务29 D 段）响应 VO。
 *
 * <p>会被 {@code RdmIdempotentService.executeOnce} 序列化缓存/回放，必须是 Jackson 友好 POJO。
 * <p><b>effective* 字段仅供任务23 前端管理页展示</b>，按任务27 读侧同一口径镜像计算
 * （GLOBAL 熔断优先、缺行/null/非 1 一律关闭）；任何门禁判定仍以
 * {@code RdmFlowVersionGuard.isV3ReleaseEnabled} 等读侧权威方法为准，本 VO 不作为放行依据。
 *
 * <p><b>时间字段输出字符串（yyyy-MM-dd HH:mm:ss）</b>：全局 {@code JacksonConfig} 会把裸
 * {@code LocalDateTime} 序列化成毫秒数字，而前端（GrayscaleConfig.tsx）按字符串裁剪展示，
 * 数字上调用 {@code .slice()} 会直接抛 TypeError 并把整页交给 RouteErrorBoundary，
 * 导致灰度/熔断开关在 UI 上完全不可操作。
 */
public final class RdmFlowConfigVO {

    private RdmFlowConfigVO() {
    }

    /** 当前灰度状态：GLOBAL 行 +（可选）指定项目行 + 两级合成后的有效开关。 */
    @Data
    public static class GrayscaleStatus {
        private Global global;
        /** projectId 为空或项目行不存在时为 null（项目行缺失=默认关闭，不自动补行） */
        private Project project;
        /** 两级合成：V3 写入是否实际生效（GLOBAL 总闸开 + 未全局熔断 + 项目开） */
        private Boolean effectiveV3Write;
        /** 两级合成：V3 发布是否实际生效；true 也仅代表灰度开启，发布仍须过任务27 全部硬门禁 */
        private Boolean effectiveV3Release;
    }

    /** GLOBAL 行状态（唯一种子行；缺行时各开关按关闭呈现且 exists=false）。 */
    @Data
    public static class Global {
        private Boolean exists;
        private String scopeKey;
        private Integer v3WriteEnabled;
        private Integer v3ReleaseEnabled;
        private Integer globalWritePaused;
        private Integer globalReleasePaused;
        private Integer productVerificationDays;
        private Integer businessVerificationDays;
        private Integer version;
        private Long updatedBy;
        private String updatedAt;
    }

    /** 项目行状态（scope_key=PROJECT:&lt;id&gt;）。 */
    @Data
    public static class Project {
        private Boolean exists;
        private Long projectId;
        private String scopeKey;
        private Integer v3WriteEnabled;
        private Integer v3ReleaseEnabled;
        private Integer version;
        private Long updatedBy;
        private String updatedAt;
    }
}
