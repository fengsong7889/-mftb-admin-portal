package com.mftb.admin.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 人气商家计价配置新增/编辑请求
 */
@Data
public class AdPricingHotRequest {

    /** 关联算法ID */
    @NotNull(message = "关联算法不能为空")
    private Long algoId;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道 */
    private Integer channel;

    /** 预售天数（今天起 N 天可售），缺省 30 */
    @NotNull(message = "预售天数不能为空")
    private Integer presaleDays;

    /** 退款开关: 1=允许退款 2=不允许 */
    private Integer refundEnabled;

    /** 多格梯度折扣: [{"minDays":3,"discount":95},{"minDays":7,"discount":90}]（按购买格子数匹配） */
    private List<Map<String, Object>> discountTiers;

    /** 取消扣费梯度: [{"remainDays":0,"ratio":100},{"remainDays":3,"ratio":80}] */
    private List<Map<String, Object>> cancelFeeTiers;

    /** 屏蔽商家开关: 1=启用 2=关闭 */
    private Integer blockMerchant;

    /** 屏蔽商家列表 */
    private List<Map<String, Object>> blockList;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 皮肤计价配置（整体替换, 定价界面自定义皮肤） */
    @NotEmpty(message = "请至少配置一个皮肤")
    private List<SkinPrice> skins;

    /** 皮肤计价条目 */
    @Data
    public static class SkinPrice {
        /** 皮肤名称 */
        private String skinName;
        /** 皮肤日单价（MOP） */
        private BigDecimal price;
        /** 边框方式: none=无边框 color=选择配色 image=上传边框图 */
        private String borderType;
        /** 边框颜色(HEX, borderType=color时生效) */
        private String borderColor;
    }
}
