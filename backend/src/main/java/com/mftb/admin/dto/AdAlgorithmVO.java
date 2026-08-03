package com.mftb.admin.dto;

import com.mftb.admin.entity.AdAlgorithm;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 算法展示 VO
 */
@Data
public class AdAlgorithmVO {

    private Long id;
    private String algoCode;
    private String algoName;
    private Integer algoType;
    private String brand;
    private Integer channel;
    private Integer placementInterface;
    private Integer slotCount;
    /** 差异化参数 JSON 字符串（前端自行解析） */
    private String params;
    private Integer status;
    private String remark;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static AdAlgorithmVO from(AdAlgorithm entity) {
        AdAlgorithmVO vo = new AdAlgorithmVO();
        vo.setId(entity.getId());
        vo.setAlgoCode(entity.getAlgoCode());
        vo.setAlgoName(entity.getAlgoName());
        vo.setAlgoType(entity.getAlgoType());
        vo.setBrand(entity.getBrand());
        vo.setChannel(entity.getChannel());
        vo.setPlacementInterface(entity.getPlacementInterface());
        vo.setSlotCount(entity.getSlotCount());
        vo.setParams(entity.getParams());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
