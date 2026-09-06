package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VersionHistoryVO;
import com.mftb.admin.entity.SysVersionHistory;
import com.mftb.admin.mapper.SysVersionHistoryMapper;
import com.mftb.admin.service.VersionHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 版本发布历史记录服务实现
 */
@Service
@RequiredArgsConstructor
public class VersionHistoryServiceImpl implements VersionHistoryService {

    private final SysVersionHistoryMapper mapper;

    @Override
    public PageResult<VersionHistoryVO> list(long page, long size, String keyword, String releaseType,
                                              java.time.LocalDate startDate, java.time.LocalDate endDate, Integer status) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);

        LambdaQueryWrapper<SysVersionHistory> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(SysVersionHistory::getVersionNo, keyword)
                    .or().like(SysVersionHistory::getSummary, keyword));
        }
        if (StringUtils.hasText(releaseType)) {
            wrapper.eq(SysVersionHistory::getReleaseType, releaseType);
        }
        if (startDate != null) {
            wrapper.ge(SysVersionHistory::getReleaseDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(SysVersionHistory::getReleaseDate, endDate);
        }
        if (status != null) {
            wrapper.eq(SysVersionHistory::getStatus, status);
        }
        wrapper.orderByDesc(SysVersionHistory::getReleaseDate);

        long total = mapper.selectCount(wrapper);
        List<SysVersionHistory> records = mapper.selectList(
                wrapper.last("LIMIT " + (page - 1) * size + "," + size));

        List<VersionHistoryVO> voList = records.stream().map(this::toVO).toList();
        return new PageResult<>(voList, total);
    }

    @Override
    public VersionHistoryVO getById(Long id) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        return toVO(entity);
    }

    @Override
    public Long create(VersionHistoryVO vo, String operator) {
        SysVersionHistory entity = new SysVersionHistory();
        copyFromVO(entity, vo);
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);
        mapper.insert(entity);
        return entity.getId();
    }

    @Override
    public void update(Long id, VersionHistoryVO vo, String operator) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        copyFromVO(entity, vo);
        entity.setUpdatedBy(operator);
        mapper.updateById(entity);
    }

    @Override
    public void delete(Long id) {
        SysVersionHistory entity = mapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("版本記錄不存在");
        }
        mapper.deleteById(id);
    }

    private VersionHistoryVO toVO(SysVersionHistory entity) {
        VersionHistoryVO vo = new VersionHistoryVO();
        vo.setId(entity.getId());
        vo.setVersionNo(entity.getVersionNo());
        vo.setReleaseDate(entity.getReleaseDate());
        vo.setReleaseType(entity.getReleaseType());
        vo.setSummary(entity.getSummary());
        vo.setFrontendChanges(entity.getFrontendChanges());
        vo.setBackendChanges(entity.getBackendChanges());
        vo.setDatabaseChanges(entity.getDatabaseChanges());
        vo.setStatus(entity.getStatus());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    private void copyFromVO(SysVersionHistory entity, VersionHistoryVO vo) {
        entity.setVersionNo(vo.getVersionNo());
        entity.setReleaseDate(vo.getReleaseDate());
        entity.setReleaseType(vo.getReleaseType());
        entity.setSummary(vo.getSummary());
        entity.setFrontendChanges(vo.getFrontendChanges());
        entity.setBackendChanges(vo.getBackendChanges());
        entity.setDatabaseChanges(vo.getDatabaseChanges());
        entity.setStatus(vo.getStatus());
    }
}
