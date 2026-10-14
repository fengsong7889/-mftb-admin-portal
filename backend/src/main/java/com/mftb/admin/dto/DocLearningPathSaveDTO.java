package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/** 學習路徑保存請求（新增/編輯共用；items 為有序文檔 ID 清單，編輯時整體替換） */
@Data
public class DocLearningPathSaveDTO {

    /** 路徑名稱 */
    private String name;

    /** 路徑說明 */
    private String description;

    /** 1=啟用 0=停用 */
    private Integer status;

    /** 排序（小在前） */
    private Integer sortOrder;

    /** 有序文檔 ID 清單（讀取順序即清單順序） */
    private List<Long> items;
}
