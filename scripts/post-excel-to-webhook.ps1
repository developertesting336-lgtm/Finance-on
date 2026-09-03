# ==============================================================================
# SCRIPT TO PARSE .XLSX (OpenXML / ZIP) AND POST TO WEBHOOK WITHOUT MS EXCEL
# ==============================================================================

Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir.EndsWith("scripts")) {
    $rootDir = Split-Path -Parent $scriptDir
} else {
    $rootDir = $scriptDir
}

$xlDir = Join-Path $rootDir "financeon-xl"
$webhookUrl = "http://localhost:3000/api/webhook"

Write-Host "========================================================"
Write-Host "  Finance-On XLSX Importer (Native .NET OpenXML)"
Write-Host "========================================================"
Write-Host "Excel Directory: $xlDir"
Write-Host "Webhook URL:     $webhookUrl"
Write-Host ""

function Read-XlsxToCsvString {
    param([string]$filePath)

    $tempExtract = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    [System.IO.Compression.ZipFile]::ExtractToDirectory($filePath, $tempExtract)

    try {
        # 1. Read shared strings
        $sharedStrings = @()
        $sstPath = Join-Path $tempExtract "xl\sharedStrings.xml"
        if (Test-Path $sstPath) {
            [xml]$sstXml = Get-Content -Raw -Encoding UTF8 $sstPath
            foreach ($si in $sstXml.sst.si) {
                if ($si.t) {
                    $sharedStrings += $si.t
                } elseif ($si.r) {
                    $tParts = ($si.r | ForEach-Object { $_.t }) -join ""
                    $sharedStrings += $tParts
                } else {
                    $sharedStrings += ""
                }
            }
        }

        # 2. Read sheet 1
        $sheetPath = Join-Path $tempExtract "xl\worksheets\sheet1.xml"
        if (-not (Test-Path $sheetPath)) {
            throw "sheet1.xml not found in $filePath"
        }

        [xml]$sheetXml = Get-Content -Raw -Encoding UTF8 $sheetPath
        $rows = $sheetXml.worksheet.sheetData.row

        $csvLines = @()
        foreach ($row in $rows) {
            $colMap = @{}
            $maxColIdx = 0
            
            foreach ($c in $row.c) {
                $ref = $c.r # e.g. A1, B2, AA3
                # Extract column letters
                $colLetters = $ref -replace '\d+', ''
                
                # Convert letters to 0-based column index (A=0, B=1, ... Z=25, AA=26)
                $colIdx = 0
                for ($k = 0; $k -lt $colLetters.Length; $k++) {
                    $colIdx = $colIdx * 26 + ([int][char]$colLetters[$k] - [int][char]'A' + 1)
                }
                $colIdx = $colIdx - 1
                if ($colIdx -gt $maxColIdx) { $maxColIdx = $colIdx }

                $val = ""
                if ($c.t -eq "s") {
                    # Shared string index
                    $idx = [int]$c.v
                    if ($idx -lt $sharedStrings.Count) {
                        $val = $sharedStrings[$idx]
                    }
                } elseif ($c.v) {
                    $val = $c.v
                }
                $colMap[$colIdx] = $val
            }

            $lineVals = @()
            $hasData = $false
            for ($idx = 0; $idx -le $maxColIdx; $idx++) {
                $v = if ($colMap.ContainsKey($idx)) { $colMap[$idx] } else { "" }
                if ($v -ne "") { $hasData = $true }
                $escaped = ($v -replace '"', '""')
                $lineVals += "`"$escaped`""
            }
            if ($hasData) {
                $csvLines += ($lineVals -join ",")
            }
        }

        return ($csvLines -join "`n")
    }
    finally {
        if (Test-Path $tempExtract) {
            Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue
        }
    }
}

function Post-ToWebhook {
    param(
        [string]$type,
        [string]$csvData
    )
    
    $payload = @{
        format = "csv"
        type   = $type
        data   = $csvData
    }
    
    $jsonBody = $payload | ConvertTo-Json -Depth 5
    
    try {
        $rowCount = ($csvData.Split("`n").Count - 1)
        Write-Host "Posting $type to webhook ($rowCount data rows)..."
        $response = Invoke-RestMethod -Uri $webhookUrl -Method POST -Body $jsonBody -ContentType "application/json; charset=utf-8" -ErrorAction Stop
        Write-Host "✅ SUCCESS: $($response.message)" -ForegroundColor Green
        if ($response.summary) {
            Write-Host "   Total: $($response.summary.totalReceived) | Saved: $($response.summary.savedCount) | Failed: $($response.summary.failedCount)"
            if ($response.summary.errors.Count -gt 0) {
                Write-Host "   Errors: $($response.summary.errors | ConvertTo-Json -Compress)" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "❌ ERROR posting $type : $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 1. Clientes.xlsx -> clientes
$clientesPath = Join-Path $xlDir "Clientes.xlsx"
if (Test-Path $clientesPath) {
    Write-Host "Processing Clientes.xlsx..."
    $csv = Read-XlsxToCsvString -filePath $clientesPath
    Post-ToWebhook -type "clientes" -csvData $csv
} else {
    Write-Host "⚠️ Clientes.xlsx not found." -ForegroundColor Yellow
}
Write-Host ""

# 2. Facturas.xlsx -> facturas
$facturasPath = Join-Path $xlDir "Facturas.xlsx"
if (Test-Path $facturasPath) {
    Write-Host "Processing Facturas.xlsx..."
    $csv = Read-XlsxToCsvString -filePath $facturasPath
    Post-ToWebhook -type "facturas" -csvData $csv
} else {
    Write-Host "⚠️ Facturas.xlsx not found." -ForegroundColor Yellow
}
Write-Host ""

# 3. Proveedores.xlsx -> proveedores
$proveedoresPath = Join-Path $xlDir "Proveedores.xlsx"
if (Test-Path $proveedoresPath) {
    Write-Host "Processing Proveedores.xlsx..."
    $csv = Read-XlsxToCsvString -filePath $proveedoresPath
    Post-ToWebhook -type "proveedores" -csvData $csv
} else {
    Write-Host "⚠️ Proveedores.xlsx not found." -ForegroundColor Yellow
}
Write-Host ""

# 4. Tarifas de artículos.xlsx -> articulos
$articulosPath = Join-Path $xlDir "Tarifas de artículos.xlsx"
if (Test-Path $articulosPath) {
    Write-Host "Processing Tarifas de artículos.xlsx..."
    $csv = Read-XlsxToCsvString -filePath $articulosPath
    Post-ToWebhook -type "articulos" -csvData $csv
} else {
    Write-Host "⚠️ Tarifas de artículos.xlsx not found." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "🎉 Finished posting all Excel files!" -ForegroundColor Cyan
