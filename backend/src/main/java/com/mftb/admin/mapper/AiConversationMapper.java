package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiConversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** AI 助手会话实体 Mapper */
@Mapper
public interface AiConversationMapper extends BaseMapper<AiConversation> {

    /**
     * 审计专用：分页查询所有会话（含已软删除的记录）
     * 过滤掉无对话数据的空会话（messages 为空数组 '[]' 或 NULL）
     * LEFT JOIN sys_user 获取员工姓名；keyword 支持按工号或姓名模糊搜索
     */
    @Select({"<script>",
            "SELECT a.*, u.name AS empName FROM ai_conversation a",
            "LEFT JOIN sys_user u ON a.username = u.emp_id AND u.deleted = 0",
            "<where>",
            "AND a.messages IS NOT NULL AND a.messages != '[]'",
            "<if test='keyword != null and keyword != &quot;&quot;'> AND (a.username LIKE CONCAT('%', #{keyword}, '%') OR u.name LIKE CONCAT('%', #{keyword}, '%'))</if>",
            "<if test='modelKey != null and modelKey != &quot;&quot;'> AND a.model_key = #{modelKey}</if>",
            "<if test='status != null'> AND a.deleted = #{status}</if>",
            "<if test='createStartDate != null and createStartDate != &quot;&quot;'> AND a.created_at &gt;= #{createStartDate}</if>",
            "<if test='createEndDate != null and createEndDate != &quot;&quot;'> AND a.created_at &lt; DATE_ADD(#{createEndDate}, INTERVAL 1 DAY)</if>",
            "<if test='updateStartDate != null and updateStartDate != &quot;&quot;'> AND a.updated_at &gt;= #{updateStartDate}</if>",
            "<if test='updateEndDate != null and updateEndDate != &quot;&quot;'> AND a.updated_at &lt; DATE_ADD(#{updateEndDate}, INTERVAL 1 DAY)</if>",
            "</where>",
            " ORDER BY a.created_at DESC",
            "</script>"})
    Page<AiConversation> selectPageForAudit(Page<AiConversation> page,
                                            @Param("keyword") String keyword,
                                            @Param("modelKey") String modelKey,
                                            @Param("status") Integer status,
                                            @Param("createStartDate") String createStartDate,
                                            @Param("createEndDate") String createEndDate,
                                            @Param("updateStartDate") String updateStartDate,
                                            @Param("updateEndDate") String updateEndDate);

    /**
     * 审计专用：查询所有已使用过的模型标识（含已删除记录，仅含有实际对话数据的会话）
     */
    @Select("SELECT DISTINCT model_key FROM ai_conversation WHERE model_key IS NOT NULL AND model_key != '' AND messages IS NOT NULL AND messages != '[]' ORDER BY model_key")
    List<String> selectModelKeysForAudit();

    /**
     * 审计专用：按 ID 查询单条会话（绕过 @TableLogic，含所有状态）
     * LEFT JOIN sys_user 获取员工姓名
     */
    @Select("SELECT a.*, u.name AS empName FROM ai_conversation a LEFT JOIN sys_user u ON a.username = u.emp_id AND u.deleted = 0 WHERE a.id = #{id}")
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
     * 软删并记录删除时间戳（替代 deleteById 以同时设置 deleted_at）
     */
    @Update("UPDATE ai_conversation SET deleted = 1, deleted_at = NOW() WHERE id = #{id} AND username = #{username} AND deleted = 0")
    int softDeleteById(@Param("id") Long id, @Param("username") String username);

    /**
     * 记一次 AI 问答回合：回填实际使用的模型并累加请求次数。
     * <p>为什么由服务端写而不靠前端 PUT：对话保存接口从来没传 model_key/request_count，
     * 导致审计页两列永远显示 {@code --}，管理员无从知道会话跑的是哪个模型、发生了多少次调用。
     * 口径：tokens 仍由前端累计回写（避免两边互相覆盖），本语句只动 model_key / request_count。
     * <p>归属限制：{@code username} 必须匹配，前端伪造别人的 conversationPk 不会污染他人会话。
     */
    @Update("UPDATE ai_conversation SET model_key = #{modelKey}, request_count = COALESCE(request_count, 0) + 1, "
            + "updated_at = NOW() WHERE id = #{id} AND username = #{username} AND deleted = 0")
    int recordAgentTurn(@Param("id") Long id, @Param("username") String username, @Param("modelKey") String modelKey);
}
