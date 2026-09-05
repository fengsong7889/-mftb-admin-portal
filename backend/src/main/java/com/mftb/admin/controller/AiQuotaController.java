package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.dto.AiQuotaDTO;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.service.AiMyCenterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * AI 配额管理控制器
 */
@RestController
@RequestMapping("/api/ai/quota")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 配额管理", description = "部门/员工配额管理接口")
public class AiQuotaController {

    /** 部门额度菜单标识 */
    private static final String MENU_DEPT = "ai-dept-quota";
    /** 员工额度菜单标识 */
    private static final String MENU_EMP = "ai-emp-quota";
    /** 配额管理（二级目录）菜单标识，用于部门/员工共用的删除接口 */
    private static final String MENU_QUOTA_MANAGE = "ai-quota-manage";

    private final AiQuotaConfigMapper quotaMapper;
    private final JdbcTemplate jdbcTemplate;
    private final AiMyCenterService myCenterService;

    /**
     * 查询当前账号的额度维度与真实用量（首页「我的用量」数据源）
     */
    @GetMapping("/my")
    @Operation(summary = "查询我的额度维度与用量")
    public Result<AiMyCenterDTO.MyQuotaUsageVO> myQuotaUsage() {
        AiMyCenterDTO.MyQuotaUsageVO vo = myCenterService.myQuotaUsage();
        return vo != null ? Result.success(vo) : Result.error(ResultCode.UNAUTHORIZED);
    }

    /**
     * 查询部门配额列表
     */
    @GetMapping("/departments")
    @Operation(summary = "查询部门配额列表")
    @RequirePermission(menu = MENU_DEPT)
    public Result<List<AiQuotaDTO.QuotaVO>> listDeptQuotas(@RequestBody(required = false) 
                                                            AiQuotaDTO.DeptQuotaQueryRequest query) {
        String sql = """
            SELECT q.id, q.quota_type, q.target_id, d.name AS target_name,
                   q.model_id, m.name AS model_name,
                   q.daily_quota, q.monthly_quota,
                   COALESCE(q.used_today, 0) AS used_today,
                   COALESCE(q.used_month, 0) AS used_month,
                   q.auto_reset, q.reset_day_of_month,
                   q.created_at, q.updated_at
            FROM ai_quota_config q
            LEFT JOIN sys_department d ON q.target_id = d.id AND d.deleted = 0
            LEFT JOIN ai_model m ON q.model_id = m.id AND m.deleted = 0
            WHERE q.quota_type = 'department' AND q.deleted = 0
        """;
        
        List<Object> params = new java.util.ArrayList<>();
        
        if (query != null) {
            if (query.getDepartmentId() != null) {
                sql += " AND q.target_id = ?";
                params.add(query.getDepartmentId());
            }
            if (query.getName() != null && !query.getName().trim().isEmpty()) {
                sql += " AND d.name LIKE ?";
                params.add("%" + query.getName() + "%");
            }
        }
        
        sql += " ORDER BY q.id ASC";
        
        List<AiQuotaDTO.QuotaVO> results = jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
            AiQuotaDTO.QuotaVO vo = new AiQuotaDTO.QuotaVO();
            vo.setId(rs.getLong("id"));
            vo.setQuotaType(rs.getString("quota_type"));
            vo.setTargetId(rs.getLong("target_id"));
            vo.setTargetName(rs.getString("target_name"));
            vo.setModelId(rs.getLong("model_id"));
            vo.setModelName(rs.getString("model_name"));
            vo.setDailyQuota(rs.getInt("daily_quota"));
            vo.setMonthlyQuota(rs.getInt("monthly_quota"));
            vo.setUsedToday(rs.getLong("used_today"));
            vo.setUsedMonth(rs.getLong("used_month"));
            vo.setHasLimit(rs.getInt("daily_quota") > 0 || rs.getInt("monthly_quota") > 0);
            vo.setAutoReset(rs.getInt("auto_reset"));
            vo.setResetDayOfMonth(rs.getInt("reset_day_of_month"));
            vo.setCreatedAt(rs.getString("created_at"));
            vo.setUpdatedAt(rs.getString("updated_at"));
            return vo;
        });
        
        return Result.success(results);
    }

    /**
     * 查询员工配额列表
     */
    @GetMapping("/employees")
    @Operation(summary = "查询员工配额列表")
    @RequirePermission(menu = MENU_EMP)
    public Result<List<AiQuotaDTO.QuotaVO>> listEmpQuotas(@RequestBody(required = false) 
                                                           AiQuotaDTO.EmpQuotaQueryRequest query) {
        String sql = """
            SELECT q.id, q.quota_type, q.target_id, CONCAT(u.emp_id, ' ', u.name) AS target_name,
                   q.model_id, m.name AS model_name,
                   q.daily_quota, q.monthly_quota,
                   COALESCE(q.used_today, 0) AS used_today,
                   COALESCE(q.used_month, 0) AS used_month,
                   q.auto_reset, q.reset_day_of_month,
                   q.created_at, q.updated_at
            FROM ai_quota_config q
            LEFT JOIN sys_user u ON q.target_id = u.id AND u.deleted = 0
            LEFT JOIN ai_model m ON q.model_id = m.id AND m.deleted = 0
            WHERE q.quota_type = 'employee' AND q.deleted = 0
        """;
        
        List<Object> params = new java.util.ArrayList<>();
        
        if (query != null) {
            if (query.getEmployeeId() != null) {
                sql += " AND q.target_id = ?";
                params.add(query.getEmployeeId());
            }
            if (query.getEmpId() != null && !query.getEmpId().trim().isEmpty()) {
                sql += " AND u.emp_id = ?";
                params.add(query.getEmpId());
            }
            if (query.getName() != null && !query.getName().trim().isEmpty()) {
                sql += " AND u.name LIKE ?";
                params.add("%" + query.getName() + "%");
            }
        }
        
        sql += " ORDER BY u.name ASC, q.id ASC";
        
        List<AiQuotaDTO.QuotaVO> results = jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
            AiQuotaDTO.QuotaVO vo = new AiQuotaDTO.QuotaVO();
            vo.setId(rs.getLong("id"));
            vo.setQuotaType(rs.getString("quota_type"));
            vo.setTargetId(rs.getLong("target_id"));
            vo.setTargetName(rs.getString("target_name"));
            vo.setModelId(rs.getLong("model_id"));
            vo.setModelName(rs.getString("model_name"));
            vo.setDailyQuota(rs.getInt("daily_quota"));
            vo.setMonthlyQuota(rs.getInt("monthly_quota"));
            vo.setUsedToday(rs.getLong("used_today"));
            vo.setUsedMonth(rs.getLong("used_month"));
            vo.setHasLimit(rs.getInt("daily_quota") > 0 || rs.getInt("monthly_quota") > 0);
            vo.setAutoReset(rs.getInt("auto_reset"));
            vo.setResetDayOfMonth(rs.getInt("reset_day_of_month"));
            vo.setCreatedAt(rs.getString("created_at"));
            vo.setUpdatedAt(rs.getString("updated_at"));
            return vo;
        });
        
        return Result.success(results);
    }

    /**
     * 设置部门配额（批量）
     */
    @PostMapping("/departments")
    @Operation(summary = "批量设置部门配额")
    @RequirePermission(menu = MENU_DEPT, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> batchSetDeptQuotas(@Valid @RequestBody AiQuotaDTO.BatchQuotaRequest request) {
        for (AiQuotaDTO.QuotaConfigRequest config : request.getQuotas()) {
                saveOrUpdateQuota(config);
        }
        return Result.success(true);
    }

    /**
     * 设置员工配额（批量）
     */
    @PostMapping("/employees")
    @Operation(summary = "批量设置员工配额")
    @RequirePermission(menu = MENU_EMP, action = "edit")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> batchSetEmpQuotas(@Valid @RequestBody AiQuotaDTO.BatchQuotaRequest request) {
        for (AiQuotaDTO.QuotaConfigRequest config : request.getQuotas()) {
            saveOrUpdateQuota(config);
        }
        return Result.success(true);
    }

    /**
     * 保存或更新配额配置
     */
    private void saveOrUpdateQuota(AiQuotaDTO.QuotaConfigRequest request) {
        // 检查是否已存在该配置的记录（modelId 为 null 时必须用 IS NULL 匹配，
        // 否则 eq(column, null) 生成 model_id = NULL 恒不命中，导致重复插入撞唯一键）
        LambdaQueryWrapper<AiQuotaConfig> dupWrapper = new LambdaQueryWrapper<AiQuotaConfig>()
            .eq(AiQuotaConfig::getQuotaType, request.getQuotaType())
            .eq(AiQuotaConfig::getTargetId, request.getTargetId());
        if (request.getModelId() != null) {
            dupWrapper.eq(AiQuotaConfig::getModelId, request.getModelId());
        } else {
            dupWrapper.isNull(AiQuotaConfig::getModelId);
        }
        AiQuotaConfig existing = quotaMapper.selectOne(dupWrapper);
        
        if (existing != null) {
            // 更新现有记录
            existing.setDailyQuota(request.getDailyQuota());
            existing.setMonthlyQuota(request.getMonthlyQuota());
            existing.setAutoReset(request.getAutoReset());
            existing.setResetDayOfMonth(request.getResetDayOfMonth());
            quotaMapper.updateById(existing);
        } else {
            // 新增记录
            AiQuotaConfig quota = new AiQuotaConfig();
            quota.setQuotaType(request.getQuotaType());
            quota.setTargetId(request.getTargetId());
            quota.setModelId(request.getModelId());
            quota.setDailyQuota(request.getDailyQuota());
            quota.setMonthlyQuota(request.getMonthlyQuota());
            quota.setAutoReset(request.getAutoReset() != null ? request.getAutoReset() : 1);
            quota.setResetDayOfMonth(request.getResetDayOfMonth() != null ? request.getResetDayOfMonth() : 1);
            quota.setStatus(1);
            quotaMapper.insert(quota);
        }
    }

    /**
     * 删除指定目标的配额配置
     */
    @DeleteMapping("/{type}/{targetId}")
    @Operation(summary = "删除目标配额配置")
    @RequirePermission(menu = MENU_QUOTA_MANAGE, action = "delete")
    @Transactional(rollbackFor = Exception.class)
    public Result<Boolean> deleteQuota(@PathVariable String type, @PathVariable Long targetId) {
        int deleted = quotaMapper.delete(
            new LambdaQueryWrapper<AiQuotaConfig>()
                .eq(AiQuotaConfig::getQuotaType, type)
                .eq(AiQuotaConfig::getTargetId, targetId)
        );
        
        return Result.success(deleted > 0);
    }
}
