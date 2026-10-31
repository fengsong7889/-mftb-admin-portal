/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { Alert, Button } from 'antd'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { icon, type DragEndEvent } from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png?url'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png?url'
import 'leaflet/dist/leaflet.css'
import type { Coordinate, StoreResult } from './types'

const markerIcon = icon({ iconUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] })
function PickEvents({ point, onPick }: { point: Coordinate; onPick: (point: Coordinate) => void }) {
  useMapEvents({ click: event => onPick({ lat: Number(event.latlng.lat.toFixed(6)), lng: Number(event.latlng.lng.toFixed(6)) }) })
  const map = useMap()
  useEffect(() => { if (!map.getBounds().contains([point.lat, point.lng])) map.panTo([point.lat, point.lng]) }, [map, point.lat, point.lng])
  return null
}
export default function LocationMap({ pointA, pointB, stores, selected, onPick, onStore }: {
  pointA: Coordinate; pointB: Coordinate; stores: StoreResult[]; selected: string; onPick: (point: Coordinate) => void; onStore: (id: string) => void
}) {
  const [tileFailed, setTileFailed] = useState(false)
  const [tileKey, setTileKey] = useState(0)
  const [tiles, setTiles] = useState(true)
  const store = stores.find(s => s.storeId === selected)
  return <div>
    {tileFailed && <Alert type="warning" message="部分底圖載入失敗；座標及結果仍可使用" action={<Button size="small" onClick={() => { setTileFailed(false); setTileKey(k => k + 1) }}>重試底圖</Button>} />}
    <div className="organic__map" aria-label="模擬定位地圖">
      <MapContainer center={[22.17, 113.555]} zoom={12} scrollWheelZoom={false}>
        {/* 底图使用WGS84/Web Mercator，避免将WGS84样例直接叠加到GCJ-02底图。 */}
        {tiles && <TileLayer key={tileKey} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' eventHandlers={{ tileerror: () => setTileFailed(true) }} />}
        <PickEvents point={pointB} onPick={onPick} />
        {stores.filter(s => s.coordinate).map(s => <CircleMarker key={s.storeId} bubblingMouseEvents={false} center={[s.coordinate!.lat, s.coordinate!.lng]} radius={s.storeId === selected ? 8 : 3} pathOptions={{ color: s.storeId === selected ? '#E8720C' : '#1890FF', fillOpacity: 0.75, weight: 1 }} eventHandlers={{ click: () => onStore(s.storeId) }}><Popup>{s.storeName}<br />{s.storeCode} · 虛擬門店</Popup></CircleMarker>)}
        <CircleMarker bubblingMouseEvents={false} center={[pointA.lat, pointA.lng]} radius={10} pathOptions={{ color: '#722ED1', fillOpacity: 0.6 }}><Popup>A點（基準定位）</Popup></CircleMarker>
        <Marker position={[pointB.lat, pointB.lng]} icon={markerIcon} draggable eventHandlers={{ dragend: (event: DragEndEvent) => { const p = event.target.getLatLng(); onPick({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) }) } }}><Popup>B點（拖動後為定位草稿，不自動算分）</Popup></Marker>
        {store?.coordinate && <><Polyline interactive={false} positions={[[pointA.lat, pointA.lng], [store.coordinate.lat, store.coordinate.lng]]} pathOptions={{ color: '#722ED1', dashArray: '5 6', weight: 2 }} /><Polyline interactive={false} positions={[[pointB.lat, pointB.lng], [store.coordinate.lat, store.coordinate.lng]]} pathOptions={{ color: '#E8720C', dashArray: '5 6', weight: 2 }} /></>}
      </MapContainer>
    </div>
    <div className="organic__map-note">紫色為A點，藍色標記為B點，橙色為選中門店。連線僅為直線示意，不代表配送路線。<Button type="link" size="small" onClick={() => setTiles(v => !v)}>{tiles ? '關閉底圖' : '開啟底圖'}</Button></div>
  </div>
}
