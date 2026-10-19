-- 259: 验收用例补证据附件列（截图 / 记录链接正文），支撑「用例级上传图片」
-- 参考文档：实际执行由 RdmSchemaMigrationInitializer 走 rdm:schema:v3.13
--          （columnExists 逐列先查再加 + 后置校验列就绪）完成。
-- 说明：本脚本只做 ADD COLUMN，不含任何破坏性操作。
--      ADD COLUMN 不可重放（重跑必撞 duplicate column），故 Java 侧逐列先查。
--
-- 存储口径：沿用 205（RDM 附件 Base64 Data URL 存 MEDIUMTEXT）——服务端不落盘，
--          避免为原型阶段引入对象存储与静态资源目录配置。
-- 列内容：JSON 数组 [{"name":"shot.png","type":"image/png","size":123456,"dataUrl":"data:image/png;base64,..."}]
-- 读取口径：验收历史接口的用例明细**只回元信息（name/type/size）**，不回 dataUrl 正文；
--          正文经 GET /rdm/acceptance/case/{caseId}/evidence/{index} 单张按需取，
--          否则返工数轮 × 十余条用例 × 数张图会把一次列表请求撑到几十 MB。

ALTER TABLE rdm_acceptance_case
    ADD COLUMN evidence_json MEDIUMTEXT DEFAULT NULL COMMENT '驗收證據附件JSON: [{name,type,size,dataUrl}]，列表僅回元信息，正文按需單張取';
