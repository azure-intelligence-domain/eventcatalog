// The catalog's hosting: Azure Static Web Apps, Free tier (€0).
// Deployed by this repository's own identity, which only has rights on rg-intplat-eventcatalog.

@description('Static Web Apps is not offered in Belgium Central (ADR 0003 fallback).')
param location string = 'westeurope'

resource catalog 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'stapp-intplat-eventcatalog'
  location: location
  tags: {
    project: 'ai-intelligence-domain'
    component: 'eventcatalog'
    owner: 'platform-team'
  }
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Deployed from GitHub Actions with a token fetched at deploy time: no repository link,
    // no stored deployment token, no preview environments.
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

output hostname string = catalog.properties.defaultHostname
