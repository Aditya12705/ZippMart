# Push Zippmart to Hugging Face Space ADI576/Zippmart
# Requires HF git credentials (https://huggingface.co/settings/tokens)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SpaceDir = Join-Path $env:TEMP "proflo-hf-space"
$SpaceUrl = "https://huggingface.co/spaces/ADI576/ProFlo"

$SkipNames = @(
    ".git", "node_modules", ".next", "dist",
    "worker", "docs", "nlp-lab", "infra", "proposals", "supabase"
)

$Token = $env:HF_TOKEN
if (-not $Token) { $Token = $env:HUGGING_FACE_HUB_TOKEN }
if ($Token) {
    $SpaceUrl = "https://user:$Token@huggingface.co/spaces/ADI576/ProFlo"
}

if (Test-Path $SpaceDir) { Remove-Item -Recurse -Force $SpaceDir }
git clone $SpaceUrl $SpaceDir

function Copy-Tree($Source, $Dest) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Get-ChildItem $Source -Force | ForEach-Object {
        if ($SkipNames -contains $_.Name) { return }
        $target = Join-Path $Dest $_.Name
        if ($_.PSIsContainer) {
            Copy-Tree $_.FullName $target
        } else {
            Copy-Item $_.FullName $target -Force
        }
    }
}

Copy-Tree $Root $SpaceDir
Copy-Item "$Root\deploy\huggingface\README.md" (Join-Path $SpaceDir "README.md") -Force
Copy-Item "$Root\Dockerfile" (Join-Path $SpaceDir "Dockerfile") -Force

Push-Location $SpaceDir
git add -A
if (-not (git diff --cached --quiet)) {
    git commit -m "Deploy ProFlo shop, admin, cashier + API (Docker Space)"
}
git push
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Error "HF push failed. Check output above (e.g. secrets scanner rejected a file)."
}
Pop-Location

Write-Host "Pushed. Open https://huggingface.co/spaces/ADI576/Zippmart"
