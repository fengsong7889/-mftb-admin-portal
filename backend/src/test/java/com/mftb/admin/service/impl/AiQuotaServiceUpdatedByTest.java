package com.mftb.admin.service.impl;

import com.mftb.admin.dto.AiQuotaDTO;
import com.mftb.admin.entity.AiQuotaConfig;
import com.mftb.admin.mapper.AiQuotaConfigMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 员工专属/部门额度保存时的「最后更新人」写入：
 * 新增与编辑都必须记录当前操作人，否则列表无法追溯是谁改的额度。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiQuotaServiceUpdatedByTest {

    @Mock private AiQuotaConfigMapper quotaMapper;
    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private OperatorResolver operatorResolver;

    @InjectMocks private AiQuotaServiceImpl service;

    private AiQuotaDTO.BatchQuotaRequest request(Long modelId) {
        AiQuotaDTO.QuotaConfigRequest config = new AiQuotaDTO.QuotaConfigRequest();
        config.setQuotaType("employee");
        config.setTargetId(101L);
        config.setModelId(modelId);
        config.setMonthlyQuota(100_000);
        config.setAutoReset(1);
        config.setResetDayOfMonth(1);
        AiQuotaDTO.BatchQuotaRequest batch = new AiQuotaDTO.BatchQuotaRequest();
        batch.setQuotas(List.of(config));
        return batch;
    }

    @Test
    @DisplayName("编辑已有额度：落库带上当前操作人")
    void updateWritesOperator() {
        when(operatorResolver.currentOperatorName()).thenReturn("管理員");
        AiQuotaConfig existing = new AiQuotaConfig();
        existing.setId(9L);
        when(quotaMapper.selectOne(any())).thenReturn(existing);

        service.batchSetEmpQuotas(request(1L));

        ArgumentCaptor<AiQuotaConfig> captor = ArgumentCaptor.forClass(AiQuotaConfig.class);
        verify(quotaMapper).updateById(captor.capture());
        assertEquals("管理員", captor.getValue().getUpdatedBy());
    }

    @Test
    @DisplayName("新增额度：落库同样带当前操作人")
    void insertWritesOperator() {
        when(operatorResolver.currentOperatorName()).thenReturn("管理員");
        when(quotaMapper.selectOne(any())).thenReturn(null);

        service.batchSetEmpQuotas(request(1L));

        ArgumentCaptor<AiQuotaConfig> captor = ArgumentCaptor.forClass(AiQuotaConfig.class);
        verify(quotaMapper).insert(captor.capture());
        assertEquals("管理員", captor.getValue().getUpdatedBy());
    }

    @Test
    @DisplayName("列表查询 SQL 必须带出 updated_by")
    void listQuerySelectsUpdatedBy() {
        when(jdbcTemplate.query(anyString(), any(Object[].class), any(RowMapper.class))).thenReturn(List.of());

        service.listEmpQuotas(new AiQuotaDTO.EmpQuotaQueryRequest());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sqlCaptor.capture(), any(Object[].class), any(RowMapper.class));
        assertTrue(sqlCaptor.getValue().contains("q.updated_by"), "列表 SQL 未带 updated_by：" + sqlCaptor.getValue());
    }
}
