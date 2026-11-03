"""Reviewed presentation copy for the original volleyball demo."""
import hashlib
import json

from .demo import Ctx
from ..schemas.spec import LabSpec
from ..services.translate import extract_strings, set_path


class VolleyballTranslationUnavailable(ValueError):
    pass


TEXT = [
    'The forearm pass plays the ball off the flat surface of both forearms to send it to a teammate. According to page 38 of Physical Education 7, the movement has four consecutive phases. The force comes from the legs, not from swinging the arms.',
    'Describe the four phases of the forearm pass.',
    'Identify the correct contact point on the forearms.',
    'Use a forearm pass to receive a serve and pass to a teammate.',
    'The video is an animation for observation practice, not a validated technique demonstration.',
    'A technique for playing the ball off the flat surface of both forearms, sending it up toward a teammate.',
    'The flat surface made by both forearms held straight and close together, where the ball makes contact.',
    'The part of the arm between the elbow and the wrist; in a forearm pass, the ball meets it just above the wrists.',
    'The stance for waiting for the ball: feet shoulder-width apart, knees bent, weight forward.',
    'The team’s second touch, which sends the ball up near the net for a teammate to spike.',
    'A powerful one-handed hit from above that drives the ball down into the opponents’ court.',
    'Four phases of the movement',
    'Four consecutive phases on page 38: get ready, make a platform, contact the ball and follow through.',
    'Ready position: knees bent, eyes on the ball',
    'Feet shoulder-width apart, **knees bent**, weight forward, both arms out in front, and **eyes on the incoming ball**. Bent knees keep your body low, help you step quickly to where the ball will land, and get your legs ready to push. When the other team is about to serve, you are already in this stance, so you can reach the landing point in time.',
    'If you wait for the ball with straight legs, what will be hard when the ball lands far from you?',
    'Make a flat platform with both forearms',
    'Place one hand over the other with **thumbs parallel**. Straighten your elbows so your forearms form **one flat surface**. A flat platform makes the ball rebound evenly and go where you aim; if your arms are uneven, the ball easily flies off at an angle. As the serve crosses the net, your hands are already joined, so all that is left is to put the platform in the ball’s path.',
    'Contact: the force comes from your legs',
    'The ball meets **the forearms just above the wrists**, where the two forearms press together into a flat surface. The force that lifts the ball comes from **extending your legs to push your body up**; your arms only hold the platform and **do not swing above your shoulders**, so the ball stays on course. If a serve comes in low, at hip height, bend your knees more, get the platform under the ball, and then extend your legs.',
    'What might happen if the ball hits your hand?',
    'Follow through: send the ball toward the target',
    'After contact, **move forward with the motion** and point the platform at **the target**, usually the setter. The ball goes wherever the platform faces. For example, player 6 passes the ball high toward the net, where player 3, the setter, is standing. Then **quickly return to the ready position** for the next ball.',
    'If the setter is standing off to your left, how should you angle your platform?',
    'Watch the movement in slow motion',
    'An animated video with four markers, one for each phase in the textbook.',
    'This video is an animation created by ConceptLab. In teaching, use a real video recorded by the teacher with the consent of the people shown.',
    'Ready position',
    'Knees bent, eyes on the ball.',
    'Make a platform',
    'Lower your centre of gravity, with both arms straight in front.',
    'Contact the ball',
    'The ball meets the forearms; extend your legs to lift your body.',
    'Follow through',
    'The ball rises toward the target.',
    'Receiving a serve',
    'Receiving a serve: pass the ball to the setter so your team can set up an attack.',
    'Team A is receiving a serve. Drag player 6 to where the ball lands, draw a forearm pass to the setter (player 3), and explain your choice.',
    'Team B serves to Team A. Team A is ready, watching the ball.',
    'Player 6 moves to the landing point and passes the ball high toward the net, where player 3, the setter, is positioned.',
    'Player 3 sets for player 4 to approach and spike.',
    'Team B serves to Team A. Team A is ready, watching the ball.',
    'Player 6 moves to the landing point and passes the ball high toward the net, where player 3, the setter, is positioned.',
    'Player 3 sets for player 4 to approach and spike.',
    'Check your understanding',
    'Four questions about the forearm pass you have just seen in the textbook and the video.',
    'The other team serves, and the ball is flying toward you.',
    'Put the phases of the forearm pass in order.',
    'Picture the movement from the moment the ball is still on the other side of the court until it is on its way to your teammate.',
    'The textbook describes four consecutive phases in this order: get ready before the ball arrives, make a platform, meet the ball with your forearms, then follow through to direct the ball to the target.',
    'Ready position',
    'Make a platform',
    'Contact the ball',
    'Follow through',
    'At the first practice, many students let the ball hit their hands, and it flew off in the wrong direction.',
    'When making a forearm pass, which part should contact the ball?',
    'Look again at picture H3 in the textbook: where do the two arms form a flat platform?',
    'The platform consists of both forearms; the ball contacts them above the wrists.',
    'Palm',
    'Forearms above the wrists',
    'Elbow',
    'Fingertips',
    'The palm is soft and uneven, so the ball easily bounces off course; the textbook says not to pass the ball with your hands.',
    'Straight forearms make a wide, flat platform just above the wrists, so the ball goes in the right direction.',
    'The elbow is where the arm bends, not a flat surface; a ball that hits it bounces away out of control.',
    'Passing with your fingertips can hurt your fingers and sends the ball off course; the textbook says not to pass with your fingertips.',
    'Nam wants the ball to fly really high, so every time he passes he swings both arms hard above his head.',
    'At contact, swing your arms forcefully above shoulder level.',
    'According to the textbook, which part of the body mainly provides the force that sends the ball up?',
    'False. The force comes from extending the legs; do not swing the arms above shoulder level.',
    'Swinging your arms above your shoulders sends the ball off course and out of control. The textbook says the force comes from extending your legs, and your arms do not swing above your shoulders.',
    'The force comes from extending your legs to lift your body; your arms only hold the platform and do not swing above your shoulders.',
    'It is a chilly morning PE lesson, and the class is getting ready to practise the forearm pass.',
    'What helps you practise the forearm pass safely?',
    'In cold weather, muscles and joints are still stiff: how should your body get ready before taking hard balls?',
    'The textbook says to warm up the wrists and knees and practise on a level court.',
    'Warm up the wrists and knees',
    'Warm up only the arms, because the pass uses the arms',
    'Pass the ball with your fingertips',
    'Wear a watch during practice to keep time',
    'The wrists and knees take the most strain in a forearm pass, so a thorough warm-up helps prevent injury.',
    'The forearm pass uses the legs too: the knees bend and then straighten to lift the body, so the knees need warming up as well.',
    'Fingertips are easily hurt when the ball hits them; the textbook says not to pass with your hands or fingertips.',
    'A watch can scrape your forearms and knock the ball off course; take off watches and bracelets before practice.',
]
SIGNATURE = 'a102fe8e683df88f150162dcc03f2e587e94c2f256a4a48885bce7f72831fd6d'


def translate_volleyball(original):
    from .content import DEMOS

    demo = next(d for d in DEMOS if d.code == 'VBPASS')
    if original.title != demo.title or original.topic != demo.topic or len(original.sources) != len(demo.sources):
        raise VolleyballTranslationUnavailable('The demo metadata changed')
    c = Ctx()
    for source, source_def in zip(original.sources, demo.sources):
        if source.kind != source_def.kind or source.title != source_def.title:
            raise VolleyballTranslationUnavailable('The demo sources changed')
        c.src[source_def.key] = source.id
    expected = LabSpec.model_validate(demo.build(c)[0]).model_dump(mode='json')
    actual = LabSpec.model_validate(original.spec).model_dump(mode='json')
    if expected != actual:
        raise VolleyballTranslationUnavailable('The published lesson changed')
    entries = extract_strings(expected)
    signature = hashlib.sha256(json.dumps([(list(path), text) for path, text, _ in entries], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if signature != SIGNATURE or len(entries) != len(TEXT):
        raise VolleyballTranslationUnavailable('The translation no longer matches the seed')
    result = original.model_copy(deep=True)
    for (path, _, _), text in zip(entries, TEXT):
        set_path(result.spec, path, text)
    result.spec['blocks'][1]['tracks'][0]['phrase'] = 'ball'
    result.spec['blocks'][3]['questions'][2]['options'] = ['True', 'False']
    result.title = 'Forearm pass in volleyball'
    result.topic = 'The two-handed forearm passing technique'
    result.sources[0].title = 'Physical Education 7: volleyball forearm pass, page 38 (textbook illustration created for the demo)'
    result.sources[1].title = 'Forearm pass video (animated illustration created for the demo)'
    return result
