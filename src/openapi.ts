export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EVSE Automation Charger API',
    version: '1.0.0',
    description: `The EVSE Automation API allows you to remotely observe and control virtual charging stations.

### Key capabilities

* Observe charger health, topology, sessions, and diagnostics 📊
* Execute local and remote control operations safely ⚡
* Simulate OCPP charge-point and central-system interactions 🔌
* Validate real-time behavior through explicit request/response contracts 🧪

### Notes

* Most endpoints accept \`evseId\` in path/query/body with this precedence: path → query → body → default EVSE.
* Responses are JSON and optimized for operations, QA, and automation flows.
`,
    license: {
      name: 'Apache 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    },
    contact: {
      name: 'EVSE Automation Team',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Local CLI runtime (charger-service)',
      variables: {
        basePath: {
          default: '/',
        },
      },
      'x-tags': [
        {
          name: 'env:local',
          description: 'Local development process running from CLI',
        },
        {
          name: 'kind:runtime',
          description: 'Primary in-process HTTP server',
        },
      ],
    },
    {
      url: 'http://localhost:31311',
      description: 'Typical local mapped port for charger instance',
      'x-tags': [
        {
          name: 'env:test-local',
          description: 'Local functional QA instance',
        },
      ],
    },
  ],
  tags: [
    {
      name: 'Read',
      description: 'Read charger status, power, topology, and telemetry snapshots.',
    },
    {
      name: 'Control',
      description: 'Imperative controls for sessions, power, availability, and reset flows.',
    },
    {
      name: 'OCPP CP',
      description: 'Charge Point to Central System simulation messages.',
    },
    {
      name: 'OCPP CS',
      description: 'Central System to Charge Point command simulation messages.',
    },
    {
      name: 'Diagnostics',
      description: 'Operational introspection and runtime diagnostics.',
    },
  ],
  paths: {
    '/openapi.json': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Get OpenAPI specification document',
        operationId: 'getOpenApiDocument',
        responses: {
          '200': {
            description: 'OpenAPI JSON document',
          },
        },
      },
    },
    '/docs': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Get Swagger UI documentation page',
        operationId: 'getSwaggerDocs',
        responses: {
          '200': {
            description: 'Swagger UI HTML page',
          },
        },
      },
    },
    '/device.xml': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Get SSDP/UPnP device description XML',
        operationId: 'getSsdpDeviceDescription',
        responses: {
          '200': {
            description: 'UPnP device description XML',
            content: {
              'application/xml': {
                schema: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Read'],
        summary: 'Get fleet/EVSE health summary',
        description:
          'Returns connectivity aggregation for the selected EVSE scope. Optional filters narrow the response to environment/company/location.',
        operationId: 'getHealth',
        parameters: [
          { $ref: '#/components/parameters/envId' },
          { $ref: '#/components/parameters/envName' },
          { $ref: '#/components/parameters/companyId' },
          { $ref: '#/components/parameters/companyName' },
          { $ref: '#/components/parameters/locationId' },
          { $ref: '#/components/parameters/locationName' },
        ],
        responses: {
          '200': {
            description: 'Health summary',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/info': {
      get: {
        tags: ['Read'],
        summary: 'Get EVSE information payload',
        operationId: 'getInfo',
        parameters: [
          { $ref: '#/components/parameters/envId' },
          { $ref: '#/components/parameters/envName' },
          { $ref: '#/components/parameters/companyId' },
          { $ref: '#/components/parameters/companyName' },
          { $ref: '#/components/parameters/locationId' },
          { $ref: '#/components/parameters/locationName' },
        ],
        responses: {
          '200': {
            description: 'Single or multi-EVSE info payload',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/InfoSingleResponse' },
                    { $ref: '#/components/schemas/InfoMultiResponse' },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/status': {
      get: {
        tags: ['Read'],
        summary: 'Get EVSE connector state payload',
        operationId: 'getStatus',
        parameters: [
          { $ref: '#/components/parameters/envId' },
          { $ref: '#/components/parameters/envName' },
          { $ref: '#/components/parameters/companyId' },
          { $ref: '#/components/parameters/companyName' },
          { $ref: '#/components/parameters/locationId' },
          { $ref: '#/components/parameters/locationName' },
        ],
        responses: {
          '200': {
            description: 'Single or multi-EVSE status payload',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/StatusSingleResponse' },
                    { $ref: '#/components/schemas/StatusMultiResponse' },
                  ],
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/connectors': {
      get: {
        tags: ['Read'],
        summary: 'List all connector details for selected EVSE',
        operationId: 'listConnectors',
        parameters: [{ $ref: '#/components/parameters/evseIdQuery' }],
        responses: {
          '200': {
            description: 'Connector inventory',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConnectorListResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/connectors/{id}': {
      get: {
        tags: ['Read'],
        summary: 'Get specific connector details',
        operationId: 'getConnector',
        parameters: [
          { $ref: '#/components/parameters/connectorIdPath' },
          { $ref: '#/components/parameters/evseIdQuery' },
        ],
        responses: {
          '200': {
            description: 'Connector detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConnectorDetailResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/transactions': {
      get: {
        tags: ['Read'],
        summary: 'Get active transactions',
        operationId: 'listTransactions',
        parameters: [{ $ref: '#/components/parameters/evseIdQuery' }],
        responses: {
          '200': {
            description: 'Active transaction list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TransactionsResponse' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/connectors/{id}/transaction': {
      get: {
        tags: ['Read'],
        summary: 'Get active transaction for connector',
        operationId: 'getConnectorTransaction',
        parameters: [
          { $ref: '#/components/parameters/connectorIdPath' },
          { $ref: '#/components/parameters/evseIdQuery' },
        ],
        responses: {
          '200': {
            description: 'Connector transaction details',
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/connectors/{id}/availability': {
      post: {
        tags: ['Control'],
        summary: 'Set connector availability state',
        operationId: 'setConnectorAvailability',
        parameters: [{ $ref: '#/components/parameters/connectorIdPath' }],
        requestBody: { $ref: '#/components/requestBodies/ConnectorAvailabilityBody' },
        responses: {
          '200': { description: 'Connector availability updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/configuration': {
      get: {
        tags: ['Read', 'Diagnostics'],
        summary: 'Get charger capabilities and configuration',
        operationId: 'getConfiguration',
        parameters: [{ $ref: '#/components/parameters/evseIdQuery' }],
        responses: {
          '200': {
            description: 'Capabilities and runtime configuration',
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Control'],
        summary: 'Update charger power configuration',
        operationId: 'updateConfiguration',
        requestBody: { $ref: '#/components/requestBodies/PowerConfigBody' },
        responses: {
          '200': { description: 'Configuration updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/meters': {
      get: {
        tags: ['Read', 'Diagnostics'],
        summary: 'Get meter values snapshot',
        operationId: 'getMeters',
        parameters: [{ $ref: '#/components/parameters/evseIdQuery' }],
        responses: {
          '200': { description: 'Meter payload' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/diagnostics': {
      get: {
        tags: ['Diagnostics'],
        summary: 'Get runtime diagnostics',
        operationId: 'getDiagnostics',
        parameters: [{ $ref: '#/components/parameters/evseIdQuery' }],
        responses: {
          '200': { description: 'Runtime diagnostics payload' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/control/start': {
      post: {
        tags: ['Control'],
        summary: 'Start local charging transaction',
        operationId: 'controlStart',
        requestBody: { $ref: '#/components/requestBodies/ControlStartBody' },
        responses: {
          '200': { $ref: '#/components/responses/Ok' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/control/stop': {
      post: {
        tags: ['Control'],
        summary: 'Stop local charging transaction',
        operationId: 'controlStop',
        requestBody: { $ref: '#/components/requestBodies/ControlStopBody' },
        responses: {
          '200': { $ref: '#/components/responses/Ok' },
          '204': { description: 'No active transaction to stop' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/control/status': {
      post: {
        tags: ['Control'],
        summary: 'Force connector status',
        operationId: 'controlStatus',
        requestBody: { $ref: '#/components/requestBodies/ControlStatusBody' },
        responses: {
          '200': { $ref: '#/components/responses/Ok' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/control/power': {
      post: {
        tags: ['Control'],
        summary: 'Adjust amps/volts for meter simulation',
        operationId: 'controlPower',
        requestBody: { $ref: '#/components/requestBodies/PowerConfigBody' },
        responses: {
          '200': { description: 'Power updated' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/control/disconnect': {
      post: {
        tags: ['Control'],
        summary: 'Simulate websocket disconnect',
        operationId: 'controlDisconnect',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { $ref: '#/components/responses/Ok' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/control/reconnect': {
      post: {
        tags: ['Control'],
        summary: 'Simulate websocket reconnect',
        operationId: 'controlReconnect',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { $ref: '#/components/responses/Ok' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/control/reset': {
      post: {
        tags: ['Control'],
        summary: 'Perform local reset',
        operationId: 'controlReset',
        requestBody: { $ref: '#/components/requestBodies/ResetBody' },
        responses: {
          '200': { description: 'Reset initiated' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/control/emergency-stop': {
      post: {
        tags: ['Control'],
        summary: 'Emergency-stop all active sessions on EVSE',
        operationId: 'controlEmergencyStop',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { description: 'Emergency stop result' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/boot': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP BootNotification',
        operationId: 'cpBootNotification',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { description: 'Boot result' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/heartbeat': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP Heartbeat',
        operationId: 'cpHeartbeat',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { description: 'Heartbeat result' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/authorize': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP Authorize',
        operationId: 'cpAuthorize',
        requestBody: { $ref: '#/components/requestBodies/AuthorizeBody' },
        responses: {
          '200': { description: 'Authorization result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/start-transaction': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP StartTransaction',
        operationId: 'cpStartTransaction',
        requestBody: { $ref: '#/components/requestBodies/ControlStartBody' },
        responses: {
          '200': { description: 'Transaction started' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/stop-transaction': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP StopTransaction',
        operationId: 'cpStopTransaction',
        requestBody: { $ref: '#/components/requestBodies/StopTransactionBody' },
        responses: {
          '200': { description: 'Transaction stop result' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/meter-values': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP MeterValues',
        operationId: 'cpMeterValues',
        requestBody: { $ref: '#/components/requestBodies/MeterValuesBody' },
        responses: {
          '200': { description: 'Meter values sent' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/status-notification': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP StatusNotification',
        operationId: 'cpStatusNotification',
        requestBody: { $ref: '#/components/requestBodies/StatusNotificationBody' },
        responses: {
          '200': { description: 'Status notification sent' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/data-transfer': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP DataTransfer',
        operationId: 'cpDataTransfer',
        requestBody: { $ref: '#/components/requestBodies/DataTransferBody' },
        responses: {
          '200': { description: 'Data transfer sent' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/firmware-status': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP FirmwareStatusNotification',
        operationId: 'cpFirmwareStatus',
        requestBody: { $ref: '#/components/requestBodies/FirmwareStatusBody' },
        responses: {
          '200': { description: 'Firmware status sent' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cp/diagnostics-status': {
      post: {
        tags: ['OCPP CP'],
        summary: 'CP DiagnosticsStatusNotification',
        operationId: 'cpDiagnosticsStatus',
        requestBody: { $ref: '#/components/requestBodies/FirmwareStatusBody' },
        responses: {
          '200': { description: 'Diagnostics status sent' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/ocpp/cs/get-configuration': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS GetConfiguration command',
        operationId: 'csGetConfiguration',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { description: 'Configuration result' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/change-configuration': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS ChangeConfiguration command',
        operationId: 'csChangeConfiguration',
        requestBody: { $ref: '#/components/requestBodies/ChangeConfigurationBody' },
        responses: {
          '200': { description: 'Change configuration result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/change-availability': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS ChangeAvailability command',
        operationId: 'csChangeAvailability',
        requestBody: { $ref: '#/components/requestBodies/ChangeAvailabilityBody' },
        responses: {
          '200': { description: 'Change availability result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/clear-cache': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS ClearCache command',
        operationId: 'csClearCache',
        requestBody: { $ref: '#/components/requestBodies/EvseOnlyBody' },
        responses: {
          '200': { description: 'Clear cache result' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/trigger-message': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS TriggerMessage command',
        operationId: 'csTriggerMessage',
        requestBody: { $ref: '#/components/requestBodies/TriggerMessageBody' },
        responses: {
          '200': { description: 'Trigger result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/remote-start': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS RemoteStartTransaction command',
        operationId: 'csRemoteStart',
        requestBody: { $ref: '#/components/requestBodies/RemoteStartBody' },
        responses: {
          '200': { description: 'Remote start result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/remote-stop': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS RemoteStopTransaction command',
        operationId: 'csRemoteStop',
        requestBody: { $ref: '#/components/requestBodies/RemoteStopBody' },
        responses: {
          '200': { description: 'Remote stop result' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/reset': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS Reset command',
        operationId: 'csReset',
        requestBody: { $ref: '#/components/requestBodies/ResetBody' },
        responses: {
          '200': { description: 'Reset result' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/unlock-connector': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS UnlockConnector command',
        operationId: 'csUnlockConnector',
        requestBody: { $ref: '#/components/requestBodies/UnlockConnectorBody' },
        responses: {
          '200': { description: 'Unlock result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/update-firmware': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS UpdateFirmware command',
        operationId: 'csUpdateFirmware',
        requestBody: { $ref: '#/components/requestBodies/UpdateFirmwareBody' },
        responses: {
          '200': { description: 'Firmware update accepted/result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/get-diagnostics': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS GetDiagnostics command',
        operationId: 'csGetDiagnostics',
        requestBody: { $ref: '#/components/requestBodies/GetDiagnosticsBody' },
        responses: {
          '200': { description: 'Diagnostics request accepted/result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/reserve-now': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS ReserveNow command',
        operationId: 'csReserveNow',
        requestBody: { $ref: '#/components/requestBodies/ReserveNowBody' },
        responses: {
          '200': { description: 'Reservation result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/ocpp/cs/cancel-reservation': {
      post: {
        tags: ['OCPP CS'],
        summary: 'CS CancelReservation command',
        operationId: 'csCancelReservation',
        requestBody: { $ref: '#/components/requestBodies/CancelReservationBody' },
        responses: {
          '200': { description: 'Cancel reservation result' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },
  components: {
    parameters: {
      evseIdQuery: {
        name: 'evseId',
        in: 'query',
        required: false,
        description: 'Target EVSE ID (optional when a default EVSE exists).',
        schema: { type: 'string' },
      },
      connectorIdPath: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Connector ID.',
        schema: { type: 'integer', minimum: 1 },
      },
      envId: {
        name: 'envId',
        in: 'query',
        schema: { type: 'string' },
      },
      envName: {
        name: 'envName',
        in: 'query',
        schema: { type: 'string' },
      },
      companyId: {
        name: 'companyId',
        in: 'query',
        schema: { type: 'string' },
      },
      companyName: {
        name: 'companyName',
        in: 'query',
        schema: { type: 'string' },
      },
      locationId: {
        name: 'locationId',
        in: 'query',
        schema: { type: 'string' },
      },
      locationName: {
        name: 'locationName',
        in: 'query',
        schema: { type: 'string' },
      },
    },
    responses: {
      Ok: {
        description: 'Operation succeeded',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/OkResponse' },
          },
        },
      },
      Error: {
        description: 'Unexpected runtime error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      BadRequest: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              missingField: {
                summary: 'Required field is missing',
                value: {
                  error: 'idTag is required',
                },
              },
              invalidState: {
                summary: 'Unsupported connector state',
                value: {
                  error: 'state is required',
                },
              },
            },
          },
        },
      },
      NotFound: {
        description: 'EVSE or resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            examples: {
              evseMissing: {
                summary: 'EVSE identifier not found',
                value: {
                  error: 'evse_not_found',
                  details: 'Requested EVSE does not exist in current runtime',
                },
              },
              connectorMissing: {
                summary: 'Connector not found',
                value: {
                  error: 'connector_not_found',
                },
              },
            },
          },
        },
      },
    },
    requestBodies: {
      EvseOnlyBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
              },
            },
          },
        },
      },
      ControlStartBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', minimum: 1, default: 1 },
                idTag: { type: 'string', default: 'LOCALTAG' },
              },
            },
          },
        },
      },
      ControlStopBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', minimum: 1, default: 1 },
              },
            },
          },
        },
      },
      ControlStatusBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['state'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', minimum: 1, default: 1 },
                state: { $ref: '#/components/schemas/ConnectorState' },
              },
            },
          },
        },
      },
      PowerConfigBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                amps: { type: 'number', minimum: 0, default: 16 },
                volts: { type: 'number', minimum: 0, default: 230 },
              },
            },
          },
        },
      },
      ConnectorAvailabilityBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                available: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      ResetBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                type: { type: 'string', enum: ['Soft', 'Hard'], default: 'Soft' },
              },
            },
          },
        },
      },
      AuthorizeBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['idTag'],
              properties: {
                evseId: { type: 'string' },
                idTag: { type: 'string' },
              },
            },
          },
        },
      },
      StopTransactionBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', default: 1 },
                reason: { type: 'string', default: 'Remote' },
              },
            },
          },
        },
      },
      MeterValuesBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', default: 1 },
                transactionId: { type: 'integer' },
              },
            },
          },
        },
      },
      StatusNotificationBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', default: 1 },
                status: { $ref: '#/components/schemas/ConnectorState' },
                errorCode: { type: 'string' },
              },
            },
          },
        },
      },
      DataTransferBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['vendorId'],
              properties: {
                evseId: { type: 'string' },
                vendorId: { type: 'string' },
                messageId: { type: 'string' },
                data: { type: 'string' },
              },
            },
          },
        },
      },
      FirmwareStatusBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                evseId: { type: 'string' },
                status: { type: 'string' },
              },
            },
          },
        },
      },
      ChangeConfigurationBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['key'],
              properties: {
                evseId: { type: 'string' },
                key: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
        },
      },
      ChangeAvailabilityBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', default: 0 },
                type: { type: 'string', enum: ['Inoperative', 'Operative'] },
              },
            },
          },
        },
      },
      TriggerMessageBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['requestedMessage'],
              properties: {
                evseId: { type: 'string' },
                requestedMessage: { type: 'string' },
                connectorId: { type: 'integer' },
              },
            },
          },
        },
      },
      RemoteStartBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['idTag'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer' },
                idTag: { type: 'string' },
              },
            },
          },
        },
      },
      RemoteStopBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                transactionId: { type: 'integer' },
                connectorId: { type: 'integer' },
              },
            },
          },
        },
      },
      UnlockConnectorBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['connectorId'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
      UpdateFirmwareBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                location: { type: 'string', format: 'uri' },
                retrieveDate: { type: 'string', format: 'date-time' },
                checksum: { type: 'string' },
                version: { type: 'string' },
                retries: { type: 'integer', minimum: 0 },
                retryInterval: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
      GetDiagnosticsBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['location'],
              properties: {
                evseId: { type: 'string' },
                location: { type: 'string', format: 'uri' },
                retries: { type: 'integer', minimum: 0 },
                retryInterval: { type: 'integer', minimum: 0 },
                startTime: { type: 'string', format: 'date-time' },
                stopTime: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      ReserveNowBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['connectorId', 'expiryDate', 'idTag', 'reservationId'],
              properties: {
                evseId: { type: 'string' },
                connectorId: { type: 'integer', minimum: 1 },
                expiryDate: { type: 'string', format: 'date-time' },
                idTag: { type: 'string' },
                reservationId: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
      CancelReservationBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reservationId'],
              properties: {
                evseId: { type: 'string' },
                reservationId: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            description: 'Machine-readable error code (for example: bad_request, evse_not_found, internal_error).',
          },
          message: {
            type: 'string',
            description: 'Optional human-readable message used by some command handlers.',
          },
          details: {
            type: 'string',
            description: 'Additional context intended for client troubleshooting.',
          },
        },
      },
      OkResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          evseId: { type: 'string' },
        },
      },
      ScopeMeta: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
      PowerProfile: {
        type: 'object',
        properties: {
          amps: { type: 'number' },
          volts: { type: 'number' },
          watts: { type: 'number' },
        },
      },
      ConnectorState: {
        type: 'string',
        enum: ['Available', 'Unavailable', 'Faulted', 'Preparing', 'Charging', 'Finishing', 'SuspendedEV', 'SuspendedEVSE'],
      },
      ConnectorStatus: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          state: { $ref: '#/components/schemas/ConnectorState' },
          errorCode: { type: 'string' },
          transactionId: { type: 'integer', nullable: true },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          connectedCount: { type: 'integer' },
          total: { type: 'integer' },
          evses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                evseId: { type: 'string' },
                connected: { type: 'boolean' },
              },
            },
          },
        },
      },
      InfoEvseItem: {
        type: 'object',
        properties: {
          chargerId: { type: 'string' },
          evseId: { type: 'string' },
          csmsUrl: { type: 'string' },
          connectors: { type: 'integer' },
          location: { $ref: '#/components/schemas/ScopeMeta' },
          company: { $ref: '#/components/schemas/ScopeMeta' },
          environment: { $ref: '#/components/schemas/ScopeMeta' },
          power: { $ref: '#/components/schemas/PowerProfile' },
          heartbeatMs: { type: 'integer' },
          lastMessageAt: { type: 'number', nullable: true },
        },
      },
      InfoSingleResponse: {
        allOf: [
          {
            type: 'object',
            properties: {
              containerId: { type: 'string' },
            },
          },
          { $ref: '#/components/schemas/InfoEvseItem' },
        ],
      },
      InfoMultiResponse: {
        type: 'object',
        properties: {
          containerId: { type: 'string' },
          evseCount: { type: 'integer' },
          evses: {
            type: 'array',
            items: { $ref: '#/components/schemas/InfoEvseItem' },
          },
        },
      },
      StatusEvseItem: {
        type: 'object',
        properties: {
          chargerId: { type: 'string' },
          evseId: { type: 'string' },
          connected: { type: 'boolean' },
          connectors: {
            type: 'array',
            items: { $ref: '#/components/schemas/ConnectorStatus' },
          },
          location: { $ref: '#/components/schemas/ScopeMeta' },
          company: { $ref: '#/components/schemas/ScopeMeta' },
          environment: { $ref: '#/components/schemas/ScopeMeta' },
        },
      },
      StatusSingleResponse: {
        allOf: [
          {
            type: 'object',
            properties: {
              containerId: { type: 'string' },
            },
          },
          { $ref: '#/components/schemas/StatusEvseItem' },
        ],
      },
      StatusMultiResponse: {
        type: 'object',
        properties: {
          containerId: { type: 'string' },
          evseCount: { type: 'integer' },
          evses: {
            type: 'array',
            items: { $ref: '#/components/schemas/StatusEvseItem' },
          },
        },
      },
      ConnectorListResponse: {
        type: 'object',
        properties: {
          connectors: {
            type: 'array',
            items: { $ref: '#/components/schemas/ConnectorStatus' },
          },
          totalConnectors: { type: 'integer' },
          chargerId: { type: 'string' },
          evseId: { type: 'string' },
          containerId: { type: 'string' },
        },
      },
      ConnectorDetailResponse: {
        allOf: [
          { $ref: '#/components/schemas/ConnectorStatus' },
          {
            type: 'object',
            properties: {
              chargerId: { type: 'string' },
              evseId: { type: 'string' },
              containerId: { type: 'string' },
              power: { $ref: '#/components/schemas/PowerProfile' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      TransactionsResponse: {
        type: 'object',
        properties: {
          transactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                transactionId: { type: 'integer' },
                connectorId: { type: 'integer' },
                state: { $ref: '#/components/schemas/ConnectorState' },
                chargerId: { type: 'string' },
                evseId: { type: 'string' },
                containerId: { type: 'string' },
                power: { $ref: '#/components/schemas/PowerProfile' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
          count: { type: 'integer' },
        },
      },
    },
  },
  'x-asyncapi-inspired': {
    channelMap: {
      'evse.{evseId}.status.changed': {
        direction: 'publish',
        summary: 'Connector and station status transitions',
      },
      'evse.{evseId}.meter.values': {
        direction: 'publish',
        summary: 'Meter snapshots emitted by CP simulation',
      },
      'evse.{evseId}.command.remote-start': {
        direction: 'subscribe',
        summary: 'Remote start command flow',
      },
      'evse.{evseId}.command.remote-stop': {
        direction: 'subscribe',
        summary: 'Remote stop command flow',
      },
    },
  },
} as const;
