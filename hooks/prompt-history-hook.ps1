# Prompt History Hook - logs user prompts to history.log
$input_json = $input | Out-String

if ([string]::IsNullOrWhiteSpace($input_json)) {
    exit 0
}

try {
    $data = $input_json | ConvertFrom-Json
    $prompt = $data.prompt

    if ([string]::IsNullOrWhiteSpace($prompt)) {
        exit 0
    }

    # Get current working directory's .workflow-adapter folder
    $logDir = "./.workflow-adapter"
    $logFile = "$logDir/history.log"

    # Create directory if not exists
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    # Format timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    # Escape prompt for single line (replace newlines)
    $escapedPrompt = $prompt -replace "`r`n", " " -replace "`n", " "

    # Append to log
    $logEntry = "[$timestamp] $escapedPrompt"
    Add-Content -Path $logFile -Value $logEntry -Encoding UTF8

} catch {
    # Silent fail - don't interrupt user flow
}

exit 0
