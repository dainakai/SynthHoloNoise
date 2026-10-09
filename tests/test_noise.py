import hashlib
import json
from pathlib import Path
import warnings

import numpy as np
import pytest
from PIL import Image
from synthholonoise import NoiseGenerator, add_noise, list_presets
from synthholonoise.core import DATA
from synthholonoise.cli import main, load_image

pytestmark = pytest.mark.filterwarnings('ignore:SHN templates were calibrated:UserWarning')


def test_model_bank_integrity():
    presets = list_presets()
    assert [p['id'] for p in presets] == [f'{i:03d}' for i in range(1,12)]
    assert len({p['source_date'] for p in presets}) == 11
    count = 0
    for preset in presets:
        assert {(t['camera'], t['variant']) for t in preset['templates']} == {(c,v) for c in ['C001','C002'] for v in ['001','002']}
        for t in preset['templates']:
            path = DATA / t['file']
            assert hashlib.sha256(path.read_bytes()).hexdigest() == t['sha256']
            with np.load(path) as a:
                assert all(np.isfinite(a[k]).all() for k in a.files)
                assert a['fixed_amplitude_spectra'].shape == (1024,513)
                assert a['dynamic_amplitude_spectra'].shape == (128,65)
                assert np.all(np.diff(a['dynamic_quantiles'].astype(float)) >= 0)
            count += 1
    assert count == 44


def test_original_implementation_numerical_reference():
    # Values independently produced by the historical addnoise4 script.
    # Automatic variant selection preserves its first-camera RNG consumption.
    noise, _, meta = NoiseGenerator(preset='011', camera='C001', variant=None,
                                    seed=260628, strength=.5).sample()
    positions = [(0,0),(1,11),(100,200),(511,511),(1023,1023),(17,73)]
    golden = [4.348479747772217,-1.8651223182678223,.33781686425209045,
              7.039402008056641,2.957808017730713,-.9308574199676514]
    np.testing.assert_allclose([noise[y,x] for y,x in positions],golden,rtol=0,atol=5e-5)
    assert meta['source_template_id'] == 40


@pytest.mark.parametrize('dtype,value_range',[(np.uint8,None),(np.uint16,None),(np.float32,(0,1)),(np.float64,(0,1))])
def test_zero_preserves_input_and_dtype(dtype,value_range):
    x = np.ones((24,32), dtype=dtype)
    before = x.copy()
    result = add_noise(x, strength=0, value_range=value_range, return_details=True)
    assert np.array_equal(result.image,x)
    assert np.array_equal(x,before)
    assert result.image.dtype == x.dtype
    assert not np.any(result.noise)
    assert not np.shares_memory(result.image,x)


def test_seed_reproducibility_and_strength_linearity():
    a,_,_ = NoiseGenerator(seed=7,strength=.5).sample((48,64))
    b,_,_ = NoiseGenerator(seed=7,strength=1).sample((48,64))
    c,_,_ = NoiseGenerator(seed=8,strength=.5).sample((48,64))
    assert np.array_equal(a*2,b)
    assert not np.array_equal(a,c)


def test_temporal_correlation_and_static_components():
    gen=NoiseGenerator(seed=12)
    _,a,ma=gen.sample()
    _,b,mb=gen.sample()
    for name in ['lowfield','row','column','fixed']:
        assert np.array_equal(a[name],b[name])
    measured=np.corrcoef(a['dynamic'].ravel(),b['dynamic'].ravel())[0,1]
    assert measured == pytest.approx(ma['rho'],abs=.025)
    assert ma['frame_index']==0 and mb['frame_index']==1
    assert np.std(a['dynamic'])==pytest.approx(.5*ma['sigmas_dn']['dynamic'],rel=1e-5)


def test_zero_frame_advances_time_consistently():
    a=NoiseGenerator(seed=4)
    b=NoiseGenerator(seed=4)
    a.sample((32,40),strength=0)
    b.sample((32,40),strength=1)
    assert np.array_equal(a.sample((32,40))[0],b.sample((32,40))[0])


def test_value_range_is_unit_conversion_not_contrast_stretch():
    clean=np.full((32,48),.4,np.float64)
    normalized=add_noise(clean,seed=3,value_range=(0,1),return_details=True)
    dn=add_noise(clean*255,seed=3,value_range=(0,255),return_details=True)
    np.testing.assert_allclose(normalized.image*255,dn.image,atol=2e-6,rtol=0)
    u16=add_noise(np.full((32,48),25000,np.uint16),seed=3,return_details=True)
    assert u16.image.dtype==np.uint16
    assert u16.metadata['dn_to_input_scale']==257


@pytest.mark.parametrize('seed',range(4))
def test_rectangular_images(seed):
    x=np.full((35,62),90,np.uint8)
    result=add_noise(x,seed=seed,return_details=True)
    assert result.image.shape==x.shape
    assert result.metadata['resampled']


def test_float_input_and_invalid_values_are_not_silently_converted():
    with pytest.raises(ValueError,match='value_range'):
        add_noise(np.ones((12,12),np.float32))
    with pytest.raises(ValueError,match='outside'):
        add_noise(np.ones((12,12),np.float32)*2,value_range=(0,1))
    with pytest.raises(ValueError,match='NaN'):
        add_noise(np.full((12,12),np.nan),value_range=(0,1))
    with pytest.raises(ValueError,match='2-D'):
        add_noise(np.ones((12,12,3),np.uint8))
    for strength in [-1,np.nan,np.inf]:
        with pytest.raises(ValueError): NoiseGenerator(strength=strength)
    with pytest.raises(ValueError): NoiseGenerator(preset='20260703')
    with pytest.raises(ValueError): NoiseGenerator(camera='unknown')
    with pytest.raises(ValueError): NoiseGenerator(variant='003')
    with pytest.raises(ValueError): NoiseGenerator(seed=-1)


def test_clipping_and_shape_change():
    gen=NoiseGenerator(strength=2)
    out=gen.apply(np.zeros((32,32),np.uint8),return_details=True)
    assert out.image.min()==0
    assert out.metadata['clipped_fraction']>.3
    with pytest.raises(ValueError,match='shape changed'):
        gen.apply(np.zeros((33,32),np.uint8))


def test_cli_sequence_metadata_and_overwrite_protection(tmp_path):
    source=tmp_path/'input';source.mkdir()
    for i in range(2): Image.fromarray(np.full((24,32),77,np.uint8)).save(source/f'{i:04d}.png')
    dest=tmp_path/'output'
    main([str(source),str(dest),'--seed','17'])
    records=json.loads((dest/'shn.json').read_text())['frames']
    assert [m['frame_index'] for m in records]==[0,1]
    assert not np.array_equal(load_image(dest/'0000.png'),load_image(dest/'0001.png'))
    with pytest.raises(SystemExit) as exc:
        main([str(source),str(dest)])
    assert exc.value.code==2
