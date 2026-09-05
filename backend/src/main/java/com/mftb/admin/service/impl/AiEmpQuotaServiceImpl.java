package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.AiEmpQuotaDTO;
import com.mftb.admin.entity.AiEmpQuotaPolicy;
import com.mftb.admin.entity.AiRoleQuotaPolicy;
import com.mftb.admin.mapper.AiEmpQuotaPolicyMapper;
import com.mftb.admin.mapper.AiRoleQuotaPolicyMapper;
import com.mftb.admin.service.AiEmpQuotaService;
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
public class AiEmpQuotaServiceImpl implements AiEmpQuotaService {

    private final AiEmpQuotaPolicyMapper posMapper;
    private final AiRoleQuotaPolicyMapper roleMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /* ══════════════════════ 職位額度 ══════════════════════ */

    @Override
    public List<AiEmpQuotaDTO.PosQuotaVO> listPosQuotas(AiEmpQuotaDTO.QuotaQueryRequest query) {
        LambdaQueryWrapper<AiEmpQuotaPolicy> wrapper = new LambdaQueryWrapper<>();
        if (query != null) {
            if (StringUtils.hasText(query.getName())) {
                wrapper.like(AiEmpQuotaPolicy::getName, query.getName());
            }
            if (StringUtils.hasText(query.getSequence())) {
                wrapper.like(AiEmpQuotaPolicy::getSequences, query.getSequence());
            }
            if (StringUtils.hasText(query.getPeriod())) {
                wrapper.eq(AiEmpQuotaPolicy::getPeriod, query.getPeriod());
            }
            if (query.getStatus() != null) {
                wrapper.eq(AiEmpQuotaPolicy::getStatus, query.getStatus());
            }
        }
        wrapper.orderByDesc(AiEmpQuotaPolicy::getUpdatedAt);

        List<AiEmpQuotaPolicy> list = posMapper.selectList(wrapper);
        return list.stream().map(this::toPosVO).toList();
    }

    @Override
    public AiEmpQuotaDTO.PosQuotaVO getPosQuotaById(Long id) {
        AiEmpQuotaPolicy entity = posMapper.selectById(id);
        return entity != null ? toPosVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long savePosQuota(AiEmpQuotaDTO.PosQuotaRequest request, String operator) {
        AiEmpQuotaPolicy entity;
        if (request.getId() != null) {
            entity = posMapper.selectById(request.getId());
            if (entity == null) throw new RuntimeException("額度策略不存在");
        } else {
            entity = new AiEmpQuotaPolicy();
            entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_POS_QUOTA));
            entity.setCreatedBy(operator);
        }
        entity.setName(request.getName());
        entity.setDescription(request.getDescription());
        entity.setSequences(JsonUtils.toJson(request.getSequences()));
        entity.setJobLevels(JsonUtils.toJson(request.getJobLevels()));
        entity.setTotalEmployeeCount(request.getTotalEmployeeCount() != null ? request.getTotalEmployeeCount() : 0);
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
            posMapper.updateById(entity);
            return entity.getId();
        } else {
            entity.setUsedValue(java.math.BigDecimal.ZERO);
            posMapper.insert(entity);
            return entity.getId();
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePosQuota(Long id) {
        posMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void togglePosQuotaStatus(Long id, Integer status, String operator) {
        AiEmpQuotaPolicy entity = posMapper.selectById(id);
        if (entity == null) throw new RuntimeException("額度策略不存在");
        entity.setStatus(status);
        entity.setUpdatedBy(operator);
        posMapper.updateById(entity);
    }

    /* ══════════════════════ 角色額度 ══════════════════════ */

    @Override
    public List<AiEmpQuotaDTO.RoleQuotaVO> listRoleQuotas(AiEmpQuotaDTO.QuotaQueryRequest query) {
        LambdaQueryWrapper<AiRoleQuotaPolicy> wrapper = new LambdaQueryWrapper<>();
        if (query != null) {
            if (StringUtils.hasText(query.getName())) {
                wrapper.and(w -> w.like(AiRoleQuotaPolicy::getRoleName, query.getName())
                        .or().like(AiRoleQuotaPolicy::getDescription, query.getName()));
            }
            if (query.getStatus() != null) {
                wrapper.eq(AiRoleQuotaPolicy::getStatus, query.getStatus());
            }
        }
        wrapper.orderByDesc(AiRoleQuotaPolicy::getUpdatedAt);

        List<AiRoleQuotaPolicy> list = roleMapper.selectList(wrapper);
        return list.stream().map(this::toRoleVO).toList();
    }

    @Override
    public AiEmpQuotaDTO.RoleQuotaVO getRoleQuotaById(Long id) {
        AiRoleQuotaPolicy entity = roleMapper.selectById(id);
        return entity != null ? toRoleVO(entity) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long saveRoleQuota(AiEmpQuotaDTO.RoleQuotaRequest request, String operator) {
        AiRoleQuotaPolicy entity;
        if (request.getId() != null) {
            entity = roleMapper.selectById(request.getId());
            if (entity == null) throw new RuntimeException("額度策略不存在");
        } else {
            entity = new AiRoleQuotaPolicy();
            entity.setConfigCode(bizSeqService.next(BizSeqService.RULE_AI_EMP_ROLE_QUOTA));
            entity.setCreatedBy(operator);
        }
        entity.setRoleName(request.getRoleName());
        entity.setDescription(request.getDescription());
        entity.setUserIds(request.getUserIds() != null ? JsonUtils.toJson(request.getUserIds()) : null);
        entity.setUserNames(request.getUserNames() != null ? JsonUtils.toJson(request.getUserNames()) : null);
        entity.setTotalEmployeeCount(request.getTotalEmployeeCount() != null ? request.getTotalEmployeeCount() : 0);
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
            roleMapper.updateById(entity);
            return entity.getId();
        } else {
            entity.setUsedValue(java.math.BigDecimal.ZERO);
            roleMapper.insert(entity);
            return entity.getId();
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteRoleQuota(Long id) {
        roleMapper.deleteById(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void toggleRoleQuotaStatus(Long id, Integer status, String operator) {
        AiRoleQuotaPolicy entity = roleMapper.selectById(id);
        if (entity == null) throw new RuntimeException("額度策略不存在");
        entity.setStatus(status);
        entity.setUpdatedBy(operator);
        roleMapper.updateById(entity);
    }

    /* ══════════════════════ Entity → VO 轉換 ══════════════════════ */

    private AiEmpQuotaDTO.PosQuotaVO toPosVO(AiEmpQuotaPolicy e) {
        var vo = new AiEmpQuotaDTO.PosQuotaVO();
        vo.setId(e.getId());
        vo.setConfigCode(e.getConfigCode());
        vo.setName(e.getName());
        vo.setDescription(e.getDescription());
        vo.setSequences(safeParseStringList(e.getSequences()));
        vo.setJobLevels(safeParseStringList(e.getJobLevels()));
        vo.setTotalEmployeeCount(e.getTotalEmployeeCount());
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

    private AiEmpQuotaDTO.RoleQuotaVO toRoleVO(AiRoleQuotaPolicy e) {
        var vo = new AiEmpQuotaDTO.RoleQuotaVO();
        vo.setId(e.getId());
        vo.setConfigCode(e.getConfigCode());
        vo.setRoleName(e.getRoleName());
        vo.setDescription(e.getDescription());
        vo.setUserIds(safeParseLongList(e.getUserIds()));
        vo.setUserNames(safeParseStringList(e.getUserNames()));
        vo.setTotalEmployeeCount(e.getTotalEmployeeCount());
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
