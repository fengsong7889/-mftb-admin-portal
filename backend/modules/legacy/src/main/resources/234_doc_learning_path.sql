-- 234: 文檔中心學習路徑（新人入職包/培訓學習地圖）
--      一次性參考文檔；實際執行與冪等由 DocSchemaMigrationInitializer（doc:learning:v1.0）負責。
--      口徑：路徑 = 有序的策展文檔清單；「已讀」不另建進度表，直接由 doc_view_log
--      （詳情頁打開即留痕）按「本人 × 文檔」推導，避免雙寫漂移。

CREATE TABLE IF NOT EXISTS doc_learning_path (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    name VARCHAR(64) NOT NULL COMMENT '路徑名稱',
    description VARCHAR(255) DEFAULT NULL COMMENT '路徑說明',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1=啟用 0=停用（停用後僅管理側可見）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    KEY idx_doc_learning_path_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-學習路徑（新人入職包/培訓清單）';

CREATE TABLE IF NOT EXISTS doc_learning_path_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵ID',
    path_id BIGINT NOT NULL COMMENT '所屬路徑ID',
    node_id BIGINT NOT NULL COMMENT '文檔ID（doc_node.id）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '路徑內順序（小在前）',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '創建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最後更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '創建時間',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
    KEY idx_doc_learning_item_path (path_id, sort_order),
    KEY idx_doc_learning_item_node (node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='DOC-學習路徑條目（有序文檔清單）';
