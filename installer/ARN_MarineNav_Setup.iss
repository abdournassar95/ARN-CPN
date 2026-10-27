; ==============================================================================
; ARN Marine Navigator - Unified Windows Installer Script (Inno Setup 7)
; Developer: Abdou Ragab Nassar (ARN Technology)
; Copyright (c) 2026 ARN Technology. All Rights Reserved.
;
; ملاحظات أمنية (مراجعة 2026-10):
;   - التثبيت لكل مستخدم (per-user) بلا صلاحيات مسؤول: PrivilegesRequired=lowest
;   - لا يتم حقن أي شهادة جذر (Root CA) — أُلغيت أوامر certutil الأربعة القديمة
;   - إضافة الناشر إلى TrustedPublisher مهمة اختيارية غير مفعّلة افتراضياً،
;     وتعمل على متجر المستخدم الحالي فقط (CurrentUser) وبأمر مرئي غير مخفي
;   - الملفات المستخرجة بواسطة المثبّت لا تحمل Mark-of-the-Web أصلاً
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
; تثبيت per-user داخل ملف تعريف المستخدم — لا UAC ولا كتابة في Program Files
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={userpf}\ARN Marine Navigator
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist\setup
OutputBaseFilename=ARN_Marine_Navigator_Setup_v{#MyAppVersion}
SetupIconFile=..\assets\icons\app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\assets\icons\app_icon.ico

; Version Info & PE Metadata for Windows Explorer
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
ar.TaskTrustPublisher=توثيق ناشر ARN Technology في متجر شهادات المستخدم الحالي (اختياري — مطلوب فقط لتثبيت توقيع المثبّت الموقّع ذاتياً دون تحذير)

en.CompServerDesc=ARN Marine Navigator Tactical Navigation ECDIS Platform
en.TaskDesktopIcon=Create a desktop shortcut for ARN Marine Navigator
en.RunProgram=Launch ARN Marine Navigator now
en.TaskTrustPublisher=Trust ARN Technology publisher in the current user certificate store (optional — only needed to suppress warnings for the self-signed setup signature)

[Tasks]
Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
; غير مفعّلة افتراضياً: قرار واعٍ من المستخدم، ولا تُلمس متجر الجهاز LocalMachine إطلاقاً
Name: "trustpublisher"; Description: "{cm:TaskTrustPublisher}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 1. Application Core & Launchers
Source: "..\Run-DesktopApp.bat"; DestDir: "{app}"; DestName: "ARN_Marine_Navigator.bat"; Flags: ignoreversion
Source: "..\Run-DesktopApp.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion

; 2. DesktopApp Core Source
Source: "..\DesktopApp\*"; DestDir: "{app}\DesktopApp"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. Offline Datasets (GSHHS, S-57 Catalog, Harmonics Tides, WMM)
Source: "..\data\*"; DestDir: "{app}\data"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. Security Certificate (ملف مرجعي فقط — لا يُثبَّت تلقائياً) & Assets
Source: "..\cert\ARN_Technology_Root.cer"; DestDir: "{app}\cert"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Node Modules & Dependencies (يجب أن يسبق البناء تثبيت كامل يشمل Electron — راجع build_and_sign.ps1)
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.cache*,*\.cache\*,*.map,*\test\*,*\tests\*,*\docs\*,*\README*"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\ARN_Marine_Navigator.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icons\app_icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\ARN_Marine_Navigator.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\icons\app_icon.ico"; Tasks: desktopicon

[Run]
; مهمة اختيارية فقط: متجر المستخدم CurrentUser\TrustedPublisher — بلا Root، بلا LocalMachine، بلا إخفاء
Filename: "certutil.exe"; Parameters: "-user -addstore -f ""TrustedPublisher"" ""{app}\cert\ARN_Technology_Root.cer"""; Description: "{cm:TaskTrustPublisher}"; Tasks: trustpublisher; Flags: waituntilterminated

; Post-install Launch
Filename: "{app}\ARN_Marine_Navigator.bat"; Description: "{cm:RunProgram}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; تنظيف مترابط: يُزال توثيق الناشر (إن وُجد) بذات صلاحية المستخدم وبدون لمس الجذر
Filename: "certutil.exe"; Parameters: "-user -delstore TrustedPublisher ""ARN Technology"""; Tasks: trustpublisher; Flags: waituntilterminated; RunOnceId: RemoveTrustedPublisher
