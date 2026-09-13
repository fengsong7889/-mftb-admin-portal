package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiQuotaDTO;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.service.AiQuotaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * AI 配额管理服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiQuotaServiceImpl implements AiQuotaService {

    private final AiQuotaConfigMapper quotaMapper;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public List<AiQuotaDTO.QuotaVO> listDeptQuotas(AiQuotaDTO.DeptQuotaQueryRequest query) {
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

        List<Object> params = new ArrayList<>();

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

        return jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
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
    }

    @Override
    public List<AiQuotaDTO.QuotaVO> listEmpQuotas(AiQuotaDTO.EmpQuotaQueryRequest query) {
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

        List<Object> params = new ArrayList<>();

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

        return jdbcTemplate.query(sql, params.toArray(), (rs, rowNum) -> {
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
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void batchSetDeptQuotas(AiQuotaDTO.BatchQuotaRequest request) {
        for (AiQuotaDTO.QuotaConfigRequest config : request.getQuotas()) {
            saveOrUpdateQuota(config);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void batchSetEmpQuotas(AiQuotaDTO.BatchQuotaRequest request) {
        for (AiQuotaDTO.QuotaConfigRequest config : request.getQuotas()) {
            saveOrUpdateQuota(config);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteQuota(String type, Long targetId) {
        int deleted = quotaMapper.delete(
            new LambdaQueryWrapper<AiQuotaConfig>()
                .eq(AiQuotaConfig::getQuotaType, type)
                .eq(AiQuotaConfig::getTargetId, targetId)
        );
        return deleted > 0;
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
}
