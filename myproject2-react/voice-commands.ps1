# Windows音声認識用のPowerShellコマンド集

# サーバー起動コマンド
function Start-DevServer {
    Write-Host "開発サーバーを起動しています..." -ForegroundColor Green
    Set-Location "C:\Users\taira\MyProject\myproject2-react"
    npm run dev
}

# サーバー停止（別のPowerShellウィンドウから実行）
function Stop-DevServer {
    Write-Host "開発サーバーを停止しています..." -ForegroundColor Yellow
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
}

# ブラウザでローカルホストを開く
function Open-LocalHost {
    $port = 3000
    Write-Host "ブラウザでlocalhost:${port}を開きます..." -ForegroundColor Cyan
    Start-Process "http://localhost:${port}"
}

# Git ステータス確認
function Check-GitStatus {
    Write-Host "Gitステータスを確認しています..." -ForegroundColor Magenta
    git status
}

# 使い方ガイドを表示
function Show-VoiceCommands {
    Write-Host "`n=== 音声コマンド一覧 ===" -ForegroundColor Yellow
    Write-Host "Start-DevServer    : 開発サーバーを起動"
    Write-Host "Stop-DevServer     : 開発サーバーを停止"
    Write-Host "Open-LocalHost     : ブラウザでlocalhostを開く"
    Write-Host "Check-GitStatus    : Gitステータスを確認"
    Write-Host "`nPowerShellで上記のコマンドを入力するか、音声で読み上げてください。`n"
}

# 初回実行時にガイドを表示
Show-VoiceCommands

# エイリアスを設定（短縮コマンド）
Set-Alias -Name start -Value Start-DevServer
Set-Alias -Name stop -Value Stop-DevServer
Set-Alias -Name open -Value Open-LocalHost
Set-Alias -Name status -Value Check-GitStatus

