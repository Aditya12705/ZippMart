# Push admin app to Hugging Face Space ADI576/seamline_admin

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SpaceDir = Join-Path $env:TEMP "seamline-hf-admin"
$SpaceUrl = "https://huggingface.co/spaces/ADI576/seamline_admin"

$SkipNames = @(".git", "node_modules", ".next", "dist")

$Token = $env:HF_TOKEN
if (-not $Token) { $Token = $env:HUGGING_FACE_HUB_TOKEN }
if ($Token) {
    $SpaceUrl = "https://user:$Token@huggingface.co/spaces/ADI576/seamline_admin"
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

New-Item -ItemType Directory -Force -Path (Join-Path $SpaceDir "apps") | Out-Null
Copy-Tree (Join-Path $Root "apps\admin-web") (Join-Path $SpaceDir "apps\admin-web")
New-Item -ItemType Directory -Force -Path (Join-Path $SpaceDir "deploy") | Out-Null
Copy-Tree (Join-Path $Root "deploy\huggingface-admin") (Join-Path $SpaceDir "deploy\huggingface-admin")

foreach ($file in @("package.json", "package-lock.json", "tsconfig.base.json")) {
    Copy-Item (Join-Path $Root $file) (Join-Path $SpaceDir $file) -Force
}

Copy-Item "$Root\deploy\huggingface-admin\README.md" (Join-Path $SpaceDir "README.md") -Force
Copy-Item "$Root\deploy\huggingface-admin\Dockerfile" (Join-Path $SpaceDir "Dockerfile") -Force

Push-Location $SpaceDir
git add -A
if (-not (git diff --cached --quiet)) {
    git commit -m "Deploy SeamLine admin dashboard (Docker Space)"
}
git push
Pop-Location

Write-Host "Pushed. Open https://huggingface.co/spaces/ADI576/seamline_admin"
