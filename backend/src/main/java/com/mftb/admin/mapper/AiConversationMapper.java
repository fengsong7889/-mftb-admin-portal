package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiConversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface AiConversationMapper extends BaseMapper<AiConversation> {

    /**
     * 审计专用：分页查询所有会话（含已软删除的记录）
     * 使用 @Select 直接写 SQL，绕过 @TableLogic 的逻辑删除过滤
     */
    @Select({"<script>",
            "SELECT * FROM ai_conversation",
            "<where>",
            "<if test='username != null and username != &quot;&quot;'> AND username = #{username}</if>",
            "<if test='modelKey != null and modelKey != &quot;&quot;'> AND model_key = #{modelKey}</if>",
            "<if test='startDate != null and startDate != &quot;&quot;'> AND created_at &gt;= #{startDate}</if>",
            "<if test='endDate != null and endDate != &quot;&quot;'> AND created_at &lt;= #{endDate}</if>",
            "</where>",
            " ORDER BY created_at DESC",
            "</script>"})
    Page<AiConversation> selectPageForAudit(Page<AiConversation> page,
                                            @Param("username") String username,
                                            @Param("modelKey") String modelKey,
                                            @Param("startDate") String startDate,
                                            @Param("endDate") String endDate);

    /**
     * 审计专用：查询所有已使用过的模型标识（含已删除记录）
     */
    @Select("SELECT DISTINCT model_key FROM ai_conversation WHERE model_key IS NOT NULL AND model_key != '' ORDER BY model_key")
    List<String> selectModelKeysForAudit();

    /**
     * 审计专用：查询所有有会话的用户账号（含已删除记录）
     */
    @Select("SELECT DISTINCT username FROM ai_conversation WHERE username IS NOT NULL AND username != '' ORDER BY username")
    List<String> selectUsernamesForAudit();

    /**
     * 审计专用：按 ID 查询单条会话（绕过 @TableLogic，含所有状态）
     */
    @Select("SELECT * FROM ai_conversation WHERE id = #{id}")
    AiConversation selectByIdForAudit(@Param("id") Long id);

    /**
     * 回收站：查询当前用户已删除的对话（按删除时间倒序）
     */
    @Select("SELECT * FROM ai_conversation WHERE username = #{username} AND deleted = 1 ORDER BY deleted_at DESC")
    List<AiConversation> selectDeletedByUsername(@Param("username") String username);

    /**
     * 回收站：恢复对话（deleted=0, deleted_at=NULL）
     */
    @Update("UPDATE ai_conversation SET deleted = 0, deleted_at = NULL, updated_at = NOW() WHERE id = #{id} AND username = #{username} AND deleted = 1")
    int restoreById(@Param("id") Long id, @Param("username") String username);

    /**
     * 回收站：彻底删除（deleted=2，保留记录供审计追溯）
     */
    @Update("UPDATE ai_conversation SET deleted = 2, deleted_at = NOW() WHERE id = #{id} AND username = #{username} AND deleted = 1")
    int permanentDeleteById(@Param("id") Long id, @Param("username") String username);

    /**
     * 软删除并记录删除时间戳（替代 deleteById 以同时设置 deleted_at）
     */
    @Update("UPDATE ai_conversation SET deleted = 1, deleted_at = NOW() WHERE id = #{id} AND username = #{username} AND deleted = 0")
    int softDeleteById(@Param("id") Long id, @Param("username") String username);
}
