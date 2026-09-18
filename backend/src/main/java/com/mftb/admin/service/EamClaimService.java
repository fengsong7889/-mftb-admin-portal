package com.mftb.admin.service;

import com.mftb.admin.dto.*;

import java.util.List;
import java.util.Map;

/**
 * 领用管理服务接口
 */
public interface EamClaimService {

    /** 管理视图分页查询 */
    PageResult<EamClaimVO> page(EamClaimQuery query);

    /** 领用统计 */
    EamClaimStatsVO stats(EamClaimQuery query);

    /** 员工领用汇总列表 */
    PageResult<EamClaimEmployeeSummaryVO> employeeSummary(EamClaimQuery query);

    /** 可选领用人下拉（仅要求领用资产菜单权限；支持选择本人登记，排除离职员工；employeeId 用于深链预填精确回显） */
    List<EamClaimEmployeeOptionVO> employeeOptions(String keyword, Long employeeId);

    /** 领用详情 */
    EamClaimVO detail(long claimId);

    /** 领用事件流水 */
    List<EamClaimEventVO> events(long claimId);

    /** 登记领用（标准 / 代办） */
    long register(EamClaimSaveDTO dto);

    /** 员工签署（上传签名图片） */
    void sign(EamSignDTO dto);

    /** 取消领用 */
    void cancel(long claimId, String reason);

    /** 正常归还 */
    long returnAsset(EamReturnDTO dto);

    /** 个人领用列表（当前登录用户） */
    PageResult<EamClaimVO> myClaims(EamClaimQuery query);
    EamClaimVO myDetail(long id);

    /** 钉钉签署页：凭令牌读取待签署领用详情（免登录） */
    EamClaimVO signPageDetail(String token);

    /** 钉钉签署页：凭令牌提交签名（免登录） */
    void signByToken(EamSignPageDTO dto);
}
