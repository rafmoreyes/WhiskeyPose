import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import blender_engine as eng


class BlenderEngineTests(unittest.TestCase):
    def test_libraryfolders_vdf_modern_and_legacy(self):
        modern = '"libraryfolders" { "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" } "1" { "path" "D:\\\\SteamLibrary" } }'
        self.assertEqual(eng.steam_library_paths(modern), [r'C:\Program Files (x86)\Steam', r'D:\SteamLibrary'])
        old = '"LibraryFolders"\n{\n"1" "D:\\\\SteamLibrary"\n}'
        self.assertEqual(eng.steam_library_paths(old), [r'D:\SteamLibrary'])

    def test_discover_steam_blender_and_selected_path(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            steam = root / 'Steam'
            library = root / 'Games'
            (steam / 'steamapps').mkdir(parents=True)
            (steam / 'steamapps' / 'libraryfolders.vdf').write_text('"libraryfolders" { "1" { "path" "'+ str(library) + '" } }')
            exe = library / 'steamapps' / 'common' / 'Blender' / 'blender.exe'
            exe.parent.mkdir(parents=True)
            exe.write_text('fake')
            chosen = root / 'Custom' / 'blender.exe'
            chosen.parent.mkdir()
            chosen.write_text('fake')
            config = root / 'config.json'
            with patch.object(eng, 'steam_roots', return_value=[steam]), patch.object(eng, 'config_path', return_value=config):
                self.assertEqual(eng.active_blender()['source'], 'Steam')
                self.assertEqual(Path(eng.active_blender()['path']), exe)
                eng.save_path(str(chosen))
                self.assertEqual(eng.active_blender()['source'], 'Selected')
                self.assertEqual(Path(eng.active_blender()['path']), chosen)
                eng.save_path(None)
                self.assertEqual(eng.active_blender()['source'], 'Steam')

    def test_refuse_non_blender_executable(self):
        with tempfile.TemporaryDirectory() as td:
            wrong = Path(td) / 'powershell.exe'
            wrong.write_text('fake')
            self.assertFalse(eng.valid_blender_path(wrong))
            with patch.object(eng, 'config_path', return_value=Path(td) / 'prefs.json'):
                with self.assertRaises(ValueError):
                    eng.save_path(str(wrong))

    def test_test_executable_and_version(self):
        with tempfile.TemporaryDirectory() as td:
            blender = Path(td) / 'blender.exe'
            blender.write_text('#!/usr/bin/env python3\nprint("Blender 4.5.3")\n')
            blender.chmod(0o755)
            self.assertEqual(eng.test_blender(str(blender))['version'], '4.5.3')


if __name__ == '__main__':
    unittest.main()
