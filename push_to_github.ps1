param(
    [string]$RemoteUrl = "https://github.com/Gnaneshkumarnaidu/PDD-APP.git",
    [string]$Branch = "main",
    [string]$CommitMessage = "chore: add E2E tests, Appium scaffold, and security workflow/reports",
    [switch]$ForceRemote
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is not installed or not available on PATH. Run these commands locally where git is available."
    exit 2
}

$cwd = Get-Location
Write-Host "Repository path: $cwd"

# Determine current branch
$currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $currentBranch) { $currentBranch = $Branch }
Write-Host "Current branch: $currentBranch"

# Ensure branch exists / check it out
try {
    git rev-parse --verify $Branch >/dev/null 2>&1
    Write-Host "Checking out existing branch: $Branch"
    git checkout $Branch
} catch {
    Write-Host "Creating and checking out branch: $Branch"
    git checkout -b $Branch
}

# Configure remote
try {
    $existing = git remote get-url origin 2>$null
} catch {
    $existing = $null
}

if (-not $existing) {
    Write-Host "Adding remote origin -> $RemoteUrl"
    git remote add origin $RemoteUrl
} elseif ($existing -ne $RemoteUrl) {
    if ($ForceRemote) {
        Write-Host "Updating origin remote to $RemoteUrl"
        git remote set-url origin $RemoteUrl
    } else {
        Write-Host "Remote 'origin' already set to: $existing" -ForegroundColor Yellow
        Write-Host "If you want to override it, re-run with -ForceRemote"
    }
} else {
    Write-Host "Remote 'origin' already matches provided URL."
}

# Stage changes
Write-Host "Staging all changes..."
git add -A

# Commit if there are staged changes
$status = git status --porcelain
if ($status) {
    Write-Host "Committing changes"
    git commit -m "$CommitMessage"
} else {
    Write-Host "No changes to commit."
}

# Push
Write-Host "Pushing to origin/$Branch"
try {
    git push origin $Branch -u
    Write-Host "Push succeeded." -ForegroundColor Green
} catch {
    Write-Error "Push failed. Check credentials and remote access."
    exit 3
}
