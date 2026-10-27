param([int]$Port = 8096)
$ErrorActionPreference='Stop'
$projectDir=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectDir
$package=Get-Content .tools/last-browser-package.json -Raw | ConvertFrom-Json
$testRoot=Join-Path $projectDir ('.tools/native-update-test-'+[Guid]::NewGuid().ToString('N'))
$data=Join-Path $testRoot 'data'
New-Item -ItemType Directory -Force "$testRoot/runtime","$testRoot/proxy","$data/updates" | Out-Null
Copy-Item (Join-Path $package.payload 'runtime/node.exe') "$testRoot/runtime/node.exe"
Copy-Item (Join-Path $package.payload 'Chiaki-NG Web.exe') "$testRoot/Chiaki-NG Web.exe"
Set-Content "$testRoot/unins000.exe" 'Installed-edition marker for isolated test only.'
@"
using System;using System.IO;class Fixture { static void Main(string[] args) { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "handoff-result.txt"), String.Join("\n",args)); } }
"@ | Set-Content "$testRoot/Fixture.cs"
& C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe /nologo /target:winexe ("/out:"+(Join-Path $data 'updates\fixture.exe')) (Join-Path $testRoot 'Fixture.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile harmless installer fixture.' }
@"
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const file=path.join(process.env.CHIAKI_UPDATE_DIR,'updates','fixture.exe');
const server=http.createServer((req,res)=>{res.setHeader('X-Chiaki-App','chiaki-ng-web');res.end('ok');if(req.url==='/test-trigger')setTimeout(()=>console.log('CHIAKI_UPDATE_'+process.env.CHIAKI_UPDATE_TOKEN+' '+Buffer.from(file).toString('base64')+' '+crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')),100);});
server.listen(Number(process.env.CHIAKI_WASM_PORT),'127.0.0.1');process.stdin.resume();process.stdin.on('data',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0));
"@ | Set-Content "$testRoot/proxy/server.mjs"
$probe=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$Port)
try { $probe.Start() } finally { $probe.Stop() }
$child=Start-Process -FilePath "$testRoot/Chiaki-NG Web.exe" -ArgumentList ('--no-browser --port '+$Port+' --data-dir "'+$data+'"') -WindowStyle Hidden -PassThru
try {
 for($i=0;$i -lt 80;$i++){if($child.HasExited){throw 'Launcher exited before test server startup.'};try{$health=Invoke-WebRequest "http://127.0.0.1:$Port/health" -TimeoutSec 1;if($health.StatusCode -eq 200){break}}catch{};Start-Sleep -Milliseconds 100}
 Start-Sleep -Milliseconds 700
 Invoke-WebRequest "http://127.0.0.1:$Port/test-trigger" -TimeoutSec 3 | Out-Null
 if(-not $child.WaitForExit(15000)){throw 'Native updater did not exit after handoff.'}
 for($i=0;$i -lt 50 -and -not (Test-Path "$data/handoff-result.txt");$i++){Start-Sleep -Milliseconds 100}
 $result=Get-Content "$data/handoff-result.txt" -Raw
 if($result -notmatch '/CHIAKIUPDATE=1' -or $result -notmatch '/SILENT' -or -not $result.Contains($testRoot)){throw 'Unexpected installer handoff arguments.'}
 Write-Output 'PASS: native launcher authenticated IPC, rehashed installer, stopped its server, handed off and exited.'
} finally {if(-not $child.HasExited){Stop-Process -Id $child.Id -Force}}

