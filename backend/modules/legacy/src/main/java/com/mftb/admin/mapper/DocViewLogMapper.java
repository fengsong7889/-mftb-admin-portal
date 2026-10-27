package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.dto.DocViewStatRow;
import com.mftb.admin.entity.DocViewLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/** 文檔查閱留痕 Mapper */
@Mapper
public interface DocViewLogMapper extends BaseMapper<DocViewLog> {

    /** 期間內按文檔聚合：次數/去重人數/平均停留/最近閱讀（P2 閱讀統計口徑） */
    @Select("SELECT node_id AS nodeId, COUNT(*) AS viewCount, "
            + "COUNT(DISTINCT user_id) AS readerCount, AVG(duration_sec) AS avgDurationSec, "
            + "MAX(viewed_at) AS lastViewedAt FROM doc_view_log WHERE viewed_at >= #{since} "
            + "GROUP BY node_id ORDER BY viewCount DESC")
    List<DocViewStatRow> aggregateSince(@Param("since") LocalDateTime since);

    /** 期間內全局去重閱讀人數 */
    @Select("SELECT COUNT(DISTINCT user_id) FROM doc_view_log WHERE viewed_at >= #{since}")
    Long countDistinctReadersSince(@Param("since") LocalDateTime since);

    /** 期間內全局平均停留秒（未上報時長的記錄不參與） */
    @Select("SELECT AVG(duration_sec) FROM doc_view_log WHERE viewed_at >= #{since} AND duration_sec IS NOT NULL")
    Double avgDurationSince(@Param("since") LocalDateTime since);
}
