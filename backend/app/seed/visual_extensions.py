"""Reviewed, additive teaching scenes for existing source-backed demos."""
from ..services.visuals import BY_ID

EXTENSION_ID = 'guided_visual'
DEMO_VISUALS = {'WATER6': 'water_cycle', 'RNBYA2': 'enzyme_binding', 'RNDFFA': 'diffusion_process',
                'RNUAVA': 'quadrotor', 'RNSPVA': 'solar_cell'}


def visual_block(code, refs, language='en'):
    kind = DEMO_VISUALS[code]
    item = BY_ID[kind]
    lang = 'vi' if language == 'vi' else 'en'
    body = ('Dự đoán điều sẽ thay đổi, thử một điều khiển, rồi đối chiếu quan sát với lời giải thích. '
            if lang == 'vi' else 'Predict what will change, try a control, then compare your observation with the explanation. ')
    body += item['scope'][lang]
    if code == 'RNDFFA':
        body += ' The slider explores the closed-form forward noising distribution. Moving it back reuses the known original sample; it is not a learned reverse diffusion process.'
    return {'id': EXTENSION_ID, 'type': 'text', 'title': item['name'][lang], 'body': body,
            'visual3d': kind, 'source_refs': list(refs), 'confirmed': True, 'ai_generated': False}


def add_visual(spec, code, refs, language='en'):
    if code in DEMO_VISUALS and not any(block.get('id') == EXTENSION_ID for block in spec['blocks']):
        spec['blocks'].append(visual_block(code, refs, language))
