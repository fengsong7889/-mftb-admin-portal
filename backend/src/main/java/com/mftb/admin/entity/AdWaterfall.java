package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 瀑布流策略主实体（对应「瀑布流策略」菜单）
 * 主键即配置ID，被 APP 引用渲染瀑布流
 */
@Data
@TableName("biz_ad_waterfall")
public class AdWaterfall {

    @TableId
    private Long id;

    /** 瀑布流名称 */
    private String strategyName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 自然流量兜底算法ID（未配置坑位读取该算法数据） */
    private Long naturalAlgoId;

    /** 自然流量算法名称快照 */
    private String naturalAlgoName;

    /** 过滤用户不喜欢: 1=开启 2=关闭 */
    private Integer filterDislike;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
