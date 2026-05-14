# Push cashier app to Hugging Face Space ADI576/Zippmart_Cashier

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SpaceDir = Join-Path $env:TEMP "zippmart-hf-cashier"
$SpaceUrl = "https://huggingface.co/spaces/ADI576/Zippmart_Cashier"

$IncludeNames = @(
    "package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "apps",
    "deploy"
)

$Token = $env:HF_TOKEN
if (-not $Token) { $Token = $env:HUGGING_FACE_HUB_TOKEN }
if ($Token) {
    $SpaceUrl = "https://user:$Token@huggingface.co/spaces/ADI576/Zippmart_Cashier"
}

if (Test-Path $SpaceDir) { Remove-Item -Recurse -Force $SpaceDir }
git clone $SpaceUrl $SpaceDir

function Copy-Minimal($Source, $Dest) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Get-ChildItem $Source -Force | ForEach-Object {
        if ($IncludeNames -notcontains $_.Name) { return }
        $target = Join-Path $Dest $_.Name
        if ($_.Name -eq "apps") {
            Copy-Item (Join-Path $_.FullName "cashier-web") (Join-Path $target "cashier-web") -Recurse -Force
            return
        }
        if ($_.Name -eq "deploy") {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
            Copy-Item (Join-Path $_.FullName "huggingface-cashier") (Join-Path $target "huggingface-cashier") -Recurse -Force
            return
        }
        Copy-Item $_.FullName $target -Recurse -Force
    }
}

Copy-Minimal $Root $SpaceDir

# Strip build artifacts from copied source
$strip = @("node_modules", ".next", "dist")
foreach ($name in $strip) {
    $p = Join-Path $SpaceDir "apps\cashier-web\$name"
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}

Copy-Item "$Root\deploy\huggingface-cashier\README.md" (Join-Path $SpaceDir "README.md") -Force
Copy-Item "$Root\deploy\huggingface-cashier\Dockerfile" (Join-Path $SpaceDir "Dockerfile") -Force

Push-Location $SpaceDir
git add -A
if (-not (git diff --cached --quiet)) {
    git commit -m "Deploy ZippMart cashier terminal (Docker Space)"
}
git push
Pop-Location

Write-Host "Pushed. Open https://huggingface.co/spaces/ADI576/Zippmart_Cashier"
