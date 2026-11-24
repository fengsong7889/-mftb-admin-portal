package com.mftb.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 瀑布流策略新增/编辑请求
 * 坑位明细整体替换：一个坑位只能配置一种算法
 */
@Data
public class AdWaterfallRequest {

    /** 瀑布流名称 */
    @NotBlank(message = "瀑布流名稱不能為空")
    private String strategyName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 自然流量兜底算法编码（未配置坑位统一读取该算法数据） */
    private String naturalAlgoId;

    /** 业务线: 1=外卖到家(默认) 2=团购到店 */
    private Integer businessType;

    /** 展示维度: 1=门店(默认) 2=商品（仅团购到店可传2） */
    private Integer contentType;

    /** 展示类目数据来源: algorithm/category/custom */
    private String displayCategoryMode;

    /** 展示布局: 1=单列 2=双列 */
    private Integer layoutColumns;

    /** 外卖业务频道 food/supermarket；团购固定 groupBuy */
    private String bizChannel;

    /** 类目候选排序: score/sales/distance/random */
    private String sortMode;

    /** 类目兜底ID列表（category模式必填；商品维度算法模式也用它兜底） */
    private List<String> fallbackCategoryIds;

    /** 固定展示内容坑位（custom模式整体替换） */
    @Valid
    private List<FixedSlotItem> fixedSlots;

    /** 过滤用户不喜欢: 1=开启 2=关闭 */
    private Integer filterDislike;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 坑位配置（整体替换） */
    @Valid
    private List<SlotItem> slots;

    /** 坑位配置条目 */
    @Data
    public static class SlotItem {
        /** 坑位序号（从1开始，同一策略内唯一） */
        @NotNull(message = "坑位序號不能為空")
        private Integer slotPosition;
        /** 算法编码（biz_ad_algorithm.algo_code） */
        @NotBlank(message = "算法編碼不能為空")
        private String algoId;
        /** 坑位状态: 1=启用 2=停用 */
        private Integer status;
    }

    /** 固定展示内容坑位条目（团购/超市百货 custom 模式；内容为外部目录资源，不校验存在性） */
    @Data
    public static class FixedSlotItem {
        /** 坑位序号（从1开始，本列表内唯一） */
        @NotNull(message = "坑位序號不能為空")
        private Integer slotPosition;
        /** 外部资源ID（门店/商品编码） */
        @NotBlank(message = "內容編碼不能為空")
        private String itemId;
        /** 资源名称快照 */
        @NotBlank(message = "內容名稱不能為空")
        private String itemName;
        /** 分类ID/名称快照（可选，展示用） */
        private String categoryId;
        private String categoryName;
        /** 剩余库存快照（仅商品；null=不限） */
        private Integer stock;
        /** 坑位状态: 1=启用 2=停用 */
        private Integer status;
    }
}
