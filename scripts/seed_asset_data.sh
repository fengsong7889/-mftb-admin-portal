#!/bin/bash
# 资产基础数据批量灌入脚本
# 分类 → 品牌 → 产品型号 → 参数类型 → 参数值

BASE="http://localhost:8080"

# 1. 获取 Token
echo "=== 获取认证 Token ==="
TOKEN=$(curl -s "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"username":"MF00001","password":"111222"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "ERROR: 获取 Token 失败"
  exit 1
fi
echo "Token: ${TOKEN:0:30}..."
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

# 辅助函数
post() { curl -s "$BASE$1" -H "$AUTH" -H "$CT" -d "$2"; }
api_post() {
  local result=$(post "$1" "$2")
  local id=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',''))" 2>/dev/null)
  echo "$id"
}

echo ""
echo "=== 1. 创建资产分类 ==="

# 顶级分类: IT设备
CAT_IT=$(api_post "/api/eam/basic/categories" '{"code":"01","name":"IT设备","parentId":0,"status":"enabled","sort":1,"remark":"所有IT相关设备"}')
echo "IT设备 分类ID: $CAT_IT"

# 子分类: 手机
CAT_PHONE=$(api_post "/api/eam/basic/categories" '{"code":"0101","name":"手机","parentId":'"$CAT_IT"',"status":"enabled","sort":1,"remark":"智能手机"}')
echo "手机 分类ID: $CAT_PHONE"

# 子分类: 笔记本电脑
CAT_LAPTOP=$(api_post "/api/eam/basic/categories" '{"code":"0102","name":"笔记本电脑","parentId":'"$CAT_IT"',"status":"enabled","sort":2,"remark":"笔记本/笔电"}')
echo "笔记本电脑 分类ID: $CAT_LAPTOP"

# 子分类: 台式电脑
CAT_DESKTOP=$(api_post "/api/eam/basic/categories" '{"code":"0103","name":"台式电脑","parentId":'"$CAT_IT"',"status":"enabled","sort":3,"remark":"台式机/一体机"}')
echo "台式电脑 分类ID: $CAT_DESKTOP"

# 子分类: 平板电脑
CAT_TABLET=$(api_post "/api/eam/basic/categories" '{"code":"0104","name":"平板电脑","parentId":'"$CAT_IT"',"status":"enabled","sort":4,"remark":"平板电脑"}')
echo "平板电脑 分类ID: $CAT_TABLET"

echo ""
echo "=== 2. 创建品牌: 苹果 ==="
BRAND_APPLE=$(api_post "/api/eam/basic/brands" '{"categoryCode":"01","brandZh":"苹果","brandEn":"Apple","brandLogo":"https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"}')
echo "苹果 品牌ID: $BRAND_APPLE"

echo ""
echo "=== 3. 创建产品型号 ==="

# --- 手机 ---
echo "--- 手机 ---"
MODELS_PHONE=(
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3287","name":"iPhone 16","unit":"台","refPrice":5999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3288","name":"iPhone 16 Plus","unit":"台","refPrice":6999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3293","name":"iPhone 16 Pro","unit":"台","refPrice":7999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3294","name":"iPhone 16 Pro Max","unit":"台","refPrice":9999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3090","name":"iPhone 15","unit":"台","refPrice":4999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3091","name":"iPhone 15 Plus","unit":"台","refPrice":5999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3101","name":"iPhone 15 Pro","unit":"台","refPrice":7999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3102","name":"iPhone 15 Pro Max","unit":"台","refPrice":9999.00}'
  '{"categoryCode":"0101","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3184","name":"iPhone SE (第三代)","unit":"台","refPrice":3499.00}'
)
for m in "${MODELS_PHONE[@]}"; do
  id=$(api_post "/api/eam/basic/models" "$m")
  name=$(echo "$m" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  $name -> ID: $id"
done

# --- 笔记本电脑 ---
echo "--- 笔记本电脑 ---"
MODELS_LAPTOP=(
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXCT3","name":"MacBook Air 13寸 (M4)","unit":"台","refPrice":8999.00}'
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXCV3","name":"MacBook Air 15寸 (M4)","unit":"台","refPrice":10499.00}'
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXK63","name":"MacBook Pro 14寸 (M4)","unit":"台","refPrice":12999.00}'
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXK83","name":"MacBook Pro 14寸 (M4 Pro)","unit":"台","refPrice":16999.00}'
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXK53","name":"MacBook Pro 16寸 (M4 Pro)","unit":"台","refPrice":19999.00}'
  '{"categoryCode":"0102","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXK73","name":"MacBook Pro 16寸 (M4 Max)","unit":"台","refPrice":27999.00}'
)
for m in "${MODELS_LAPTOP[@]}"; do
  id=$(api_post "/api/eam/basic/models" "$m")
  name=$(echo "$m" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  $name -> ID: $id"
done

# --- 台式电脑 ---
echo "--- 台式电脑 ---"
MODELS_DESKTOP=(
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXCT4","name":"iMac 24寸 (M4)","unit":"台","refPrice":10999.00}'
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXCY4","name":"Mac mini (M4)","unit":"台","refPrice":4499.00}'
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXD03","name":"Mac mini (M4 Pro)","unit":"台","refPrice":9999.00}'
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXW73","name":"Mac Studio (M4 Max)","unit":"台","refPrice":16999.00}'
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MXW83","name":"Mac Studio (M4 Ultra)","unit":"台","refPrice":32999.00}'
  '{"categoryCode":"0103","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"MNWK3","name":"Mac Pro (M2 Ultra)","unit":"台","refPrice":55999.00}'
)
for m in "${MODELS_DESKTOP[@]}"; do
  id=$(api_post "/api/eam/basic/models" "$m")
  name=$(echo "$m" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  $name -> ID: $id"
done

# --- 平板电脑 ---
echo "--- 平板电脑 ---"
MODELS_TABLET=(
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A2837","name":"iPad Pro 13寸 (M4)","unit":"台","refPrice":8999.00}'
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A2836","name":"iPad Pro 11寸 (M4)","unit":"台","refPrice":6799.00}'
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3271","name":"iPad Air 13寸 (M3)","unit":"台","refPrice":6499.00}'
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3270","name":"iPad Air 11寸 (M3)","unit":"台","refPrice":4799.00}'
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3162","name":"iPad (第十代)","unit":"台","refPrice":3499.00}'
  '{"categoryCode":"0104","brandId":'"$BRAND_APPLE"',"brandZh":"苹果","brandEn":"Apple","modelNo":"A3156","name":"iPad mini (A17 Pro)","unit":"台","refPrice":3999.00}'
)
for m in "${MODELS_TABLET[@]}"; do
  id=$(api_post "/api/eam/basic/models" "$m")
  name=$(echo "$m" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo "  $name -> ID: $id"
done

echo ""
echo "=== 4. 创建参数类型 ==="

# --- 手机参数类型 ---
echo "--- 手机参数 ---"
PT_PHONE_CHIP=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0101","code":"chip","name":"芯片","unit":"","valueType":"select","sort":1}')
echo "  芯片 -> ID: $PT_PHONE_CHIP"
PT_PHONE_MEM=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0101","code":"memory","name":"内存","unit":"GB","valueType":"select","sort":2}')
echo "  内存 -> ID: $PT_PHONE_MEM"
PT_PHONE_STOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0101","code":"storage","name":"存储","unit":"GB","valueType":"select","sort":3}')
echo "  存储 -> ID: $PT_PHONE_STOR"
PT_PHONE_SCR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0101","code":"screen","name":"屏幕尺寸","unit":"英寸","valueType":"select","sort":4}')
echo "  屏幕尺寸 -> ID: $PT_PHONE_SCR"
PT_PHONE_COLOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0101","code":"color","name":"颜色","unit":"","valueType":"select","sort":5}')
echo "  颜色 -> ID: $PT_PHONE_COLOR"

# --- 笔记本电脑参数类型 ---
echo "--- 笔记本电脑参数 ---"
PT_LAP_CHIP=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0102","code":"chip","name":"芯片","unit":"","valueType":"select","sort":1}')
echo "  芯片 -> ID: $PT_LAP_CHIP"
PT_LAP_MEM=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0102","code":"memory","name":"内存","unit":"GB","valueType":"select","sort":2}')
echo "  内存 -> ID: $PT_LAP_MEM"
PT_LAP_STOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0102","code":"storage","name":"存储","unit":"GB","valueType":"select","sort":3}')
echo "  存储 -> ID: $PT_LAP_STOR"
PT_LAP_SCR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0102","code":"screen","name":"屏幕尺寸","unit":"英寸","valueType":"select","sort":4}')
echo "  屏幕尺寸 -> ID: $PT_LAP_SCR"
PT_LAP_GPU=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0102","code":"gpu","name":"图形处理器","unit":"","valueType":"select","sort":5}')
echo "  图形处理器 -> ID: $PT_LAP_GPU"

# --- 台式电脑参数类型 ---
echo "--- 台式电脑参数 ---"
PT_DES_CHIP=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0103","code":"chip","name":"芯片","unit":"","valueType":"select","sort":1}')
echo "  芯片 -> ID: $PT_DES_CHIP"
PT_DES_MEM=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0103","code":"memory","name":"内存","unit":"GB","valueType":"select","sort":2}')
echo "  内存 -> ID: $PT_DES_MEM"
PT_DES_STOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0103","code":"storage","name":"存储","unit":"GB","valueType":"select","sort":3}')
echo "  存储 -> ID: $PT_DES_STOR"
PT_DES_GPU=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0103","code":"gpu","name":"图形处理器","unit":"","valueType":"select","sort":4}')
echo "  图形处理器 -> ID: $PT_DES_GPU"

# --- 平板电脑参数类型 ---
echo "--- 平板电脑参数 ---"
PT_TAB_CHIP=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0104","code":"chip","name":"芯片","unit":"","valueType":"select","sort":1}')
echo "  芯片 -> ID: $PT_TAB_CHIP"
PT_TAB_MEM=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0104","code":"memory","name":"内存","unit":"GB","valueType":"select","sort":2}')
echo "  内存 -> ID: $PT_TAB_MEM"
PT_TAB_STOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0104","code":"storage","name":"存储","unit":"GB","valueType":"select","sort":3}')
echo "  存储 -> ID: $PT_TAB_STOR"
PT_TAB_SCR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0104","code":"screen","name":"屏幕尺寸","unit":"英寸","valueType":"select","sort":4}')
echo "  屏幕尺寸 -> ID: $PT_TAB_SCR"
PT_TAB_COLOR=$(api_post "/api/eam/basic/param-types" '{"categoryCode":"0104","code":"color","name":"颜色","unit":"","valueType":"select","sort":5}')
echo "  颜色 -> ID: $PT_TAB_COLOR"

echo ""
echo "=== 5. 创建参数值 ==="

# 辅助函数：批量创建参数值
create_values() {
  local type_code=$1
  local cat_code=$2
  shift 2
  local i=1
  for val in "$@"; do
    api_post "/api/eam/basic/param-values" "{\"paramTypeCode\":\"$type_code\",\"categoryCode\":\"$cat_code\",\"value\":\"$val\",\"sort\":$i}" > /dev/null
    i=$((i+1))
  done
  echo "  $type_code: $((i-1)) 个值"
}

# --- 手机参数值 ---
echo "--- 手机参数值 ---"
create_values "chip" "0101" "A18" "A18 Pro" "A17 Pro" "A16 Bionic" "A15 Bionic"
create_values "memory" "0101" "4" "6" "8"
create_values "storage" "0101" "128" "256" "512" "1024"
create_values "screen" "0101" "6.1" "6.5" "6.7" "6.9" "4.7"
create_values "color" "0101" "黑色" "白色" "蓝色" "粉色" "绿色" "沙漠钛色" "原色钛色" "蓝色钛色" "白色钛色" "自然钛色" "红色" "黄色" "紫色" "橙色" "星光色"

# --- 笔记本电脑参数值 ---
echo "--- 笔记本电脑参数值 ---"
create_values "chip" "0102" "Apple M4" "Apple M4 Pro" "Apple M4 Max" "Apple M3" "Apple M3 Pro" "Apple M3 Max"
create_values "memory" "0102" "8" "16" "24" "32" "36" "48" "64" "128"
create_values "storage" "0102" "256" "512" "1024" "2048" "4096" "8192"
create_values "screen" "0102" "13.6" "14.2" "15.3" "16.2"
create_values "gpu" "0102" "Apple M4 8核" "Apple M4 10核" "Apple M4 Pro 14核" "Apple M4 Pro 16核" "Apple M4 Max 32核" "Apple M4 Max 40核"

# --- 台式电脑参数值 ---
echo "--- 台式电脑参数值 ---"
create_values "chip" "0103" "Apple M4" "Apple M4 Pro" "Apple M4 Max" "Apple M4 Ultra" "Apple M2 Ultra"
create_values "memory" "0103" "16" "24" "32" "48" "64" "96" "128" "192"
create_values "storage" "0103" "256" "512" "1024" "2048" "4096" "8192"
create_values "gpu" "0103" "Apple M4 8核" "Apple M4 10核" "Apple M4 Pro 14核" "Apple M4 Pro 16核" "Apple M4 Max 32核" "Apple M4 Max 40核" "Apple M4 Ultra 60核" "Apple M4 Ultra 80核"

# --- 平板电脑参数值 ---
echo "--- 平板电脑参数值 ---"
create_values "chip" "0104" "Apple M4" "Apple M3" "Apple M2" "Apple A16 Bionic" "Apple A17 Pro"
create_values "memory" "0104" "4" "6" "8" "16"
create_values "storage" "0104" "64" "128" "256" "512" "1024" "2048"
create_values "screen" "0104" "11" "13" "10.9"
create_values "color" "0104" "深空黑色" "银色" "紫色" "蓝色" "粉色" "黄色" "星光色" "紫色"

echo ""
echo "=== 6. 更新分类参数模板 JSON ==="
# 为每个分类设置 paramTemplate（供资产新增页面动态渲染参数表单）

PHONE_TEMPLATE='[{"key":"chip","label":"芯片","type":"select","options":["A18","A18 Pro","A17 Pro","A16 Bionic","A15 Bionic"]},{"key":"memory","label":"内存","type":"select","unit":"GB","options":["4","6","8"]},{"key":"storage","label":"存储","type":"select","unit":"GB","options":["128","256","512","1024"]},{"key":"screen","label":"屏幕尺寸","type":"select","unit":"英寸","options":["6.1","6.5","6.7","6.9","4.7"]},{"key":"color","label":"颜色","type":"select","options":["黑色","白色","蓝色","粉色","绿色","沙漠钛色","原色钛色","蓝色钛色","白色钛色","自然钛色","红色","黄色","紫色","橙色","星光色"]}]'

LAPTOP_TEMPLATE='[{"key":"chip","label":"芯片","type":"select","options":["Apple M4","Apple M4 Pro","Apple M4 Max","Apple M3","Apple M3 Pro","Apple M3 Max"]},{"key":"memory","label":"内存","type":"select","unit":"GB","options":["8","16","24","32","36","48","64","128"]},{"key":"storage","label":"存储","type":"select","unit":"GB","options":["256","512","1024","2048","4096","8192"]},{"key":"screen","label":"屏幕尺寸","type":"select","unit":"英寸","options":["13.6","14.2","15.3","16.2"]},{"key":"gpu","label":"图形处理器","type":"select","options":["Apple M4 8核","Apple M4 10核","Apple M4 Pro 14核","Apple M4 Pro 16核","Apple M4 Max 32核","Apple M4 Max 40核"]}]'

DESKTOP_TEMPLATE='[{"key":"chip","label":"芯片","type":"select","options":["Apple M4","Apple M4 Pro","Apple M4 Max","Apple M4 Ultra","Apple M2 Ultra"]},{"key":"memory","label":"内存","type":"select","unit":"GB","options":["16","24","32","48","64","96","128","192"]},{"key":"storage","label":"存储","type":"select","unit":"GB","options":["256","512","1024","2048","4096","8192"]},{"key":"gpu","label":"图形处理器","type":"select","options":["Apple M4 8核","Apple M4 10核","Apple M4 Pro 14核","Apple M4 Pro 16核","Apple M4 Max 32核","Apple M4 Max 40核","Apple M4 Ultra 60核","Apple M4 Ultra 80核"]}]'

TABLET_TEMPLATE='[{"key":"chip","label":"芯片","type":"select","options":["Apple M4","Apple M3","Apple M2","Apple A16 Bionic","Apple A17 Pro"]},{"key":"memory","label":"内存","type":"select","unit":"GB","options":["4","6","8","16"]},{"key":"storage","label":"存储","type":"select","unit":"GB","options":["64","128","256","512","1024","2048"]},{"key":"screen","label":"屏幕尺寸","type":"select","unit":"英寸","options":["11","13","10.9"]},{"key":"color","label":"颜色","type":"select","options":["深空黑色","银色","紫色","蓝色","粉色","黄色","星光色"]}]'

# 更新分类的 paramTemplate
curl -s -X PUT "$BASE/api/eam/basic/categories/$CAT_PHONE" -H "$AUTH" -H "$CT" \
  -d "{\"paramTemplate\":$(echo "$PHONE_TEMPLATE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('手机模板更新:', d.get('code'))"

curl -s -X PUT "$BASE/api/eam/basic/categories/$CAT_LAPTOP" -H "$AUTH" -H "$CT" \
  -d "{\"paramTemplate\":$(echo "$LAPTOP_TEMPLATE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('笔记本电脑模板更新:', d.get('code'))"

curl -s -X PUT "$BASE/api/eam/basic/categories/$CAT_DESKTOP" -H "$AUTH" -H "$CT" \
  -d "{\"paramTemplate\":$(echo "$DESKTOP_TEMPLATE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('台式电脑模板更新:', d.get('code'))"

curl -s -X PUT "$BASE/api/eam/basic/categories/$CAT_TABLET" -H "$AUTH" -H "$CT" \
  -d "{\"paramTemplate\":$(echo "$TABLET_TEMPLATE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('平板电脑模板更新:', d.get('code'))"

echo ""
echo "=== 完成! 数据灌入成功 ==="
