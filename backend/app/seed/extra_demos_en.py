"""Reviewed English text for unmodified system demos.

The learner receives a translated copy, while original materials and quotations stay
untouched. A full spec comparison and a fixed digest protect against later seed edits.
"""
from __future__ import annotations

import hashlib
import json

from ..schemas.spec import LabSpec
from ..services.translate import extract_strings, set_path
from .demo import Ctx


class ExtraTranslationUnavailable(ValueError):
    pass


def _signature(spec):
    """Digest of the Vietnamese text *and* paths of ``spec`` in extract_strings order."""
    pairs = [(list(path), text) for path, text, _ in extract_strings(spec)]
    return hashlib.sha256(json.dumps(pairs, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


# Texts follow the stable, deterministic order returned by extract_strings. A
# fingerprint over the Vietnamese text *and paths* prevents silent misalignment.
# After a reviewed seed edit (dev only), print the new signature and the ordered Vietnamese strings:
#   cd backend && .venv/Scripts/python.exe -X utf8 -m app.seed.extra_demos_en PARAB3
# then rebuild that entry's 'text' in the printed order (one reviewed English string per line) and
# paste the signature. 'metadata_signature' changes only with the title, topic or sources.
TRANSLATIONS = {
    'PARAB3': {
        'signature': '68e6f5a7eadb53539727690897a59a77beb48e16257ab0d0dbb0fc0c6e1616c6',
        'metadata_signature': '8ec1261b5857fc4918fc2e94905bb4caa9512d3ce89096a047e29bd5ea1a9a6c',
        'title': 'Quadratic functions and parabolas', 'topic': 'Graph of y = ax² + bx + c',
        'sources': ['Knowledge summary (entered by the teacher)'],
        'text': [
            'The graph of a quadratic function y = ax² + bx + c is a parabola. From the three coefficients a, b and c alone, you can tell whether it opens upward or downward, where its vertex and axis of symmetry are, and where it crosses the axes.',
            'Recognize how the sign of a affects the direction of the parabola.',
            'Find the vertex and axis of symmetry of a parabola.',
            'Relate the discriminant Δ to the number of x-intercepts.',
            'The curve that is the graph of a quadratic function, symmetric about a vertical line.',
            'The lowest point (when a > 0) or the highest point (when a < 0) of a parabola, lying on its axis of symmetry.',
            'The line x = −b/2a through the vertex, which splits the parabola into two mirror-image halves.',
            'The number Δ = b² − 4ac, which tells whether ax² + bx + c = 0 has two solutions, one or none.',
            'The numbers a, b and c in y = ax² + bx + c: a multiplies x², b multiplies x, and c is the constant term.',
            'Explore the parabola y = ax² + bx + c',
            'The sign of a decides which way the parabola opens; a and b fix the axis of symmetry; c gives the y-intercept.',
            r'The curve is a parabola, symmetric about the line $x = -\frac{b}{2a}$, with its vertex $I\left(-\frac{b}{2a}, -\frac{\Delta}{4a}\right)$ on that line. The larger $|a|$, the narrower the parabola; changing $b$ moves the vertex and the axis of symmetry; changing $c$ slides the whole parabola up or down. The discriminant $\Delta = b^2 - 4ac$ gives the number of x-intercepts: two when $\Delta > 0$, one (the vertex itself) when $\Delta = 0$, none when $\Delta < 0$.',
            'Coefficient a',
            'Coefficient b',
            'Coefficient c',
            'If a changes from 1 to −1 while b and c stay fixed, how does the parabola change?',
            'The sign of a determines the direction: when a < 0, the parabola opens downward.',
            'It opens downward',
            'It only moves to the right',
            'It does not change',
            'It becomes narrower but still opens upward',
            'Steps for drawing a parabola',
            'A worked example with y = x² − 4x + 3: from the sign of a to the finished curve.',
            'The sign of a decides the direction',
            'Check the sign of $a$ first: if $a > 0$ the parabola opens upward, if $a < 0$ it opens downward. The reason is that as $|x|$ grows, the term $ax^2$ outweighs $bx + c$, so both arms of the parabola follow the sign of $a$. For example, $y = x^2 - 4x + 3$ has $a = 1 > 0$, so it opens upward and its vertex is the lowest point.',
            'The vertex is the lowest or highest point',
            r'The vertex $I$ is the lowest point (when $a > 0$) or the highest point (when $a < 0$) of the parabola. Work out $x_I = -\frac{b}{2a}$, then substitute $x_I$ into the function to get $y_I$. For $y = x^2 - 4x + 3$: $x_I = -\frac{-4}{2 \cdot 1} = 2$ and $y_I = 2^2 - 4 \cdot 2 + 3 = -1$, so the vertex is $I(2, -1)$. Watch the sign: here $b = -4$, so $-b = 4$.',
            'Why does the vertex always lie on the axis of symmetry?',
            'The axis of symmetry passes through the vertex',
            r'The axis of symmetry is the vertical line $x = -\frac{b}{2a}$, which passes through the vertex $I$. Two points of the parabola that mirror each other across this line have the same $y$-value, so once you draw one half, you know the other. For $y = x^2 - 4x + 3$ the axis is the line $x = 2$, so $x = 1$ and $x = 3$ give the same value of $y$.',
            'Δ tells you how many x-intercepts there are',
            'The parabola crosses the y-axis at $(0, c)$. Its x-intercepts are the solutions of $ax^2 + bx + c = 0$, so their number depends on $\\Delta = b^2 - 4ac$:\n- $\\Delta > 0$: it crosses the x-axis at two points;\n- $\\Delta = 0$: it touches the x-axis at the vertex;\n- $\\Delta < 0$: it does not meet the x-axis.\n\nFor example, $y = x^2 - 4x + 3$ crosses the y-axis at $(0, 3)$ and has $\\Delta = 16 - 12 = 4 > 0$, so it crosses the x-axis at two points, $x = 1$ and $x = 3$.',
            'Add mirror points, then join them in a curve',
            'Take a few more points and their mirror images across the axis, then join them all with one smooth curve, not a zigzag. For $y = x^2 - 4x + 3$, the point $(0, 3)$ mirrors the point $(4, 3)$ across the axis $x = 2$. Together with the vertex $I(2, -1)$ and the points $(1, 0)$ and $(3, 0)$, you have five points to draw the parabola.',
            'If the function becomes y = −x² + 4x − 3, how do the five points change?',
            'Check your understanding',
            'Three short questions: read the coefficients and predict the shape of the parabola.',
            'In the graph section, Minh drags the sliders to a = −2, b = 4 and c = 1.',
            'Which way does the parabola y = −2x² + 4x + 1 open?',
            'Only one of the three coefficients decides which way the parabola opens. Look again at the first step in “Steps for drawing a parabola”.',
            'Only the sign of a decides which way the parabola opens: a = −2 < 0, so it opens downward, even though the vertex I(1, 3) lies above the x-axis.',
            'Upward, because b = 4 is positive',
            'Downward, because a = −2 is negative',
            'Upward, because c = 1 is positive',
            'Downward, because the vertex lies below the x-axis',
            'Together with a, the coefficient b gives the axis of symmetry x = −b/2a; it does not decide which way the parabola opens.',
            'Only the sign of a decides the direction; positive values of b and c do not make the parabola open upward.',
            'c = 1 only tells you that the parabola crosses the y-axis at (0, 1); the sign of a decides the direction.',
            'Right direction, wrong reason: the vertex I(1, 3) lies above the x-axis. The parabola opens downward because a < 0.',
            'In the graph section, Lan wants to drag the sliders to a = 2, b = 8 and c = 1, but the b slider only goes up to 6.',
            'What is the x-coordinate of the vertex of the parabola $y = 2x^2 + 8x + 1$?',
            'Use the vertex formula x = −b/2a from the second step of “Steps for drawing a parabola”. Watch the sign: this time b is positive, so −b is negative.',
            r'$x_I = -\frac{b}{2a} = -\frac{8}{2 \cdot 2} = -\frac{8}{4} = -2$. Substituting into the function gives $y_I = 2 \cdot (-2)^2 + 8 \cdot (-2) + 1 = 8 - 16 + 1 = -7$, so the vertex is $I(-2, -7)$. Because $a$ and $b$ are both positive, the vertex lies to the left of the y-axis.',
            'Lan insists: “Every quadratic equation has two solutions, so every parabola crosses the x-axis at two points.”',
            'The parabola y = x² + 1 intersects the x-axis at two points.',
            'Work out the discriminant Δ = b² − 4ac, then check whether Δ is negative, zero or positive.',
            'Δ = 0 − 4 = −4 < 0, so the equation x² + 1 = 0 has no solutions. The parabola has its vertex at (0, 1) and opens upward, so it lies entirely above the x-axis.',
            'Not every parabola crosses the x-axis. Here Δ = −4 < 0, so the graph lies entirely above the x-axis.',
            'Δ = −4 < 0, so x² + 1 = 0 has no solutions: the parabola does not meet the x-axis at any point.',
        ],
    },
    'SWAP42': {
        'signature': 'a920fe6007266cfa95c3a5bf422cb9546340a66d0937d33be251d890a30af866',
        'metadata_signature': '0c9e4bd3076e4dbb88777a9ffc824e0ab70f447aed74a66564d30bb7a6864279',
        'title': 'Bubble sort and binary search', 'topic': 'Sorting and searching algorithms',
        'sources': ['Algorithm descriptions (entered by the teacher)'],
        'text': [
            'Follow bubble sort and binary search step by step on small arrays. Enter your own numbers to try them.',
            'Describe the idea behind bubble sort.', 'Count comparisons and swaps.',
            'Explain why binary search requires a sorted array.', 'The idea behind bubble sort',
            'Compare two adjacent elements', 'Start at the beginning and compare adjacent pairs of elements.',
            'Swap if they are out of order', 'If the first element is larger than the second, swap them.',
            'The largest element rises to the end', 'After one pass, the largest element is in its final position at the end, like a bubble rising.',
            'Repeat for the remainder', 'Repeat the passes over the unsorted part until a pass makes no swaps.',
            'Run bubble sort', 'Select Next to see each comparison.',
            'The highlighted elements are being compared; the swap counter increases whenever two elements are swapped.',
            'Binary search', 'Find 23 in the sorted array.',
            'At each step, compare with the middle element and discard half the array, so only a few steps are needed.',
            'Check your understanding', 'After the first pass of bubble sort in ascending order, which element is certainly in its final position?',
            'The largest element is gradually swapped to the end.', 'The smallest element at the beginning',
            'The largest element at the end', 'The middle element', 'None of the elements',
            'Binary search can be used on an unsorted array.',
            'False. The array must be sorted so we know which half to discard.',
            'A sorted array has 16 elements. What is the maximum number of comparisons for binary search?',
            r'16 → 8 → 4 → 2 → 1: at most $\log_2 16 + 1 = 5$ comparisons.',
        ],
    },
    'WATER6': {
        'signature': '1d424f4d7c1735eb348e061cf2d43bf6b625bdcac1db5708cfe077e4b9450f8a',
        'metadata_signature': 'fbdd4f255ccff28f2f21060e18a643cadea84117539e5a2384b8ad9dcce4943b',
        'title': 'The water cycle', 'topic': 'Stages of the water cycle',
        'sources': ['Water cycle model (3D illustration made for the demo)'],
        'text': [
            'Water on Earth travels in an endless loop: it evaporates, condenses into clouds, falls as rain, runs off and soaks in, then returns to the sea. Energy from the Sun lifts water up high, and Earth’s pull brings it back down.',
            'Name and order the stages of the water cycle.',
            'Explain the Sun’s role in the water cycle.',
            'Simplified diagram: plant transpiration, ice and snow are not shown.',
            'Water changing from a liquid into water vapour (a gas), faster when the Sun warms it.',
            'Water vapour turning back into tiny liquid droplets when it cools.',
            'Water falling from clouds to the ground as rain, snow or hail.',
            'Water flowing downhill over the ground, gathering into streams and rivers that reach the sea.',
            'Water soaking down through soil and rock to become groundwater.',
            'The water cycle',
            'Powered by the Sun’s energy and Earth’s pull, water travels in an endless loop: from the sea up to the clouds, down to the land and back to the sea.',
            'Evaporation',
            'Sunshine warms the water in seas, rivers and lakes, giving it the energy to evaporate into water vapour that rises into the air. The Sun powers the whole cycle: the stronger the sunshine, the faster water evaporates.',
            'Condensation',
            'Water vapour rises to where the air is colder, then condenses around tiny dust particles into minute droplets. Countless droplets like these make a cloud. Steam forming drops under the lid of a soup pot is condensation too.',
            'Precipitation',
            'In a cloud, the minute droplets bump into each other and merge into bigger drops. When a drop is heavy enough, the air can no longer hold it up, so it falls as rain, or as snow where it is very cold.',
            'Runoff',
            'Rainwater on the ground flows from high places to low ones because Earth pulls it down. Small trickles gather into streams, streams flow into rivers, and rivers empty into the sea. After a shower, water in the schoolyard also runs downhill into the drains.',
            'Infiltration',
            'Part of the rainwater soaks through loose soil and cracks in the rock to become groundwater. Groundwater moves very slowly underground, feeding wells and streams, and in the end it too reaches the sea. The looser the soil, the more water soaks in.',
            'rises high',
            'Warm, light water vapour rises to where colder air makes it condense.',
            'grows heavy enough',
            'Droplets in the cloud merge into larger drops, and once they are heavy enough they fall as rain.',
            'flows downhill',
            'Rain that reaches the ground is pulled by Earth, so it flows from high to low and forms streams and rivers.',
            'soaks in',
            'Along the way, some of the water soaks through loose soil and cracks in the rock, so it becomes groundwater.',
            'reaches the sea',
            'Groundwater and river water all end up in the sea, so sunshine evaporates the water again and the cycle repeats.',
            'Water cycle diagram',
            'The five stages on the model, and the Sun, the energy source that keeps water moving.',
            'Evaporation',
            'Sunshine turns water in seas, rivers and lakes into vapour.',
            'Sunlight warms surface water until it evaporates. Water vapour is water as a gas, and our eyes cannot see it. Being light, the vapour rises, carrying water from the sea into the sky.',
            'Condensation',
            'Water vapour meets cold air and forms clouds.',
            'The higher you go, the colder the air. Cold makes water vapour condense around tiny dust particles into minute droplets. Countless droplets gather into the white cloud you see on the model.',
            'Precipitation',
            'Drops in a cloud fall once they are heavy enough.',
            'Inside a cloud, minute droplets bump together, merge and grow. Once heavy enough, they are too much for the air to hold up and fall as rain, like the grey cloud raining over the mountain. Where it is very cold, the water falls as snow.',
            'Runoff',
            'Rainwater flows downhill into rivers and out to sea.',
            'Rainwater on the ground flows from high to low because Earth pulls it down. On the model, the stream runs from the mountainside past the village and into the sea, taking the water back to where it started.',
            'Infiltration',
            'Some rainwater soaks into the ground as groundwater.',
            'Rainwater seeps through loose soil and cracks in the rock to form groundwater. Groundwater moves slowly underground, supplying wells and rivers, and gradually it too reaches the sea.',
            'Sun',
            'The energy source that keeps the cycle going.',
            'The Sun warms the water in seas, rivers and lakes, giving it the energy to evaporate and rise. Without this energy, water could not get up into the sky, so there would be no clouds and no rain. The Sun shines every day, so the cycle never stops.',
            'Check your understanding',
            'Three questions that follow a drop of water from the sea up to the clouds and back again.',
            'Follow a drop of seawater at Nha Trang on a scorching summer day.',
            'Put the stages in order, starting with the ocean.',
            'In what state does water rise into the sky, and in what state does it fall back to the ground?',
            'Sunshine makes seawater evaporate; the vapour rises, meets cold air and condenses into clouds; clouds bring rain; rainwater runs off back to the sea.',
            'Evaporation',
            'Condensation',
            'Precipitation',
            'Runoff',
            'In summer, a basin of water left out in the yard dries up much faster than in winter, even on windless days.',
            'What provides energy for the water cycle?',
            'In the diagram, find what warms the water in seas, rivers and lakes before it evaporates.',
            'Heat from the Sun makes water evaporate. Summer sunshine is stronger, so the basin dries up faster, and the whole cycle starts from this step too.',
            'Wind',
            'The Sun',
            'Earth’s gravity',
            'Heat from deep underground',
            'Wind carries water vapour and clouds far away, but it does not heat water to make it evaporate. The basin still dries up on windless days.',
            'Heat from the Sun makes water evaporate and keeps the cycle going continuously.',
            'Gravity pulls rain down and carries water back to the sea, but it cannot lift water up high. That takes heat.',
            'Heat from underground escapes only in a few places, such as hot springs; seas, rivers and lakes evaporate mainly thanks to sunshine.',
            'Pour iced water into a glass, and soon the outside of the glass is covered in tiny drops of water.',
            'Clouds form when water vapour condenses.',
            'Where do the drops on the outside of the glass come from, and why do they appear only when the glass is cold?',
            'True. Rising air cools, and water vapour condenses around tiny dust particles into minute droplets; a great many such droplets make up a cloud.',
            'Water vapour that meets the cold condenses into tiny droplets, like the drops on the iced glass. Countless droplets like these high in the sky form clouds.',
            'Clouds are not smoke or invisible vapour: they are countless tiny droplets, formed when water vapour cools and condenses.',
        ],
    },
    'SAVE25': {
        'signature': '42cb5f40a406955c02296b810d83c8a5c1595080dc7ee898ee0a319538d58237',
        'metadata_signature': '1b59791b14a0b018917e955f7eee86a2dc708ee6c44fd314024c0385a48c2556',
        'title': 'Simple and compound interest', 'topic': 'Applying geometric sequences to savings',
        'sources': ['Compound interest formulas (entered by the teacher)'],
        'text': [
            'Compare simple and compound interest: change the principal, interest rate, compounding frequency and number of years to see how the balance grows.',
            'Apply the compound interest formula.',
            'Explain why more frequent compounding gives a larger balance.',
            'Relate compound interest to geometric sequences.',
            'The interest rate remains constant throughout the deposit.',
            'No withdrawals are made; taxes and fees are ignored.',
            'Savings simulation',
            'Currency unit: thousand Vietnamese dong.',
            'The simulation uses the stated assumptions; actual rates are set by banks.',
            'Initial principal',
            'Interest rate',
            'Compounding periods per year',
            'Time deposited',
            'Keep the rate at 6% per year. How does the balance after 10 years change when compounding increases from once to 12 times per year?',
            'More frequent compounding adds interest to the principal sooner, raising the balance by roughly 1–2%.',
            'It increases slightly',
            'It doubles',
            'It stays the same',
            'It decreases',
            'Balance over time',
            't (years)',
            'A (thousand dong)',
            'The curve rises increasingly quickly because interest is added to the principal each period: this is exponential growth, related to a geometric sequence.',
            'Principal',
            'Interest rate',
            'Compounding periods per year',
            'Check your understanding',
            'Two questions: work out a savings balance and choose the most profitable way to compound interest.',
            'This Tết, An puts 1 million dong of lucky money into a savings account and promises not to withdraw it for 10 years.',
            'At 5% per year, compounded monthly, about how many thousand dong will An have after 10 years?',
            'Compounding monthly means n = 12. Convert 1 million dong into thousand dong and 5% into 0.05 before substituting into the compound interest formula.',
            r'With P = 1000 thousand dong, r = 0.05, n = 12 and t = 10: $A = 1000(1 + 0.05/12)^{120} \approx 1647.01$ thousand dong, or about 1.65 million dong.',
            'Four savings plans pay the same 6% per year and differ only in how many times a year the interest is compounded.',
            'At the same interest rate, which compounding frequency gives the highest balance after five years?',
            'Compound interest also earns interest on the interest already added to the principal. When does that interest start earning interest the soonest?',
            'The more often interest is compounded, the larger the balance, although the extra gain gets smaller. Depositing 1,000 thousand dong at 6% per year for 5 years gives about 1,338 thousand dong with yearly compounding and about 1,350 thousand dong with daily compounding.',
            'Once per year',
            'Four times per year',
            'Twelve times per year',
            '365 times per year',
            'With yearly compounding, interest waits a whole year before it joins the principal, so the balance grows the slowest.',
            'Quarterly compounding beats yearly compounding, but the interest still joins the principal later than with monthly or daily compounding.',
            'Monthly compounding comes very close to the highest balance, but daily compounding adds interest to the principal even sooner.',
            'Daily compounding adds interest to the principal the soonest, so it gives the largest balance, though only slightly more than monthly compounding.',
        ],
    },
    'JUMP45': {
        'signature': '5a09c49e59a839b8aca1150e4d7a1602be2df9897fd71b892dce4be3a18881f1',
        'metadata_signature': '84bbdd9cb2575676ba2e12bba402f5e697439734fd1e8cf5a5d14f91f0caeaba',
        'title': 'Projectile motion', 'topic': 'Trajectory, range and maximum height',
        'sources': ['Projectile motion formulas (entered by the teacher)'],
        'text': [
            'Simulate projectile motion: change the initial speed, launch angle and height to explore the trajectory, range and maximum height.',
            'Describe the parabolic trajectory of a projectile.', 'Find the angle giving maximum range when launching from the ground.',
            'Calculate flight time and range using formulas.', 'Air resistance is neglected.',
            'Gravitational acceleration is constant at g = 9.81 m/s².',
            'Throw a ball', 'Use comparison mode to compare two launch angles.',
            'The simulation follows the stated assumptions; in reality air resistance reduces the range.',
            'Initial speed', 'Launch angle', 'Gravitational acceleration', 'Initial height',
            'Launch from the ground at the same speed. How does the range change when the angle changes from 30° to 60°?',
            'Range is proportional to sin 2α. Since sin 60° = sin 120°, complementary angles give the same range when h₀ = 0.',
            'It stays the same', 'It doubles', 'It is halved', 'It becomes zero',
            'Range versus launch angle', 'Launch angle α (°)', 'Range (m)',
            'The graph peaks at α = 45° and is symmetric: two angles that add to 90° give the same range.',
            'Initial speed', 'Gravitational acceleration', 'Check your understanding',
            'When launching from the ground and neglecting air resistance, which angle gives the greatest range?',
            'sin 2α is greatest when 2α = 90°, or α = 45°.',
            'A projectile is launched from the ground with v₀ = 20 m/s, α = 45° and g = 9.81 m/s². What is its range in metres?',
            r'$L = v_0^2 \sin 2\alpha / g = 400/9{,}81 \approx 40{,}8$ m.',
        ],
    },
    'SPFTBA': {
        'signature': '210a5770f8a8aac742443c74e59d30c776030581e9520ddd114067020788556c',
        'metadata_signature': '2ba669eb7f2b88c1195aeeb64a9a61fee3e0cfdfa93f16c0e60579043d4720fb',
        'title': 'Football: finding space', 'topic': 'Passing the ball',
        'sources': ['Learning scenario created by ConceptLab'],
        'text': [
            'Football: find open space and passing lanes in a three-against-two scenario.',
            'Observe player positions and open space.',
            'Try an option on the field and explain your choice.',
            'The diagram and coordinates were created by ConceptLab for learning; they are not measurements from a match.',
            'Try it on the field',
            'Move players, draw a passing direction and explain your choice.',
            'Team A attacks toward the right. Move player 2 into space, draw a pass and explain how to avoid the defenders.',
            'Hypothetical scenario: observe positions before proposing an option.',
            'One possible solution; other options may also be reasonable.',
            'Check your understanding',
            'Player 1 of Team A has the ball, and two Team B players stand in the way ahead.',
            'What should you observe before deciding to pass?',
            'Think about the reasons a pass can go wrong.',
            'Observe teammates, opponents and open space to choose an appropriate pass.',
            'Teammates, opponents and open space',
            'Only where the ball is',
            'Only the nearest teammate',
            'You need to see the receiver, anyone who could block the ball and the open space before you can choose a safe pass.',
            'Watching only the ball is a common mistake: you will not see the opponent waiting to cut out the pass.',
            'The nearest teammate may be closely marked; a teammate in open space farther away is often safer.',
        ],
    },
    'SPFUTS': {
        'signature': 'b9ddb24b4d870e265afe9f689487aefec6badf916ed1ee3ceb2324e90b129891',
        'metadata_signature': '4b4b21f2f05ce8ab4a03ad6e5e5d21b1d733c894c67e99c1f0cc6990ffe513df',
        'title': 'Futsal: distance and passing', 'topic': 'Futsal tactics',
        'sources': ['Review of futsal tactics (2021)'],
        'text': [
            'Futsal: observe distances between players and open space when passing.',
            'Observe player positions and open space.',
            'Try an option on the field and explain your choice.',
            'The diagram and coordinates were created by ConceptLab for learning; they are not measurements from a match.',
            'Research reference',
            'A 2021 review analysed 12 studies of futsal tactics, including variables such as distances between players, the ball and open space. The scenario below was created for observation practice; it is not a match or an experimental result reported by the authors.\n\nSource [1] · DOI: 10.5114/biolsport.2020.96321 · https://pmc.ncbi.nlm.nih.gov/articles/PMC7996382/',
            'Try it on the field',
            'Move players, draw a passing direction and explain your choice.',
            'Team A attacks toward the right. Move player 2 to create a passing angle, then draw the pass. How does the distance to the opponent change?',
            'Hypothetical scenario: observe positions before proposing an option.',
            'One possible solution; other options may also be reasonable.',
            'Check your understanding',
            'Player 1 of Team A has the ball, and two Team B players stand in the way ahead.',
            'What should you observe before deciding to pass?',
            'Think about the reasons a pass can go wrong.',
            'Observe the positions and distances of both teams before choosing a passing direction.',
            'Teammates, opponents and open space',
            'Only where the ball is',
            'Only the nearest teammate',
            'You need to see the receiver, anyone who could block the ball and the open space before you can choose a safe pass.',
            'Watching only the ball is a common mistake: you will not see the opponent waiting to cut out the pass.',
            'The nearest teammate may be closely marked; a teammate in open space farther away is often safer.',
        ],
    },
    'SPBASK': {
        'signature': '9a50504742bb0ea4c671a2cb33dd643910fb8a6a5262780d6aad6fa1474cf5a5',
        'metadata_signature': 'de9c5432c7dbaf8cf19d10c473c0e9eb9820941bf2a0955d7cc59042798438b4',
        'title': 'Basketball: passing and shooting trajectory', 'topic': 'Passing and shooting',
        'sources': ['Study of basketball shooting motion (2025)'],
        'text': [
            'Basketball: pass into space and explore the trajectory of a shot.',
            'Observe player positions and open space.',
            'Try an option on the field and explain your choice.',
            'The diagram and coordinates were created by ConceptLab for learning; they are not measurements from a match.',
            'The projectile model neglects air resistance, spin and interaction with the hoop; it does not predict whether a shot scores.',
            'Research reference',
            'A 2025 study measured jump and ball-release characteristics in 18 athletes. Successful shots had a greater release height in the study sample; this does not imply the same outcome for everyone.\n\nSource [1] · DOI: 10.3390/jfmk10040459 · https://pmc.ncbi.nlm.nih.gov/articles/PMC12641682/',
            'Explore a shooting trajectory',
            'Change the launch angle, speed and release height and view the 3D model.',
            'This idealized physics model illustrates parameter effects; it does not reproduce the experiment or predict shooting accuracy.',
            'Initial speed',
            'Launch angle',
            'Gravitational acceleration',
            'Release height',
            'Try it on the court',
            'Move players, draw a passing direction and explain your choice.',
            'Team A attacks toward the right. Move player 2 to create a receiving angle and draw a pass.',
            'Hypothetical scenario: observe positions before proposing an option.',
            'One possible solution; other options may also be reasonable.',
            'Check your understanding',
            'Player 1 of Team A has the ball, and two Team B players stand in the way ahead.',
            'What should you observe before deciding to pass?',
            'Think about the reasons a pass can go wrong.',
            'Observe teammates, opponents and open space.',
            'Teammates, opponents and open space',
            'Only where the ball is',
            'Only the nearest teammate',
            'You need to see the receiver, anyone who could block the ball and the open space before you can choose a safe pass.',
            'Watching only the ball is a common mistake: you will not see the opponent waiting to cut out the pass.',
            'The nearest teammate may be closely marked; a teammate in open space farther away is often safer.',
        ],
    },
    'SPBDMT': {
        'signature': '996b46b0690a1b234fdb021589f8d48c7e2e3012fffaa08c7fe9b3275b461629',
        'metadata_signature': 'bc55227322ad9f276b9bde0df57b1d6a3a96f29bed7ec011b3a0a8f127d03cd5',
        'title': 'Doubles badminton: choosing open space', 'topic': 'Doubles badminton tactics',
        'sources': ['Learning scenario created by ConceptLab'],
        'text': [
            'Doubles badminton: observe open space and choose where to hit the shuttlecock.',
            'Observe player positions and open space.',
            'Try an option on the field and explain your choice.',
            'The diagram and coordinates were created by ConceptLab for learning; they are not measurements from a match.',
            'Try it on the court',
            'Move players, draw a direction and explain your choice.',
            'Team A is on the left. Draw a shot into open space on the right and explain your choice; a shuttlecock does not follow an ideal ball trajectory.',
            'Hypothetical scenario: observe positions before proposing an option.',
            'One possible solution; other options may also be reasonable.',
            'Check your understanding',
            'Team A has just returned the shuttlecock on the left; both opponents are standing toward one side of the court.',
            'What should you observe before choosing where to hit the shuttlecock?',
            'Where could the shuttlecock land so that the opponents would find it hardest to reach in time?',
            'Observe open space and both opponents’ positions to choose where to hit the shuttlecock.',
            'Where both opponents are and the open space on the court',
            'Only where the shuttlecock is',
            'Only the opponent near the net',
            'Only when you know where both opponents stand can you see the open space, where the shuttlecock lands before they can reach it.',
            'Watching only the shuttlecock is a common mistake: you will hit it straight to where an opponent is waiting.',
            'The opponent at the back of the court can also return the shuttlecock; you need to watch both players to find the real open space.',
        ],
    },
}


def translate_extra_demo(lab_out):
    """Return a complete reviewed copy, or reject any change to the demo."""
    from .content import DEMOS

    entry = TRANSLATIONS.get(lab_out.share_code)
    if not entry:
        raise ExtraTranslationUnavailable('No reviewed translation for this demo')
    demo = next(d for d in DEMOS if d.code == lab_out.share_code)
    metadata = [demo.title, demo.topic, [(s.key, s.kind, s.title, s.text) for s in demo.sources]]
    digest = hashlib.sha256(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()
    if digest != entry['metadata_signature']:
        raise ExtraTranslationUnavailable('Demo metadata no longer matches the reviewed version')
    if lab_out.title != demo.title or lab_out.topic != demo.topic or len(lab_out.sources) != len(demo.sources):
        raise ExtraTranslationUnavailable('Demo metadata has changed')
    ctx = Ctx()
    for actual, source in zip(lab_out.sources, demo.sources):
        if actual.title != source.title or actual.kind != source.kind or (source.kind == 'note' and actual.text != source.text):
            raise ExtraTranslationUnavailable('A source has changed')
        ctx.src[source.key] = actual.id
    if demo.assets:
        raise ExtraTranslationUnavailable('Demo contains unsupported assets')
    try:
        spec = LabSpec.model_validate(demo.build(ctx)[0]).model_dump(mode='json')
        actual_spec = LabSpec.model_validate(lab_out.spec).model_dump(mode='json')
        if spec != actual_spec:
            raise ExtraTranslationUnavailable('Demo content has changed')
        # The original reviewed translation remains exact; additive scenes have their
        # own reviewed bilingual text instead of invalidating the entire lesson cache.
        from .visual_extensions import EXTENSION_ID, visual_block
        extension = next((b for b in spec['blocks'] if b['id'] == EXTENSION_ID), None) if lab_out.share_code == 'WATER6' else None
        if extension:
            spec['blocks'] = [b for b in spec['blocks'] if b['id'] != EXTENSION_ID]
        strings = extract_strings(spec)
        if _signature(spec) != entry['signature'] or len(strings) != len(entry['text']):
            raise ExtraTranslationUnavailable('The translation no longer matches the seed')
        translated = lab_out.model_copy(deep=True)
        for (path, _, _), value in zip(strings, entry['text']):
            set_path(translated.spec, path, value)
        if extension:
            translated.spec['blocks'] = [b for b in translated.spec['blocks'] if b['id'] != EXTENSION_ID]
            translated.spec['blocks'].append(LabSpec.model_validate({'blocks': [visual_block('WATER6', extension['source_refs'], 'en')]}).model_dump(mode='json')['blocks'][0])
        for block in translated.spec.get('blocks', []):
            if lab_out.share_code == 'SAVE25':
                units = {'nghìn đồng': 'thousand VND', '%/năm': '%/year', 'lần/năm': 'times/year', 'năm': 'years'}
                for param in block.get('params', []):
                    param['unit'] = units.get(param.get('unit'), param.get('unit'))
            if block.get('type') == 'quiz':
                for question in block.get('questions', []):
                    if lab_out.share_code == 'SAVE25' and question.get('unit') == 'nghìn đồng':
                        question['unit'] = 'thousand VND'
                    if question.get('kind') == 'truefalse':
                        if question.get('options') != ['Đúng', 'Sai']:
                            raise ExtraTranslationUnavailable('True/false options changed')
                        question['options'] = ['True', 'False']
        translated.title, translated.topic = entry['title'], entry['topic']
        for source, title in zip(translated.sources, entry['sources']):
            source.title = title
        return translated
    except (KeyError, IndexError, TypeError) as error:
        raise ExtraTranslationUnavailable('Demo structure changed') from error


if __name__ == '__main__':  # pragma: no cover  (dev tool, see the note above TRANSLATIONS)
    import sys

    from .content import DEMOS
    from .visual_extensions import EXTENSION_ID

    for code in sys.argv[1:] or list(TRANSLATIONS):
        demo = next(d for d in DEMOS if d.code == code)
        ctx = Ctx()
        ctx.src = {source.key: source.key for source in demo.sources}  # ids are not part of the signature
        spec = LabSpec.model_validate(demo.build(ctx)[0]).model_dump(mode='json')
        if code == 'WATER6':
            spec['blocks'] = [b for b in spec['blocks'] if b['id'] != EXTENSION_ID]
        strings = extract_strings(spec)
        entry = TRANSLATIONS.get(code, {})
        current = entry.get('signature') == _signature(spec) and len(entry.get('text', [])) == len(strings)
        print(f"{code}: signature {_signature(spec)}, {len(strings)} strings, entry {'up to date' if current else 'OUT OF DATE'}")
        for i, (path, text, _) in enumerate(strings):
            print(f"  {i:3d} {'.'.join(map(str, path))}: {text}")
