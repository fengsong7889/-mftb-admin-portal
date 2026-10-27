package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 學習路徑詳情 VO：路徑信息 + 有序條目（每條附文檔快照、本人已讀標記與全局閱讀人數）。
 * <p>「已讀」口徑：該文檔存在本人的打開留痕（doc_view_log 詳情頁打開即寫入），
 * 不另建進度表——雙寫必然漂移，留痕是既有的事實源。
 */
@Data
public class DocLearningPathDetailVO {

    private Long id;
    private String name;
    private String description;
    private Integer status;
    private String updatedAt;
    private List<Item> items;

    @Data
    public static class Item {

        private Long nodeId;
        private String title;
        private String spaceName;
        private Integer docType;
        private String docTypeLabel;
        private Integer status;
        private String statusLabel;
        /** 本人是否已讀 */
        private boolean myRead;
        /** 全局去重閱讀人數（管理側判斷培訓覆蓋面） */
        private long readerCount;
    }
}
