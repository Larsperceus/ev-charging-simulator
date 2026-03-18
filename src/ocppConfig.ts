export const defaultConfiguration = [
  // ── Core Profile ──────────────────────────────────────────────────
  { key: 'HeartbeatInterval', readonly: false, value: '30' },
  { key: 'MeterValuesSampledData', readonly: false, value: 'Energy.Active.Import.Register' },
  { key: 'MeterValueSampleInterval', readonly: false, value: '5' },
  { key: 'NumberOfConnectors', readonly: true, value: '1' },
  { key: 'ClockAlignedDataInterval', readonly: false, value: '0' },
  { key: 'ConnectionTimeOut', readonly: false, value: '60' },
  { key: 'GetConfigurationMaxKeys', readonly: true, value: '100' },
  { key: 'ResetRetries', readonly: false, value: '3' },
  { key: 'StopTransactionOnEVSideDisconnect', readonly: false, value: 'true' },
  { key: 'StopTransactionOnInvalidId', readonly: false, value: 'true' },
  { key: 'UnlockConnectorOnEVSideDisconnect', readonly: false, value: 'true' },
  { key: 'TransactionMessageAttempts', readonly: false, value: '3' },
  { key: 'TransactionMessageRetryInterval', readonly: false, value: '30' },

  // ── Local Authorization ───────────────────────────────────────────
  { key: 'AuthorizeRemoteTxRequests', readonly: false, value: 'true' },
  { key: 'LocalAuthorizeOffline', readonly: false, value: 'true' },
  { key: 'LocalPreAuthorize', readonly: false, value: 'false' },

  // ── Smart Charging ────────────────────────────────────────────────
  { key: 'ChargeProfileMaxStackLevel', readonly: true, value: '3' },
  { key: 'ChargingScheduleAllowedChargingRateUnit', readonly: true, value: 'Current,Power' },
  { key: 'ChargingScheduleMaxPeriods', readonly: true, value: '24' },
  { key: 'MaxChargingProfilesInstalled', readonly: true, value: '10' },

  // ── Supported feature profiles ────────────────────────────────────
  { key: 'SupportedFeatureProfiles', readonly: true, value: 'Core,FirmwareManagement,SmartCharging,RemoteTrigger,LocalAuthListManagement,Reservation' },

  // ── Alfen-specific ────────────────────────────────────────────────
  { key: 'PW-SetChargerPassword', readonly: false, value: '' },
  { key: 'WebSocketPingInterval', readonly: false, value: '30' },
  { key: 'AllowOfflineTxForUnknownId', readonly: false, value: 'false' },
  { key: 'MeterValuesAlignedData', readonly: false, value: 'Energy.Active.Import.Register' },
];
