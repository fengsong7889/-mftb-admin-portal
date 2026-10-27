package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.ActivityVO;
import com.mftb.admin.entity.BizActivity;
import com.mftb.admin.mapper.BizActivityMapper;
import com.mftb.admin.service.ActivityService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 系统活动查询服务实现
 */
@Service
@RequiredArgsConstructor
public class ActivityServiceImpl implements ActivityService {

    private static final DateTimeFormatter DISPLAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final BizActivityMapper activityMapper;

    @Override
    public ActivityVO getByNo(String activityNo) {
        if (activityNo == null || activityNo.isBlank()) {
            return null;
        }
        BizActivity entity = activityMapper.selectOne(
                new LambdaQueryWrapper<BizActivity>()
                        .eq(BizActivity::getActivityNo, activityNo.trim())
                        .last("LIMIT 1"));
        return entity == null ? null : toVO(entity);
    }

    @Override
    public List<ActivityVO> list(String keyword, Integer status) {
        LambdaQueryWrapper<BizActivity> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(BizActivity::getActivityNo, kw)
                    .or().like(BizActivity::getName, kw));
        }
        if (status != null) {
            wrapper.eq(BizActivity::getStatus, status);
        }
        wrapper.orderByDesc(BizActivity::getStatus)
                .orderByAsc(BizActivity::getActivityNo)
                .last("LIMIT 200");
        return activityMapper.selectList(wrapper).stream().map(this::toVO).toList();
    }

    /** 实体 → VO */
    private ActivityVO toVO(BizActivity entity) {
        ActivityVO vo = new ActivityVO();
        vo.setActivityNo(entity.getActivityNo());
        vo.setName(entity.getName());
        vo.setStatus(entity.getStatus());
        vo.setStartTime(entity.getStartTime() != null ? entity.getStartTime().format(DISPLAY_FMT) : null);
        vo.setEndTime(entity.getEndTime() != null ? entity.getEndTime().format(DISPLAY_FMT) : null);
        return vo;
    }
}
