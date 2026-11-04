"""Checks for Git exit-code detection independent of Windows/WinForms."""
import re, unittest
from pathlib import Path
S=(Path(__file__).resolve().parents[1]/'tools'/'WhiskeyPose-Launcher.ps1').read_text(encoding='utf-8')
class ProcessTests(unittest.TestCase):
 def test_explicit_process_exit_code(self):
  self.assertIn('New-Object System.Diagnostics.ProcessStartInfo',S)
  self.assertIn('New-Object System.Diagnostics.Process',S)
  self.assertIn('if(-not $process.Start())',S)
  self.assertIn('$code=[int]$script:Job.ExitCode',S)
  self.assertIn('try {$exitCode=Complete-GitPull}',S)
  self.assertIn('if($exitCode -ne 0)',S)
 def test_git_stdout_stderr_drained_and_logged(self):
  self.assertIn('StandardOutput.ReadToEndAsync()',S)
  self.assertIn('StandardError.ReadToEndAsync()',S)
  self.assertIn("'git-pull.out.log'",S)
  self.assertIn("'git-pull.err.log'",S)
 def test_safe_git_and_local_fallback(self):
  self.assertIn("$info.Arguments='pull --ff-only'",S)
  self.assertIn("ContinueWithLocalBuild ('Git pull falhou: '+$detail)",S)
  self.assertNotIn('git reset --hard',S)
 def test_powershell_variable_names_unique(self):
  scoped={x.lower() for x in re.findall(r'\$script:(\w+)',S)}
  local={x.lower() for x in re.findall(r'(?<!:)\$(?!script:)([A-Za-z_]\w*)\s*=',S)}
  self.assertFalse(scoped&local)
if __name__=='__main__':unittest.main()
