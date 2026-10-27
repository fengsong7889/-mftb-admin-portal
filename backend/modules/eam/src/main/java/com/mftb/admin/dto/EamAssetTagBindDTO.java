package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产绑定标签请求
 */
@Data
public class EamAssetTagBindDTO {

    /** 标签模板ID */
    private Long tagId;

    /** 是否设为主标签（null 时由后端决定：无主标签则自动设主） */
    private Boolean isPrimary;
}
