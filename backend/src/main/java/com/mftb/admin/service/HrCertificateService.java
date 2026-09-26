package com.mftb.admin.service;

import com.mftb.admin.dto.HrCertificateSaveDTO;
import com.mftb.admin.dto.HrCertificateVO;
import com.mftb.admin.dto.PageResult;

import java.util.Map;

/**
 * 證明開具服务（员工自助）。
 * <p>
 * 与请假一致：单据一律归属登录人，不提供跨员工的查看与代办；审批环节委托 OA 引擎，
 * 通过后由回调置为 completed 并写入领取指引，纸质证明由人事线下出具。
 */
public interface HrCertificateService {

    /** 我的证明申请分页 */
    PageResult<HrCertificateVO> page(long page, long size, String status, String keyword);

    /** 我的证明申请状态计数（列表 Tab 徽标），与 page 同口径 */
    Map<String, Long> stats();

    /** 我的证明申请详情（他人单据一律拒绝） */
    HrCertificateVO detail(Long id);

    /** 保存草稿 */
    HrCertificateVO saveDraft(HrCertificateSaveDTO dto);

    /** 编辑草稿/驳回/已撤销单据 */
    HrCertificateVO update(Long id, HrCertificateSaveDTO dto);

    /** 提交审批（创建关联 OA 流程） */
    HrCertificateVO submit(Long id);

    /** 撤销审批（单据回草稿，联动撤销在途 OA 流程） */
    void cancel(Long id);

    /** 删除单据（仅草稿/驳回/已撤销） */
    void delete(Long id);
}
