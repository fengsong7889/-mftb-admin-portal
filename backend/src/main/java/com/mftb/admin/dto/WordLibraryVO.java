package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 词库响应 VO
 */
@Data
public class WordLibraryVO {

    private Long id;

    /** 词条 */
    private String word;

    /** 所属频道 */
    private String channel;

    /** 状态: 1=啟用 2=停用 */
    private Integer status;

    /** 匹配次数 */
    private Integer matchCount;

    /** 最后更新人 */
    private String updatedBy;

    /** 最后更新时间 */
    private String updateTime;

    /** 备注 */
    private String remark;
}
