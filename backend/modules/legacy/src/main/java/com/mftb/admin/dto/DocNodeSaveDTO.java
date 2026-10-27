package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/** 文檔登記/編輯請求（tags 前端传数组，服务层逗号拼接落库） */
@Data
public class DocNodeSaveDTO {

    /** 所屬空間 ID */
    private Long spaceId;

    /** 文檔分類 */
    private String category;

    /** 文檔標題 */
    private String title;

    /** 類型：1~5，見 DocConstants */
    private Integer docType;

    /** 狀態：1~4，見 DocConstants */
    private Integer status;

    /** 騰訊文檔鏈接 */
    private String tencentUrl;

    /** 標籤列表 */
    private List<String> tags;

    /** 關聯需求單 ID（可空） */
    private Long bizId;

    /** 文檔摘要（可空） */
    private String summary;
}
