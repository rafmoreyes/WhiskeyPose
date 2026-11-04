"""Launcher regression checks; runnable without Windows PowerShell or WinForms."""
import re
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[1]/'tools'/'WhiskeyPose-Launcher.ps1'
SCRIPT=SOURCE.read_text(encoding='utf-8')
class GitFallbackChecks(unittest.TestCase):
    def test_git_failure_reads_real_stderr_and_does_not_block_app(self):
        self.assertIn("RecentProcessError 'git-pull'",SCRIPT)
        self.assertIn("ContinueWithLocalBuild ('Git pull falhou: '+$detail)",SCRIPT)
        self.assertIn("try { StartServices } catch { Fail $_.Exception.Message }",SCRIPT)
    def test_never_discard_git_changes(self):
        self.assertIn("@('pull','--ff-only')",SCRIPT)
        self.assertNotRegex(SCRIPT,r'git\s+(?:reset|clean|checkout|stash)\b')
        self.assertNotIn('git pull --force',SCRIPT)
    def test_logs_are_visible_and_status_is_honest(self):
        self.assertIn("Get-Content -LiteralPath $path -Tail 8",SCRIPT)
        self.assertIn("Log ('UPDATE WARNING: '+$reason)",SCRIPT)
        self.assertIn("Status 'Pronto · versão local (Git não atualizou)' 'warn'",SCRIPT)
    def test_original_guis_and_controls_remain(self):
        for name in ['StartAll','StartServices','OpenEdge','StopServices','NotifyIcon']:
            self.assertIn(name,SCRIPT)
        self.assertTrue((SOURCE.parents[1]/'Iniciar-WhiskeyPose.bat').is_file())
    def test_no_powershell_case_insensitive_name_collision(self):
        scripts={x.lower() for x in re.findall(r'\$script:(\w+)',SCRIPT)}
        locals={x.lower() for x in re.findall(r'(?<!:)\$(?!script:)([A-Za-z_]\w*)\s*=',SCRIPT)}
        self.assertFalse(scripts & locals)
if __name__ == '__main__':
    unittest.main()
