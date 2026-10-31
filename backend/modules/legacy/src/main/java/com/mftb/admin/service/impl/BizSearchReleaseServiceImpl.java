package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.BizSearchRelease;
import com.mftb.admin.mapper.BizSearchReleaseMapper;
import com.mftb.admin.service.BizSearchReleaseService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 搜索配置发布版本服务实现。状态机：草稿(0)→待审(1)→批准(2)；生效/替代/回滚属 B1（依赖 ES 实例确认），本批不实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizSearchReleaseServiceImpl implements BizSearchReleaseService {

    private final BizSearchReleaseMapper mapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<BizSearchRelease> list(Integer status) {
        LambdaQueryWrapper<BizSearchRelease> wrapper = new LambdaQueryWrapper<>();
        if (status != null) wrapper.eq(BizSearchRelease::getStatus, status);
        wrapper.orderByDesc(BizSearchRelease::getId);
        return mapper.selectList(wrapper);
    }

    @Override
    public long createDraft(BizSearchRelease release) {
        if (!StringUtils.hasText(release.getReleaseName())) throw new BusinessException("版本名称不能为空");
        if (release.getReleaseName().trim().length() > 60) throw new BusinessException("版本名称最多 60 字");
        if (!StringUtils.hasText(release.getVersionNo())) throw new BusinessException("版本号不能为空");
        if (!StringUtils.hasText(release.getChangeSummary())) throw new BusinessException("变更摘要不能为空");
        if (!StringUtils.hasText(release.getRollbackVersion())) throw new BusinessException("兼容回退版本不能为空");
        long dup = mapper.selectCount(new LambdaQueryWrapper<BizSearchRelease>()
                .eq(BizSearchRelease::getVersionNo, release.getVersionNo().trim()));
        if (dup > 0) throw new BusinessException("版本号已存在：" + release.getVersionNo());
        release.setId(null);
        release.setStatus(0); // 草稿
        release.setApprover(null);
        release.setApproveTime(null);
        release.setPublishedAt(null);
        String operator = operatorResolver.currentOperatorName();
        release.setCreatedBy(operator);
        release.setUpdatedBy(operator);
        mapper.insert(release);
        return release.getId();
    }

    @Override
    public void submitForReview(Long id) {
        BizSearchRelease existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("发布版本不存在");
        if (existing.getStatus() != 0) throw new BusinessException("仅草稿可提交审核");
        existing.setStatus(1);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void approve(Long id, String approver) {
        BizSearchRelease existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("发布版本不存在");
        if (existing.getStatus() != 1) throw new BusinessException("仅待审版本可审批");
        if (!StringUtils.hasText(approver)) throw new BusinessException("审批人不能为空");
        existing.setStatus(2);
        existing.setApprover(approver);
        existing.setApproveTime(LocalDateTime.now());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(existing);
    }

    @Override
    public void delete(Long id) {
        BizSearchRelease existing = mapper.selectById(id);
        if (existing == null) throw new BusinessException("发布版本不存在");
        if (existing.getStatus() == 2) throw new BusinessException("已批准版本不可删除，请走回退流程");
        mapper.deleteById(id);
    }
}
