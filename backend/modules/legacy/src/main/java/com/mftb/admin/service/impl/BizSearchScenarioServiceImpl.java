package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchScenario;
import com.mftb.admin.mapper.BizSearchScenarioMapper;
import com.mftb.admin.service.BizSearchScenarioService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Set;

/**
 * 搜索场景策略服务实现。后端强制：权重合计=100、相关性下限、店内禁广告、首页广告上限（方案 §7.6/§8.4）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizSearchScenarioServiceImpl implements BizSearchScenarioService {

    private static final Set<Integer> SURFACES = Set.of(1, 2, 3);
    private static final Set<Integer> BIZ_CHANNELS = Set.of(1, 2, 3);
    private static final Set<Integer> OBJECT_TYPES = Set.of(1, 2, 3);

    private final BizSearchScenarioMapper mapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<BizSearchScenario> list(Integer surface, Integer bizChannel, Integer status) {
        LambdaQueryWrapper<BizSearchScenario> wrapper = new LambdaQueryWrapper<>();
        if (surface != null) wrapper.eq(BizSearchScenario::getSurface, surface);
        if (bizChannel != null) wrapper.eq(BizSearchScenario::getBizChannel, bizChannel);
        if (status != null) wrapper.eq(BizSearchScenario::getStatus, status);
        wrapper.orderByAsc(BizSearchScenario::getSurface).orderByAsc(BizSearchScenario::getBizChannel);
        return mapper.selectList(wrapper);
    }

    @Override
    public long create(BizSearchScenario s) {
        validate(s);
        s.setId(null);
        if (!StringUtils.hasText(s.getScenarioNo())) s.setScenarioNo("SC" + System.currentTimeMillis());
        if (s.getStatus() == null) s.setStatus(1);
        String operator = operatorResolver.currentOperatorName();
        s.setCreatedBy(operator);
        s.setUpdatedBy(operator);
        mapper.insert(s);
        return s.getId();
    }

    @Override
    public void update(Long id, BizSearchScenario s) {
        BizSearchScenario existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("场景策略不存在");
        validate(s);
        s.setId(id);
        s.setScenarioNo(existing.getScenarioNo());
        s.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(s);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) throw new BusinessException("非法状态值");
        BizSearchScenario existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("场景策略不存在");
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        BizSearchScenario existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("场景策略不存在");
        mapper.deleteById(id);
    }

    private void validate(BizSearchScenario s) {
        if (s.getSurface() == null || !SURFACES.contains(s.getSurface())) throw new BusinessException("非法的场景");
        if (s.getBizChannel() != null && !BIZ_CHANNELS.contains(s.getBizChannel())) throw new BusinessException("非法的业务频道");
        if (s.getObjectType() != null && !OBJECT_TYPES.contains(s.getObjectType())) throw new BusinessException("非法的对象类型");
        int r = nz(s.getWeightRelevance()), q = nz(s.getWeightQuality()), d = nz(s.getWeightDistance()), h = nz(s.getWeightHeat());
        if (r + q + d + h != 100) throw new BusinessException("四項權重合計必須為 100%");
        if (r < 60) throw new BusinessException("相關性權重不得低於 60%");
        if (s.getCandidateWindow() != null && (s.getCandidateWindow() < 20 || s.getCandidateWindow() > 200)) {
            throw new BusinessException("候選窗口須在 20~200");
        }
        int adLimit = nz(s.getAdLimitPerPage());
        if (Integer.valueOf(3).equals(s.getSurface()) && adLimit != 0) throw new BusinessException("店內搜索不允許跨商家廣告");
        if (Integer.valueOf(1).equals(s.getSurface()) && adLimit > 2) throw new BusinessException("大首頁廣告上限為 2 張");
        if (adLimit < 0 || adLimit > 4) throw new BusinessException("首屏廣告上限須在 0~4");
    }

    private int nz(Integer v) {
        return v == null ? 0 : v;
    }
}
