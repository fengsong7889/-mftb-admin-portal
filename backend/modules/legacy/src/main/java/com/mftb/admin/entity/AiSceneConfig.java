package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 业务 AI 场景开关（试点：会议 AI 整理纪要）。
 * <p>scene_key 为主键，系统归属/名称由服务端固定场景注册信息提供，不接受客户端修改；
 * version 为乐观锁，保存走 {@code WHERE scene_key=? AND version=?} 条件更新。
 * <p>缺行、非法状态或读取失败一律阻断 AI 调用（默认拒绝），因此读取端不能把 null 当启用。
 */
@Data
@TableName("ai_scene_config")
public class AiSceneConfig {
    @TableId(type = IdType.INPUT)
    private String sceneKey;
    /** 1=启用 0=停用 */
    private Integer enabled;
    /** 乐观锁版本，新建为 0，每次成功保存 +1 */
    private Long version;
    private String reason;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
