package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 车辆授权管理人员实体（管理范围按「车辆 × 人」判定）
 *
 * <p>不复用 DataScopeService 的商家集团数据权限：那一套的粒度是 group_code（商家集团），
 * 和公司车辆、司机、行政管理部门完全是两回事，套上去会出现"看得见集团数据却管不了车"
 * 或反过来的越权面。
 *
 * <p>{@code level} 只区分 manage（可办理用车）与 view（仅可查阅）两档。
 * 授权直接登记、补录、更正、导出是<strong>独立</strong>菜单动作授权，
 * 不因持有 manage 级车辆授权就自动全部放开。
 */
@Data
@TableName("biz_vehicle_manager")
public class VehicleManager {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long vehicleId;

    /** 管理人员 sys_user.id */
    private Long userId;

    private String empNo;

    private String empName;

    /** 权限级别：manage=可办理用车 view=仅可查阅 */
    private String level;

    /** 授权操作人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
