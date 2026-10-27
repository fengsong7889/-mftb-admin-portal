package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysNotificationSwitch;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 推送开关 Mapper：场景×渠道一行；没有行时按"开"处理（不因缺配置而静默吞掉通知）。 */
@Mapper
public interface SysNotificationSwitchMapper extends BaseMapper<SysNotificationSwitch> {

    @Select("SELECT * FROM sys_notification_switch ORDER BY scene_key, channel")
    List<SysNotificationSwitch> findAll();

    @Select("SELECT * FROM sys_notification_switch WHERE scene_key = #{sceneKey} AND channel = #{channel} LIMIT 1")
    SysNotificationSwitch findOne(@Param("sceneKey") String sceneKey, @Param("channel") String channel);
}
