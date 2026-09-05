package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiPositionModelMapping;
import com.mftb.admin.mapper.AiPositionModelMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 职位模型权限管理控制器
 */
@RestController
@RequestMapping("/api/ai/auth/positions")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 权限管理", description = "职位模型权限管理接口")
public class AiPositionAuthController {

    /** 本菜单标识（sys_menu.menu_key），员工模型权控页 */
    private static final String MENU = "ai-emp-model-auth";

    private final AiPositionModelMapper positionMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * 获取职位权限列表
     */
    @GetMapping
    @Operation(summary = "查询职位权限映射列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiPositionAuthVO>> list(@RequestParam(required = false) Long positionId,
                                               @RequestParam(required = false) String name) {
        String sql = """
            SELECT p.id, p.position_key, p.name, m.model_id, m.model_key, m.name AS model_name,
                   mpm.permission_level, mpm.daily_limit, mpm.monthly_limit, mpm.priority,
                   mpm.status, mpm.created_at, mpm.updated_at
            FROM sys_position p
            LEFT JOIN ai_position_model_mapping mpm ON p.id = mpm.position_id AND mpm.deleted = 0
            LEFT JOIN ai_model m ON mpm.model_id = m.id AND m.deleted = 0
            WHERE p.deleted = 0
        """;
        
        List<Object> params = new ArrayList<>();
        
        if (positionId != null) {
            sql += " AND p.id = ?";
            params.add(positionId);
        }
        if (name != null && !name.trim().isEmpty()) {
            sql += " AND p.name LIKE ?";
            params.add("%" + name + "%");
        }
        
        sql += " ORDER BY p.sort_order ASC, mpm.priority DESC";
        
        return Result.success(jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
            AiPositionAuthVO vo = new AiPositionAuthVO();
            vo.setPositionId(rs.getLong("id"));
            vo.setPositionKey(rs.getString("position_key"));
            vo.setPositionName(rs.getString("name"));
            
            Long modelId = rs.getObject("model_id", Long.class);
            if (modelId != null) {
                vo.setModelId(modelId);
                vo.setModelKey(rs.getString("model_key"));
                vo.setModelName(rs.getString("model_name"));
            }
            
            vo.setPermissionLevel(rs.getString("permission_level"));
            vo.setDailyLimit(rs.getInt("daily_limit"));
            vo.setMonthlyLimit(rs.getInt("monthly_limit"));
            vo.setPriority(rs.getInt("priority"));
            vo.setStatus(rs.getInt("status"));
            vo.setCreatedAt(rs.getString("created_at"));
            vo.setUpdatedAt(rs.getString("updated_at"));
            return vo;
        }));
    }

    /**
     * 批量设置职位模型权限
     */
    @PostMapping("/batch")
    @Operation(summary = "批量配置职位模型权限")
    @RequirePermission(menu = MENU, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> batchSetPermissions(@Valid @RequestBody BatchPositionAuthRequest request) {
        for (PositionBatchItem item : request.getItems()) {
            saveOrUpdateMapping(item.getPositionId(), item.getModelId(), 
                item.getPermissionLevel(), item.getDailyLimit(), 
                item.getMonthlyLimit(), item.getPriority());
        }
        return Result.success(true);
    }

    /**
     * 保存或更新职位权限映射
     */
    private void saveOrUpdateMapping(Long positionId, Long modelId, String permissionLevel, 
                                     Integer dailyLimit, Integer monthlyLimit, Integer priority) {
        AiPositionModelMapping existing = positionMapper.selectOne(
            new LambdaQueryWrapper<AiPositionModelMapping>()
                .eq(AiPositionModelMapping::getPositionId, positionId)
                .eq(AiPositionModelMapping::getModelId, modelId)
        );
        
        if (existing != null) {
            // 更新现有记录
            existing.setPermissionLevel(permissionLevel);
            existing.setDailyLimit(dailyLimit);
            existing.setMonthlyLimit(monthlyLimit);
            existing.setPriority(priority);
            positionMapper.updateById(existing);
        } else {
            // 新增记录
            AiPositionModelMapping mapping = new AiPositionModelMapping();
            mapping.setPositionId(positionId);
            mapping.setModelId(modelId);
            mapping.setPermissionLevel(permissionLevel);
            mapping.setDailyLimit(dailyLimit);
            mapping.setMonthlyLimit(monthlyLimit);
            mapping.setPriority(priority);
            mapping.setStatus(1);
            positionMapper.insert(mapping);
        }
    }

    /**
     * 删除职位模型权限映射
     */
    @DeleteMapping("/{positionId}/{modelId}")
    @Operation(summary = "删除职位模型权限映射")
    @RequirePermission(menu = MENU, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> deleteMapping(@PathVariable Long positionId, 
                                         @PathVariable Long modelId) {
        int deleted = positionMapper.delete(
            new LambdaQueryWrapper<AiPositionModelMapping>()
                .eq(AiPositionModelMapping::getPositionId, positionId)
                .eq(AiPositionModelMapping::getModelId, modelId)
        );
        return Result.success(deleted > 0);
    }
}

/**
 * 职位权限 VO
 */
class AiPositionAuthVO {
    private Long positionId;
    private String positionKey;
    private String positionName;
    
    private Long modelId;
    private String modelKey;
    private String modelName;
    
    private String permissionLevel; // full/restricted/none
    private Integer dailyLimit;
    private Integer monthlyLimit;
    private Integer priority;
    private Integer status;
    private String createdAt;
    private String updatedAt;
    
    // Getters and Setters
    public Long getPositionId() { return positionId; }
    public void setPositionId(Long positionId) { this.positionId = positionId; }
    public String getPositionKey() { return positionKey; }
    public void setPositionKey(String positionKey) { this.positionKey = positionKey; }
    public String getPositionName() { return positionName; }
    public void setPositionName(String positionName) { this.positionName = positionName; }
    public Long getModelId() { return modelId; }
    public void setModelId(Long modelId) { this.modelId = modelId; }
    public String getModelKey() { return modelKey; }
    public void setModelKey(String modelKey) { this.modelKey = modelKey; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }
    public String getPermissionLevel() { return permissionLevel; }
    public void setPermissionLevel(String permissionLevel) { this.permissionLevel = permissionLevel; }
    public Integer getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(Integer dailyLimit) { this.dailyLimit = dailyLimit; }
    public Integer getMonthlyLimit() { return monthlyLimit; }
    public void setMonthlyLimit(Integer monthlyLimit) { this.monthlyLimit = monthlyLimit; }
    public Integer getPriority() { return priority; }
    public void setPriority(Integer priority) { this.priority = priority; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}

/**
 * 批量设置请求
 */
class BatchPositionAuthRequest {
    private List<PositionBatchItem> items;
    
    public List<PositionBatchItem> getItems() { return items; }
    public void setItems(List<PositionBatchItem> items) { this.items = items; }
}

class PositionBatchItem {
    private Long positionId;
    private Long modelId;
    private String permissionLevel;
    private Integer dailyLimit;
    private Integer monthlyLimit;
    private Integer priority;
    
    public Long getPositionId() { return positionId; }
    public void setPositionId(Long positionId) { this.positionId = positionId; }
    public Long getModelId() { return modelId; }
    public void setModelId(Long modelId) { this.modelId = modelId; }
    public String getPermissionLevel() { return permissionLevel; }
    public void setPermissionLevel(String permissionLevel) { this.permissionLevel = permissionLevel; }
    public Integer getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(Integer dailyLimit) { this.dailyLimit = dailyLimit; }
    public Integer getMonthlyLimit() { return monthlyLimit; }
    public void setMonthlyLimit(Integer monthlyLimit) { this.monthlyLimit = monthlyLimit; }
    public Integer getPriority() { return priority; }
    public void setPriority(Integer priority) { this.priority = priority; }
}
