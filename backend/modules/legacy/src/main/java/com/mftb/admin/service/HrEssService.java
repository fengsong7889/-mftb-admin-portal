package com.mftb.admin.service;

import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * 員工自助（ESS）服务：一律以「登录人本人」为数据范围，不接收外部传入的员工标识，
 * 因此无需依赖 hr-* 人事菜单授权。
 */
public interface HrEssService {

    /** 我的人事异动单据（入职/转正/调动/离职/续签），只返回 user_id 为登录人的记录 */
    PageResult<HrLifecycleVO> myRequests(long page, long size, String type, String status);

    /** 我的异动单据按状态计数（Tab 徽标），口径与 myRequests 一致 */
    Map<String, Long> myRequestStats();

    /** 我的档案（脱敏视图：证件号与住址默认打码，本人也走同一策略） */
    Map<String, Object> myProfile();
}
