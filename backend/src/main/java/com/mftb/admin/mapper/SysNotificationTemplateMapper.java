package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysNotificationTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 通知模板 Mapper：按场景一行，读多写少（每次发送读一次库，模板改动立即生效，不做进程内缓存）。 */
@Mapper
public interface SysNotificationTemplateMapper extends BaseMapper<SysNotificationTemplate> {

    @Select("SELECT * FROM sys_notification_template ORDER BY scene_key")
    List<SysNotificationTemplate> findAll();

    @Select("SELECT * FROM sys_notification_template WHERE scene_key = #{sceneKey} LIMIT 1")
    SysNotificationTemplate findByScene(@Param("sceneKey") String sceneKey);
}
