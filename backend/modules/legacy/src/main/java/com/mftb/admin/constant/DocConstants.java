package com.mftb.admin.constant;

import java.util.List;
import java.util.Map;

/**
 * 文檔中心常量：菜單 key、動作集、類型/狀態整型存儲口徑（對齊業務數據字典規則）。
 * <p>權限粒度為「菜單級統一」（產品決策）：持有 doc-library 即全空間可見，
 * edit 動作承載登記/維護能力；空間級 ACL 屬後續增量，不在此預留。
 */
public final class DocConstants {

    private DocConstants() {}

    /** 歷史頂級分組（doc:menu:v1.1 已拍平解除，僅供存量庫清理使用，新庫不再創建） */
    public static final String LEGACY_MENU_GROUP = "doc-center-management";
    /** 文檔庫（查閱/登記/編輯/查閱留痕） */
    public static final String MENU_LIBRARY = "doc-library";
    /** 空間管理（空間維護與騰訊文檔同步） */
    public static final String MENU_SPACE = "doc-space";
    /** 閱讀統計（P2 看板：doc_view_log 期間聚合，唯讀） */
    public static final String MENU_STATS = "doc-stats";
    /** 學習路徑（新人入職包/培訓清單，P2；view 閱讀 + edit 策展管理） */
    public static final String MENU_LEARNING = "doc-learning";

    public static final String SYSTEM_CODE = "doc";
    public static final String ADMIN_ROLE_CODE = "admin";

    /** sys_menu.actions JSON 真值 */
    public static final String ACTIONS_VIEW = "[\"view\"]";
    public static final String ACTIONS_VIEW_EDIT = "[\"view\",\"edit\"]";

    // doc_type：1=在線文檔 2=表格 3=幻燈片 4=PDF 5=外部鏈接
    public static final int TYPE_DOC = 1;
    public static final int TYPE_SHEET = 2;
    public static final int TYPE_SLIDE = 3;
    public static final int TYPE_PDF = 4;
    public static final int TYPE_LINK = 5;
    public static final List<Integer> TYPES = List.of(TYPE_DOC, TYPE_SHEET, TYPE_SLIDE, TYPE_PDF, TYPE_LINK);

    // status：1=草稿 2=評審中 3=已發布 4=已歸檔
    public static final int STATUS_DRAFT = 1;
    public static final int STATUS_REVIEWING = 2;
    public static final int STATUS_PUBLISHED = 3;
    public static final int STATUS_ARCHIVED = 4;
    public static final List<Integer> STATUSES = List.of(STATUS_DRAFT, STATUS_REVIEWING, STATUS_PUBLISHED, STATUS_ARCHIVED);

    /** 業務掛接類型：產研交付需求單 */
    public static final String BIZ_TYPE_REQ = "REQ";

    public static final int TITLE_MAX = 200;
    public static final int CATEGORY_MAX = 64;
    public static final int TAGS_MAX = 255;
    public static final int SUMMARY_MAX = 1000;
    public static final int URL_MAX = 500;
    /** 查閱停留秒上限：4 小時，超出視為掛頁未上報 */
    public static final int VIEW_DURATION_MAX = 4 * 3600;

    public static final Map<Integer, String> TYPE_LABEL = Map.of(
            TYPE_DOC, "在線文檔", TYPE_SHEET, "表格", TYPE_SLIDE, "幻燈片",
            TYPE_PDF, "PDF", TYPE_LINK, "外部鏈接");
    public static final Map<Integer, String> STATUS_LABEL = Map.of(
            STATUS_DRAFT, "草稿", STATUS_REVIEWING, "評審中",
            STATUS_PUBLISHED, "已發布", STATUS_ARCHIVED, "已歸檔");
}
