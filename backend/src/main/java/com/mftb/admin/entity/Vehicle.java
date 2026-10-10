package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 车辆运行档案实体（EAM 车辆域）
 *
 * <p>与 {@link EamAsset} 的分工：资产台账描述"这件资产归谁保管"，本表描述
 * "这辆车当前能不能派、跑了多少公里、哪些部门可用"。一次用车出还可能推进里程，
 * 但不会改动资产的持有人与领用关系，所以两边只靠 {@code eamAssetId} 弱关联。
 *
 * <p>表上的生成列（active_plate / active_code / active_asset）承担软删感知的唯一约束，
 * 属于纯数据库结构，故意不出现在实体字段里，避免被误当成可写列。
 */
@Data
@TableName("biz_vehicle")
public class Vehicle {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 车辆编号（VH+6位，系统生成）：车牌可换，稳定身份用本字段 */
    private String vehicleCode;

    /** 当前主车牌 */
    private String plateNo;

    /** 车牌登记地区：澳門/中國內地/香港 */
    private String registerRegion;

    /** 车型 */
    private String vehicleType;

    /** VIN/底盘号，可选，不作业务身份 */
    private String vin;

    /** 核定载客人数（含驾驶人） */
    private Integer seatCount;

    /** 当前里程(km)，作为出车起始里程默认值 */
    private BigDecimal currentOdometer;

    /** 运行状态：normal/repairing/suspended/retired */
    private String status;

    /** 是否允许授权直接登记：1=允许 0=仅审批用车 */
    private Integer allowDirectRegister;

    /** 保险有效期止 */
    private LocalDate insuranceValidUntil;

    /** 检验（年检）有效期止 */
    private LocalDate inspectionValidUntil;

    /** 合规核验人 */
    private String verifyBy;

    /** 合规核验时间 */
    private LocalDateTime verifyAt;

    /** 所属法人主体（sys_purchase_company.id），与公司品牌是两个独立维度 */
    private Long ownerCompanyId;

    /** 所属法人名称快照（展示用，不因字典改名而改写历史） */
    private String ownerCompanyName;

    /** 公司品牌：1=闪蜂 2=mFood */
    private Integer companyBrand;

    /** 管理部门 */
    private Long manageDeptId;

    /** 管理部门名称快照 */
    private String manageDeptName;

    /** 关联 EAM 资产 ID（可空） */
    private Long eamAssetId;

    /** 关联 EAM 资产编号快照 */
    private String eamAssetNo;

    private String remark;

    /**
     * 乐观锁版本。
     * <p>本引擎没装 OptimisticLockerInnerInterceptor（见 MyBatisPlusConfig），所以 @Version 在此
     * 会静默失效——看起来有锁其实没锁。并发改档案一律走 Mapper 里显式的
     * {@code UPDATE ... SET version = version + 1 ... WHERE id = ? AND version = ?} 并校对受影响行数。
     */
    private Long version;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
