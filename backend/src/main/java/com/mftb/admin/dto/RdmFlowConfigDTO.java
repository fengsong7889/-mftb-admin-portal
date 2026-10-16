package com.mftb.admin.dto;

import lombok.Data;

/**
 * V3 灰度管理写接口（任务29 D 段）请求 DTO。
 *
 * <p>写与发布是<b>两个独立开关</b>，分别灰度；开关变更是显式授权动作，仅管理员可操作（fail-closed），
 * 每次变更写审计（谁/何时/项目/从→到/原因）并接入 {@code executeOnce} 原子幂等 +
 * {@code expectedVersion} 乐观锁（@Version 条件更新防并发覆盖）。
 *
 * <p><b>默认关闭</b>：本 DTO 不提供任何「批量开启」「自动开启」入口；null 字段表示不变更，
 * 只有显式携带 0/1 的字段才会被写入。开启灰度<b>不等于</b>放开发布门禁 ——
 * 发布仍须通过任务27 全部硬门禁（RdmReleaseGateService）。
 */
public final class RdmFlowConfigDTO {

    private RdmFlowConfigDTO() {
    }

    /**
     * 项目级开关变更（scope_key=PROJECT:&lt;projectId&gt;，非空唯一）。
     * <p>{@code v3WriteEnabled} 与 {@code v3ReleaseEnabled} 相互独立、可分别变更（null=不变）；
     * 项目行不存在时按「默认全关」语义创建（只写入显式携带的开关，其余取 0 默认）。
     * <p>项目级行不承载全局熔断位（ck_rdm_flow_flags 强制项目行 global_*_paused=0）。
     */
    @Data
    public static class ProjectFlagsUpdate {
        /** 客户端幂等请求ID（重试保持不变） */
        private String requestId;
        /** 目标项目ID（必填，>0） */
        private Long projectId;
        /** V3 写入开关（0/1；null=不变更） */
        private Integer v3WriteEnabled;
        /** V3 发布开关（0/1；null=不变更，与写入开关独立） */
        private Integer v3ReleaseEnabled;
        /** 配置行并发版本乐观锁（必填，防并发覆盖） */
        private Integer expectedVersion;
        /** 变更原因（必填，审计留痕） */
        private String reason;
    }

    /**
     * 全局（GLOBAL 行）开关变更：全局熔断优先于任何项目级开启（与任务27 读侧口径一致）。
     * <p>{@code globalWritePaused}/{@code globalReleasePaused}=1 即熔断：所有项目 V3 写入/发布一律关闭；
     * GLOBAL 的 {@code v3WriteEnabled}/{@code v3ReleaseEnabled} 是项目级开启的前置总闸。
     * 四个开关全部独立、null=不变更；只维护唯一 GLOBAL 种子行，绝不自动开启任何项目。
     */
    @Data
    public static class GlobalFlagsUpdate {
        private String requestId;
        /** GLOBAL 行 V3 写入总闸（0/1；null=不变更） */
        private Integer v3WriteEnabled;
        /** GLOBAL 行 V3 发布总闸（0/1；null=不变更） */
        private Integer v3ReleaseEnabled;
        /** 全局写入熔断（0/1；null=不变更） */
        private Integer globalWritePaused;
        /** 全局发布熔断（0/1；null=不变更） */
        private Integer globalReleasePaused;
        /** GLOBAL 行并发版本乐观锁（必填） */
        private Integer expectedVersion;
        /** 变更原因（必填，审计留痕） */
        private String reason;
    }
}
