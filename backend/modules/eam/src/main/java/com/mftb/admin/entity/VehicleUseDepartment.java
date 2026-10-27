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
 * 车辆可使用部门授权实体（显式授权关系）
 *
 * <p>一期只认显式授权的部门 ID，不隐式继承子部门：继承会把"给总裁办用的车"
 * 自动扩散给全部下级部门，扩大占用面且没人能追溯到是谁授权的。需要扩大范围时
 * 由配置管理员显式添加，授权人与时间落在本行上。
 */
@Data
@TableName("biz_vehicle_use_department")
public class VehicleUseDepartment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long vehicleId;

    /** 被授权部门 sys_department.id */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 授权操作人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
