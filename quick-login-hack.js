// ============================================================
// MFTB Admin - 快速验证脚本（临时跳过登录）
// 使用说明：
// 1. 打开 http://localhost:3000
// 2. 按 F12 打开开发者工具 Console
// 3. 粘贴并执行以下代码
// ============================================================

(function quickLoginHack() {
  console.log('🚀 正在启动快速验证模式...');
  
  // 创建模拟用户数据
  const mockUser = {
    id: 1,
    username: 'MF00001',
    name: 'Bee',
    empId: 'MF00001',
    avatar: 'pikachu-wink',
    role: 'admin' as 'admin' | 'guest',
    department: '董事长兼首席执行官办公室',
    departmentEn: 'Office of the Chairman and Chief Executive Officer',
    position: '首席执行官',
    positionEn: 'CEO',
    jobLevel: 'M12',
    functionRoles: ['account-balance', 'batch-query', 'detail-query', 'approval-center'],
  };
  
  // 保存到 localStorage
  localStorage.setItem('user_info', JSON.stringify(mockUser));
  localStorage.setItem('is_authenticated', 'true');
  localStorage.setItem('mftb_token', 'test_token_for_validation');
  
  console.log('✅ 模拟登录成功！');
  console.table({
    '用户名': mockUser.username,
    '姓名': mockUser.name,
    '职位': mockUser.position,
    '部门': mockUser.department,
    '角色': mockUser.role,
  });
  
  console.log('💡 现在可以刷新页面或直接访问：http://localhost:3000/ai-model-provider');
  console.log('🎉 查看 AI 智能中心菜单和四个新页面的展示效果！');
  
  // 自动刷新当前页面（可选）
  // window.location.reload();
})();
