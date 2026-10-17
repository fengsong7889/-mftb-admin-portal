package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDeliveryItemDTO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 交付项「验收路径」入参必须是 A/B 之一。
 *
 * <p>为什么单独钉住：库里 rdm_delivery_item.acceptance_path 是 VARCHAR(10) 且只有 A/B 两种语义，
 * 而旧写法把任意传入值 {@code toUpperCase()} 后直接落库。端到端实跑时提交 acceptancePath=PRODUCT_ONLY，
 * MySQL 抛 Data truncation，被 GlobalExceptionHandler 兜成「數據庫操作異常, 請稍後重試」——
 * 用户完全看不出是自己选错了路径，监控里也只剩一条没有业务语义的 500。
 * 前端下拉能兜住正常操作，但接口才是边界（脚本/集成方/旧页面都不走那个下拉）。
 *
 * <p>纯 Mockito 离线单测，不连库。
 */
class RdmDeliveryItemAcceptancePathTest {

    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmProjectMapper projectMapper;
    private RdmDeliveryItemService service;

    @BeforeEach
    void setUp() {
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        projectMapper = mock(RdmProjectMapper.class);
        RdmWorkTaskMapper taskMapper = mock(RdmWorkTaskMapper.class);
        RdmTestBatchMapper testBatchMapper = mock(RdmTestBatchMapper.class);
        RdmTestExecutionMapper testExecutionMapper = mock(RdmTestExecutionMapper.class);
        RdmAcceptanceRecordMapper acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        RdmIssueMapper issueMapper = mock(RdmIssueMapper.class);
        SysUserMapper userMapper = mock(SysUserMapper.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        RdmAccessGuard accessGuard = mock(RdmAccessGuard.class);
        RdmEvidenceInvalidationMapper evidenceInvalidationMapper = mock(RdmEvidenceInvalidationMapper.class);
        RdmFlowVersionGuard flowVersionGuard = mock(RdmFlowVersionGuard.class);
        RdmIdempotentService idempotentService = mock(RdmIdempotentService.class);
        service = new RdmDeliveryItemService(deliveryItemMapper, requirementMapper, taskMapper, testBatchMapper,
                testExecutionMapper, acceptanceRecordMapper, issueMapper, projectMapper, userMapper,
                bizSeqService, accessGuard, evidenceInvalidationMapper,
                new EvidenceValidityResolver(evidenceInvalidationMapper), flowVersionGuard, idempotentService);
        when(taskMapper.selectCount(any())).thenReturn(0L);
        when(testBatchMapper.selectList(any())).thenReturn(List.of());
    }

    /** 让需求存在，把校验点推到 acceptancePath 上 */
    private void requirementExists() {
        RdmRequirement req = new RdmRequirement();
        req.setId(9L);
        req.setProjectId(1L);
        when(requirementMapper.selectById(9L)).thenReturn(req);
    }

    private RdmDeliveryItemDTO.Create createWith(String path) {
        RdmDeliveryItemDTO.Create dto = new RdmDeliveryItemDTO.Create();
        dto.setReqId(9L);
        dto.setProjectId(1L);
        dto.setTitle("交付項-驗收路徑校驗");
        dto.setAcceptancePath(path);
        return dto;
    }

    @Test
    @DisplayName("非法验收路径 → 可读业务异常（不再落库、不再退化成數據庫操作異常）")
    void illegalPathThrowsReadableBusinessException() {
        requirementExists();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createItem(createWith("PRODUCT_ONLY"), 1L));

        assertTrue(ex.getMessage().contains("驗收路徑"), ex.getMessage());
        assertTrue(ex.getMessage().contains("PRODUCT_ONLY"), "必须把非法值告诉调用方：" + ex.getMessage());
    }

    @Test
    @DisplayName("小写 a 归一为 A 后放行（前端可能传小写，不能误拒）")
    void lowerCasePathIsNormalisedAndAccepted() {
        requirementExists();

        var item = service.createItem(createWith("a"), 1L);

        assertEquals(RdmConstants.PATH_A, item.getAcceptancePath());
    }

    @Test
    @DisplayName("未传路径 → 回落到 A（保持拆前默认，不因为加了校验而改变缺省）")
    void missingPathFallsBackToA() {
        requirementExists();
        when(projectMapper.selectById(1L)).thenReturn(null);

        var item = service.createItem(createWith(null), 1L);

        assertEquals(RdmConstants.PATH_A, item.getAcceptancePath());
    }

    @Test
    @DisplayName("项目默认值非法也要挡住（默认值同样会落进 acceptance_path）")
    void illegalProjectDefaultThrowsBusinessException() {
        requirementExists();
        RdmProject project = new RdmProject();
        project.setId(1L);
        project.setDefaultAcceptancePath("LONG_LEGACY_VALUE");
        when(projectMapper.selectById(1L)).thenReturn(project);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createItem(createWith(null), 1L));
        assertTrue(ex.getMessage().contains("驗收路徑"), ex.getMessage());
    }
}
