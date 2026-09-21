package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;
import java.util.Map;

/** 盘点任务视图对象（v2） */
@Data
@JsonInclude(JsonInclude.Include.ALWAYS)
public class EamInventoryTaskVO {

    private Long id;

    /** 契约版本(1=历史,2=新版) */
    private Integer contractVersion;

    /** 盘点任务编号 */
    private String taskNo;

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点日期（发起日） */
    private String inventoryDate;

    /** 盘点人（兼容旧字段，等于负责人姓名） */
    private String operator;

    /** 负责人姓名/工号 */
    private Long ownerId;
    private String ownerName;
    private String ownerEmpNo;

    /** 范围模式与摘要 */
    private String scopeMode;
    private Map<String, Object> scopeSummary;

    /** 旧统计（保留兼容） */
    private Integer expectedCount;
    private Integer actualCount;
    private Integer diffCount;

    /** 结构化统计（新 UI 主口径） */
    private EamInventoryStatsVO stats;

    /** 状态：in_progress/completed/partially_completed/cancelled */
    private String status;

    /** 结束/取消信息 */
    private String closeType;
    private String closeReason;
    private String closedAt;
    private String cancelledAt;
    private String cancelReason;

    /** 任务修订号（前端携带做乐观锁） */
    private Integer taskRevision;

    /** 应盘清单冻结时间 */
    private String snapshotAt;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;

    /** 盘点明细列表（旧详情接口返回；新版改用分页 items 接口） */
    private List<EamInventoryItemVO> items;
}
