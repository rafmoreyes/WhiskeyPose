"""Envelope influence tests do not need Blender; actual FBX remains a separate test."""
import unittest
import os, sys
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
from envelope_skin import validate_envelopes,envelope_weights

def definitions():
    return [
        {'name':'upper_arm.L','head':(0,0,0),'tail':(0,0,1)},
        {'name':'upper_arm.R','head':(1,0,0),'tail':(1,0,1)},
        {'name':'spine','head':(.5,0,0),'tail':(.5,0,1)},
    ]
def data():
    return {'format':'whiskeypose-skin-envelopes','version':1,
            'envelopes':{b['name']:{'radius':.12,'mode':'smooth'} for b in definitions()}}

class TestEnvelopeSkin(unittest.TestCase):
    def test_validation(self):
        self.assertEqual(len(validate_envelopes(data(),definitions())),3)
        d=data();d['envelopes']['spine']['radius']=-.5
        with self.assertRaises(ValueError):validate_envelopes(d,definitions())
        d=data();d['envelopes']['spine']['mode']='paint'
        with self.assertRaises(ValueError):validate_envelopes(d,definitions())
    def test_radius_changes_ownership(self):
        point=(.36,0,.5)
        config=validate_envelopes(data(),definitions())
        before,fallback=envelope_weights(point,definitions(),config,1)
        self.assertTrue(fallback)
        self.assertEqual(before[0][0],'spine')
        config['upper_arm.L']['radius']=.4
        after,fallback=envelope_weights(point,definitions(),config,1)
        self.assertFalse(fallback)
        self.assertEqual(after[0][0],'upper_arm.L')
    def test_smooth_and_rigid(self):
        config=validate_envelopes(data(),definitions())
        config['upper_arm.L']['radius']=.4
        config['spine']['radius']=.4
        result,fallback=envelope_weights((.2,0,.5),definitions(),config,1)
        self.assertFalse(fallback)
        self.assertAlmostEqual(sum(w for _,w in result),1)
        self.assertLessEqual(len(result),4)
        self.assertGreater(len(result),1)
        config['spine']['mode']='rigid'
        result,_=envelope_weights((.2,0,.5),definitions(),config,1)
        self.assertEqual(result,[('spine',1.0)])
    def test_fallback_when_no_envelope_covers_point(self):
        result,fallback=envelope_weights((5,0,0),definitions(),validate_envelopes(data(),definitions()),1)
        self.assertEqual(result,[('upper_arm.R',1.0)])
        self.assertTrue(fallback)
    def test_reject_bool_radius(self):
        d=data();d['envelopes']['spine']['radius']=True
        with self.assertRaises(ValueError):validate_envelopes(d,definitions())
if __name__=='__main__':unittest.main()
