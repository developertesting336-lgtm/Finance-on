# Import Excel files directly to Supabase using PowerShell COM Object or OpenXML
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$xlDir = Join-Path $scriptDir "financeon-xl"
$webhookUrl = "http://localhost:3000/api/webhook"

Write-Host "Reading Excel files from $xlDir..."

# Create COM Object for Excel
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Read-ExcelAsJson {
    param([string]$filePath)
    
    $workbook = $excel.Workbooks.Open($filePath)
    $worksheet = $workbook.Sheets.Item(1)
    $usedRange = $worksheet.UsedRange
    $rowCount = $usedRange.Rows.Count
    $colCount = $usedRange.Columns.Count
    
    $headers = @()
    for ($c = 1; $c -le $colCount; $c++) {
        $val = $worksheet.Cells.Item(1, $c).Text
        $headers += $val
    }
    
    $rows = @()
    for ($r = 2; $r -le $rowCount; $r++) {
        $rowObj = [ordered]@{}
        $hasData = $false
        for ($c = 1; $c -le $colCount; $c++) {
            $val = $worksheet.Cells.Item($r, $c).Text
            if ($val -ne "") { $hasData = $true }
            $headerName = $headers[$c - 1]
            if ($headerName) {
                $rowObj[$headerName] = $val
            }
        }
        if ($hasData) {
            $rows += [PSCustomObject]$rowObj
        }
    }
    
    $workbook.Close($false)
    return $rows
}

try {
    # 1. Clientes
    $clientesFile = Join-Path $xlDir "Clientes.xlsx"
    if (Test-Path $clientesFile) {
        Write-Host "Processing Clientes.xlsx..."
        $clientes = Read-ExcelAsJson -filePath $clientesFile
        Write-Host "Read $($clientes.Count) rows from Clientes.xlsx"
        $clientes | Select-Object -First 3 | Format-Table -AutoSize
    }

    # 2. Facturas
    $facturasFile = Join-Path $xlDir "Facturas.xlsx"
    if (Test-Path $facturasFile) {
        Write-Host "Processing Facturas.xlsx..."
        $facturas = Read-ExcelAsJson -filePath $facturasFile
        Write-Host "Read $($facturas.Count) rows from Facturas.xlsx"
        $facturas | Select-Object -First 3 | Format-Table -AutoSize
    }

    # 3. Proveedores
    $proveedoresFile = Join-Path $xlDir "Proveedores.xlsx"
    if (Test-Path $proveedoresFile) {
        Write-Host "Processing Proveedores.xlsx..."
        $proveedores = Read-ExcelAsJson -filePath $proveedoresFile
        Write-Host "Read $($proveedores.Count) rows from Proveedores.xlsx"
        $proveedores | Select-Object -First 3 | Format-Table -AutoSize
    }

    # 4. Tarifas de artículos
    $articulosFile = Join-Path $xlDir "Tarifas de artículos.xlsx"
    if (Test-Path $articulosFile) {
        Write-Host "Processing Tarifas de artículos.xlsx..."
        $articulos = Read-ExcelAsJson -filePath $articulosFile
        Write-Host "Read $($articulos.Count) rows from Tarifas de artículos.xlsx"
        $articulos | Select-Object -First 3 | Format-Table -AutoSize
    }
}
finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
