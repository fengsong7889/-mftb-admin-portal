package com.mftb.admin.dto;

import lombok.Data;

/**
 * 状态切换请求（算法 / 各广告定价通用）
 */
@Data
public class StatusUpdateDTO {

    /** 目标状态: 1=启用 0=停用 */
    private Integer status;
}
