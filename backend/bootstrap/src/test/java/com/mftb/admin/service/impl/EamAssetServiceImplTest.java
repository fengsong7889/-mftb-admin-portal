package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.controller.EamAssetController;
import com.mftb.admin.dto.EamAssetSaveDTO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.SysCompanyBrandService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.BeanUtils;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 真实服务映射 + HTTP 序列化，Mapper 隔离业务数据库。 */
@ExtendWith(MockitoExtension.class)
class EamAssetServiceImplTest {
    @Mock private EamAssetMapper assetMapper;
    @Mock private EamInboundBatchMapper batchMapper;
    @Mock private EamLocationMapper locationMapper;
    @Mock private EamModelMapper modelMapper;
    @Mock private EamCategoryMapper categoryMapper;
    @Mock private EamBrandMapper brandMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private BizSeqService bizSeqService;
    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private SysCompanyBrandService companyBrandService;
    @InjectMocks private EamAssetServiceImpl service;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        // 与应用全局 NON_NULL 配置一致，确认字段级 ALWAYS 能保留空持有人。
        ObjectMapper mapper = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
        mvc = MockMvcBuilders.standaloneSetup(new EamAssetController(service))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
    }

    @Test
    void detailExposesActualHolderId() throws Exception {
        when(assetMapper.selectById(2L)).thenReturn(asset(20L));

        assertEquals(20L, service.detail(2L).getCurrentHolderId());
        mvc.perform(get("/api/eam/assets/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentHolderId").value(20));
    }

    @Test
    void idleDetailExplicitlyIncludesNullHolder() throws Exception {
        when(assetMapper.selectById(2L)).thenReturn(asset(null));

        mvc.perform(get("/api/eam/assets/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentHolderId").hasJsonPath())
                .andExpect(jsonPath("$.data.currentHolderId").value(nullValue()));
    }

    @Test
    void listUsesSameHolderMapping() throws Exception {
        Page<EamAsset> page = new Page<>(1, 10, 2);
        page.setRecords(List.of(asset(20L), asset(null)));
        when(assetMapper.selectPage(any(), any())).thenReturn(page);

        mvc.perform(get("/api/eam/assets"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.records[0].currentHolderId").value(20))
                .andExpect(jsonPath("$.data.records[1].currentHolderId").hasJsonPath())
                .andExpect(jsonPath("$.data.records[1].currentHolderId").value(nullValue()));
    }

    @Test
    void listAndDetailExposeSameRealParameters() throws Exception {
        EamAsset asset = asset(null);
        asset.setParams("{\"memory\":\"16GB\",\"count\":0}");
        asset.setCategoryCode("0101");
        when(assetMapper.selectById(2L)).thenReturn(asset);
        Page<EamAsset> page = new Page<>(1, 10, 1);
        page.setRecords(List.of(asset));
        when(assetMapper.selectPage(any(), any())).thenReturn(page);
        mvc.perform(get("/api/eam/assets/2"))
                .andExpect(jsonPath("$.data.params.memory").value("16GB"))
                .andExpect(jsonPath("$.data.params.count").value("0"));
        mvc.perform(get("/api/eam/assets"))
                .andExpect(jsonPath("$.data.records[0].params.memory").value("16GB"))
                .andExpect(jsonPath("$.data.records[0].categoryCode").value("0101"));
    }

    @Test
    void holderIdIsNotPartOfEditableDto() {
        assertNull(BeanUtils.getPropertyDescriptor(EamAssetSaveDTO.class, "currentHolderId"));
    }

    private EamAsset asset(Long holderId) {
        EamAsset asset = new EamAsset();
        asset.setId(2L);
        asset.setStatus(holderId == null ? "idle" : "in_use");
        asset.setCurrentHolderId(holderId);
        return asset;
    }
}
