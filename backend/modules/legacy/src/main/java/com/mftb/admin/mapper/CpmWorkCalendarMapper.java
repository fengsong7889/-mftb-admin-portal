/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmWorkCalendar;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * 工时口径日历访问。
 *
 * <p>读取口径：全局名单（user_id=0）与本人名单一次取回，两者共同决定「某天算不算工作日」；
 * 只取本人那张会把法定假日漏掉，只取全局那张会让个人调休失效——都是半个真源。
 */
@Mapper
public interface CpmWorkCalendarMapper extends BaseMapper<CpmWorkCalendar> {

    @Select("SELECT * FROM biz_cpm_work_calendar WHERE deleted = 0 AND (user_id = 0 OR user_id = #{userId}) "
            + "AND work_date BETWEEN #{start} AND #{end} ORDER BY work_date ASC")
    List<CpmWorkCalendar> listRange(@Param("userId") long userId,
                                    @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Select("SELECT * FROM biz_cpm_work_calendar WHERE deleted = 0 AND user_id = #{userId} "
            + "AND work_date BETWEEN #{start} AND #{end}")
    List<CpmWorkCalendar> listOwnedRange(@Param("userId") long userId,
                                         @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Select("SELECT * FROM biz_cpm_work_calendar WHERE deleted = 0 AND user_id = #{userId} AND work_date = #{date}")
    CpmWorkCalendar selectOne(@Param("userId") long userId, @Param("date") LocalDate date);

    /**
     * 物理删除标记行。
     *
     * <p>这里刻意不用软删：同一天的口径只能有一条事实，软删行会长期占着
     * {@code uk_cpm_calendar_day} 之外的位置却仍被"当天有效名单"查询排除，
     * 而重新登记时又要靠 upsert 找回旧行——状态机比这张小表本身复杂。
     * 全局法定名单（user_id=0）只能由治理侧维护，使用侧接口传不进这个作用域。
     */
    @Delete("DELETE FROM biz_cpm_work_calendar WHERE id = #{id} AND user_id = #{userId}")
    int deleteOwned(@Param("id") long id, @Param("userId") long userId);

    @Select("SELECT COUNT(*) FROM biz_cpm_work_calendar WHERE deleted = 0 AND user_id = 0")
    int countGlobal();

    /**
     * 清空本人某一年的全部口径登记（不调全局名单）。
     *
     * <p>给一个批量端点而不是让前端循环调 N 次：用户点了「清空本年」就该是一次原子操作，
     * 拆成几十个请求会出现清到一半失败的中间态。
     */
    @Delete("DELETE FROM biz_cpm_work_calendar WHERE user_id = #{userId} "
            + "AND work_date >= #{start} AND work_date <= #{end}")
    int deleteOwnedYear(@Param("userId") long userId,
                        @Param("start") java.time.LocalDate start, @Param("end") java.time.LocalDate end);
}
