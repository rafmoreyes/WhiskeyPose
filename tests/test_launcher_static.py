"""Static regression checks for PowerShell launcher without requiring Windows."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PS = (ROOT / 'tools' / 'WhiskeyPose-Launcher.ps1').read_text(encoding='utf-8')
VBS = (ROOT / 'WhiskeyPose.vbs').read_text(encoding='utf-8')

class LauncherSmokeChecks(unittest.TestCase):
    def test_shared_variable_names_do_not_collide_with_ui_locals(self):
        # Windows PowerShell variable names are case-insensitive and
        # $script:Logs shares the variable name $logs at script scope.
        script_variables = {m.lower() for m in re.findall(r'\$script:(\w+)', PS)}
        local_assignments = {m.lower() for m in re.findall(
            r'(?<!:)\$(?!script:)([A-Za-z_]\w*)\s*=', PS)}
        self.assertFalse(script_variables & local_assignments,
                         'GUI-local variable overwrites a script-scoped variable')
    def test_log_folder_is_not_replaced_by_link_label_control(self):
        self.assertIn("$script:Logs=Join-Path $env:LOCALAPPDATA", PS)
        self.assertIn('$logLink=New-Object System.Windows.Forms.LinkLabel', PS)
        self.assertIn("Join-Path $script:Logs 'launcher.log'", PS)
    def test_launch_paths_and_safe_fallback_preserved(self):
        self.assertIn("WhiskeyPose-Launcher.ps1", VBS)
        self.assertIn("@('pull','--ff-only')", PS)
        self.assertIn('StartServices', PS)
        self.assertIn('StartVite', PS)
        self.assertIn('StopServices', PS)
        self.assertTrue((ROOT / 'Iniciar-WhiskeyPose.bat').is_file())

if __name__ == '__main__':
    unittest.main()
