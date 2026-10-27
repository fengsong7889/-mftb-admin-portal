package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 文檔元數據索引實體。
 * <p>正文單一事實源在騰訊文檔側，本表只存索引與閱讀出口（tencent_url）；
 * 嚴禁把文檔正文同步進本庫（雙事實源必然漂移）。
 */
@Data
@TableName("doc_node")
public class DocNode {

    @TableId
    private Long id;

    /** 所屬空間 ID */
    private Long spaceId;

    /** 文檔分類 */
    private String category;

    /** 文檔標題 */
    private String title;

    /** 類型：1=在線文檔 2=表格 3=幻燈片 4=PDF 5=外部鏈接 */
    private Integer docType;

    /** 狀態：1=草稿 2=評審中 3=已發布 4=已歸檔 */
    private Integer status;

    /** 標籤（逗號分隔） */
    private String tags;

    /** 負責人用戶 ID */
    private Long ownerUserId;

    /** 負責人姓名（冗餘快照） */
    private String ownerName;

    /** 騰訊文檔 fileID（目錄同步寫入；手工登記為空） */
    private String tencentFileId;

    /** 騰訊文檔鏈接（閱讀出口） */
    private String tencentUrl;

    /** 業務掛接類型：REQ=產研交付需求單 */
    private String bizType;

    /** 業務掛接 ID */
    private Long bizId;

    /** 文檔摘要 */
    private String summary;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
