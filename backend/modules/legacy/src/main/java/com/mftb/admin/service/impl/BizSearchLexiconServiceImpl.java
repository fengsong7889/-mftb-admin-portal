package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchLexicon;
import com.mftb.admin.mapper.BizSearchLexiconMapper;
import com.mftb.admin.service.BizSearchLexiconService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Set;

/**
 * 搜索词库服务实现。后端为安全边界：枚举/长度/自指/实体归属重新校验，前端校验仅负责 UX。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizSearchLexiconServiceImpl implements BizSearchLexiconService {

    private static final Set<Integer> WORD_TYPES = Set.of(1, 2, 3, 4, 5);
    private static final Set<Integer> ENTITY_TYPES = Set.of(1, 2, 3);

    private final BizSearchLexiconMapper mapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<BizSearchLexicon> list(Integer wordType, String brand, Integer status) {
        LambdaQueryWrapper<BizSearchLexicon> wrapper = new LambdaQueryWrapper<>();
        if (wordType != null) wrapper.eq(BizSearchLexicon::getWordType, wordType);
        if (StringUtils.hasText(brand)) wrapper.eq(BizSearchLexicon::getBrand, brand);
        if (status != null) wrapper.eq(BizSearchLexicon::getStatus, status);
        wrapper.orderByDesc(BizSearchLexicon::getId);
        return mapper.selectList(wrapper);
    }

    @Override
    public long create(BizSearchLexicon entry) {
        validate(entry);
        entry.setId(null);
        if (!StringUtils.hasText(entry.getEntryNo())) {
            entry.setEntryNo("LX" + System.currentTimeMillis());
        }
        if (entry.getStatus() == null) entry.setStatus(1);
        String operator = operatorResolver.currentOperatorName();
        entry.setCreatedBy(operator);
        entry.setUpdatedBy(operator);
        mapper.insert(entry);
        return entry.getId();
    }

    @Override
    public void update(Long id, BizSearchLexicon entry) {
        BizSearchLexicon existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("词条不存在");
        validate(entry);
        entry.setId(id);
        entry.setEntryNo(existing.getEntryNo());
        entry.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(entry);
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        if (status == null || (status != 1 && status != 2)) throw new BusinessException("非法状态值");
        BizSearchLexicon existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("词条不存在");
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        BizSearchLexicon existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("词条不存在");
        mapper.deleteById(id);
    }

    private void validate(BizSearchLexicon e) {
        if (!StringUtils.hasText(e.getEntryName())) throw new BusinessException("词条名称不能为空");
        if (e.getEntryName().trim().length() > 60) throw new BusinessException("词条名称最多 60 字");
        if (!StringUtils.hasText(e.getSourceTerm())) throw new BusinessException("原词/别名不能为空");
        if (!StringUtils.hasText(e.getTargetTerm())) throw new BusinessException("标准词/实体不能为空");
        if (e.getSourceTerm().length() > 64 || e.getTargetTerm().length() > 64) {
            throw new BusinessException("词条长度最多 64 字");
        }
        if (e.getSourceTerm().trim().equals(e.getTargetTerm().trim())) {
            throw new BusinessException("原词与标准词不得相同");
        }
        if (e.getWordType() == null || !WORD_TYPES.contains(e.getWordType())) throw new BusinessException("非法的词条类型");
        if (e.getEntityType() != null && !ENTITY_TYPES.contains(e.getEntityType())) throw new BusinessException("非法的实体类型");
        // 实体别名(2) 必须绑定唯一实体，否则无法据以做精确准入
        if (Integer.valueOf(2).equals(e.getWordType()) && e.getEntityId() == null) {
            throw new BusinessException("实体别名必须绑定归属实体ID");
        }
        if (!StringUtils.hasText(e.getEvidence())) throw new BusinessException("来源依据不能为空");
    }
}
