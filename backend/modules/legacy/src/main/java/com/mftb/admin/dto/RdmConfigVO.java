package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * RDM 配置视图（状态机 / 流转规则 / SLA / 分发矩阵）
 */
public class RdmConfigVO {

    /** 状态定义 */
    @Data
    public static class StatusDef {
        private String code;
        private String label;
        private String stage;
        private Integer sortNo;
        private Boolean finalFlag;
        private Boolean enabled;
    }

    /** 流转规则 */
    @Data
    public static class Transition {
        private Long id;
        private String fromStatus;
        private String toStatus;
        private String actionCode;
        private String actionName;
        private List<String> allowedRoles;
        private List<String> requiredFields;
        private Boolean enabled;
    }

    /** SLA 配置 */
    @Data
    public static class Sla {
        private Long id;
        private String statusCode;
        private String statusLabel;
        private String priority;
        private Integer slaHours;
        private Integer warnHours;
        private String escalateRole;
        private Boolean enabled;
        /** 服务端回填的操作人签名（前端不传，防伪造） */
        private String operator;
    }

    /** 分发矩阵行 */
    @Data
    public static class Routing {
        private Long id;
        private String scopeType;
        private String scopeValue;
        private String scopeName;
        private Long pmUserId;
        private String pmName;
        private Long backupPmUserId;
        private String backupPmName;
        private Integer loadCapacity;
        private Integer activeCount;
        private Integer priority;
        private Boolean enabled;
    }
}
