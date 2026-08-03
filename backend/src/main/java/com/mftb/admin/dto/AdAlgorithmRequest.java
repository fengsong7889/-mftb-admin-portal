package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.Map;

/**
 * 算法新增/编辑请求
 */
@Data
public class AdAlgorithmRequest {

    /** 算法名称 */
    @NotBlank(message = "算法名称不能为空")
    private String algoName;

    /** 算法类型: 1=无敌星星 ... */
    @NotNull(message = "算法类型不能为空")
    private Integer algoType;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 业务频道: 1=大首页 2=外卖频道 3=超市百货 4=团购到店 */
    private Integer channel;

    /** 投放界面: 1=大首页-Feed 2=外卖频道-Feed 3=超市频道-Feed 4=团购频道-Feed */
    private Integer placementInterface;

    /** 坑位数 */
    private Integer slotCount;

    /** 各算法差异化参数（整体 JSON 对象） */
    private Map<String, Object> params;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;
}
