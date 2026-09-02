# ============================================================
# FINANCE-ON CUSTOMER DATA EXTRACTION & SYNC SCRIPT
# ============================================================
# Extracts Customers from Sage 50 and sends them to webhook
#
# Current scope:
#   - Customer Account (A/C)
#   - Customer Name
#   - Telephone
#
# Flow:
#   Sage 50 -> ODBC -> PowerShell -> Webhook -> Supabase
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

$dsnName    = "Sage50"
$uid        = "abhey"

# IMPORTANT:
# Replace this with your Sage 50 ODBC password.
$pwd        = 'Dev1%$@jh'

$webhookUrl = "https://finance-on-topaz.vercel.app/api/webhook"

$maxRetries = 3

# Logging
$logDirectory = "C:\Logs"

# Create C:\Logs if it does not exist
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$logFile = Join-Path `
    $logDirectory `
    "FinanceOnSync_$(Get-Date -Format 'yyyyMMdd').log"


# ============================================================
# LOGGING
# ============================================================

function Write-Log {

    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $logEntry = "[$timestamp] [$Level] $Message"

    Write-Host $logEntry

    Add-Content `
        -Path $logFile `
        -Value $logEntry `
        -Encoding UTF8
}


# ============================================================
# CONNECT TO SAGE 50 THROUGH ODBC
# ============================================================

function Connect-Sage50 {

    param(
        [int]$retryCount = 0
    )

    try {

        Write-Log "Connecting to Sage 50..."

        $connectionString = "DSN=$dsnName;UID=$uid;PWD=$pwd;"

        $connection = New-Object `
            System.Data.Odbc.OdbcConnection(
                $connectionString
            )

        $connection.Open()

        Write-Log "Connected to Sage 50 successfully."

        return $connection

    }
    catch {

        if ($retryCount -lt $maxRetries) {

            $attempt = $retryCount + 1

            Write-Log `
                "Connection failed. Attempt $attempt/$maxRetries. Retrying in 5 seconds..." `
                "WARN"

            Start-Sleep -Seconds 5

            return Connect-Sage50 `
                -retryCount $attempt
        }

        Write-Log `
            "Failed to connect to Sage 50 after $maxRetries attempts." `
            "ERROR"

        Write-Log `
            "Connection error: $($_.Exception.Message)" `
            "ERROR"

        throw
    }
}


# ============================================================
# EXECUTE SAGE SQL QUERY
# ============================================================

function Execute-SageQuery {

    param(
        [string]$Query,
        [string]$QueryName,
        $Connection
    )

    Write-Log "Executing query: $QueryName"

    try {

        $command = $Connection.CreateCommand()

        $command.CommandText = $Query

        $reader = $command.ExecuteReader()

        $rows = @()

        while ($reader.Read()) {

            $row = [ordered]@{}

            for (
                $i = 0;
                $i -lt $reader.FieldCount;
                $i++
            ) {

                $columnName = $reader.GetName($i)

                $value = $reader.GetValue($i)

                if ($value -is [System.DBNull]) {
                    $value = $null
                }

                $row[$columnName] = $value
            }

            $rows += [PSCustomObject]$row
        }

        $reader.Close()

        Write-Log `
            "Query '$QueryName' returned $($rows.Count) rows."

        return $rows

    }
    catch {

        Write-Log `
            "Query '$QueryName' failed: $($_.Exception.Message)" `
            "ERROR"

        throw
    }
}


# ============================================================
# GET CUSTOMERS FROM SAGE 50
# ============================================================

function Get-SageCustomers {

    param(
        $Connection
    )

    Write-Log "Fetching customers from Sage 50..."

    # Sage 50 customer data.
    #
    # The Sage UI displays:
    #   A/C
    #   Name
    #   Telephone
    #
    # In the Sage ODBC database these are normally exposed as:
    #   ACCOUNT_REF
    #   NAME
    #   TELEPHONE
    #
    # We alias them to the names that our webhook will receive.

    $query = @"
SELECT
    ACCOUNT_REF AS CustomerCode,
    NAME AS CustomerName,
    TELEPHONE AS Phone
FROM SALES_LEDGER
"@

    return Execute-SageQuery `
        -Query $query `
        -QueryName "Customers" `
        -Connection $Connection
}


# ============================================================
# SEND CUSTOMERS TO WEBHOOK
# ============================================================

function Send-CustomersToWebhook {

    param(
        $Customers
    )

    Write-Log `
        "Preparing $($Customers.Count) customers for webhook."

    $payload = @{
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

        source = "Sage50"

        data = @{
            customers = $Customers
        }

        metadata = @{
            totalCustomers = $Customers.Count
        }
    }

    $jsonBody = $payload | ConvertTo-Json -Depth 10

    Write-Log `
        "Payload size: $($jsonBody.Length) characters."

    try {

        Write-Log `
            "Sending customer data to: $webhookUrl"

        $response = Invoke-RestMethod `
            -Uri $webhookUrl `
            -Method POST `
            -Body $jsonBody `
            -ContentType "application/json" `
            -ErrorAction Stop

        Write-Log `
            "SUCCESS - Webhook response received."

        if ($null -ne $response) {

            Write-Log `
                "Webhook response: $($response | ConvertTo-Json -Depth 5)"
        }

        return $response

    }
    catch {

        Write-Log `
            "Webhook request failed: $($_.Exception.Message)" `
            "ERROR"

        throw
    }
}


# ============================================================
# MAIN EXECUTION
# ============================================================

Write-Log "============================================"
Write-Log "Finance-On Customer Sync Started"
Write-Log "============================================"

$connection = $null

try {

    # --------------------------------------------------------
    # STEP 1: CONNECT TO SAGE
    # --------------------------------------------------------

    $connection = Connect-Sage50


    # --------------------------------------------------------
    # STEP 2: GET CUSTOMERS
    # --------------------------------------------------------

    $customers = Get-SageCustomers `
        -Connection $connection


    # --------------------------------------------------------
    # STEP 3: CHECK CUSTOMER RESULT
    # --------------------------------------------------------

    if ($null -eq $customers) {

        throw "Customer query returned null."
    }

    Write-Log `
        "Customer extraction completed."

    Write-Log `
        "Total customers found: $($customers.Count)"


    # --------------------------------------------------------
    # STEP 4: SEND CUSTOMERS TO WEBHOOK
    # --------------------------------------------------------

    Send-CustomersToWebhook `
        -Customers $customers | Out-Null


    # --------------------------------------------------------
    # STEP 5: SUCCESS
    # --------------------------------------------------------

    Write-Log "Customer sync completed successfully."

}
catch {

    Write-Log `
        "CRITICAL ERROR: $($_.Exception.Message)" `
        "ERROR"

    Write-Log `
        "Stack Trace: $($_.ScriptStackTrace)" `
        "ERROR"

    exit 1
}
finally {

    # --------------------------------------------------------
    # CLOSE SAGE CONNECTION
    # --------------------------------------------------------

    if ($connection) {

        try {

            if ($connection.State -eq 'Open') {

                $connection.Close()

                Write-Log `
                    "Sage database connection closed."
            }

            $connection.Dispose()

        }
        catch {

            Write-Log `
                "Error while closing database connection: $($_.Exception.Message)" `
                "WARN"
        }
    }
}


Write-Log "============================================"
Write-Log "Finance-On Customer Sync Finished"
Write-Log "============================================"