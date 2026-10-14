package com.mftb.admin.dto;

import lombok.Data;

/** 文檔空間保存請求（新增/編輯共用） */
@Data
public class DocSpaceSaveDTO {

    /** 空間名稱 */
    private String name;

    /** 空間圖標（emoji） */
    private String icon;

    /** 排序（小在前） */
    private Integer sortOrder;

    /** 空間說明 */
    private String description;
}
