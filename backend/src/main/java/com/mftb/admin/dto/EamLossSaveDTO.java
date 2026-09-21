package com.mftb.admin.dto;

import lombok.Data;

/**
 * 主动报失保存 DTO（新建/编辑遗失单）
 */
@Data
public class EamLossSaveDTO {

    /** 编辑时传入 ID；新建时为空 */
    private Long id;

    /** 资产 ID（主动报失必填） */
    private Long assetId;

    /** 来源类型：claim/borrow/return/direct（前端不传，后端推断） */
    private String sourceType;

    /** 来源 ID */
    private Long sourceId;

    /** 遗失日期 yyyy-MM-dd */
    private String lossDate;

    /** 报失原因 */
    private String lossReason;

    /** 最后已知位置 */
    private String lastKnownLocation;

    /** 修改原因（编辑时必填） */
    private String changeReason;

    /** 幂等请求键（直接报失防重，可空） */
    private String requestKey;
}
