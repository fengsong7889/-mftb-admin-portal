package com.mftb.admin.dto;

import com.mftb.admin.entity.AdWaterfall;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 瀑布流策略展示 VO（含坑位明细）
 * id 即配置ID，APP 按该 ID 引用本条配置渲染瀑布流
 */
@Data
public class AdWaterfallVO {

    private Long id;
    /** 策略编号（按编号生成规则 config_waterfall 生成，如 PB20260812000） */
    private String strategyCode;
    private String strategyName;
    private String brand;
    /** 自然流量兜底算法编码（未配置坑位读取该算法数据） */
    private String naturalAlgoId;
    private String naturalAlgoName;
    /** 业务线: 1=外卖到家 2=团购到店 */
    private Integer businessType;
    /** 展示维度: 1=门店 2=商品 */
    private Integer contentType;
    /** 展示类目数据来源: algorithm/category/custom */
    private String displayCategoryMode;
    /** 展示布局: 1=单列 2=双列 */
    private Integer layoutColumns;
    /** 外卖业务频道 food/supermarket；团购固定 groupBuy */
    private String bizChannel;
    /** 类目候选排序 */
    private String sortMode;
    /** 类目兜底ID列表（由 JSON 列解析） */
    private List<String> fallbackCategoryIds;
    /** 固定展示内容坑位（由 JSON 列解析，custom模式） */
    private List<FixedSlotItem> fixedSlots;
    /** 过滤用户不喜欢: 1=开启 2=关闭 */
    private Integer filterDislike;
    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 坑位明细（按坑位序号升序） */
    private List<SlotItem> slots = new ArrayList<>();

    public static AdWaterfallVO from(AdWaterfall entity) {
        AdWaterfallVO vo = new AdWaterfallVO();
        vo.setId(entity.getId());
        vo.setStrategyCode(entity.getStrategyCode());
        vo.setStrategyName(entity.getStrategyName());
        vo.setBrand(entity.getBrand());
        vo.setNaturalAlgoId(entity.getNaturalAlgoId());
        vo.setNaturalAlgoName(entity.getNaturalAlgoName());
        vo.setBusinessType(entity.getBusinessType() == null ? 1 : entity.getBusinessType());
        vo.setContentType(entity.getContentType() == null ? 1 : entity.getContentType());
        vo.setDisplayCategoryMode(entity.getDisplayCategoryMode());
        vo.setLayoutColumns(entity.getLayoutColumns() == null ? 1 : entity.getLayoutColumns());
        vo.setBizChannel(entity.getBizChannel());
        vo.setSortMode(entity.getSortMode());
        vo.setFilterDislike(entity.getFilterDislike());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    /** 坑位明细条目 */
    @Data
    public static class SlotItem {
        private Long id;
        private Integer slotPosition;
        private String algoId;
        private String algoName;
        private Integer algoType;
        private Integer status;
    }

    /** 固定展示内容坑位条目 */
    @Data
    public static class FixedSlotItem {
        private Integer slotPosition;
        private String itemId;
        private String itemName;
        private String categoryId;
        private String categoryName;
        private Integer stock;
        private Integer status;
    }
}
