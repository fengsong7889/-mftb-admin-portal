package com.mftb.admin.service;

import com.mftb.admin.dto.OrgPositionVO;
import com.mftb.admin.dto.OrgUnitVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.OrgJobFamily;
import com.mftb.admin.entity.OrgJobGrade;
import com.mftb.admin.entity.OrgLegalEntity;
import com.mftb.admin.entity.OrgPosition;
import com.mftb.admin.entity.OrgUnit;

import java.util.List;
import java.util.Map;

/**
 * 組織編制主數據服務（階段 C1 第一批：法人主體 + 管理組織）。
 * <p>
 * 本域是 {@code org_*} 表的唯一寫入方（方案 13.3「一域一寫入方」）；
 * 其他域只能通過本服務或事件讀取，不得直接寫這兩張表。
 */
public interface HcmOrganizationService {

    /** 法人主體分頁列表；列表與統計必須同一套篩選條件 */
    PageResult<OrgLegalEntity> listLegalEntities(long page, long size, String keyword, Integer status, String jurisdiction);

    /** 法人主體統計（口徑跟隨列表篩選） */
    Map<String, Object> legalEntityStats(String keyword, Integer status, String jurisdiction);

    OrgLegalEntity getLegalEntity(Long id);

    /** 新增或編輯法人主體；編碼唯一、法域白名單、更新人取登錄帳號 */
    OrgLegalEntity saveLegalEntity(OrgLegalEntity entity);

    /** 刪除法人主體：仍有啟用組織時拒絕（避免組織懸空） */
    void deleteLegalEntity(Long id);

    /** 管理組織樹；可按法人和關鍵字裁剪 */
    List<OrgUnitVO> unitTree(Long legalEntityId, String keyword, Integer status);

    OrgUnitVO getUnit(Long id);

    /** 新增或編輯管理組織；父子同法人、禁止環、移動時刷新子樹物化路徑 */
    OrgUnitVO saveUnit(OrgUnit unit);

    /** 刪除管理組織：存在子組織時拒絕 */
    void deleteUnit(Long id);

    /* ==================== 職位體系（職務族 / 職位職級） ==================== */

    PageResult<OrgJobFamily> listJobFamilies(long page, long size, String keyword, Integer status);

    OrgJobFamily getJobFamily(Long id);

    /** 新增或編輯職務族；編碼唯一，有職位職級時不得刪除 */
    OrgJobFamily saveJobFamily(OrgJobFamily entity);

    void deleteJobFamily(Long id);

    PageResult<OrgJobGrade> listJobGrades(long page, long size, String keyword, Integer status, Long jobFamilyId);

    /** 職位下拉：只返回啟用中的職位，附帶職務族名供界面直接顯示 */
    List<OrgJobGrade> jobGradeOptions(Long jobFamilyId);

    OrgJobGrade getJobGrade(Long id);

    /** 新增或編輯職位職級；必須掛在啟用中的職務族下，職級序號從 1 起 */
    OrgJobGrade saveJobGrade(OrgJobGrade entity);

    void deleteJobGrade(Long id);

    /* ==================== 崗位與編制 ==================== */

    /** 岗位列表：带上当前占用与超编标记（占用来自任职事实，不落冗余字段） */
    PageResult<OrgPositionVO> listPositions(long page, long size, String keyword, Integer status,
                                            Long unitId, Long jobGradeId);

    OrgPosition getPosition(Long id);

    /** 新增或編輯崗位；必須掛在啟用中的組織與職位下，編制數不得為負 */
    OrgPosition savePosition(OrgPosition entity);

    /** 刪除崗位；本期還沒有任職事實，待 Assignment 落地後改為「有占用時拒絕」 */
    void deletePosition(Long id);
}
