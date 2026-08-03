package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 推广算法登记实体（共享核心层，对应「算法库」菜单）
 */
@Data
@TableName("biz_ad_algorithm")
public class AdAlgorithm {

    @TableId
    private Long id;

    /** 算法编码（系统生成，如 ALG_STAR_001） */
    private String algoCode;

    /** 算法名称 */
    private String algoName;

    /** 算法类型: 1=无敌星星 2=新店广告 3=盘活复苏 ... */
    private Integer algoType;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道: 1=大首页 2=外卖频道 3=超市百货 4=团购到店 */
    private Integer channel;

    /** 投放界面: 1=大首页-Feed 2=外卖频道-Feed 3=超市频道-Feed 4=团购频道-Feed */
    private Integer placementInterface;

    /** 坑位数（展示位数量，不作为售卖维度） */
    private Integer slotCount;

    /** 各算法差异化参数（JSON 字符串） */
    private String params;

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
