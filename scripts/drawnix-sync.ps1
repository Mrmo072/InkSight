param(
    [ValidateSet("status", "fetch", "log", "diff", "all")]
    [string]$Action = "status",

    [string]$RepoPath = "drawnix-repo",

    [string]$BaseRef = "upstream/main",

    [string]$TargetRef = "origin/main",

    [int]$LogCount = 20
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    & git -C $RepoPath @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git -C $RepoPath $($Args -join ' ')"
    }
}

function Write-Section {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title
    )

    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Assert-RepoReady {
    if (-not (Test-Path $RepoPath)) {
        throw "Repository path not found: $RepoPath"
    }

    $isGitRepo = (& git -C $RepoPath rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -ne 0 -or $isGitRepo.Trim() -ne "true") {
        throw "Not a git repository: $RepoPath"
    }
}

function Show-Status {
    Write-Section "Remotes"
    Invoke-Git @("remote", "-v")

    Write-Section "Branch Tracking"
    Invoke-Git @("branch", "-vv")

    Write-Section "Working Tree"
    Invoke-Git @("status", "--short")
}

function Fetch-Upstream {
    Write-Section "Fetch Upstream"
    Invoke-Git @("fetch", "upstream")
}

function Show-UpstreamLog {
    Write-Section "Recent Upstream Commits"
    Invoke-Git @("log", "--oneline", "$BaseRef", "-n", "$LogCount")
}

function Show-OriginDiff {
    Write-Section "Diff Between $BaseRef and $TargetRef"
    Invoke-Git @("diff", "--stat", "$BaseRef...$TargetRef")
}

Assert-RepoReady

switch ($Action) {
    "status" {
        Show-Status
    }
    "fetch" {
        Fetch-Upstream
    }
    "log" {
        Show-UpstreamLog
    }
    "diff" {
        Show-OriginDiff
    }
    "all" {
        Show-Status
        Fetch-Upstream
        Show-UpstreamLog
        Show-OriginDiff
    }
    default {
        throw "Unsupported action: $Action"
    }
}
