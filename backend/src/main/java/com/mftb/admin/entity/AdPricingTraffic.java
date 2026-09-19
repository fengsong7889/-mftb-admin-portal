package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 投流广告计价主实体（差异层，对应「销售定价-投流广告」菜单）
 * <p>
 * 预付流量包模型：按业务频道分别定价，一个算法每个业务频道一条配置。
 */
@Data
@TableName("biz_ad_pricing_traffic")
public class AdPricingTraffic {

    @TableId
    private Long id;

    /** 定价编号（按编号生成规则 config_pricing_traffic 生成，如 DJTL20260812000） */
    private String pricingNo;

    /** 关联算法ID（biz_ad_algorithm.id，algo_type=15） */
    private Long algoId;

    /** 算法名称快照 */
    private String algoName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    private Integer bizChannel;

    /** 自定义购买最低起购量（曝光次数） */
    private Integer customMinQty;

    /** 自定义购买步长（曝光次数） */
    private Integer customStep;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 退款手续费比例（%）：手续费 = 退款金额 × 比例，0=免费退 */
    private Integer refundFeePercent;

    /** 服务状态: 1=启用 2=停用（停用后该频道流量包停止售卖） */
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
