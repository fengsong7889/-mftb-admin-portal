package com.mftb.admin.service;

import com.mftb.admin.dto.ActivityVO;

import java.util.List;

/**
 * 系统活动查询服务
 */
public interface ActivityService {

    /**
     * 按活动ID（业务编号）查询活动名称与状态
     *
     * @param activityNo 活动ID
     * @return 活动信息；不存在时返回 null
     */
    ActivityVO getByNo(String activityNo);

    /**
     * 活动列表（支持关键字/状态过滤，最多返回 200 条）
     *
     * @param keyword 关键字（匹配活动ID/名称，可空）
     * @param status  活动状态（1=启动 2=停用，可空）
     */
    List<ActivityVO> list(String keyword, Integer status);
}
