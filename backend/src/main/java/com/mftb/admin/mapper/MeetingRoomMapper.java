package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingRoom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** 会议室档案 Mapper */
@Mapper
public interface MeetingRoomMapper extends BaseMapper<MeetingRoom> {

    /**
     * 按 id 加行锁读取会议室。
     *
     * <p>所有"新建/改期/换房"的预约写入都必须先拿这把锁：同一间房的所有窗口占用判定
     * 只在锁边界内的当前读才可信，否则两个并发请求各自读到"没冲突"就会双双插入。
     */
    @Select("SELECT * FROM biz_meeting_room WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    MeetingRoom selectForUpdate(@Param("id") long id);

    /** 已启用的园区清单（筛选项数据源，避免前端硬编码园区名） */
    @Select("SELECT DISTINCT campus FROM biz_meeting_room "
            + "WHERE deleted = 0 AND campus <> '' ORDER BY campus")
    List<String> listCampuses();

    /** 指定园区下的楼栋清单 */
    @Select("SELECT DISTINCT building FROM biz_meeting_room "
            + "WHERE deleted = 0 AND campus = #{campus} AND building <> '' ORDER BY building")
    List<String> listBuildings(@Param("campus") String campus);

    /** 指定园区+楼栋下的楼层清单 */
    @Select("SELECT DISTINCT floor_code FROM biz_meeting_room "
            + "WHERE deleted = 0 AND campus = #{campus} AND building = #{building} "
            + "AND floor_code <> '' ORDER BY floor_code")
    List<String> listFloors(@Param("campus") String campus, @Param("building") String building);

    /**
     * 带版本比对逻辑删。
     *
     * <p>不用 {@code deleteById}：它不看版本，两个行政同时点删除时后一次会替前一次
     * 「抹掉一间自己没看过的房」。受影响 0 行由服务层解释为并发冲突。
     */
    @Update("UPDATE biz_meeting_room SET deleted = 1, version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND version = #{expectVersion} AND deleted = 0")
    int deleteVersioned(@Param("id") long id,
                        @Param("expectVersion") int expectVersion,
                        @Param("operator") String operator);
}
