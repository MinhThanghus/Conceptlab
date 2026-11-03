"""Reviewed English presentation of the original HEART8 lesson.

Only a matching published demo may use this translation. Source images and exact
source quotes remain in the original language, and the original lab is never changed.
"""
from __future__ import annotations

from .demo import Ctx


class HeartTranslationUnavailable(ValueError):
    pass


TEXT = {
    ('summary',): 'The heart pumps blood around two connected circuits. Pulmonary circulation takes blood to the lungs to take in O₂ and release CO₂. Systemic circulation carries oxygen-rich blood to every organ and brings oxygen-poor blood back to the heart.',
    ('objectives', 0): 'Name the four heart chambers and the main blood vessels.',
    ('objectives', 1): 'Describe the path of blood through both circulatory circuits.',
    ('objectives', 2): 'Distinguish oxygen-rich from oxygen-poor blood.',
    ('glossary', 0, 'note'): 'An upper chamber of the heart that receives blood from the veins and pushes it down into a ventricle.',
    ('glossary', 1, 'note'): 'A lower chamber of the heart with a thick muscular wall that contracts to push blood into an artery.',
    ('glossary', 2, 'note'): 'A blood vessel that carries blood away from the heart to the lungs or the organs.',
    ('glossary', 3, 'note'): 'A blood vessel that carries blood from the lungs or the organs back to the heart.',
    ('glossary', 4, 'note'): 'A tiny, thin-walled blood vessel where blood exchanges gases and substances with cells.',
    ('glossary', 5, 'note'): 'The route of blood from the right ventricle to the lungs and back to the left atrium, to take in O₂ and release CO₂.',
    ('glossary', 6, 'note'): 'The route of blood from the left ventricle to the organs and back to the right atrium, delivering O₂ and nutrients.',
    ('assumptions', 0, 'text'): 'The diagram is simplified; heart chambers use a schematic layout rather than anatomical scale.',
    ('blocks', 0, 'title'): 'The circulatory system',
    ('blocks', 0, 'description'): 'Four heart chambers, the main blood vessels, the lungs and the organs: each part has one job along the path of blood.',
    ('blocks', 1, 'title'): 'The path of blood',
    ('blocks', 1, 'description'): 'Blood travels two connected circuits: the small one to the lungs to pick up oxygen, the large one to carry oxygen around the body.',
    ('blocks', 2, 'title'): 'Check your understanding',
    ('blocks', 2, 'description'): 'Three questions that follow the blood through the heart and lungs.',
    ('blocks', 2, 'questions', 0, 'context'): 'After a lap of the schoolyard, you feel your heart pounding: it is pushing oxygen-rich blood to your legs.',
    ('blocks', 2, 'questions', 0, 'prompt'): 'Which heart chamber pumps blood around the body?',
    ('blocks', 2, 'questions', 0, 'hint'): 'In the diagram, find the heart chamber connected to the aorta.',
    ('blocks', 2, 'questions', 0, 'explanation'): 'The left ventricle pumps oxygen-rich blood into the aorta, starting systemic circulation. Its muscular wall is the thickest because it pushes blood the farthest.',
    ('blocks', 2, 'questions', 0, 'option_feedback', 0): 'The right atrium only receives oxygen-poor blood from the venae cavae and passes it down to the right ventricle.',
    ('blocks', 2, 'questions', 0, 'option_feedback', 1): 'The right ventricle pumps blood to the lungs, starting pulmonary circulation, not around the body.',
    ('blocks', 2, 'questions', 0, 'option_feedback', 2): 'The left atrium receives oxygen-rich blood from the lungs and passes it down to the left ventricle; it does not push blood far.',
    ('blocks', 2, 'questions', 0, 'option_feedback', 3): 'The left ventricle has the thickest muscular wall and pushes oxygen-rich blood into the aorta and around the body.',
    ('blocks', 2, 'questions', 1, 'context'): 'Minh writes in his notebook: “Every artery carries oxygen-rich blood, and every vein carries oxygen-poor blood.”',
    ('blocks', 2, 'questions', 1, 'prompt'): 'The pulmonary artery carries oxygen-rich blood.',
    ('blocks', 2, 'questions', 1, 'hint'): 'Which heart chamber does the pulmonary artery leave from, and where has the blood in that chamber just come from?',
    ('blocks', 2, 'questions', 1, 'explanation'): 'False. An artery carries blood away from the heart, not necessarily oxygen-rich blood. The pulmonary artery carries oxygen-poor blood from the right ventricle to the lungs; oxygen-rich blood returns to the heart through the pulmonary veins.',
    ('blocks', 2, 'questions', 1, 'option_feedback', 0): 'Minh thinks so too, but the pulmonary artery is the exception: it carries oxygen-poor blood from the right ventricle to the lungs.',
    ('blocks', 2, 'questions', 1, 'option_feedback', 1): 'An artery carries blood away from the heart. The pulmonary artery takes oxygen-poor blood to the lungs to pick up oxygen.',
    ('blocks', 2, 'questions', 2, 'context'): 'A red blood cell has just left the heart, carrying a lot of CO₂ and very little oxygen.',
    ('blocks', 2, 'questions', 2, 'prompt'): 'Arrange the path of blood through pulmonary circulation.',
    ('blocks', 2, 'questions', 2, 'hint'): 'The cell must reach the place where gases are exchanged before it can travel back to the heart.',
    ('blocks', 2, 'questions', 2, 'explanation'): 'The right ventricle pumps blood into the pulmonary artery; in the lung capillaries the blood takes in O₂ and releases CO₂; oxygen-rich blood returns through the pulmonary veins to the left atrium.',
    ('blocks', 3, 'title'): 'Explore circulation in 3D',
    ('blocks', 3, 'description'): 'A simple 3D model of the heart and both circuits, to see the path of blood from every side.',
    ('blocks', 3, 'body'): 'This simplified model helps explain blood flow; it does not represent anatomical position or scale accurately. Blue represents oxygen-poor blood and red represents oxygen-rich blood.',
}

HOTSPOTS = [
    ('Lungs', 'Where blood takes in O₂ from the air and gives off CO₂.',
     'The lungs hold a great many tiny air sacs called alveoli, wrapped in capillaries. Oxygen-poor blood from the pulmonary artery passes through them, '
     'takes in O₂ and releases CO₂. It becomes oxygen-rich and returns to the heart through the pulmonary veins.'),
    ('Body organs', 'Where blood delivers O₂ and nutrients to cells.',
     'In the capillaries of the organs, blood gives O₂ and nutrients to the cells and takes back CO₂ and waste. Cells use O₂ to release energy, '
     'so the blood leaving here is oxygen-poor. In the diagram, the vessels change gradually from red to blue.'),
    ('Right atrium', 'Receives oxygen-poor blood returning from the whole body.',
     'The right atrium receives oxygen-poor blood from the venae cavae, ending systemic circulation. It pushes the blood down into the right ventricle '
     'just below; the distance is short, so the wall of the atrium is thin.'),
    ('Left atrium', 'Receives oxygen-rich blood from the lungs.',
     'The left atrium receives oxygen-rich blood through the pulmonary veins, ending pulmonary circulation. It then pushes the blood down into the '
     'left ventricle, where systemic circulation begins.'),
    ('Right ventricle', 'Pumps oxygen-poor blood to the lungs.',
     'The right ventricle contracts and pushes oxygen-poor blood into the pulmonary artery, starting pulmonary circulation. The lungs are right next '
     'to the heart, so the wall of the right ventricle is thinner than that of the left ventricle.'),
    ('Left ventricle', 'Pumps oxygen-rich blood into the aorta.',
     'The left ventricle contracts and pushes oxygen-rich blood into the aorta, starting systemic circulation. It has the thickest muscular wall '
     'of the four chambers because it must push blood the farthest, all the way to your toes.'),
    ('Pulmonary artery', 'Carries oxygen-poor blood from the right ventricle to the lungs.',
     'An artery carries blood away from the heart. The pulmonary artery takes oxygen-poor blood from the right ventricle to the lungs, which makes it '
     'the only artery that carries oxygen-poor blood. In the diagram, it is the blue tube that forks up into the two lungs.'),
    ('Pulmonary veins', 'Carry oxygen-rich blood from the lungs to the left atrium.',
     'A vein carries blood back to the heart. The pulmonary veins bring oxygen-rich blood from the lungs to the left atrium, unlike all the other veins, '
     'which carry oxygen-poor blood. In the diagram, they are the two red tubes coming down from the lungs.'),
    ('Aorta', 'Carries oxygen-rich blood from the left ventricle around the whole body.',
     'The aorta is the largest artery and leaves the left ventricle. It divides into smaller and smaller branches that carry oxygen-rich blood '
     'to the brain, arms, legs and every organ.'),
    ('Venae cavae', 'Carry oxygen-poor blood from the whole body back to the heart.',
     'The venae cavae collect oxygen-poor blood from the organs of the upper and lower body and empty it into the right atrium. This blood carries '
     'a lot of CO₂ and will soon be sent to the lungs to get rid of it.'),
]
for i, values in enumerate(HOTSPOTS):
    for field, value in zip(('label', 'description_simple', 'description_detailed'), values):
        TEXT[('blocks', 0, 'hotspots', i, field)] = value

RELATIONS = [
    ('Pulmonary circulation', 'Oxygen-poor blood travels from the right ventricle to the lungs through the pulmonary artery.'),
    ('Return to the heart', 'Oxygen-rich blood travels through the pulmonary veins to the left atrium.'),
    ('Systemic circulation', 'Oxygen-rich blood travels from the left ventricle through the aorta to the organs.'),
    ('Return to the heart', 'Oxygen-poor blood returns through the venae cavae to the right atrium.'),
]
for i, (label, description) in enumerate(RELATIONS):
    TEXT[('blocks', 0, 'relations', i, 'label')] = label
    TEXT[('blocks', 0, 'relations', i, 'description')] = description

STEPS = [
    ('The right ventricle sends oxygen-poor blood to the lungs',
     'Pulmonary circulation begins when the **right ventricle** contracts, pushing **oxygen-poor blood** into the **pulmonary artery** and up to '
     'the lungs. This blood has just come back from around the body, so it has given up some of its oxygen to the cells and carries a lot of CO₂. '
     'In the diagram, oxygen-poor blood is blue and oxygen-rich blood is red.', None),
    ('In the lungs, blood takes in O₂ and gives off CO₂',
     'The pulmonary artery divides into ever smaller **capillaries** around the alveoli, the tiny air sacs of the lungs. The air in the alveoli '
     'holds more O₂ than the blood, so O₂ passes into the blood. The blood holds more CO₂, so CO₂ passes out into the alveoli and you breathe it out. '
     'Blood leaving the lungs is now **oxygen-rich**: in the diagram, the blue branches in the lungs join the red ones.',
     'If the air you breathe in had little oxygen, how would the blood leaving the lungs change?'),
    ('Oxygen-rich blood returns to the heart through the pulmonary veins',
     'Oxygen-rich blood leaves the lungs through the **pulmonary veins** to the **left atrium**, then flows down into the **left ventricle**. '
     'This closes pulmonary circulation: blood has gone from the heart to the lungs and back to the heart. The loop is short because the lungs '
     'sit right beside the heart, yet it loads the blood with oxygen before the blood goes out to the body.', None),
    ('The left ventricle starts systemic circulation',
     'Systemic circulation begins when the **left ventricle** contracts, pushing oxygen-rich blood into the **aorta**. The aorta branches to the '
     'brain, arms, legs and every organ, so the left ventricle has to push hardest. When you sit and write, this is the blood that brings oxygen '
     'to the muscles of your hand.', None),
    ('Oxygen-poor blood returns to the heart through the venae cavae',
     'In the **capillaries** of the organs, blood gives O₂ and nutrients to the cells, then takes up CO₂ and waste. The oxygen-poor blood returns '
     'through the **venae cavae** to the **right atrium**, closing systemic circulation. From the right atrium it flows down to the right ventricle '
     'and up to the lungs again: the two circuits follow each other without stopping.',
     'Starting from the right atrium, which places does a red blood cell pass through before it comes back to the right atrium?'),
]
for i, (title, body, check) in enumerate(STEPS):
    TEXT[('blocks', 1, 'steps', i, 'title')] = title
    TEXT[('blocks', 1, 'steps', i, 'body')] = body
    if check:
        TEXT[('blocks', 1, 'steps', i, 'check_question')] = check
for q, options in ((0, ('Right atrium', 'Right ventricle', 'Left atrium', 'Left ventricle')),
                   (2, ('Right ventricle', 'Pulmonary artery', 'Lung capillaries', 'Pulmonary veins', 'Left atrium'))):
    for i, option in enumerate(options):
        TEXT[('blocks', 2, 'questions', q, 'options', i)] = option


def translate_heart(original):
    """Translate an exact original HEART8 snapshot; preserve references and answers."""
    from .content import build_circulation
    from ..schemas.spec import LabSpec
    from ..services.translate import extract_strings, set_path

    ctx = Ctx()
    if len(original.sources) != 1 or original.sources[0].kind != 'image':
        raise HeartTranslationUnavailable('The lesson source changed')
    ctx.src = {'diagram': original.sources[0].id}
    expected = build_circulation(ctx)[0]
    result = original.model_copy(deep=True)
    try:
        if result.title != 'Hệ tuần hoàn của người' or result.topic != 'Cấu tạo tim và hai vòng tuần hoàn':
            raise HeartTranslationUnavailable('The lesson title or topic changed')
        # The previously published demo may lack the newly added optional 3D block.
        has_3d = any(b.get('id') == 'b4' for b in result.spec.get('blocks', []))
        if not has_3d:
            expected['blocks'] = [b for b in expected['blocks'] if b.get('id') != 'b4']
        if LabSpec.model_validate(result.spec).model_dump(mode='json') != LabSpec.model_validate(expected).model_dump(mode='json'):
            raise HeartTranslationUnavailable('The lesson content or references changed')
        current = {path: text for path, text, _ in extract_strings(result.spec)}
        expected_text = {path: text for path, text, _ in extract_strings(expected)}
        available = {path: text for path, text in TEXT.items() if has_3d or path[:2] != ('blocks', 3)}
        if current != expected_text or set(current) != set(available):
            raise HeartTranslationUnavailable('The lesson text or structure changed')
        current_quiz = result.spec['blocks'][2]['questions']
        expected_quiz = expected['blocks'][2]['questions']
        for actual, reference in zip(current_quiz, expected_quiz, strict=True):
            for key in ('kind', 'answer_index', 'answer_order', 'answer_value', 'tolerance'):
                if actual.get(key) != reference.get(key):
                    raise HeartTranslationUnavailable('The question answers changed')
        if current_quiz[1]['options'] != ['Đúng', 'Sai']:
            raise HeartTranslationUnavailable('The question options changed')
        if len(result.sources) != 1 or result.sources[0].title != 'Sơ đồ hệ tuần hoàn (sơ đồ minh họa dựng cho bản mẫu)':
            raise HeartTranslationUnavailable('The source changed')
        for path, text in available.items():
            set_path(result.spec, path, text)
        current_quiz[1]['options'] = ['True', 'False']
        result.sources[0].title = 'Circulatory system diagram (illustration created for the demo)'
        result.title = 'The human circulatory system'
        result.topic = 'The heart and the two circulatory circuits'
        result.language = 'en'
        return result
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HeartTranslationUnavailable('The lesson does not match the reviewed demo') from exc
