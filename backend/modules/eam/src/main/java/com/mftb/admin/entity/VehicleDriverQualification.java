package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 内部员工驾驶资格实体（最小核验记录）
 *
 * <p>隐私边界：一期只存"能不能开、在哪个地区、准驾范围、什么时候失效"，
 * 明确不收集完整驾驶证号与证件照片。需要影像凭证时另立需求评估脱敏方案，
 * 不在本表顺手加字段。
 *
 * <p>{@code userId} 是稳定关联键，姓名/工号只是展示快照 —— 按姓名关联会让
 * 同名员工互相顶替，也让权限判定随改名失效。
 */
@Data
@TableName("biz_vehicle_driver_qualification")
public class VehicleDriverQualification {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 员工 sys_user.id */
    private Long userId;

    private String empNo;

    private String empName;

    /** 驾照适用地区：澳門/中國內地/香港 */
    private String region;

    /** 准驾范围：A1/B2/C1 … */
    private String licenseClass;

    /** 有效期至；过期按失效处理，禁止新出车 */
    private LocalDate validUntil;

    /** 核验结果：verified/pending/expired */
    private String result;

    private String verifiedBy;

    private LocalDateTime verifiedAt;

    private String remark;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
