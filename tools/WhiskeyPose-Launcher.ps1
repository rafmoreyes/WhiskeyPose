# WhiskeyPose: Windows-only graphical launcher. Uses built-in PowerShell/WinForms.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:Root=Split-Path -Parent $PSScriptRoot
$script:Logs=Join-Path $env:LOCALAPPDATA 'WhiskeyPose\Logs'
[IO.Directory]::CreateDirectory($script:Logs)|Out-Null
$script:Phase='idle'
$script:Job=$null
$script:Worker=$null
$script:Vite=$null
$script:Reused=$false
$script:Deadline=[DateTime]::MinValue
$script:AllowExit=$false
$script:PollNumber=0

function Log([string]$message){
  $line=('[{0:HH:mm:ss}] {1}' -f (Get-Date),$message)
  [IO.File]::AppendAllText((Join-Path $script:Logs 'launcher.log'),$line+[Environment]::NewLine)
  if($script:Output){
    $script:Output.AppendText($line+[Environment]::NewLine)
    if($script:Output.TextLength -gt 12000){
      $script:Output.Text=$script:Output.Text.Substring($script:Output.TextLength-8000)
      $script:Output.SelectionStart=$script:Output.TextLength
    }
  }
}
function Status([string]$message,[string]$tone='normal'){
  $script:Status.Text=$message
  $script:Status.ForeColor=switch($tone){
    'good'{[System.Drawing.Color]::FromArgb(133,220,170)}
    'warn'{[System.Drawing.Color]::FromArgb(239,187,111)}
    'bad'{[System.Drawing.Color]::FromArgb(255,141,137)}
    default{[System.Drawing.Color]::FromArgb(233,230,224)}
  }
  $script:Start.Enabled=$script:Phase -in @('idle','ready','failed')
  $script:Stop.Enabled=($null -ne $script:Worker -or $null -ne $script:Vite -or $script:Phase -in @('updating','installing'))
}
function Program([string]$name){
  $found=Get-Command $name -ErrorAction SilentlyContinue
  if($found){return $found.Source}
  return $null
}
function Up([string]$url){
  try {
    $request=[Net.HttpWebRequest]::Create($url)
    $request.Timeout=450
    $request.ReadWriteTimeout=450
    $response=$request.GetResponse()
    try{return ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400)}
    finally{$response.Close()}
  }catch{return $false}
}
function Hidden([string]$exe,[string[]]$arguments,[string]$label){
  $stdout=Join-Path $script:Logs ($label+'.out.log')
  $stderr=Join-Path $script:Logs ($label+'.err.log')
  Log ('Starting '+$label+' without a console. Output in Logs folder.')
  Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $script:Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}
function Fail([string]$message){
  $script:Phase='failed'
  Log ('ERROR: '+$message)
  Status ($message+'  |  Consulte os logs') 'bad'
}
function EdgePath(){
  $candidates=@(
    "$([Environment]::GetFolderPath('ProgramFilesX86'))\Microsoft\Edge\Application\msedge.exe",
    "$($env:ProgramFiles)\Microsoft\Edge\Application\msedge.exe",
    "$($env:LOCALAPPDATA)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach($candidate in $candidates){if($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)){return $candidate}}
  return (Program 'msedge.exe')
}
function OpenEdge(){
  if(-not (Up 'http://127.0.0.1:5173/')){Log 'Vite is not responding yet.';return}
  $edge=EdgePath
  if(-not $edge){Fail 'Microsoft Edge não encontrado';return}
  $profile=Join-Path $env:LOCALAPPDATA 'WhiskeyPose\EdgeProfile'
  [IO.Directory]::CreateDirectory($profile)|Out-Null
  try{
    $args=@("--user-data-dir=""$profile""",'--no-first-run','--new-window','http://127.0.0.1:5173/')
    Start-Process -FilePath $edge -ArgumentList $args|Out-Null
    Log 'Opened Edge using the same dedicated WhiskeyPose profile.'
  }catch{Log ('Edge failed: '+$_.Exception.Message);Status 'Erro ao abrir Edge' 'bad'}
}
function StartVite(){
  $node=Program 'node.exe'
  if(-not $node){Fail 'Node.js não encontrado no PATH';return}
  $script:Vite=Hidden $node @('node_modules\vite\bin\vite.js','--host','127.0.0.1') 'vite'
  $script:Phase='waiting'
  $script:Deadline=(Get-Date).AddSeconds(90)
  Status 'Aguardando Worker e Vite…'
}
function StartServices(){
  if(-not (Up 'http://127.0.0.1:8765/api/health')){
    $python=Program 'python.exe'
    $args=@('-u','backend\server.py')
    if(-not $python){$python=Program 'py.exe';$args=@('-3','-u','backend\server.py')}
    if(-not $python){Fail 'Python não encontrado no PATH';return}
    $script:Worker=Hidden $python $args 'worker'
  }else{$script:Reused=$true;Log 'Worker already active on port 8765; not managed by GUI.'}
  if(Up 'http://127.0.0.1:5173/'){
    $script:Reused=$true
    Log 'Vite already active on port 5173; may be an older version.'
    $script:Phase='waiting'
    $script:Deadline=(Get-Date).AddSeconds(90)
    Status 'Conectando aos serviços existentes…'
    return
  }
  if(-not (Test-Path (Join-Path $script:Root 'node_modules\vite\bin\vite.js'))){
    if(-not (Program 'npm.cmd')){Fail 'npm não encontrado no PATH';return}
    $cmd=Join-Path $env:SystemRoot 'System32\cmd.exe'
    $script:Job=Hidden $cmd @('/d','/c','npm install --no-audit --no-fund') 'npm-install'
    $script:Phase='installing'
    Status 'Instalando dependências…'
    return
  }
  StartVite
}
function StartAll(){
  if($script:Phase -notin @('idle','ready','failed')){return}
  if($script:Phase -eq 'ready' -and ($script:Worker -or $script:Vite)){
    Log 'Restart requested: stopping only services started by this launcher.'
    StopServices
  }
  if(-not (Test-Path (Join-Path $script:Root '.git'))){Fail 'Execute dentro de um clone Git';return}
  $git=Program 'git.exe'
  if(-not $git){Fail 'Git não encontrado no PATH';return}
  $script:Reused=$false
  $script:Phase='updating'
  Status 'Atualizando (git pull --ff-only)…'
  Log 'Updating from main with git pull --ff-only.'
  try{$script:Job=Hidden $git @('pull','--ff-only') 'git-pull'}
  catch{Fail $_.Exception.Message}
}
function StopServices(){
  foreach($name in @('Vite','Worker')){
    $proc=Get-Variable -Scope Script -Name $name -ValueOnly
    if($proc){
      try{
        if(-not $proc.HasExited){Stop-Process -Id $proc.Id -Force -ErrorAction Stop;Log ('Stopped PID '+$proc.Id)}
      }catch{Log ('Could not stop PID: '+$_.Exception.Message)}
      Set-Variable -Scope Script -Name $name -Value $null
    }
  }
  if($script:Phase -in @('updating','installing')){
    try{if($script:Job -and -not $script:Job.HasExited){$script:Job.Kill()}}catch{}
  }
  $script:Job=$null
  $script:Phase='idle'
  Status 'Serviços deste launcher encerrados'
  Log 'External services remain untouched.'
}
function Poll(){
  $script:PollNumber++
  switch($script:Phase){
    'updating'{
      if($script:Job -and $script:Job.HasExited){
        if($script:Job.ExitCode -ne 0){Fail 'Git pull falhou';return}
        Log 'Git pull complete.'
        try{StartServices}catch{Fail $_.Exception.Message}
      }
    }
    'installing'{
      if($script:Job -and $script:Job.HasExited){
        if($script:Job.ExitCode -ne 0){Fail 'npm install falhou';return}
        Log 'npm install complete.'
        try{StartVite}catch{Fail $_.Exception.Message}
      }
    }
    'waiting'{
      if((Get-Date) -gt $script:Deadline){Fail 'Servidor não respondeu';return}
      if($script:Worker -and $script:Worker.HasExited -and -not (Up 'http://127.0.0.1:8765/api/health')){Fail 'Worker encerrou inesperadamente';return}
      if($script:Vite -and $script:Vite.HasExited -and -not (Up 'http://127.0.0.1:5173/')){Fail 'Vite encerrou inesperadamente';return}
      if((Up 'http://127.0.0.1:8765/api/health') -and (Up 'http://127.0.0.1:5173/')){
        $script:Phase='ready'
        if($script:Reused){Status 'Pronto · serviço externo reutilizado' 'warn';Log 'Existing service may run older code. Close old CMD sessions to update.'}
        else{Status 'Pronto · Worker e Vite ativos' 'good'}
        OpenEdge
      }
    }
    'ready'{
      if(($script:PollNumber%7) -eq 0){
        if(-not (Up 'http://127.0.0.1:8765/api/health') -or -not (Up 'http://127.0.0.1:5173/')){Status 'Um dos serviços não responde' 'warn'}
      }
    }
  }
}

$bg=[System.Drawing.Color]::FromArgb(28,31,32)
$surface=[System.Drawing.Color]::FromArgb(41,44,46)
$gold=[System.Drawing.Color]::FromArgb(238,180,107)
$fg=[System.Drawing.Color]::FromArgb(243,239,232)
$muted=[System.Drawing.Color]::FromArgb(171,176,177)
$script:Form=New-Object System.Windows.Forms.Form
$script:Form.Text='WhiskeyPose | Launcher'
$script:Form.ClientSize=New-Object System.Drawing.Size(462,332)
$script:Form.StartPosition='CenterScreen'
$script:Form.BackColor=$bg
$script:Form.ForeColor=$fg
$script:Form.FormBorderStyle='FixedSingle'
$script:Form.MaximizeBox=$false
$script:Form.Icon=[System.Drawing.SystemIcons]::Application
$script:Form.Font=New-Object System.Drawing.Font('Segoe UI',9)
$title=New-Object System.Windows.Forms.Label
$title.Text='WhiskeyPose'
$title.Font=New-Object System.Drawing.Font('Segoe UI Semibold',20)
$title.Location=New-Object System.Drawing.Point(20,13)
$title.Size=New-Object System.Drawing.Size(410,41)
$title.ForeColor=$fg
$script:Form.Controls.Add($title)
$subtitle=New-Object System.Windows.Forms.Label
$subtitle.Text='LESS SETUP. MORE POSING.'
$subtitle.Location=New-Object System.Drawing.Point(22,59)
$subtitle.Size=New-Object System.Drawing.Size(420,22)
$subtitle.ForeColor=$gold
$script:Form.Controls.Add($subtitle)
$panel=New-Object System.Windows.Forms.Panel
$panel.Location=New-Object System.Drawing.Point(18,90)
$panel.Size=New-Object System.Drawing.Size(426,47)
$panel.BackColor=$surface
$script:Form.Controls.Add($panel)
$script:Status=New-Object System.Windows.Forms.Label
$script:Status.Text='Preparando…'
$script:Status.Location=New-Object System.Drawing.Point(11,15)
$script:Status.Size=New-Object System.Drawing.Size(400,23)
$panel.Controls.Add($script:Status)
function Button([string]$text,[int]$x,[int]$w,[bool]$primary=$false){
  $b=New-Object System.Windows.Forms.Button
  $b.Text=$text
  $b.Location=New-Object System.Drawing.Point($x,152)
  $b.Size=New-Object System.Drawing.Size($w,37)
  $b.FlatStyle='Flat'
  $b.FlatAppearance.BorderSize=0
  $b.BackColor=$(if($primary){$gold}else{$surface})
  $b.ForeColor=$(if($primary){$bg}else{$fg})
  $b.Font=New-Object System.Drawing.Font('Segoe UI Semibold',9)
  $b.Cursor=[System.Windows.Forms.Cursors]::Hand
  $script:Form.Controls.Add($b)
  return $b
}
$script:Start=Button 'Iniciar / Atualizar' 18 166 $true
$open=Button 'Abrir Edge' 193 118
$script:Stop=Button 'Encerrar' 320 124
$caption=New-Object System.Windows.Forms.Label
$caption.Text='ATIVIDADE'
$caption.ForeColor=$muted
$caption.Location=New-Object System.Drawing.Point(20,204)
$caption.Size=New-Object System.Drawing.Size(220,20)
$script:Form.Controls.Add($caption)
$logs=New-Object System.Windows.Forms.LinkLabel
$logs.Text='Abrir logs'
$logs.LinkColor=$gold
$logs.ActiveLinkColor=$fg
$logs.Location=New-Object System.Drawing.Point(360,204)
$logs.Size=New-Object System.Drawing.Size(84,20)
$script:Form.Controls.Add($logs)
$script:Output=New-Object System.Windows.Forms.TextBox
$script:Output.ReadOnly=$true
$script:Output.Multiline=$true
$script:Output.ScrollBars='Vertical'
$script:Output.BorderStyle='None'
$script:Output.BackColor=$surface
$script:Output.ForeColor=$muted
$script:Output.Font=New-Object System.Drawing.Font('Consolas',8)
$script:Output.Location=New-Object System.Drawing.Point(18,228)
$script:Output.Size=New-Object System.Drawing.Size(426,88)
$script:Form.Controls.Add($script:Output)

$script:Tray=New-Object System.Windows.Forms.NotifyIcon
$script:Tray.Icon=$script:Form.Icon
$script:Tray.Text='WhiskeyPose Launcher'
$script:Tray.Visible=$true
$menu=New-Object System.Windows.Forms.ContextMenuStrip
$showItem=$menu.Items.Add('Mostrar launcher')
$edgeItem=$menu.Items.Add('Abrir WhiskeyPose')
$exitItem=$menu.Items.Add('Sair e encerrar serviços')
$script:Tray.ContextMenuStrip=$menu
$script:Start.Add_Click({StartAll})
$open.Add_Click({OpenEdge})
$script:Stop.Add_Click({StopServices})
$logs.Add_Click({Start-Process -FilePath 'explorer.exe' -ArgumentList ('"'+$script:Logs+'"')})
$showItem.Add_Click({$script:Form.Show();$script:Form.WindowState='Normal';$script:Form.Activate()})
$edgeItem.Add_Click({OpenEdge})
$exitItem.Add_Click({$script:AllowExit=$true;StopServices;$script:Tray.Visible=$false;$script:Form.Close()})
$script:Tray.Add_DoubleClick({$script:Form.Show();$script:Form.WindowState='Normal';$script:Form.Activate()})
$script:Form.Add_FormClosing({
  param($sender,$event)
  if(-not $script:AllowExit){
    $event.Cancel=$true
    $script:Form.Hide()
    Log 'Launcher hidden to tray. Right-click tray icon to exit.'
  }
})
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=850
$timer.Add_Tick({try{Poll}catch{Fail $_.Exception.Message}})
$script:Form.Add_Shown({Log ('GUI running from '+$script:Root);$timer.Start();StartAll})
try{[System.Windows.Forms.Application]::Run($script:Form)}
finally{$timer.Stop();$script:Tray.Visible=$false;$script:Tray.Dispose()}
