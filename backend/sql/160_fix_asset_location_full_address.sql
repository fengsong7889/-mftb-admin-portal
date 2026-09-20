-- v15: 修复已有资产的 location 字段，补充完整地址（城市+区县+详细地址）
-- 此前后端只存储仓库名，现改为「仓库名（城市区县详细地址）」格式

-- 1. 更新 biz_eam_asset 的 location 字段，关联 eam_location 表拼接完整地址
UPDATE biz_eam_asset a
INNER JOIN biz_eam_location loc ON a.location_id = loc.id
SET a.location = CONCAT(
    loc.name,
    '（',
    CONCAT_WS('',
        IFNULL(loc.city, ''),
        IFNULL(loc.district, ''),
        IFNULL(loc.address, '')
    ),
    '）'
)
WHERE a.location_id IS NOT NULL
  AND a.deleted = 0
  AND (loc.city IS NOT NULL OR loc.district IS NOT NULL OR loc.address IS NOT NULL)
  AND a.location NOT LIKE '%（%）';
