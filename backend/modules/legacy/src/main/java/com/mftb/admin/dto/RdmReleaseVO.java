package com.mftb.admin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 发布放行单视图（阶段 4）。
 */
@Data
public class RdmReleaseVO {

    /** 放行单（含检查项快照） */
    @Data
    public static class Gate {
        private Long id;
        private String releaseNo;
        private Long reqId;
        private Integer roundNo;
        private String env;
        private String versionNo;
        private String planTime;
        /** pending/passed/rejected/revoked */
        private String status;
        /** 未通过且未豁免的检查项数 */
        private Integer blockingCount;
        /** 是否可上线（blockingCount=0 且状态为 passed 且未过期） */
        private Boolean releasable;
        private String summary;
        private String applicantName;
        private String applyTime;
        private String gateName;
        private String decideTime;
        private String expireAt;
        /** 是否已过期（过期须重新过闸） */
        private Boolean expired;
        private List<Check> checks = new ArrayList<>();
    }

    /** 单个检查项结果 */
    @Data
    public static class Check {
        private String code;
        private String label;
        /** 是否阻断上线（false 表示仅提示，如节点偏差） */
        private Boolean blocking;
        private Boolean passed;
        /** 是否被豁免（豁免必须留理由） */
        private Boolean waived;
        /** 旧流程（V1）跳过：不参与新口径考核 */
        private Boolean skipped;
        /** 结论说明 / 失败原因 / 豁免理由 */
        private String reason;
    }
}
