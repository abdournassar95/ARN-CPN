; ==============================================================================
; ARN Marine Navigator - Unified Windows Installer Script (Inno Setup 7)
; Developer: Abdou Ragab Nassar (ARN Technology)
; Copyright (c) 2026 ARN Technology. All Rights Reserved.
; ==============================================================================

#define MyAppName "ARN Marine Navigator"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ARN Technology"
#define MyAppURL "https://facebook.com/abdouragab.nassar"
#define MyAppExeName "ARN_Marine_Navigator.exe"

[Setup]
AppId={{D37E8F19-5A2C-4BC9-9A81-229D45F1B801}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\ARN Marine Navigator
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist\setup
OutputBaseFilename=ARN_Marine_Navigator_Setup_v{#MyAppVersion}
SetupIconFile=..\assets\icons\app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\assets\icons\app_icon.ico

; Version Info & PE Metadata for SmartScreen & Windows Explorer
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=ARN Marine Navigator Setup - Tactical Marine ECDIS Platform
VersionInfoTextVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (c) 2026 ARN Technology. All Rights Reserved.
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "ar"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
ar.CompServerDesc=نظام الملاحة وتخطيط المسارات البحرية التكتيكي السيادي (ARN Marine Navigator)
ar.TaskDesktopIcon=إنشاء اختصار لـ ARN Marine Navigator على سطح المكتب
ar.RunProgram=تشغيل ARN Marine Navigator الآن والدخول إلى الواجهة الملاحية
ar.CertRootStatus=جاري توثيق شهادة أمان ARN Technology Root...
ar.CertPubStatus=جاري توثيق ناشر التطبيق في قائمة الناشرين الموثوقين...

en.CompServerDesc=ARN Marine Navigator Tactical Navigation ECDIS Platform
en.TaskDesktopIcon=Create a desktop shortcut for ARN Marine Navigator
en.RunProgram=Launch ARN Marine Navigator now
en.CertRootStatus=Registering ARN Technology Root Certificate...
en.CertPubStatus=Adding ARN Technology to Trusted Publishers...

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; 1. Application Core & Launchers
Source: "..\Run-DesktopApp.bat"; DestDir: "{app}"; DestName: "ARN_Marine_Navigator.bat"; Flags: ignoreversion
Source: "..\Run-DesktopApp.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion

; 2. DesktopApp Core Source
Source: "..\DesktopApp\*"; DestDir: "{app}\DesktopApp"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Offline Datasets (GSHHS, S-57 Catalog, Harmonics Tides, WMM)
Source: "..\data\*"; DestDir: "{app}\data"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Security Certificate & Assets
Source: "..\cert\ARN_Technology_Root.cer"; DestDir: "{app}\cert"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Node Modules & Dependencies
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.cache*,*\.cache\*"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\ARN_Marine_Navigator.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icons\app_icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\ARN_Marine_Navigator.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icons\app_icon.ico"; Tasks: desktopicon

[Run]
; Certificate registration in Windows Certificate Store (LocalMachine and CurrentUser)
Filename: "certutil.exe"; Parameters: "-addstore -f ""Root"" ""{app}\cert\ARN_Technology_Root.cer"""; StatusMsg: "{cm:CertRootStatus}"; Flags: runhidden waituntilterminated
Filename: "certutil.exe"; Parameters: "-addstore -f ""TrustedPublisher"" ""{app}\cert\ARN_Technology_Root.cer"""; StatusMsg: "{cm:CertPubStatus}"; Flags: runhidden waituntilterminated
Filename: "certutil.exe"; Parameters: "-addstore -user -f ""Root"" ""{app}\cert\ARN_Technology_Root.cer"""; StatusMsg: "{cm:CertRootStatus}"; Flags: runhidden waituntilterminated
Filename: "certutil.exe"; Parameters: "-addstore -user -f ""TrustedPublisher"" ""{app}\cert\ARN_Technology_Root.cer"""; StatusMsg: "{cm:CertPubStatus}"; Flags: runhidden waituntilterminated

; Remove any Mark-of-the-Web (Zone.Identifier) on installed launcher
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Unblock-File -Path '{app}\ARN_Marine_Navigator.bat'"""; Flags: runhidden waituntilterminated

; Post-install Launch
Filename: "{app}\ARN_Marine_Navigator.bat"; Description: "{cm:RunProgram}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
