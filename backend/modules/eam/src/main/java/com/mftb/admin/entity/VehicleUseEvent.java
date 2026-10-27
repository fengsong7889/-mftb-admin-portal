package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用车审计事件实体（追加式，只写不改不删）
 *
 * <p>故意没有 updated_by/updated_at/deleted 列：审计的价值就在于"谁在什么时候做了什么"
 * 不可被事后抹掉。业务页面不提供任何删改入口，更正类动作通过再写一条带
 * beforeJson/afterJson 的 correct 事件来留痕，而不是改历史行。
 *
 * <p>{@code requestKey} 唯一键（operator_id + request_key）保证 OA 重复回调、
 * 网络重试不会重复留痕。
 */
@Data
@TableName("biz_vehicle_use_event")
public class VehicleUseEvent {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 用车单 ID；车辆级配置变更时为 null */
    private Long useId;

    private Long vehicleId;

    /** 对象编号快照（单号或车牌），便于跨表追溯 */
    private String targetNo;

    /**
     * 动作：apply/assign/direct_register/depart/return/confirm/backfill/correct/config_change/qual_verify
     */
    private String action;

    /** 变更前值 JSON（更正类必填） */
    private String beforeJson;

    /** 变更后值 JSON */
    private String afterJson;

    /** 原因/说明：直接登记原因、更正理由、补录说明 */
    private String reason;

    private Long operatorId;

    private String operatorName;

    private String operatorEmpNo;

    /** 幂等键 */
    private String requestKey;

    /** 事件发生时间 */
    private LocalDateTime occurredAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
