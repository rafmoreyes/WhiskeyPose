"""Regression check: independent Inspector scroll with a fixed viewport."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
CSS=(ROOT/'src/style.css').read_text(encoding='utf-8')
JS=(ROOT/'src/main.js').read_text(encoding='utf-8')
class InspectorScrollTest(unittest.TestCase):
    def test_flex_grid_children_can_shrink(self):
        self.assertIn('grid-template-rows:minmax(0,1fr)',CSS)
        self.assertIn('.inspector{min-height:0;overflow:hidden}',CSS)
        self.assertIn('.inspector-header,.inspector-bottom{flex-shrink:0}',CSS)
    def test_panel_is_only_scrolling_surface(self):
        self.assertIn('overflow-y:auto;',CSS)
        self.assertIn('overflow-x:hidden;',CSS)
        self.assertIn('overscroll-behavior-y:contain;',CSS)
    def test_scrollable_panel_is_keyboard_focusable(self):
        self.assertIn('class="inspector-content" role="region" aria-label="Inspector controls" tabindex="0"',JS)
if __name__=='__main__':unittest.main()
