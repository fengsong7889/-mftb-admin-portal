package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 需求屬性變更請求（詳情頁右側屬性欄逐字段修改）。
 *
 * <p>語義約定：字段為 {@code null} 表示本次不改；日期傳空串表示清空；
 * {@code ccUserIds} 傳數組表示整份替換抄送（空數組即清空）。
 *
 * <p>為什麼不在此入口開放這些字段：
 * <ul>
 *   <li>狀態：必須走 {@code rdm_transition} 狀態機（角色、必填、審批留痕）；</li>
 *   <li>需求類型：準入路由與審批策略按類型裁決，中途改會繞過既有裁決；</li>
 *   <li>歸屬項目：改項目要級聯交付項/迭代/任務，屬獨立遷移動作；</li>
 *   <li>參與角色（PM 以外的 PMO/QA 等）：角色即權限面，只開放抄送。</li>
 * </ul>
 */
@Data
public class RdmRequirementAttrDTO {

    /** 提出人（僅分配權/全量權可改；同步主表快照 + SUBMITTER 角色行） */
    private Long submitterUserId;

    /** 研發負責人（同步 DEV_LEAD 角色行） */
    private Long devOwnerUserId;

    /** 業務驗收人（同步 ACCEPTOR 角色行） */
    private Long acceptorUserId;

    /** 需求級項目經理 */
    private Long projectManagerUserId;

    /** 優先級 P0/P1/P2/P3 */
    private String priority;

    /** 預期規模 SIMPLE/MEDIUM/COMPLEX/HUGE */
    private String complexity;

    /** 業務期望完成日期；空串=清空 */
    private String expectDate;

    /** 承諾出 PRD 日期；空串=清空 */
    private String promisedPrdDate;

    /** 計劃上線日期；空串=清空 */
    private String planReleaseDate;

    /** 抄送人（整份替換；null=不改，空數組=清空） */
    private List<Long> ccUserIds;

    /** 變更說明（寫入狀態流水，便於事後追溯） */
    private String remark;
}
