import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from rig_math import make_humanoid_template, proximity_weights


class RigTemplateTests(unittest.TestCase):
    def setUp(self):
        self.bones, self.size = make_humanoid_template((-1.0, -0.15, 0.0, 1.0, 0.15, 1.8))

    def test_humanoid_has_19_bones(self):
        self.assertEqual(len(self.bones), 19)
        self.assertEqual(len({b['name'] for b in self.bones}), 19)

    def test_parents_are_valid(self):
        seen = set()
        for b in self.bones:
            self.assertTrue(b['parent'] is None or b['parent'] in seen)
            seen.add(b['name'])

    def test_weights_normalized(self):
        for point in [(0, 0, 1.4), (0.6, 0.1, 1.3), (-0.15, 0, 0.5), (0, 0, 1.7)]:
            weights = proximity_weights(point, self.bones, self.size['height'])
            self.assertLessEqual(len(weights), 4)
            self.assertAlmostEqual(sum(weight for _, weight in weights), 1.0)
            self.assertTrue(all(weight > 0 for _, weight in weights))

    def test_invalid_shapes_rejected(self):
        with self.assertRaises(ValueError):
            make_humanoid_template((-2, -1, 0, 2, 1, 0.3))


if __name__ == '__main__':
    unittest.main()
