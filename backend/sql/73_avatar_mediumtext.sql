-- 头像字段扩容：支持 base64 Data URL / DiceBear URL 等长文本存储
ALTER TABLE sys_user MODIFY COLUMN avatar MEDIUMTEXT COMMENT '头像（pikachu expression / dicebear URL / base64）';
