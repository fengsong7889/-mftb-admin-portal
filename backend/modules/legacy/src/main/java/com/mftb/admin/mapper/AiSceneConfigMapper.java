package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiSceneConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/** 业务 AI 场景开关读写。 */
@Mapper
public interface AiSceneConfigMapper extends BaseMapper<AiSceneConfig> {

    /**
     * 乐观锁条件更新：仅当版本仍等于读取时的 expectedVersion 才写入并把版本 +1。
     * <p>返回 0 表示他人已改，调用方据此返回 409，绝不覆盖。
     */
    @Update("UPDATE ai_scene_config SET enabled = #{enabled}, version = version + 1, reason = #{reason}, "
            + "updated_by = #{updatedBy}, updated_at = CURRENT_TIMESTAMP "
            + "WHERE scene_key = #{sceneKey} AND version = #{expectedVersion}")
    int updateWithVersion(@Param("sceneKey") String sceneKey, @Param("enabled") int enabled,
                          @Param("reason") String reason, @Param("updatedBy") Long updatedBy,
                          @Param("expectedVersion") long expectedVersion);
}
