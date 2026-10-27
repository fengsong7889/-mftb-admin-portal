package com.mftb.admin.dto;

import lombok.Data;

/**
 * 系统配置值更新请求
 */
@Data
public class SysConfigUpdateDTO {

    /** 配置值 */
    private String value;
}
