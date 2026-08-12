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
    /** 自然流量兜底算法ID（未配置坑位读取该算法数据） */
    private Long naturalAlgoId;
    private String naturalAlgoName;
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
        private Long algoId;
        private String algoName;
        private Integer algoType;
        private Integer status;
    }
}
