/**
 * ACE Property Registry — scraped from a real single-socket Alfen NG910 EVSE.
 *
 * The data structure mirrors the real `/api/prop` JSON response:
 *   { version, properties: [ { id, access, type, len, cat, value } ], offset, total }
 *
 * Categories known from the real device:
 *   generic, generic2, comm, ocpp, states, meter1, meter4, temp, accelero,
 *   display, leds, scn, MbusTCP
 *
 * Some values are static hardware constants; others are marked as "dynamic"
 * and will be overridden at runtime with actual virtual-charger state.
 */

// ─── types ────────────────────────────────────────────────────────────────────

export interface AceProperty {
  id: string;
  access: number;
  type: number;
  len: number;
  cat: string;
  value: string | number;
}

export interface AcePropResponse {
  version: number;
  properties: AceProperty[];
  offset: number;
  total: number;
}

export interface AceWhitelistEntry {
  tag: string;
  parent: string;
  status: number;
  expiryDate: number;
}

export interface AceWhitelistResponse {
  version: number;
  whitelist: (AceWhitelistEntry | null)[];
}

export interface AceLogResponse {
  version: number;
  log: string[];
  offset: number;
  total: number;
}

export interface AceTransactionsResponse {
  version: number;
  [key: string]: unknown;
}

export interface AceChargingProfilesResponse {
  version: number;
  ChargingProfileIDs: number[];
}

// ─── dynamic‑key markers (patched at request time) ────────────────────────────

export type DynamicKey =
  | 'stationId'          // 2051_0 objectId / charger identity
  | 'stationName'        // 2053_0 display name
  | 'firmwareVersion'    // 100A_0, 2054_0
  | 'stationModel'       // 2050_0
  | 'modelFamily'        // 1008_0  (NG910 / NG920)
  | 'stationVendor'      // 2055_0
  | 'temperature'        // 2201_0
  | 'csmsUrl'            // 20F0_3, 20F1_3
  | 'lanIp'              // 207D_1
  | 'voltage'            // 2221_3  L1 voltage
  | 'frequency'          // 2221_12
  | 'connectorState'     // 2501_1
  | 'uptime'             // 2059_0
  | 'latitude'           // 205C_1
  | 'longitude'          // 205C_2
  ;

export const DYNAMIC_PROPERTY_IDS: Record<DynamicKey, string[]> = {
  stationId:        ['2051_0'],
  stationName:      ['2053_0'],
  firmwareVersion:  ['100A_0', '2054_0'],
  stationModel:     ['2050_0'],
  modelFamily:      ['1008_0'],
  stationVendor:    ['2055_0'],
  temperature:      ['2201_0'],
  csmsUrl:          ['20F0_3', '20F1_3'],
  lanIp:            ['207D_1'],
  voltage:          ['2221_3'],
  frequency:        ['2221_12'],
  connectorState:   ['2501_1'],
  uptime:           ['2059_0'],
  latitude:         ['205C_1'],
  longitude:        ['205C_2'],
};

// ─── static registry ──────────────────────────────────────────────────────────
// Organised per category exactly as the real charger returns them.

const generic: AceProperty[] = [
  {"id":"1008_0","access":1,"type":9,"len":33,"cat":"generic","value":"NG910"},
  {"id":"1009_0","access":1,"type":9,"len":33,"cat":"generic","value":"L7"},
  {"id":"100A_0","access":1,"type":9,"len":33,"cat":"generic","value":"7.0.0-4318"},
  {"id":"2005_0","access":1,"type":6,"len":65535,"cat":"generic","value":515},
  {"id":"204F_0","access":0,"type":6,"len":65535,"cat":"generic","value":51},
  {"id":"2050_0","access":0,"type":9,"len":21,"cat":"generic","value":"NG910-60023"},
  {"id":"2051_0","access":0,"type":9,"len":26,"cat":"generic","value":"ACE0574255"},
  {"id":"2052_1","access":0,"type":9,"len":21,"cat":"generic","value":"22:66:4b:09:02:22"},
  {"id":"2052_2","access":0,"type":5,"len":255,"cat":"generic","value":0},
  {"id":"2053_0","access":0,"type":9,"len":21,"cat":"generic","value":"STAGING_PRIVATE"},
  {"id":"2054_0","access":1,"type":9,"len":51,"cat":"generic","value":"7.0.0-4318"},
  {"id":"2055_0","access":0,"type":9,"len":21,"cat":"generic","value":"Alfen BV"},
  {"id":"2056_0","access":1,"type":7,"len":0,"cat":"generic","value":272},
  {"id":"2057_0","access":1,"type":9,"len":51,"cat":"generic","value":"Software reset"},
  {"id":"2059_0","access":0,"type":27,"len":0,"cat":"generic","value":1772614717592},
  {"id":"205B_0","access":0,"type":5,"len":0,"cat":"generic","value":1},
  {"id":"205C_1","access":0,"type":8,"len":0,"cat":"generic","value":52.402271270751953},
  {"id":"205C_2","access":0,"type":8,"len":0,"cat":"generic","value":5.2437448501586914},
  {"id":"205D_0","access":0,"type":9,"len":9,"cat":"generic","value":"nl_NL"},
  {"id":"205E_0","access":1,"type":5,"len":0,"cat":"generic","value":1},
  {"id":"205F_0","access":0,"type":27,"len":0,"cat":"generic","value":0},
  {"id":"2060_0","access":1,"type":27,"len":0,"cat":"generic","value":583879052},
  {"id":"2061_1","access":0,"type":5,"len":90,"cat":"generic","value":0},
  {"id":"2061_2","access":0,"type":5,"len":180,"cat":"generic","value":100},
  {"id":"2062_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2063_0","access":0,"type":9,"len":21,"cat":"generic","value":""},
  {"id":"2064_0","access":0,"type":5,"len":3,"cat":"generic","value":3},
  {"id":"2065_1","access":1,"type":5,"len":0,"cat":"generic","value":0},
  {"id":"2066_0","access":1,"type":7,"len":0,"cat":"generic","value":16777219},
  {"id":"2067_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2068_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2069_0","access":0,"type":9,"len":7,"cat":"generic","value":"L1L2L3"},
  // offset 32
  {"id":"206A_0","access":0,"type":8,"len":0,"cat":"generic","value":14},
  {"id":"206E_0","access":0,"type":3,"len":0,"cat":"generic","value":60},
  {"id":"206F_0","access":0,"type":5,"len":1,"cat":"generic","value":1},
  {"id":"2072_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.000.001"},
  {"id":"2072_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2073_1","access":0,"type":9,"len":16,"cat":"generic","value":"255.255.255.255"},
  {"id":"2074_1","access":0,"type":9,"len":16,"cat":"generic","value":"10.64.64.64"},
  {"id":"2075_1","access":0,"type":9,"len":16,"cat":"generic","value":"10.3.140.218"},
  {"id":"2075_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2076_0","access":0,"type":9,"len":51,"cat":"generic","value":""},
  {"id":"2079_1","access":0,"type":9,"len":16,"cat":"generic","value":"130.244.127.161"},
  {"id":"2079_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"207A_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.000.001"},
  {"id":"207A_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"207B_1","access":0,"type":9,"len":16,"cat":"generic","value":"255.255.255.0"},
  {"id":"207C_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.1.1"},
  {"id":"207D_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.1.107"},
  {"id":"207D_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"207E_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.1.1"},
  {"id":"207E_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"207F_1","access":0,"type":9,"len":16,"cat":"generic","value":"8.8.8.8"},
  {"id":"207F_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2080_1","access":0,"type":9,"len":16,"cat":"generic","value":"130.244.127.169"},
  {"id":"2080_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2086_0","access":0,"type":7,"len":0,"cat":"generic","value":900},
  {"id":"2087_0","access":0,"type":7,"len":0,"cat":"generic","value":900},
  {"id":"2088_0","access":0,"type":2,"len":2,"cat":"generic","value":1},
  {"id":"2089_0","access":0,"type":2,"len":1,"cat":"generic","value":1},
  {"id":"208F_0","access":0,"type":6,"len":0,"cat":"generic","value":900},
  {"id":"2093_0","access":0,"type":2,"len":1,"cat":"generic","value":1},
  {"id":"2094_0","access":0,"type":2,"len":0,"cat":"generic","value":0},
  {"id":"2095_0","access":0,"type":2,"len":1,"cat":"generic","value":0},
  // offset 64
  {"id":"2104_0","access":1,"type":9,"len":21,"cat":"generic","value":"240075822170892"},
  {"id":"2105_0","access":1,"type":9,"len":21,"cat":"generic","value":"89462038075005795509"},
  {"id":"2106_0","access":0,"type":2,"len":0,"cat":"generic","value":0},
  {"id":"2107_0","access":0,"type":2,"len":0,"cat":"generic","value":5},
  {"id":"2108_0","access":0,"type":2,"len":1,"cat":"generic","value":1},
  {"id":"2109_0","access":1,"type":2,"len":3,"cat":"generic","value":0},
  {"id":"2110_0","access":1,"type":3,"len":0,"cat":"generic","value":-81},
  {"id":"2111_0","access":0,"type":3,"len":0,"cat":"generic","value":-90},
  {"id":"2112_0","access":1,"type":9,"len":33,"cat":"generic","value":"0,0,\"Orange B\",8"},
  {"id":"2113_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2114_0","access":0,"type":5,"len":3,"cat":"generic","value":2},
  {"id":"2125_0","access":0,"type":2,"len":3,"cat":"generic","value":1},
  {"id":"2126_0","access":0,"type":2,"len":3,"cat":"generic","value":2},
  {"id":"2127_0","access":0,"type":2,"len":1,"cat":"generic","value":1},
  {"id":"2128_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2129_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"212A_0","access":1,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"212B_0","access":1,"type":8,"len":0,"cat":"generic","value":40.2},
  {"id":"212C_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"212D_0","access":1,"type":8,"len":0,"cat":"generic","value":40.2},
  {"id":"2130_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2131_0","access":0,"type":2,"len":0,"cat":"generic","value":5},
  {"id":"2132_0","access":0,"type":3,"len":0,"cat":"generic","value":30},
  {"id":"2133_0","access":0,"type":3,"len":0,"cat":"generic","value":300},
  {"id":"2134_0","access":0,"type":3,"len":0,"cat":"generic","value":60},
  {"id":"2135_0","access":0,"type":3,"len":0,"cat":"generic","value":120},
  {"id":"2136_0","access":0,"type":3,"len":0,"cat":"generic","value":10},
  {"id":"2137_0","access":0,"type":2,"len":3,"cat":"generic","value":2},
  {"id":"2138_0","access":1,"type":2,"len":3,"cat":"generic","value":3},
  {"id":"2139_0","access":0,"type":3,"len":0,"cat":"generic","value":250},
  {"id":"213A_0","access":1,"type":9,"len":33,"cat":"generic","value":"                                 "},
  {"id":"213B_0","access":0,"type":2,"len":2,"cat":"generic","value":1},
  // offset 96
  {"id":"213C_0","access":0,"type":2,"len":2,"cat":"generic","value":1},
  {"id":"213D_0","access":0,"type":2,"len":2,"cat":"generic","value":1},
  {"id":"213E_0","access":0,"type":2,"len":2,"cat":"generic","value":1},
  {"id":"2140_0","access":0,"type":3,"len":0,"cat":"generic","value":1000},
  {"id":"2159_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"215D_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"215E_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"215F_0","access":1,"type":8,"len":0,"cat":"generic","value":99.9},
  {"id":"2160_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2161_0","access":1,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"2165_1","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2165_2","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2165_3","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2165_4","access":0,"type":27,"len":0,"cat":"generic","value":0},
  {"id":"2166_1","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2166_2","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2166_3","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2166_4","access":0,"type":27,"len":0,"cat":"generic","value":0},
  {"id":"2167_1","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2167_2","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2167_3","access":0,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2167_4","access":0,"type":27,"len":0,"cat":"generic","value":0},
  {"id":"2168_0","access":0,"type":6,"len":65535,"cat":"generic","value":0},
  {"id":"2169_0","access":0,"type":6,"len":3600,"cat":"generic","value":0},
  {"id":"216A_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"216B_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"216D_0","access":0,"type":5,"len":60,"cat":"generic","value":0},
  {"id":"2177_0","access":0,"type":9,"len":224,"cat":"generic","value":""},
  {"id":"2178_0","access":0,"type":9,"len":224,"cat":"generic","value":""},
  {"id":"2179_0","access":0,"type":5,"len":1,"cat":"generic","value":1},
  {"id":"216F_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2173_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  // offset 128
  {"id":"2183_0","access":0,"type":5,"len":2,"cat":"generic","value":1},
  {"id":"2184_0","access":0,"type":6,"len":65535,"cat":"generic","value":0},
  {"id":"21A0_0","access":1,"type":27,"len":0,"cat":"generic","value":22236760192012568},
  {"id":"21A1_0","access":0,"type":9,"len":30,"cat":"generic","value":"9F80.FE01.0A11.8414.FCAF.28A1"},
  {"id":"21A2_0","access":1,"type":7,"len":0,"cat":"generic","value":2147553556},
  {"id":"21B0_0","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"2224_0","access":1,"type":8,"len":0,"cat":"generic","value":0.218},
  {"id":"2225_0","access":1,"type":8,"len":0,"cat":"generic","value":0.218},
  {"id":"2228_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2229_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2231_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2233_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"2911_0","access":0,"type":2,"len":12,"cat":"generic","value":0},
  {"id":"3125_0","access":0,"type":2,"len":3,"cat":"generic","value":1},
  {"id":"3129_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"312A_0","access":1,"type":8,"len":0,"cat":"generic","value":32},
  {"id":"312B_0","access":1,"type":8,"len":0,"cat":"generic","value":32},
  {"id":"312C_0","access":1,"type":8,"len":0,"cat":"generic","value":32},
  {"id":"312D_0","access":1,"type":8,"len":0,"cat":"generic","value":32},
  {"id":"3160_0","access":1,"type":8,"len":0,"cat":"generic","value":0},
  {"id":"3173_0","access":0,"type":8,"len":0,"cat":"generic","value":16},
  {"id":"3285_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.000.092"},
  {"id":"3285_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"3286_1","access":0,"type":9,"len":16,"cat":"generic","value":"255.255.255.255"},
  {"id":"3287_1","access":0,"type":9,"len":16,"cat":"generic","value":"192.168.000.001"},
  {"id":"3288_1","access":0,"type":9,"len":16,"cat":"generic","value":"8.8.8.8"},
  {"id":"3288_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
  {"id":"3289_1","access":0,"type":9,"len":16,"cat":"generic","value":"208.67.222.222"},
  {"id":"3289_2","access":0,"type":5,"len":2,"cat":"generic","value":0},
];

const generic2: AceProperty[] = [
  {"id":"204D_1","access":1,"type":5,"len":255,"cat":"generic2","value":11},
  {"id":"204D_2","access":1,"type":5,"len":255,"cat":"generic2","value":8},
  {"id":"204D_3","access":1,"type":5,"len":255,"cat":"generic2","value":6},
  {"id":"204D_4","access":1,"type":5,"len":255,"cat":"generic2","value":0},
  {"id":"2070_0","access":0,"type":5,"len":1,"cat":"generic2","value":1},
  {"id":"218E_0","access":0,"type":7,"len":0,"cat":"generic2","value":0},
  {"id":"209E_0","access":1,"type":5,"len":0,"cat":"generic2","value":5},
  {"id":"209F_0","access":1,"type":5,"len":0,"cat":"generic2","value":2},
  {"id":"2115_0","access":0,"type":9,"len":64,"cat":"generic2","value":""},
  {"id":"2116_0","access":0,"type":9,"len":32,"cat":"generic2","value":""},
  {"id":"2117_0","access":0,"type":2,"len":2,"cat":"generic2","value":0},
  {"id":"2124_0","access":0,"type":5,"len":2,"cat":"generic2","value":1},
  {"id":"212E_1","access":1,"type":3,"len":0,"cat":"generic2","value":0},
  {"id":"212E_2","access":1,"type":6,"len":0,"cat":"generic2","value":0},
  {"id":"212E_3","access":1,"type":27,"len":0,"cat":"generic2","value":0},
  {"id":"212F_1","access":1,"type":8,"len":0,"cat":"generic2","value":0},
  {"id":"212F_2","access":1,"type":8,"len":0,"cat":"generic2","value":0},
  {"id":"212F_3","access":1,"type":8,"len":0,"cat":"generic2","value":0},
  {"id":"2153_0","access":0,"type":6,"len":8000,"cat":"generic2","value":5000},
  {"id":"216C_0","access":0,"type":5,"len":3,"cat":"generic2","value":0},
  {"id":"2171_0","access":0,"type":5,"len":2,"cat":"generic2","value":0},
  {"id":"2172_0","access":0,"type":5,"len":100,"cat":"generic2","value":100},
  {"id":"2174_0","access":0,"type":8,"len":0,"cat":"generic2","value":0},
  {"id":"2175_0","access":1,"type":5,"len":1,"cat":"generic2","value":1},
  {"id":"2176_0","access":1,"type":9,"len":25,"cat":"generic2","value":"004f00373033511739373735"},
  {"id":"218F_1","access":1,"type":7,"len":0,"cat":"generic2","value":8},
  {"id":"218F_2","access":1,"type":7,"len":0,"cat":"generic2","value":0},
  {"id":"2185_0","access":0,"type":5,"len":2,"cat":"generic2","value":1},
  {"id":"2187_0","access":0,"type":27,"len":0,"cat":"generic2","value":1772453071478},
  {"id":"2189_0","access":0,"type":5,"len":0,"cat":"generic2","value":3},
  {"id":"2190_0","access":0,"type":5,"len":1,"cat":"generic2","value":1},
  {"id":"2192_0","access":0,"type":5,"len":7,"cat":"generic2","value":0},
  // offset 32
  {"id":"2400_2","access":0,"type":9,"len":21,"cat":"generic2","value":""},
];

const comm: AceProperty[] = [
  {"id":"206B_1","access":0,"type":5,"len":2,"cat":"comm","value":0},
  {"id":"206B_2","access":0,"type":6,"len":65535,"cat":"comm","value":60},
  {"id":"206B_3","access":0,"type":6,"len":65535,"cat":"comm","value":100},
  {"id":"208A_0","access":0,"type":7,"len":0,"cat":"comm","value":120},
  {"id":"208D_1","access":0,"type":6,"len":0,"cat":"comm","value":5},
  {"id":"208D_2","access":0,"type":6,"len":0,"cat":"comm","value":50},
  {"id":"208E_1","access":0,"type":6,"len":0,"cat":"comm","value":100},
  {"id":"208E_2","access":0,"type":6,"len":0,"cat":"comm","value":120},
  {"id":"209B_0","access":0,"type":2,"len":2,"cat":"comm","value":0},
  {"id":"209C_0","access":0,"type":2,"len":3,"cat":"comm","value":0},
  {"id":"209D_0","access":0,"type":2,"len":2,"cat":"comm","value":0},
  {"id":"2118_0","access":1,"type":9,"len":33,"cat":"comm","value":"Quectel"},
  {"id":"2119_0","access":1,"type":9,"len":33,"cat":"comm","value":"BG95-M3"},
  {"id":"2120_0","access":1,"type":9,"len":33,"cat":"comm","value":"BG95M3LAR02A03_01.012.01.012"},
  {"id":"2121_0","access":1,"type":9,"len":33,"cat":"comm","value":"864145067410074"},
  {"id":"2182_0","access":0,"type":6,"len":0,"cat":"comm","value":0},
  {"id":"328A_0","access":0,"type":9,"len":33,"cat":"comm","value":""},
  {"id":"328B_0","access":0,"type":9,"len":65,"cat":"comm","value":""},
  {"id":"328C_0","access":0,"type":7,"len":0,"cat":"comm","value":6291462},
  {"id":"328D_0","access":1,"type":2,"len":0,"cat":"comm","value":0},
  {"id":"328E_0","access":0,"type":2,"len":0,"cat":"comm","value":0},
  {"id":"328F_0","access":1,"type":5,"len":0,"cat":"comm","value":0},
  {"id":"3290_0","access":0,"type":7,"len":0,"cat":"comm","value":0},
  {"id":"3291_0","access":0,"type":5,"len":2,"cat":"comm","value":0},
];

const ocpp: AceProperty[] = [
  // offset 0
  {"id":"206C_1","access":0,"type":5,"len":5,"cat":"ocpp","value":0},
  {"id":"2096_0","access":0,"type":6,"len":0,"cat":"ocpp","value":0},
  {"id":"2097_0","access":0,"type":7,"len":0,"cat":"ocpp","value":60},
  {"id":"2098_1","access":0,"type":7,"len":0,"cat":"ocpp","value":131074},
  {"id":"2098_2","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_3","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_4","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_5","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_6","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_7","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_8","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2098_9","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_1","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_2","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_3","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_4","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_5","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_6","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_7","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_8","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"2099_9","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"209A_0","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"20F0_1","access":0,"type":5,"len":0,"cat":"ocpp","value":3},
  {"id":"20F0_3","access":0,"type":9,"len":513,"cat":"ocpp","value":"ws://proxy.optimile-dev.eu:80/services/ocppj"},
  {"id":"20F0_4","access":0,"type":7,"len":0,"cat":"ocpp","value":10},
  {"id":"20F0_5","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F0_6","access":0,"type":5,"len":0,"cat":"ocpp","value":1},
  {"id":"20F0_7","access":0,"type":9,"len":513,"cat":"ocpp","value":""},
  {"id":"20F0_8","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F0_9","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F0_A","access":0,"type":9,"len":5,"cat":"ocpp","value":""},
  {"id":"20F0_B","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  // offset 32
  {"id":"20F0_C","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F0_D","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F0_E","access":0,"type":5,"len":0,"cat":"ocpp","value":1},
  {"id":"20F0_F","access":0,"type":9,"len":41,"cat":"ocpp","value":""},
  {"id":"20F0_10","access":0,"type":9,"len":9,"cat":"ocpp","value":""},
  {"id":"20F1_1","access":0,"type":5,"len":0,"cat":"ocpp","value":3},
  {"id":"20F1_3","access":0,"type":9,"len":513,"cat":"ocpp","value":"ws://proxy.optimile-dev.eu:80/services/ocppj"},
  {"id":"20F1_4","access":0,"type":7,"len":0,"cat":"ocpp","value":15},
  {"id":"20F1_5","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F1_6","access":0,"type":5,"len":0,"cat":"ocpp","value":5},
  {"id":"20F1_7","access":0,"type":9,"len":513,"cat":"ocpp","value":"apn.mobilityplus.be"},
  {"id":"20F1_8","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F1_9","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F1_A","access":0,"type":9,"len":5,"cat":"ocpp","value":""},
  {"id":"20F1_B","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  {"id":"20F1_C","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F1_D","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F1_E","access":0,"type":5,"len":0,"cat":"ocpp","value":2},
  {"id":"20F1_F","access":0,"type":9,"len":41,"cat":"ocpp","value":""},
  {"id":"20F1_10","access":0,"type":9,"len":9,"cat":"ocpp","value":""},
  {"id":"20F2_1","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F2_3","access":0,"type":9,"len":513,"cat":"ocpp","value":""},
  {"id":"20F2_4","access":0,"type":7,"len":0,"cat":"ocpp","value":10},
  {"id":"20F2_5","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F2_6","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F2_7","access":0,"type":9,"len":513,"cat":"ocpp","value":""},
  {"id":"20F2_8","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F2_9","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F2_A","access":0,"type":9,"len":5,"cat":"ocpp","value":""},
  {"id":"20F2_B","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  {"id":"20F2_C","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F2_D","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  // offset 64
  {"id":"20F2_E","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F2_F","access":0,"type":9,"len":41,"cat":"ocpp","value":""},
  {"id":"20F2_10","access":0,"type":9,"len":9,"cat":"ocpp","value":""},
  {"id":"20F3_1","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_3","access":0,"type":9,"len":513,"cat":"ocpp","value":""},
  {"id":"20F3_4","access":0,"type":7,"len":0,"cat":"ocpp","value":10},
  {"id":"20F3_5","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_6","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_7","access":0,"type":9,"len":513,"cat":"ocpp","value":""},
  {"id":"20F3_8","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F3_9","access":0,"type":9,"len":21,"cat":"ocpp","value":""},
  {"id":"20F3_A","access":0,"type":9,"len":5,"cat":"ocpp","value":""},
  {"id":"20F3_B","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  {"id":"20F3_C","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_D","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_E","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"20F3_F","access":0,"type":9,"len":41,"cat":"ocpp","value":""},
  {"id":"20F3_10","access":0,"type":9,"len":9,"cat":"ocpp","value":""},
  {"id":"20F4_0","access":0,"type":5,"len":0,"cat":"ocpp","value":3},
  {"id":"218A_0","access":0,"type":5,"len":0,"cat":"ocpp","value":16},
  {"id":"218B_0","access":0,"type":5,"len":0,"cat":"ocpp","value":16},
  {"id":"2401_0","access":0,"type":9,"len":37,"cat":"ocpp","value":"                                     "},
  {"id":"3258_0","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"3263_1","access":0,"type":2,"len":3,"cat":"ocpp","value":0},
  {"id":"3263_2","access":0,"type":9,"len":512,"cat":"ocpp","value":""},
  {"id":"3263_3","access":0,"type":2,"len":3,"cat":"ocpp","value":0},
  {"id":"3263_4","access":0,"type":9,"len":512,"cat":"ocpp","value":""},
  {"id":"3264_0","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"3265_0","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"3266_0","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3267_0","access":1,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3260_0","access":1,"type":5,"len":0,"cat":"ocpp","value":0},
  // offset 96
  {"id":"3269_0","access":1,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3270_0","access":0,"type":7,"len":0,"cat":"ocpp","value":0},
  {"id":"3271_0","access":0,"type":9,"len":14,"cat":"ocpp","value":"unimplemented "},
  {"id":"3272_0","access":1,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3273_0","access":1,"type":9,"len":3,"cat":"ocpp","value":"A,W"},
  {"id":"3274_0","access":1,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3275_0","access":0,"type":8,"len":0,"cat":"ocpp","value":0},
  {"id":"3276_1","access":0,"type":9,"len":27,"cat":"ocpp","value":""},
  {"id":"3276_2","access":0,"type":9,"len":30,"cat":"ocpp","value":""},
  {"id":"3276_3","access":0,"type":5,"len":0,"cat":"ocpp","value":0},
  {"id":"3276_4","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  {"id":"3276_5","access":0,"type":9,"len":27,"cat":"ocpp","value":""},
  {"id":"3276_6","access":0,"type":9,"len":7,"cat":"ocpp","value":""},
  {"id":"3276_7","access":0,"type":6,"len":0,"cat":"ocpp","value":0},
  {"id":"3276_8","access":0,"type":9,"len":30,"cat":"ocpp","value":""},
  {"id":"3277_1","access":1,"type":5,"len":0,"cat":"ocpp","value":10},
  {"id":"3277_2","access":1,"type":5,"len":0,"cat":"ocpp","value":10},
  {"id":"3277_3","access":1,"type":5,"len":0,"cat":"ocpp","value":10},
  {"id":"3277_4","access":1,"type":6,"len":0,"cat":"ocpp","value":255},
  {"id":"3277_5","access":1,"type":6,"len":0,"cat":"ocpp","value":255},
  {"id":"3277_6","access":1,"type":6,"len":0,"cat":"ocpp","value":255},
  {"id":"3277_7","access":1,"type":6,"len":0,"cat":"ocpp","value":255},
  {"id":"3277_8","access":1,"type":6,"len":0,"cat":"ocpp","value":255},
  {"id":"5230_0","access":0,"type":2,"len":0,"cat":"ocpp","value":0},
];

const states: AceProperty[] = [
  {"id":"2501_1","access":1,"type":5,"len":0,"cat":"states","value":2},
  {"id":"2501_2","access":1,"type":2,"len":0,"cat":"states","value":4},
  {"id":"2501_3","access":1,"type":5,"len":0,"cat":"states","value":0},
  {"id":"2501_4","access":1,"type":5,"len":0,"cat":"states","value":224},
  {"id":"2502_1","access":1,"type":5,"len":0,"cat":"states","value":0},
  {"id":"2502_2","access":1,"type":2,"len":0,"cat":"states","value":0},
  {"id":"2502_3","access":1,"type":5,"len":0,"cat":"states","value":0},
  {"id":"2502_4","access":1,"type":5,"len":0,"cat":"states","value":0},
  {"id":"2511_0","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2511_1","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2511_2","access":1,"type":3,"len":0,"cat":"states","value":32767},
  {"id":"2511_3","access":1,"type":3,"len":0,"cat":"states","value":2160},
  {"id":"2512_0","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2512_1","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2512_2","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2512_3","access":1,"type":3,"len":0,"cat":"states","value":0},
  {"id":"2540_0","access":1,"type":5,"len":4,"cat":"states","value":2},
  {"id":"312E_0","access":1,"type":5,"len":3,"cat":"states","value":1},
  {"id":"312F_0","access":1,"type":5,"len":3,"cat":"states","value":3},
  {"id":"3251_0","access":1,"type":5,"len":255,"cat":"states","value":2},
  {"id":"3253_0","access":1,"type":5,"len":255,"cat":"states","value":0},
  {"id":"3600_1","access":1,"type":2,"len":4,"cat":"states","value":3},
  {"id":"3600_2","access":1,"type":27,"len":0,"cat":"states","value":17394},
  {"id":"3600_3","access":1,"type":27,"len":0,"cat":"states","value":17519},
  {"id":"3600_4","access":1,"type":27,"len":0,"cat":"states","value":0},
  {"id":"3600_5","access":1,"type":2,"len":2,"cat":"states","value":1},
  {"id":"3600_6","access":1,"type":27,"len":0,"cat":"states","value":583485260},
  {"id":"3600_7","access":1,"type":27,"len":0,"cat":"states","value":0},
  {"id":"3600_8","access":1,"type":27,"len":0,"cat":"states","value":583485212},
];

const meter1: AceProperty[] = [
  {"id":"2218_0","access":0,"type":2,"len":13,"cat":"meter1","value":8},
  {"id":"2219_0","access":0,"type":6,"len":0,"cat":"meter1","value":1000},
  {"id":"2221_3","access":1,"type":8,"len":0,"cat":"meter1","value":227.42},
  {"id":"2221_4","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_5","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_6","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_7","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_8","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_9","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_A","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_B","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_C","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_D","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_E","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_F","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_10","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_11","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_12","access":1,"type":8,"len":0,"cat":"meter1","value":50.1},
  {"id":"2221_13","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_14","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_15","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_16","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_17","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_18","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_19","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1A","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1B","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1C","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1D","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1E","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_1F","access":1,"type":8,"len":0,"cat":"meter1","value":0},
  {"id":"2221_20","access":1,"type":8,"len":0,"cat":"meter1","value":0},
];

const meter4: AceProperty[] = [
  {"id":"5217_0","access":0,"type":2,"len":7,"cat":"meter4","value":-1},
  {"id":"2191_1","access":0,"type":5,"len":3,"cat":"meter4","value":0},
  {"id":"2191_2","access":0,"type":9,"len":16,"cat":"meter4","value":""},
  {"id":"2191_3","access":0,"type":6,"len":0,"cat":"meter4","value":23},
  {"id":"5218_0","access":0,"type":2,"len":13,"cat":"meter4","value":1},
  {"id":"5221_3","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_4","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_5","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_6","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_7","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_8","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_9","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_A","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_B","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_C","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_D","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_E","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_F","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_10","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_11","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_12","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_13","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_14","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_15","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_16","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_17","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_18","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_19","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_1A","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_1B","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_1C","access":1,"type":8,"len":0,"cat":"meter4","value":0},
  {"id":"5221_1D","access":1,"type":8,"len":0,"cat":"meter4","value":0},
];

const temp: AceProperty[] = [
  {"id":"2200_0","access":0,"type":2,"len":1,"cat":"temp","value":1},
  {"id":"2201_0","access":1,"type":8,"len":0,"cat":"temp","value":36.125},
  {"id":"2202_0","access":0,"type":8,"len":0,"cat":"temp","value":-25},
  {"id":"2203_0","access":0,"type":8,"len":0,"cat":"temp","value":100},
  {"id":"2204_0","access":0,"type":3,"len":0,"cat":"temp","value":10},
  {"id":"2205_0","access":0,"type":3,"len":0,"cat":"temp","value":900},
  {"id":"2249_0","access":1,"type":8,"len":0,"cat":"temp","value":43.625},
  {"id":"2249_1","access":1,"type":8,"len":0,"cat":"temp","value":20},
];

const accelero: AceProperty[] = [
  {"id":"2206_0","access":0,"type":2,"len":2,"cat":"accelero","value":1},
  {"id":"2207_0","access":1,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2208_0","access":1,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2209_0","access":1,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2210_0","access":0,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2211_0","access":0,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2212_0","access":0,"type":3,"len":0,"cat":"accelero","value":0},
  {"id":"2213_0","access":0,"type":3,"len":0,"cat":"accelero","value":400},
  {"id":"2214_0","access":0,"type":3,"len":0,"cat":"accelero","value":400},
  {"id":"2215_0","access":0,"type":3,"len":0,"cat":"accelero","value":400},
  {"id":"2216_0","access":0,"type":6,"len":0,"cat":"accelero","value":900},
];

const display: AceProperty[] = [
  {"id":"3260_1","access":1,"type":6,"len":0,"cat":"display","value":320},
  {"id":"3260_2","access":1,"type":6,"len":0,"cat":"display","value":240},
  {"id":"3260_3","access":1,"type":6,"len":0,"cat":"display","value":320},
  {"id":"3260_4","access":1,"type":6,"len":0,"cat":"display","value":165},
  {"id":"3260_5","access":1,"type":7,"len":0,"cat":"display","value":262144},
  {"id":"3261_0","access":0,"type":6,"len":7,"cat":"display","value":7},
  {"id":"3262_1","access":0,"type":9,"len":4,"cat":"display","value":"EUR"},
  {"id":"3262_2","access":0,"type":8,"len":0,"cat":"display","value":0},
  {"id":"3262_3","access":0,"type":8,"len":0,"cat":"display","value":0},
  {"id":"3262_4","access":0,"type":8,"len":0,"cat":"display","value":0},
  {"id":"3262_5","access":0,"type":5,"len":31,"cat":"display","value":1},
  {"id":"3262_6","access":0,"type":8,"len":0,"cat":"display","value":0},
  {"id":"3262_7","access":0,"type":9,"len":33,"cat":"display","value":""},
];

const leds: AceProperty[] = [
  {"id":"2300_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,0,0,0,0,0,0,0"},
  {"id":"2301_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,0,0,0,0,0,0,0"},
  {"id":"2302_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,50,0,0,0,0,14"},
  {"id":"2303_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,FF,FF,FF,FF,A"},
  {"id":"2304_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,0,0,0,0,0,0,0"},
  {"id":"2305_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,FF,0,0,A,0,0,0,0,A"},
  {"id":"2306_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,FF,0,0,0,0,0,0,0,0"},
  {"id":"2307_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,FF,0,0,50,0,0,0,0,14"},
  {"id":"2308_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,FF,0,0,0,0,0,0,0,0"},
  {"id":"2309_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,FF,64,0,0,0,0,0"},
  {"id":"2310_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,FF,0,0,0,0,0,0"},
  {"id":"2311_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,FF,0,0,0,0,0,0,0"},
  {"id":"2312_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,FF,0,0,0,0,0,0,0"},
  {"id":"2313_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,FF,FF,5A,0,0,0,0,A"},
  {"id":"2314_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,FF,FF,5A,0,0,0,0,A"},
  {"id":"2315_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,FF,5A,0,0,0,0,A"},
  {"id":"2316_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,0,0,FF,32,0,0,0,0,A"},
  {"id":"2317_0","access":0,"type":64,"len":10,"cat":"leds","value":"0,FF,0,0,0,0,0,0,0,0"},
  {"id":"2318_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,0,0,A"},
  {"id":"2319_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2320_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2321_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2322_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2323_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2324_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2325_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,FF,0,A"},
  {"id":"2326_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,0,0,A"},
  {"id":"2327_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,A5,0,0,64,0,0,0,0,64"},
  {"id":"2328_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,19,0,0,0,0,19"},
  {"id":"2329_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,0,0,0,0,0,0"},
  {"id":"2330_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,0,0,0,FF,A"},
  {"id":"2331_0","access":0,"type":64,"len":10,"cat":"leds","value":"FF,0,0,0,A,FF,0,FF,0,A"},
];

const scn: AceProperty[] = [
  {"id":"2180_1","access":0,"type":9,"len":8,"cat":"scn","value":""},
  {"id":"2180_2","access":0,"type":5,"len":255,"cat":"scn","value":0},
  {"id":"2180_3","access":0,"type":5,"len":255,"cat":"scn","value":1},
  {"id":"2180_4","access":0,"type":6,"len":65535,"cat":"scn","value":900},
  {"id":"2180_5","access":0,"type":8,"len":0,"cat":"scn","value":200},
  {"id":"2180_6","access":0,"type":8,"len":0,"cat":"scn","value":6},
  {"id":"2180_7","access":0,"type":5,"len":10,"cat":"scn","value":4},
  {"id":"2180_8","access":1,"type":5,"len":2,"cat":"scn","value":1},
  {"id":"2180_9","access":0,"type":5,"len":10,"cat":"scn","value":4},
  {"id":"2180_A","access":0,"type":8,"len":0,"cat":"scn","value":32},
];

const MbusTCP: AceProperty[] = [
  {"id":"2522_1","access":0,"type":5,"len":2,"cat":"MbusTCP","value":0},
  {"id":"2522_2","access":0,"type":5,"len":2,"cat":"MbusTCP","value":1},
  {"id":"2522_4","access":0,"type":9,"len":16,"cat":"MbusTCP","value":"192.168.000.004"},
  {"id":"2522_6","access":0,"type":6,"len":65535,"cat":"MbusTCP","value":5},
  {"id":"2523_1","access":0,"type":5,"len":2,"cat":"MbusTCP","value":0},
  {"id":"2523_2","access":0,"type":5,"len":2,"cat":"MbusTCP","value":1},
  {"id":"2523_4","access":0,"type":9,"len":16,"cat":"MbusTCP","value":"192.168.000.004"},
  {"id":"2523_6","access":0,"type":6,"len":65535,"cat":"MbusTCP","value":5},
  {"id":"2530_1","access":0,"type":5,"len":3,"cat":"MbusTCP","value":3},
  {"id":"2530_2","access":0,"type":5,"len":1,"cat":"MbusTCP","value":1},
  {"id":"2530_3","access":0,"type":5,"len":1,"cat":"MbusTCP","value":0},
  {"id":"2530_4","access":0,"type":6,"len":65535,"cat":"MbusTCP","value":60},
  {"id":"2560_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"3,4,5,0,1,2,F,7,8,9,6,13,1B,17,E,10,11,12,18,19,1A,14,15,16,B,C,D,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2561_0","access":0,"type":65,"len":50,"cat":"MbusTCP","value":"C552,C554,C556,C558,C55A,C55C,C55E,C560,C562,C564,C566,C568,C56A,C56C,C56E,C570,C572,C574,C576,C578,C57A,C57C,C57E,C580,C582,C584,C586,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2562_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"3,3,3,3,3,3,3,3,3,3,3,2,2,3,2,2,2,2,2,2,2,3,3,3,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2563_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"FE,FE,FE,FE,FE,FE,FD,FD,FD,FD,FD,1,1,1,FD,1,1,1,1,1,1,1,1,1,FD,FD,FD,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2564_0","access":0,"type":5,"len":1,"cat":"MbusTCP","value":1},
  {"id":"2564_1","access":0,"type":7,"len":0,"cat":"MbusTCP","value":2000},
  {"id":"2564_2","access":0,"type":7,"len":0,"cat":"MbusTCP","value":500},
  {"id":"2564_3","access":0,"type":5,"len":255,"cat":"MbusTCP","value":3},
  {"id":"2565_0","access":0,"type":7,"len":0,"cat":"MbusTCP","value":19200},
  {"id":"2565_1","access":0,"type":5,"len":2,"cat":"MbusTCP","value":1},
  {"id":"2565_2","access":0,"type":5,"len":0,"cat":"MbusTCP","value":1},
  {"id":"2570_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"3,4,5,0,1,2,F,7,8,9,6,13,1B,17,E,10,11,12,18,19,1A,14,15,16,B,C,D,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2571_0","access":0,"type":65,"len":50,"cat":"MbusTCP","value":"C552,C554,C556,C558,C55A,C55C,C55E,C560,C562,C564,C566,C568,C56A,C56C,C56E,C570,C572,C574,C576,C578,C57A,C57C,C57E,C580,C582,C584,C586,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2572_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"3,3,3,3,3,3,3,3,3,3,3,2,2,3,2,2,2,2,2,2,2,3,3,3,2,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
  {"id":"2573_0","access":0,"type":64,"len":50,"cat":"MbusTCP","value":"FE,FE,FE,FE,FE,FE,FD,FD,FD,FD,FD,1,1,1,FD,1,1,1,1,1,1,1,1,1,FD,FD,FD,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"},
];

// ─── full registry & helpers ──────────────────────────────────────────────────

export const ACE_CATEGORIES: Record<string, AceProperty[]> = {
  generic,
  generic2,
  comm,
  ocpp,
  states,
  meter1,
  meter4,
  temp,
  accelero,
  display,
  leds,
  scn,
  MbusTCP,
};

/** Flat index: property‑id → AceProperty (first occurrence wins) */
const _propertyIndex = new Map<string, AceProperty>();
for (const props of Object.values(ACE_CATEGORIES)) {
  for (const prop of props) {
    if (!_propertyIndex.has(prop.id)) {
      _propertyIndex.set(prop.id, prop);
    }
  }
}

/**
 * Return a deep‑copied slice of properties for a given category,
 * paginated with `offset` (default 0) and page size 32 (real charger default).
 */
export function getPropertiesByCategory(
  cat: string,
  offset = 0,
  pageSize = 32,
): AcePropResponse {
  const allProps = ACE_CATEGORIES[cat];
  if (!allProps) {
    return { version: 2, properties: [], offset, total: 0 };
  }
  const page = allProps.slice(offset, offset + pageSize);
  return {
    version: 2,
    properties: page.map(p => ({ ...p })),
    offset,
    total: allProps.length,
  };
}

/**
 * Return properties matching a comma-separated list of IDs.
 * Mirrors real behaviour of  `/api/prop?ids=2051_0,2053_0,...`.
 */
export function getPropertiesByIds(ids: string[]): AcePropResponse {
  const matched: AceProperty[] = [];
  for (const id of ids) {
    const found = _propertyIndex.get(id.trim());
    if (found) matched.push({ ...found });
  }
  return { version: 2, properties: matched, offset: 0, total: matched.length };
}

/**
 * Patch dynamic property values at request time.
 *
 * Callers provide a partial map of DynamicKey → runtime value;
 * matching property IDs in the given array are updated in‑place.
 */
export function applyDynamicValues(
  properties: AceProperty[],
  dynamicValues: Partial<Record<DynamicKey, string | number>>,
): void {
  const lookup = new Map<string, string | number>();
  for (const [key, value] of Object.entries(dynamicValues) as [DynamicKey, string | number | undefined][]) {
    if (value === undefined) continue;
    const ids = DYNAMIC_PROPERTY_IDS[key];
    if (!ids) continue;
    for (const propId of ids) {
      lookup.set(propId, value);
    }
  }
  if (lookup.size === 0) return;
  for (const prop of properties) {
    const override = lookup.get(prop.id);
    if (override !== undefined) {
      prop.value = override;
    }
  }
}

// ─── default whitelist, log, transactions, chargingprofiles ───────────────────

const INITIAL_WHITELIST: AceWhitelistEntry[] = [
  { tag: '04EBD56ABF1290', parent: '(null)', status: 2, expiryDate: 1745483903 },
  { tag: '040E5E6ABF1295', parent: '(null)', status: 2, expiryDate: 1745483893 },
  { tag: '042332C2B31690', parent: '(null)', status: 1, expiryDate: 1752137489 },
];

let whitelistStore: AceWhitelistEntry[] = [...INITIAL_WHITELIST];

export function getWhitelist(index: number, pageSize = 16): AceWhitelistResponse {
  const page = whitelistStore.slice(index, index + pageSize);
  const padded: (AceWhitelistEntry | null)[] = [...page];
  padded.push(null); // real charger always terminates page with null
  return { version: 2, whitelist: padded };
}

export function addWhitelistEntry(entry: AceWhitelistEntry): void {
  const existing = whitelistStore.findIndex(e => e.tag === entry.tag);
  if (existing >= 0) {
    whitelistStore[existing] = entry;
  } else {
    whitelistStore.push(entry);
  }
}

export function deleteWhitelistEntry(tag: string): boolean {
  const index = whitelistStore.findIndex(e => e.tag === tag);
  if (index >= 0) {
    whitelistStore.splice(index, 1);
    return true;
  }
  return false;
}

export function clearWhitelist(): void {
  whitelistStore = [];
}

export function resetWhitelist(): void {
  whitelistStore = [...INITIAL_WHITELIST];
}

export function getLog(offset: number, pageSize = 16): AceLogResponse {
  // Generate synthetic log entries that look like the real charger firmware log
  const lines: string[] = [];
  const baseTime = Date.now();
  for (let i = 0; i < pageSize; i++) {
    const seq = offset + i;
    const ts = new Date(baseTime - (pageSize - i) * 60_000).toISOString();
    lines.push(`${seq}_${ts}:INFO:virtual_charger:0:Virtual charger heartbeat ${seq}`);
  }
  return { version: 2, log: lines, offset, total: 512 };
}

export function getTransactions(_offset: number): AceTransactionsResponse {
  // Real charger returns a quirky format; replicate the shape
  return { version: 2, [`${_offset}_dto`]: 0 };
}

export function getChargingProfiles(): AceChargingProfilesResponse {
  return { version: 2, ChargingProfileIDs: [] };
}
