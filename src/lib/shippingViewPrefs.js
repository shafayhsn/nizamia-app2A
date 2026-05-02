const KEY = 'app2a.shipping.viewPrefs'

const DEFAULT_PREFS = {
  createShipments: {
    pinnedColumns: ['checkbox', 'qNumber'],
    visibleColumns: ['stylePo', 'buyer', 'balance', 'status', 'portOfLoading', 'etd'],
    hiddenColumns: ['splitRule', 'destination', 'eta', 'daysToEta', 'cartons', 'cbm', 'notes', 'createdDate', 'storeId', 'brandName', 'factoryRef', 'shipDate', 'exFactoryDate'],
  },
  shippedGoods: {
    pinnedColumns: ['checkbox', 'shipmentNumber'],
    visibleColumns: ['stylePo', 'buyer', 'shipQty', 'status', 'etd', 'daysToEtd', 'eta'],
    hiddenColumns: ['cartons', 'cbm', 'portOfLoading', 'portDestination', 'daysToEta', 'createdDate', 'createdBy', 'lastUpdated', 'deliveredDate', 'notes', 'qNumber', 'isOverride'],
  },
}

export function getShippingViewPrefs(tab) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULT_PREFS[tab], ...saved[tab] }
  } catch {
    return DEFAULT_PREFS[tab]
  }
}

export function saveShippingViewPrefs(tab, prefs) {
  const current = JSON.parse(localStorage.getItem(KEY) || '{}')
  current[tab] = prefs
  localStorage.setItem(KEY, JSON.stringify(current))
}

export function resetShippingViewPrefs(tab) {
  const current = JSON.parse(localStorage.getItem(KEY) || '{}')
  current[tab] = DEFAULT_PREFS[tab]
  localStorage.setItem(KEY, JSON.stringify(current))
}

export const CREATE_SHIPMENTS_COLUMNS = [
  { id: 'checkbox', label: 'Select', pinnable: false, width: 40 },
  { id: 'qNumber', label: 'Q#', width: 60 },
  { id: 'stylePo', label: 'Style / PO', width: 120 },
  { id: 'buyer', label: 'Buyer', width: 100 },
  { id: 'balance', label: 'Balance', width: 80 },
  { id: 'status', label: 'Status', width: 80 },
  { id: 'splitRule', label: 'Split Rule', width: 100 },
  { id: 'storeId', label: 'Store ID', width: 80 },
  { id: 'brandName', label: 'Brand', width: 80 },
  { id: 'factoryRef', label: 'Factory Ref', width: 100 },
  { id: 'portOfLoading', label: 'Port of Loading', width: 120 },
  { id: 'portDestination', label: 'Destination Port', width: 120 },
  { id: 'exFactoryDate', label: 'Ex-Factory Date', width: 110 },
  { id: 'shipDate', label: 'Ship Date', width: 110 },
  { id: 'etd', label: 'ETD', width: 90 },
  { id: 'eta', label: 'ETA', width: 90 },
  { id: 'daysToEta', label: 'Days to ETA', width: 90 },
  { id: 'cartons', label: 'Cartons', width: 80 },
  { id: 'cbm', label: 'CBM', width: 70 },
  { id: 'notes', label: 'Notes', width: 150 },
  { id: 'createdDate', label: 'Created', width: 110 },
]

export const SHIPPED_GOODS_COLUMNS = [
  { id: 'checkbox', label: 'Select', pinnable: false, width: 40 },
  { id: 'shipmentNumber', label: 'Shipment #', width: 100 },
  { id: 'stylePo', label: 'Style / PO', width: 120 },
  { id: 'buyer', label: 'Buyer', width: 100 },
  { id: 'qNumber', label: 'Q#', width: 60 },
  { id: 'shipQty', label: 'Ship Qty', width: 80 },
  { id: 'cartons', label: 'Cartons', width: 80 },
  { id: 'cbm', label: 'CBM', width: 70 },
  { id: 'portOfLoading', label: 'Port of Loading', width: 120 },
  { id: 'portDestination', label: 'Destination', width: 120 },
  { id: 'etd', label: 'ETD', width: 90 },
  { id: 'daysToEtd', label: 'Days to ETD', width: 90 },
  { id: 'eta', label: 'ETA', width: 90 },
  { id: 'daysToEta', label: 'Days to ETA', width: 90 },
  { id: 'status', label: 'Status', width: 100 },
  { id: 'isOverride', label: 'Override', width: 70 },
  { id: 'createdDate', label: 'Created', width: 110 },
  { id: 'createdBy', label: 'Created By', width: 90 },
  { id: 'lastUpdated', label: 'Updated', width: 110 },
  { id: 'deliveredDate', label: 'Delivered', width: 110 },
  { id: 'notes', label: 'Notes', width: 150 },
]
