#!/bin/bash
# Validates the e-invoices of the seeded demo company with the official tools:
#   - KoSIT validator + XRechnung configuration  -> XRechnung (UBL + CII), EN16931 + XRechnung rules
#   - Saxon + EN16931 CII schematron             -> XML embedded in the ZUGFeRD PDF
#   - veraPDF                                    -> PDF/A-3b conformance of the ZUGFeRD PDF
# Needs: java, curl, unzip, python3, pdfdetach (poppler-utils); backend on :3000 with seeded data.
# First run downloads ~100 MB into e2e/.cache (gitignored). Usage: ./validate-einvoice.sh
set -euo pipefail
cd "$(dirname "$0")"
API=${E2E_API_URL:-http://localhost:3000}
CACHE=$PWD/.cache; mkdir -p "$CACHE" && cd "$CACHE"

KOSIT_V=1.5.0
XR_CFG_URL=https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip
if [ ! -f kosit/validationtool-$KOSIT_V-standalone.jar ]; then
  mkdir -p kosit && curl -sL -o kosit/v.zip https://github.com/itplr-kosit/validator/releases/download/v$KOSIT_V/validator-$KOSIT_V-distribution.zip && (cd kosit && unzip -qo v.zip)
  mkdir -p kosit/cfg && curl -sL -o kosit/cfg.zip "$XR_CFG_URL" && (cd kosit/cfg && unzip -qo ../cfg.zip)
fi
if [ ! -x vera/inst/verapdf ]; then
  mkdir -p vera && curl -sL -o vera/v.zip https://software.verapdf.org/releases/verapdf-installer.zip && (cd vera && unzip -qo v.zip)
  cat > vera/auto.xml <<XML
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
<com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
<com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>$CACHE/vera/inst</installpath></com.izforge.izpack.panels.target.TargetPanel>
<com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select"><pack index="0" name="veraPDF Runtime" selected="true"/><pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/><pack index="2" name="veraPDF Validation model" selected="true"/><pack index="3" name="veraPDF Documentation" selected="false"/><pack index="4" name="veraPDF Sample Plugins" selected="false"/></com.izforge.izpack.panels.packs.PacksPanel>
<com.izforge.izpack.panels.install.InstallPanel id="install"/>
<com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
XML
  (cd vera/verapdf-greenfield-* && java -jar verapdf-izpack-installer-*.jar ../auto.xml >/dev/null)
fi

# ---- fetch all issued invoices / credit notes of the demo company
rm -rf work && mkdir -p work/xml work/pdf
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' -d '{"email":"demo@meisterwerk.local","password":"demo12345"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
for type in INVOICE CREDIT_NOTE; do
  curl -s "$API/documents?type=$type&pageSize=100" -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys,json
for d in json.load(sys.stdin)["items"]:
    if d["number"]: print(d["id"], d["number"])'
done > work/ids.txt
fail=0
while read -r id number; do
  for format in xrechnung-ubl xrechnung-cii; do
    curl -sf -o "work/xml/$number-$format.xml" "$API/documents/$id/e-invoice?format=$format" -H "Authorization: Bearer $TOKEN" || { echo "FAIL  $number $format: API refused"; fail=1; }
  done
  curl -sf -o "work/pdf/$number.pdf" "$API/documents/$id/e-invoice?format=zugferd" -H "Authorization: Bearer $TOKEN" || { echo "FAIL  $number zugferd: API refused"; fail=1; }
done < work/ids.txt

# ---- XRechnung: KoSIT validator
java -jar kosit/validationtool-$KOSIT_V-standalone.jar -s kosit/cfg/scenarios.xml -r kosit/cfg -o work/report work/xml/*.xml 2>&1 | grep -E "Acceptable|Rejected" || true
if ! java -jar kosit/validationtool-$KOSIT_V-standalone.jar -s kosit/cfg/scenarios.xml -r kosit/cfg -o work/report work/xml/*.xml >/dev/null 2>&1; then fail=1; echo "FAIL  KoSIT validator rejected files (see .cache/work/report)"; fi

# ---- ZUGFeRD: PDF/A-3b (veraPDF) and the embedded XML (EN16931 schematron via Saxon)
for pdf in work/pdf/*.pdf; do
  name=$(basename "$pdf" .pdf)
  if ! ./vera/inst/verapdf --flavour 3b "$pdf" | grep -q 'isCompliant="true"'; then echo "FAIL  $name: not PDF/A-3b"; fail=1; fi
  (cd work/pdf && rm -f factur-x.xml && pdfdetach -saveall "$name.pdf" >/dev/null && cp factur-x.xml "$name.xml")
  java -cp "kosit/libs/*" net.sf.saxon.Transform -s:"work/pdf/$name.xml" -xsl:kosit/cfg/EN16931-CII-validation.xsl -o:"work/pdf/$name.svrl" 2>/dev/null
  if grep -q "failed-assert" "work/pdf/$name.svrl"; then echo "FAIL  $name: embedded XML violates EN16931"; fail=1; fi
done

[ $fail = 0 ] && echo "OK: $(wc -l < work/ids.txt) documents x (XRechnung UBL + CII + ZUGFeRD) are valid" || { echo "E-invoice validation FAILED"; exit 1; }
