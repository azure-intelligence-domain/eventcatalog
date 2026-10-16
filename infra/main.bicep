// The catalog's hosting: an Azure Storage static website in Belgium Central (about €0).
// Static Web Apps is only offered in West Europe within Europe, and West Europe does not accept
// new customers for this subscription (ADR 0009).
// Deployed by this repository's own identity, which only has rights on rg-intplat-eventcatalog.

param location string = 'belgiumcentral'

resource catalog 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stcatalog${uniqueString(resourceGroup().id)}'
  location: location
  tags: {
    project: 'ai-intelligence-domain'
    component: 'eventcatalog'
    owner: 'platform-team'
  }
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // The static website endpoint serves $web anonymously; nothing else is public.
    allowBlobPublicAccess: false
    // The deploy identity has control-plane rights only (landing zone design), so the pipeline
    // fetches the account key at deploy time to configure the website and upload. Never stored.
    allowSharedKeyAccess: true
  }
}

output accountName string = catalog.name
output url string = catalog.properties.primaryEndpoints.web
