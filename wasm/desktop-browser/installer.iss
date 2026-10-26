#ifndef PackageDir
  #error PackageDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef AppVersion
  #define AppVersion "1.10.2"
#endif
[Setup]
AppId={{BC5BE919-47C8-4C06-868B-76720A5B0531}
AppName=Chiaki-NG Web Browser
AppVersion={#AppVersion}
AppPublisher=Chiaki-NG Web community
AppPublisherURL=https://github.com/SKIZZOO/Chiaki-NG-Web
DefaultDirName={localappdata}\Programs\Chiaki-NG Web Browser
DefaultGroupName=Chiaki-NG Web Browser
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=Chiaki-NG-Web-Setup-{#AppVersion}-x64
SetupIconFile={#PackageDir}\app.ico
UninstallDisplayIcon={app}\Chiaki-NG Web.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
LicenseFile={#PackageDir}\LICENSES\COPYING
CloseApplications=yes
RestartApplications=no
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked
[Files]
Source: "{#PackageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\Chiaki-NG Web"; Filename: "{app}\Chiaki-NG Web.exe"
Name: "{group}\First-time setup guide"; Filename: "{app}\Chiaki-NG Web.exe"; Parameters: "--guide"
Name: "{autodesktop}\Chiaki-NG Web"; Filename: "{app}\Chiaki-NG Web.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\Chiaki-NG Web.exe"; Description: "Open Chiaki-NG Web in your browser"; Flags: nowait postinstall skipifsilent
