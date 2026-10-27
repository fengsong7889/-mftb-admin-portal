package com.mftb.admin.dto;

import lombok.Data;

/** 文檔庫統計 VO（口徑跟隨列表搜索條件，與 §E.8 統計卡約束一致） */
@Data
public class DocStatsVO {

    /** 命中文檔總數 */
    private int total;

    /** 已發布數 */
    private int published;

    /** 本月更新數 */
    private int updatedThisMonth;

    /** 已關聯需求單數 */
    private int linkedReq;
}
