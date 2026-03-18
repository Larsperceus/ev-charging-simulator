import express from 'express';
import { openApiSpec } from '../../openapi.js';

export function registerDocsRoutes(app: express.Express) {
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.get('/docs', (req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EVSE Automation API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        displayOperationId: true,
        filter: true,
        defaultModelsExpandDepth: 2,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`);
  });
}
