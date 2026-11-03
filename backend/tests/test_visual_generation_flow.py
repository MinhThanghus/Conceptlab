"""Full image-source -> analysis -> review -> guided model -> published lesson contract.

Offline cases replace only the external model transport. The live case uses configured
Meta models. Every case uses conftest's isolated DB/storage, never the user's lessons.
"""
from copy import deepcopy
from pathlib import Path

import pytest

from app.schemas.analysis import LabAnalysis
from app.schemas.api import GenerateIn
from app.schemas.spec import TextBlock
from app.services.generation import plan_types
from app.services.visuals import CATALOG, suggest_visual
from tests.conftest import create_lab
from tests.test_ai_offline import (analysis_out, cite, fake_ai, generation_outputs, patch_lab,
                                 step_out, upload)
from tests.test_ai_live import live_ai

ASSET = Path(__file__).resolve().parents[1] / 'app' / 'seed' / 'assets' / 'water_cycle.png'


def approve_analysis(c, lab):
    analysis = deepcopy(lab['analysis'])
    result = analysis['result']
    for field in ('objects', 'formulas', 'variables', 'steps', 'relations', 'assumptions'):
        for item in result.get(field, []):
            item['confirmed'] = True
    return patch_lab(c, lab['id'], analysis=analysis)


def approve_and_share(c, lab):
    spec = deepcopy(lab['spec'])
    for block in spec['blocks']:
        block['confirmed'] = True
        if block['type'] == 'steps':
            block['sequence_confirmed'] = True
        for question in block.get('questions', []):
            question['approved'] = True
    patch_lab(c, lab['id'], spec=spec)
    checks = c.post(f"/api/labs/{lab['id']}/validate").json()['checks']
    assert not [check for check in checks if check['status'] == 'fail'], checks
    response = c.post(f"/api/labs/{lab['id']}/publish", json={'visibility': 'link', 'allow_tutor': False})
    assert response.status_code == 200, response.text
    return response.json()['share_code']


@pytest.mark.parametrize('kind', [item['id'] for item in CATALOG])
def test_image_to_guided_scene_persists_through_publication(teacher, client, fake_ai, kind):
    c, _ = teacher
    lab = create_lab(c, title='Vòng tuần hoàn nước', subject='geography', goal='understand_process')
    source = upload(c, lab['id'], ASSET.read_bytes(), 'water-cycle.png')
    assert source['kind'] == 'image' and source['status'] == 'ready'
    fake_ai.json_outputs['analysis'] = analysis_out(
        topic='Vòng tuần hoàn nước', summary='Nước bốc hơi, ngưng tụ rồi trở về mặt đất.',
        steps=[step_out('Bốc hơi', [cite(quote='Bốc hơi', box=[.1, .1, .5, .5])], 'Nước chuyển thành hơi.')],
    )
    response = c.post(f"/api/labs/{lab['id']}/ai/analyze", json={'source_ids': [source['id']]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['analysis']['status'] == 'done'
    content = fake_ai.last('analysis')['payload']['messages'][1]['content']
    assert any(part.get('type') == 'image_url' for part in content), 'Image bytes must reach the vision model'
    approve_analysis(c, body['lab'])
    generation_outputs(fake_ai)
    # Explicit choice intentionally covers the full allowlist; auto uses content matching.
    response = c.post(f"/api/labs/{lab['id']}/ai/generate", json={'block_types': ['text'], 'visual3d': kind})
    assert response.status_code == 200, response.text
    generated = response.json()['lab']
    block = generated['spec']['blocks'][0]
    assert block['visual3d'] == kind and block['ai_generated'] and not block['confirmed']
    assert block['source_refs'][0]['source_id'] == source['id']
    prompt = fake_ai.last('block_text')['payload']['messages'][1]['content']
    assert 'Do not invent controls' in prompt and 'reconstruct the source image' in prompt
    code = approve_and_share(c, generated)
    shared = client.get(f'/api/share/{code}').json()
    assert shared['spec']['blocks'][0]['visual3d'] == kind
    assert 'analysis' not in shared
    assert shared['sources'][0]['id'] == source['id']
    assert c.get(f"/api/labs/{lab['id']}").json()['spec']['blocks'][0]['visual3d'] == kind


def test_auto_visual_requires_an_unambiguous_topic_and_cannot_execute_code():
    assert suggest_visual('Vòng tuần hoàn nước') == 'water_cycle'
    assert suggest_visual('Day and night at different latitude') == 'solar_globe'
    assert suggest_visual('enzyme and gridded population') is None
    assert suggest_visual('A random uploaded photograph') is None
    assert suggest_visual('H₂O') == 'molecular_geometry'
    assert suggest_visual('Cấu tạo tim') == 'circulation'
    assert suggest_visual('A brick hearth') is None
    assert suggest_visual('Carbon budget accounts for CO2') is None
    analysis = LabAnalysis.model_validate({'status': 'done', 'result': {'topic': 'water cycle'}})
    plan, warnings = plan_types(GenerateIn(block_types=['steps'], visual3d='auto'), analysis, 'en')
    assert ('text', {'visual3d': 'water_cycle'}) in plan and not warnings
    plain, warnings = plan_types(GenerateIn(block_types=['text'], visual3d='auto'), LabAnalysis.model_validate({'result': {'topic': 'Unknown'}}), 'en')
    assert plain == [('text', {})] and warnings
    with pytest.raises(ValueError):
        GenerateIn(visual3d='<script>alert(1)</script>')
    with pytest.raises(ValueError):
        TextBlock(id='x', visual3d='arbitrary_generated_code')


@pytest.mark.live
def test_live_image_to_guided_water_lesson(teacher, client, live_ai):
    c, _ = teacher
    lab = create_lab(c, title='Vòng tuần hoàn nước', topic='Vòng tuần hoàn nước', subject='geography', goal='understand_process')
    source = upload(c, lab['id'], ASSET.read_bytes(), 'water-cycle.png')
    response = c.post(f"/api/labs/{lab['id']}/ai/analyze", json={'source_ids': [source['id']]})
    assert response.status_code == 200, response.text[:400]
    analyzed = response.json()['lab']
    assert analyzed['analysis']['result']['topic']
    approve_analysis(c, analyzed)
    response = c.post(f"/api/labs/{lab['id']}/ai/generate", json={'block_types': ['steps', 'flow', 'text'], 'visual3d': 'water_cycle'})
    assert response.status_code == 200, response.text[:400]
    generated = response.json()['lab']
    blocks = generated['spec']['blocks']
    assert {'steps', 'flow', 'text'} <= {block['type'] for block in blocks}, response.json()['warnings']
    scene = next(block for block in blocks if block.get('visual3d') == 'water_cycle')
    assert scene['body'] and scene['source_refs']
    code = approve_and_share(c, generated)
    shared = client.get(f'/api/share/{code}').json()
    assert any(block.get('visual3d') == 'water_cycle' for block in shared['spec']['blocks'])
    print('Real AI: image uploaded, analyzed, reviewed, 2D flow + 3D guided lesson generated, validated and published in isolated test DB.')
