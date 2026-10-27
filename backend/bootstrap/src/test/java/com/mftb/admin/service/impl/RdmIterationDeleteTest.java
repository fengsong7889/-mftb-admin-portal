package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 迭代删除（空迭代清理）回归。
 *
 * <p>需求与任务都以 {@code iteration_code} 挂接迭代，不是外键级联，所以删除前必须逐表计数：
 * 有需求拒绝、有任务拒绝、都没有才允许逻辑删除。
 */
@ExtendWith(MockitoExtension.class)
class RdmIterationDeleteTest {

    private static final Long ITERATION_ID = 1L;
    private static final String ITERATION_CODE = "SP202610001";

    @Mock
    private RdmIterationMapper iterationMapper;
    @Mock
    private JdbcTemplate jdbcTemplate;
    @Mock
    private OperatorResolver operatorResolver;
    @InjectMocks
    private RdmDeliveryServiceImpl service;

    private RdmIteration iteration() {
        RdmIteration iteration = new RdmIteration();
        iteration.setId(ITERATION_ID);
        iteration.setCode(ITERATION_CODE);
        iteration.setName("11月第一版迭代");
        return iteration;
    }

    @Test
    @DisplayName("迭代不存在時拒絕，不做空轉刪除")
    void rejectsMissingIteration() {
        assertThrows(BusinessException.class, () -> service.deleteIteration(ITERATION_ID));
        verify(iterationMapper, never()).deleteById(ITERATION_ID);
    }

    @Test
    @DisplayName("迭代下仍有需求時拒絕刪除")
    void rejectsWhenRequirementsExist() {
        when(iterationMapper.selectById(ITERATION_ID)).thenReturn(iteration());
        when(jdbcTemplate.queryForObject(contains("FROM rdm_requirement"), eq(Integer.class), eq(ITERATION_CODE)))
                .thenReturn(3);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteIteration(ITERATION_ID));
        assertTrue(ex.getMessage().contains("3 條需求"), ex.getMessage());
        verify(iterationMapper, never()).deleteById(ITERATION_ID);
    }

    @Test
    @DisplayName("迭代下仍有任務時拒絕刪除（防需求已刪、任務未刪的懸掛行）")
    void rejectsWhenTasksExist() {
        when(iterationMapper.selectById(ITERATION_ID)).thenReturn(iteration());
        when(jdbcTemplate.queryForObject(contains("FROM rdm_requirement"), eq(Integer.class), eq(ITERATION_CODE)))
                .thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM rdm_work_task"), eq(Integer.class), eq(ITERATION_CODE)))
                .thenReturn(2);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.deleteIteration(ITERATION_ID));
        assertTrue(ex.getMessage().contains("2 個任務"), ex.getMessage());
        verify(iterationMapper, never()).deleteById(ITERATION_ID);
    }

    @Test
    @DisplayName("空迭代可刪：無需求且無任務時執行邏輯刪除")
    void deletesEmptyIteration() {
        when(iterationMapper.selectById(ITERATION_ID)).thenReturn(iteration());
        when(jdbcTemplate.queryForObject(contains("FROM rdm_requirement"), eq(Integer.class), eq(ITERATION_CODE)))
                .thenReturn(0);
        when(jdbcTemplate.queryForObject(contains("FROM rdm_work_task"), eq(Integer.class), eq(ITERATION_CODE)))
                .thenReturn(0);

        service.deleteIteration(ITERATION_ID);

        // deleteById 在 @TableLogic 实体上即逻辑删除（deleted=1），历史快照中的编码不受影响
        verify(iterationMapper).deleteById(ITERATION_ID);
    }
}
