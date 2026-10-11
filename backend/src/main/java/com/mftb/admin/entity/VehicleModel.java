package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 年款车型实体（车辆参数库第三级），如 2024款 530Li 領先型。
 *
 * <p>金额用 DECIMAL/BigDecimal，规范禁止用 float 表示钱与建议价。
 */
@Data
@TableName("biz_vehicle_model")
public class VehicleModel {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属车系 ID */
    private Long seriesId;

    private String modelName;

    /** 年款，如 2024款；未知填空串（参与唯一键，所以不给 NULL 默认值） */
    private String yearLabel;

    private String displacement;

    private String gearbox;

    /** 该年款座位数；为空则沿用车系默认值 */
    private Integer seatCount;

    private BigDecimal basePrice;

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
