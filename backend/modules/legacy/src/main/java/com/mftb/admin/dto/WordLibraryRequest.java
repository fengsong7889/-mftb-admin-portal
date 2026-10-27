package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 词库新增/编辑请求
 */
@Data
public class WordLibraryRequest {

    /** 词条 */
    @NotBlank(message = "詞條不能為空")
    private String word;

    /** 所属频道: takeaway/supermarket/groupBuy */
    @NotBlank(message = "所屬頻道不能為空")
    private String channel;

    /** 状态: 1=启用 2=停用 */
    private Integer status;

    /** 备注 */
    private String remark;
}
