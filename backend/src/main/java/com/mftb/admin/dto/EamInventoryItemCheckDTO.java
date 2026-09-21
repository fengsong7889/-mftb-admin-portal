package com.mftb.admin.dto;

import lombok.Data;

/** 盘点明细单条核对结果保存/重置 DTO（v2） */
@Data
public class EamInventoryItemCheckDTO {

    /** 客户端看到的明细修订号，用于并发乐观锁 */
    private Integer itemRevision;

    /** 实物结果：pending(重置)/normal(完好)/lost(未找到)/damaged(损坏) */
    private String status;

    /** 实际位置 ID（与 status 无关，独立核对维度） */
    private Long actualLocationId;

    /** 其他位置自由文本（actualLocationId 为空且已确认时填写） */
    private String actualLocationOther;

    /** 实际持有人类型：EMPLOYEE/NONE/EXTERNAL/PENDING */
    private String actualHolderType;

    /** 实际持有人 sys_user.id（EMPLOYEE 必填，后端校验在职） */
    private Long actualHolderId;

    /** 外部保管名称（EXTERNAL 必填） */
    private String actualHolderExternal;

    /** 核对方式：ONSITE/HOLDER/DOC */
    private String checkMethod;

    /** 核对时间 yyyy-MM-dd HH:mm:ss（缺省取服务器当前时间，不得晚于当前） */
    private String checkedAt;

    /** 备注/异常说明 */
    private String remark;

    /** 幂等键（保存动作记录到操作日志） */
    private String requestKey;
}
