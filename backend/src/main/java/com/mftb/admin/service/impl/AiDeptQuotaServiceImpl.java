package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiDeptQuotaDTO;
import com.mftb.admin.entity.AiDeptQuotaPolicy;
import com.mftb.admin.mapper.AiDeptQuotaPolicyMapper;
import com.mftb.admin.service.AiDeptQuotaService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiDeptQuotaServiceImpl implements AiDeptQuotaService {

    private final AiDeptQuotaPolicyMapper deptMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    public List<AiDeptQuotaDTO.DeptQuotaVO> listDeptQuotas(AiDeptQuotaDTO.DeptQuotaQueryRequest query) {
        LambdaQueryWrapper<AiDeptQuotaPolicy> wrapper = new LambdaQueryWrapper<>();
        if (query != null) {
            if (StringUtils.hasText(query.getName())) {
                wrapper.like(AiDeptQuotaPolicy::getName, query.getName());
            }
            if (StringUtils.hasText(query.getPeriod())) {
                wrapper.eq(AiDeptQuotaPolicy::getPeriod, query.getPeriod());
            }
            if (query.getStatus() != null) {
                wrapper.eq(AiDeptQuotaPolicy::getStatus, query.getStatus());
            }
        }
        wrapper.orderByDesc(AiDeptQuotaPolicy::getUpdatedAt);
        return deptMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    @Override
    public AiDeptQuotaDTO.DeptQuotaVO getDeptQuotaById(Long id) {
        AiDeptQuotaPolicy entity = deptMapper.selectById(id);
        return entity != null ? toVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long saveDeptQuota(AiDeptQuotaDTO.DeptQuotaRequest request, String operator) {
        AiDeptQuotaPolicy entity;
        if (request.getId() != null) {
            entity = deptMapper.selectById(request.getId());
            if (entity == null) throw new RuntimeException("額度策略不存在");
        } else {
            entity = new AiDeptQuotaPolicy();
            entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_DEPT_QUOTA));
            entity.setCreatedBy(operator);
        }
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setDeptIds(request.getDeptIds() != null ? JsonUtils.toJson(request.getDeptIds()) : null);
        entity.setDeptNames(request.getDeptNames() != null ? JsonUtils.toJson(request.getDeptNames()) : null);
        entity.setTotalEmployeeCount(request.getTotalEmployeeCount() != null ? request.getTotalEmployeeCount() : 0);
        entity.setAllocateMode(request.getAllocateMode());
        entity.setPeriod(request.getPeriod());
        entity.setQuotaType(request.getQuotaType());
        entity.setQuotaValue(request.getQuotaValue());
        entity.setCurrency(request.getCurrency() != null ? request.getCurrency() : "CNY");
        entity.setSoftThreshold(request.getSoftThreshold() != null ? request.getSoftThreshold() : 80);
        entity.setOverLimitAction(request.getOverLimitAction());
        entity.setDowngradeModelId(request.getDowngradeModelId());
        entity.setStatus(request.getStatus() != null ? request.getStatus() : 1);
        entity.setUpdatedBy(operator);

        if (request.getId() != null) {
            deptMapper.updateById(entity);
            return entity.getId();
        } else {
            entity.setUsedValue(java.math.BigDecimal.ZERO);
            deptMapper.insert(entity);
            return entity.getId();
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteDeptQuota(Long id) {
        deptMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void toggleDeptQuotaStatus(Long id, Integer status, String operator) {
        AiDeptQuotaPolicy entity = deptMapper.selectById(id);
        if (entity == null) throw new RuntimeException("額度策略不存在");
        entity.setStatus(status);
        entity.setUpdatedBy(operator);
        deptMapper.updateById(entity);
    }

    /* ══════════════════════ Entity → VO ══════════════════════ */

    private AiDeptQuotaDTO.DeptQuotaVO toVO(AiDeptQuotaPolicy e) {
        var vo = new AiDeptQuotaDTO.DeptQuotaVO();
        vo.setId(e.getId());
        vo.setConfigCode(e.getConfigCode());
        vo.setName(e.getName());
        vo.setDescription(e.getDescription());
        vo.setDeptIds(safeParseLongList(e.getDeptIds()));
        vo.setDeptNames(safeParseStringList(e.getDeptNames()));
        vo.setTotalEmployeeCount(e.getTotalEmployeeCount());
        vo.setAllocateMode(e.getAllocateMode());
        vo.setPeriod(e.getPeriod());
        vo.setQuotaType(e.getQuotaType());
        vo.setQuotaValue(e.getQuotaValue());
        vo.setCurrency(e.getCurrency());
        vo.setSoftThreshold(e.getSoftThreshold());
        vo.setOverLimitAction(e.getOverLimitAction());
        vo.setDowngradeModelId(e.getDowngradeModelId());
        vo.setUsedValue(e.getUsedValue());
        vo.setStatus(e.getStatus());
        vo.setCreatedBy(e.getCreatedBy());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setCreatedAt(e.getCreatedAt() != null ? e.getCreatedAt().format(DT_FMT) : null);
        vo.setUpdatedAt(e.getUpdatedAt() != null ? e.getUpdatedAt().format(DT_FMT) : null);
        return vo;
    }

    private List<String> safeParseStringList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return JsonUtils.parseStringList(json); } catch (Exception e) { return Collections.emptyList(); }
    }

    private List<Long> safeParseLongList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return JsonUtils.parseLongList(json); } catch (Exception e) { return Collections.emptyList(); }
    }
}
