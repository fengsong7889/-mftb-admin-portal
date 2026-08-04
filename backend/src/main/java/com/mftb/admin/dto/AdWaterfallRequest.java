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
    @NotBlank(message = "瀑布流名称不能为空")
    private String strategyName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 自然流量兜底算法ID（未配置坑位统一读取该算法数据） */
    private Long naturalAlgoId;

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
        @NotNull(message = "坑位序号不能为空")
        private Integer slotPosition;
        /** 算法ID（biz_ad_algorithm.id） */
        @NotNull(message = "坑位算法不能为空")
        private Long algoId;
        /** 坑位状态: 1=启用 2=停用 */
        private Integer status;
    }
}
