-- 233: 文檔中心（doc）建表：doc_space / doc_node / doc_view_log
--      一次性參考文檔；實際執行與冪等由 DocSchemaMigrationInitializer（doc:schema:v1.0）負責。
--      口徑：騰訊文檔為內容中台（正文單一事實源），本庫只存元數據索引與查閱留痕；
--      枚舉字段整型存儲（doc_type/status），前端映射字符串枚舉，見 DocConstants。

CREATE TABLE IF NOT EXISTS doc_space (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    name VARCHAR(64) NOT NULL COMMENT '空間名稱',
    icon VARCHAR(16) DEFAULT NULL COMMENT '空間圖標（emoji）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
    description VARCHAR(255) DEFAULT NULL COMMENT '空間說明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    KEY idx_doc_space_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-文檔空間（知識域：需求/人事/行政/制度/培訓）';

CREATE TABLE IF NOT EXISTS doc_node (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    space_id BIGINT NOT NULL COMMENT '所屬空間ID',
    category VARCHAR(64) NOT NULL DEFAULT '未分類' COMMENT '文檔分類',
    title VARCHAR(200) NOT NULL COMMENT '文檔標題',
    doc_type TINYINT NOT NULL DEFAULT 1 COMMENT '類型: 1=在線文檔 2=表格 3=幻燈片 4=PDF 5=外部鏈接',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '狀態: 1=草稿 2=評審中 3=已發布 4=已歸檔',
    tags VARCHAR(255) DEFAULT NULL COMMENT '標籤（逗號分隔）',
    owner_user_id BIGINT DEFAULT NULL COMMENT '負責人用戶ID',
    owner_name VARCHAR(64) DEFAULT NULL COMMENT '負責人姓名（冗餘快照）',
    tencent_file_id VARCHAR(64) DEFAULT NULL COMMENT '騰訊文檔fileID（同步寫入；手工登記為空）',
    tencent_url VARCHAR(500) NOT NULL COMMENT '騰訊文檔鏈接（閱讀出口）',
    biz_type VARCHAR(16) DEFAULT NULL COMMENT '業務掛接類型: REQ=產研交付需求單',
    biz_id BIGINT DEFAULT NULL COMMENT '業務掛接ID',
    summary VARCHAR(1000) DEFAULT NULL COMMENT '文檔摘要',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    KEY idx_doc_node_space (space_id, deleted),
    KEY idx_doc_node_biz (biz_type, biz_id),
    KEY idx_doc_node_file (tencent_file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-文檔元數據索引（正文在騰訊文檔側）';

CREATE TABLE IF NOT EXISTS doc_view_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    node_id BIGINT NOT NULL COMMENT '文檔ID',
    user_id BIGINT DEFAULT NULL COMMENT '查閱人用戶ID',
    user_name VARCHAR(64) DEFAULT NULL COMMENT '查閱人姓名',
    department VARCHAR(128) DEFAULT NULL COMMENT '部門（快照）',
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '查閱時間',
    duration_sec INT DEFAULT NULL COMMENT '停留時長秒（頁面離開時上報，可空）',
    KEY idx_doc_view_log_node (node_id, viewed_at),
    KEY idx_doc_view_log_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-查閱審計留痕（培訓完成度口徑）';
