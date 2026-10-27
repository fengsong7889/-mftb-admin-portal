package com.mftb.admin.dto;

import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

import java.util.List;

/**
 * 閱讀統計看板響應：概覽 + 按文檔聚合行。
 * <p>口徑統一為 doc_view_log 在給定天數窗口內的聚合；已刪除文檔的留痕不進聚合
 * （索引沒了，讀數沒有管理意義）。
 */
@Data
public class DocViewStatsVO {

    /** 期間內總閱讀次數 */
    private long totalViews;

    /** 期間內閱讀人數（全局去重） */
    private long totalReaders;

    /** 期間內被閱讀的文檔數 */
    private int docCount;

    /** 期間內平均停留秒（不含未上報時長的記錄） */
    private Integer avgDurationSec;

    private List<Row> rows;

    /** 按文檔聚合行（標題/空間為當前索引快照，便於直接渲染與跳轉） */
    @Data
    public static class Row {

        private Long nodeId;
        private String title;
        private Long spaceId;
        private String spaceName;
        private long viewCount;
        private long readerCount;
        private Integer avgDurationSec;
        private String lastViewedAt;

        public static Row of(DocViewStatRow r, String title, Long spaceId, String spaceName) {
            Row row = new Row();
            row.setNodeId(r.getNodeId());
            row.setTitle(title);
            row.setSpaceId(spaceId);
            row.setSpaceName(spaceName);
            row.setViewCount(r.getViewCount() == null ? 0 : r.getViewCount());
            row.setReaderCount(r.getReaderCount() == null ? 0 : r.getReaderCount());
            row.setAvgDurationSec(r.getAvgDurationSec() == null ? null : (int) Math.round(r.getAvgDurationSec()));
            row.setLastViewedAt(DateTimeUtils.format(r.getLastViewedAt()));
            return row;
        }
    }
}
