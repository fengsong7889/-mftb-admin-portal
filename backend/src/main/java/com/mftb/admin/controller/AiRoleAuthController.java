package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiRoleModelMapping;
import com.mftb.admin.mapper.AiRoleModelMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色模型权限管理控制器
 */
@RestController
@RequestMapping("/api/ai/auth/roles")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 权限管理", description = "角色模型权限管理接口")
public class AiRoleAuthController {

    /** 本菜单标识（sys_menu.menu_key），员工模型权控页 */
    private static final String MENU = "ai-emp-model-auth";

    private final AiRoleModelMapper roleMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * 获取角色权限列表
     */
    @GetMapping
    @Operation(summary = "查询角色权限映射列表")
    @RequirePermission(menu = MENU)
    public Result<List<AiRoleAuthVO>> list(@RequestParam(required = false) Long roleId,
                                           @RequestParam(required = false) String name) {
        String sql = """
            SELECT r.id, r.code, r.name, m.model_id, m.model_key, m.name AS model_name,
                   rmm.permission_level, rmm.daily_limit, rmm.monthly_limit, rmm.priority,
                   rmm.status, rmm.created_at, rmm.updated_at
            FROM sys_role r
            LEFT JOIN ai_role_model_mapping rmm ON r.id = rmm.role_id AND rmm.deleted = 0
            LEFT JOIN ai_model m ON rmm.model_id = m.id AND m.deleted = 0
            WHERE r.deleted = 0
        """;
        
        List<Object> params = new ArrayList<>();
        
        if (roleId != null) {
            sql += " AND r.id = ?";
            params.add(roleId);
        }
        if (name != null && !name.trim().isEmpty()) {
            sql += " AND r.name LIKE ?";
            params.add("%" + name + "%");
        }
        
        sql += " ORDER BY r.sort_order ASC, rmm.priority DESC";
        
        return Result.success(jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
            AiRoleAuthVO vo = new AiRoleAuthVO();
            vo.setRoleId(rs.getLong("id"));
            vo.setCode(rs.getString("code"));
            vo.setRoleName(rs.getString("name"));
            
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
     * 批量设置角色模型权限
     */
    @PostMapping("/batch")
    @Operation(summary = "批量配置角色模型权限")
    @RequirePermission(menu = MENU, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> batchSetPermissions(@RequestBody BatchRoleAuthRequest request) {
        for (RoleBatchItem item : request.getItems()) {
            saveOrUpdateMapping(item.getRoleId(), item.getModelId(), 
                item.getPermissionLevel(), item.getDailyLimit(), 
                item.getMonthlyLimit(), item.getPriority());
        }
        return Result.success(true);
    }

    /**
     * 保存或更新角色权限映射
     */
    private void saveOrUpdateMapping(Long roleId, Long modelId, String permissionLevel, 
                                     Integer dailyLimit, Integer monthlyLimit, Integer priority) {
        AiRoleModelMapping existing = roleMapper.selectOne(
            new LambdaQueryWrapper<AiRoleModelMapping>()
                .eq(AiRoleModelMapping::getRoleId, roleId)
                .eq(AiRoleModelMapping::getModelId, modelId)
        );
        
        if (existing != null) {
            // 更新现有记录
            existing.setPermissionLevel(permissionLevel);
            existing.setDailyLimit(dailyLimit);
            existing.setMonthlyLimit(monthlyLimit);
            existing.setPriority(priority);
            roleMapper.updateById(existing);
        } else {
            // 新增记录
            AiRoleModelMapping mapping = new AiRoleModelMapping();
            mapping.setRoleId(roleId);
            mapping.setModelId(modelId);
            mapping.setPermissionLevel(permissionLevel);
            mapping.setDailyLimit(dailyLimit);
            mapping.setMonthlyLimit(monthlyLimit);
            mapping.setPriority(priority);
            mapping.setStatus(1);
            roleMapper.insert(mapping);
        }
    }

    /**
     * 删除角色模型权限映射
     */
    @DeleteMapping("/{roleId}/{modelId}")
    @Operation(summary = "删除角色模型权限映射")
    @RequirePermission(menu = MENU, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> deleteMapping(@PathVariable Long roleId, 
                                         @PathVariable Long modelId) {
        int deleted = roleMapper.delete(
            new LambdaQueryWrapper<AiRoleModelMapping>()
                .eq(AiRoleModelMapping::getRoleId, roleId)
                .eq(AiRoleModelMapping::getModelId, modelId)
        );
        return Result.success(deleted > 0);
    }
}

/**
 * 角色权限 VO
 */
class AiRoleAuthVO {
    private Long roleId;
    private String code;
    private String roleName;
    
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
    public Long getRoleId() { return roleId; }
    public void setRoleId(Long roleId) { this.roleId = roleId; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getRoleName() { return roleName; }
    public void setRoleName(String roleName) { this.roleName = roleName; }
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
class BatchRoleAuthRequest {
    private List<RoleBatchItem> items;
    
    public List<RoleBatchItem> getItems() { return items; }
    public void setItems(List<RoleBatchItem> items) { this.items = items; }
}

class RoleBatchItem {
    private Long roleId;
    private Long modelId;
    private String permissionLevel;
    private Integer dailyLimit;
    private Integer monthlyLimit;
    private Integer priority;
    
    public Long getRoleId() { return roleId; }
    public void setRoleId(Long roleId) { this.roleId = roleId; }
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
