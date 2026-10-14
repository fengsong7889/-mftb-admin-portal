package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingBlacklist;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Map;

/**
 * 预约黑名单 Mapper。
 *
 * <p>「是否仍在限制期」一律由 SQL 按日期判定（{@code end_date >= CURDATE()}）而不是读出来再在 Java 比：
 * 判定口径一旦有两份，就会出现列表页说已过期、预约接口照样拒绝（或反过来）的分裂结论。
 */
@Mapper
public interface MeetingBlacklistMapper extends BaseMapper<MeetingBlacklist> {

    /** 某人当前生效的限制记录（预约写入前的守卫查询；无则返回 null） */
    @Select("SELECT * FROM biz_meeting_blacklist WHERE deleted = 0 AND status = 'active' "
            + "AND user_id = #{userId} AND end_date >= CURDATE() ORDER BY end_date DESC LIMIT 1")
    MeetingBlacklist findActiveByUser(@Param("userId") long userId);

    /** 同一用户是否已有生效记录（手动加入前先给可读提示，别靠唯一键报错兜体验） */
    @Select("SELECT COUNT(*) FROM biz_meeting_blacklist WHERE deleted = 0 AND status = 'active' "
            + "AND user_id = #{userId} AND end_date >= CURDATE()")
    int countActiveByUser(@Param("userId") long userId);

    /**
     * 清单页统计卡：一行聚合同时要出“生效中 / 已到期 / 已撤销”，口径必须与列表同一组条件（AGENTS.md §E.8）。
     *
     * <p>已到期单独计一份：它与“已撤销”在业务上是两回事——一个是时间到了自动释放，
     * 一个是行政主动放人，混在一起就看不出当前治理力度。
     */
    @Select("<script>"
            + "SELECT COUNT(*) AS total, "
            + " SUM(status = 'active' AND end_date &gt;= CURDATE()) AS effective, "
            + " SUM(status = 'active' AND end_date &lt; CURDATE()) AS expired, "
            + " SUM(status = 'revoked') AS revoked "
            + "FROM biz_meeting_blacklist WHERE deleted = 0 "
            + "<if test='userId != null'> AND user_id = #{userId} </if>"
            + "<if test='source != null'> AND source = #{source} </if>"
            + "<if test='keyword != null'> AND (name LIKE #{keyword} OR emp_no LIKE #{keyword}) </if>"
            + "</script>")
    Map<String, Object> countByState(@Param("keyword") String keyword,
                                    @Param("userId") Long userId,
                                    @Param("source") String source);
}
