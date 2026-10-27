package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 车辆品牌实体（车辆参数库第一级）。
 *
 * <p>生成列 active_name 承载"软删感知唯一键"，故意不写进实体：它是纯数据库结构，
 * 让 MyBatis 当成可写列会在插入时报错。
 */
@Data
@TableName("biz_vehicle_brand")
public class VehicleBrand {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 品牌名称，如 寶馬 / 保时捷 */
    private String brandName;

    /** 英文名：多语言展示用，不参与唯一约束 */
    private String brandNameEn;

    /** 产地国家/地区 */
    private String countryOrigin;

    /** 状态：enabled/disabled。禁用后不出现在车辆档案候选里，但历史车不受影响 */
    private String status;

    private Integer sortOrder;

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
