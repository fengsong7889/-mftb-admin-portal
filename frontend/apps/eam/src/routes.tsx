/**
 * EAM 应用的路由表（方案 §4.1：路由随应用走）。
 *
 * 由 scripts/split-app-routes.mjs 从 src/App.tsx 搬迁生成；路径、元素与包裹顺序与原壳逐字一致。
 * 门户壳只负责布局/会话/菜单与「装配这些路由」，不再持有本应用的具体页面。
 */
import { lazy, type ReactElement } from 'react'
import { Route } from 'react-router-dom'

const AssetAdd = lazy(() => import('./pages/AssetManagement/AssetAdd'))
const AssetBorrow = lazy(() => import('./pages/AssetManagement/AssetBorrow'))
const AssetCategory = lazy(() => import('./pages/AssetManagement/AssetCategory'))
const AssetClaim = lazy(() => import('./pages/AssetManagement/AssetClaim'))
const AssetCompensation = lazy(() => import('./pages/AssetManagement/AssetCompensation'))
const AssetDashboard = lazy(() => import('./pages/AssetManagement/AssetDashboard'))
const AssetDetail = lazy(() => import('./pages/AssetManagement/AssetDetail'))
const AssetFlow = lazy(() => import('./pages/AssetManagement/AssetFlow'))
const AssetHandover = lazy(() => import('./pages/AssetManagement/AssetHandover'))
const AssetInbound = lazy(() => import('./pages/AssetManagement/AssetInbound'))
const AssetInventory = lazy(() => import('./pages/AssetManagement/AssetInventory'))
const AssetList = lazy(() => import('./pages/AssetManagement/AssetList'))
const AssetLocation = lazy(() => import('./pages/AssetManagement/AssetLocation'))
const AssetLoss = lazy(() => import('./pages/AssetManagement/AssetLoss'))
const AssetModel = lazy(() => import('./pages/AssetManagement/AssetModel'))
const AssetRepair = lazy(() => import('./pages/AssetManagement/AssetRepair'))
const AssetReturn = lazy(() => import('./pages/AssetManagement/AssetReturn'))
const AssetScrap = lazy(() => import('./pages/AssetManagement/AssetScrap'))
const AssetSupplier = lazy(() => import('./pages/AssetManagement/AssetSupplier'))
const AssetTag = lazy(() => import('./pages/AssetManagement/AssetTag'))
const AssetTagPrint = lazy(() => import('./pages/AssetManagement/AssetTagPrint'))
const AssetTransfer = lazy(() => import('./pages/AssetManagement/AssetTransfer'))
const AssetTransferList = lazy(() => import('./pages/AssetManagement/AssetTransferList'))
const ConsumableAlert = lazy(() => import('./pages/Consumable/Alert'))
const ConsumableClaim = lazy(() => import('./pages/Consumable/Claim'))
const ConsumableDashboard = lazy(() => import('./pages/Consumable/Dashboard'))
const ConsumableInbound = lazy(() => import('./pages/Consumable/Inbound'))
const ConsumableItem = lazy(() => import('./pages/Consumable/Item'))
const ConsumableReport = lazy(() => import('./pages/Consumable/Report'))
const ConsumableStock = lazy(() => import('./pages/Consumable/Stock'))
const ConsumableStockTxn = lazy(() => import('./pages/Consumable/Stock/StockTxnDetail'))
const ConsumableStockTxnList = lazy(() => import('./pages/Consumable/Stock/StockTxnList'))
const MyAssets = lazy(() => import('./pages/MyAssets'))
const MyClaims = lazy(() => import('./pages/AssetManagement/AssetClaim/MyClaims'))
const MyVehicleUse = lazy(() => import('./pages/VehicleManagement/MyVehicleUse'))
const ParamLibrary = lazy(() => import('./pages/AssetManagement/ParamLibrary'))
const PurchaseOrder = lazy(() => import('./pages/AssetManagement/PurchaseOrder'))
const TransferCancel = lazy(() => import('./pages/AssetManagement/AssetTransfer/TransferCancel'))
const TransferDetail = lazy(() => import('./pages/AssetManagement/AssetTransfer/TransferDetail'))
const VehicleDispatch = lazy(() => import('./pages/VehicleManagement/VehicleDispatch'))
const VehicleFiles = lazy(() => import('./pages/VehicleManagement/VehicleFiles'))
const VehicleLedger = lazy(() => import('./pages/VehicleManagement/VehicleLedger'))
const VehicleMasterData = lazy(() => import('./pages/VehicleManagement/VehicleMasterData'))

export const EAM_ROUTES: ReactElement[] = [
  <Route path="/asset-list"       element={<AssetList />} />,
  <Route path="/asset-add"        element={<AssetAdd />} />,
  <Route path="/asset-detail"     element={<AssetDetail />} />,
  <Route path="/asset-scrap"      element={<AssetScrap />} />,
  <Route path="/asset-repair"     element={<AssetRepair />} />,
  <Route path="/asset-loss"      element={<AssetLoss />} />,
  <Route path="/asset-transfer"   element={<AssetTransfer />} />,
  <Route path="/asset-transfer/detail" element={<TransferDetail />} />,
  <Route path="/asset-transfer/cancel" element={<TransferCancel />} />,
  <Route path="/asset-inventory"  element={<AssetInventory />} />,
  <Route path="/asset-dashboard"  element={<AssetDashboard />} />,
  <Route path="/asset-category"   element={<AssetCategory />} />,
  <Route path="/asset-model"      element={<AssetModel />} />,
  <Route path="/asset-location"   element={<AssetLocation />} />,
  <Route path="/param-library"    element={<ParamLibrary />} />,
  <Route path="/asset-supplier"   element={<AssetSupplier />} />,
  <Route path="/asset-tag"      element={<AssetTag />} />,
  <Route path="/asset-tag-print" element={<AssetTagPrint />} />,
  <Route path="/consumable-dashboard" element={<ConsumableDashboard />} />,
  <Route path="/consumable-item"      element={<ConsumableItem />} />,
  <Route path="/consumable-claim"     element={<ConsumableClaim />} />,
  <Route path="/consumable-stock"     element={<ConsumableStock />} />,
  <Route path="/consumable-stock/txn" element={<ConsumableStockTxn />} />,
  <Route path="/consumable-stock-txn" element={<ConsumableStockTxnList />} />,
  <Route path="/consumable-alert"     element={<ConsumableAlert />} />,
  <Route path="/consumable-inbound"   element={<ConsumableInbound />} />,
  <Route path="/consumable-report"    element={<ConsumableReport />} />,
  <Route path="/purchase-order"   element={<PurchaseOrder />} />,
  <Route path="/asset-inbound"    element={<AssetInbound />} />,
  <Route path="/asset-claim"      element={<AssetClaim />} />,
  <Route path="/asset-claim/add"    element={<AssetClaim />} />,
  <Route path="/asset-claim/detail" element={<AssetClaim />} />,
  <Route path="/asset-claim/record" element={<AssetClaim />} />,
  <Route path="/asset-borrow"     element={<AssetBorrow />} />,
  <Route path="/asset-borrow/add"   element={<AssetBorrow />} />,
  <Route path="/asset-borrow/detail" element={<AssetBorrow />} />,
  <Route path="/asset-borrow/renew" element={<AssetBorrow />} />,
  <Route path="/asset-return"     element={<AssetReturn />} />,
  <Route path="/asset-return/add"   element={<AssetReturn />} />,
  <Route path="/asset-return/detail" element={<AssetReturn />} />,
  <Route path="/asset-return/dispose" element={<AssetReturn />} />,
  <Route path="/asset-return/recover" element={<AssetReturn />} />,
  <Route path="/asset-compensation" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/detail" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/liability" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/waive" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/payment" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/refund" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/review" element={<AssetCompensation />} />,
  <Route path="/asset-compensation/add" element={<AssetCompensation />} />,
  <Route path="/my-assets"        element={<MyAssets />} />,
  <Route path="/my-claims"        element={<MyClaims />} />,
  <Route path="/asset-transfer-list" element={<AssetTransferList />} />,
  <Route path="/asset-handover"        element={<AssetHandover />} />,
  <Route path="/asset-handover/add"    element={<AssetHandover />} />,
  <Route path="/asset-handover/detail" element={<AssetHandover />} />,
  <Route path="/asset-flow"       element={<AssetFlow />} />,
  <Route path="/vehicle-files" element={<VehicleFiles />} />,
  <Route path="/vehicle-files/add" element={<VehicleFiles />} />,
  <Route path="/vehicle-files/edit" element={<VehicleFiles />} />,
  <Route path="/vehicle-files/detail" element={<VehicleFiles />} />,
  <Route path="/vehicle-files/qualification" element={<VehicleFiles />} />,
  <Route path="/my-vehicle-use" element={<MyVehicleUse />} />,
  <Route path="/my-vehicle-use/apply" element={<MyVehicleUse />} />,
  <Route path="/my-vehicle-use/detail" element={<MyVehicleUse />} />,
  <Route path="/vehicle-dispatch" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/assign" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/direct" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/depart" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/return" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/confirm" element={<VehicleDispatch />} />,
  <Route path="/vehicle-dispatch/detail" element={<VehicleDispatch />} />,
  <Route path="/vehicle-ledger" element={<VehicleLedger />} />,
  <Route path="/vehicle-ledger/detail" element={<VehicleLedger />} />,
  <Route path="/vehicle-ledger/correct" element={<VehicleLedger />} />,
  <Route path="/vehicle-master-data" element={<VehicleMasterData />} />,
  <Route path="/vehicle-master-data/add" element={<VehicleMasterData />} />,
  <Route path="/vehicle-master-data/edit" element={<VehicleMasterData />} />,
  <Route path="/vehicle-ledger/backfill" element={<VehicleLedger />} />,
]
