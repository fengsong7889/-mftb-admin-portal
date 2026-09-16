package com.mftb.admin.dto;

import lombok.Data;

/**
 * 归还遗失找回请求 DTO
 */
@Data
public class EamReturnRecoverDTO {
    /** 归还记录 ID */
    private Long returnId;
    /** 找回说明 */
    private String recoveredNote;
}
