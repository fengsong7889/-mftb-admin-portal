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
    /** 接收管理部门（找回后归位用，空则保持原归属部门） */
    private String receiveDepartment;
    /** 归还位置 ID（空则保持原位置） */
    private Long receiveLocationId;
}
