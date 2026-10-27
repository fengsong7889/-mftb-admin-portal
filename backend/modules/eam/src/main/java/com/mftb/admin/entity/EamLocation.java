package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 仓库 / 存放位置实体（按省-市-区-详细地址维度管理）
 */
@Data
@TableName("biz_eam_location")
public class EamLocation {

    @TableId
    private Long id;

    /** 位置编码（唯一） */
    private String code;

    /** 位置名称 */
    private String name;

    /** 父级 ID，0 为顶级 */
    private Long parentId;

    /** 类型（已废弃，保留兼容旧数据） */
    private String type;

    /** 省份（如：广东省） */
    private String province;

    /** 城市（如：珠海市） */
    private String city;

    /** 区县（如：香洲区） */
    private String district;

    /** 排序 */
    private Integer sort;

    /** 详细地址（街道、门牌号等） */
    private String address;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
