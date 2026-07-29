package com.mftb.admin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 搜索下拉框选项
 */
@Data
@AllArgsConstructor
public class OptionVO {

    /** 选项值（提交给查询接口的值） */
    private String value;

    /** 选项展示文案 */
    private String label;

    /** 值与展示文案相同的选项（如最后更新人） */
    public static OptionVO of(String value) {
        return new OptionVO(value, value);
    }
}
