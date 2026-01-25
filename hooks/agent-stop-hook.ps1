# Workflow Adapter Agent Stop Hook (PowerShell)
# Continues agent execution until completion signal or max iterations
# Supports multiple agents with individual state files

$ErrorActionPreference = "Continue"
Set-StrictMode -Version Latest

# Read hook input from stdin (advanced stop hook API)
$HookInput = @($input) -join "`n"

$StateDir = ".claude"
$AgentStatePattern = "workflow-agent-*.local.md"

# ============================================
# AGENT HANDLING
# ============================================

# Check if .claude directory exists
if (-not (Test-Path $StateDir -PathType Container)) {
    exit 0
}

# Check if any agent state files exist
$StateFiles = @(Get-ChildItem -Path $StateDir -Filter $AgentStatePattern -File -ErrorAction SilentlyContinue)

if ($StateFiles.Count -eq 0) {
    # No active agents - allow exit
    exit 0
}

# Sort files to ensure consistent order (alpha, beta, gamma...)
$SortedFiles = $StateFiles | Sort-Object Name

# Get transcript path from hook input first (needed for session matching)
$TranscriptPath = ""
try {
    $HookJson = $HookInput | ConvertFrom-Json -ErrorAction SilentlyContinue
    $TranscriptPath = $HookJson.transcript_path
} catch {
    $TranscriptPath = ""
}

# Helper function to parse YAML frontmatter
function Get-Frontmatter {
    param([string]$FilePath)

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return @{} }

    $frontmatter = @{}
    if ($content -match "(?s)^---\r?\n(.+?)\r?\n---") {
        $yamlContent = $Matches[1]
        foreach ($line in $yamlContent -split "`n") {
            $line = $line.Trim()
            if ($line -match "^([^:]+):\s*(.*)$") {
                $key = $Matches[1].Trim()
                $value = $Matches[2].Trim() -replace '^"(.*)"$', '$1'
                $frontmatter[$key] = $value
            }
        }
    }
    return $frontmatter
}

# Helper function to get content after frontmatter
function Get-ContentAfterFrontmatter {
    param([string]$FilePath)

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return "" }

    # Match everything after the second ---
    if ($content -match "(?s)^---\r?\n.+?\r?\n---\r?\n(.*)$") {
        return $Matches[1].Trim()
    }
    return ""
}

# Find state file that matches current session (by transcript_path)
$AgentStateFile = $null
foreach ($StateFile in $SortedFiles) {
    if (-not (Test-Path $StateFile.FullName)) {
        continue
    }

    $FileFrontmatter = Get-Frontmatter -FilePath $StateFile.FullName
    $FileTranscript = $FileFrontmatter["transcript_path"]
    $FileAgent = $FileFrontmatter["agent_name"]
    $FileFeature = $FileFrontmatter["feature_name"]

    if ([string]::IsNullOrEmpty($FileTranscript)) {
        # Unclaimed state file - check if this session started it
        if (-not [string]::IsNullOrEmpty($TranscriptPath) -and (Test-Path $TranscriptPath)) {
            $transcriptContent = Get-Content $TranscriptPath -Raw -ErrorAction SilentlyContinue
            $pattern = "feature.*$FileFeature|$FileFeature.*feature|workflow-agent-$FileAgent|:$FileAgent\b"
            if ($transcriptContent -match $pattern) {
                # This session likely started this agent - claim it
                $content = Get-Content $StateFile.FullName -Raw
                $content = $content -replace "^(---\r?\n(?:(?!---)[\s\S])*?)(started_at:)", "`$1transcript_path: `"$TranscriptPath`"`n`$2"
                Set-Content -Path $StateFile.FullName -Value $content -NoNewline
                $AgentStateFile = $StateFile.FullName
                break
            }
        }
        # Doesn't seem to belong to this session - skip
        continue
    } elseif ($FileTranscript -eq $TranscriptPath) {
        # This state file belongs to current session
        $AgentStateFile = $StateFile.FullName
        break
    }
    # If transcript doesn't match, skip (belongs to another session)
}

if ([string]::IsNullOrEmpty($AgentStateFile) -or -not (Test-Path $AgentStateFile)) {
    # No matching state file for this session - allow exit
    exit 0
}

# Parse frontmatter from matched state file
$Frontmatter = Get-Frontmatter -FilePath $AgentStateFile
$AgentName = $Frontmatter["agent_name"]
$WorkflowName = $Frontmatter["workflow_name"]
if ([string]::IsNullOrEmpty($WorkflowName)) {
    $WorkflowName = $Frontmatter["feature_name"]
}
$DocType = $Frontmatter["doc_type"]
if ([string]::IsNullOrEmpty($DocType)) {
    $DocType = "feature"
}
$Iteration = $Frontmatter["iteration"]
$MaxIterations = $Frontmatter["max_iterations"]
$CompletionSignal = $Frontmatter["completion_signal"]

# Validate numeric fields
if ($Iteration -notmatch '^\d+$') {
    Write-Error "Warning: Agent state file corrupted (iteration: '$Iteration')"
    Write-Error "Removing corrupted state file: $AgentStateFile"
    Remove-Item $AgentStateFile -Force
    exit 0
}

if ($MaxIterations -notmatch '^\d+$') {
    Write-Error "Warning: Agent state file corrupted (max_iterations: '$MaxIterations')"
    Write-Error "Removing corrupted state file: $AgentStateFile"
    Remove-Item $AgentStateFile -Force
    exit 0
}

$Iteration = [int]$Iteration
$MaxIterations = [int]$MaxIterations

# Check if max iterations reached
if ($MaxIterations -gt 0 -and $Iteration -ge $MaxIterations) {
    Write-Host "[workflow-adapter] Agent '$AgentName': Max iterations ($MaxIterations) reached."
    Remove-Item $AgentStateFile -Force

    # Check if there are more agents
    $RemainingFiles = @(Get-ChildItem -Path $StateDir -Filter $AgentStatePattern -File -ErrorAction SilentlyContinue)

    if ($RemainingFiles.Count -eq 0) {
        Write-Host "[workflow-adapter] All agents completed."
        exit 0
    }

    # Continue with next agent
    $NextFile = ($RemainingFiles | Sort-Object Name)[0]
    $NextFrontmatter = Get-Frontmatter -FilePath $NextFile.FullName
    $NextAgent = $NextFrontmatter["agent_name"]
    $NextPrompt = Get-ContentAfterFrontmatter -FilePath $NextFile.FullName

    @{
        decision = "block"
        reason = $NextPrompt
        systemMessage = "[workflow-adapter] Starting agent '$NextAgent' (iteration 1)"
    } | ConvertTo-Json -Compress
    exit 0
}

# Verify transcript file exists
if ([string]::IsNullOrEmpty($TranscriptPath) -or -not (Test-Path $TranscriptPath)) {
    Write-Error "Warning: Transcript file not found: $TranscriptPath"
    Write-Error "Stopping agent loop."
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Read last assistant message from transcript
$TranscriptContent = Get-Content $TranscriptPath -Raw -ErrorAction SilentlyContinue
if ($TranscriptContent -notmatch '"role":"assistant"') {
    Write-Error "Warning: No assistant messages in transcript"
    Write-Error "Stopping agent loop."
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Get last assistant line
$AssistantLines = $TranscriptContent -split "`n" | Where-Object { $_ -match '"role":"assistant"' }
$LastLine = $AssistantLines | Select-Object -Last 1

if ([string]::IsNullOrEmpty($LastLine)) {
    Write-Error "Warning: Failed to extract last assistant message"
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Parse last output
$LastOutput = ""
try {
    $LastJson = $LastLine | ConvertFrom-Json
    $TextContents = $LastJson.message.content | Where-Object { $_.type -eq "text" } | ForEach-Object { $_.text }
    $LastOutput = $TextContents -join "`n"
} catch {
    $LastOutput = ""
}

if ([string]::IsNullOrEmpty($LastOutput)) {
    Write-Error "Warning: Failed to parse assistant message or empty output"
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Check for WAITING_FOR_DEPENDENCY signal (should retry after delay)
if ($LastOutput -match "WAITING_FOR_DEPENDENCY") {
    Write-Host "[workflow-adapter] Agent '$AgentName': Waiting for dependency (will retry)"

    $NextIteration = $Iteration + 1
    $PromptText = Get-ContentAfterFrontmatter -FilePath $AgentStateFile

    if ([string]::IsNullOrEmpty($PromptText)) {
        Write-Error "Warning: No prompt found in state file"
        Remove-Item $AgentStateFile -Force
        exit 0
    }

    # Update iteration
    $content = Get-Content $AgentStateFile -Raw
    $content = $content -replace "iteration: \d+", "iteration: $NextIteration"
    Set-Content -Path $AgentStateFile -Value $content -NoNewline

    $SystemMsg = "[workflow-adapter] Agent '$AgentName' iteration $NextIteration/$MaxIterations | Retrying after dependency wait | ${DocType}: $WorkflowName"

    @{
        decision = "block"
        reason = $PromptText
        systemMessage = $SystemMsg
    } | ConvertTo-Json -Compress
    exit 0
}

# Check for completion signal
$Signal = if ([string]::IsNullOrEmpty($CompletionSignal)) { "TASKS_COMPLETE" } else { $CompletionSignal }

# Check if --complete mode is enabled
$CheckPlan = $Frontmatter["check_plan_completion"]

if ($LastOutput -match [regex]::Escape($Signal)) {
    # If --complete mode, verify against plan.md before marking complete
    if ($CheckPlan -eq "true" -and -not [string]::IsNullOrEmpty($WorkflowName)) {
        $PlanFile = ".workflow-adapter/doc/${DocType}_${WorkflowName}/plan.md"
        if (Test-Path $PlanFile) {
            $PlanContent = Get-Content $PlanFile -ErrorAction SilentlyContinue
            $RemainingTasks = $PlanContent | Where-Object {
                $_ -match "^\s*-\s*\[" -and
                $_ -match "assignee:.*$AgentName" -and
                $_ -notmatch "DONE"
            } | Select-Object -First 1

            if ($RemainingTasks) {
                Write-Host "[workflow-adapter] Agent '$AgentName': $Signal detected but has remaining tasks in plan.md"

                $NextIteration = $Iteration + 1
                $PromptText = Get-ContentAfterFrontmatter -FilePath $AgentStateFile

                # Update iteration
                $content = Get-Content $AgentStateFile -Raw
                $content = $content -replace "iteration: \d+", "iteration: $NextIteration"
                Set-Content -Path $AgentStateFile -Value $content -NoNewline

                $SystemMsg = "[workflow-adapter] Agent '$AgentName' iteration $NextIteration/$MaxIterations | Tasks still remaining in plan.md | ${DocType}: $WorkflowName"

                @{
                    decision = "block"
                    reason = $PromptText
                    systemMessage = $SystemMsg
                } | ConvertTo-Json -Compress
                exit 0
            }
        }
    }

    Write-Host "[workflow-adapter] Agent '$AgentName': Completed ($Signal detected)"
    Remove-Item $AgentStateFile -Force

    # Check if there are more agents
    $RemainingFiles = @(Get-ChildItem -Path $StateDir -Filter $AgentStatePattern -File -ErrorAction SilentlyContinue)

    if ($RemainingFiles.Count -eq 0) {
        Write-Host "[workflow-adapter] All agents completed."
        exit 0
    }

    # Sort remaining files and get next agent
    $SortedRemaining = $RemainingFiles | Sort-Object Name
    $NextFile = $SortedRemaining[0]
    $NextFrontmatter = Get-Frontmatter -FilePath $NextFile.FullName
    $NextAgent = $NextFrontmatter["agent_name"]
    $NextPrompt = Get-ContentAfterFrontmatter -FilePath $NextFile.FullName

    @{
        decision = "block"
        reason = $NextPrompt
        systemMessage = "[workflow-adapter] Starting agent '$NextAgent' (iteration 1)"
    } | ConvertTo-Json -Compress
    exit 0
}

# Check for critical errors
if ($LastOutput -match "CRITICAL_ERROR|FATAL_ERROR") {
    Write-Host "[workflow-adapter] Agent '$AgentName': Critical error detected. Stopping."
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Not complete - continue loop with same prompt
$NextIteration = $Iteration + 1

# Extract prompt
$PromptText = Get-ContentAfterFrontmatter -FilePath $AgentStateFile

if ([string]::IsNullOrEmpty($PromptText)) {
    Write-Error "Warning: No prompt found in state file"
    Remove-Item $AgentStateFile -Force
    exit 0
}

# Update iteration in frontmatter
$content = Get-Content $AgentStateFile -Raw
$content = $content -replace "iteration: \d+", "iteration: $NextIteration"
Set-Content -Path $AgentStateFile -Value $content -NoNewline

# Build system message
$SystemMsg = "[workflow-adapter] Agent '$AgentName' iteration $NextIteration/$MaxIterations | ${DocType}: $WorkflowName | Output '$Signal' when all tasks complete"

# Output JSON to block the stop and feed prompt back
@{
    decision = "block"
    reason = $PromptText
    systemMessage = $SystemMsg
} | ConvertTo-Json -Compress

exit 0
