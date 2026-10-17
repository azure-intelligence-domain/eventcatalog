#!/bin/sh
# The official Microsoft Azure Architecture Icons (V24) for the service pages, unmodified.
# Microsoft permits their use in architecture diagrams and documentation; they are fetched at build
# time and not committed. The file names match ICONS in scripts/annotate-services.mjs and
# STORE_ICONS in scripts/discover-data-stores.mjs.
set -eu
ZIP=https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip
tmp=$(mktemp -d)
curl -fsSLo "$tmp/icons.zip" "$ZIP"
mkdir -p public/icons/azure
unzip -j -o -q "$tmp/icons.zip" \
  'Azure_Public_Service_Icons/Icons/compute/10029-icon-service-Function-Apps.svg' \
  'Azure_Public_Service_Icons/Icons/integration/02631-icon-service-Logic-Apps.svg' \
  'Azure_Public_Service_Icons/Icons/integration/10042-icon-service-API-Management-Services.svg' \
  'Azure_Public_Service_Icons/Icons/databases/10121-icon-service-Azure-Cosmos-DB.svg' \
  'Azure_Public_Service_Icons/Icons/analytics/00009-icon-service-Log-Analytics-Workspaces.svg' \
  'Azure_Public_Service_Icons/Icons/storage/10086-icon-service-Storage-Accounts.svg' \
  -d public/icons/azure
rm -rf "$tmp"
ls public/icons/azure
