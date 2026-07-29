package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PositionRequest;
import com.mftb.admin.dto.PositionVO;
import com.mftb.admin.entity.SysPosition;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysPositionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PositionService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 集团人事-职位服务实现
 */
@Service
@RequiredArgsConstructor
public class PositionServiceImpl implements PositionService {

    /** 合法职级序列: M=管理 T=技术 P=专业 */
    private static final List<String> VALID_SEQUENCES = List.of("M", "T", "P");

    private final SysPositionMapper sysPositionMapper;
    private final SysUserMapper sysUserMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<PositionVO> list() {
        List<SysPosition> positions = sysPositionMapper.selectList(
                new LambdaQueryWrapper<SysPosition>()
                        .orderByAsc(SysPosition::getSequence)
                        .orderByAsc(SysPosition::getJobLevel)
                        .orderByAsc(SysPosition::getId));
        return positions.stream().map(PositionVO::from).toList();
    }

    @Override
    public PositionVO create(PositionRequest request) {
        validate(request);
        requireNameUnique(request.getName(), null);
        SysPosition position = new SysPosition();
        position.setName(request.getName().trim());
        position.setNameEn(request.getNameEn() != null ? request.getNameEn().trim() : null);
        position.setSequence(request.getSequence());
        position.setJobLevel(request.getJobLevel().trim());
        position.setRank(request.getRank() != null ? request.getRank().trim() : null);
        position.setDeleted(0);
        position.setUpdatedBy(operatorResolver.currentOperatorName());
        sysPositionMapper.insert(position);
        return PositionVO.from(position);
    }

    @Override
    @Transactional
    public PositionVO update(Long id, PositionRequest request) {
        validate(request);
        SysPosition position = requirePosition(id);
        requireNameUnique(request.getName(), id);
        position.setName(request.getName().trim());
        position.setNameEn(request.getNameEn() != null ? request.getNameEn().trim() : null);
        position.setSequence(request.getSequence());
        position.setJobLevel(request.getJobLevel().trim());
        position.setRank(request.getRank() != null ? request.getRank().trim() : null);
        position.setUpdatedBy(operatorResolver.currentOperatorName());
        sysPositionMapper.updateById(position);
        // 同步该职位下员工的职位名称/职级快照
        syncUserPositionSnapshot(position);
        return PositionVO.from(position);
    }

    @Override
    public void delete(Long id) {
        requirePosition(id);
        Long count = sysUserMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getPositionId, id));
        if (count != null && count > 0) {
            throw new BusinessException("该职位已被员工绑定，请先调整相关员工的职位");
        }
        sysPositionMapper.deleteById(id);
    }

    /** 职级序列合法性校验 */
    private void validate(PositionRequest request) {
        if (!VALID_SEQUENCES.contains(request.getSequence())) {
            throw new BusinessException("职级序列只能为 M(管理)/T(技术)/P(专业)");
        }
    }

    /** 职位名称唯一性校验 (excludeId 为编辑时排除自身) */
    private void requireNameUnique(String name, Long excludeId) {
        LambdaQueryWrapper<SysPosition> wrapper =
                new LambdaQueryWrapper<SysPosition>().eq(SysPosition::getName, name.trim());
        if (excludeId != null) {
            wrapper.ne(SysPosition::getId, excludeId);
        }
        Long count = sysPositionMapper.selectCount(wrapper);
        if (count != null && count > 0) {
            throw new BusinessException("职位名称已存在");
        }
    }

    /** 职位信息变更后同步员工表的职位中英文名称/职级序列/职级快照 */
    private void syncUserPositionSnapshot(SysPosition position) {
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getPositionId, position.getId()));
        for (SysUser user : users) {
            user.setPosition(position.getName());
            user.setPositionEn(position.getNameEn());
            user.setSequence(position.getSequence());
            user.setJobLevel(position.getJobLevel());
            sysUserMapper.updateById(user);
        }
    }

    private SysPosition requirePosition(Long id) {
        SysPosition position = sysPositionMapper.selectById(id);
        if (position == null) {
            throw new BusinessException("职位不存在");
        }
        return position;
    }
}
