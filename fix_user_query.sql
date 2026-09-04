-- 临时修复：在 SysUser 实体中添加 selectByUsername 方法的支持
-- 或者手动修改 MyBatis XML 或 Mapper Interface

-- 最快的修复方式：使用 JdbcTemplate 直接查询
-- 需要在 AuthController 中注入 JdbcTemplate 而不是只依赖 SysUserMapper
