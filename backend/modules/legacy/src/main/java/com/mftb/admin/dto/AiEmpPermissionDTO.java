package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 员工AI权额管理 DTO：列表聚合、详情、保存请求、调整日志
 */
public class AiEmpPermissionDTO {

    /* ══════════ 列表页单行 ══════════ */

    @Data
    public static class SummaryVO {
        private Long employeeId;
        private String employeeName;
        private String empId;
        private String department;
        private Long deptId;
        private String position;
        private String jobLevel;
        /** 启用模型数 */
        private int modelCount;
        /** 授权模型列表（列表页展示） */
        private List<ModelBrief> models = new ArrayList<>();
        /** 聚合额度（含已用/总额） */
        private List<QuotaBrief> quotas = new ArrayList<>();
        /** 最近操作人 */
        private String lastUpdatedBy;
        /** 最近操作时间 */
        private String lastUpdatedAt;
    }

    /* ══════════ 模型简要（列表用） ══════════ */

    @Data
    public static class ModelBrief {
        private Long modelId;
        private String modelName;
        /** 来源：department/position/role/employee/approval */
        private String source;
    }

    /* ══════════ 额度简要（列表用） ══════════ */

    @Data
    public static class QuotaBrief {
        private String source;
        private String sourceDesc;
        /** token/request/cost */
        private String quotaType;
        /** daily/monthly */
        private String quotaPeriod;
        private BigDecimal quotaValue;
        private BigDecimal usedValue;
        private int status;
    }

    /* ══════════ 详情页 ══════════ */

    @Data
    public static class DetailVO {
        /** 基本信息（与列表同构） */
        private SummaryVO basic;
        /** 模型权限明细（含能力开关） */
        private List<ModelPermissionVO> models = new ArrayList<>();
        /** 额度明细 */
        private List<QuotaGrantVO> quotas = new ArrayList<>();
    }

    @Data
    public static class ModelPermissionVO {
        private Long modelId;
        private String modelName;
        private String source;
        private String sourceDesc;
        /** 能力开关 */
        private int visionSupport;
        private int functionCalling;
        private int jsonMode;
        private int streaming;
        private int thinkingMode;
        /** 状态：1=启用 0=禁用 */
        private int status;
        private String grantedAt;
    }

    @Data
    public static class QuotaGrantVO {
        private Long id;
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal quotaValue;
        private BigDecimal usedValue;
        /** permanent/temporary */
        private String effectiveType;
        private String effectiveAt;
        private String expireAt;
        private String overLimitAction;
        private int status;
    }

    /* ══════════ 保存请求 ══════════ */

    @Data
    public static class SaveReq {
        private Long employeeId;
        /** 能力开关变更 */
        private List<ModelCapToggle> modelToggles = new ArrayList<>();
        /** 额度值变更 */
        private List<QuotaAdjust> quotaAdjusts = new ArrayList<>();
        private String reason;
    }

    @Data
    public static class ModelCapToggle {
        private Long modelId;
        /** visionSupport/functionCalling/jsonMode/streaming/thinkingMode */
        private String field;
        /** 0 or 1 */
        private int value;
    }

    @Data
    public static class QuotaAdjust {
        /** 对应额度记录ID */
        private Long quotaId;
        /** 额度来源（department/position/role/approval） */
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal oldValue;
        private BigDecimal newValue;
    }

    /* ══════════ 调整日志 VO ══════════ */

    @Data
    public static class AdjustLogVO {
        private String time;
        private String source;
        private String sourceDesc;
        private String quotaType;
        private String quotaPeriod;
        private BigDecimal oldValue;
        private BigDecimal newValue;
        private String operator;
        private String reason;
    }
}
