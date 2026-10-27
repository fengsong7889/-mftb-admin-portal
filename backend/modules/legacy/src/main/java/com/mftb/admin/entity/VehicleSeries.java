package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 车系实体（车辆参数库第二级），如 寶馬5系 / Cayenne。
 *
 * <p>车身形式与能源类型挂在这一级而不是品牌级：同品牌下既有 SUV 也有轿车，
 * 而能源类型直接决定车牌位数（新能源 8 位、燃油 7 位），是车辆档案必须带出的约束。
 */
@Data
@TableName("biz_vehicle_series")
public class VehicleSeries {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属品牌 ID */
    private Long brandId;

    private String seriesName;

    /** 车身形式：sedan/suv/mpv/van/bus/pickup/coupe */
    private String bodyType;

    /** 能源类型：petrol/diesel/hybrid/phev/ev */
    private String energyType;

    /** 默认核定载客人数，车辆档案可覆盖 */
    private Integer seatCount;

    private String status;

    private String remark;

    private String createdBy;
    @TableField(fill = FieldFill.INSERT)
    private java.time.LocalDateTime createdAt;
    private String updatedBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private java.time.LocalDateTime updatedAt;
    @TableLogic
    private Integer deleted;
}
